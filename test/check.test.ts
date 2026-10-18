import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection, createServer } from 'node:net';
import { once } from 'node:events';
import { CHECK_LINES, checkRows, runBuildCheck, type CheckPlan, type CheckServices } from '../check/runner.js';
import { declaredBuildPrefixes, folderPath, hostAllowed, namedHost, MAX_HOST_FINDINGS, scanTree, validateFiles, type CheckFile } from '../check/scan.js';
import { parseLinuxSockets, parseMacNetstat, parseWindowsNetstat, resolveNetworkAsk, sampleSockets } from '../check/sockets.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function tree(entries: Record<string, string | Buffer>, executables: string[] = []) {
  const root = await mkdtemp(join(tmpdir(), 'kestrel-check-')); roots.push(root);
  const files: CheckFile[] = [];
  for (const [path, text] of Object.entries(entries)) {
    const bytes = Buffer.from(text); await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), bytes); await chmod(join(root, path), executables.includes(path) ? 0o755 : 0o644);
    files.push({ path, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), executable: executables.includes(path) });
  }
  return { root, files };
}
const manifest = { name: 'Kestrel Yards', kind: 'reality', version: '1.0.0', owner: '@mercerpress', entry: { installs: { server: 'build/server' } }, asks: { saves: true } };
const plan: CheckPlan = { root: '', folder: 'kestrel', version: 'version-1', target: 'server', manifest, entryPath: 'build/server/run', files: [{ path: 'build/server/run', size: 1, sha256: 'a'.repeat(64), executable: true }], providerHosts: ['provider.example'] };
const scan = { verifiedFiles: 1, hosts: [], providerHosts: [], archives: [], outsideExecutables: [], hostFindings: [], hostFindingCount: 0, hostFindingsComplete: true };
const launch = { admitted: true, runMs: 60000, requestedSave: true, savedVersions: ['v2', 'v3'], saveReasons: ['interval', 'leaving'], quitSaved: true, modelJobs: [], modelFailures: 0, refused: 0, endpoints: [], observedEndpoints: ['127.0.0.1:1234'], sdkSamples: 240, samples: 240, sampleErrors: 0, missedSamples: 0, sampler: 'fixture' };

