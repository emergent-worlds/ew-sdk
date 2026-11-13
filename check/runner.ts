import {resolveDeclaredNetwork,assertDeclaredNetwork,type DeclaredNetworkPolicy} from './declared-network.js';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import {
  HostBridge, Manifest, BuildTarget, canonicalBuildList, parseBuildList, portablePath, callPort, splitInstalledPlayerTransport,
  REMOTE_PLAYER_PROJECTION_METHODS, RemotePlayerProjectionDescriptor, RemotePlayerProjectionSnapshot,
  type BuildList, type BuildFile, type HostHandlers, type Transport,
} from '@emergent-worlds/host';
import { WebSocketServer, type WebSocket } from 'ws';
import { checkedPath, folderPath, hostAllowed, namedHost, scanTree, under, validateFiles, type CheckFile, type StaticEvidence } from './scan.js';
import { resolveNetworkAsk,sampleSockets } from './sockets.js';
import {CheckLaunchAdmission,readIsolationFailure,settleCheckIsolation,type IsolationFailureEvidence} from './launch-admission.js';
import {verifyLinuxArtifact,type LinuxArtifactSubject,type LinuxIsolationEvidence} from './linux-subject.js';
import {readWindowsIsolationFailure,type WindowsArtifactSubject,type WindowsIsolationEvidence,type WindowsFailureEvidence} from './windows-subject.js';
type ArtifactSubject=LinuxArtifactSubject|WindowsArtifactSubject;
type IsolationEvidence=LinuxIsolationEvidence|WindowsIsolationEvidence;
export type { CheckFile } from './scan.js';

// PV85, PV87, PV90 and E17. Shortened runs never produce passing evidence.
export const CHECK_DURATION_MS = 60000;
export const SOCKET_SAMPLE_MS = 250;
const ADMISSION_MS = 30000;
const FRAME_BYTES = 4 * 1024 * 1024;
export const CHECK_LINES = [
  'The manifest names an entry for each build',
  'Each build launches and reaches the platform through the SDK',
  'Saves go to the account, not only to the computer',
  "Model calls go through the platform, on the player's compute",
  'In a test run it does nothing it does not ask for',
  'It is scanned and signed',
] as const;
export type CheckResult = 'pass' | 'fail' | 'pending';
export interface CheckRow { line: number; name: string; result: CheckResult; evidence: Record<string, unknown> }
export interface CheckPlan {
  root: string; folder: string; version: string; target: string; manifest: unknown;
  /** Explicit launch file within the manifest's target prefix, including a macOS bundle executable. */
  entryPath: string;
  /** Complete immutable folder tree, including files outside this target's prefix. */
  files: readonly CheckFile[];
  /** Current provider addresses from the platform's model catalogue, without credentials. */
  providerHosts: readonly string[];
}
export type CheckSignInput = Readonly<Omit<BuildList, 'files'>> & {
  readonly files: readonly Readonly<BuildFile>[];
  readonly payload: string;
  readonly fileListSha256: string;
  /** Exact first five rows, copied/frozen before signing for the claimed-run authority check. */
  readonly prerequisiteRows: readonly Readonly<CheckRow>[];
};
export interface CheckServices {
  /** Commits the game's complete save through the check account's ordinary platform route. */
  save: NonNullable<HostHandlers['save']>;
  modelCall?: HostHandlers['modelCall'];
  /** Integration signs these exact canonical bytes with the builds key, only after all prerequisites pass. */
  sign?: (input: CheckSignInput) => Promise<{ signature: string; fileListSha256: string }>;
}
/** Trusted deployment adapter. Uploaded code cannot select or configure this boundary. */
export interface CheckLaunchIsolation {
  launch(input: { entry: string; root: string; sdkUrl: string; sdkToken: string; immutableEntry?: {sha256:string;size:number}; network?:DeclaredNetworkPolicy; signal?: AbortSignal }): Promise<{ child: ChildProcess; subject?: ArtifactSubject; isolationEvidence?:IsolationEvidence; assertHealthy?():void; beginShutdown?():void; verify?():Promise<void>; stop?(signal:'SIGTERM'|'SIGKILL'):Promise<void>; declaredNetworkEvidence?:{policySHA256:string;profileSHA256?:string;kernelPolicySHA256?:string}; dispose(): Promise<void> }>;
}
export interface BuildCheckEvidence { folder: string; version: string; target: string; rows: CheckRow[]; passed: boolean }
interface PlayerProjectionEvidence {
  protocol: 'ew.remote-player.v1'; executableSha256: string; descriptorSha256: string; nonStateTreeSha256: string;
  admittedPlayers: 2; snapshots: 2;
}
interface LaunchEvidence {
  admitted: boolean; runMs: number; requestedSave: boolean; savedVersions: string[]; saveReasons: string[];
  quitSaved: boolean; modelJobs: string[]; modelFailures: number; refused: number;
  endpoints: string[]; observedEndpoints: string[]; sdkSamples: number; samples: number; sampleErrors: number; missedSamples: number;
  sampler: string; declaredNetwork?:{policy:DeclaredNetworkPolicy;profileSHA256?:string;kernelPolicySHA256?:string}; subject?: ArtifactSubject; isolationEvidence?:IsolationEvidence; isolationFailure?:IsolationFailureEvidence|WindowsFailureEvidence; cleanup?:{qualified:boolean;failures:string[]}; failure?: string;
  playerProjection?: PlayerProjectionEvidence;
}

