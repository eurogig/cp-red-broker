import {createConversation} from './target.mjs';

// Each phase owns its counters and conversations; recon cannot consume scan limits.
export function createSessionHandler(config, getSignal, requestOverride, onTrace = () => {}) {
  const stats = {sessions:0,active:0,failures:0};
  const handler = async session => {
    const attempt = ++stats.sessions;
    let conversation, admitted = false, step = 'admission';
    try {
      const signal = getSignal();
      signal?.throwIfAborted();
      if (attempt > config.execution.maxSessions) throw Object.assign(Error('session limit exceeded'), {code:'SESSION_LIMIT'});
      if (stats.active >= config.execution.concurrency) throw Object.assign(Error('session limit exceeded'), {code:'CONCURRENCY_LIMIT'});
      stats.active++; admitted = true;
      step = 'bind_session';
      conversation = createConversation(config,signal,requestOverride);
      const sessionId = conversation.sessionId;
      session.setSessionId(sessionId);
      onTrace({event:'session_start',attempt,sessionId});
      step = 'receive_prompt';
      for await (const message of session) {
        signal?.throwIfAborted();
        onTrace({event:'prompt',sessionId,text:message.attack});
        step = 'call_target';
        const reply = await conversation.send(message.attack,message.signal);
        onTrace({event:'reply',sessionId,text:reply});
        step = 'submit_reply';
        await message.respond(reply);
        onTrace({event:'response_submitted',sessionId});
        step = 'receive_prompt';
      }
      onTrace({event:'session_complete',sessionId});
    } catch (error) {
      stats.failures++;
      onTrace({event:'handler_error', attempt, sessionId:conversation?.sessionId, step,
        activeSessions:stats.active, concurrencyLimit:config.execution.concurrency,
        category:traceErrorCategory(error)});
      throw error;
    }
    finally { if (admitted) stats.active--; conversation?.close(); }
  };
  return {handler,stats};
}

function traceErrorCategory(error) { const code=typeof error?.code==='string'?error.code.toUpperCase():''; if(['SESSION_LIMIT','CONCURRENCY_LIMIT'].includes(code)) return code; if(code.includes('TIMEOUT')||code==='ABORT_ERR'||/timeout|timed out/i.test(error?.message??'')) return 'TIMEOUT'; if(['ECONNREFUSED','ECONNRESET','ENOTFOUND','EAI_AGAIN'].includes(code)) return 'NETWORK'; if(/HTTP failure/i.test(error?.message??'')) return 'TARGET_HTTP'; return 'TARGET_ERROR'; }
