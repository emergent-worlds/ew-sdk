import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { HostBridge, Manifest, type HostHandlers, type Transport } from '@emergent-worlds/host';
import { connectCore } from '@emergent-worlds/host/loader';
import { createYard } from '../sample/src/core.js';

const asks = Manifest.parse({ name: 'Kestrel Yards', kind: 'reality', version: '1.0.0', owner: '@mercerpress', entry: { web: 'index.html', headless: 'worker.js' }, asks: { surface: 'full', saves: true, agent: 'change', while_away: true, input: ['text', 'pointer'] } }).asks!;
function pair(): [Transport, Transport] {
  const listeners = [new Set<(m: unknown) => void>(), new Set<(m: unknown) => void>()];
  const side = (i: number): Transport => ({ send: message => queueMicrotask(() => listeners[1 - i]!.forEach(listener => listener(structuredClone(message)))), onMessage: listener => (listeners[i]!.add(listener), () => { listeners[i]!.delete(listener); }), close: () => listeners[i]!.clear() });
  return [side(0), side(1)];
}
async function setup(initial = new Map<string, Buffer>(), override: HostHandlers = {}) {
  const stored = new Map(initial);
  const saves: { reason: string; data: number }[] = [];
  const [h, f] = pair();
  const bridge = new HostBridge(h, asks, {
    ready: () => bridge.send({ type: 'grant', asks, session: 'sample', headless: true, version: { id: 'v1', seq: 1 }, files: [...stored].map(([path, bytes]) => ({ path, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })), display: { theme: 'light', textSize: 'default', contrast: 'default', motion: 'full', language: 'en' } }),
    fileRead: async path => ({ data: stored.get(path)!.toString('base64') }),
    save: async message => {
      const next = new Map<string, Buffer>();
      for (const file of message.files) {
        const bytes = file.data === undefined ? stored.get(file.path)! : Buffer.from(file.data, 'base64');
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
        next.set(file.path, bytes);
      }
      stored.clear(); for (const [path, bytes] of next) stored.set(path, bytes);
      saves.push({ reason: message.reason, data: message.files.filter(file => file.data !== undefined).length });
      return { version: `v${saves.length + 1}`, seq: saves.length + 1, at: '2026-10-15T00:00:00Z' };
    },
    ...override,
  }, 1000, 'core');
  const host = await connectCore(f);
  const yard = await createYard(host);
  return { yard, bridge, stored, saves, close: () => { yard.close(); bridge.close(); } };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('Kestrel Yards uses the real engine', () => {
  it('runs the same seeded shape, validates assignments and continues after its opening week', async () => {
    const a = await setup(); const b = await setup();
    try {
      expect(a.yard.view()).toMatchObject({ day: 1, crew: 6, berths: 2, orders: 3, timber: 12, hulls: 0 });
      expect(() => a.yard.assign('invalid')).toThrow('choose timber');
      for (let i = 0; i < 10; i++) { a.yard.advance(); b.yard.advance(); }
      expect(a.yard.engine.hash()).toBe(b.yard.engine.hash());
      expect(a.yard.view().day).toBe(11);
    } finally { a.close(); b.close(); }
  });

  it('persists actual state, preserves folder files, deduplicates confirmed bytes, and reopens identically', async () => {
    const original = new Map([['manifest.json', Buffer.from('{"name":"Kestrel Yards"}')]]);
    const a = await setup(original);
    a.yard.assign('rigging'); a.yard.advance();
    await a.yard.save('interval');
    await a.yard.save('own');
    expect(a.saves[0]!.data).toBeGreaterThan(0); expect(a.saves[1]!.data).toBe(0);
    const hash = a.yard.engine.hash(); const state = a.yard.view();
    const b = await setup(a.stored);
    try {
      expect(b.yard.engine.hash()).toBe(hash); expect(b.yard.view()).toEqual(state);
      expect(b.stored.get('manifest.json')).toEqual(original.get('manifest.json'));
    } finally { a.close(); b.close(); }
  });

  it('retains fractional away time across a save and a new host', async () => {
    const a = await setup();
    a.bridge.send({ type: 'advance', pace: 'day', realElapsedMs: 1_800_000 }); await flush();
    expect(a.yard.engine.tick).toBe(0);
    await a.yard.save('handoff');
    const b = await setup(a.stored);
    try {
      b.bridge.send({ type: 'advance', pace: 'day', realElapsedMs: 1_800_000 }); await flush();
      expect(b.yard.engine.tick).toBe(1);
      expect(b.yard.view().day).toBe(2);
    } finally { a.close(); b.close(); }
  });

  it('shares real read, proposal, apply, undo and pause handlers with the terminal', async () => {
    const a = await setup();
    try {
      const proposal = await a.bridge.request({ type: 'change.propose', change: { intent: 'give the yard timber', ops: [{ op: 'variable.set', id: 'timber', value: 20 }] } }) as { proposal: string };
      expect(a.yard.view().timber).toBe(12);
      await a.bridge.request({ type: 'change.apply', proposal: proposal.proposal, decision: 'fixture-decision' });
      expect(a.saves[0]?.reason).toBe('before-change'); expect(a.yard.view().timber).toBe(20);
      await a.bridge.request({ type: 'change.undo' }); expect(a.yard.view().timber).toBe(12);
      await a.bridge.request({ type: 'pause' }); expect(() => a.yard.advance()).toThrow('paused');
      await a.bridge.request({ type: 'resume' }); a.yard.advance();
      expect(await a.bridge.request({ type: 'state.read', path: 'values/crew' })).toBe(6);
    } finally { a.close(); }
  });

  it('refuses quit on a failed save, and retries with actual bytes still unconfirmed', async () => {
    let fail = true; const received: number[] = [];
    const a = await setup(undefined, { save: async message => {
      received.push(message.files.filter(file => file.data !== undefined).length);
      if (fail) throw new Error('synthetic store refusal');
      return { version: 'v2', seq: 2, at: '2026-10-15T00:00:00Z' };
    } });
    try {
      await expect(a.bridge.request({ type: 'quit', reason: 'leaving' })).rejects.toThrow('synthetic store refusal');
      fail = false;
      await expect(a.bridge.request({ type: 'quit', reason: 'leaving' })).resolves.toMatchObject({ saved: true });
      expect(received[0]).toBeGreaterThan(0); expect(received[1]).toBe(received[0]);
    } finally { a.close(); }
  });
});

it('announces completed core loading after its state and handlers are ready', async () => {
  const progress: number[] = [], sample = await setup(undefined, { progress: fraction => { progress.push(fraction); } });
  try { await flush(); expect(progress).toEqual([1]); expect(await sample.bridge.request({ type: 'state.read', path: 'values/crew' })).toBe(6); }
  finally { sample.close(); }
});
