import {assertDeclaredNetwork} from './declared-network.js';
/** Current Windows x64 confinement. Existing authority only; no elevation or settings fallback. */
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,realpath,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {CheckLaunchIsolation,CheckPlan,CheckServices} from './runner.js';
import {parseWindowsHelperFrame,bindWindowsSubject,bindWindowsNetworkPolicy,windowsCleanupQualified,windowsCleanupConfirmed,WindowsIsolationError,type WindowsReady,type WindowsFinished,type WindowsIsolationEvidence} from './windows-subject.js';
// Normal matching-Windows build replaces this one source sentinel with the actual compiled helper hash.
const HELPER_SHA256='__EW_CHECK_HELPER_SHA256__';
const PROTOCOL_BYTES=4*1024*1024,SETUP_MS=5000;
async function deadline<T>(promise:Promise<T>,milliseconds:number):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Windows native control deadline refused.')),milliseconds);})]);}finally{clearTimeout(timer);}}
async function helperHash(path:string,size:number){let read=0;const hash=createHash('sha256');for await(const bytes of createReadStream(path,{highWaterMark:16384})){read+=bytes.length;if(read>size)throw Error('Trusted Windows helper changed.');hash.update(bytes);}if(read!==size)throw Error('Trusted Windows helper changed.');return hash.digest('hex');}
class NativeControl{
 private sequence=0;private bytes=0;private pending='';private fault=false;private readySeen=false;private final?:WindowsFinished;
 private waiters=new Map<number,{kind:'verified'|'stopped';resolve():void;reject(error:Error):void}>();
 private resolveReady!:(ready:WindowsReady)=>void;private rejectReady!:(error:Error)=>void;private resolveFinished!:(finished:WindowsFinished)=>void;private rejectFinished!:(error:Error)=>void;
 readonly ready=new Promise<WindowsReady>((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});
 readonly finished=new Promise<WindowsFinished>((resolve,reject)=>{this.resolveFinished=resolve;this.rejectFinished=reject;});
 constructor(private readonly child:ChildProcessWithoutNullStreams){
  void this.ready.catch(()=>{});void this.finished.catch(()=>{});
  child.stdout.on('data',(bytes:Buffer)=>this.receive(bytes));child.stdout.on('error',()=>this.refuse());child.stdout.on('end',()=>{if(this.pending.length||!this.final)this.refuse();});child.on('error',()=>this.refuse());child.on('close',()=>{if(!this.final)this.refuse();});
 }
 private refuse(){if(this.fault)return;this.fault=true;const error=Error('Trusted Windows native protocol refused.');this.rejectReady(error);this.rejectFinished(error);for(const waiter of this.waiters.values())waiter.reject(error);this.waiters.clear();}
 private receive(bytes:Buffer){
  if(this.fault)return;this.bytes+=bytes.length;if(this.bytes>PROTOCOL_BYTES){this.refuse();return;}this.pending+=bytes.toString('utf8');
  try{let end:number;while((end=this.pending.indexOf('\n'))>=0){const line=this.pending.slice(0,end);this.pending=this.pending.slice(end+1);if(line.length>4096||this.final)throw Error();const value=parseWindowsHelperFrame(line);
   if(value.kind==='ready'){if(this.readySeen)throw Error();this.readySeen=true;this.resolveReady(value);}
   else if(value.kind==='finished'){if(value.ready!==this.readySeen)throw Error();this.final=value;this.resolveFinished(value);if(!this.readySeen)this.rejectReady(Error('Windows isolation refused before its actual artifact bound.'));for(const waiter of this.waiters.values())waiter.reject(Error('The Windows artifact has exited.'));this.waiters.clear();}
   else{const waiter=this.waiters.get(value.id);if(!waiter||waiter.kind!==value.kind)throw Error();this.waiters.delete(value.id);waiter.resolve();}
  }}catch{this.refuse();}
 }
 snapshot(){return this.final;}
 assertHealthy(){if(this.fault||this.final&&!windowsCleanupQualified(this.final))throw Error('The Windows isolation did not qualify.');}
 async request(kind:'verify'|'stop'){
  this.assertHealthy();if(this.final){if(kind==='stop'&&windowsCleanupQualified(this.final))return;throw Error('The actual Windows artifact is no longer current.');}
  if(this.waiters.size>=64||this.sequence>=0xffffffff)throw Error('Windows native control capacity refused.');const id=++this.sequence;
  const pending=new Promise<void>((resolve,reject)=>{this.waiters.set(id,{kind:kind==='verify'?'verified':'stopped',resolve,reject});this.child.stdin.write(`${kind} ${id}\n`,error=>{if(error)this.refuse();});});
  try{await deadline(pending,2000);}catch(error){this.refuse();throw error;}
 }
}
export async function createWindowsCheckIsolation():Promise<CheckLaunchIsolation>{
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('The actual Windows x64 worker is required.');
 if(!/^[a-f0-9]{64}$/.test(HELPER_SHA256))throw Error('The matching Windows native helper has not been normally built.');
 const helper=join(dirname(fileURLToPath(import.meta.url)),'windows-isolation-native.exe'),info=await lstat(helper);
 if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>32*1024*1024||await helperHash(helper,info.size)!==HELPER_SHA256)throw Error('The trusted Windows helper differs from its normal build.');
 return{async launch(input){
  input.signal?.throwIfAborted();const network=input.network;if(network)assertDeclaredNetwork(network);const root=await realpath(input.root),entry=await realpath(input.entry),path=relative(root,entry),immutable=input.immutableEntry;
  if(!path||path==='..'||path.startsWith('..\\')||isAbsolute(path)||!immutable||!Number.isSafeInteger(immutable.size)||immutable.size<64||!/^[a-f0-9]{64}$/.test(immutable.sha256))throw Error('The Windows executable must bind its actual immutable tree.');
  const url=new URL(input.sdkUrl);if(url.protocol!=='ws:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw Error('One original SDK endpoint is required.');
  const scratch=await realpath(await mkdtemp(join(tmpdir(),'ew-windows-check-'))),scratchIdentity=await lstat(scratch,{bigint:true});
  const environment:NodeJS.ProcessEnv={EW_SDK_TOKEN:input.sdkToken};for(const key of['SYSTEMROOT','WINDIR'])if(process.env[key])environment[key]=process.env[key];
  const child=spawn(helper,[root,entry,scratch,url.port,immutable.sha256,String(immutable.size),...(network?[network.endpointsText]:[])],{cwd:dirname(helper),env:environment,stdio:['pipe','pipe','pipe'],windowsHide:true});const control=new NativeControl(child);child.stderr.resume();
  let evidence:WindowsIsolationEvidence|undefined,disposed=false;const exit=new Promise<void>(resolve=>{if(child.exitCode!==null||child.signalCode!==null)resolve();else child.once('exit',()=>resolve());});
  const dispose=async()=>{if(disposed)return;const finished=await deadline(control.finished,SETUP_MS);await deadline(exit,SETUP_MS);if(!windowsCleanupConfirmed(finished))throw Error('Owned Windows cleanup is unconfirmed; scratch retained.');const current=await lstat(scratch,{bigint:true});if(!current.isDirectory()||current.isSymbolicLink()||current.dev!==scratchIdentity.dev||current.ino!==scratchIdentity.ino)throw Error('The owned Windows scratch changed; retained.');await rm(scratch,{recursive:true});disposed=true;if(evidence)Object.assign(evidence,{jobEmpty:finished.jobEmpty,filtersRetired:finished.filtersRetired,profileDeleted:finished.profileDeleted,loopbackUnchanged:finished.loopbackUnchanged,cleaned:finished.cleaned,...(finished.failure?{nativeFailure:finished.failure}:{})});};
  try{
   const ready=await deadline(control.ready,SETUP_MS);input.signal?.throwIfAborted();bindWindowsNetworkPolicy(ready,network);const subject=bindWindowsSubject(ready,immutable);await control.request('verify');
   evidence={adapter:network?'windows-appcontainer-declared-tcp-v1':'windows-appcontainer-sdk-only-v1',platform:'win32',arch:'x64',helperSHA256:HELPER_SHA256,profileHash:ready.profileHash,policyInstalledBeforeResume:true,jobEmpty:false,filtersRetired:false,profileDeleted:false,loopbackUnchanged:false,cleaned:false};
   return{child,subject,isolationEvidence:evidence,...(network?{declaredNetworkEvidence:{policySHA256:network.digest,kernelPolicySHA256:ready.networkSHA256}}:{}),verify:()=>control.request('verify'),assertHealthy:()=>control.assertHealthy(),stop:async()=>{await control.request('stop');},dispose};
  }catch{
   // Only this already-owned trusted helper is stopped. Its Job closes with it;
   // an unconfirmed profile/filter retirement can never qualify the check.
   child.stdin.destroy();const cleanupFailures:('OWNED_CLEANUP_UNCONFIRMED'|'OWNED_SCRATCH_RETAINED')[]=[];
   try{await dispose();}catch{cleanupFailures.push('OWNED_CLEANUP_UNCONFIRMED','OWNED_SCRATCH_RETAINED');child.kill('SIGKILL');try{await deadline(exit,SETUP_MS);}catch{/* Keep the explicit unconfirmed cleanup evidence. */}}
   const finished=control.snapshot();
   throw new WindowsIsolationError({adapter:network?'windows-appcontainer-declared-tcp-v1':'windows-appcontainer-sdk-only-v1',phase:evidence?'binding':'setup',
    primary:finished?.failure??'NATIVE_PROTOCOL_UNCONFIRMED',ownedResourcesRetired:finished?windowsCleanupConfirmed(finished):false,
    loopbackUnchanged:finished?.loopbackUnchanged??false,controlRetained:!disposed,cleanupFailures});
  }
 }};
}
export async function createIsolatedCheckExecutor(input:{platform:string;arch:string;target:string;signal:AbortSignal}){
 if(input.platform!==process.platform||input.arch!==process.arch||!['windows-x64','server'].includes(input.target))throw Error('The Windows executor does not match its actual worker.');input.signal.throwIfAborted();const isolation=await createWindowsCheckIsolation();
 return{protocol:'ew.isolated-build-check.v1' as const,platform:process.platform,arch:process.arch,target:input.target,execute:async(plan:CheckPlan,services:CheckServices,signal:AbortSignal)=>{if(plan.target!==input.target)throw Error('The Windows claim target differs.');const{runBuildCheck}=await import('./runner.js');return runBuildCheck(plan,services,AbortSignal.any([signal,input.signal]),isolation);},close:async()=>{}};
}