const requiresPlayerProjection = (target: string, manifest: Manifest) =>
  target === 'server' && manifest.entry?.playerProjection === 'ew.remote-player.v1';
function validPlayerProjectionEntry(plan: CheckPlan, manifest: Manifest): boolean {
  const web = manifest.entry?.web, declared = manifest.entry?.executables?.server;
  return !!web && web.length <= 512 && portablePath(web) && !web.startsWith('state/')
    && (!declared || declared === plan.entryPath) && plan.files.some(file => file.path === web);
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function nonStateTreeSha256(plan: CheckPlan): string {
  return digest(plan.files.filter(file => !file.path.startsWith('state/'))
    .map(({ path, sha256, size }) => [path, sha256, size] as const)
    .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
function matchedPlayerProjection(plan: CheckPlan, evidence: PlayerProjectionEvidence | undefined): PlayerProjectionEvidence | null {
  const entry = plan.files.find(file => file.path === plan.entryPath);
  const sha256 = /^[a-f0-9]{64}$/;
  return evidence?.protocol === 'ew.remote-player.v1' && Object.keys(evidence).length === 6
    && sha256.test(evidence.executableSha256) && evidence.executableSha256 === entry?.sha256
    && typeof evidence.descriptorSha256 === 'string' && sha256.test(evidence.descriptorSha256)
    && evidence.nonStateTreeSha256 === nonStateTreeSha256(plan)
    && evidence.admittedPlayers === 2 && evidence.snapshots === 2 ? evidence : null;
}

/** Pure aggregation keeps missing observations and missing signing evidence visibly pending. */
export async function checkRows(plan: CheckPlan, scan: StaticEvidence | undefined, launch: LaunchEvidence | undefined, services: Pick<CheckServices, 'sign'>): Promise<CheckRow[]> {
  const manifest = Manifest.safeParse(plan.manifest);
  const prefix = manifest.success ? manifest.data.entry?.installs?.[plan.target as BuildTarget] : undefined;
  const needsProjection = manifest.success && requiresPlayerProjection(plan.target, manifest.data);
  const projectionEntry = manifest.success && (!needsProjection || validPlayerProjectionEntry(plan, manifest.data));
  const entry = Boolean(prefix && under(plan.entryPath, prefix) && plan.files.some(file => file.path === plan.entryPath && file.executable) && projectionEntry);
  const row = (line: number, result: CheckResult, evidence: Record<string, unknown>): CheckRow => ({ line, name: CHECK_LINES[line - 1]!, result, evidence });
  const evidence=launch?.isolationEvidence;
  const isolationQualified=!evidence?true:(evidence.adapter==='linux-bwrap-sdk-only-v1'||evidence.adapter==='linux-bwrap-declared-tcp-v1')
    ?evidence.relayStatusSettled===true&&evidence.relayFailure===undefined&&(evidence.adapter!=='linux-bwrap-declared-tcp-v1'||evidence.networkPolicyInstalledBeforeExec&&evidence.networkTransportRetired)&&launch?.cleanup?.qualified===true&&launch.cleanup.failures.length===0
    :evidence.policyInstalledBeforeResume===true&&evidence.jobEmpty&&evidence.filtersRetired&&evidence.profileDeleted&&evidence.loopbackUnchanged&&evidence.cleaned&&evidence.nativeFailure===undefined&&launch?.cleanup?.qualified===true&&launch.cleanup.failures.length===0;
  let declaredQualified=true;
  if(evidence?.adapter==='linux-bwrap-declared-tcp-v1'||evidence?.adapter==='windows-appcontainer-declared-tcp-v1'){
    const recorded=launch?.declaredNetwork;declaredQualified=false;
    if(recorded&&manifest.success){try{assertDeclaredNetwork(recorded.policy);const asks=[...new Set((manifest.data.asks?.network??[]).map(namedHost))].sort();declaredQualified=JSON.stringify(asks)===JSON.stringify(recorded.policy.asks)&&(evidence.adapter==='linux-bwrap-declared-tcp-v1'?evidence.networkPolicySHA256===recorded.policy.digest:recorded.kernelPolicySHA256===recorded.policy.endpointsSHA256);}catch{/* Missing or changed actual policy cannot qualify the rows. */}}
  }
  const fullRun = Boolean(launch?.admitted && launch.runMs >= CHECK_DURATION_MS && !launch.failure && isolationQualified && declaredQualified);
  const projection = needsProjection && projectionEntry ? matchedPlayerProjection(plan, launch?.playerProjection) : null;
  const launchFailure = launch?.failure ?? (needsProjection && !projection ? 'the installed player projection did not complete its required probe' : null);
  const network = manifest.success ? manifest.data.asks?.network ?? [] : [];
  const staticDenied = scan?.hosts.filter(host => !hostAllowed(host, network)) ?? [];
  const rows = [
    row(1, entry && scan ? 'pass' : 'fail', { entry: plan.entryPath, prefix: prefix ?? null, verifiedFiles: scan?.verifiedFiles ?? 0 }),
    row(2, fullRun && (!needsProjection || projection !== null) ? 'pass' : 'fail', { admitted: launch?.admitted ?? false, runMs: launch?.runMs ?? 0, requiredMs: CHECK_DURATION_MS, failure: launchFailure, ...(launch?.isolationFailure?{isolationFailure:launch.isolationFailure}:{}), ...(launch?.isolationEvidence?{cleanup:launch.cleanup??null}:{}), ...(projection ? { playerProjection: projection } : {}) }),
    row(3, fullRun && launch?.requestedSave && launch.savedVersions.length > 0 && launch.quitSaved ? 'pass' : 'fail', { requestedSave: launch?.requestedSave ?? false, savedVersions: launch?.savedVersions ?? [], quitSaved: launch?.quitSaved ?? false }),
    row(4, fullRun && scan && scan.providerHosts.length === 0 && launch?.modelFailures === 0 ? 'pass' : 'fail', { staticProviderHosts: scan?.providerHosts ?? [], modelJobs: launch?.modelJobs ?? [], failedRoutes: launch?.modelFailures ?? 0 }),
    row(5, fullRun && scan && scan.hostFindingsComplete && staticDenied.length === 0 && launch && launch.refused === 0 && launch.sampleErrors === 0 && launch.missedSamples === 0 && launch.sdkSamples > 0 && launch.endpoints.length === 0 ? 'pass' : 'fail', { staticDenied, staticFindings: scan?.hostFindings ?? [], staticFindingCount: scan?.hostFindingCount ?? 0, staticFindingsComplete: scan?.hostFindingsComplete ?? false, observedConnections: launch?.observedEndpoints ?? [], deniedConnections: launch?.endpoints ?? [], samples: launch?.samples ?? 0, sdkSamples: launch?.sdkSamples ?? 0, sampleErrors: launch?.sampleErrors ?? 0, missedSamples: launch?.missedSamples ?? 0, sampler: launch?.sampler ?? null, ...(launch?.subject?{subject:launch.subject}:{}), ...(launch?.declaredNetwork?{declaredNetwork:launch.declaredNetwork}:{}), ...(launch?.isolationEvidence?{isolation:launch.isolationEvidence}:{}), sampleEveryMs: SOCKET_SAMPLE_MS, refusedMessages: launch?.refused ?? 0, limits: launch?.declaredNetwork?'Static literals and actual artifact TCP samples use the same captured declared addresses; the recorded per-job kernel boundary and owned cleanup must qualify.':launch?.isolationEvidence?.adapter==='windows-appcontainer-sdk-only-v1'?'Static literals and actual held-artifact TCP samples; the AppContainer and owned Job enforce the recorded SDK-only boundary.':'Static literals and sampled TCP sockets of the launched process; no sandbox or child-process coverage is asserted.' }),
  ];
  const scanPass = Boolean(scan && scan.archives.length === 0 && scan.outsideExecutables.length === 0);
  if (!scanPass) rows.push(row(6, 'fail', { archives: scan?.archives ?? [], outsideExecutables: scan?.outsideExecutables ?? [], signed: false }));
  else if (rows.some(item => item.result !== 'pass') || !services.sign) rows.push(row(6, 'pending', { scanPassed: true, signed: false, reason: services.sign ? 'prerequisites have not passed' : 'signing integration is pending' }));
  else {
    try {
      const payload = canonicalBuildList({ domain: 'ew.build-files.v1', folder: plan.folder, version: plan.version, target: BuildTarget.parse(plan.target), prefix: prefix!, entry: plan.entryPath, files: plan.files.filter(file => under(file.path, prefix!)).map(file => ({ path: file.path, sha256: file.sha256, size: file.size, executable: file.executable })) });
      const list = parseBuildList(payload);
      const fileListSha256 = createHash('sha256').update(payload, 'utf8').digest('hex');
      const prerequisiteRows = JSON.parse(JSON.stringify(rows)) as CheckRow[];
      const input = freezeEvidence({ ...list, files: list.files, payload, fileListSha256, prerequisiteRows });
      const signed = await services.sign!(input);
      if (!signed.signature.trim() || signed.fileListSha256 !== fileListSha256) throw new Error('invalid signing acknowledgment');
      rows.push(row(6, 'pass', { scanPassed: true, signed: true, fileListSha256, signature: signed.signature, payload }));
    } catch { rows.push(row(6, 'fail', { scanPassed: true, signed: false, reason: 'the signing service did not confirm a signature' })); }
  }
  return rows;
}

function freezeEvidence<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeEvidence(child); Object.freeze(value); }
  return value;
}

function childEnvironment(url: string, token: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'XDG_RUNTIME_DIR', 'DISPLAY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS']) if (process.env[name] !== undefined) env[name] = process.env[name];
  return { ...env, EW_SDK_URL: url, EW_SDK_TOKEN: token, EW_SDK_CHECK: '1' };
}
function socketTransport(socket: WebSocket): Transport {
  return {
    send: value => socket.send(JSON.stringify(value)),
    onMessage: listener => {
      const receive = (data: Buffer, binary: boolean) => { if (binary) { socket.close(1008); return; } try { listener(JSON.parse(data.toString('utf8'))); } catch { socket.close(1008); } };
      socket.on('message', receive); return () => { socket.off('message', receive); };
    },
    onClose: listener => { const close = () => listener(new Error('the checked build connection closed')); socket.on('close', close); return () => { socket.off('close', close); }; },
    close: () => socket.close(),
  };
}

