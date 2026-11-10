/** The native game's public-to-players view uses a separate port from its engine and save authority. */
import { serveRemotePlayerProjection, type CoreHost, type Transport } from '../../src/index.js';
import { createYard, type YardView } from './core.js';

const maxRecentPlayers = 128;
const viewNotice = (view: YardView) => ({ ew: 1 as const, notice: 'yard.view', data: view });

export async function startProjectedYard({ core, projection }: { core: CoreHost; projection: Transport }) {
  const recent = new Set<string>();
  function observe(sender: string) {
    recent.delete(sender);
    recent.add(sender);
    if (recent.size > maxRecentPlayers) recent.delete(recent.values().next().value!);
  }
  // Install the private projection handlers before the actual core can report ready.
  const loaded = Promise.resolve().then(() => createYard(core));
  const players = serveRemotePlayerProjection(projection, {
    protocol: 'ew.remote-player.v1', calls: ['yard.view', 'yard.assign', 'yard.advance'], inputs: ['text', 'pointer'],
  }, {
    admit: async ({ sender }) => { await loaded; observe(sender); },
    snapshot: async ({ sender }) => { const yard = await loaded; observe(sender); return [viewNotice(yard.view())]; },
    call: async ({ sender, call, args }) => {
      const yard = await loaded;
      observe(sender);
      switch (call) {
        case 'yard.view': return yard.view();
        case 'yard.assign': return yard.assign(args);
        case 'yard.advance': return yard.advance();
      }
    },
    input: async ({ sender, kind, data }) => {
      const yard = await loaded;
      observe(sender);
      yard.assign(kind === 'pointer' && data && typeof data === 'object' ? (data as { assignment?: unknown }).assignment : data);
    },
  });
  try {
    const yard = await loaded;
    const unsubscribe = yard.subscribe(view => {
      try { for (const sender of recent) players.notify(sender, viewNotice(view)); }
      catch { recent.clear(); }
    });
    projection.onClose?.(() => { recent.clear(); unsubscribe(); });
    return yard;
  } catch (error) { players.close(); throw error; }
}
