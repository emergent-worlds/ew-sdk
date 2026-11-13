/** Linux SDK-only check adapter. Missing kernel/runtime prerequisites refuse before uploaded code. */
import {spawn,execFile, type ChildProcess} from 'node:child_process';
import {createServer, connect, type Socket} from 'node:net';
import {lstat, stat, realpath, mkdtemp, chmod, rm, readFile, open} from 'node:fs/promises';
import {promisify} from 'node:util';
import {CheckIsolationError,CheckRelayLatch,CheckRelayStatus} from './launch-admission.js';
import {createHash} from 'node:crypto';
import {tmpdir,release} from 'node:os';
import {createReadStream} from 'node:fs';
import {join,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import type {CheckLaunchIsolation,CheckPlan,CheckServices} from './runner.js';
import {bindLinuxArtifact,linuxDescendants,linuxProcessIdentity,requireLinuxELF,sameLinuxProcess,type LinuxProcessIdentity,type LinuxArtifactSubject,type LinuxIsolationEvidence} from './linux-subject.js';

import {fixedSDK,linuxCheckArguments} from './linux-policy.js';
import {drainOwnedLinuxFamily,rememberOwnedLinux} from './linux-owned.js';

const BWRAP='/usr/bin/bwrap',PYTHON='/usr/bin/python3';
// This is trusted deployment source, never a manifest path or creator-supplied program.
const RELAY_SHA256='b867190c64f606297004e3e460f61b5bb6c05d395fb3aeec4b99b8734d6e6705';
const PIDFD_SHA256='1bf3a06fb37c08d64877e49f8adab2742910c44649c2f9c02e88dddc2ed24518';
const exec=promisify(execFile);
const SETUP_MS=5000;

async function trustedHash(path:string):Promise<string>{const s=await lstat(path);if(s.size>32*1024*1024)throw Error('Trusted tool byte bound');const h=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(path,{highWaterMark:16384})){bytes+=chunk.length;if(bytes>s.size)throw Error('Trusted tool changed');h.update(chunk);}if(bytes!==s.size)throw Error('Trusted tool changed');return h.digest('hex');}
async function systemFile(path:string):Promise<string>{
 const actual=await realpath(path),s=await lstat(actual);
 if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||(s.mode&0o022)!==0)throw Error('Trusted system executable is unavailable');return actual;
}
async function stillPresent(identity:LinuxProcessIdentity):Promise<boolean>{
 try{if(!sameLinuxProcess(identity,await linuxProcessIdentity(identity.pid)))throw Error('Owned PID identity changed');return true;}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'||(error as NodeJS.ErrnoException).code==='ESRCH')return false;throw error;}
}
async function namespaceInit(identities:LinuxProcessIdentity[],hostNamespace:string):Promise<LinuxProcessIdentity|undefined>{
 const candidates:LinuxProcessIdentity[]=[];
 for(const item of identities){if(item.namespace===hostNamespace)continue;const status=await readFile(`/proc/${item.pid}/status`,'utf8');const ids=status.match(/^NSpid:\s+([\d\s]+)$/m)?.[1]?.trim().split(/\s+/);
  if(ids?.at(-1)==='1'&&sameLinuxProcess(item,await linuxProcessIdentity(item.pid)))candidates.push(item);}
 if(candidates.length>1)throw Error('Ambiguous owned PID namespace');return candidates[0];
}
export async function createLinuxCheckIsolation():Promise<CheckLaunchIsolation>{
 if(process.platform!=='linux'||process.arch!=='x64')throw Error('This executor requires an actual Linux x64 worker');
 const bwrap=await systemFile(BWRAP),python=await systemFile(PYTHON);const bwrapSHA256=await trustedHash(bwrap),pythonSHA256=await trustedHash(python);
 const relay=join(dirname(fileURLToPath(import.meta.url)),'linux-relay.py'),pidfd=join(dirname(fileURLToPath(import.meta.url)),'linux-pidfd.py'),relayInfo=await lstat(relay);
 if(!relayInfo.isFile()||relayInfo.isSymbolicLink()||relayInfo.nlink!==1||relayInfo.size>8192||createHash('sha256').update(await readFile(relay)).digest('hex')!==RELAY_SHA256)throw Error('Trusted relay deployment hash differs');
 const pidfdInfo=await lstat(pidfd);if(!pidfdInfo.isFile()||pidfdInfo.isSymbolicLink()||pidfdInfo.nlink!==1||pidfdInfo.size>8192||createHash('sha256').update(await readFile(pidfd)).digest('hex')!==PIDFD_SHA256)throw Error('Trusted pidfd helper differs');
 const capability=await exec(python,['-I','-B',pidfd,'capability'],{env:{},timeout:2000,maxBuffer:4096});if(JSON.parse(capability.stdout).status!=='PIDFD_AVAILABLE')throw Error('PIDFD unavailable');
 const signalOwned=async(identity:LinuxProcessIdentity,signal:'SIGTERM'|'SIGKILL')=>{const expected={pid:identity.pid,startTicks:identity.startTicks,namespace:identity.namespace};const reply=await exec(python,['-I','-B',pidfd,'signal',JSON.stringify(expected),signal==='SIGTERM'?'TERM':'KILL'],{env:{},timeout:2000,maxBuffer:4096});if(!['OWNED_SIGNAL_SENT','OWNED_ALREADY_EXITED'].includes(JSON.parse(reply.stdout).status))throw Error('PIDFD signal refused');};
 const libraries:{source:string;target:string}[]=[];
 for(const target of ['/lib','/lib64','/usr/lib']){try{const source=await realpath(target),s=await lstat(source);if(!s.isDirectory()||s.uid!==0||(s.mode&0o022)!==0)throw Error('Unsafe system runtime');libraries.push({source,target});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
 return {async launch(input){
  input.signal?.throwIfAborted();const root=await realpath(input.root),entry=await realpath(input.entry),path=relative(root,entry);
  const immutable=input.immutableEntry,s=await stat(entry,{bigint:true});
  if(!path||path.startsWith('../')||isAbsolute(path)||!immutable||!s.isFile()||s.size!==BigInt(immutable.size)||!/^[a-f0-9]{64}$/.test(immutable.sha256))throw Error('Immutable Linux executable binding required');
  const file=await open(entry,'r');try{const header=Buffer.alloc(20);const {bytesRead}=await file.read(header,0,20,0);requireLinuxELF(header.subarray(0,bytesRead));}finally{await file.close();}
  const port=fixedSDK(input.sdkUrl),control=await realpath(await mkdtemp(join(tmpdir(),'ew-linux-check-')));await chmod(control,0o700);const controlIdentity=await lstat(control,{bigint:true});
  let evidence:LinuxIsolationEvidence|undefined;const streams=new Set<Socket>();const latch=new CheckRelayLatch(()=>{for(const stream of streams)stream.destroy();if(evidence)evidence.relayFailure=latch.code();});
  const server=createServer(socket=>{try{latch.connection();}catch{socket.destroy();return;}const upstream=connect({host:'127.0.0.1',port});streams.add(socket);streams.add(upstream);
   const charge=(data:Buffer)=>{try{latch.transfer(data.length);}catch{socket.destroy();upstream.destroy();}};
   socket.on('data',charge);upstream.on('data',charge);socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());socket.on('close',()=>{streams.delete(socket);upstream.destroy();});upstream.on('close',()=>{streams.delete(upstream);socket.destroy();});socket.pipe(upstream);upstream.pipe(socket);
  });
  const status=new CheckRelayStatus(latch);let helperSettled=false;let helperStatus:Promise<void>|undefined;
  let phase='setup';let familyAbsent=false;
  let child:ChildProcess|undefined,wrapper:LinuxProcessIdentity|undefined,init:LinuxProcessIdentity|undefined,subject:LinuxArtifactSubject|undefined,disposed=false;
  const known=new Map<number,LinuxProcessIdentity>();
  const remember=async()=>{if(wrapper&&await stillPresent(wrapper)){for(const item of await linuxDescendants(wrapper))rememberOwnedLinux(known,item);}if(init&&await stillPresent(init)){for(const item of await linuxDescendants(init))rememberOwnedLinux(known,item);rememberOwnedLinux(known,init);}};
  const dispose=async()=>{
   if(disposed)return;let failure:unknown;
   try{
    if(child&&!wrapper)throw Error('Unbound Linux launcher identity; scratch retained');
    if(wrapper)await drainOwnedLinuxFamily({wrapper,init,known,
      discover:async()=>{await remember();return [...known.values()];},
      current:async pid=>{try{return await linuxProcessIdentity(pid);}catch(error){if(['ENOENT','ESRCH'].includes((error as NodeJS.ErrnoException).code??''))return null;throw error;}},
      signal:signalOwned,sleep:()=>delay(25),now:()=>performance.now()});
    if(child&&!init)throw Error('Namespace family unbound; scratch retained');familyAbsent=true;
   }catch(error){failure=error;}
   finally{for(const stream of streams)stream.destroy();if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));if(helperStatus){await Promise.race([helperStatus,delay(1000)]);try{status.finish(helperSettled);if(evidence)evidence.relayStatusSettled=true;}catch(error){failure??=error;}}}
   if(failure)throw failure;const currentControl=await lstat(control,{bigint:true});if(!currentControl.isDirectory()||currentControl.isSymbolicLink()||currentControl.dev!==controlIdentity.dev||currentControl.ino!==controlIdentity.ino||currentControl.uid!==controlIdentity.uid)throw Error('Owned Linux control root changed; retained');await rm(control,{recursive:true});disposed=true;
  };
  try{
   await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(join(control,'sdk.sock'),()=>resolve());});await chmod(join(control,'sdk.sock'),0o600);
   input.signal?.throwIfAborted();const args=linuxCheckArguments({root,entry,control,python,libraries,relay,pidfd,port,token:input.sdkToken});
   child=spawn(bwrap,args,{cwd:root,stdio:['ignore','pipe','ignore'],env:{},detached:true});child.on('error',()=>{});helperStatus=new Promise<void>(resolve=>{const output=child!.stdout;if(!output){latch.fail('helper_protocol');resolve();return;}output.on('data',(chunk:Buffer)=>status.push(chunk));output.once('error',()=>{latch.fail('helper_protocol');resolve();});output.once('end',()=>{helperSettled=true;resolve();});output.once('close',()=>{resolve();});});
   if(!child.pid)throw Error('Linux launcher did not obtain a PID');wrapper=await linuxProcessIdentity(child.pid);rememberOwnedLinux(known,wrapper);
   phase='binding';const deadline=performance.now()+SETUP_MS;
   while(performance.now()<deadline){latch.assertHealthy();input.signal?.throwIfAborted();await remember();init=await namespaceInit([...known.values()].filter(v=>v.pid!==wrapper!.pid),wrapper.namespace)??init;
    if(init){const candidates:LinuxArtifactSubject[]=[];for(const item of known.values()){if(item.pid===init.pid||item.namespace!==init.namespace)continue;
      const executable=await stat(`/proc/${item.pid}/exe`,{bigint:true}).catch(error=>{if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;});
      if(executable&&String(executable.dev)===String(s.dev)&&String(executable.ino)===String(s.ino))candidates.push(await bindLinuxArtifact(item.pid,{...immutable,device:String(s.dev),inode:String(s.ino),namespace:init.namespace}));}
     if(candidates.length>1)throw Error('Ambiguous Linux artifact processes');if(candidates.length===1){subject=candidates[0];break;}}
    await delay(25);
   }
   if(!subject||!init)throw Error('Actual Linux artifact PID/start identity was not established');
   evidence={adapter:'linux-bwrap-sdk-only-v1',platform:'linux',arch:'x64',kernel:release(),bwrapSHA256,pythonSHA256,relaySHA256:RELAY_SHA256,pidfdHelperSHA256:PIDFD_SHA256,wrapper,namespaceInit:init,subject,directNetworkAsksSupported:false,relayFailure:latch.code(),relayStatusSettled:false};return {child,subject,isolationEvidence:evidence,assertHealthy:()=>latch.assertHealthy(),stop:(signal:'SIGTERM'|'SIGKILL')=>signalOwned(wrapper!,signal),dispose};
  }catch(error){const cleanupFailures:string[]=[];try{await dispose();}catch{cleanupFailures.push('OWNED_FAMILY_OR_CONTROL_CLEANUP_UNCONFIRMED');}throw new CheckIsolationError({adapter:'linux-bwrap-sdk-only-v1',phase,primary:latch.code()?`SDK_RELAY_${latch.code()}`:input.signal?.aborted?'CANCELLED':error instanceof Error?error.name:'UNKNOWN_FAILURE',cleanupFailures,familyAbsent,controlRetained:!disposed});}
 }};
}
export async function createIsolatedCheckExecutor(input:{platform:string;arch:string;target:string;signal:AbortSignal}){
 if(input.platform!==process.platform||input.arch!==process.arch||!['linux-x64','server'].includes(input.target))throw Error('Linux executor and target differ');
 input.signal.throwIfAborted();const isolation=await createLinuxCheckIsolation();
 return {protocol:'ew.isolated-build-check.v1'as const,platform:process.platform,arch:process.arch,target:input.target,
  execute:async(plan:CheckPlan,services:CheckServices,signal:AbortSignal)=>{if(plan.target!==input.target)throw Error('Claimed Linux artifact differs');const selected=(plan.manifest as {asks?:{network?:unknown[]}})?.asks?.network?.length?await (await import('./linux-declared-isolation.js')).createLinuxDeclaredCheckIsolation():isolation;const {runBuildCheck}=await import('./runner.js');return runBuildCheck(plan,services,AbortSignal.any([signal,input.signal]),selected);},close:async()=>{}};
}

export {createLinuxDeclaredCheckIsolation} from './linux-declared-isolation.js';
