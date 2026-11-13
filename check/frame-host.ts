import { HostBridge, portTransport, Manifest } from '@emergent-worlds/host';
const frame = document.querySelector<HTMLIFrameElement>('iframe')!;
const asks = Manifest.parse({ name: 'Kestrel Yards', kind: 'reality', version: '1.0.0', owner: '@mercerpress', entry: { web: 'web/index.html', headless: 'web/worker.js' }, asks: { surface: 'full', saves: true, while_away: true, agent: 'change', input: ['text', 'pointer'] } }).asks!;
frame.addEventListener('load', () => {
  const core = new MessageChannel(); const page = new MessageChannel();
  const grant = { type: 'grant' as const, asks, session: 'browser-fixture', headless: false, journeys: true, version: { id: 'fixture', seq: 1 }, display: { theme: 'light' as const, textSize: 'default' as const, contrast: 'default' as const, motion: 'full' as const, language: 'en' } };
  const bridge = new HostBridge(portTransport(core.port1), asks, { ready: () => bridge.send(grant), status: line => { document.querySelector('output')!.textContent = line; } }, 30000, 'core');
  const person = new HostBridge(portTransport(page.port1), asks, { ready: () => person.send(grant) }, 30000, 'page');
  let dark = false;
  document.querySelector('button')!.addEventListener('click', () => { dark = !dark; person.send({ type: 'display', display: { ...grant.display, theme: dark ? 'dark' : 'light' } }); });
  frame.contentWindow!.postMessage({ ewHost: 1 }, '*', [core.port2, page.port2]);
});