describe('E17 evidence does not invent passes', () => {
  it('keeps the six recorded names in order, and keeps unsigned checks pending', async () => {
    const rows = await checkRows(plan, scan, launch, {});
    expect(rows.map(row => row.name)).toEqual(CHECK_LINES); expect(rows.map(row => row.line)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows.map(row => row.result)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass', 'pending']);
  });
  it('signs only after all five prerequisites and both scans pass', async () => {
    const sign = vi.fn<NonNullable<CheckServices['sign']>>(async input => ({ signature: 'synthetic-service-acknowledgment', fileListSha256: input.fileListSha256 }));
    const failed = await checkRows(plan, scan, { ...launch, runMs: 59999 }, { sign });
    expect(failed[1]!.result).toBe('fail'); expect(failed[5]!.result).toBe('pending'); expect(sign).not.toHaveBeenCalled();
    const passed = await checkRows(plan, scan, launch, { sign });
    expect(passed.every(row => row.result === 'pass')).toBe(true); expect(sign).toHaveBeenCalledOnce();
    expect(sign.mock.calls[0]![0]).toMatchObject({ domain: 'ew.build-files.v1', folder: 'kestrel', version: 'version-1', target: 'server', prefix: 'build/server', entry: plan.entryPath });
    const input = sign.mock.calls[0]![0]; expect(input.fileListSha256).toBe(createHash('sha256').update(input.payload).digest('hex'));
    expect(JSON.parse(input.payload)).toMatchObject({ prefix: 'build/server', entry: plan.entryPath, files: plan.files });
    expect(Object.isFrozen(input)).toBe(true); expect(Object.isFrozen(input.files[0])).toBe(true);
    expect(input.prerequisiteRows.map(row => row.line)).toEqual([1, 2, 3, 4, 5]); expect(input.prerequisiteRows.every(row => row.result === 'pass')).toBe(true);
    expect(Object.isFrozen(input.prerequisiteRows[2]!.evidence)).toBe(true); expect(input.prerequisiteRows[2]!.evidence.savedVersions).toEqual(['v2', 'v3']);
    expect(input.prerequisiteRows[2]!.evidence).not.toBe(passed[2]!.evidence);
    expect(passed[5]!.evidence).toMatchObject({ payload: input.payload, fileListSha256: input.fileListSha256 });
  });
  it('refuses a signing acknowledgment for different canonical bytes', async () => {
    const sign = vi.fn<NonNullable<CheckServices['sign']>>(async () => ({ signature: 'synthetic-service-acknowledgment', fileListSha256: 'b'.repeat(64) }));
    const rows = await checkRows(plan, scan, launch, { sign }); expect(sign).toHaveBeenCalledOnce(); expect(rows[5]!.result).toBe('fail');
  });
  it('refuses invalid portable entry metadata before invoking the signer', async () => {
    const sign = vi.fn<NonNullable<CheckServices['sign']>>(async input => ({ signature: 'synthetic-service-acknowledgment', fileListSha256: input.fileListSha256 }));
    const entryPath = 'build/server/CON.exe'; const bad = { ...plan, entryPath, files: [{ ...plan.files[0]!, path: entryPath }] };
    const rows = await checkRows(bad, scan, launch, { sign }); expect(sign).not.toHaveBeenCalled(); expect(rows[5]!.result).toBe('fail');
  });
  it('refuses a success without the observed SDK socket, requested save, and final leaving save', async () => {
    const rows = await checkRows(plan, scan, { ...launch, sdkSamples: 0, requestedSave: false, quitSaved: false }, {});
    expect(rows[2]!.result).toBe('fail'); expect(rows[4]!.result).toBe('fail');
  });
  it.each([{ sampleErrors: 1 }, { missedSamples: 1 }, { refused: 1 }, { endpoints: ['127.0.0.1:9999'] }])('fails observed reach gaps %j', async patch => {
    const rows = await checkRows(plan, scan, { ...launch, ...patch }, {}); expect(rows[4]!.result).toBe('fail');
  });
  it('fails provider literals, failed model routes, undeclared static reach, archives and misplaced executables', async () => {
    const rows = await checkRows(plan, { ...scan, hosts: ['not-granted.example'], providerHosts: ['provider.example'], archives: ['payload.zip'], outsideExecutables: ['other/run'] }, { ...launch, modelFailures: 1 }, {});
    expect(rows.slice(3).map(row => row.result)).toEqual(['fail', 'fail', 'fail']);
  });
  it('does not sign when the signing service fails or returns an incomplete acknowledgment', async () => {
    expect((await checkRows(plan, scan, launch, { sign: async () => ({ signature: '', fileListSha256: '' }) }))[5]!.result).toBe('fail');
  });
});

describe('E17 file evidence', () => {
  it('checks actual hashes and modes and finds static host and provider literals', async () => {
    const fixture = await tree({ 'build/server/run': 'fetch("https://provider.example:443/api");', 'manifest.json': '{}' }, ['build/server/run']);
    const evidence = await scanTree(fixture.root, fixture.files, 'server', manifest, ['provider.example']);
    expect(evidence.providerHosts).toContain('provider.example:443'); expect(evidence.verifiedFiles).toBe(2);
    expect(hostAllowed('provider.example:443', ['provider.example'])).toBe(true);
    expect(hostAllowed('provider.example:444', ['provider.example:443'])).toBe(false);
    expect(hostAllowed('provider.example.evil:443', ['provider.example'])).toBe(false);
  });
  it('detects archive magic and native executables even when their names and mode conceal their type', async () => {
    const fixture = await tree({ 'build/server/run': 'ordinary', 'payload.dat': Buffer.from([0x50, 0x4b, 5, 6]), 'other/data': Buffer.from([0x7f, 0x45, 0x4c, 0x46]) }, ['build/server/run']);
    const evidence = await scanTree(fixture.root, fixture.files, 'server', manifest, []);
    expect(evidence.archives).toEqual(['payload.dat']); expect(evidence.outsideExecutables).toEqual(['other/data']);
  });
  it('refuses changed bytes, escaping links, traversal, and case-colliding paths', async () => {
    const fixture = await tree({ 'build/server/run': 'a' }, ['build/server/run']);
    await writeFile(join(fixture.root, 'build/server/run'), 'b');
    await expect(scanTree(fixture.root, fixture.files, 'server', manifest, [])).rejects.toThrow('differs');
    await rm(join(fixture.root, 'build/server/run')); await symlink('/dev/null', join(fixture.root, 'build/server/run'));
    await expect(scanTree(fixture.root, fixture.files, 'server', manifest, [])).rejects.toThrow('link');
    for (const path of ['../run', '/run', 'a//b', 'a/./b', 'a\\b', 'C:/run']) expect(() => folderPath(path)).toThrow();
    expect(() => validateFiles([plan.files[0]!, { ...plan.files[0]!, path: 'BUILD/server/run' }])).toThrow('duplicate');
  });
  it('does not launch an undeclared or corrupt target', async () => {
    const fixture = await tree({ 'build/server/run': '#!/bin/sh\nexit 1' }, ['build/server/run']);
    const save = vi.fn();
    const result = await runBuildCheck({ ...plan, ...fixture, entryPath: 'outside/run' }, { save });
    expect(result.passed).toBe(false); expect(result.rows[1]!.result).toBe('fail'); expect(save).not.toHaveBeenCalled();
  });
  it.skipIf(process.platform === 'win32')('cancels an admitted local process promptly and does not copy arbitrary parent environment', async () => {
    const source = `#!${process.execPath}\nif(process.env.EW_CHECK_FIXTURE_SECRET) process.exit(9);\nconst socket=new WebSocket(process.env.EW_SDK_URL);\nsocket.addEventListener('open',()=>{socket.send(JSON.stringify({token:process.env.EW_SDK_TOKEN}));socket.send(JSON.stringify({ew:1,type:'ready',protocol:1}));});\n`;
    const fixture = await tree({ 'build/server/run': source, 'manifest.json': JSON.stringify(manifest) }, ['build/server/run']);
    const previous = process.env.EW_CHECK_FIXTURE_SECRET; process.env.EW_CHECK_FIXTURE_SECRET = 'synthetic-fixture-value';
    const save = vi.fn(async () => ({ version: 'fixture-save', seq: 1, at: '2026-10-15T00:00:00Z' }));
    try {
      const result = await runBuildCheck({ ...plan, ...fixture }, { save }, AbortSignal.timeout(500));
      expect(result.rows[1]!.evidence.admitted).toBe(true);
      expect(result.rows[1]!.result).toBe('fail'); expect(result.rows[5]!.result).toBe('pending');
      expect(save).not.toHaveBeenCalled();
    } finally { if (previous === undefined) delete process.env.EW_CHECK_FIXTURE_SECRET; else process.env.EW_CHECK_FIXTURE_SECRET = previous; }
  });
  it.skipIf(process.platform === 'win32')('rejects a wrong first-frame token in an actual local child', async () => {
    const source = `#!${process.execPath}\nconst socket=new WebSocket(process.env.EW_SDK_URL);socket.addEventListener('open',()=>socket.send(JSON.stringify({token:'synthetic-wrong-token'})));socket.addEventListener('close',()=>process.exit(0));\n`;
    const fixture = await tree({ 'build/server/run': source, 'manifest.json': JSON.stringify(manifest) }, ['build/server/run']);
    const result = await runBuildCheck({ ...plan, ...fixture }, { save: async () => undefined }, AbortSignal.timeout(2000));
    expect(result.rows[1]!.evidence.admitted).toBe(false); expect(result.rows[1]!.result).toBe('fail');
  });
  it.skipIf(process.platform === 'win32')('consumes a correct first-frame token once in an actual local child', async () => {
    const source = `#!${process.execPath}\nimport {writeFileSync} from 'node:fs';const first=new WebSocket(process.env.EW_SDK_URL);first.addEventListener('open',()=>{first.send(JSON.stringify({token:process.env.EW_SDK_TOKEN}));first.send(JSON.stringify({ew:1,type:'ready',protocol:1}));});first.addEventListener('message',event=>{if(JSON.parse(event.data).type!=='grant')return;const second=new WebSocket(process.env.EW_SDK_URL);second.addEventListener('open',()=>second.send(JSON.stringify({token:process.env.EW_SDK_TOKEN})));second.addEventListener('message',()=>{writeFileSync('probe.txt','admitted');process.exit(9);});second.addEventListener('close',()=>{writeFileSync('probe.txt','refused');process.exit(0);});});\n`;
    const fixture = await tree({ 'build/server/run': source, 'manifest.json': JSON.stringify(manifest) }, ['build/server/run']);
    const result = await runBuildCheck({ ...plan, ...fixture }, { save: async () => undefined }, AbortSignal.timeout(2000));
    expect(result.rows[1]!.evidence.admitted).toBe(true);
    expect(await readFile(join(fixture.root, 'probe.txt'), 'utf8')).toBe('refused');
    expect(result.rows[1]!.result).toBe('fail');
  });
  it('refuses supplied asks that differ from the actual immutable manifest', async () => {
    const fixture = await tree({ 'build/server/run': '#!/bin/sh\nexit 1', 'manifest.json': JSON.stringify({ ...manifest, asks: { saves: false } }) }, ['build/server/run']);
    const result = await runBuildCheck({ ...plan, ...fixture }, { save: async () => undefined });
    expect(result.rows[0]!.result).toBe('fail'); expect(result.rows[1]!.evidence.admitted).toBe(false);
  });
});

describe('E17 socket sampling', () => {
  it('filters Windows and Linux socket rows by the launched process', () => {
    expect(parseWindowsNetstat('TCP 127.0.0.1:10 127.0.0.1:20 ESTABLISHED 123\nTCP 127.0.0.1:11 127.0.0.1:21 ESTABLISHED 456', 123)).toEqual(['127.0.0.1:20']);
    expect(parseLinuxSockets('header\n0: 0100007F:000A 0100007F:0014 01 0:0 0:0 0 0 0 999\n1: 0100007F:000A 0100007F:0015 01 0:0 0:0 0 0 0 888', new Set(['999']))).toEqual(['127.0.0.1:20']);
    expect(parseMacNetstat('Proto Local Address Foreign Address (state) rxbytes txbytes rhiwat shiwat process:pid state\ntcp4 0 0 127.0.0.1.10 127.0.0.1.20 ESTABLISHED 0 0 100 100 node:123 0\ntcp4 0 0 127.0.0.1.11 127.0.0.1.21 ESTABLISHED 0 0 100 100 node:456 0', 123)).toEqual(['127.0.0.1:20']);
  });
  it('matches a declared local hostname to its sampled IP without widening its explicit port', async () => {
    const allowed = await resolveNetworkAsk(['localhost:1234']);
    expect(hostAllowed('127.0.0.1:1234', allowed)).toBe(true);
    expect(hostAllowed('127.0.0.1:4321', allowed)).toBe(false);
    expect(hostAllowed('[0:0:0:0:0:0:0:1]:1234', ['[::1]:1234'])).toBe(true);
  });
  it('observes an actual local socket owned by this process', async () => {
    const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('fixture did not listen');
    const accepted = once(server, 'connection'); const client = createConnection(address.port, '127.0.0.1');
    const connected = once(client, 'connect'); const [peer] = await accepted; await connected;
    try { expect((await sampleSockets(process.pid)).endpoints).toContain(`127.0.0.1:${address.port}`); }
    finally { client.destroy(); peer.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});

describe('E17 manifest-derived target confinement', () => {
  const multi = { ...manifest, entry: { installs: { server: 'build/server', 'linux-x64': 'build/linux' } } };
  it('accepts sibling declared executables and only scans active payload host literals', async () => {
    const fixture = await tree({ 'build/server/run': '#!/bin/sh\nexit 0', 'build/linux/game': '#!/bin/sh\n# https://provider.example/api\nexit 0' }, ['build/server/run', 'build/linux/game']);
    const evidence = await scanTree(fixture.root, fixture.files, 'server', multi, ['provider.example']);
    expect(evidence.outsideExecutables).toEqual([]); expect(evidence.providerHosts).toEqual([]);
    const active = await scanTree(fixture.root, fixture.files, 'linux-x64', multi, ['provider.example']); expect(active.providerHosts).toEqual(['provider.example']);
  });
  it('still refuses undeclared executable placement and archives inside a sibling target', async () => {
    const fixture = await tree({ 'build/server/run': 'run', 'build/linux/archive.dat': Buffer.from([0x50, 0x4b, 5, 6]), 'other/hidden': Buffer.from([0x7f, 0x45, 0x4c, 0x46]) }, ['build/server/run']);
    const evidence = await scanTree(fixture.root, fixture.files, 'server', multi, []);
    expect(evidence.outsideExecutables).toEqual(['other/hidden']); expect(evidence.archives).toEqual(['build/linux/archive.dat']);
  });
  it('refuses invalid and overlapping target prefixes, including case aliases', () => {
    for (const sibling of ['build/server', 'build/server/nested', 'build', 'BUILD/SERVER', '../outside', '/outside', 'build/CON', 'build//linux']) {
      expect(() => declaredBuildPrefixes({ ...multi, entry: { installs: { server: 'build/server', 'linux-x64': sibling } } }), sibling).toThrow();
    }
    expect(declaredBuildPrefixes(multi)).toEqual(['build/server', 'build/linux']);
  });
});


describe('packaged runtime endpoint classification retains its evidence',()=>{
 it('rejects malformed DNS, IPv4 and ports without exempting valid runtime literals',async()=>{
  const text='https://.css https://.jpg 1.2.840.100 1.3.6.1.4.1 https://runtime.example/docs https://provider.example:443/api';
  const fixture=await tree({'build/server/run':text},['build/server/run']);
  const evidence=await scanTree(fixture.root,fixture.files,'server',manifest,['provider.example']);
  expect(evidence.hosts).toEqual(['provider.example:443','runtime.example']);
  expect(evidence.hostFindingsComplete).toBe(true);
  expect(evidence.hostFindings.some(f=>f.raw==='.css'&&f.reason==='invalid-endpoint')).toBe(true);
  expect(evidence.hostFindings.some(f=>f.raw==='1.3.6.1'&&f.reason==='partial-token')).toBe(true);
  for(const finding of evidence.hostFindings)expect(Buffer.from(text).subarray(finding.offset,finding.offset+finding.rawLength).toString('latin1')).toBe(finding.raw);
  expect((await checkRows(plan,evidence,launch,{}))[4]!.result).toBe('fail');
  for(const value of ['.css','a..com','-bad.com','bad-.com','1.2.840.100','127.0.0.1:65536'])expect(()=>namedHost(value)).toThrow();
  expect(namedHost('[0:0:0:0:0:0:0:1]:00443')).toBe('[::1]:443');expect(namedHost('Runtime.Example.:443')).toBe('runtime.example:443');
 });
 it('uses full URL authority for user info and empty ports without retaining credentials',async()=>{
  const text='https://reader:synthetic@provider.example:/api https://reader:synthetic@[::1]:443/api';
  const fixture=await tree({'build/server/run':text},['build/server/run']);
  const evidence=await scanTree(fixture.root,fixture.files,'server',manifest,['provider.example']);
  expect(evidence.hosts).toEqual(['[::1]:443','provider.example']);expect(evidence.providerHosts).toEqual(['provider.example']);
  expect(evidence.hostFindings.every(f=>!f.raw.includes('synthetic'))).toBe(true);
  for(const f of evidence.hostFindings)expect(Buffer.from(text).subarray(f.offset,f.offset+f.rawLength).toString()).toBe(f.raw);
 });
 it('finds a boundary-spanning host once with byte-accurate offsets after non-ASCII bytes',async()=>{
  const prefix=Buffer.alloc(65525,0xff),literal=Buffer.from(' https://provider.example:443/path '),bytes=Buffer.concat([prefix,literal,Buffer.alloc(10000,0)]);
  const fixture=await tree({'build/server/run':bytes},['build/server/run']);
  const evidence=await scanTree(fixture.root,fixture.files,'server',manifest,['provider.example']);
  expect(evidence.hosts).toEqual(['provider.example:443']);expect(evidence.hostFindings).toHaveLength(1);
  const finding=evidence.hostFindings[0]!;expect(finding.offset).toBe(prefix.length+9);expect(bytes.subarray(finding.offset,finding.offset+finding.rawLength).toString()).toBe('provider.example:443');
 });
 it('marks an oversized authority token incomplete instead of losing it at the streaming boundary',async()=>{
  const fixture=await tree({'build/server/run':'https://'+'a'.repeat(70000)+'@provider.example/path'},['build/server/run']);
  const evidence=await scanTree(fixture.root,fixture.files,'server',manifest,['provider.example']);
  expect(evidence.hostFindingsComplete).toBe(false);expect((await checkRows(plan,evidence,launch,{}))[4]!.result).toBe('fail');
 });
 it('keeps signing unavailable when occurrence evidence exceeds its explicit capacity',async()=>{
  const fixture=await tree({'build/server/run':Array(MAX_HOST_FINDINGS+1).fill('https://runtime.example ').join('')},['build/server/run']);
  const evidence=await scanTree(fixture.root,fixture.files,'server',manifest,[]);
  expect(evidence.hostFindings).toHaveLength(MAX_HOST_FINDINGS);expect(evidence.hostFindingCount).toBe(MAX_HOST_FINDINGS+1);expect(evidence.hostFindingsComplete).toBe(false);
  const sign=vi.fn(),permitted={...plan,manifest:{...manifest,asks:{...manifest.asks,network:['runtime.example']}}};
  const rows=await checkRows(permitted,evidence,launch,{sign});expect(rows[4]!.result).toBe('fail');expect(rows[5]!.result).toBe('pending');expect(sign).not.toHaveBeenCalled();
 });
});
