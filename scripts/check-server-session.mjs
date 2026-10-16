// Local cross-repository fixture. It does not select, install or trust a production build.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Manifest } from '@emergent-worlds/host';
import { HeadlessSession } from '../../ew-server/dist/session.js';
import { nativeEntryTarget } from '../../ew-server/dist/native-entry.js';
const manifest = Manifest.parse(JSON.parse(await readFile(new URL('../sample/manifest.json', import.meta.url), 'utf8')));
const mode = process.argv[2] ?? (globalThis.Bun ? 'bun' : 'node'), compiled = mode === 'compiled';
const runtime = compiled ? fileURLToPath(new URL('../sample/build/server/kestrel-yards', import.meta.url)) : mode === 'bun' ? 'bun' : process.execPath;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
if (compiled) assert.equal(await nativeEntryTarget(runtime, AbortSignal.timeout(1000)), process.platform === 'darwin' ? `macos-${process.arch}` : process.platform === 'win32' ? 'windows-x64' : 'linux-x64');
const files = new Map(), saves = [], ends = [];
const waitFor = async predicate => { for (let n = 0; n < 100; n++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('the actual server session did not reach its expected state'); };
async function open() {
  let now = 0, session, admitted = false, failedSave = false, exited = false;
  const token = randomBytes(32).toString('base64url'), fence = { serverId: 'kestrel-yards', sessionId: `fixture-${ends.length}`, epoch: ends.length + 1 };
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0, maxPayload: 4 * 1024 * 1024, perMessageDeflate: false });
  await once(server, 'listening');
  const admission = setTimeout(() => { for (const socket of server.clients) socket.terminate(); }, 30_000);
  server.on('connection', socket => {
    if (admitted) return socket.close();
    socket.once('message', (raw, binary) => {
      let first; try { first = JSON.parse(raw.toString()); } catch { return socket.close(); }
      if (binary || !first || Object.keys(first).length !== 1 || first.token !== token || admitted) return socket.close();
      admitted = true; clearTimeout(admission);
      const transport = {
        send(message) { socket.send(JSON.stringify(message)); },
        onMessage(listener) { const receive = (raw, binary) => { if (binary) return socket.close(); let value; try { value = JSON.parse(raw.toString()); } catch { return socket.close(); } listener(value); }; socket.on('message', receive); return () => socket.off('message', receive); },
        onClose(listener) { const close = () => listener(new Error('fixture SDK socket closed')); socket.on('close', close); return () => socket.off('close', close); },
        close() { socket.close(); },
      };
      session = new HeadlessSession(transport, { type: 'grant', asks: manifest.asks, session: fence.sessionId, version: { id: 'saved-reality', seq: saves.length }, files: [...files].map(([path, data]) => ({ path, sha256: hash(data), size: data.length })), uses: [], journeys: false, display: { theme: 'light', textSize: 'default', contrast: 'default', motion: 'full', language: 'en' } }, { ...fence, validUntilMs: 90000 }, {
        renew: async value => { assert.deepEqual(value, fence); return { ...fence, validUntilMs: now + 90000 }; },
        read: async path => { assert(files.has(path)); return files.get(path).toString('base64'); },
        model: async () => { throw new Error('the fixture has no model authority'); },
        save: async (value, save) => {
          assert.deepEqual(value, fence);
          if (save.reason === 'leaving' && failedSave) throw new Error('fixture final save unavailable');
          const next = new Map();
          for (const file of save.files) { const bytes = file.data === undefined ? files.get(file.path) : Buffer.from(file.data, 'base64'); assert(bytes); assert.equal(hash(bytes), file.sha256); next.set(file.path, bytes); }
          files.clear(); for (const entry of next) files.set(...entry); saves.push(save.reason);
          return { version: `saved-${saves.length}`, seq: saves.length, at: '2026-10-16T00:00:00Z' };
        },
        end: async (value, reason) => { assert.deepEqual(value, fence); assert.equal(saves.at(-1), reason); ends.push(reason); },
      }, { now: () => now }, 'day');
    });
  });
  const address = server.address();
  const child = spawn(runtime, compiled ? [] : [fileURLToPath(new URL('../sample/build/headless.mjs', import.meta.url))], { env: { ...process.env, EW_SDK_URL: `ws://127.0.0.1:${address.port}/`, EW_SDK_TOKEN: token }, stdio: 'ignore' });
  const ended = once(child, 'exit').then(([code, signal]) => { exited = true; return { code, signal }; }, () => { exited = true; return { code: null, signal: 'spawn_error' }; });
  try { await waitFor(() => { if (exited) throw new Error('the fixture child exited before loading'); return session?.snapshot().state === 'running'; }); }
  catch (error) { session?.close(); child.kill(); await ended; clearTimeout(admission); for (const socket of server.clients) socket.terminate(); await new Promise(resolve => server.close(resolve)); throw error; }
  return { session, setTime(value) { now = value; }, failSave(value) { failedSave = value; }, exited: () => exited, async close() {
    session.close(); clearTimeout(admission);
    const timeout = setTimeout(() => child.kill(), 1000);
    try { const result = await ended; assert.deepEqual(result, { code: 0, signal: null }); }
    finally { clearTimeout(timeout); for (const socket of server.clients) socket.terminate(); await new Promise(resolve => server.close(resolve)); }
  } };
}
const first = await open();
try {
  first.setTime(30000); await first.session.pulse(); assert.equal(saves.at(-1), 'interval');
  const header = JSON.parse(files.get('state/engine.json')); assert(BigInt(header.carry) > 0n, 'actual away advance must reach the engine');
  first.failSave(true); await assert.rejects(first.session.stop(), /fixture final save unavailable/); assert.equal(first.session.snapshot().state, 'paused'); assert.equal(first.exited(), false); assert.equal(ends.length, 0);
  first.failSave(false); first.setTime(40000); await first.session.pulse(); assert.equal(first.session.snapshot().state, 'stopped');
} finally { await first.close(); }
const saved = [...files].map(([path, bytes]) => [path, bytes.toString('base64')]);
const second = await open();
try { await second.session.stop(); assert.deepEqual([...files].map(([path, bytes]) => [path, bytes.toString('base64')]), saved); }
finally { await second.close(); }
assert.deepEqual(saves, ['interval', 'leaving', 'leaving']); assert.deepEqual(ends, ['leaving', 'leaving']);
console.log(`${mode} SDK child reaches actual HeadlessSession running, advances, saves, retains failed final save, ends and resumes exact bytes`);
