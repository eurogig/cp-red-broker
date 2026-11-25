import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {VerboseDashboard} from './verbose-dashboard.mjs';

export async function supervise(config,runId,signal,workerUrl=new URL('./worker.mjs',import.meta.url)) {
  const worker=fork(fileURLToPath(workerUrl),[runId],{stdio:['ignore','ignore','ignore','ipc'],execArgv:[...process.execArgv,'--max-old-space-size=384']});
  let raw,received=false,handlerFailures=0,sessions=0,scanId,targetId,reconSessions=0,datasetConversationCount,assessmentStarted=false,forced=false,failureCode,diagnostic,stage;
  const terminate=()=>{forced=true;failureCode='DEADLINE_OR_SIGNAL';worker.kill('SIGKILL');};
  let timer=setTimeout(terminate,(config.mode === 'red' ? config.red.recon.timeoutSeconds : config.execution.timeoutSeconds)*1000);
  signal?.addEventListener('abort',terminate,{once:true});
  if(signal?.aborted) terminate();
  const verbose = process.env.RED_VERBOSE === '1';
  const dashboard = verbose && process.stdout.isTTY ? new VerboseDashboard() : undefined;
  worker.on('message',message=>{
    if(message.type==='trace' && verbose) {
      const {type,...data}=message;
      if (dashboard) dashboard.trace(data);
      else console.log(JSON.stringify({runId,...data}));
    }
    if(message.type==='progress') {
      if (dashboard) dashboard.progress(message.metadata);
      if(typeof message.metadata?.stage==='string' && /^[a-z_]{1,64}$/.test(message.metadata.stage)) { stage=message.metadata.stage; if(!dashboard) console.log(JSON.stringify({runId,stage})); }
    }
    if(message.type==='progress' && message.metadata?.failure && /^[A-Z_]{1,64}$/.test(message.metadata.failure.category) && /^[a-z_]{1,64}$/.test(message.metadata.failure.stage)) diagnostic=message.metadata.failure;
    if(message.type==='progress' && message.metadata?.phase==='assessment' && config.mode==='red' && !assessmentStarted && !forced) {
      assessmentStarted=true;
      clearTimeout(timer); timer=setTimeout(terminate,config.execution.timeoutSeconds*1000);
      if(Number.isInteger(message.metadata.reconSessions) && message.metadata.reconSessions>=0) reconSessions=message.metadata.reconSessions;
    }
    if(message.type==='result') {raw=message.raw;handlerFailures=message.handlerFailures;sessions=message.sessions;received=true;}
    if(message.type==='progress' && typeof message.metadata?.scanId==='string' && /^[\w-]{1,256}$/.test(message.metadata.scanId)) scanId=message.metadata.scanId;
    if(message.type==='progress' && typeof message.metadata?.targetId==='string' && /^[\w-]{1,256}$/.test(message.metadata.targetId)) targetId=message.metadata.targetId;
    if(message.type==='progress' && Number.isInteger(message.metadata?.datasetConversationCount) && message.metadata.datasetConversationCount>0 && message.metadata.datasetConversationCount<=5000) datasetConversationCount=message.metadata.datasetConversationCount;
    if(message.type==='failure' && ['SDK_UNAVAILABLE','RED_CREDENTIAL_MISSING','EXECUTION_FAILED','RECON_FAILED'].includes(message.code)) { failureCode=message.code; if(message.diagnostic && /^[A-Z_]{1,64}$/.test(message.diagnostic.category) && /^[a-z_]{1,64}$/.test(message.diagnostic.stage)) diagnostic=message.diagnostic; }
  });
  const completion=new Promise(resolve=>{worker.once('error',()=>resolve(2));worker.once('exit',resolve);});
  worker.send(config,error=>{if(error) terminate();});
  const code=await completion;
  clearTimeout(timer);signal?.removeEventListener('abort',terminate);
  if (handlerFailures) failureCode='TARGET_FAILURE';
  if ((!received || code!==0) && !failureCode) failureCode='WORKER_FAILED';
  return {raw:received&&!forced&&code===0?raw:null,handlerFailures,sessions,scanId,targetId,reconSessions,datasetConversationCount,failureCode,diagnostic,stage,dashboard};
}
