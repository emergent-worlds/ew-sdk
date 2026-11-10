/** Package the opt-in native Kestrel server and its licensed App page in a fresh tree. */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNativeHeadless } from './build-native-headless.mjs';

const local = path => fileURLToPath(new URL(`../${path}`, import.meta.url));
const source = path => JSON.stringify(local(path));
const engineRef = '@emergentworlds/emergence-engine';
const selectedEngine = '1.0.0';
const engineSource = '95a4048';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const destination = process.argv[2];
if (!destination || process.argv.length !== 3) throw new Error('Supply one fresh output directory for the projected sample.');
const stage = resolve(destination), root = resolve(stage, 'tree');
const dependency = JSON.parse(await readFile(local('package.json'), 'utf8'));
const engineFile = path => readFile(local(`node_modules/${engineRef}/${path}`));
const engine = JSON.parse(await engineFile('package.json'));
if (dependency.devDependencies[engineRef] !== `github:emergent-worlds/emergence-engine#${engineSource}` || engine.version !== selectedEngine) {
  throw new Error('The projected sample requires its exact Engine package version.');
}
const engineBinding = { ref: engineRef, version: selectedEngine, source: engineSource,
  moduleSha256: hash(await engineFile('dist/engine.js')), interfaceSha256: hash(await engineFile('interface.json')) };
await mkdir(stage, { mode: 0o700 });
await mkdir(resolve(root, 'web'), { recursive: true });
const entryPath = 'build/server/run';
const packagePath = resolve(root, entryPath);
const application = `import { connectWithRemotePlayerProjection } from ${source('src/index.ts')};
  import { startProjectedYard } from ${source('sample/src/projected-yard.ts')};
  void (async () => { await startProjectedYard(await connectWithRemotePlayerProjection({ url: __launch.url, token: __launch.token })); })().catch(() => __fatal());`;
const receipt = await buildNativeHeadless(packagePath, application);
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
