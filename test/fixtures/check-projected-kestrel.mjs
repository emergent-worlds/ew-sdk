/** Local native Server proof with an ephemeral trust key and exact retained Engine bytes. */
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Asks, canonicalBuildList, EngineInterface, Manifest, REMOTE_PLAYER_PROJECTION_METHODS as methods } from '@emergent-worlds/host';

const [stage, serverLauncher] = process.argv.slice(2);
assert.ok(stage && serverLauncher && isAbsolute(stage) && isAbsolute(serverLauncher));
const { createInstalledCoreLauncher } = await import(pathToFileURL(serverLauncher).href);
const root = join(stage, 'tree');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const tree = files => [...files].map(([path, bytes]) => ({ path, sha256: hash(bytes), size: bytes.length }));
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const expectedEngine = await json(join(stage, 'engine-binding.json'));
const { ref, version: engineVersion } = expectedEngine;
assert.equal(ref, '@emergentworlds/emergence-engine');
assert.equal(expectedEngine.source, '95a4048');
assert.equal(engineVersion, '1.0.0');
const engineFiles = new Map(await Promise.all(['manifest.json', 'interface.json', 'dist/engine.js'].map(async path =>
  [path, await readFile(fileURLToPath(new URL(`../../node_modules/${ref}/${path}`, import.meta.url)))])));
assert.equal(Manifest.parse(JSON.parse(engineFiles.get('manifest.json'))).version, engineVersion);
assert.equal(hash(engineFiles.get('dist/engine.js')), expectedEngine.moduleSha256);
assert.equal(hash(engineFiles.get('interface.json')), expectedEngine.interfaceSha256);
const engine = EngineInterface.parse(JSON.parse(engineFiles.get('interface.json')));
assert.ok(engine.calls.includes('change') && engine.takes.includes('agent.change'));
const engineTree = tree(engineFiles);
const engineTreeSha256 = hash(JSON.stringify(engineTree.sort((left, right) => left.path < right.path ? -1 : 1)
  .map(({ path, sha256, size }) => [path, sha256, size])));
const entry = 'build/server/run';
const files = new Map(await Promise.all([entry, 'manifest.json', 'web/index.html', 'web/page.css', 'web/page.js'].map(async path =>
  [path, await readFile(join(root, path))])));
const nativeBuild = await json(join(stage, 'native-build.json'));
assert.deepEqual(nativeBuild.artifact, { sha256: hash(files.get(entry)), size: files.get(entry).length });
const manifest = Manifest.parse(JSON.parse(files.get('manifest.json')));
assert.equal(manifest.entry.playerProjection, 'ew.remote-player.v1');
assert.equal(manifest.entry.web, 'web/index.html');
assert.equal(manifest.uses[ref], engineVersion);
assert.equal(manifest.asks.players, 2);
const version = { id: 'kestrel-native-save', seq: 1, folderId: 'kestrel-native-folder' };
const engineVersionId = 'engine-sdk-pin-95a4048';
const original = tree(files);
const artifact = { folder: version.folderId, version: version.id };
const payload = canonicalBuildList({ domain: 'ew.build-files.v1', ...artifact, target: 'server', prefix: 'build/server', entry,
  files: [{ ...original.find(file => file.path === entry), executable: true }] });
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyId = randomBytes(8), comment = 'disposable installed Kestrel native fixture';
const signingProof = sign(null, createHash('blake2b512').update(payload).digest(), privateKey);
const signature = `untrusted comment: fixture\n${Buffer.concat([Buffer.from('ED'), keyId, signingProof]).toString('base64')}\ntrusted comment: ${comment}\n${sign(null, Buffer.concat([signingProof, Buffer.from(comment)]), privateKey).toString('base64')}`;
const trust = { publicKey: Buffer.concat([Buffer.from('Ed'), keyId, publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)]).toString('base64'),
  maxDescriptorBytes: 1024 * 1024, maxPayloadBytes: 1024 * 1024, maxTotalBytes: 8 * 1024 * 1024 };
