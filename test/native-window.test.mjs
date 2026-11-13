import { beforeAll, afterAll, it, expect } from 'vitest';
import { buildNativeWindow } from '../scripts/build-native-window.mjs';
import { scanTree } from '../check/scan.ts';
import { reviewedMetadata } from '../check/reviewed-metadata.ts';
import { mkdtemp, rm, mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const supported = process.platform === 'darwin' && process.arch === 'arm64';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const version = '1.0.2';
const prefix = 'build/macos-arm64';
const executable = `${prefix}/KestrelYards.app/Contents/MacOS/KestrelYards`;
const info = `${prefix}/KestrelYards.app/Contents/Info.plist`;
let root, bundle, receipt;

beforeAll(async () => {
  if (!supported) return;
  root = await mkdtemp(join(tmpdir(), 'ew-window-exact-'));
  bundle = join(root, 'KestrelYards.app');
  receipt = await buildNativeWindow(bundle, version);
}, 30_000);
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

it.skipIf(!supported)('binds the current window and refuses dispositions for changed or duplicated bytes', async () => {
  const bytes = await readFile(join(bundle, 'Contents/MacOS/KestrelYards'));
  const record = reviewedMetadata.find(row => row.artifactSha256 === sha(bytes) && row.path === executable);
  expect(record).toBeDefined();
  expect(record.target).toBe('macos-arm64');
  expect(record.artifactSize).toBe(bytes.length);
  expect(sha(bytes.subarray(record.embedded.offset, record.embedded.offset + record.embedded.size))).toBe(receipt.sourceBundleSha256);
  for (const finding of record.occurrences) {
    const context = Buffer.from(finding.context);
    expect(bytes.subarray(finding.offset, finding.offset + finding.rawLength).toString()).toBe(finding.host);
    expect(bytes.subarray(finding.contextOffset, finding.contextOffset + context.length)).toEqual(context);
    expect(sha(context)).toBe(finding.contextSha256);
  }
  const tree = join(root, 'tree');
  await mkdir(join(tree, prefix, 'KestrelYards.app/Contents/MacOS'), { recursive: true });
  const manifest = {
    name: 'Kestrel Yards', kind: 'reality', version, owner: '@mercerpress',
    entry: { installs: { 'macos-arm64': prefix } },
    asks: { saves: true, agent: 'change', input: ['text'], while_away: true },
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const plist = await readFile(join(bundle, 'Contents/Info.plist'));
  expect(sha(plist)).toBe(receipt.bundle.infoPlistSha256);
  await writeFile(join(tree, 'manifest.json'), manifestBytes);
  await writeFile(join(tree, info), plist);
  async function scan(program) {
    await writeFile(join(tree, executable), program);
    await chmod(join(tree, executable), 0o700);
    const files = [
      { path: 'manifest.json', sha256: sha(manifestBytes), size: manifestBytes.length, executable: false },
      { path: executable, sha256: sha(program), size: program.length, executable: true },
      { path: info, sha256: sha(plist), size: plist.length, executable: false },
    ];
    return scanTree(tree, files, 'macos-arm64', manifest, []);
  }
  const exact = await scan(bytes);
  expect(exact.hosts).toEqual([]);
  expect(exact.hostFindingsComplete).toBe(true);
  expect(exact.hostFindings.filter(row => row.reason === 'reviewed-non-network')).toHaveLength(4);

  const changed = Buffer.from(bytes);
  changed[changed.length - 1] ^= 1;
  for (const program of [changed, Buffer.concat([bytes, Buffer.from(' https://127.0.0.1/ ')])]) {
    const unreviewed = await scan(program);
    expect(unreviewed.hosts).toEqual(['127.0.0.1', 't.local']);
    expect(unreviewed.hostFindings.some(row => row.reason === 'reviewed-non-network')).toBe(false);
  }
}, 10_000);
