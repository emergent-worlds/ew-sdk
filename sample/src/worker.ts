import { portTransport, servePort } from '@emergent-worlds/host';
import { connectCore, workerPort } from '@emergent-worlds/host/loader';
import { connect } from '../../src/index.js';
import { createYard } from './core.js';

const folder = new Promise<{ port: MessagePort; sdk?: { url: string; token: string } }>(resolve => {
  const receive = (event: MessageEvent) => {
    if (event.data?.kestrel !== 1 || !event.ports[0]) return;
    globalThis.removeEventListener('message', receive);
    resolve({ port: event.ports[0], sdk: event.data.sdk });
  };
  globalThis.addEventListener('message', receive);
});
// Both handoff listeners exist before the first await; neither port is dropped.
const parent = workerPort().catch(() => undefined);
void folder.then(async ({ port, sdk }) => {
  const portFromParent = sdk ? undefined : await parent;
  if (!sdk && !portFromParent) throw new Error('the yard worker received no host port');
  const host = sdk ? await connect(sdk) : await connectCore(portTransport(portFromParent!));
  const yard = await createYard(host);
  const rpc = servePort(portTransport(port), {
    'yard.view': () => yard.view(),
    'yard.assign': assignment => yard.assign(assignment),
    'yard.advance': () => yard.advance(),
    'yard.save': () => yard.save('leaving'),
  });
  yard.subscribe(view => rpc.notify('yard.view', view));
});
