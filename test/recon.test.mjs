import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validate} from '../src/config.mjs';
import {runRedWithClient} from '../src/providers.mjs';
import {createSessionHandler} from '../src/session-handler.mjs';
import {supervise} from '../src/supervisor.mjs';
const profile={appDescription:'Chat agent',allowedActions:['Chat'],forbiddenActions:['Leak']};
const config=(red={})=>validate({mode:'red',target:{adapter:'openai',model:'local',url:'http://localhost/chat',allowHttp:true},execution:{timeoutSeconds:1},red:{targetName:'local',strategy:{name:'static'},...red}});
const progress={runId:'test',send(){}};
const signal=()=>new AbortController().signal;
const scan=()=>({scanId:'scan',async run(){},async getResults(){return {ready:true,results:[]};}});
test('automatic setup passes a recon handler and starts assessment only after validation',async()=>{
  const calls=[]; const handler=()=>{};
  const client={async createOrGetTarget(opts,h){calls.push('target');assert.deepEqual(opts,{name:'local'});assert.equal(h,handler);return {targetId:'id',hasRecon:true,recon:profile};},async createScan(){calls.push('scan');return scan();}};
  await runRedWithClient(client,config(),()=>{},signal(),progress,{reconHandler:handler,finishRecon(){calls.push('validated');},startAssessment(){calls.push('assessment');return signal();}});
  assert.deepEqual(calls,['target','validated','assessment','scan']);
});
test('refresh requires an existing ID and failed refresh cannot fall back to old profile',async()=>{
  assert.throws(()=>config({recon:{refresh:true}}));
  assert.throws(()=>config({targetId:'id'}));
  assert.throws(()=>config({recon:{maxSessions:0}}));
  const c=config({targetName:undefined,targetId:'id',recon:{refresh:true}});
  let created=false;
  const client={async getTarget(){return {targetId:'id',hasRecon:true,recon:profile};},async runRecon(){return undefined;},async createScan(){created=true;return scan();}};
  await assert.rejects(runRedWithClient(client,c,()=>{},signal(),progress,{reconHandler:()=>{}}),{code:'RECON_FAILED'});
  assert.equal(created,false);
});
test('refresh reads back the updated profile before starting assessment',async()=>{
  const calls=[];
  const client={async getTarget(){calls.push('get');return {targetId:'id',hasRecon:true,recon:profile};},async runRecon(){calls.push('refresh');return profile;},async createScan(){calls.push('scan');return scan();}};
  await runRedWithClient(client,config({targetName:undefined,targetId:'id',recon:{refresh:true}}),()=>{},signal(),progress,{reconHandler:()=>{}});
  assert.deepEqual(calls,['get','refresh','get','scan']);
});
test('partial recon or recorded handler failures prevent scan creation',async()=>{
  for(const recon of [undefined,{...profile,appDescription:''},{...profile,allowedActions:[]}]) {
    const client={async createOrGetTarget(){return {targetId:'id',hasRecon:true,recon};},async createScan(){assert.fail('must not scan');}};
    await assert.rejects(runRedWithClient(client,config(),()=>{},signal(),progress,{reconHandler:()=>{}}),{code:'RECON_FAILED'});
  }
  const client={async createOrGetTarget(){return {targetId:'id',hasRecon:true,recon:profile};},async createScan(){assert.fail('must not scan');}};
  await assert.rejects(runRedWithClient(client,config(),()=>{},signal(),progress,{reconHandler:()=>{},finishRecon(){throw Error('handler failed');}}),{code:'RECON_FAILED'});
});
test('recon and assessment handlers have independent limits and session identities',async()=>{
  const c=validate({mode:'mock',target:{adapter:'demo',url:'http://localhost/chat',allowHttp:true},execution:{maxSessions:1}});
  const recon=createSessionHandler(c,signal), assessment=createSessionHandler(c,signal);
  const ids=[]; const session=()=>({setSessionId(id){ids.push(id);},async *[Symbol.asyncIterator](){yield {attack:'hello',respond:async()=>{}};}});
  await recon.handler(session());
  await assert.rejects(recon.handler(session()),/session limit/);
  await assessment.handler(session());
  assert.notEqual(ids[0],ids[1]);assert.equal(assessment.stats.sessions,1);assert.equal(assessment.stats.failures,0);
});
test('supervisor grants a fresh assessment deadline after recon, only once',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'recon-budget-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'worker.mjs');
  writeFileSync(file,`process.once('message',()=>{setTimeout(()=>{process.send({type:'progress',metadata:{phase:'assessment',reconSessions:1}});setTimeout(()=>{process.send({type:'result',raw:{ready:true,results:[]},handlerFailures:0,sessions:1},()=>process.exit(0));},700);},700);});`);
  const c=config({recon:{timeoutSeconds:1}});
  const result=await supervise(c,'run',undefined,pathToFileURL(file));
  assert.equal(result.raw.ready,true);assert.equal(result.reconSessions,1);
  writeFileSync(file,`process.once('message',()=>{setInterval(()=>process.send({type:'progress',metadata:{phase:'assessment',reconSessions:0}}),100);});`);
  const begin=Date.now();const failed=await supervise(c,'run',undefined,pathToFileURL(file));
  assert.equal(failed.raw,null);assert.equal(failed.failureCode,'DEADLINE_OR_SIGNAL');assert.ok(Date.now()-begin<2500);
});