const fence = { serverId: 'kestrel-fixture', sessionId: 'kestrel-session', epoch: 1 };
const clock = { now: () => performance.now() };
const held = { ...fence, validUntilMs: clock.now() + 60_000 };
const exactFence = value => assert.deepEqual({ serverId: value.serverId, sessionId: value.sessionId, epoch: value.epoch }, fence);
const descriptor = { protocol: 'ew.remote-player.v1', calls: ['yard.view', 'yard.assign', 'yard.advance'], inputs: ['text', 'pointer'] };
let current = new Map(files), ready = false, ended = false;
const saves = [];
const platform = {
  async installedBuild(value) { exactFence(value); return { descriptor: { reality: artifact, artifact, build: { payload, signature } }, source: {
    async file(path) { assert.equal(path, entry); return new Response(files.get(entry)).body; },
  } }; },
  async installedProjectionReady(value, proof) {
    exactFence(value);
    assert.deepEqual(proof, { artifact, fileListSha256: hash(payload), descriptorSha256: hash(JSON.stringify(descriptor)) });
    ready = true;
  },
  async tree(id) { assert.equal(id, engineVersionId); return engineTree; },
  async file(id, path) { assert.equal(id, engineVersionId); assert.ok(engineFiles.has(path)); return engineFiles.get(path); },
  async read(path) { assert.ok(current.has(path)); return current.get(path).toString('base64'); },
  async model() { throw new Error('The fixture has no model authority.'); },
  async renew(value) { exactFence(value); return held; },
  async save(value, { reason, files: changed }) {
    exactFence(value);
    const next = new Map();
    for (const file of changed) {
      const bytes = file.data === undefined ? current.get(file.path) : Buffer.from(file.data, 'base64');
      assert.ok(bytes); assert.equal(hash(bytes), file.sha256); next.set(file.path, bytes);
    }
    for (const file of original) assert.equal(hash(next.get(file.path)), file.sha256);
    assert.ok(next.has('state/engine.json'));
    current = next;
    saves.push(reason);
    return { version: `fixture-save-${saves.length}`, seq: saves.length + 1, at: '2026-11-10T00:00:00Z' };
  },
  async end(value, reason) { exactFence(value); assert.equal(reason, 'leaving'); ended = true; },
};
const selectedEngine = { ref, versionId: engineVersionId, treeSha256: engineTreeSha256, interfaceSha256: expectedEngine.interfaceSha256,
  module: engine.module, calls: engine.calls, forecasts: engine.forecasts };
const asks = Asks.parse(manifest.asks);
const directory = await mkdtemp(join(tmpdir(), 'ew-projected-kestrel-'));
const stop = new AbortController();
let running;
try {
  let projection;
  const launch = createInstalledCoreLauncher(platform, trust, (_core, lease, observed) => { exactFence(lease); projection = observed; }, true, true);
  running = await launch({ directory, files: original, startupLease: held, inspectionDeadlineMs: held.validUntilMs,
    resolution: { execution: 'installed', manifest, version, engine: ref, selectedEngine,
      uses: [{ ...selectedEngine, kind: 'engine', version: engineVersion }] },
    grant: { ew: 1, type: 'grant', endpoint: 'core', headless: true, mode: 'server', asks, session: held.sessionId,
      version: { id: version.id, seq: version.seq }, files: original, selectedEngine, uses: [{ ref, version: engineVersion, kind: 'engine' }],
      display: { theme: 'light', textSize: 'default', contrast: 'default', motion: 'full', language: 'en' } },
    lease: async () => held, platform, clock, signal: stop.signal, pace: 'day' });
  assert.ok(ready);
  assert.deepEqual(projection?.descriptor, descriptor);
  assert.equal(projection?.terminal?.ask, 'change');
  const { port, terminal } = projection;
  const core = running.session.terminalCore(terminal.folder, terminal.name, terminal.interface);
  assert.equal(await core.channel.read('values/timber'), 12);
  const views = new Map();
  port.on(methods.notice, ({ sender, notice }) => { if (notice.notice === 'yard.view') views.set(sender, notice.data); });
  const players = [{ sender: 'owner-sender', handle: '@mercerpress', host: true }, { sender: 'guest-sender', handle: '@crowsfeather', host: false }];
  for (const identity of players) {
    assert.equal(await port.call(methods.admit, identity), undefined);
    const [view] = await port.call(methods.snapshot, { sender: identity.sender });
    assert.equal(view.notice, 'yard.view'); assert.equal(view.data.timber, 12);
  }
  async function both(field, value) {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (players.every(({ sender }) => views.get(sender)?.[field] === value)) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Both current player projections did not receive the yard change.');
  }
  const sender = players[1].sender;
  await port.call(methods.call, { sender, call: 'yard.assign', args: 'rigging' });
  await both('assignment', 'rigging');
  await assert.rejects(port.call(methods.call, { sender, call: 'state.read', args: { path: 'values/timber' } }));
  await assert.rejects(port.call(methods.call, { sender, call: 'change.undo' }));
  await core.transaction(async () => {
    const proposal = await core.channel.propose({ intent: 'give the yard timber', ops: [{ op: 'variable.set', id: 'timber', value: 20 }] });
    assert.equal(await core.channel.read('values/timber'), 12);
    await core.channel.apply(proposal.proposal, { by: 'person', decision: 'fixture-decision' });
    assert.equal(await core.channel.read('values/timber'), 20);
    await core.channel.save('own', 'terminal change');
  }, async () => {});
  await both('timber', 20);
  await core.transaction(async () => { await core.channel.undo(); }, async () => {});
  assert.equal(await core.channel.read('values/timber'), 12);
  await both('timber', 12);
  await running.session.stop('leaving');
  assert.ok(ended);
  assert.deepEqual(saves, ['before-change', 'own', 'own', 'leaving']);
  await running.dispose(); running = undefined;
  assert.deepEqual(await readdir(directory), []);
  console.log(JSON.stringify({ passed: true, native: nativeBuild.artifact, engine: expectedEngine, playerSnapshots: 2,
    sharedAssignment: 'rigging', terminalTimber: [12, 20, 12], projectionRefusedPrivateMethods: true, saves,
    productionTrust: false, platformFixture: true, browserRendered: false }));
} finally {
  stop.abort();
  await running?.dispose();
  await rm(directory, { recursive: true, force: true });
}
