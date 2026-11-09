import { callPort, Display, portTransport } from '@emergent-worlds/host';
import { connectPage, framePorts, handPort, startCore } from '@emergent-worlds/host/loader';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { YardView } from './core.js';

const root = document.querySelector<HTMLElement>('main')!;
root.hidden = true;
const output = document.createElement('div');
const controls = document.createElement('div');
const status = document.createElement('p'); status.setAttribute('role', 'status');
root.append(output, controls, status);
const worker = startCore(new URL('worker.js', location.href).href);
const channel = new MessageChannel();
const rpc = callPort(portTransport(channel.port1));
const applyDisplay = (value: unknown) => {
  const parsed = Display.safeParse(value);
  if (!parsed.success) return;
  const { theme, textSize, contrast, motion, language } = parsed.data;
  const html = document.documentElement;
  html.dataset.theme = theme;
  html.dataset.textSize = textSize;
  html.dataset.contrast = contrast;
  html.dataset.motion = motion;
  html.lang = /^en(?:-[a-z]{2})?$/i.test(language) ? language : 'en';
  root.hidden = false;
};
const draw = (view: YardView) => {
  output.replaceChildren();
  const heading = document.createElement('h1'); heading.textContent = 'Kestrel Yards';
  const line = document.createElement('p'); line.textContent = `Day ${view.day}. ${view.weather}. ${view.crew} crew, ${view.berths} berths.`;
  const progress = document.createElement('p'); progress.textContent = `${view.completed} of ${view.orders} orders ready. Timber ${view.timber.toFixed(1)}, hulls ${view.hulls.toFixed(1)}, rigging ${view.rigging.toFixed(1)}.`;
  const work = document.createElement('p'); work.textContent = `The crew is assigned to ${view.assignment}.${view.paused ? ' The yard is paused.' : ''}`;
  output.append(heading, line, progress, work);
  controls.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    button.disabled = view.paused;
    if (button.dataset.assignment) button.setAttribute('aria-pressed', String(button.dataset.assignment === view.assignment));
  });
};
const act = async (name: string, args?: unknown) => {
  status.textContent = '';
  try { draw(await rpc.call(name, args) as YardView); }
  catch { status.textContent = 'The yard could not complete that action.'; }
};
for (const assignment of ['timber', 'hulls', 'rigging']) {
  const button = document.createElement('button');
  button.textContent = `Work on ${assignment}`; button.dataset.assignment = assignment;
  button.onclick = () => { void act('yard.assign', assignment); }; controls.append(button);
}
const advance = document.createElement('button'); advance.textContent = 'Advance one day';
advance.onclick = () => { void act('yard.advance'); }; controls.append(advance);
rpc.on('yard.view', view => draw(view as YardView));
try {
  if ('__TAURI_INTERNALS__' in window) {
    rpc.on('yard.display', applyDisplay);
    const sdk = await invoke<{ url: string; token: string }>('sdk_connection');
    worker.postMessage({ kestrel: 1, sdk }, [channel.port2]);
    await getCurrentWindow().onCloseRequested(async event => {
      event.preventDefault();
      try { await rpc.call('yard.save'); await getCurrentWindow().destroy(); }
      catch { status.textContent = 'The yard could not save. Keep this window open and try again.'; }
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
  status.textContent = 'Kestrel Yards needs its host connection to open.';
  root.hidden = false;
}
window.addEventListener('pagehide', () => { rpc.close(); worker.terminate(); });
