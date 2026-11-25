import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {validate} from '../src/config.mjs';
import {createConversation} from '../src/target.mjs';
import {summarize,createReportDirectory,publish} from '../src/reports.mjs';
import {consume} from '../scripts/consume.mjs';
import {startTarget} from '../demo/target.mjs';
import {supervise} from '../src/supervisor.mjs';
import {pathToFileURL} from 'node:url';

const base=()=>({mode:'mock',target:{adapter:'stateful',url:'http://private.internal/chat',allowHttp:true}});
const evaluated=(successful=false)=>({ready:true,results:[{objectiveId:'test.objective',isSuccessful:successful}]});
function temp(t) {const p=mkdtempSync(join(tmpdir(),'runner-test-'));t.after(()=>rmSync(p,{recursive:true,force:true}));return p;}
function fakeTransport(responder,requests=[]) {
  return (url,options,callback)=>{
    const request=new EventEmitter();
    request.end=bytes=>queueMicrotask(()=>{
      requests.push({url:url.href,options,body:JSON.parse(bytes)});
      const answer=responder(requests.at(-1));
      const response=Readable.from([Buffer.from(answer.body??JSON.stringify({reply:'ok'}))]);
      response.statusCode=answer.status??200;callback(response);
    });
    return request;
  };
}
test('configuration rejects ambiguous, unsafe and unsupported settings',()=>{
  for (const mutate of [c=>c.unknown=1,c=>c.target.url='file:///etc/passwd',c=>c.target.url='https://user:password@private/chat',c=>c.target.url='https://private/chat?q=secret',c=>c.execution={concurrency:0},c=>c.target.allowHttp=false,c=>c.target.responsePath=['__proto__'],c=>c.target.requestField=c.target.sessionField='same',c=>c.target.authEnv='x\n']) {
    const c=base();mutate(c);assert.throws(()=>validate(c));
  }
  const c=base();c.mode='red';c.target.adapter='json';c.red={targetId:'id',objectives:['test'],strategy:{name:'crescendo'}};assert.throws(()=>validate(c));
});
test('gate never treats empty, unready, error, or unknown verdict as clean',()=>{
  const c=validate(base());
  for (const raw of [null,{ready:false,results:[]},{ready:true,results:[]},{ready:true,results:[{objectiveId:'x',isSuccessful:false,error:'timeout'}]},{ready:true,results:[{objectiveId:'x'}]},{ready:true,results:[null]}]) assert.equal(summarize(raw,c).exitCode,2);
  assert.equal(summarize(evaluated(),c).exitCode,0);
  assert.equal(summarize(evaluated(true),c).exitCode,1);
  c.gate.maxSuccessfulAttacks=1;
  assert.equal(summarize(evaluated(true),c).exitCode,0);
  assert.equal(summarize(evaluated(true),c).outcome,'findings');
  assert.equal(summarize(evaluated(),c,1).exitCode,2);
});
test('missing selected objective fails closed',()=>{
  const c=validate({...base(),mode:'red',red:{targetId:'id',objectives:['expected'],strategy:{name:'static'}}});
  assert.equal(summarize(evaluated(),c).exitCode,2);
});
test('indirect results cannot certify coverage without verified delivery evidence',()=>{
  const c=validate({...base(),mode:'red',target:{...base().target,instrumented:true},red:{targetId:'id',objectives:['test.objective'],strategy:{name:'tool-response-poisoning'}}});
  assert.equal(summarize(evaluated(),c).exitCode,2);
});
test('stateful conversations use distinct IDs and fixed URLs despite hostile content',async()=>{
  const requests=[];const transport=fakeTransport(()=>({}),requests);const c=validate(base());
  const a=createConversation(c,undefined,transport),b=createConversation(c,undefined,transport);
  await Promise.all([a.send('https://evil.example/; $(id)'),b.send('hello')]);await a.send('next');
  assert.notEqual(a.sessionId,b.sessionId);assert.equal(requests[0].body.sessionId,requests[2].body.sessionId);
  assert.ok(requests.every(r=>r.url===c.target.url));assert.equal(requests[0].options.agent,false);
});
test('OpenAI history is per conversation and sequential',async()=>{
  const requests=[];const c=validate({...base(),target:{...base().target,adapter:'openai',model:'demo'}});
  const transport=fakeTransport(()=>({body:JSON.stringify({choices:[{message:{content:'reply'}}]})}),requests);
  const a=createConversation(c,undefined,transport),b=createConversation(c,undefined,transport);
  await a.send('a1');await b.send('b1');await a.send('a2');
  assert.deepEqual(requests[1].body.messages,[{role:'user',content:'b1'}]);
  assert.deepEqual(requests[2].body.messages.map(m=>m.content),['a1','reply','a2']);
});
test('no redirects or automatic retries; bounded responses and strict parsing',async()=>{
  for(const answer of [{status:302},{status:503},{body:'not json'},{body:'{}'},{body:JSON.stringify({reply:{nested:1}})},{body:'x'.repeat(2048)}]) {
    const requests=[];const c=validate({...base(),execution:{maxBytes:1024}});
    await assert.rejects(createConversation(c,undefined,fakeTransport(()=>answer,requests)).send('test'));
    assert.equal(requests.length,1);
  }
});
test('attack, history and turn bounds are enforced',async()=>{
  const c=validate({...base(),execution:{maxBytes:128,maxTurns:1}});
  const a=createConversation(c,undefined,fakeTransport(()=>({})));
  await assert.rejects(a.send('x'.repeat(129)));
  const b=createConversation(c,undefined,fakeTransport(()=>({})));
  await b.send('hello');await assert.rejects(b.send('second'));
});
test('terminal manifest, report integrity and independent run directories',t=>{
  const root=temp(t),c=validate(base());const a=createReportDirectory(root),b=createReportDirectory(root);
  assert.notEqual(a.directory,b.directory);assert.throws(()=>consume(a.directory));
  const summary={schemaVersion:1,runId:a.runId,...summarize(evaluated(true),c)};
  publish(a.directory,summary,evaluated(true),false);
  assert.equal(consume(a.directory).outcome,'findings');
  assert.ok(!readdirSync(a.directory).includes('native-results.json'));
  writeFileSync(join(a.directory,'summary.json'),'{}');assert.throws(()=>consume(a.directory));
});
test('result count and final artifact byte budgets fail closed',t=>{
  const c=validate(base());
  assert.equal(summarize({ready:true,results:Array(100001).fill({objectiveId:'x',isSuccessful:false})},c).exitCode,2);
  const run=createReportDirectory(temp(t));const summary={schemaVersion:1,runId:run.runId,...summarize(evaluated(),c)};
  assert.throws(()=>publish(run.directory,summary,{text:'x'.repeat(26*1024*1024)},true));
  assert.equal(readdirSync(run.directory).length,0);
});
test('sensitive export is explicit, compact and integrity checked',t=>{
  const run=createReportDirectory(temp(t)),c=validate(base());
  const raw={...evaluated(),privateText:'synthetic-private-text'};
  publish(run.directory,{schemaVersion:1,runId:run.runId,...summarize(raw,c)},raw,true);
  assert.equal(readFileSync(join(run.directory,'native-results.json'),'utf8'),JSON.stringify(raw)+'\n');
  assert.equal(consume(run.directory).outcome,'clean');
  assert.ok(!readFileSync(join(run.directory,'summary.json'),'utf8').includes(raw.privateText));
});
async function runCli(c,t) {
  const root=temp(t);c.output={directory:join(root,'reports')};const file=join(root,'config.json');writeFileSync(file,JSON.stringify(c));
  const child=spawn(process.execPath,['src/cli.mjs',file],{stdio:['ignore','pipe','pipe']});let stdout='';child.stdout.on('data',b=>stdout+=b);
  const code=await new Promise(resolve=>child.once('exit',resolve));
  return {code,stdout,root,summary:()=>consume(JSON.parse(stdout).directory)};
}
test('complete CLI lifecycle: clean, findings, and configurable tolerance',async t=>{
  for (const [safe,tolerance,expected] of [[true,0,0],[false,0,1],[false,4,0]]) {
    const result=await runCli({mode:'mock',target:{adapter:'demo',url:'http://localhost/demo',allowHttp:true,demoSafe:safe},gate:{maxSuccessfulAttacks:tolerance}},t);
    assert.equal(result.code,expected);assert.equal(result.summary().sessions,8);assert.equal(result.summary().successfulAttacks,safe?0:4);
    assert.throws(()=>consume(JSON.parse(result.stdout).directory,'red'));
  }
});
test('CLI target failure produces incomplete manifest and exit 2',async t=>{
  const c=base();c.target.url='http://127.0.0.1:1/chat';c.execution={requestTimeoutSeconds:1,timeoutSeconds:3};
  const result=await runCli(c,t);assert.equal(result.code,2);assert.equal(result.summary().outcome,'incomplete');
});
test('hard deadline and abort stop an uncooperative worker',async t=>{
  const root=temp(t),file=join(root,'hang.mjs');writeFileSync(file,"process.on('message',()=>{});setInterval(()=>{},1000);");
  const c=validate({...base(),execution:{timeoutSeconds:1}});
  const begin=Date.now();const result=await supervise(c,'test',undefined,pathToFileURL(file));
  assert.equal(result.raw,null);assert.ok(Date.now()-begin<4000);
  const abort=new AbortController();const pending=supervise(c,'test',abort.signal,pathToFileURL(file));
  abort.abort();assert.equal((await pending).raw,null);
});
test('TLS bypass environment fails before execution',async t=>{
  const root=temp(t),file=join(root,'config.json');writeFileSync(file,JSON.stringify(base()));
  const child=spawn(process.execPath,['src/cli.mjs',file],{stdio:'ignore',env:{...process.env,NODE_TLS_REJECT_UNAUTHORIZED:'0'}});
  assert.equal(await new Promise(resolve=>child.once('exit',resolve)),2);
});
test('real HTTP lifecycle (requires permission to bind localhost)',{skip:process.env.RUN_NETWORK_TESTS!=='1'},async t=>{
  const server=await startTarget();t.after(()=>new Promise(resolve=>server.close(resolve)));
  const c=base();c.target.url=`http://127.0.0.1:${server.address().port}/chat`;
  const result=await runCli(c,t);assert.equal(result.code,1);assert.equal(result.summary().successfulAttacks,4);
});