async function inspectPlayerProjection(plan: CheckPlan, transport: Transport): Promise<PlayerProjectionEvidence> {
  const peer = callPort(transport, ADMISSION_MS);
  const methods = REMOTE_PLAYER_PROJECTION_METHODS;
  const descriptor = RemotePlayerProjectionDescriptor.parse(await peer.call(methods.describe));
  const players = [
    { sender: randomBytes(16).toString('hex'), handle: '@crowsfeather', host: true },
    { sender: randomBytes(16).toString('hex'), handle: '@ironwrit', host: false },
  ];
  for (const player of players) {
    if (await peer.call(methods.admit, player) !== undefined) throw new Error('the game returned invalid player admission');
  }
  for (const { sender } of players) {
    const snapshot = RemotePlayerProjectionSnapshot.parse(await peer.call(methods.snapshot, { sender }));
    if (!snapshot.length) throw new Error('the game did not project a player view');
  }
  return { protocol: descriptor.protocol, executableSha256: plan.files.find(file => file.path === plan.entryPath)!.sha256,
    descriptorSha256: digest(descriptor), nonStateTreeSha256: nonStateTreeSha256(plan), admittedPlayers: 2, snapshots: 2 };
}

async function launchBuild(plan: CheckPlan, manifest: Manifest, services: CheckServices, signal?: AbortSignal, isolation?: CheckLaunchIsolation): Promise<LaunchEvidence> {
  const out: LaunchEvidence = { admitted: false, runMs: 0, requestedSave: false, savedVersions: [], saveReasons: [], quitSaved: false, modelJobs: [], modelFailures: 0, refused: 0, endpoints: [], observedEndpoints: [], sdkSamples: 0, samples: 0, sampleErrors: 0, missedSamples: 0, sampler: '' };
  const entry = await checkedPath(plan.root, plan.entryPath);
  const network=isolation?await resolveDeclaredNetwork(manifest.asks!.network,plan.providerHosts):undefined;
  const allowedEndpoints=network?.allowedEndpoints??await resolveNetworkAsk(manifest.asks!.network);
  const token = randomBytes(32).toString('base64url');
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0, maxPayload: FRAME_BYTES, perMessageDeflate: false });
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('the local check listener did not open');
  const sdkEndpoint = `127.0.0.1:${address.port}`;
  const binding=new CheckLaunchAdmission();
  let isolated: Awaited<ReturnType<CheckLaunchIsolation['launch']>> | undefined;
  const verifySubject=async()=>{
    if(isolated?.subject?.kind==='linux-proc-artifact-v1')await verifyLinuxArtifact(isolated.subject);
    else if(isolated?.subject?.kind==='windows-held-process-v1'){
      if(!isolated.verify)throw Error('The trusted Windows artifact verifier is unavailable.');
      await isolated.verify();
    }
  };
  const requireEffect=async()=>{try{binding.assertEffect();isolated?.assertHealthy?.();await verifySubject();binding.assertEffect();isolated?.assertHealthy?.();}catch{out.refused++;throw Error('the SDK effect was refused');}};
  const callEffect=async<T>(run:()=>T|Promise<T>):Promise<T>=>{try{return await binding.effect(async()=>{isolated?.assertHealthy?.();await verifySubject();isolated?.assertHealthy?.();},run);}catch{out.refused++;throw Error('the SDK effect was refused');}};
  let bridge: HostBridge | undefined; let consumed = false; let disconnected = false;
  let projection: Transport | undefined;
  let projectionStarted = false, projectionOpen = true;
  const closeProjection = () => { projectionOpen = false; projection?.close(); };
  let accept!: () => void; let reject!: (error: Error) => void;
  const ready = new Promise<void>((yes, no) => { accept = yes; reject = no; });
  // Binding may await native startup; preserve the rejected result without an unhandled early rejection.
  void ready.catch(() => {});
  const admission = setTimeout(() => {binding.refuse();reject(new Error('the checked build did not reach the SDK within its admission window'));}, ADMISSION_MS);
  const grant=()=>{isolated?.assertHealthy?.();out.admitted=true;bridge!.send({type:'grant',asks:manifest.asks!,session:'build-check',headless:true,version:{id:plan.version,seq:0},files:plan.files.map(({path,size,sha256})=>({path,size,sha256})),display:{theme:'light',textSize:'default',contrast:'default',motion:'full',language:'en'}});accept();};
  server.on('connection', socket => {
    socket.on('error', () => { /* Connection failures are reported through admission or closure. */ });
    if (consumed) { socket.close(1008); return; }
    socket.once('message', (data, binary) => {
      let valid = false;
      try { valid = !binary && !consumed && JSON.parse(data.toString()).token === token; } catch { /* Refuse malformed first frames. */ }
      if (!valid) { socket.close(1008); return; }
      consumed = true;
      socket.once('close', () => { disconnected = true; });
      const transport = socketTransport(socket);
      const split = requiresPlayerProjection(plan.target, manifest) ? splitInstalledPlayerTransport(transport) : undefined;
      projection = split?.projection;
      projection?.onClose?.(() => {
        if (projectionOpen) delete out.playerProjection;
        projectionOpen = false;
      });
      bridge = new HostBridge(split?.core ?? transport, manifest.asks!, {
        ready: () => {try{if(binding.ready())grant();}catch{binding.refuse();out.refused++;reject(new Error('the SDK ready was refused'));socket.close(1008);}},
        progress: fraction => {
          if (fraction !== 1 || !out.admitted || !projection || !projectionOpen || projectionStarted) return;
          projectionStarted = true;
          void inspectPlayerProjection(plan, projection).then(proof => {
            if (projectionOpen) out.playerProjection = proof;
          }, () => {});
        },
        fileRead: async path => {
          await requireEffect();
          if (!plan.files.some(file => file.path === path)) throw new Error('the file is outside the check tree');
          return callEffect(async()=>({data:(await readFile(await checkedPath(plan.root,path))).toString('base64')}));
        },
        save: async message => {
          await requireEffect();
          const result = await callEffect(()=>services.save(message)) as { version?: unknown; seq?: unknown; at?: unknown };
          if (typeof result?.version !== 'string' || !result.version || !Number.isSafeInteger(result.seq) || (result.seq as number) < 0 || typeof result.at !== 'string' || !Number.isFinite(Date.parse(result.at))) throw new Error('the platform did not confirm the checked save');
          out.savedVersions.push(result.version); out.saveReasons.push(message.reason); return result;
        },
        modelCall: async (message, part, abort) => {
          await requireEffect();
          out.modelJobs.push(message.job);
          try { if (!services.modelCall) throw new Error('the check model route is unavailable'); return await callEffect(()=>services.modelCall!(message,part,abort)); }
          catch { out.modelFailures++; throw new Error('the checked model route did not complete'); }
        },
        refused: () => { out.refused++; },
      }, ADMISSION_MS, 'core');
    });
  });
  try { isolated = await isolation?.launch({ entry, root: plan.root, sdkUrl: `ws://${sdkEndpoint}/`, sdkToken: token, immutableEntry:plan.files.find(file=>file.path===plan.entryPath), ...(network?.asks.length?{network}:{}), signal });await verifySubject();isolated?.assertHealthy?.();if(network?.asks.length){const observed=isolated?.declaredNetworkEvidence;if(!observed||observed.policySHA256!==network.digest)throw Error('The exact declared network was not installed by the trusted adapter.');out.declaredNetwork={policy:network,...(observed.profileSHA256?{profileSHA256:observed.profileSHA256}:{}),...(observed.kernelPolicySHA256?{kernelPolicySHA256:observed.kernelPolicySHA256}:{})};} }
  catch(error) {binding.refuse();clearTimeout(admission);ready.catch(()=>{});reject(new Error('trusted executable binding refused'));for(const socket of server.clients)socket.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));out.failure='the trusted executable binding refused';out.isolationFailure=readIsolationFailure(error)??readWindowsIsolationFailure(error);const failures:string[]=[];if(isolated){try{await isolated.dispose();}catch{failures.push('OWNED_ISOLATION_CLEANUP_UNCONFIRMED');}}if(failures.length)out.cleanup={qualified:false,failures};return out;}
  const child = isolation ? isolated!.child : spawn(entry, [], { cwd: plan.root, env: childEnvironment(`ws://${sdkEndpoint}/`, token), stdio: 'ignore', windowsHide: true });
  out.subject=isolated?.subject;out.isolationEvidence=isolated?.isolationEvidence;
  const stop = new AbortController();
  const runSignal = signal ? AbortSignal.any([stop.signal, signal]) : stop.signal;
  let exited = child.exitCode!==null || child.signalCode!==null; let sampling = false; let pendingSample: Promise<void> = Promise.resolve();
  const exit = new Promise<void>(resolve => { if(exited){resolve();return;} child.once('exit', () => { exited = true; resolve(); }); child.once('error', () => { exited = true; reject(new Error('the checked build could not start')); resolve(); }); });
  child.once('exit', () => reject(new Error('the checked build exited before admission')));
  if(exited)reject(new Error('the checked build exited before admission'));
  const samplingTimer = setInterval(() => {
    if (sampling) { out.missedSamples++; return; }
    if (!child.pid || exited) return;
    sampling = true;
    pendingSample = (async()=>{isolated?.assertHealthy?.();await verifySubject();const sample=await sampleSockets(isolated?.subject?.pid??child.pid!);await verifySubject();return sample;})().then(sample => {
      out.samples++; out.sampler = sample.method;
      out.observedEndpoints.push(...sample.endpoints);
      if (sample.endpoints.includes(sdkEndpoint)) out.sdkSamples++;
      for (const endpoint of sample.endpoints) if (endpoint !== sdkEndpoint && !hostAllowed(endpoint, allowedEndpoints)) out.endpoints.push(endpoint);
    }, () => { if (!exited) out.sampleErrors++; }).finally(() => { sampling = false; });
  }, SOCKET_SAMPLE_MS);
  let pendingStop:Promise<void>=Promise.resolve();const cleanupFailures:string[]=[];
  const stopOwned=(sig:'SIGTERM'|'SIGKILL')=>isolated?.stop?isolated.stop(sig):Promise.resolve(child.kill(sig)).then(()=>{});
  const abort = () => {binding.refuse();reject(new Error('the build check was cancelled'));bridge?.close();if(!exited){pendingStop=stopOwned('SIGTERM').catch(()=>{cleanupFailures.push('OWNED_STOP_REFUSED');});}};
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) throw new Error('the build check was cancelled');
    if(binding.admit())grant();
    await ready; clearTimeout(admission);
    const began = performance.now();
    await Promise.race([delay(CHECK_DURATION_MS, undefined, { signal: runSignal }), exit.then(() => { throw new Error('the checked build exited before the run completed'); })]);
    out.runMs = Math.floor(performance.now() - began);
    // The Windows wrapper outlives its artifact while retiring its owned Job.
    // Finish the full original 60-second sample interval before deliberate quit.
    if(isolated?.subject?.kind==='windows-held-process-v1'){clearInterval(samplingTimer);await pendingSample;}
    closeProjection();
    if (exited || disconnected) throw new Error('the checked build did not remain connected');
    isolated?.assertHealthy?.();await requireEffect();isolated?.beginShutdown?.();
    await bridge!.requestSave('interval'); out.requestedSave = true;
    const beforeQuit = out.saveReasons.length;
    await bridge!.request({ type: 'quit', reason: 'leaving' });
    out.quitSaved = out.saveReasons.slice(beforeQuit).includes('leaving');isolated?.assertHealthy?.();
  } catch { out.failure = signal?.aborted ? 'the build check was cancelled' : 'the launch, connection, or save lifecycle did not complete'; }
  finally {
    binding.refuse();stop.abort(); closeProjection(); clearTimeout(admission); clearInterval(samplingTimer); signal?.removeEventListener('abort', abort);
    await pendingSample;await pendingStop;bridge?.close();
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>(resolve => server.close(() => resolve()));
    if(isolated?.stop){
      if(!exited){try{await stopOwned('SIGTERM');}catch{cleanupFailures.push('OWNED_STOP_REFUSED');}await Promise.race([exit,delay(ADMISSION_MS)]);}
      if(!exited){try{await stopOwned('SIGKILL');}catch{cleanupFailures.push('OWNED_STOP_REFUSED');}await Promise.race([exit,delay(1000)]);}
      await settleCheckIsolation(isolated,cleanupFailures);
      if(!exited)cleanupFailures.push('OWNED_WRAPPER_ABSENCE_UNCONFIRMED');out.cleanup={qualified:cleanupFailures.length===0,failures:cleanupFailures};
      if(cleanupFailures.length)out.failure??='the owned isolation cleanup did not qualify';
    }else{
      if (!exited) child.kill();
      // Retain the existing direct-child Mac/default lifecycle.
      const force = setTimeout(() => child.kill('SIGKILL'), ADMISSION_MS);
      try { await exit; } finally { clearTimeout(force); await isolated?.dispose(); }
    }
  }
  out.endpoints = [...new Set(out.endpoints)].sort();
  out.observedEndpoints = [...new Set(out.observedEndpoints)].sort();
  return out;
}

