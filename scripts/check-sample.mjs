// A local lifecycle smoke. It does not replace the six signed-build checks of E17.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { WebSocketServer } from 'ws';
import { HostBridge, Manifest } from '@emergent-worlds/host';

const manifest = Manifest.parse(JSON.parse(await readFile(new URL('../sample/manifest.json', import.meta.url))));
const state = new Map();
const reasons = [];
const compiled = process.argv[2] === 'compiled';
const native = process.argv[2] === 'native';
const runtime = native ? fileURLToPath(new URL(`../sample/src-tauri/target/debug/kestrel-yards${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url)) : compiled ? fileURLToPath(new URL('../sample/build/server/kestrel-yards', import.meta.url)) : process.argv[2] === 'bun' ? 'bun' : process.execPath;

async function launch(check) {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  let bridge;
  let resolveOpened;
  let rejectOpened;
  const opened = new Promise((resolve, reject) => { resolveOpened = resolve; rejectOpened = reject; });
  const timer = setTimeout(() => rejectOpened(new Error('the sample did not open in the local smoke')), 10000);
  server.on('connection', socket => {
    socket.once('message', raw => {
      if (JSON.parse(raw.toString()).token !== 'synthetic-sample-launch') return socket.close();
      const transport = {
        send: value => socket.send(JSON.stringify(value)),
        onMessage: listener => { const receive = data => listener(JSON.parse(data.toString())); socket.on('message', receive); return () => socket.off('message', receive); },
        onClose: listener => { const close = () => listener(new Error('local smoke closed')); socket.on('close', close); return () => socket.off('close', close); },
        close: () => socket.close(),
      };
      bridge = new HostBridge(transport, manifest.asks, {
        ready: () => bridge.send({ type: 'grant', asks: manifest.asks, session: 'sample-smoke', headless: true, version: { id: 'smoke-version', seq: reasons.length }, files: [...state].map(([path, data]) => ({ path, size: data.length, sha256: createHash('sha256').update(data).digest('hex') })), display: { theme: 'light', textSize: 'default', contrast: 'default', motion: 'full', language: 'en' } }),
        progress: fraction => { if (fraction === 1) resolveOpened(); },
        fileRead: async path => ({ data: state.get(path).toString('base64') }),
        save: async message => {
          const next = new Map();
          for (const file of message.files) {
            const data = file.data === undefined ? state.get(file.path) : Buffer.from(file.data, 'base64');
            assert.ok(data); assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256);
            next.set(file.path, data);
          }
          state.clear(); for (const [path, data] of next) state.set(path, data);
          reasons.push(message.reason);
          return { version: `smoke-${reasons.length}`, seq: reasons.length, at: '2026-10-15T00:00:00Z' };
        },
      }, 10000, 'core');
    });
  });
  const address = server.address();
  const env = { ...process.env, EW_SDK_URL: `ws://127.0.0.1:${address.port}/`, EW_SDK_TOKEN: 'synthetic-sample-launch' };
  if (check) env.EW_SDK_CHECK = '1'; else delete env.EW_SDK_CHECK;
  const child = spawn(runtime, compiled || native ? [] : [fileURLToPath(new URL('../sample/build/headless.mjs', import.meta.url))], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let diagnosticBytes = 0;
  child.stderr.on('data', data => { diagnosticBytes += data.length; });
  const exited = once(child, 'exit');
  child.on('error', () => rejectOpened(new Error('the sample process could not start')));
  child.on('exit', () => rejectOpened(new Error(`the sample exited before opening; diagnostic bytes ${diagnosticBytes}`)));
  try { await opened; }
  catch (error) { child.kill(); server.close(); throw error; }
  finally { clearTimeout(timer); }
  return {
    bridge,
    async close() {
      bridge.close();
      // The launcher owns exit after the game's final-save acknowledgment.
      if (native) child.kill();
      const timeout = setTimeout(() => child.kill(), 10000);
      try { const [code, signal] = await exited; if (native) assert.ok(code === 0 || signal === 'SIGTERM'); else assert.equal(code, 0); }
      finally { clearTimeout(timeout); for (const client of server.clients) client.terminate(); await new Promise(resolve => server.close(resolve)); }
    },
  };
}

const first = await launch(true);
let timber;
try {
  assert.equal(await first.bridge.request({ type: 'state.read', path: 'values/crew' }), 6);
  first.bridge.send({ type: 'input', sender: 'sample-person', kind: 'text', data: 'timber' });
  first.bridge.send({ type: 'advance', pace: 'day', realElapsedMs: 3600000 });
  timber = await first.bridge.request({ type: 'state.read', path: 'values/timber' });
  await first.bridge.requestSave('interval');
  assert.deepEqual(await first.bridge.request({ type: 'quit', reason: 'leaving' }), { saved: true, at: 1440 });
} finally { await first.close(); }
const saved = [...state].map(([path, data]) => [path, data.toString('base64')]);
const second = await launch(false);
try {
  assert.equal(await second.bridge.request({ type: 'state.read', path: 'values/timber' }), timber);
  await second.bridge.request({ type: 'quit', reason: 'leaving' });
  assert.deepEqual([...state].map(([path, data]) => [path, data.toString('base64')]), saved);
} finally { await second.close(); }
assert.deepEqual(reasons, ['interval', 'leaving', 'leaving']);
console.log(JSON.stringify({ runtime: native ? `native ${process.platform}` : compiled ? 'compiled sample' : runtime === 'bun' ? 'Bun' : process.version, realEngine: true, childProcesses: 2, checkMode: 'pass', ordinaryResume: 'pass', saves: reasons, byteIdentity: 'pass' }));
