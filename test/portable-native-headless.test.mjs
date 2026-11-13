import {beforeAll,afterAll,expect,it} from 'vitest';
import {buildPortableHeadless,portableHeadlessTarget,portableEmbeddedSource,verifyPortableApplicationInputs} from '../scripts/build-portable-headless.mjs';
import {createServer} from 'node:net';
import {HostBridge,Manifest} from '@emergent-worlds/host';
import {WebSocketServer} from 'ws';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const supported=['linux','win32'].includes(process.platform)&&process.arch==='x64';
let root,artifact,receipt;
beforeAll(async()=>{
 if(!supported)return;root=await mkdtemp(join(tmpdir(),'ew-portable-conformance-'));
 const supplied=process.env.EW_MR34_PORTABLE_ARTIFACT;
 if(!supplied){artifact=join(root,'KestrelYards'+(process.platform==='win32'?'.exe':''));receipt=await buildPortableHeadless(artifact);return;}
 artifact=resolve(supplied);receipt=JSON.parse(await readFile(artifact+'.build.json','utf8'));
 const sourceRoot=fileURLToPath(new URL('../',import.meta.url)),descriptor=JSON.parse(await readFile(join(sourceRoot,'vendor/quickjs-ng/source.json'),'utf8'));
 expect(receipt.target).toEqual(portableHeadlessTarget());expect(receipt.runtime.sourceFiles).toEqual(descriptor.files);
 for(const[name,digest]of Object.entries(descriptor.files))expect(hash(await readFile(join(sourceRoot,'vendor/quickjs-ng',name)))).toBe(digest);
 for(const[name,digest]of Object.entries(receipt.nativeSources))expect(hash(await readFile(join(sourceRoot,'sample/native-portable',name)))).toBe(digest);
 expect(Object.keys(receipt.nativeSources).sort()).toEqual(['CMakeLists.txt','channel.c','channel.h','main.c']);
 await verifyPortableApplicationInputs(receipt,sourceRoot);
 const bytes=await readFile(artifact);expect(hash(bytes)).toBe(receipt.artifact.sha256);const embedded=portableEmbeddedSource(bytes,receipt.target);
 expect(hash(embedded.bytes.subarray(0,receipt.sourceBundleSize))).toBe(receipt.sourceBundleSha256);
},180000);
afterAll(async()=>{if(root)await rm(root,{recursive:true,force:true});});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const asks=Manifest.parse({name:'Kestrel Yards',kind:'reality',version:'1.0.0',owner:'@mercerpress',entry:{installs:{server:'server'}},asks:{saves:true,agent:'change',while_away:true,input:['text','pointer']}}).asks;
async function open(stored=new Map(),failSave=()=>false,fragmented=false){
 const server=new WebSocketServer({host:'127.0.0.1',port:0,maxPayload:4*1024*1024,perMessageDeflate:false});await once(server,'listening');
 let bridge,child,stderr='',admitted=0,refused=0,pongs=0;const saves=[];
 let readyResolve,readyReject;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 const timeout=setTimeout(()=>readyReject(Error('native SDK admission did not complete: '+stderr)),3000);
 server.on('connection',socket=>socket.once('message',raw=>{
  if(JSON.parse(raw.toString()).token!=='one-use-fixture'||admitted++)return socket.close();
  socket.on('pong',()=>pongs++);
  const transport={send:message=>{const bytes=Buffer.from(JSON.stringify(message));if(fragmented&&bytes.length>1){const half=Math.floor(bytes.length/2);socket.send(bytes.subarray(0,half),{binary:false,fin:false});socket.ping('bounded-control');socket.send(bytes.subarray(half),{binary:false,fin:true});}else socket.send(bytes,{binary:false});},onMessage(listener){const receive=raw=>listener(JSON.parse(raw.toString()));socket.on('message',receive);return()=>socket.off('message',receive);},close:()=>socket.close()};
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
 try{await ready;clearTimeout(timeout);return{bridge,stored,saves,refused:()=>refused,pongs:()=>pongs,close};}catch(e){await close();throw e;}
}

it.skipIf(!supported)('MR3.4 portable native sample preserves real Engine saves, fragmented Host frames and exact resume without an installed JS runtime',async()=>{
 expect(receipt.target).toEqual(portableHeadlessTarget());expect(receipt.runtime).toMatchObject({name:'quickjs-ng',version:'0.11.0',standardLibraryModulesInstalled:false});
 await verifyPortableApplicationInputs(receipt);
 const staleRuntime={...receipt.fullSDKKestrelEngineSources,'sample/native-headless/runtime.js':{sha256:'0'.repeat(64)}};
 await expect(verifyPortableApplicationInputs({...receipt,fullSDKKestrelEngineSources:staleRuntime})).rejects.toThrow('native bridge runtime differs');
 const missingRuntime={...receipt.fullSDKKestrelEngineSources};delete missingRuntime['sample/native-headless/runtime.js'];
 await expect(verifyPortableApplicationInputs({...receipt,fullSDKKestrelEngineSources:missingRuntime})).rejects.toThrow('native bridge runtime differs');
 const entry='void 0;',changedEntry={...receipt.fullSDKKestrelEngineSources,'native-entry.ts':{kind:'exact-inline-entry',contents:entry,sha256:hash(Buffer.from(entry))}};
 await expect(verifyPortableApplicationInputs({...receipt,fullSDKKestrelEngineSources:changedEntry})).rejects.toThrow('inline application entry differs');
 const bytes=await readFile(artifact);expect(hash(bytes)).toBe(receipt.artifact.sha256);expect(receipt.sourceBundleSize).toBeGreaterThan(100000);
 const stored=new Map(),a=await open(stored,()=>false,true);
 try{
  expect(await a.bridge.request({type:'state.read',path:'values/crew'})).toBe(6);
  a.bridge.send({type:'advance',pace:'day',realElapsedMs:1800000});await a.bridge.requestSave('interval');
  expect(await a.bridge.request({type:'quit',reason:'leaving'})).toMatchObject({saved:true});expect(a.saves).toEqual(['interval','leaving']);expect(a.refused()).toBe(0);expect(a.pongs()).toBeGreaterThan(0);
 }finally{await a.close();}
 const exact=[...stored].map(([path,data])=>[path,data.toString('base64')]),b=await open(stored,()=>false,true);
 try{expect(await b.bridge.request({type:'quit',reason:'handoff'})).toMatchObject({saved:true});expect([...stored].map(([path,data])=>[path,data.toString('base64')])).toEqual(exact);expect(b.refused()).toBe(0);}finally{await b.close();}
},15000);
it.skipIf(!supported)('MR3.4 portable native sample keeps a refused final save unacknowledged and preserves the live actual core for deliberate retry',async()=>{
 let failed=true;const a=await open(new Map(),()=>failed);
 try{
  await expect(a.bridge.request({type:'quit',reason:'leaving'})).rejects.toThrow('fixture exact save refusal');await new Promise(resolve=>setTimeout(resolve,80));
  expect(a.saves).toEqual(['leaving']);expect(await a.bridge.request({type:'state.read',path:'values/crew'})).toBe(6);failed=false;
  expect(await a.bridge.request({type:'quit',reason:'leaving'})).toMatchObject({saved:true});expect(a.saves).toEqual(['leaving','leaving']);
 }finally{await a.close();}
},10000);
it.skipIf(!supported)('MR3.4 portable native sample refuses foreign or malformed launcher authorities without exposing the credential',async()=>{
 for(const url of['ws://remote.example:8888/','ws://127.0.0.1/','ws://127.0.0.1:0/','ws://127.0.0.1:65536/','ws://127.0.0.1:88/?redirect=x','ws://user@127.0.0.1:88/','wss://127.0.0.1:88/','ws://127.0.0.1:88/\r\nX-Injected: x']){
  const child=spawn(artifact,[],{cwd:root,env:{EW_SDK_URL:url,EW_SDK_TOKEN:'private-fixture-never-log'},stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',x=>error+=x);
  const[code]=await once(child,'exit');expect(code).toBe(1);expect(error).not.toContain('private-fixture-never-log');expect(error).not.toContain(url);
 }
},10000);
it.skipIf(!supported)('MR3.4 portable native sample refuses redirects and a wrong WebSocket challenge before sending its actual SDK credential',async()=>{
 for(const response of['HTTP/1.1 302 Found\r\nLocation: http://remote.example/\r\nContent-Length: 0\r\n\r\n','HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: invalid-challenge\r\n\r\n']){
  let header='',afterHeader=Buffer.alloc(0),answered=false;const sockets=new Set();
  const server=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('data',chunk=>{if(answered){afterHeader=Buffer.concat([afterHeader,chunk]);return;}header+=chunk.toString('latin1');const end=header.indexOf('\r\n\r\n');if(end>=0){afterHeader=Buffer.from(header.slice(end+4),'latin1');answered=true;socket.write(response);}});});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const child=spawn(artifact,[],{cwd:root,env:{EW_SDK_URL:`ws://127.0.0.1:${server.address().port}/`,EW_SDK_TOKEN:'private-fixture-never-log'},stdio:['ignore','ignore','pipe']});let error='',timedOut=false;child.stderr.on('data',chunk=>error+=chunk);
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},6000);
  try{const[code]=await once(child,'exit');expect(timedOut).toBe(false);expect(code).toBe(1);expect(answered).toBe(true);expect(header).not.toContain('private-fixture-never-log');expect(afterHeader.length).toBe(0);expect(error).not.toContain('private-fixture-never-log');}
  finally{clearTimeout(timer);for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
 }
},15000);

