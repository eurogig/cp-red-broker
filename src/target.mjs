import http from 'node:http';
import https from 'node:https';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

// Only configuration chooses destinations. Never follow redirects or interpret content.
export function createConversation(config, runSignal, requestOverride) {
  const t = config.target, limits = config.execution;
  const sessionId = randomUUID();
  const url = new URL(t.url);
  const ca = t.caFile ? readFileSync(t.caFile) : undefined;
  const token = t.authEnv ? process.env[t.authEnv] : undefined;
  if (t.authEnv && (!token || /[\r\n]/.test(token))) throw Error('missing or invalid target credential');
  let history = [], turns = 0, busy = false;
  return {sessionId, async send(attack, messageSignal) {
    if (busy) throw Error('concurrent turn in one conversation');
    busy = true;
    try {
      if (typeof attack !== 'string' || Buffer.byteLength(attack) > limits.maxBytes || ++turns > limits.maxTurns) throw Error('attack limit exceeded');
      if (t.adapter === 'demo') return !t.demoSafe && /reveal.*secret/i.test(attack) ? 'DEMO_SECRET' : 'Hello. I cannot disclose secrets.';
      const body = t.adapter === 'openai'
        ? {model:t.model, stream:false, messages:[...history,{role:'user',content:attack}]}
        : {[t.requestField]:attack, ...(t.adapter === 'stateful' ? {[t.sessionField]:sessionId} : {})};
      const encoded = Buffer.from(JSON.stringify(body));
      if (encoded.length > limits.maxBytes) throw Error('request limit exceeded');
      const signal = AbortSignal.any([runSignal, messageSignal, AbortSignal.timeout(limits.requestTimeoutSeconds * 1000)].filter(Boolean));
      const data = await new Promise((resolve,reject) => {
        const request = (requestOverride ?? (url.protocol === 'https:' ? https : http).request)(url, {
          method:'POST', agent:false, signal, ca, rejectUnauthorized:true,
          headers:{'content-type':'application/json','content-length':encoded.length,...(token ? {authorization:`Bearer ${token}`} : {})},
        }, response => {
          if (response.statusCode < 200 || response.statusCode >= 300) { response.destroy(); reject(Error('target HTTP failure')); return; }
          let length = 0; const chunks = [];
          response.on('data', chunk => {
            length += chunk.length;
            if (length > limits.maxBytes) { response.destroy(); reject(Error('response limit exceeded')); }
            else chunks.push(chunk);
          });
          response.on('error',reject);
          response.on('end',() => resolve(Buffer.concat(chunks).toString('utf8')));
        });
        request.on('error',reject); request.end(encoded);
      });
      let reply = JSON.parse(data);
      for (const key of t.responsePath) {
        if (reply === null || typeof reply !== 'object' || !Object.hasOwn(reply,key)) throw Error('missing response field');
        reply = reply[key];
      }
      if (typeof reply !== 'string') throw Error('response must be a string');
      if (t.adapter === 'openai') history.push({role:'user',content:attack},{role:'assistant',content:reply});
      return reply;
    } finally { busy = false; }
  }, close() { history = []; }};
}
