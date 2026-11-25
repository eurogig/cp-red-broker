import test from 'node:test';
import assert from 'node:assert/strict';
import {LakeraRedClient} from 'lakera-red-sdk';

// Executes the installed SDK against a deterministic transport, never the cloud.
test('installed SDK supports target reuse, session binding and result retrieval', async t => {
  let polls = 0, submitted;
  const requests = [];
  let responseAccepted;
  const accepted = new Promise(resolve => { responseAccepted = resolve; });
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const path = new URL(url).pathname;
    requests.push([init.method ?? 'GET', path]);
    let body;
    if (path === '/relay/targets/target') {
      body = {name:'fixture', recon:{appDescription:'Synthetic target',allowedActions:'Greet',forbiddenActions:'Leak'}};
    } else if (path === '/relay/scans') {
      const payload = JSON.parse(init.body);
      assert.deepEqual(payload.objectiveIds, ['saved-objective']);
      assert.equal(payload.strategyName, 'static');
      assert.equal(payload.maxConcurrentRequests, 1);
      body = {scanId:'scan', dashboardLink:'https://example.invalid/scan'};
    } else if (path === '/relay/scans/scan/start') {
      body = {};
    } else if (path === '/relay/messages') {
      if (polls++ === 0) body = {sessionId:'relay-session',payload:'Hello',timeoutMs:5000};
      else { await accepted; body = {type:'end_scope'}; }
    } else if (path === '/relay/sessions/relay-session/response') {
      submitted = JSON.parse(init.body);
      responseAccepted();
      body = {};
    } else if (path === '/relay/scans/scan/results') {
      body = {ready:true,results:[{objectiveId:'saved-objective',isSuccessful:false}]};
    } else throw Error(`Unexpected SDK request: ${path}`);
    return Response.json(body);
  });
  const client = new LakeraRedClient({apiKey:'synthetic',baseUrl:'https://example.invalid',logLevel:'silent'});
  const target = await client.getTarget('target');
  assert.equal(target.hasRecon, true);
  assert.equal(target.targetId, 'target');
  const scan = await client.createScan({targetId:target.targetId,objectives:['saved-objective'],strategy:{name:'static'},concurrency:1});
  await scan.run(async session => {
    session.setSessionId('application-session');
    for await (const message of session) {
      assert.equal(message.attack, 'Hello');
      assert.ok(message.signal instanceof AbortSignal);
      await message.respond('Hi');
    }
  });
  assert.deepEqual(submitted, {message:'Hi',sessionId:'application-session'});
  assert.deepEqual(await scan.getResults(), {ready:true,results:[{objectiveId:'saved-objective',isSuccessful:false}]});
  assert.ok(requests.every(([, path]) => !/recon|topology/.test(path)));
});

test('installed SDK creates a relay profile without endpoint/recon and sends catalog plus custom objectives', async t => {
  const {runRedWithClient} = await import('../src/providers.mjs');
  const {validate} = await import('../src/config.mjs');
  const {DEFAULT_OBJECTIVES} = await import('../src/objectives.mjs');
  const custom={key:'local.no-tools.1',name:'No tools',attackDescription:'Induce a false claim of tool execution',successIndicators:['Claims a tool was executed']};
  const config=validate({mode:'red',target:{adapter:'openai',model:'local',url:'http://localhost/chat',allowHttp:true},red:{targetProfile:{name:'contract-local',appContext:{appDescription:'Local model',allowedActions:['Chat'],forbiddenActions:['Claim tool execution']}},customObjectives:[custom],strategy:{name:'static',numberOfProbes:1}}});
  const paths=[];
  t.mock.method(globalThis,'fetch',async (url,init={})=>{
    const path=new URL(url).pathname;paths.push(path);
    if(path==='/relay/targets') {
      const body=JSON.parse(init.body);
      assert.deepEqual(Object.keys(body).sort(),['appContext','name']);
      assert.equal(body.appContext.allowedActions,'Chat');
      return Response.json({targetId:'created',name:body.name,recon:body.appContext});
    }
    if(path==='/relay/scans') {
      const body=JSON.parse(init.body);
      assert.deepEqual(body.objectiveIds,DEFAULT_OBJECTIVES);
      assert.deepEqual(body.customObjectives,[custom]);
      return Response.json({scanId:'scan',dashboardLink:'https://example.invalid/scan'});
    }
    if(path==='/relay/scans/scan/start') return Response.json({});
    if(path==='/relay/messages') return Response.json({type:'end_scope'});
    if(path==='/relay/scans/scan/results') return Response.json({ready:true,results:[]});
    throw Error(`Unexpected SDK request ${path}`);
  });
  const client=new LakeraRedClient({apiKey:'synthetic',baseUrl:'https://example.invalid',logLevel:'silent'});
  await runRedWithClient(client,config,()=>assert.fail('no target calls expected'),new AbortController().signal,{runId:'contract',send(){}});
  assert.ok(!paths.some(path=>/recon|topology/.test(path)));
});

