import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { HostBridge, Manifest, BuildTarget, type HostHandlers, type Transport } from '@emergent-worlds/host';
import { WebSocketServer, type WebSocket } from 'ws';
import { checkedPath, folderPath, hostAllowed, scanTree, under, validateFiles, type CheckFile, type StaticEvidence } from './scan.js';
import { resolveNetworkAsk, sampleSockets } from './sockets.js';
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
export interface CheckServices {
  /** Commits the game's complete save through the check account's ordinary platform route. */
  save: NonNullable<HostHandlers['save']>;
  modelCall?: HostHandlers['modelCall'];
  /** Integration owns canonical encoding and the builds key. Never called before every prerequisite passes. */
  sign?: (input: { folder: string; version: string; target: string; files: readonly CheckFile[] }) => Promise<{ signature: string; fileListSha256: string }>;
}
export interface BuildCheckEvidence { folder: string; version: string; target: string; rows: CheckRow[]; passed: boolean }
interface LaunchEvidence {
  admitted: boolean; runMs: number; requestedSave: boolean; savedVersions: string[]; saveReasons: string[];
  quitSaved: boolean; modelJobs: string[]; modelFailures: number; refused: number;
  endpoints: string[]; observedEndpoints: string[]; sdkSamples: number; samples: number; sampleErrors: number; missedSamples: number;
  sampler: string; failure?: string;
}

