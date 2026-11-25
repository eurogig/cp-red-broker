const MAX_SESSIONS = 128;
const MAX_TEXT = 8000;

// A screen-sized live view. Session records are a bounded working set, not a
// transcript; each row keeps only the most recent prompt/reply for that session.
export class VerboseDashboard {
  constructor(stream = process.stdout) {
    this.stream = stream;
    this.sessions = new Map();
    this.startedAt = Date.now();
    this.metrics = {sessions:0, active:0, completed:0, turns:0, failures:0, timeouts:0};
    this.meta = {phase:'starting',stage:'starting',scanId:'pending',targetId:'pending'};
    this.alternateScreen = Boolean(stream.isTTY && stream.columns && stream.rows);
    if (this.alternateScreen) {
      stream.write('\x1b[?1049h\x1b[?25l');
      this.resize = () => this.render();
      process.stdout.on('resize', this.resize);
      this.render();
    }
  }

  progress(metadata = {}) {
    if (typeof metadata.phase === 'string' && /^[a-z_-]{1,32}$/i.test(metadata.phase)) this.meta.phase = metadata.phase;
    if (typeof metadata.stage === 'string' && /^[a-z_]{1,64}$/.test(metadata.stage)) this.meta.stage = metadata.stage;
    if (typeof metadata.scanId === 'string' && /^[\w-]{1,256}$/.test(metadata.scanId)) this.meta.scanId = metadata.scanId;
    if (typeof metadata.targetId === 'string' && /^[\w-]{1,256}$/.test(metadata.targetId)) this.meta.targetId = metadata.targetId;
    if (Number.isInteger(metadata.datasetConversationCount) && metadata.datasetConversationCount > 0) this.meta.datasetConversationCount = metadata.datasetConversationCount;
    this.render();
  }

  trace(entry = {}) {
    if (entry.phase) this.meta.phase = entry.phase;
    const id = typeof entry.sessionId === 'string' ? entry.sessionId : undefined;
    if (entry.event === 'session_start') {
      if (!id) return this.render();
      this.metrics.sessions++;
      this.metrics.active++;
      this.sessions.delete(id);
      this.sessions.set(id, {id,attempt:entry.attempt,status:'active',prompt:'',reply:'',updatedAt:Date.now()});
      this.trimSessions();
    } else if (entry.event === 'session_complete' && id) {
      const session = this.sessions.get(id);
      if (session) {
        if (session.status === 'active') this.metrics.active = Math.max(0,this.metrics.active-1);
        session.status = 'complete'; session.updatedAt = Date.now();
        this.metrics.completed++;
      }
    } else if (entry.event === 'handler_error') {
      const session = id && this.sessions.get(id);
      if (session) {
        if (session.status === 'active') this.metrics.active = Math.max(0,this.metrics.active-1);
        session.status = entry.category === 'TIMEOUT' ? 'timeout' : 'failed'; session.updatedAt = Date.now();
      }
      this.metrics.failures++;
      if (entry.category === 'TIMEOUT') this.metrics.timeouts++;
    } else if (id) {
      const session = this.sessions.get(id);
      if (session) {
        if (entry.event === 'prompt') session.prompt = clip(entry.text);
        if (entry.event === 'reply') session.reply = clip(entry.text);
        if (entry.event === 'response_submitted') this.metrics.turns++;
        session.updatedAt = Date.now();
      }
    }
    this.render();
  }

  finish(summary) {
    if (this.closed) return;
    this.closed = true;
    this.summary = summary;
    this.resultErrors = summary?.entries?.filter(entry => entry.status === 'error').length ?? 0;
    if (this.alternateScreen) {
      this.render(true);
      process.stdout.removeListener('resize',this.resize);
      this.stream.write('\x1b[?25h\x1b[?1049l');
    } else if (summary) {
      this.stream.write(`[verbose] ${summary?.outcome ?? 'incomplete'}: ${summary?.successfulAttacks ?? 0} successful attacks, ${this.resultErrors ?? 0} assessment errors, ${summary?.assessedEntries ?? 0} assessed; ${summary?.exitCode === 0 ? 'completed' : 'incomplete'}\n`);
    }
  }

