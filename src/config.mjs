import {DEFAULT_OBJECTIVES} from './objectives.mjs';
import {readFileSync} from 'node:fs';

function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${label}: object required`);
  if (Object.keys(value).some(k => !keys.includes(k))) throw Error(`${label}: unknown field`);
}
function integer(n, min, max, label) {
  if (!Number.isInteger(n) || n < min || n > max) throw Error(`${label}: invalid range`);
}
function string(s, label, max = 256) {
  if (typeof s !== 'string' || !s.length || s.length > max || /[\x00-\x1f]/.test(s)) throw Error(`${label}: invalid string`);
}
function validateAppContext(value, label = 'appContext') {
  object(value, ['appDescription','allowedActions','forbiddenActions'], label);
  string(value.appDescription,`${label}.appDescription`,10000);
  for (const field of ['allowedActions','forbiddenActions']) {
    if (!Array.isArray(value[field]) || value[field].length > 100) throw Error(`${label}.${field}: expected an array of up to 100 strings`);
    for (const item of value[field]) string(item,`${label}.${field}`,1500);
  }
}
export function validate(c) {
  object(c, ['mode','target','red','execution','output','gate'], 'config');
  if (!['mock','red'].includes(c.mode)) throw Error('mode must be mock or red');
  object(c.target, ['url','adapter','allowHttp','model','requestField','responsePath','sessionField','authEnv','caFile','instrumented','demoSafe'], 'target');
  string(c.target.url, 'target.url', 2048);
  const u = new URL(c.target.url);
  if (!['http:','https:'].includes(u.protocol) || u.username || u.password || u.hash || u.search) throw Error('target URL must be fixed HTTP(S), without credentials, query or fragment');
  if (u.protocol === 'http:' && c.target.allowHttp !== true) throw Error('HTTP requires allowHttp');
  if (!['openai','json','stateful','demo'].includes(c.target.adapter)) throw Error('unknown target adapter');
  if (c.target.adapter === 'demo' && c.mode !== 'mock') throw Error('demo adapter requires mock mode');
  if (c.target.demoSafe !== undefined && c.target.adapter !== 'demo') throw Error('demoSafe requires demo adapter');
  for (const k of ['allowHttp','instrumented','demoSafe']) if (c.target[k] !== undefined && typeof c.target[k] !== 'boolean') throw Error(`target.${k}: boolean required`);
  for (const k of ['requestField','sessionField']) {
    c.target[k] ??= k === 'requestField' ? 'message' : 'sessionId';
    if (typeof c.target[k] !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(c.target[k]) || ['constructor','prototype'].includes(c.target[k])) throw Error('invalid payload field');
  }
  if (c.target.requestField === c.target.sessionField) throw Error('payload fields must differ');
  c.target.responsePath ??= c.target.adapter === 'openai' ? ['choices',0,'message','content'] : ['reply'];
  if (!Array.isArray(c.target.responsePath) || !c.target.responsePath.length || c.target.responsePath.length > 10 || c.target.responsePath.some(k => !(typeof k === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(k) && !['constructor','prototype'].includes(k)) && !(Number.isInteger(k) && k >= 0 && k < 100))) throw Error('invalid responsePath');
  if (c.target.adapter === 'openai') string(c.target.model, 'target.model');
  if (c.target.authEnv !== undefined && (typeof c.target.authEnv !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/.test(c.target.authEnv))) throw Error('invalid authEnv');
  if (c.target.caFile !== undefined) string(c.target.caFile, 'caFile', 2048);
  c.execution ??= {};
  object(c.execution, ['concurrency','timeoutSeconds','requestTimeoutSeconds','maxBytes','maxTurns','maxSessions'], 'execution');
  for (const [k, def, min, max] of [['concurrency',4,1,64],['timeoutSeconds',3600,1,86400],['requestTimeoutSeconds',600,1,86400],['maxBytes',1048576,128,10485760],['maxTurns',100,1,1000],['maxSessions',10000,1,100000]]) {
    c.execution[k] ??= def; integer(c.execution[k],min,max,k);
  }
  c.output ??= {};
  object(c.output, ['directory','includeSensitive'], 'output');
  c.output.directory ??= './results'; string(c.output.directory,'output.directory',2048);
  c.output.includeSensitive ??= false;
  if (typeof c.output.includeSensitive !== 'boolean') throw Error('includeSensitive must be boolean');
  c.gate ??= {};
  object(c.gate, ['maxSuccessfulAttacks'], 'gate');
  c.gate.maxSuccessfulAttacks ??= 0; integer(c.gate.maxSuccessfulAttacks,0,100000,'gate');
  if (c.mode === 'red') {
    object(c.red, ['targetId','targetName','targetProfile','targetOptions','groundTruth','recon','objectives','customObjectives','strategy','datasetId','language','scanName','baseUrl'], 'red');
    if (['targetId','targetName','targetProfile'].filter(k => c.red[k] !== undefined).length !== 1) throw Error('provide exactly one of targetId, targetName or targetProfile');
    c.red.recon ??= {};
    object(c.red.recon, ['refresh','timeoutSeconds','maxSessions','maxTurns'], 'recon');
    c.red.recon.refresh ??= false;
    if (typeof c.red.recon.refresh !== 'boolean') throw Error('recon.refresh must be boolean');
    if (c.red.recon.refresh && c.red.targetId === undefined) throw Error('refresh requires an existing targetId');
    for (const [key,def,max] of [['timeoutSeconds',1800,86400],['maxSessions',20,1000],['maxTurns',20,1000]]) {
      c.red.recon[key] ??= def; integer(c.red.recon[key],1,max,`recon.${key}`);
    }
    if (c.red.targetId !== undefined) string(c.red.targetId,'red.targetId');
    else if (c.red.targetName !== undefined) {
      string(c.red.targetName,'targetName',200);
      if (!c.red.targetName.trim()) throw Error('target name must not be blank');
    } else {
      const p = c.red.targetProfile;
      object(p, ['name','appContext','appContextFile','responseTimeoutSeconds','singleTurn'], 'targetProfile');
      string(p.name,'targetProfile.name',200);
      if (!p.name.trim()) throw Error('target name must not be blank');
      if ((p.appContext === undefined) === (p.appContextFile === undefined)) throw Error('targetProfile requires exactly one of appContext or appContextFile');
      if (p.appContext !== undefined) validateAppContext(p.appContext);
      if (p.appContextFile !== undefined) string(p.appContextFile,'targetProfile.appContextFile',2048);
      if (p.responseTimeoutSeconds !== undefined) integer(p.responseTimeoutSeconds,1,480,'responseTimeoutSeconds');
      if (p.singleTurn !== undefined && typeof p.singleTurn !== 'boolean') throw Error('targetProfile.singleTurn must be a boolean');
    }
    if (c.red.targetOptions !== undefined) {
      const options = c.red.targetOptions;
      object(options, ['name','appContext','appContextFile','responseTimeoutSeconds','singleTurn'], 'targetOptions');
      if (!Object.keys(options).length) throw Error('targetOptions must contain at least one setting');
      if (c.red.targetProfile !== undefined) throw Error('use targetProfile fields instead of targetOptions when creating a supplied profile');
      if (c.red.targetName !== undefined && options.name !== undefined) throw Error('targetOptions.name cannot be used with targetName');
      if (c.red.targetId !== undefined && options.appContextFile !== undefined) throw Error('targetOptions.appContextFile is only supported when creating or reusing by name');
      if ((options.appContext === undefined) !== (options.appContextFile === undefined)) {
        if (options.appContext !== undefined) validateAppContext(options.appContext,'targetOptions.appContext');
      } else if (options.appContext !== undefined) throw Error('targetOptions accepts only one of appContext or appContextFile');
      if (options.appContextFile !== undefined) string(options.appContextFile,'targetOptions.appContextFile',2048);
      if (options.responseTimeoutSeconds !== undefined) integer(options.responseTimeoutSeconds,1,480,'targetOptions.responseTimeoutSeconds');
      if (options.singleTurn !== undefined && typeof options.singleTurn !== 'boolean') throw Error('targetOptions.singleTurn must be a boolean');
    }
    if (c.red.groundTruth !== undefined) {
      const groundTruth = c.red.groundTruth;
      object(groundTruth, ['systemPrompt','tools'], 'groundTruth');
      if (groundTruth.systemPrompt === undefined && groundTruth.tools === undefined) throw Error('groundTruth requires systemPrompt or tools');
      if (groundTruth.systemPrompt !== undefined && (typeof groundTruth.systemPrompt !== 'string' || !groundTruth.systemPrompt.trim() || groundTruth.systemPrompt.length > 50000 || /\x00/.test(groundTruth.systemPrompt))) throw Error('groundTruth.systemPrompt: invalid string');
      if (groundTruth.tools !== undefined) {
        if (Array.isArray(groundTruth.tools)) {
          if (groundTruth.tools.length > 100 || groundTruth.tools.some(tool => !(typeof tool === 'string' && tool.length > 0) && (!tool || typeof tool !== 'object' || Array.isArray(tool)))) throw Error('groundTruth.tools: expected an array of tool definitions');
          groundTruth.tools = JSON.stringify(groundTruth.tools);
        }
        if (typeof groundTruth.tools !== 'string' || !groundTruth.tools.trim() || groundTruth.tools.length > 100000 || /\x00/.test(groundTruth.tools)) throw Error('groundTruth.tools: invalid string');
      }
    }
    if (c.red.scanName !== undefined) {
      string(c.red.scanName,'scanName',200);
      if (!c.red.scanName.trim()) throw Error('scanName must not be blank');
    }
    const languages = ['ar','bn','zh-Hans','zh-Hant','cs','da','nl','en','fi','fr','de','el','he','hi','hu','id','it','ja','ko','ms','no','pl','pt','ro','ru','es','sv','th','tr','uk','vi'];
    if (c.red.language !== undefined && !languages.includes(c.red.language)) throw Error('unsupported Red language');
    c.red.baseUrl ??= 'https://red-webhooks.lakera.ai';
    if (c.red.baseUrl !== 'https://red-webhooks.lakera.ai') throw Error('this prototype supports only the documented SDK US endpoint');
    if (c.red.datasetId !== undefined) {
      string(c.red.datasetId,'datasetId',256);
      if (['objectives','customObjectives','strategy','language'].some(k => c.red[k] !== undefined)) throw Error('dataset scans cannot include objectives, customObjectives, strategy or language');
    } else {
      c.red.strategy ??= {name:'crescendo'};
      object(c.red.strategy, ['name','numberOfProbes','maxTurns','maxRetries','earlyStopScore','numberOfAttacksPerObjective','probes'], 'strategy');
      const allowed = {static:['numberOfProbes','numberOfAttacksPerObjective'],crescendo:['maxTurns','maxRetries','earlyStopScore','numberOfAttacksPerObjective'],smoke:['probes'],'tool-response-poisoning':['numberOfAttacksPerObjective']};
      if (typeof c.red.strategy.name !== 'string' || !Object.hasOwn(allowed,c.red.strategy.name) || Object.keys(c.red.strategy).some(k => k !== 'name' && !allowed[c.red.strategy.name].includes(k))) throw Error('invalid strategy fields');
      if (c.red.strategy.name === 'smoke') {
        if (c.red.objectives !== undefined || c.red.customObjectives !== undefined) throw Error('smoke strategy does not accept objectives or customObjectives');
        if (c.red.strategy.probes !== undefined && (!Array.isArray(c.red.strategy.probes) || !c.red.strategy.probes.length || c.red.strategy.probes.some(p => typeof p !== 'string' || !p.trim() || p.length > 10000))) throw Error('strategy.probes must be a non-empty array of prompt strings');
      } else {
        if (c.red.objectives === undefined || c.red.objectives === 'all') c.red.objectives = [...DEFAULT_OBJECTIVES];
        if (!Array.isArray(c.red.objectives) || c.red.objectives.length > 100 || c.red.objectives.some(x => typeof x !== 'string' || !/^[\w.:-]{1,128}$/.test(x))) throw Error('objectives must be all or an array of IDs');
        if (new Set(c.red.objectives).size !== c.red.objectives.length) throw Error('duplicate objective IDs');
        c.red.customObjectives ??= [];
        if (!Array.isArray(c.red.customObjectives) || c.red.customObjectives.length > 100) throw Error('invalid customObjectives');
      }
      const objectiveIds = c.red.objectives ?? [];
      const keys = new Set([...DEFAULT_OBJECTIVES, ...objectiveIds]);
      for (const o of c.red.customObjectives ?? []) {
      object(o, ['key','name','attackDescription','successIndicators','severity','additionalContext','runsWithDirectAttacks','runsWithIndirectAttacks'], 'customObjective');
      if (typeof o.key !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(o.key) || keys.has(o.key)) throw Error('invalid or duplicate custom objective key');
      keys.add(o.key);
      string(o.name,'custom objective name',200);
      string(o.attackDescription,'attackDescription',1500);
      if (!o.name.trim() || !o.attackDescription.trim()) throw Error('blank custom objective');
      if (!Array.isArray(o.successIndicators) || !o.successIndicators.length || o.successIndicators.length > 100) throw Error('success indicators required');
      for (const indicator of o.successIndicators) { string(indicator,'successIndicator',1500); if (!indicator.trim()) throw Error('blank success indicator'); }
      if (o.additionalContext !== undefined) string(o.additionalContext,'additionalContext',1500);
      if (o.severity !== undefined && !['critical','high','medium','low'].includes(o.severity)) throw Error('invalid severity');
      for (const flag of ['runsWithDirectAttacks','runsWithIndirectAttacks']) if (o[flag] !== undefined && typeof o[flag] !== 'boolean') throw Error('invalid objective strategy flag');
        const flag = c.red.strategy.name === 'tool-response-poisoning' ? 'runsWithIndirectAttacks' : 'runsWithDirectAttacks';
        if (o[flag] === false) throw Error('custom objective excludes selected strategy');
      }
      if (!objectiveIds.length && !(c.red.customObjectives ?? []).length && c.red.strategy.name !== 'smoke') throw Error('at least one objective required');
      if (c.red.strategy.name === 'tool-response-poisoning' && objectiveIds.some(id => DEFAULT_OBJECTIVES.includes(id))) throw Error('default catalog supports direct strategies only; select indirect objectives explicitly');
      if (c.target.adapter === 'json' && !['static','smoke'].includes(c.red.strategy.name)) throw Error('stateless JSON adapter supports only static or smoke scans');
      const ranges = {numberOfProbes:[1,50],maxTurns:[1,30],maxRetries:[0,10],earlyStopScore:[3,5]};
      for (const k of ['numberOfProbes','maxTurns','maxRetries','earlyStopScore']) if (c.red.strategy[k] !== undefined) integer(c.red.strategy[k],...ranges[k],k);
      if (c.red.strategy.numberOfAttacksPerObjective !== undefined) {
        const range = c.red.strategy.name === 'crescendo' ? [1,10] : c.red.strategy.name === 'static' ? [1,50] : [1,100];
        integer(c.red.strategy.numberOfAttacksPerObjective,...range,'numberOfAttacksPerObjective');
      }
      if (c.red.strategy.name === 'tool-response-poisoning' && (c.target.adapter !== 'stateful' || c.target.instrumented !== true)) throw Error('indirect attacks require an explicitly instrumented stateful target');
    }
  } else if (c.red !== undefined) throw Error('mock mode cannot contain Red configuration');
  return c;
}
export function loadConfig(path) {
  const data = readFileSync(path);
  if (data.length > 65536) throw Error('configuration too large');
  return validate(JSON.parse(data));
}
