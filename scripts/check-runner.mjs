// A first-party lifecycle fixture, not an installable artifact or signed acceptance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBuildCheck } from '../dist/check/runner.js';
const root = await mkdtemp(join(tmpdir(), 'kestrel-check-runner-'));
const entryPath = 'build/server/run';
const source = `#!${process.execPath}\nimport ${JSON.stringify(new URL('../sample/build/headless.mjs', import.meta.url).href)};\n`;
await mkdir(join(root, 'build/server'), { recursive: true });
await writeFile(join(root, entryPath), source); await chmod(join(root, entryPath), 0o755);
const bytes = Buffer.from(source);
const plan = {
  root, folder: 'kestrel-check-fixture', version: 'fixture-1', target: 'server', entryPath,
  manifest: { name: 'Kestrel Yards', kind: 'reality', version: '1.0.0', owner: '@mercerpress', entry: { installs: { server: 'build/server' } }, asks: { saves: true, while_away: true, agent: 'change' } },
  files: [{ path: entryPath, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), executable: true }], providerHosts: [],
};
const manifestBytes = Buffer.from(JSON.stringify(plan.manifest));
await writeFile(join(root, 'manifest.json'), manifestBytes); await chmod(join(root, 'manifest.json'), 0o644);
plan.files.push({ path: 'manifest.json', size: manifestBytes.length, sha256: createHash('sha256').update(manifestBytes).digest('hex'), executable: false });
const stored = new Map([[entryPath, bytes], ['manifest.json', manifestBytes]]); let saves = 0;
const cancelSave = process.argv[2] === 'cancel-save';
const stop = new AbortController(); let saveEntered = 0;
try {
  const evidence = await runBuildCheck(plan, { save: async message => {
    saveEntered++;
    if (cancelSave) { stop.abort(); await new Promise(() => {}); }
    const next = new Map();
    for (const file of message.files) {
      const data = file.data === undefined ? stored.get(file.path) : Buffer.from(file.data, 'base64');
      assert.ok(data); assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256); next.set(file.path, data);
    }
    stored.clear(); for (const [path, data] of next) stored.set(path, data);
    return { version: `fixture-save-${++saves}`, seq: saves, at: new Date().toISOString() };
  } }, stop.signal);
  console.log(JSON.stringify({ cancelledDuringSave: cancelSave, networkEvidence: evidence.rows[4].evidence }));
  if (cancelSave) {
    assert.equal(saveEntered, 1); assert.equal(saves, 0); assert.equal(evidence.rows[1].result, 'fail'); assert.equal(evidence.rows[2].result, 'fail'); assert.equal(evidence.rows[5].result, 'pending');
  } else {
    assert.deepEqual(evidence.rows.map(row => row.result), ['pass', 'pass', 'pass', 'pass', 'pass', 'pending']);
    assert.ok(stored.has('state/engine.json')); assert.equal(saves, 2);
  }
  assert.equal(evidence.passed, false);
  console.log(JSON.stringify({ fixture: 'same real Kestrel engine core through an external local import', cancelledDuringSave: cancelSave, rows: evidence.rows.map(row => ({ line: row.line, result: row.result })), runMs: evidence.rows[1].evidence.runMs, samples: evidence.rows[4].evidence.samples, sdkSamples: evidence.rows[4].evidence.sdkSamples, missedSamples: evidence.rows[4].evidence.missedSamples, saves, signed: false, artifactAcceptance: false }));
} finally { await rm(root, { recursive: true, force: true }); }
