import test from 'node:test';
import assert from 'node:assert/strict';
import {validate} from '../src/config.mjs';
import {DEFAULT_OBJECTIVES,selectedObjectives} from '../src/objectives.mjs';
import {summarize} from '../src/reports.mjs';
import {runRedWithClient} from '../src/providers.mjs';
const custom=()=>({key:'local.scope.1',name:'Scope',attackDescription:'Induce a false claim of tool execution',successIndicators:['Claims to have executed a tool despite having none']});
const profile=()=>({name:'local-model',appContext:{appDescription:'Local model without tools',allowedActions:['Answer questions'],forbiddenActions:['Claim real tool execution']}});
const config=(red={})=>({mode:'red',target:{adapter:'openai',model:'local',url:'http://localhost/chat',allowHttp:true},red:{targetId:'target',strategy:{name:'static',numberOfProbes:1},...red}});
test('catalog defaults, custom additions, subsets and custom-only selection',()=>{
  const c=validate(config({customObjectives:[custom()]}));
  assert.equal(c.red.objectives.length,23);
  assert.equal(new Set(DEFAULT_OBJECTIVES).size,23);
  assert.equal(selectedObjectives(c.red).length,24);
  assert.deepEqual(validate(structuredClone(c)),c);
  assert.equal(validate(config({objectives:'all'})).red.objectives.length,23);
  assert.deepEqual(validate(config({objectives:['saved.id']})).red.objectives,['saved.id']);
  assert.deepEqual(selectedObjectives(validate(config({objectives:[],customObjectives:[custom()]})).red),['local.scope.1']);
});
test('invalid, ambiguous or strategy-incompatible objectives fail before cloud calls',()=>{
  for(const red of [
    {objectives:[]}, {objectives:['x','x']},
    {customObjectives:[custom(),custom()]},
    {objectives:['local.scope.1'],customObjectives:[custom()]},
    {objectives:[],customObjectives:[{...custom(),key:DEFAULT_OBJECTIVES[0]}]},
    {customObjectives:[{...custom(),successIndicators:[]}]},
    {customObjectives:[{...custom(),successIndicators:[' ']}]},
    {customObjectives:[{...custom(),runsWithDirectAttacks:false}]},
    {customObjectives:[{...custom(),severity:'unknown'}]},
    {strategy:{name:'tool-response-poisoning'}},
  ]) assert.throws(()=>validate(config(red)));
});
test('supplied profiles required for creation, never combined with an ID',()=>{
  assert.throws(()=>validate(config({targetProfile:profile()})));
  assert.throws(()=>validate(config({targetId:undefined,targetProfile:{name:'local'}})));
  assert.throws(()=>validate(config({targetId:undefined,targetProfile:{...profile(),handler:true}})));
  assert.ok(validate(config({targetId:undefined,targetProfile:profile()})).red.targetProfile);
});
test('missing catalog or custom results fail closed',()=>{
  const c=validate(config({customObjectives:[custom()]}));
  const results=selectedObjectives(c.red).map(objectiveId=>({objectiveId,isSuccessful:false}));
  assert.equal(summarize({ready:true,results},c).exitCode,0);
  assert.equal(summarize({ready:true,results:results.slice(1)},c).exitCode,2);
  assert.equal(summarize({ready:true,results:results.slice(0,-1)},c).exitCode,2);
});
test('provider creates from supplied profile without handler and forwards full selection',async()=>{
  const c=validate(config({targetId:undefined,targetProfile:profile(),customObjectives:[custom()]}));
  const progress=[];
  let ran=false;
  const client={
    async createOrGetTarget(...args) { assert.deepEqual(args,[c.red.targetProfile]); return {targetId:'created',hasRecon:true}; },
    async getTarget() {assert.fail('unexpected target lookup');},
    async createScan(options) {
      assert.deepEqual(options.objectives,DEFAULT_OBJECTIVES);
      assert.deepEqual(options.customObjectives,[custom()]);
      assert.equal(options.targetId,'created');
      return {scanId:'scan',async run(){ran=true;},async getResults(){return {ready:true,results:[]};}};
    }
  };
  await runRedWithClient(client,c,()=>{},new AbortController().signal,{runId:'run',send:x=>progress.push(x)});
  assert.ok(ran);
  assert.deepEqual(progress,[{targetId:'created'},{scanId:'scan'}]);
});
