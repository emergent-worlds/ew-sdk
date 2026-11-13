import {test,expect} from 'vitest';
import {mkdtemp,writeFile,chmod,rm,realpath,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:net';
import {createMacosCheckIsolation,createIsolatedCheckExecutor} from '../check/macos-isolation.js';
const exec=promisify(execFile);

// This actual-kernel control refuses another worker rather than recording a skipped pass.
test('MR3.4 confines a genuine current Intel macOS executable to SDK and scratch while denying host files process inspection and foreign network',async()=>{
 expect(process.platform).toBe('darwin');expect(process.arch).toBe('x64');
 if(process.env.EW_CONFINEMENT_SYNTHETIC_SECRET!==undefined)throw Error('Synthetic canary environment collision');
 const base=await realpath(await mkdtemp(join(tmpdir(),'ew-confinement-proof-'))),root=join(base,'tree'),entry=join(root,'probe');
 const {mkdir}=await import('node:fs/promises');await mkdir(root);await writeFile(join(base,'private-canary'),'synthetic-canary');await writeFile(join(root,'immutable'),'unchanged');await symlink(join(base,'private-canary'),join(root,'escape'));
 const first=createServer(socket=>socket.end()),other=createServer(socket=>socket.end());
 await Promise.all([new Promise<void>(r=>first.listen(0,'127.0.0.1',r)),new Promise<void>(r=>other.listen(0,'127.0.0.1',r))]);
 const port=(first.address() as {port:number}).port,otherPort=(other.address() as {port:number}).port;
 const q=(v:string)=>JSON.stringify(v);let child:import('node:child_process').ChildProcess|undefined,dispose:(()=>Promise<void>)|undefined;
 try{
  const source=`#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <stdlib.h>
#include <stdio.h>
#include <signal.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <spawn.h>
#include <sys/sysctl.h>
int tcp(const char *ip,int port){int fd=socket(AF_INET,SOCK_STREAM,0);if(fd<0)return -2;struct sockaddr_in a={0};a.sin_family=AF_INET;a.sin_port=htons(port);inet_pton(AF_INET,ip,&a.sin_addr);int result=connect(fd,(struct sockaddr*)&a,sizeof(a));int e=errno;close(fd);errno=e;return result;}
int main(){
 if(getenv("EW_AUTHORIZATION")||getenv("GOOGLE_APPLICATION_CREDENTIALS")||getenv("EW_CONFINEMENT_SYNTHETIC_SECRET"))return 10;
 int fd=open(${q(join(base,'private-canary'))},O_RDONLY);if(fd>=0)return 11;
 fd=open(${q(join(root,'escape'))},O_RDONLY);if(fd>=0)return 12;
 fd=open(${q(join(root,'immutable'))},O_WRONLY|O_TRUNC);if(fd>=0)return 13;
 fd=open(${q(join(base,'escaped-write'))},O_WRONLY|O_CREAT,0600);if(fd>=0)return 14;
 char path[4096];snprintf(path,sizeof(path),"%sallowed",getenv("TMPDIR"));fd=open(path,O_WRONLY|O_CREAT,0600);if(fd<0)return 15;close(fd);
 if(tcp("127.0.0.1",${port})!=0)return 16;
 if(tcp("127.0.0.1",${otherPort})==0||errno!=EPERM)return 17;
 if(tcp("169.254.169.254",80)==0||errno!=EPERM)return 18;
 if(tcp("1.1.1.1",443)==0||errno!=EPERM)return 19;
 if(kill(getppid(),0)==0||errno!=EPERM)return 20;
 int mib[]={CTL_KERN,KERN_PROCARGS2,getppid()};char procargs[65536];size_t count=sizeof(procargs);if(sysctl(mib,3,procargs,&count,NULL,0)==0)return 23;if(errno!=EPERM)return 100+errno;
 pid_t pid=fork();if(pid==0)_exit(99);if(pid>=0||errno!=EPERM)return 21;
 char *const argv[]={"/usr/bin/false",NULL};char *const env[]={NULL};execve(argv[0],argv,env);if(errno!=EPERM)return 22;
 return 0;
}`;
  await writeFile(join(base,'probe.c'),source);await exec('/usr/bin/clang',['-arch','x86_64',join(base,'probe.c'),'-o',entry]);await chmod(entry,0o700);
  const launcher=await createMacosCheckIsolation();process.env.EW_CONFINEMENT_SYNTHETIC_SECRET='synthetic';
  const launched=await launcher.launch({root,entry,sdkUrl:`ws://127.0.0.1:${port}/`,sdkToken:'synthetic-sdk-only'});child=launched.child;dispose=launched.dispose;
  const status=await new Promise<number|null>((resolve,reject)=>{child!.once('error',reject);child!.once('exit',code=>resolve(code));});expect(status).toBe(0);
 }finally{delete process.env.EW_CONFINEMENT_SYNTHETIC_SECRET;child?.kill('SIGKILL');await dispose?.();first.close();other.close();await rm(base,{recursive:true,force:true});}
},30000);

