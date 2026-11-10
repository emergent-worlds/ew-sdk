import { createHash } from 'node:crypto';
import { connectWithRemotePlayerProjection, serveRemotePlayerProjection } from '../../dist/index.js';

const { core, projection } = await connectWithRemotePlayerProjection();
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
core.handle('quit', () => ({}));
core.on('save.request', ({ reason }) => {
  const bytes = Buffer.from(JSON.stringify(Object.fromEntries(counts)));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  void core.save(reason, [{ path: 'state/counter.json', sha256, data: bytes.toString('base64') }]).catch(() => {});
});
core.progress(1);