/** Pure aggregation keeps missing observations and missing signing evidence visibly pending. */
export async function checkRows(plan: CheckPlan, scan: StaticEvidence | undefined, launch: LaunchEvidence | undefined, services: Pick<CheckServices, 'sign'>): Promise<CheckRow[]> {
  const manifest = Manifest.safeParse(plan.manifest);
  const prefix = manifest.success ? manifest.data.entry?.installs?.[plan.target as BuildTarget] : undefined;
  const entry = Boolean(prefix && under(plan.entryPath, prefix) && plan.files.some(file => file.path === plan.entryPath && file.executable));
  const row = (line: number, result: CheckResult, evidence: Record<string, unknown>): CheckRow => ({ line, name: CHECK_LINES[line - 1]!, result, evidence });
  const fullRun = Boolean(launch?.admitted && launch.runMs >= CHECK_DURATION_MS && !launch.failure);
  const network = manifest.success ? manifest.data.asks?.network ?? [] : [];
  const staticDenied = scan?.hosts.filter(host => !hostAllowed(host, network)) ?? [];
  const rows = [
    row(1, entry && scan ? 'pass' : 'fail', { entry: plan.entryPath, prefix: prefix ?? null, verifiedFiles: scan?.verifiedFiles ?? 0 }),
    row(2, fullRun ? 'pass' : 'fail', { admitted: launch?.admitted ?? false, runMs: launch?.runMs ?? 0, requiredMs: CHECK_DURATION_MS, failure: launch?.failure ?? null }),
    row(3, fullRun && launch?.requestedSave && launch.savedVersions.length > 0 && launch.quitSaved ? 'pass' : 'fail', { requestedSave: launch?.requestedSave ?? false, savedVersions: launch?.savedVersions ?? [], quitSaved: launch?.quitSaved ?? false }),
    row(4, fullRun && scan && scan.providerHosts.length === 0 && launch?.modelFailures === 0 ? 'pass' : 'fail', { staticProviderHosts: scan?.providerHosts ?? [], modelJobs: launch?.modelJobs ?? [], failedRoutes: launch?.modelFailures ?? 0 }),
    row(5, fullRun && scan && staticDenied.length === 0 && launch && launch.refused === 0 && launch.sampleErrors === 0 && launch.missedSamples === 0 && launch.sdkSamples > 0 && launch.endpoints.length === 0 ? 'pass' : 'fail', { staticDenied, observedConnections: launch?.observedEndpoints ?? [], deniedConnections: launch?.endpoints ?? [], samples: launch?.samples ?? 0, sdkSamples: launch?.sdkSamples ?? 0, sampleErrors: launch?.sampleErrors ?? 0, missedSamples: launch?.missedSamples ?? 0, sampler: launch?.sampler ?? null, sampleEveryMs: SOCKET_SAMPLE_MS, refusedMessages: launch?.refused ?? 0, limits: 'Static literals and sampled TCP sockets of the launched process; no sandbox or child-process coverage is asserted.' }),
  ];
  const scanPass = Boolean(scan && scan.archives.length === 0 && scan.outsideExecutables.length === 0);
  if (!scanPass) rows.push(row(6, 'fail', { archives: scan?.archives ?? [], outsideExecutables: scan?.outsideExecutables ?? [], signed: false }));
  else if (rows.some(item => item.result !== 'pass') || !services.sign) rows.push(row(6, 'pending', { scanPassed: true, signed: false, reason: services.sign ? 'prerequisites have not passed' : 'signing integration is pending' }));
  else {
    try {
      const signed = await services.sign!({ folder: plan.folder, version: plan.version, target: plan.target, files: plan.files.filter(file => under(file.path, prefix!)) });
      if (!signed.signature || !/^[a-f0-9]{64}$/.test(signed.fileListSha256)) throw new Error('invalid signing acknowledgment');
      rows.push(row(6, 'pass', { scanPassed: true, signed: true, fileListSha256: signed.fileListSha256, signature: signed.signature }));
    } catch { rows.push(row(6, 'fail', { scanPassed: true, signed: false, reason: 'the signing service did not confirm a signature' })); }
  }
  return rows;
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

async function launchBuild(plan: CheckPlan, manifest: Manifest, services: CheckServices, signal?: AbortSignal): Promise<LaunchEvidence> {
  const out: LaunchEvidence = { admitted: false, runMs: 0, requestedSave: false, savedVersions: [], saveReasons: [], quitSaved: false, modelJobs: [], modelFailures: 0, refused: 0, endpoints: [], observedEndpoints: [], sdkSamples: 0, samples: 0, sampleErrors: 0, missedSamples: 0, sampler: '' };
  const entry = await checkedPath(plan.root, plan.entryPath);
  const allowedEndpoints = await resolveNetworkAsk(manifest.asks!.network);
  const token = randomBytes(32).toString('base64url');
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0, maxPayload: FRAME_BYTES, perMessageDeflate: false });
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('the local check listener did not open');
  const sdkEndpoint = `127.0.0.1:${address.port}`;
  let bridge: HostBridge | undefined; let consumed = false; let disconnected = false;
  let accept!: () => void; let reject!: (error: Error) => void;
  const ready = new Promise<void>((yes, no) => { accept = yes; reject = no; });
  const admission = setTimeout(() => reject(new Error('the checked build did not reach the SDK within its admission window')), ADMISSION_MS);
  server.on('connection', socket => {
    socket.on('error', () => { /* Connection failures are reported through admission or closure. */ });
    if (consumed) { socket.close(1008); return; }
    socket.once('message', (data, binary) => {
      let valid = false;
      try { valid = !binary && !consumed && JSON.parse(data.toString()).token === token; } catch { /* Refuse malformed first frames. */ }
      if (!valid) { socket.close(1008); return; }
      consumed = true;
      socket.once('close', () => { disconnected = true; });
      bridge = new HostBridge(socketTransport(socket), manifest.asks!, {
        ready: () => {
          if (out.admitted) { out.refused++; return; }
          out.admitted = true;
          bridge!.send({ type: 'grant', asks: manifest.asks!, session: 'build-check', headless: true, version: { id: plan.version, seq: 0 }, files: plan.files.map(({ path, size, sha256 }) => ({ path, size, sha256 })), display: { theme: 'light', textSize: 'default', contrast: 'default', motion: 'full', language: 'en' } });
          accept();
        },
        fileRead: async path => {
          if (!plan.files.some(file => file.path === path)) throw new Error('the file is outside the check tree');
          return { data: (await readFile(await checkedPath(plan.root, path))).toString('base64') };
        },
        save: async message => {
          const result = await services.save(message) as { version?: unknown; seq?: unknown; at?: unknown };
          if (typeof result?.version !== 'string' || !result.version || !Number.isSafeInteger(result.seq) || (result.seq as number) < 0 || typeof result.at !== 'string' || !Number.isFinite(Date.parse(result.at))) throw new Error('the platform did not confirm the checked save');
          out.savedVersions.push(result.version); out.saveReasons.push(message.reason); return result;
        },
        modelCall: async (message, part, abort) => {
          out.modelJobs.push(message.job);
          try { if (!services.modelCall) throw new Error('the check model route is unavailable'); return await services.modelCall(message, part, abort); }
          catch { out.modelFailures++; throw new Error('the checked model route did not complete'); }
        },
        refused: () => { out.refused++; },
      }, ADMISSION_MS, 'core');
    });
  });
  const child = spawn(entry, [], { cwd: plan.root, env: childEnvironment(`ws://${sdkEndpoint}/`, token), stdio: 'ignore', windowsHide: true });
  const stop = new AbortController();
  const runSignal = signal ? AbortSignal.any([stop.signal, signal]) : stop.signal;
  let exited = false; let sampling = false; let pendingSample: Promise<void> = Promise.resolve();
  const exit = new Promise<void>(resolve => { child.once('exit', () => { exited = true; resolve(); }); child.once('error', () => { exited = true; reject(new Error('the checked build could not start')); resolve(); }); });
  child.once('exit', () => reject(new Error('the checked build exited before admission')));
  const samplingTimer = setInterval(() => {
    if (sampling) { out.missedSamples++; return; }
    if (!child.pid || exited) return;
    sampling = true;
    pendingSample = sampleSockets(child.pid).then(sample => {
      out.samples++; out.sampler = sample.method;
      out.observedEndpoints.push(...sample.endpoints);
      if (sample.endpoints.includes(sdkEndpoint)) out.sdkSamples++;
      for (const endpoint of sample.endpoints) if (endpoint !== sdkEndpoint && !hostAllowed(endpoint, allowedEndpoints)) out.endpoints.push(endpoint);
    }, () => { if (!exited) out.sampleErrors++; }).finally(() => { sampling = false; });
  }, SOCKET_SAMPLE_MS);
  const abort = () => { reject(new Error('the build check was cancelled')); bridge?.close(); if (!exited) child.kill(); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) throw new Error('the build check was cancelled');
    await ready; clearTimeout(admission);
    const began = performance.now();
    await Promise.race([delay(CHECK_DURATION_MS, undefined, { signal: runSignal }), exit.then(() => { throw new Error('the checked build exited before the run completed'); })]);
    out.runMs = Math.floor(performance.now() - began);
    if (exited || disconnected) throw new Error('the checked build did not remain connected');
    await bridge!.requestSave('interval'); out.requestedSave = true;
    const beforeQuit = out.saveReasons.length;
    await bridge!.request({ type: 'quit', reason: 'leaving' });
    out.quitSaved = out.saveReasons.slice(beforeQuit).includes('leaving');
  } catch { out.failure = signal?.aborted ? 'the build check was cancelled' : 'the launch, connection, or save lifecycle did not complete'; }
  finally {
    stop.abort(); clearTimeout(admission); clearInterval(samplingTimer); signal?.removeEventListener('abort', abort);
    await pendingSample; bridge?.close();
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (!exited) child.kill();
    // The child has already answered quit; force cleanup if it does not terminate.
    const force = setTimeout(() => child.kill('SIGKILL'), ADMISSION_MS);
    try { await exit; } finally { clearTimeout(force); }
  }
  out.endpoints = [...new Set(out.endpoints)].sort();
  out.observedEndpoints = [...new Set(out.observedEndpoints)].sort();
  return out;
}