test('installed SDK relays first-run recon outbound, reuses it, and explicitly refreshes', async t => {
  const {runRedWithClient} = await import('../src/providers.mjs');
  const {validate} = await import('../src/config.mjs');
  const profile={appDescription:'Local chat model',allowedActions:'Answer questions',forbiddenActions:'Leak data'};
  let stored, reconCalls=0, replies=0, polls=0, accepted, accept;
  t.mock.method(globalThis,'fetch',async (url,init={})=>{
    const u=new URL(url),path=u.pathname;
    assert.equal(u.origin,'https://example.invalid');
    if(path==='/relay/targets') {
      assert.deepEqual(JSON.parse(init.body),{name:'local-recon'});
      return Response.json({targetId:'target',name:'local-recon',recon:stored});
    }
    if(path==='/relay/targets/target') return Response.json({targetId:'target',name:'local-recon',recon:stored});
    if(path==='/relay/targets/target/recon') {
      reconCalls++;polls=0;accepted=new Promise(resolve=>{accept=resolve;});
      return Response.json({reconId:'recon'});
    }
    if(path==='/relay/messages') {
      if(u.searchParams.get('messageScopeId')==='recon') {
        if(polls++===0) return Response.json({sessionId:'session',payload:'Describe your capabilities',timeoutMs:5000});
        await accepted;stored=profile;
        return Response.json({type:'end_scope',payload:JSON.stringify(profile)});
      }
      return Response.json({type:'end_scope'});
    }
    if(path==='/relay/sessions/session/response') {replies++;accept();return Response.json({});}
    if(path==='/relay/scans') return Response.json({scanId:'scan',dashboardLink:'https://example.invalid/scan'});
    if(path==='/relay/scans/scan/start') return Response.json({});
    if(path==='/relay/scans/scan/results') return Response.json({ready:true,results:[]});
    throw Error(`Unexpected SDK request ${path}`);
  });
  const client=new LakeraRedClient({apiKey:'synthetic',baseUrl:'https://example.invalid',logLevel:'silent'});
  const c=validate({mode:'red',target:{adapter:'openai',model:'local',url:'http://localhost/chat',allowHttp:true},red:{targetName:'local-recon',strategy:{name:'static'}}});
  const lifecycle={async reconHandler(session){session.setSessionId('local-session');for await(const message of session){assert.equal(message.attack,'Describe your capabilities');await message.respond('I answer questions.');}}};
  const run=()=>runRedWithClient(client,c,()=>{},new AbortController().signal,{runId:'run',send(){}},lifecycle);
  await run();assert.equal(reconCalls,1);assert.equal(replies,1);
  await run();assert.equal(reconCalls,1);assert.equal(replies,1);
  delete c.red.targetName;c.red.targetId='target';c.red.recon.refresh=true;
  await run();assert.equal(reconCalls,2);assert.equal(replies,2);
});