  trimSessions() {
    while (this.sessions.size > MAX_SESSIONS) {
      const removable = [...this.sessions].find(([,s]) => s.status !== 'active');
      this.sessions.delete(removable?.[0] ?? this.sessions.keys().next().value);
    }
  }

  render(final = false) {
    if (!this.alternateScreen || (this.closed && !final)) return;
    const width = Math.max(1,Math.min(this.stream.columns || 80,240));
    const height = Math.max(1,this.stream.rows || 24);
    const compact = width < 64;
    const elapsed = formatDuration(Date.now()-this.startedAt);
    const lines = [
      ` RED RUNNER  ${this.meta.phase.toUpperCase()}  ${elapsed}`,
      ` Stage: ${this.meta.stage}   Scan: ${this.meta.scanId}   Target: ${this.meta.targetId}`,
      ` Sessions ${this.metrics.completed}/${this.metrics.sessions} complete  ${this.metrics.active} active  ${this.metrics.failures} failed (${this.metrics.timeouts} timeouts)  Turns ${this.metrics.turns}`,
      ` Dataset conversations: ${this.meta.datasetConversationCount ?? '—'}${final ? `   Outcome: ${this.summary?.outcome ?? 'incomplete'}   Successful attacks: ${this.summary?.successfulAttacks ?? 0}   Errors: ${this.resultErrors ?? 0}   Assessed: ${this.summary?.assessedEntries ?? 0}` : ''}`,
      '─'.repeat(width),
    ];
    const paneWidth = Math.floor(width/2);
    const bodyRows = Math.max(0,height-lines.length-1);
    const rowCapacity = Math.max(1,Math.floor(bodyRows/(compact ? 4 : 3)));
    const records = [...this.sessions.values()].slice(-rowCapacity);
    for (const session of records) {
      if (compact) {
        lines.push(`SESSION ${session.attempt ?? ''} · ${session.status}`.slice(0,width));
        lines.push(...wrap(`P: ${session.prompt || '(waiting)'}`,width,1));
        lines.push(...wrap(`R: ${session.reply || '(waiting)'}`,width,1));
      } else {
        lines.push(`${pad('SESSION '+(session.attempt ?? '' )+' · '+session.status,paneWidth)}│ ${pad('SESSION '+(session.attempt ?? '' )+' · '+session.status,width-paneWidth-2)}`);
        const paneRows = Math.max(1,Math.min(3,Math.floor(bodyRows/Math.max(1,records.length))-2));
        const prompts = wrap(session.prompt || '(waiting for prompt)',paneWidth-2,paneRows);
        const replies = wrap(session.reply || '(waiting for response)',width-paneWidth-2,paneRows);
        for (let i=0;i<paneRows;i++) lines.push(`${pad(prompts[i] ?? '',paneWidth)}│ ${pad(replies[i] ?? '',width-paneWidth-2)}`);
      }
      lines.push('─'.repeat(width));
    }
    if (!records.length) lines.push(' Waiting for scan sessions…');
    const visible = lines.slice(0,height).map(line=>line.slice(0,width));
    while (visible.length < height) visible.push('');
    this.stream.write(`\x1b[H\x1b[2J${visible.join('\n')}`);
  }
}

function clip(value) {
  if (typeof value !== 'string') return '';
  value=value.replace(/[\u0000-\u001f\u007f-\u009f]/g,' ');
  return value.length > MAX_TEXT ? `${value.slice(0,MAX_TEXT)} … [truncated]` : value;
}
function wrap(value,width,rows) {
  width=Math.max(1,width);
  const text = String(value).replace(/[\r\n\t]+/g,' ');
  const out=[];
  for(let i=0;i<text.length && out.length<rows;i+=width) out.push(text.slice(i,i+width));
  if(text.length>width*rows && out.length) out[out.length-1]=out.at(-1).slice(0,Math.max(0,width-1))+'…';
  return out;
}
function pad(value,width) { return String(value).slice(0,width).padEnd(width); }
function formatDuration(ms) { const s=Math.floor(ms/1000); return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
