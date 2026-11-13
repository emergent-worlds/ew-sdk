import { serveRemotePlayerProjection } from '../../dist/index.js';

export function startPortableCounter({ core, projection }, digest) {
  const counts = new Map();
  const view = sender => ({ sender, count: counts.get(sender) });
  function take(sender) {
    counts.set(sender, counts.get(sender) + 1);
    const next = view(sender);
    players.notify(sender, { ew: 1, notice: 'counter.view', data: next });
    return next;
  }
  const players = serveRemotePlayerProjection(projection, {
    protocol: 'ew.remote-player.v1', calls: ['counter.view', 'counter.take'], inputs: ['text', 'pointer'],
  }, {
    admit: ({ sender }) => { if (!counts.has(sender)) counts.set(sender, 0); },
    snapshot: ({ sender }) => [{ ew: 1, notice: 'counter.view', data: view(sender) }],
    call: ({ sender, call }) => call === 'counter.take' ? take(sender) : view(sender),
    input: ({ sender, data }) => { if (data === 'take') take(sender); },
  });
  core.handle('pause', () => ({}));
  const outside = core.grant.files.filter(file => !file.path.startsWith('state/')).map(({ path, sha256 }) => ({ path, sha256 }));
  function save(reason) {
    const bytes = new TextEncoder().encode(JSON.stringify(Object.fromEntries(counts)));
    const sha256 = digest(bytes);
    const data = btoa(String.fromCharCode(...bytes));
    return core.save(reason, [...outside, { path: 'state/counter.json', sha256, data }]);
  }
  core.handle('quit', async ({ reason }) => {
    await save(reason === 'handoff' ? 'handoff' : 'leaving');
    return {};
  });
  core.on('save.request', ({ reason }) => { void save(reason).catch(() => {}); });
  core.progress(1);
}
