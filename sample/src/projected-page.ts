/** The installed game's licensed App frame receives only the remote projection and page display. */
import { callPort, portTransport, PortNotice, type PortClient } from '@emergent-worlds/host';
import { connectPage } from '@emergent-worlds/host/loader';
import type { YardView } from './core.js';
import { createYardPage } from './yard-page.js';

let player: PortClient | undefined;
let page: Awaited<ReturnType<typeof connectPage>> | undefined;
let control: MessagePort | undefined;
const view = createYardPage((call, args) => {
  if (!player) throw new Error('The shared yard is unavailable.');
  return player.call(call, args);
}, true);

function handoff(): Promise<{ player: MessagePort; page: MessagePort; control: MessagePort }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', receive);
      reject(new Error('The App did not hand over the shared yard.'));
    }, 10000);
    function receive(event: MessageEvent) {
      if (event.source !== window.parent || event.data?.ewHost !== 1 || event.data.ewRemote !== 1 || event.ports.length !== 3) return;
      clearTimeout(timer);
      window.removeEventListener('message', receive);
      resolve({ player: event.ports[0]!, page: event.ports[1]!, control: event.ports[2]! });
    }
    window.addEventListener('message', receive);
  });
}

function decodeYard(raw: unknown): YardView | undefined {
  const parsed = PortNotice.safeParse(raw);
  if (!parsed.success || parsed.data.notice !== 'yard.view') return;
  const data = parsed.data.data as Partial<YardView> | undefined;
  if (!data || typeof data !== 'object' || !Number.isSafeInteger(data.day) || data.day! < 1 ||
      typeof data.weather !== 'string' || data.weather.length > 100 || typeof data.paused !== 'boolean' ||
      !['timber', 'hulls', 'rigging'].includes(data.assignment ?? '') ||
      ![data.crew, data.berths, data.orders, data.timber, data.hulls, data.rigging, data.completed].every(Number.isFinite)) return;
  return data as YardView;
}

try {
  const ports = await handoff();
  control = ports.control;
  player = callPort(portTransport(ports.player));
  const display = connectPage(portTransport(ports.page));
  control.onmessage = ({ data: message }) => {
    if (message?.type !== 'snapshot' && message?.type !== 'notice') return;
    const { id, seq } = message;
    if (typeof id !== 'string' || !id || !Number.isSafeInteger(seq) || seq < 0) return;
    const raw = message.type === 'snapshot'
      ? Array.isArray(message.notices) && message.notices.length === 1 ? message.notices[0] : undefined
      : message.notice;
    const yard = decodeYard(raw);
    if (yard) view.draw(yard);
    control?.postMessage({ type: yard ? 'installed' : 'failed', id, seq });
  };
  page = await display;
  view.applyDisplay(page.grant.display);
  page.on('display', message => view.applyDisplay(message.display));
} catch { view.problem('Kestrel Yards needs its shared App connection to open.'); }
window.addEventListener('pagehide', () => { player?.close(); page?.close(); control?.close(); }, { once: true });
