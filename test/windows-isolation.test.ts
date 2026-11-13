/** Actual Windows kernel canary only. Requires the real normal helper build and existing worker rights. */
import {expect,test} from 'vitest';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {CheckLaunchIsolation} from '../check/runner.js';
import type {WindowsIsolationEvidence} from '../check/windows-subject.js';

test('MR3.4 confines an actual Windows artifact and descendant to its owned SDK endpoint and retires its real Job and profile',async()=>{
 expect(process.platform).toBe('win32');expect(process.arch).toBe('x64');
 const directory=await mkdtemp(join(tmpdir(),'ew-windows-kernel-canary-')),root=join(directory,'artifact');await mkdir(root);
 const host=join(directory,'host-only.txt');await writeFile(host,'Salt Harbor host-only original');
 const outside=createServer();let outsideConnections=0;outside.on('connection',socket=>{outsideConnections++;socket.destroy();});outside.listen(0,'127.0.0.1');await once(outside,'listening');
 const rejectedAddress=outside.address();if(!rejectedAddress||typeof rejectedAddress==='string')throw Error('The ordinary host-only canary port is unavailable.');
 const sdk=createServer();sdk.listen(0,'127.0.0.1');await once(sdk,'listening');const sdkAddress=sdk.address();if(!sdkAddress||typeof sdkAddress==='string')throw Error('The ordinary SDK canary port is unavailable.');
 const sockets=new Set<import('node:net').Socket>();
 const observed=new Promise<string>((resolve,reject)=>{sdk.once('connection',socket=>{sockets.add(socket);let body='';socket.on('data',chunk=>{body+=chunk.toString('utf8');if(body.length>4096)reject(Error('The canary frame is oversized.'));const end=body.indexOf('\n');if(end>=0)resolve(body.slice(0,end));});socket.on('error',reject);});});
 const source=`#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <windows.h>
#include <string>
#include <cstdio>
int wmain(int argc,wchar_t** argv){
 if(argc==2&&std::wstring(argv[1])==L"--child"){Sleep(INFINITE);return 0;}
 wchar_t scratch[32768]{};if(!GetEnvironmentVariableW(L"TEMP",scratch,32768))return 2;
 HANDLE writable=CreateFileW((std::wstring(scratch)+L"\\\\canary.txt").c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);bool scratchOK=writable!=INVALID_HANDLE_VALUE;if(scratchOK)CloseHandle(writable);
 HANDLE denied=CreateFileW(L${JSON.stringify(host)},GENERIC_WRITE,0,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);bool hostDenied=denied==INVALID_HANDLE_VALUE;if(!hostDenied){DWORD n=0;WriteFile(denied,"unexpected",10,&n,nullptr);CloseHandle(denied);}
 WSADATA startup{};if(WSAStartup(MAKEWORD(2,2),&startup)!=0)return 3;
 sockaddr_in target{};target.sin_family=AF_INET;target.sin_addr.s_addr=htonl(INADDR_LOOPBACK);target.sin_port=htons(${rejectedAddress.port});SOCKET other=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);bool outsideDenied=connect(other,reinterpret_cast<sockaddr*>(&target),sizeof(target))!=0;closesocket(other);
 wchar_t self[32768]{};GetModuleFileNameW(nullptr,self,32768);std::wstring command=L"\\\""+std::wstring(self)+L"\\\" --child";STARTUPINFOW start{};start.cb=sizeof(start);PROCESS_INFORMATION child{};bool started=CreateProcessW(self,command.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW,nullptr,nullptr,&start,&child)!=0;if(started){CloseHandle(child.hThread);CloseHandle(child.hProcess);}
 SOCKET channel=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);target.sin_port=htons(${sdkAddress.port});if(connect(channel,reinterpret_cast<sockaddr*>(&target),sizeof(target))!=0)return 4;
 char frame[256]{};int n=std::snprintf(frame,sizeof(frame),"{\\\"hostDenied\\\":%s,\\\"outsideDenied\\\":%s,\\\"scratchOK\\\":%s,\\\"descendantStarted\\\":%s}\\n",hostDenied?"true":"false",outsideDenied?"true":"false",scratchOK?"true":"false",started?"true":"false");if(n<=0||send(channel,frame,n,0)!=n)return 5;Sleep(INFINITE);return 0;
}`;
 let launched:Awaited<ReturnType<CheckLaunchIsolation['launch']>>|undefined;
 try{
  const input=join(directory,'canary.cpp'),entry=join(root,'canary.exe');await writeFile(input,source);
  const built=spawnSync('cl.exe',['/nologo','/utf-8','/std:c++20','/EHsc','/MT',input,'/Fe'+entry,'/link','/MACHINE:X64','Ws2_32.lib'],{cwd:directory,timeout:120000,encoding:'utf8',maxBuffer:1024*1024,windowsHide:true});
  expect(built.status).toBe(0);const bytes=await readFile(entry);
  // Actual compiled bundle, never the unbuilt source sentinel or an uploaded module.
  const module=await import(pathToFileURL(resolve('dist/check/windows-isolation.js')).href) as {createWindowsCheckIsolation():Promise<CheckLaunchIsolation>};
  const isolation=await module.createWindowsCheckIsolation();
  launched=await isolation.launch({entry,root,sdkUrl:`ws://127.0.0.1:${sdkAddress.port}/`,sdkToken:'controlled-kernel-canary-only',immutableEntry:{sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length}});
  let timer:ReturnType<typeof setTimeout>|undefined;let observedText:string;
  try{observedText=await Promise.race([observed,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('The actual Windows canary did not reach its SDK endpoint.')),10000);})]);}finally{clearTimeout(timer);}
  const frame=JSON.parse(observedText) as Record<string,unknown>;
  expect(frame).toEqual({hostDenied:true,outsideDenied:true,scratchOK:true,descendantStarted:true});expect(outsideConnections).toBe(0);
  expect(await readFile(host,'utf8')).toBe('Salt Harbor host-only original');
  expect(launched.subject?.kind).toBe('windows-held-process-v1');await launched.verify?.();
  await launched.stop?.('SIGTERM');await launched.dispose();
  const evidence=launched.isolationEvidence;if(evidence?.adapter!=='windows-appcontainer-sdk-only-v1')throw Error('The actual Windows isolation evidence is absent.');
  const actual:WindowsIsolationEvidence=evidence;expect(actual).toMatchObject({jobEmpty:true,filtersRetired:true,profileDeleted:true,loopbackUnchanged:true,cleaned:true});
 }finally{
  let cleanupConfirmed=!launched;
  if(launched){try{await launched.stop?.('SIGKILL');await launched.dispose();cleanupConfirmed=true;}catch{/* Preserve the private fixture if its owned cleanup is unconfirmed. */}}
  for(const socket of sockets)socket.destroy();await Promise.all([new Promise<void>(resolve=>sdk.close(()=>resolve())),new Promise<void>(resolve=>outside.close(()=>resolve()))]);
  if(cleanupConfirmed)await rm(directory,{recursive:true,force:true});else throw Error('The Windows canary owned cleanup is unconfirmed; its private fixture is retained.');
 }
},180000);
