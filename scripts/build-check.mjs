import { build } from 'esbuild';
await build({ entryPoints: ['check/runner.ts'], outfile: 'dist/check/runner.js', bundle: true, format: 'esm', platform: 'node', target: 'node24', banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' } });
