import {buildWindowsCheckHelper,windowsHelperHashPlugin} from './build-windows-check.mjs';
import {copyFile} from 'node:fs/promises';
import { build } from 'esbuild';
await build({ entryPoints: ['check/runner.ts'], outfile: 'dist/check/runner.js', bundle: true, format: 'esm', platform: 'node', target: 'node24', banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' } });
await build({ entryPoints: ['check/macos-isolation.ts'], outfile: 'dist/check/macos-isolation.js', bundle: true, format: 'esm', platform: 'node', target: 'node24', banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' } });

await build({entryPoints:['check/linux-isolation.ts'],outfile:'dist/check/linux-isolation.js',bundle:true,format:'esm',platform:'node',target:'node24',banner:{js:'import { createRequire } from \"node:module\"; const require = createRequire(import.meta.url);'}});
await copyFile('check/linux-relay.py','dist/check/linux-relay.py');
await copyFile('check/linux-pidfd.py','dist/check/linux-pidfd.py');
await copyFile('check/linux-declared-relay.py','dist/check/linux-declared-relay.py');

// This helper is compiled only by the matching existing Windows developer worker.
if(process.platform==='win32'){
 const helper=await buildWindowsCheckHelper();
 await build({entryPoints:['check/windows-isolation.ts'],outfile:'dist/check/windows-isolation.js',bundle:true,format:'esm',platform:'node',target:'node24',
  banner:{js:'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'},plugins:[windowsHelperHashPlugin(helper.sha256)]});
}
