/** Trusted host /proc identity. Namespace init and launcher PIDs are never artifact evidence. */
import {readFile, readlink, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';

export interface LinuxProcessIdentity {pid:number; startTicks:string; parentPID:number; namespace:string}
interface LinuxIsolationCommon {
 platform:'linux'; arch:'x64'; kernel:string; bwrapSHA256:string; pythonSHA256:string; relaySHA256:string; pidfdHelperSHA256:string;
 relayFailure?:'connection_cap'|'byte_cap'|'helper_protocol'; relayStatusSettled:boolean; wrapper:LinuxProcessIdentity; namespaceInit:LinuxProcessIdentity; subject:LinuxArtifactSubject;
}
export type LinuxIsolationEvidence=(LinuxIsolationCommon&{adapter:'linux-bwrap-sdk-only-v1';directNetworkAsksSupported:false})|(LinuxIsolationCommon&{adapter:'linux-bwrap-declared-tcp-v1';directNetworkAsksSupported:true;networkPolicySHA256:string;nftSHA256:string;slirpSHA256:string;networkHelperSHA256:string;networkPolicyInstalledBeforeExec:boolean;networkTransportRetired:boolean});
export interface LinuxArtifactSubject extends LinuxProcessIdentity {
  kind:'linux-proc-artifact-v1'; arch:'x64'; executableSHA256:string; executableBytes:number;
  executableDevice:string; executableInode:string;
}
export function parseLinuxProcessStat(text:string): Pick<LinuxProcessIdentity,'pid'|'parentPID'|'startTicks'> {
  // comm is parenthesized and may itself contain spaces or ')'. Field22 follows the last ')'.
  const end=text.lastIndexOf(')'), pid=Number(text.slice(0,text.indexOf(' ')));
  const fields=text.slice(end+2).trim().split(/\s+/);
  if(end<0||!Number.isSafeInteger(pid)||pid<1||fields.length<20||!/^[0-9]+$/.test(fields[19]!)||!/^\d+$/.test(fields[1]!)) throw Error('Invalid Linux process identity');
  return {pid,parentPID:Number(fields[1]),startTicks:fields[19]!};
}
export async function linuxProcessIdentity(pid:number):Promise<LinuxProcessIdentity> {
  if(!Number.isSafeInteger(pid)||pid<1)throw Error('Invalid Linux PID');
  const first=parseLinuxProcessStat(await readFile(`/proc/${pid}/stat`,'utf8'));
  const namespace=await readlink(`/proc/${pid}/ns/pid`);
  const last=parseLinuxProcessStat(await readFile(`/proc/${pid}/stat`,'utf8'));
  if(first.pid!==pid||JSON.stringify(first)!==JSON.stringify(last)||!/^pid:\[\d+\]$/.test(namespace))throw Error('Linux process identity changed');
  return {...first,namespace};
}
export function sameLinuxProcess(a:LinuxProcessIdentity,b:LinuxProcessIdentity):boolean {
  return a.pid===b.pid&&a.startTicks===b.startTicks&&a.namespace===b.namespace;
}
export function assertArtifactIdentity(actual:LinuxArtifactSubject,expected:LinuxArtifactSubject):void {
  if(!sameLinuxProcess(actual,expected)||actual.kind!==expected.kind||actual.arch!==expected.arch||actual.executableSHA256!==expected.executableSHA256||actual.executableBytes!==expected.executableBytes||actual.executableDevice!==expected.executableDevice||actual.executableInode!==expected.executableInode)throw Error('The checked executable identity changed');
}
export function requireLinuxELF(header:Uint8Array):void {
  const b=Buffer.from(header);
  if(b.length<20||b.toString('hex',0,7)!=='7f454c46020101'||b.readUInt16LE(18)!==62||![2,3].includes(b.readUInt16LE(16)))throw Error('The confined entry requires ELF64 little-endian x86_64');
}
export function assertSameLinuxExecutable(before:{dev:bigint;ino:bigint;size:bigint},after:{dev:bigint;ino:bigint;size:bigint}):void {
 if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size)throw Error('The executable changed during identity binding');
}
async function executableHash(path:string,bytes:number):Promise<string> {
  if(!Number.isSafeInteger(bytes)||bytes<20)throw Error('Invalid immutable executable size');
  const hash=createHash('sha256');let read=0;
  for await(const chunk of createReadStream(path,{highWaterMark:16384})){read+=chunk.length;if(read>bytes)throw Error('Executable size changed');hash.update(chunk);}
  if(read!==bytes)throw Error('Executable size changed');return hash.digest('hex');
}
export async function bindLinuxArtifact(pid:number,expected:{sha256:string;size:number;device:string;inode:string;namespace:string}):Promise<LinuxArtifactSubject> {
  const identity=await linuxProcessIdentity(pid),path=`/proc/${pid}/exe`,s=await stat(path,{bigint:true});
  if(identity.namespace!==expected.namespace||String(s.dev)!==expected.device||String(s.ino)!==expected.inode||s.size!==BigInt(expected.size))throw Error('The subject is not the immutable artifact');
  const executableSHA256=await executableHash(path,expected.size);
  const finalStat=await stat(path,{bigint:true});
  assertSameLinuxExecutable(s,finalStat);
  if(executableSHA256!==expected.sha256||!sameLinuxProcess(identity,await linuxProcessIdentity(pid)))throw Error('The subject executable or start identity changed');
  return {...identity,kind:'linux-proc-artifact-v1',arch:'x64',executableSHA256,executableBytes:expected.size,executableDevice:String(s.dev),executableInode:String(s.ino)};
}
/** Recheck before AND after the existing socket sampler. No caller-provided observations. */
export async function verifyLinuxArtifact(subject:LinuxArtifactSubject):Promise<void> {
  if(process.platform!=='linux'||process.arch!=='x64')throw Error('Linux subject on a different worker');
  const identity=await linuxProcessIdentity(subject.pid),s=await stat(`/proc/${subject.pid}/exe`,{bigint:true});
  if(!sameLinuxProcess(identity,subject)||String(s.dev)!==subject.executableDevice||String(s.ino)!==subject.executableInode||s.size!==BigInt(subject.executableBytes))throw Error('The checked executable identity changed');
}
/** Bounded discovery of only current descendants; absence and identity failures are distinct. */
export async function linuxDescendants(root:LinuxProcessIdentity):Promise<LinuxProcessIdentity[]> {
  if(!sameLinuxProcess(root,await linuxProcessIdentity(root.pid)))throw Error('Owned launcher identity changed');
  const result:LinuxProcessIdentity[]=[],pending=[root.pid],seen=new Set<number>();
  while(pending.length){const pid=pending.pop()!;if(seen.has(pid))continue;seen.add(pid);if(seen.size>256)throw Error('Owned process family bound exceeded');
    let children:string;
    try{children=await readFile(`/proc/${pid}/task/${pid}/children`,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
    for(const value of children.trim().split(/\s+/).filter(Boolean)){const child=Number(value);let identity:LinuxProcessIdentity;
      try{identity=await linuxProcessIdentity(child);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
      if(identity.parentPID!==pid)throw Error('Owned descendant changed parent during discovery');result.push(identity);pending.push(child);
    }
  }return result;
}
