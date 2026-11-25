import {validate} from './config.mjs';
import {once} from 'node:events';
import {createSessionHandler} from './session-handler.mjs';
import {mockScan,redScan} from './providers.mjs';

const [runId] = process.argv.slice(2);
try {
  const [snapshot] = await once(process,'message');
  const config = validate(snapshot);
  let scanSignal, phase = config.mode === 'red' && config.red.targetName !== undefined ? 'recon' : 'assessment';
  const trace = entry => process.send?.({type:'trace',phase,...entry});
  const scan = createSessionHandler(config,()=>scanSignal,undefined,trace);
  const progress = {runId,send:metadata => process.send?.({type:'progress',metadata})};
  let raw;
  if (config.mode === 'red') {
    const reconSignal = AbortSignal.timeout(config.red.recon.timeoutSeconds * 1000);
    const reconConfig = {...config,execution:{...config.execution,concurrency:5,maxSessions:config.red.recon.maxSessions,maxTurns:config.red.recon.maxTurns}};
    const recon = createSessionHandler(reconConfig,()=>reconSignal,undefined,entry=>process.send?.({type:'trace',phase:'recon',...entry}));
    raw = await redScan(config,scan.handler,reconSignal,progress,{
      reconHandler:recon.handler,
      finishRecon() {
        reconSignal.throwIfAborted();
        if (recon.stats.failures || recon.stats.active) throw Error('recon handler did not complete successfully');
      },
      startAssessment() {
        scanSignal = AbortSignal.timeout(config.execution.timeoutSeconds * 1000);
        phase='assessment';
        progress.send({phase:'assessment',reconSessions:recon.stats.sessions});
        return scanSignal;
      }
    });
  } else {
    scanSignal = AbortSignal.timeout(config.execution.timeoutSeconds * 1000);
    raw = await mockScan(config,scan.handler,scanSignal);
  }
  if (raw?.results?.length > 100000 || Buffer.byteLength(JSON.stringify(raw)) > 20 * 1024 * 1024) throw Error('result limit exceeded');
  process.send({type:'result',raw,handlerFailures:scan.stats.failures,sessions:scan.stats.sessions}, () => process.exit(0));
} catch (error) {
  const code = error.code === 'ERR_MODULE_NOT_FOUND' ? 'SDK_UNAVAILABLE' : ['RED_CREDENTIAL_MISSING','RECON_FAILED'].includes(error.code) ? error.code : 'EXECUTION_FAILED';
  process.send?.({type:'failure',code,diagnostic:error.diagnostic ?? {stage:'worker',category:classifyWorkerError(error)}}, () => process.exit(2));
}

function classifyWorkerError(error) {
  const code=typeof error?.code==='string'?error.code.toUpperCase():'';
  if (code.includes('TIMEOUT') || code==='ABORT_ERR' || /timeout|timed out|deadline/i.test(error?.message??'')) return 'TIMEOUT';
  if (/incomplete profile/i.test(error?.message??'')) return 'PROFILE_INCOMPLETE';
  if (code.includes('FETCH') || ['ECONNREFUSED','ECONNRESET','ENOTFOUND','EAI_AGAIN'].includes(code)) return 'NETWORK';
  return 'EXECUTION_ERROR';
}
