/** Per-job Seatbelt additions for the exact launch-time declared TCP address set. */
import {spawn} from 'node:child_process';
import {mkdtemp,realpath,rm,mkdir,lstat,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {macosCheckProfile,createMacosCheckIsolation} from './macos-isolation.js';
import {requireMacosWorker,requireMacosExecutable} from './macos-target.js';
import {assertDeclaredNetwork,type DeclaredNetworkPolicy} from './declared-network.js';
import type {CheckLaunchIsolation} from './runner.js';
export function macosDeclaredProfile(input:Parameters<typeof macosCheckProfile>[0],network:DeclaredNetworkPolicy){
 assertDeclaredNetwork(network);
 const endpoints=network.addresses.map(row=>`${row.family===6?'['+row.address+']':row.address}:${row.port??'*'}`);
 // System DNS can resolve a name, but cannot add a new permitted TCP address after capture.
 return macosCheckProfile(input)+'(allow mach-lookup (global-name "com.apple.mDNSResponder"))\n(allow file-read* (literal "/private/etc/hosts") (literal "/private/etc/resolv.conf"))\n'+endpoints.map(value=>`(allow network-outbound (remote tcp ${JSON.stringify(value)}))\n`).join('');
}
export async function createMacosDeclaredCheckIsolation():Promise<CheckLaunchIsolation>{
 const arch=requireMacosWorker(process.platform,process.arch);await createMacosCheckIsolation();
 return{async launch(input){
  input.signal?.throwIfAborted();const observedNetwork=input.network;if(!observedNetwork)throw Error('The actual captured network authority is unavailable.');const network=observedNetwork;assertDeclaredNetwork(network);
  const root=await realpath(input.root),entry=await realpath(input.entry),path=relative(root,entry);if(!path||path.startsWith('../')||isAbsolute(path)||!(await lstat(entry)).isFile())throw Error('The declared-network entry must be in its immutable tree.');
  const file=await open(entry,'r');try{const header=Buffer.alloc(8),{bytesRead}=await file.read(header,0,8,0);requireMacosExecutable(header.subarray(0,bytesRead),arch);}finally{await file.close();}
  const url=new URL(input.sdkUrl);if(url.protocol!=='ws:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw Error('The actual SDK endpoint differs.');
  const scratch=await realpath(await mkdtemp(join(tmpdir(),'ew-declared-check-'))),identity=await lstat(scratch,{bigint:true});
  try{await mkdir(join(scratch,'home'),{mode:0o700});await mkdir(join(scratch,'tmp'),{mode:0o700});
   const profile=macosDeclaredProfile({root,entry,scratch,port:Number(url.port)},network);input.signal?.throwIfAborted();
   const child=spawn('/usr/bin/sandbox-exec',['-p',profile,entry],{cwd:root,stdio:'ignore',env:{HOME:join(scratch,'home'),TMPDIR:join(scratch,'tmp')+'/',EW_SDK_URL:input.sdkUrl,EW_SDK_TOKEN:input.sdkToken,EW_SDK_CHECK:'1'}});
   let disposed=false;return{child,declaredNetworkEvidence:{policySHA256:network.digest,profileSHA256:createHash('sha256').update(profile).digest('hex')},dispose:async()=>{if(disposed)return;const current=await lstat(scratch,{bigint:true});if(!current.isDirectory()||current.isSymbolicLink()||current.dev!==identity.dev||current.ino!==identity.ino)throw Error('The owned Mac check scratch changed.');await rm(scratch,{recursive:true});disposed=true;}};
  }catch(error){const current=await lstat(scratch,{bigint:true});if(current.dev===identity.dev&&current.ino===identity.ino&&!current.isSymbolicLink())await rm(scratch,{recursive:true});throw error;}
 }};
}
