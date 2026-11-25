#!/usr/bin/env node
import {selectedObjectives} from './objectives.mjs';
import {loadConfig} from './config.mjs';
import {createReportDirectory,publish,summarize} from './reports.mjs';
import {supervise} from './supervisor.mjs';

process.umask(0o077);
let config;
let dashboard;
try {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw Error('TLS verification must remain enabled');
  if (process.argv.length !== 3) throw Error('usage');
  config = loadConfig(process.argv[2]);
} catch { console.error('Invalid configuration. Usage: node src/cli.mjs CONFIG.json'); process.exit(2); }

try {
  const {runId,directory} = createReportDirectory(config.output.directory);
  const startedAt = new Date().toISOString();
  const abort = new AbortController();
  const terminate = () => abort.abort();
  process.once('SIGTERM',terminate); process.once('SIGINT',terminate);
  const {raw,handlerFailures,sessions,scanId,targetId,reconSessions,datasetConversationCount,failureCode,diagnostic,stage,dashboard:activeDashboard} = await supervise(config,runId,abort.signal);
  dashboard = activeDashboard;
  process.removeListener('SIGTERM',terminate); process.removeListener('SIGINT',terminate);
  const result = summarize(raw,config,handlerFailures,datasetConversationCount);
  const summary = {schemaVersion:1,runId,provider:config.mode,startedAt,finishedAt:new Date().toISOString(),scanId,targetId,reconSessions,datasetConversationCount,stage,diagnostic,selectedObjectives:config.mode === 'red' ? selectedObjectives(config.red) : undefined,sessions,failureCode,gate:config.gate,...result};
  publish(directory,summary,raw,config.output.includeSensitive);
  dashboard?.finish(summary);
  console.log(JSON.stringify({runId,directory,outcome:summary.outcome,exitCode:summary.exitCode}));
  process.exitCode = summary.exitCode;
} catch { dashboard?.finish(); console.error('Runner failed; no trustworthy completed report is available.'); process.exitCode = 2; }
