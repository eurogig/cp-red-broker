import {startTarget} from '../demo/target.mjs';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
const directory = mkdtempSync(join(tmpdir(),'red-demo-'));
const useHttp=process.argv.includes('--http');
const server = useHttp ? await startTarget({vulnerable:process.env.DEMO_SAFE!=='1'}) : null;
try {
  const target = server ? {url:`http://127.0.0.1:${server.address().port}/chat`,adapter:'stateful',allowHttp:true} : {url:'http://localhost/demo',adapter:'demo',allowHttp:true,demoSafe:process.env.DEMO_SAFE==='1'};
  const config = {mode:'mock',target,output:{directory:'./results'}};
  const file=join(directory,'config.json');writeFileSync(file,JSON.stringify(config));
  const child=spawn(process.execPath,['src/cli.mjs',file],{stdio:'inherit'});
  process.exitCode = await new Promise(resolve=>child.once('exit',resolve));
} finally {if(server) await new Promise(resolve=>server.close(resolve));rmSync(directory,{recursive:true,force:true});}
