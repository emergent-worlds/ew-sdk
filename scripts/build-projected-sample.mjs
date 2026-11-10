/** Package the opt-in native Kestrel server and its licensed App page in a fresh tree. */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNativeHeadless } from './build-native-headless.mjs';

const local = path => fileURLToPath(new URL(`../${path}`, import.meta.url));
const source = path => JSON.stringify(local(path));
const engineRef = '@emergentworlds/emergence-engine';
const selectedEngine = '1.0.0';
const engineSource = '95a4048';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const retained = {
  bundleSha256: '2e9bfc43b8a610796f5f72dc45b923d3d3d0fd0a6a6c9fdfd2b93ec22d9069c6',
  sourceCommit: '82d843e9dffd7f68b63895eb83c1dbee5937aef9',
  releaseCommit: 'a90497e16cbcd1cbcfe59abe995acb5d0b791987',
  treeSha256: '969e0dd22031ee07dd7229d532cc9d541f1e9fef467ea2d34f2996a9268db62e',
  tag: 'v1.0.0-beta.20261020',
  files: {
    'manifest.json': '6f36c253b158cdf235f358ba5ef34668262c99c4245e7d312d78dc5f3870ca03',
    'interface.json': 'f1e6ad99b55a46cba467c200a458598f08772b01b65f33555ef54f93110582a8',
    'dist/engine.js': 'f5460f361306cf6a69aa944d344757f00e313328d6c0360f2a181586e0255d1e',
    'dist/save-inspection.js': '781ae1824c7e18f6faeb3daaaac6dc55e1104645c2a6223bd7202b07567628cf',
  },
};
const args = process.argv.slice(2);
const [destination, option, releaseDirectory] = args;
if (!destination || !(args.length === 1 || args.length === 3 && option === '--engine-release' && isAbsolute(releaseDirectory))) {
  throw new Error('Supply one fresh output directory and optionally --engine-release with the absolute retained bundle directory.');
}

async function defaultEngineBinding() {
  const dependency = JSON.parse(await readFile(local('package.json'), 'utf8'));
  const engineFile = path => readFile(local(`node_modules/${engineRef}/${path}`));
  const engine = JSON.parse(await engineFile('package.json'));
  if (dependency.devDependencies[engineRef] !== `github:emergent-worlds/emergence-engine#${engineSource}` || engine.version !== selectedEngine) {
    throw new Error('The projected sample requires its exact Engine package version.');
  }
  return { ref: engineRef, version: selectedEngine, source: engineSource,
    moduleSha256: hash(await engineFile('dist/engine.js')), interfaceSha256: hash(await engineFile('interface.json')) };
}

async function retainedEngine(directory) {
  const index = await readFile(join(directory, 'bundle.json'));
  if (hash(index) !== retained.bundleSha256) throw new Error('The retained first-party release index differs.');
  const bundle = JSON.parse(index);
  const component = bundle.components.find(value => value.repository === 'emergence-engine');
  if (bundle.protocol !== 'ew.first-party.release.v1' || component?.ref !== engineRef || component.sourceCommit !== retained.sourceCommit ||
      component.releaseCommit !== retained.releaseCommit || component.treeSha256 !== retained.treeSha256 || component.tag !== retained.tag) {
    throw new Error('The retained Engine release identity differs.');
  }
  const checked = new Map();
  for (const [path, digest] of Object.entries(retained.files)) {
    const file = component.files.find(value => value.path === path);
    if (file?.sha256 !== digest) throw new Error(`The retained Engine release does not bind ${path}.`);
    const bytes = await readFile(join(directory, 'blobs', digest));
    if (bytes.length !== file.size || hash(bytes) !== digest) throw new Error(`The retained Engine file differs: ${path}.`);
    checked.set(path, bytes);
  }
  const manifest = JSON.parse(checked.get('manifest.json'));
  const contract = JSON.parse(checked.get('interface.json'));
  if (manifest.kind !== 'engine' || manifest.owner !== '@emergentworlds' || manifest.version !== selectedEngine ||
      contract.module !== 'dist/engine.js' || contract.saveInspection?.module !== 'dist/save-inspection.js' ||
      !['saves', 'while_away', 'players', 'agent.read', 'agent.change'].every(ask => contract.takes.includes(ask))) {
    throw new Error('The retained Engine does not take the required Kestrel asks.');
  }
  return { module: checked.get('dist/engine.js'), binding: { ref: engineRef, version: selectedEngine, source: retained.sourceCommit,
    moduleSha256: retained.files['dist/engine.js'], interfaceSha256: retained.files['interface.json'],
    manifestSha256: retained.files['manifest.json'], saveInspectionSha256: retained.files['dist/save-inspection.js'],
    releaseCommit: retained.releaseCommit, treeSha256: retained.treeSha256, bundleSha256: retained.bundleSha256 } };
}

const stage = resolve(destination), root = resolve(stage, 'tree');
const engine = releaseDirectory ? await retainedEngine(releaseDirectory) : undefined;
const engineBinding = engine?.binding ?? await defaultEngineBinding();
await mkdir(stage, { mode: 0o700 });
await mkdir(resolve(root, 'web'), { recursive: true });
const entryPath = 'build/server/run';
const packagePath = resolve(root, entryPath);
const application = `import { connectWithRemotePlayerProjection } from ${source('src/index.ts')};
  import { startProjectedYard } from ${source('sample/src/projected-yard.ts')};
  void (async () => { await startProjectedYard(await connectWithRemotePlayerProjection({ url: __launch.url, token: __launch.token })); })().catch(() => __fatal());`;
async function packageNative() {
  if (!engine) return buildNativeHeadless(packagePath, application);
  // The retained module is self-contained and is the only input in this private directory.
  const temporary = await mkdtemp(join(tmpdir(), 'ew-projected-engine-'));
  try {
    const module = join(temporary, 'engine.mjs');
    await writeFile(module, engine.module, { flag: 'wx', mode: 0o400 });
    return await buildNativeHeadless(packagePath, application, { [engineRef]: module });
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
const receipt = await packageNative();
await chmod(packagePath, 0o755);
await rename(`${packagePath}.build.json`, resolve(stage, 'native-build.json'));
await build({ entryPoints: [local('sample/src/projected-page.ts')], outfile: resolve(root, 'web/page.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2023', minify: true });
for (const name of ['index.html', 'page.css']) await copyFile(local(`sample/web/${name}`), resolve(root, 'web', name));
const baseline = JSON.parse(await readFile(local('sample/manifest.json'), 'utf8'));
const manifest = { ...baseline,
  entry: { web: 'web/index.html', installs: { server: 'build/server' }, executables: { server: entryPath }, playerProjection: 'ew.remote-player.v1' },
  uses: { [engineRef]: selectedEngine },
  asks: { ...baseline.asks, players: 2 },
};
await writeFile(resolve(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
await writeFile(resolve(stage, 'engine-binding.json'), `${JSON.stringify(engineBinding, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ root, engineBinding, native: receipt.artifact, signed: false }));
