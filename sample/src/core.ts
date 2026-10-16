import { createEngine, sha256, type Engine } from '@emergentworlds/emergence-engine';
import type { CoreHost } from '@emergent-worlds/host/loader';
import type { SavedFile, SaveReason } from '@emergent-worlds/host';
import { ASSIGNMENTS, opening, yardShape, type Assignment } from './shape.js';

const bytes = (text: string) => new TextEncoder().encode(text);
const base64 = (text: string) => { let binary = ''; for (const byte of bytes(text)) binary += String.fromCharCode(byte); return btoa(binary); };
const decode = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0));

export interface YardView {
  day: number; weather: string; assignment: Assignment; paused: boolean;
  crew: number; berths: number; orders: number; timber: number; hulls: number; rigging: number; completed: number;
}
export interface YardCore {
  readonly engine: Engine;
  view(): YardView;
  assign(assignment: unknown): YardView;
  advance(): YardView;
  save(reason: SaveReason, name?: string): Promise<unknown>;
  subscribe(listener: (view: YardView) => void): () => void;
  close(): void;
}

/** The same state and handlers run in a frame, an installed window, and check mode. */
export async function createYard(host: CoreHost): Promise<YardCore> {
  const engine = createEngine({ seed: 'kestrel-yards' }).use(yardShape);
  const loaded = [];
  for (const file of host.grant.files.filter(file => file.path.startsWith('state/'))) {
    const data = await host.read(file.path);
    if (sha256(decode(data)) !== file.sha256) throw new Error(`${file.path} does not match the saved version`);
    loaded.push({ path: file.path, data });
  }
  engine.open(loaded, 'kestrel-yards');
  if (!loaded.some(file => file.path === 'state/engine.json')) engine.grow(opening);
  const confirmed = new Map(host.grant.files.map(file => [file.path, file.sha256]));
  const outside = host.grant.files.filter(file => !file.path.startsWith('state/')).map(({ path, sha256 }) => ({ path, sha256 }));
  const listeners = new Set<(view: YardView) => void>();
  let paused = false;
  let closed = false;
  let chain: Promise<unknown> = Promise.resolve();
  const number = (id: string) => Number(engine.read(`values/${id}`));
  const view = (): YardView => ({ day: engine.tick + 1, weather: String(engine.read('values/weather')), assignment: engine.read('slots/yard/assignment') as Assignment, paused, crew: number('crew'), berths: number('berths'), orders: number('orders'), timber: number('timber'), hulls: number('hulls'), rigging: number('rigging'), completed: number('completed') });
  const publish = () => { if (!closed) for (const listener of listeners) listener(view()); };
  const ensureOpen = () => { if (closed) throw new Error('the yard is closed'); };
  const save = (reason: SaveReason, name?: string) => {
    const run = async () => {
      ensureOpen();
      const files: SavedFile[] = [...outside];
      for (const [path, text] of engine.files()) {
        const hash = sha256(bytes(text));
        files.push({ path, sha256: hash, ...(confirmed.get(path) === hash ? {} : { data: base64(text) }) });
      }
      files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      const result = await host.save(reason, files, name);
      confirmed.clear(); for (const file of files) confirmed.set(file.path, file.sha256);
      return result;
    };
    const next = chain.then(run, run);
    chain = next.catch(() => undefined);
    return next;
  };
  const assign = (assignment: unknown) => {
    ensureOpen();
    if (!ASSIGNMENTS.includes(assignment as Assignment)) throw new Error('choose timber, hulls, or rigging');
    engine.grow([{ op: 'slot.set', slot: 'yard/assignment', value: assignment }]);
    publish(); return view();
  };
  const advance = () => {
    ensureOpen();
    if (paused) throw new Error('the yard is paused');
    const result = engine.advance(1);
    if (!result.ok) throw new Error(result.error ?? 'the day could not advance');
    publish(); return view();
  };
  host.handle('state.read', message => engine.read(message.path));
  host.handle('state.query', message => engine.query(message.query));
  host.handle('state.explain', message => engine.explain(message.subject));
  host.handle('change.forecast', message => engine.forecast(message.change, message.horizon));
  host.handle('change.propose', message => engine.propose(message.change, message.revises));
  host.handle('change.apply', async message => {
    await save('before-change');
    const result = engine.apply(message.proposal, message.approvedBy, message.decision);
    publish(); return result;
  });
  host.handle('change.undo', () => { const result = engine.undo(); publish(); return result; });
  host.handle('pause', () => { paused = true; publish(); return { paused, at: engine.at }; });
  host.handle('resume', () => { paused = false; publish(); return { paused, at: engine.at }; });
  host.handle('quit', async () => { await save('leaving'); return { saved: true, at: engine.at }; });
  const off = [
    host.on('advance', message => {
      if (paused || closed) return;
      const result = engine.advanceRealTime(message.pace, message.realElapsedMs);
      if (!result.ok) host.error('the yard could not complete its away advance');
      publish();
    }),
    host.on('save.request', message => { void save(message.reason, message.name).catch(() => host.error('the requested yard save failed')); }),
    host.on('input', message => {
      try {
        if (message.kind === 'text') assign(message.data);
        else if (message.kind === 'pointer' && message.data && typeof message.data === 'object') assign((message.data as { assignment?: unknown }).assignment);
      } catch { host.error('the yard input was not applied'); }
    }),
    engine.on('status', line => host.status(line)),
    engine.on('event', event => host.event(event.level, event.text)),
  ];
  host.status(engine.status());
  return { engine, view, assign, advance, save, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; }, close() { if (closed) return; closed = true; for (const remove of off) remove(); listeners.clear(); host.close(); } };
}
