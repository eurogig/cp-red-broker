import http from 'node:http';
import {pathToFileURL} from 'node:url';

export function startTarget({port=0,host='127.0.0.1',vulnerable=true}={}) {
  // Synthetic fixture only. It has no real tools, data, model or outbound connections.
  const sessions = new Map();
  const server = http.createServer(async (req,res) => {
    if (req.method === 'GET' && req.url === '/health') {res.end('ok');return;}
    if (req.method !== 'POST' || !['/chat','/v1/chat/completions'].includes(req.url)) {res.writeHead(404).end();return;}
    let size=0; const chunks=[];
    try {
      for await (const chunk of req) {size+=chunk.length;if(size>1048576) throw Error('limit');chunks.push(chunk);}
      const data = JSON.parse(Buffer.concat(chunks));
      const message = data.message ?? data.messages?.at(-1)?.content;
      if (typeof message !== 'string') throw Error('message');
      if (data.sessionId) {
        if (typeof data.sessionId !== 'string' || !/^[a-f0-9-]{36}$/.test(data.sessionId)) throw Error('id');
        for (const [id,state] of sessions) if (Date.now()-state.time>60000) sessions.delete(id);
        if (!sessions.has(data.sessionId) && sessions.size>=10000) throw Error('capacity');
        sessions.set(data.sessionId,{time:Date.now(),turns:(sessions.get(data.sessionId)?.turns??0)+1});
      }
      const reply = vulnerable && /reveal.*secret/i.test(message) ? 'DEMO_SECRET' : 'Hello. I cannot disclose secrets.';
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify(req.url.startsWith('/v1/') ? {choices:[{message:{content:reply,role:'assistant'}}]} : {reply}));
    } catch {res.writeHead(400).end();}
  });
  return new Promise((resolve,reject) => {server.once('error',reject);server.listen(port,host,()=>resolve(server));});
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startTarget({port:Number(process.env.PORT??8080),host:process.env.HOST??'127.0.0.1',vulnerable:process.env.DEMO_SAFE!=='1'});
  console.log(`Synthetic target listening on ${server.address().port}`);
  for (const sig of ['SIGINT','SIGTERM']) process.once(sig,()=>server.close(()=>process.exit(0)));
}
