import {readFileSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function consume(directory,expectedProvider) {
  const read = name => {
    const path=join(directory,name);const stat=lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size>25*1024*1024) throw Error('invalid artifact');
    return readFileSync(path);
  };
  const manifest=JSON.parse(read('manifest.json'));
  if (manifest.schemaVersion!==1 || manifest.terminal!==true || ![0,1,2].includes(manifest.exitCode) || !['clean','findings','incomplete'].includes(manifest.outcome)) throw Error('invalid manifest');
  if (!manifest.files || !Object.hasOwn(manifest.files,'summary.json') || !Object.hasOwn(manifest.files,'junit.xml')) throw Error('missing reports');
  for(const [name,hash] of Object.entries(manifest.files)) {
    if (!['summary.json','junit.xml','native-results.json'].includes(name) || createHash('sha256').update(read(name)).digest('hex')!==hash) throw Error('report integrity failure');
  }
  const summary=JSON.parse(read('summary.json'));
  if (!['mock','red'].includes(summary.provider) && summary.provider !== undefined) throw Error('invalid provider');
  if (expectedProvider && (!['mock','red'].includes(expectedProvider) || summary.provider!==expectedProvider)) throw Error('unexpected report provider');
  if (summary.schemaVersion!==1 || summary.runId!==manifest.runId || summary.outcome!==manifest.outcome || summary.exitCode!==manifest.exitCode) throw Error('inconsistent reports');
  if (summary.outcome==='incomplete' && summary.exitCode!==2) throw Error('invalid incomplete result');
  return summary;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {const summary=consume(process.argv[2],process.argv[3]);console.log(JSON.stringify(summary));process.exitCode=summary.exitCode;}
  catch {console.error('Missing, incomplete, or corrupt report');process.exitCode=2;}
}
