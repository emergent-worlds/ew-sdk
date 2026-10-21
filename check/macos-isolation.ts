/** Current macOS kernel confinement. No creator-controlled profile or environment is accepted. */
import {spawn, execFile} from 'node:child_process';
import {mkdtemp, realpath, rm, mkdir, lstat, open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, relative, isAbsolute} from 'node:path';
import {promisify} from 'node:util';
import {runBuildCheck, type CheckLaunchIsolation, type CheckPlan, type CheckServices} from './runner.js';

const exec = promisify(execFile);
const quote = (value: string) => JSON.stringify(value);
/** Seatbelt denies everything except named system runtime reads, this tree and SDK TCP endpoint. */
export function macosCheckProfile(input: {root: string; entry: string; scratch: string; port: number}) {
  if (![input.root,input.entry,input.scratch].every(v => isAbsolute(v) && !/[\x00-\x1f]/.test(v)) || !Number.isSafeInteger(input.port) || input.port < 1 || input.port > 65535) throw Error('Invalid confinement paths');
  return `(version 1)
(deny default)
(deny process-info* nvram* iokit-get-properties)
(allow process-info* (target self))
(allow sysctl-read (sysctl-name "hw.pagesize_compat"))
(allow process-exec (literal ${quote(input.entry)}))
(allow file-read* (subpath "/System/Library") (subpath "/usr/lib") (subpath "/usr/share/icu") (subpath ${quote(input.root)}) (subpath ${quote(input.scratch)}) (literal "/") (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random"))
(allow file-write* (subpath ${quote(input.scratch)}) (literal "/dev/null"))
(allow mach-lookup (global-name "com.apple.system.logger"))
(allow network-outbound (remote tcp "localhost:${input.port}"))
`;
}

export async function createMacosCheckIsolation(): Promise<CheckLaunchIsolation> {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw Error('This confinement executor requires current macOS arm64');
  const stat = await lstat('/usr/bin/sandbox-exec');
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('The kernel confinement launcher is unavailable');
  // A denied or unavailable sandbox cannot become an ordinary subprocess fallback.
  await exec('/usr/bin/sandbox-exec', ['-p', '(version 1)(deny default)(allow process-exec (literal "/usr/bin/true"))(allow file-read* (subpath "/usr/lib") (subpath "/System/Library") (literal "/usr/bin/true") (literal "/"))', '/usr/bin/true'], {env:{},timeout:10000});
  return {async launch(input) {
    input.signal?.throwIfAborted();
    const root = await realpath(input.root), entry = await realpath(input.entry), path = relative(root,entry);
    if (!path || path.startsWith('../') || isAbsolute(path) || !(await lstat(entry)).isFile()) throw Error('The confined entry must be in the immutable tree');
    const file = await open(entry, 'r');
    try {
      const header = Buffer.alloc(8), {bytesRead} = await file.read(header,0,8,0);
      // A translated x64 program or a universal selector is not this arm64 target's evidence.
      if (bytesRead !== 8 || header.readUInt32LE(0) !== 0xfeedfacf || header.readUInt32LE(4) !== 0x0100000c) throw Error('The confined entry requires a thin macOS arm64 executable');
    } finally {await file.close();}
    const url = new URL(input.sdkUrl);
    if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw Error('The confined entry needs one exact SDK endpoint');
    const scratch = await realpath(await mkdtemp(join(tmpdir(),'ew-isolated-check-')));
    try {
      await mkdir(join(scratch,'home'),{mode:0o700}); await mkdir(join(scratch,'tmp'),{mode:0o700});
      const profile = macosCheckProfile({root,entry,scratch,port:Number(url.port)});
      input.signal?.throwIfAborted();
      const child = spawn('/usr/bin/sandbox-exec',['-p',profile,entry],{cwd:root,stdio:'ignore',env:{HOME:join(scratch,'home'),TMPDIR:join(scratch,'tmp')+'/',EW_SDK_URL:input.sdkUrl,EW_SDK_TOKEN:input.sdkToken,EW_SDK_CHECK:'1'}});
      return {child, dispose:async()=>{await rm(scratch,{recursive:true,force:true});}};
    } catch {await rm(scratch,{recursive:true,force:true}); throw Error('The confined build could not start');}
  }};
}

/** Hash-pin the bundled output as the trusted Journeys deployment executor module. */
export async function createIsolatedCheckExecutor(input: {platform:string;arch:string;target:string;signal:AbortSignal}) {
  if (input.platform !== process.platform || input.arch !== process.arch || !['macos-arm64','server'].includes(input.target)) throw Error('The confinement executor does not match this worker');
  input.signal.throwIfAborted(); const isolation = await createMacosCheckIsolation(); input.signal.throwIfAborted();
  return {protocol:'ew.isolated-build-check.v1' as const,platform:process.platform,arch:process.arch,target:input.target,
    execute:async(plan:CheckPlan,services:CheckServices,signal:AbortSignal)=>{
      if (plan.target !== input.target) throw Error('The claimed artifact differs from the confined worker target');
      // Direct network asks require another qualified executor. They cannot widen this profile.
      const asks=(plan.manifest as {asks?:{network?:unknown[]}})?.asks;
      if (asks?.network?.length) throw Error('This confinement executor supports SDK-routed networking only');
      return runBuildCheck(plan,services,AbortSignal.any([signal,input.signal]),isolation);
    },close:async()=>{}};
}