/** Runs one declared target. Queue, account routing, isolation, and signing remain the caller's obligations. */
export async function runBuildCheck(plan: CheckPlan, services: CheckServices, signal?: AbortSignal, isolation?: CheckLaunchIsolation): Promise<BuildCheckEvidence> {
  let scan: StaticEvidence | undefined; let launch: LaunchEvidence | undefined;
  let prepared = false;
  try {
    const manifest = Manifest.parse(plan.manifest); const target = BuildTarget.parse(plan.target);
    if (!plan.folder || !plan.version || !manifest.asks) throw new Error('the check needs an immutable folder version and asks');
    validateFiles(plan.files); folderPath(plan.entryPath);
    const prefix = manifest.entry?.installs?.[target];
    if (!prefix || !under(plan.entryPath, folderPath(prefix)) || !plan.files.some(file => file.path === plan.entryPath && file.executable)) throw new Error('the target has no executable entry');
    if (requiresPlayerProjection(target, manifest) && !validPlayerProjectionEntry(plan, manifest)) {
      throw new Error('the installed player projection does not have its exact executable and immutable web entry');
    }
    scan = await scanTree(plan.root, plan.files, target, manifest, plan.providerHosts);
    const manifestFile = plan.files.find(file => file.path === 'manifest.json');
    const manifestBytes = await readFile(await checkedPath(plan.root, 'manifest.json'));
    if (!manifestFile || createHash('sha256').update(manifestBytes).digest('hex') !== manifestFile.sha256) throw new Error('the checked manifest is not in the immutable tree');
    const actual = Manifest.parse(JSON.parse(manifestBytes.toString('utf8')));
    const stable = (value: unknown) => JSON.stringify(value, (_key, part) => part && typeof part === 'object' && !Array.isArray(part) ? Object.fromEntries(Object.entries(part).sort(([a], [b]) => a.localeCompare(b))) : part);
    if (stable(actual) !== stable(manifest)) throw new Error('the supplied manifest differs from the checked tree');
    prepared = true;
    launch = await launchBuild(plan, manifest, services, signal, isolation);
  } catch { if (!prepared) scan = undefined; /* Invalid input or a changed tree cannot produce an entry or launch pass. */ }
  if (signal?.aborted && launch) launch.failure = 'the build check was cancelled';
  const gated = { sign: services.sign ? async (input: Parameters<NonNullable<CheckServices['sign']>>[0]) => {
    signal?.throwIfAborted(); const result = await services.sign!(input); signal?.throwIfAborted(); return result;
  } : undefined };
  const rows = await checkRows(plan, scan, launch, gated);
  return { folder: plan.folder, version: plan.version, target: plan.target, rows, passed: rows.every(row => row.result === 'pass') };
}