/** Runs one declared target. Queue, account routing, isolation, and signing remain the caller's obligations. */
export async function runBuildCheck(plan: CheckPlan, services: CheckServices, signal?: AbortSignal): Promise<BuildCheckEvidence> {
  let scan: StaticEvidence | undefined; let launch: LaunchEvidence | undefined;
  let prepared = false;
  try {
    const manifest = Manifest.parse(plan.manifest); const target = BuildTarget.parse(plan.target);
    if (!plan.folder || !plan.version || !manifest.asks) throw new Error('the check needs an immutable folder version and asks');
    validateFiles(plan.files); folderPath(plan.entryPath);
    const prefix = manifest.entry?.installs?.[target];
    if (!prefix || !under(plan.entryPath, folderPath(prefix)) || !plan.files.some(file => file.path === plan.entryPath && file.executable)) throw new Error('the target has no executable entry');
    scan = await scanTree(plan.root, plan.files, prefix, plan.providerHosts);
    const manifestFile = plan.files.find(file => file.path === 'manifest.json');
    const manifestBytes = await readFile(await checkedPath(plan.root, 'manifest.json'));
    if (!manifestFile || createHash('sha256').update(manifestBytes).digest('hex') !== manifestFile.sha256) throw new Error('the checked manifest is not in the immutable tree');
    const actual = Manifest.parse(JSON.parse(manifestBytes.toString('utf8')));
    const stable = (value: unknown) => JSON.stringify(value, (_key, part) => part && typeof part === 'object' && !Array.isArray(part) ? Object.fromEntries(Object.entries(part).sort(([a], [b]) => a.localeCompare(b))) : part);
    if (stable(actual) !== stable(manifest)) throw new Error('the supplied manifest differs from the checked tree');
    prepared = true;
    launch = await launchBuild(plan, manifest, services, signal);
  } catch { if (!prepared) scan = undefined; /* Invalid input or a changed tree cannot produce an entry or launch pass. */ }
  if (signal?.aborted && launch) launch.failure = 'the build check was cancelled';
  const gated = { sign: services.sign ? async (input: Parameters<NonNullable<CheckServices['sign']>>[0]) => {
    signal?.throwIfAborted(); const result = await services.sign!(input); signal?.throwIfAborted(); return result;
  } : undefined };
  const rows = await checkRows(plan, scan, launch, gated);
  return { folder: plan.folder, version: plan.version, target: plan.target, rows, passed: rows.every(row => row.result === 'pass') };
}
