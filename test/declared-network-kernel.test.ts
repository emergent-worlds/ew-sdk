/** Real target-only kernel controls. No account, provider or signing qualification is inferred. */
import {expect,test} from 'vitest';
import {createHash,randomBytes} from 'node:crypto';
import {createServer,type Server,type Socket} from 'node:net';
import {networkInterfaces,tmpdir} from 'node:os';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolveDeclaredNetwork} from '../check/declared-network.js';
import type {CheckLaunchIsolation} from '../check/runner.js';
const exec=promisify(execFile);
async function listen(server:Server,host:string){await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,host,resolve);});const address=server.address();if(!address||typeof address==='string')throw Error('The owned canary endpoint is absent.');return address.port;}
async function targetKernel(platform:'linux'|'darwin'|'win32'){
 expect(process.platform).toBe(platform);if(platform!=='darwin')expect(process.arch).toBe('x64');
 // The user-mode Linux transport cannot expose the host loopback. Use only this worker's real interface.
 const address=platform==='linux'?Object.values(networkInterfaces()).flatMap(rows=>rows??[]).find(row=>row.family==='IPv4'&&!row.internal)?.address:'127.0.0.1';if(!address)throw Error('The actual worker has no owned IPv4 test interface.');
 const directory=await mkdtemp(join(tmpdir(),'ew-declared-canary-')),root=join(directory,'artifact');
 const sockets=new Set<Socket>(),nonce=randomBytes(16).toString('hex');let accepted=0,forbidden=0;
 const allowed=createServer(socket=>{sockets.add(socket);socket.on('error',()=>{});let input='';socket.on('data',chunk=>{input+=chunk.toString('ascii');if(input.length>128)socket.destroy();if(input===nonce){accepted++;socket.end('ok');}});});
 const denied=createServer(socket=>{forbidden++;socket.destroy();});
 let observedResolve!:(value:string)=>void,observedReject!:(error:Error)=>void;const observed=new Promise<string>((resolve,reject)=>{observedResolve=resolve;observedReject=reject;});void observed.catch(()=>{});
 const sdk=createServer(socket=>{sockets.add(socket);socket.on('error',observedReject);let text='';socket.on('data',chunk=>{text+=chunk.toString('ascii');if(text.length>512){observedReject(Error('The controlled frame exceeds its bound.'));socket.destroy();}const end=text.indexOf('\n');if(end>=0)observedResolve(text.slice(0,end));});});
 let launched:Awaited<ReturnType<CheckLaunchIsolation['launch']>>|undefined,cleanupConfirmed=true;
 try{
  await mkdir(root);
 const allowedPort=await listen(allowed,address),deniedPort=await listen(denied,address),sdkPort=await listen(sdk,'127.0.0.1');
 const network=await resolveDeclaredNetwork([`${address}:${allowedPort}`],[]);
  const windows=platform==='win32',entry=join(root,windows?'probe.exe':'probe'),input=join(directory,windows?'probe.cpp':'probe.c');
  const system=windows?'#define WIN32_LEAN_AND_MEAN\n#define _WIN32_WINNT 0x0A00\n#include <winsock2.h>\n#include <windows.h>\n#include <ws2tcpip.h>\n#define FD SOCKET\n#define CLOSE closesocket\n#define WAIT() Sleep(INFINITE)\n':'#include <unistd.h>\n#include <sys/socket.h>\n#include <arpa/inet.h>\n#include <sys/time.h>\n#define FD int\n#define CLOSE close\n#define WAIT() sleep(600)\n';
  const wireFrame=JSON.stringify({declaredConnected:true,undeclaredPortDenied:true})+'\n';
  const source=system+`#include <stdio.h>
#include <string.h>
FD tcp(const char*host,int port){FD fd=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);struct sockaddr_in to={0};to.sin_family=AF_INET;to.sin_port=htons(port);inet_pton(AF_INET,host,&to.sin_addr);${windows?'DWORD timeout=2000;setsockopt(fd,SOL_SOCKET,SO_SNDTIMEO,(const char*)&timeout,sizeof(timeout));':'struct timeval timeout={2,0};setsockopt(fd,SOL_SOCKET,SO_SNDTIMEO,&timeout,sizeof(timeout));'}if(connect(fd,(struct sockaddr*)&to,sizeof(to))!=0){CLOSE(fd);return (FD)-1;}return fd;}
int main(){${windows?'WSADATA data;if(WSAStartup(MAKEWORD(2,2),&data)!=0)return 1;':''}FD yes=tcp(${JSON.stringify(address)},${allowedPort});if(yes==(FD)-1)return 2;const char*token=${JSON.stringify(nonce)};if(send(yes,token,(int)strlen(token),0)!=(int)strlen(token))return 3;char reply[2];int used=0;while(used<2){int got=recv(yes,reply+used,2-used,0);if(got<=0)return 4;used+=got;}if(memcmp(reply,"ok",2)!=0)return 4;CLOSE(yes);FD no=tcp(${JSON.stringify(address)},${deniedPort});if(no!=(FD)-1){CLOSE(no);return 5;}FD channel=tcp("127.0.0.1",${sdkPort});if(channel==(FD)-1)return 6;const char*frame=${JSON.stringify(wireFrame)};if(send(channel,frame,(int)strlen(frame),0)!=(int)strlen(frame))return 7;WAIT();return 0;}
`;
  await writeFile(input,source);
  await exec(windows?'cl.exe':'/usr/bin/cc',windows?['/nologo','/utf-8','/std:c++20','/EHsc','/MT',input,'/Fe'+entry,'/link','/MACHINE:X64','Ws2_32.lib']:[input,'-o',entry],{cwd:directory,timeout:windows?120000:10000,maxBuffer:1024*1024,...(windows?{env:{...process.env,CL:undefined,_CL_:undefined,LINK:undefined,_LINK_:undefined}}:{})});
  if(!windows)await chmod(entry,0o700);const bytes=await readFile(entry),immutableEntry={sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length};
  const modulePath=resolve(`dist/check/${platform==='darwin'?'macos':platform==='win32'?'windows':'linux'}-isolation.js`),moduleBytes=await readFile(modulePath),compiledModuleSHA256=createHash('sha256').update(moduleBytes).digest('hex');
  const module=await import(pathToFileURL(modulePath).href) as {createLinuxDeclaredCheckIsolation?:()=>Promise<CheckLaunchIsolation>;createMacosDeclaredCheckIsolation?:()=>Promise<CheckLaunchIsolation>;createWindowsCheckIsolation?:()=>Promise<CheckLaunchIsolation>};
  const factory=platform==='linux'?module.createLinuxDeclaredCheckIsolation:platform==='darwin'?module.createMacosDeclaredCheckIsolation:module.createWindowsCheckIsolation;if(!factory)throw Error('The genuine normally compiled target adapter is absent.');
  const isolation=await factory();cleanupConfirmed=false;launched=await isolation.launch({root,entry,sdkUrl:`ws://127.0.0.1:${sdkPort}/`,sdkToken:'controlled-kernel-canary-only',immutableEntry,network});
  let timer:ReturnType<typeof setTimeout>|undefined;let frame:string;try{frame=await Promise.race([observed,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('The actual declared-network canary did not report its result.')),10000);})]);}finally{clearTimeout(timer);}
  expect(JSON.parse(frame)).toEqual({declaredConnected:true,undeclaredPortDenied:true});expect(accepted).toBe(1);expect(forbidden).toBe(0);console.log(JSON.stringify({mr34DeclaredKernel:{platform,arch:process.arch,canarySourceSHA256:createHash('sha256').update(source).digest('hex'),actualArtifactSHA256:immutableEntry.sha256,actualArtifactBytes:immutableEntry.size,networkPolicySHA256:network.digest,compiledModuleSHA256,compiledModuleBytes:moduleBytes.length,ordinaryCompiledModule:true,accountOrSigningProof:false}}));expect(launched.declaredNetworkEvidence?.policySHA256).toBe(network.digest);await launched.verify?.();launched.assertHealthy?.();
  const exited=new Promise<void>((resolve,reject)=>{if(launched!.child.exitCode!==null||launched!.child.signalCode!==null)resolve();else{launched!.child.once('exit',()=>resolve());launched!.child.once('error',reject);}});if(launched.stop)await launched.stop('SIGTERM');else launched.child.kill('SIGTERM');let stopped:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([exited,new Promise<never>((_,reject)=>{stopped=setTimeout(()=>reject(Error('The owned target did not stop.')),5000);})]);}finally{clearTimeout(stopped);}
  await launched.dispose();launched.assertHealthy?.();expect(createHash('sha256').update(await readFile(modulePath)).digest('hex')).toBe(compiledModuleSHA256);cleanupConfirmed=true;
 }finally{
  if(launched&&!cleanupConfirmed){try{if(launched.stop)await launched.stop('SIGKILL');else launched.child.kill('SIGKILL');await launched.dispose();cleanupConfirmed=true;}catch{/* Retain owned private evidence if drain is unconfirmed. */}}
  for(const socket of sockets)socket.destroy();await Promise.all([sdk,allowed,denied].filter(server=>server.listening).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))));
  if(cleanupConfirmed)await rm(directory,{recursive:true});else throw Error('The actual declared-network canary owned cleanup is unconfirmed; fixture retained.');
 }
}
test('MR3.4 enforces actual Linux declared TCP permission and owned transport retirement',()=>targetKernel('linux'),45000);
test('MR3.4 enforces actual macOS native-ABI declared TCP permission and private profile cleanup',()=>targetKernel('darwin'),45000);
test('MR3.4 enforces actual Windows declared TCP permission without overriding existing firewall or loopback policy',()=>targetKernel('win32'),180000);
