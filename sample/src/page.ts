import { callPort, portTransport } from '@emergent-worlds/host';
import { connectPage, framePorts, handPort, startCore } from '@emergent-worlds/host/loader';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { YardView } from './core.js';
import { createYardPage } from './yard-page.js';

const worker = startCore(new URL('worker.js', location.href).href);
const channel = new MessageChannel();
const rpc = callPort(portTransport(channel.port1));
const { applyDisplay, draw, act, problem } = createYardPage(rpc.call);
rpc.on('yard.view', view => draw(view as YardView));
try {
  if ('__TAURI_INTERNALS__' in window) {
    rpc.on('yard.display', applyDisplay);
    const sdk = await invoke<{ url: string; token: string }>('sdk_connection');
    worker.postMessage({ kestrel: 1, sdk }, [channel.port2]);
    await getCurrentWindow().onCloseRequested(async event => {
      event.preventDefault();
      try { await rpc.call('yard.save'); await getCurrentWindow().destroy(); }
      catch { problem('The yard could not save. Keep this window open and try again.'); }
    });
  } else {
    const ports = await framePorts();
    const page = await connectPage(portTransport(ports.page));
    applyDisplay(page.grant.display);
    page.on('display', message => applyDisplay(message.display));
    handPort(worker, ports.core);
    worker.postMessage({ kestrel: 1 }, [channel.port2]);
  }
  await act('yard.view');
} catch {
  problem('Kestrel Yards needs its host connection to open.');
}
window.addEventListener('pagehide', () => { rpc.close(); worker.terminate(); });
