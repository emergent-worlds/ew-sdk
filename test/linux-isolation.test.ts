import {test,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,chmod,readFile,realpath,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createLinuxCheckIsolation} from '../check/linux-isolation.js';
import {sampleSockets} from '../check/sockets.js';
import {setTimeout as delay} from 'node:timers/promises';
import {verifyLinuxArtifact} from '../check/linux-subject.js';
const exec=promisify(execFile);
// Authored actual-kernel qualification; never a skipped-platform pass or a full six-row run.
test('Linux private namespace binds actual ELF, reaches only SDK, denies host reads/writes and drains forked family',async()=>{
 expect(process.platform).toBe('linux');expect(process.arch).toBe('x64');
 const base=await realpath(await mkdtemp(join(tmpdir(),'ew-linux-canary-'))),root=join(base,'tree'),entry=join(root,'probe');await mkdir(root);
 const sdk=createServer(socket=>socket.on('error',()=>{})),other=createServer(socket=>socket.end());
 await Promise.all([new Promise<void>(r=>sdk.listen(0,'127.0.0.1',r)),new Promise<void>(r=>other.listen(0,'127.0.0.1',r))]);
 const sdkPort=(sdk.address() as {port:number}).port,otherPort=(other.address() as {port:number}).port;
 const canaryNames=['EW_S18_CANARY_SECRET','EW_S18_CREDENTIAL_FILE'];if(canaryNames.some(name=>process.env[name]!==undefined))throw Error('Synthetic environment collision');
 const credentialCanary=join(base,'synthetic-credentials.json');await writeFile(credentialCanary,'{"synthetic":true}',{mode:0o600});process.env.EW_S18_CANARY_SECRET='synthetic';process.env.EW_S18_CREDENTIAL_FILE=credentialCanary;
 let launched:Awaited<ReturnType<Awaited<ReturnType<typeof createLinuxCheckIsolation>>['launch']>>|undefined;
 try{
  await writeFile(join(base,'private-canary'),'synthetic');await symlink(join(base,'private-canary'),join(root,'escape'));await writeFile(join(root,'immutable'),'unchanged');
  const source=`#include <unistd.h>\n#include <fcntl.h>\n#include <stdlib.h>\n#include <sys/socket.h>\n#include <arpa/inet.h>\n#include <sys/time.h>\nint tcp(const char*ip,int port){int fd=socket(AF_INET,SOCK_STREAM,0);struct timeval t={1,0};setsockopt(fd,SOL_SOCKET,SO_SNDTIMEO,&t,sizeof(t));struct sockaddr_in a={0};a.sin_family=AF_INET;a.sin_port=htons(port);inet_pton(AF_INET,ip,&a.sin_addr);if(connect(fd,(void*)&a,sizeof(a))!=0){close(fd);return -1;}return fd;}\nint main(){if(getenv("GOOGLE_APPLICATION_CREDENTIALS")||getenv("EW_S18_CANARY_SECRET")||getenv("EW_S18_CREDENTIAL_FILE"))return 10;if(open(${JSON.stringify(join(base,'private-canary'))},O_RDONLY)>=0)return 11;if(open(${JSON.stringify(credentialCanary)},O_RDONLY)>=0)return 20;if(open("/artifact/escape",O_RDONLY)>=0)return 12;if(open("/artifact/immutable",O_WRONLY|O_TRUNC)>=0)return 13;int f=open("/tmp/allowed",O_CREAT|O_WRONLY,0600);if(f<0)return 14;close(f);if(open("/outside",O_CREAT|O_WRONLY,0600)>=0)return 15;int sdk=tcp("127.0.0.1",${sdkPort});if(sdk<0)return 16;if(tcp("127.0.0.1",${otherPort})>=0)return 17;if(tcp("169.254.169.254",80)>=0)return 18;if(tcp("1.1.1.1",443)>=0)return 19;pid_t p=fork();if(p==0){sleep(30);return 0;}sleep(3);close(sdk);return 0;}\n`;
  await writeFile(join(base,'probe.c'),source);await exec('/usr/bin/cc',[join(base,'probe.c'),'-o',entry],{timeout:10000});await chmod(entry,0o700);
  const bytes=await readFile(entry),immutableEntry={sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length};
  const isolation=await createLinuxCheckIsolation();launched=await isolation.launch({root,entry,sdkUrl:`ws://127.0.0.1:${sdkPort}/`,sdkToken:'synthetic-one-use',immutableEntry});
  const subject=launched.subject,evidence=launched.isolationEvidence;if(!subject||subject.kind!=='linux-proc-artifact-v1'||!evidence||evidence.adapter!=='linux-bwrap-sdk-only-v1')throw Error('The actual SDK-only Linux subject is absent.');
  expect(subject.pid).not.toBe(launched.child.pid);expect(subject.pid).not.toBe(evidence.namespaceInit.pid);expect(subject.executableSHA256).toBe(immutableEntry.sha256);await verifyLinuxArtifact(subject);let observed:string[]=[];for(let attempt=0;attempt<10;attempt++){observed=(await sampleSockets(subject.pid)).endpoints;if(observed.includes(`127.0.0.1:${sdkPort}`))break;await delay(100);}expect(observed).toContain(`127.0.0.1:${sdkPort}`);await verifyLinuxArtifact(subject);
  const status=launched.child.exitCode??await new Promise<number|null>((resolve,reject)=>{launched!.child.once('error',reject);launched!.child.once('exit',resolve);});expect(status).toBe(0);
  await launched.dispose();launched=undefined;
 }finally{
  for(const name of canaryNames)delete process.env[name];
  // Disposal alone may signal only the bound check family, never a shared process.
  if(launched)await launched.dispose();sdk.close();other.close();await rm(base,{recursive:true});
 }
},30000);
