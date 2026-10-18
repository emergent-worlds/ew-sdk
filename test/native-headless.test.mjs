import {beforeAll,afterAll,expect,it} from 'vitest';
import {buildNativeHeadless} from '../scripts/build-native-headless.mjs';
import {HostBridge,Manifest} from '@emergent-worlds/host';
import {WebSocketServer} from 'ws';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const supported=process.platform==='darwin'&&process.arch==='arm64';
let root,artifact,receipt;
beforeAll(async()=>{if(!supported)return;root=await mkdtemp(join(tmpdir(),'ew-jsc-conformance-'));artifact=join(root,'kestrel-yards');receipt=await buildNativeHeadless(artifact);},30000);
afterAll(async()=>{if(root)await rm(root,{recursive:true,force:true});});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const asks=Manifest.parse({name:'Kestrel Yards',kind:'reality',version:'1.0.0',owner:'@mercerpress',entry:{installs:{server:'server'}},asks:{saves:true,agent:'change',while_away:true,input:['text','pointer']}}).asks;
async function open(stored=new Map(),failSave=()=>false){
 const server=new WebSocketServer({host:'127.0.0.1',port:0,maxPayload:4*1024*1024,perMessageDeflate:false});await once(server,'listening');
 let bridge,child,stderr='',admitted=0,refused=0;const saves=[];
 let readyResolve,readyReject;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 const timeout=setTimeout(()=>readyReject(Error('native SDK admission did not complete: '+stderr)),3000);
 server.on('connection',socket=>socket.once('message',raw=>{
  if(JSON.parse(raw.toString()).token!=='one-use-fixture'||admitted++)return socket.close();
  const transport={send:message=>socket.send(JSON.stringify(message)),onMessage(listener){const receive=raw=>listener(JSON.parse(raw.toString()));socket.on('message',receive);return()=>socket.off('message',receive);},close:()=>socket.close()};
  bridge=new HostBridge(transport,asks,{
   ready:()=>bridge.send({type:'grant',asks,session:'native-fixture',headless:true,version:{id:'native-version',seq:1},files:[...stored].map(([path,data])=>({path,sha256:hash(data),size:data.length})),uses:[],display:{theme:'light',textSize:'default',contrast:'default',motion:'full',language:'en'}}),
   progress:()=>readyResolve(),fileRead:async path=>({data:stored.get(path).toString('base64')}),refused:()=>refused++,
   save:async message=>{
    saves.push(message.reason);if(failSave())throw Error('fixture exact save refusal');
    const next=new Map();for(const f of message.files){const bytes=f.data===undefined?stored.get(f.path):Buffer.from(f.data,'base64');expect(hash(bytes)).toBe(f.sha256);next.set(f.path,bytes);}
    stored.clear();for(const item of next)stored.set(...item);
    return{version:`native-save-${saves.length}`,seq:saves.length,at:'2026-10-18T00:00:00Z'};
   }
  },1500,'core');
 }));
 child=spawn(artifact,[],{cwd:root,env:{EW_SDK_URL:`ws://127.0.0.1:${server.address().port}/`,EW_SDK_TOKEN:'one-use-fixture'},stdio:['ignore','ignore','pipe']});
 child.stderr.on('data',bytes=>stderr+=bytes);child.on('exit',code=>readyReject(Error(`native exited ${code}: ${stderr}`)));
 const close=async()=>{clearTimeout(timeout);bridge?.close();for(const s of server.clients)s.terminate();if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGKILL');await exited;}await new Promise(resolve=>server.close(resolve));};
 try{await ready;clearTimeout(timeout);return{bridge,stored,saves,refused:()=>refused,close};}catch(e){await close();throw e;}
}
it.skipIf(!supported)('embeds every actual asset and declares only OS linkage, running without source workspace or PATH',async()=>{
 expect(receipt.target).toEqual({platform:'darwin',arch:'arm64',minimumOS:'13.0'});expect(receipt.linkage.every(line=>line.startsWith('/System/')||line.startsWith('/usr/lib/'))).toBe(true);
 const bytes=await readFile(artifact);expect(hash(bytes)).toBe(receipt.artifact.sha256);expect(bytes.includes(Buffer.from('The original launcher connection is unavailable'))).toBe(true);
 const a=await open();try{expect(await a.bridge.request({type:'state.read',path:'values/crew'})).toBe(6);expect(a.refused()).toBe(0);}finally{await a.close();}
},10000);
it.skipIf(!supported)('keeps actual interval and final engine saves and resumes their exact bytes',async()=>{
 const stored=new Map(),a=await open(stored);try{a.bridge.send({type:'advance',pace:'day',realElapsedMs:1800000});await a.bridge.requestSave('interval');expect(await a.bridge.request({type:'quit',reason:'leaving'})).toMatchObject({saved:true});expect(a.saves).toEqual(['interval','leaving']);}finally{await a.close();}
 const snapshot=[...stored].map(([path,data])=>[path,data.toString('base64')]),b=await open(stored);try{expect(await b.bridge.request({type:'quit',reason:'handoff'})).toMatchObject({saved:true});expect([...stored].map(([path,data])=>[path,data.toString('base64')])).toEqual(snapshot);}finally{await b.close();}
},10000);
it.skipIf(!supported)('does not acknowledge or automatically retry a refused final save',async()=>{
 let failed=true;const a=await open(new Map(),()=>failed);try{await expect(a.bridge.request({type:'quit',reason:'leaving'})).rejects.toThrow('fixture exact save refusal');await new Promise(resolve=>setTimeout(resolve,80));expect(a.saves).toEqual(['leaving']);failed=false;expect(await a.bridge.request({type:'state.read',path:'values/crew'})).toBe(6);expect(a.saves).toEqual(['leaving']);}finally{await a.close();}
},10000);
it.skipIf(!supported)('refuses undeclared launch URLs before connecting and never prints launcher credentials',async()=>{
 for(const url of ['ws://remote.example:8888/','ws://127.0.0.1/','ws://127.0.0.1:88/?redirect=x','ws://user@127.0.0.1:88/','wss://127.0.0.1:88/']){
  const child=spawn(artifact,[],{cwd:root,env:{EW_SDK_URL:url,EW_SDK_TOKEN:'private-fixture-never-log'},stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',x=>error+=x);const[code]=await once(child,'exit');expect(code).toBe(1);expect(error).not.toContain('private-fixture-never-log');expect(error).not.toContain(url);
 }
},10000);

it.skipIf(!supported)('retains technical evidence and refuses changed bytes or duplicated occurrences',async()=>{
 const {scanTree}=await import('../check/scan.ts'),{reviewedMetadata}=await import('../check/reviewed-metadata.ts');
 const {writeFile,mkdir}=await import('node:fs/promises');
 const bytes=await readFile(artifact),record=reviewedMetadata[0];expect(hash(bytes)).toBe(record.artifactSha256);
 expect(hash(bytes.subarray(record.embedded.offset,record.embedded.offset+record.embedded.size))).toBe(record.embedded.sha256);
 for(const finding of record.occurrences){const context=Buffer.from(finding.context);expect(hash(context)).toBe(finding.contextSha256);expect(bytes.subarray(finding.contextOffset,finding.contextOffset+context.length)).toEqual(context);}
 const tree=join(root,'exact');await mkdir(join(tree,'build/server'),{recursive:true});await writeFile(join(tree,'build/server/run'),bytes,{mode:0o755});
 const manifest={name:'Kestrel Yards',kind:'reality',version:'1.0.0',owner:'@mercerpress',entry:{installs:{server:'build/server'}},asks:{}};
 const file={path:'build/server/run',sha256:hash(bytes),size:bytes.length,executable:true};
 const evidence=await scanTree(tree,[file],'server',manifest,[]);expect(evidence.hosts).toEqual([]);expect(evidence.hostFindingsComplete).toBe(true);expect(evidence.hostFindings.filter(row=>row.disposition)).toHaveLength(4);expect(evidence.hostFindingCount).toBeGreaterThan(4);
 expect(evidence.hostFindings.filter(row=>row.disposition).every(row=>row.host!==null&&row.reason==='reviewed-non-network'&&row.disposition.artifactSha256===file.sha256)).toBe(true);
 for(const [name,changed] of [['changed',Buffer.from(bytes)],['duplicated',Buffer.concat([bytes,Buffer.from(' https://127.0.0.1/ ')])]]){
  if(name==='changed')changed[changed.length-1]^=1;
  const directory=join(root,name);await mkdir(join(directory,'build/server'),{recursive:true});await writeFile(join(directory,file.path),changed,{mode:0o755});
  const negative=await scanTree(directory,[{...file,sha256:hash(changed),size:changed.length}],'server',manifest,[]);
  expect(negative.hosts).toContain('127.0.0.1');expect(negative.hostFindings.some(row=>row.disposition)).toBe(false);
 }
});
