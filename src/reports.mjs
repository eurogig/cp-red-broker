import {selectedObjectives} from './objectives.mjs';
import {mkdirSync,writeFileSync,renameSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

export function summarize(raw, config, handlerFailures = 0) {
  if (Array.isArray(raw?.results) && raw.results.length > 100000) raw = null;
  let incomplete = raw?.ready !== true || !Array.isArray(raw?.results) || !raw.results.length || handlerFailures > 0;
  const entries = (Array.isArray(raw?.results) ? raw.results : []).map(entry => {
    const valid = entry && typeof entry.objectiveId === 'string' && /^[\w.:-]{1,128}$/.test(entry.objectiveId) && typeof entry.isSuccessful === 'boolean' && !entry.error;
    if (!valid) incomplete = true;
    return {objectiveId:valid ? entry.objectiveId : 'unknown',successful:valid ? entry.isSuccessful : null,status:valid ? 'evaluated' : 'error'};
  });
  if (config.mode === 'red' && selectedObjectives(config.red).some(id => !entries.some(entry => entry.objectiveId === id))) incomplete = true;
  // No verified delivery evidence is currently exposed by our SDK integration.
  // Never certify indirect coverage merely because the evaluator returned false.
  if (config.mode === 'red' && config.red.strategy.name === 'tool-response-poisoning') incomplete = true;
  const successfulAttacks = entries.filter(e => e.successful === true).length;
  const outcome = incomplete ? 'incomplete' : successfulAttacks ? 'findings' : 'clean';
  const exitCode = incomplete ? 2 : successfulAttacks > config.gate.maxSuccessfulAttacks ? 1 : 0;
  return {outcome,exitCode,successfulAttacks,assessedEntries:entries.length,entries};
}
export function createReportDirectory(root) {
  mkdirSync(root,{recursive:true,mode:0o700});
  const runId = randomUUID();
  const directory = join(resolve(root),runId);
  mkdirSync(directory,{mode:0o700});
  return {runId,directory};
}
function durableWrite(path, data) {
  const fd = openSync(path,'wx',0o600);
  try { writeFileSync(fd,data); fsyncSync(fd); } finally { closeSync(fd); }
}
export function publish(directory, summary, raw, includeSensitive) {
  const json = value => JSON.stringify(value,null,2)+'\n';
  const files = {'summary.json':json(summary)};
  const cases = summary.entries.map((e,i) => `<testcase name="attack-${i}" classname="${e.objectiveId}">${e.status === 'error' ? '<error message="Assessment incomplete"/>' : e.successful ? '<failure message="Attack succeeded"/>' : ''}</testcase>`);
  if (summary.outcome === 'incomplete') cases.push('<testcase name="assessment-completion"><error message="Assessment incomplete"/></testcase>');
  files['junit.xml'] = `<?xml version="1.0" encoding="UTF-8"?><testsuite name="Red assessment" tests="${cases.length}" failures="${summary.successfulAttacks}" errors="${summary.entries.filter(e=>e.status==='error').length+(summary.outcome==='incomplete'?1:0)}">${cases.join('')}</testsuite>\n`;
  // Compact native data prevents indentation-driven expansion of nested payloads.
  if (includeSensitive && raw) files['native-results.json'] = JSON.stringify(raw)+'\n';
  if (Object.values(files).some(body => Buffer.byteLength(body) > 25 * 1024 * 1024)) throw Error('artifact size limit exceeded');
  const hashes = {};
  for (const [name,body] of Object.entries(files)) {
    durableWrite(join(directory,name),body);
    hashes[name] = createHash('sha256').update(body).digest('hex');
  }
  const manifest = {schemaVersion:1,runId:summary.runId,terminal:true,outcome:summary.outcome,exitCode:summary.exitCode,files:hashes};
  durableWrite(join(directory,'manifest.tmp'),json(manifest));
  renameSync(join(directory,'manifest.tmp'),join(directory,'manifest.json'));
  const fd = openSync(directory,'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
  return manifest;
}
