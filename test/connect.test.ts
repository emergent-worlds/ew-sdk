import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { once } from 'node:events';
import { HostBridge, Manifest, callPort, splitInstalledPlayerTransport, type HostHandlers, type Transport } from '@emergent-worlds/host';
import { connect, connectWithRemotePlayerProjection, serveRemotePlayerProjection, type RemotePlayerProjectionDescriptor } from '../src/index.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const cleanup of cleanups.splice(0)) await cleanup(); });
const asks = Manifest.parse({ name: 'Kestrel Yards', kind: 'reality', version: '1.0.0', owner: '@mercerpress', entry: { web: 'index.html' }, asks: { surface: 'window', saves: true } }).asks!;

async function launcher(handlers: HostHandlers = {}, family: 'core' | 'combined' = 'core', portable = false) {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const frames: unknown[] = [];
  let connections = 0;
  let bridge: HostBridge;
  let peer: WebSocket;
  let projection: ReturnType<typeof callPort> | undefined;
  server.on('connection', socket => {
    connections++;
    peer = socket;
    socket.on('message', data => frames.push(JSON.parse(data.toString())));
    socket.once('message', data => {
      if (JSON.parse(data.toString()).token !== 'test-launch-credential') return socket.close();
      const transport: Transport = {
        send: value => socket.send(JSON.stringify(value)),
        onMessage: listener => {
          const receive = (data: Buffer) => listener(JSON.parse(data.toString()));
          socket.on('message', receive);
          return () => { socket.off('message', receive); };
        },
        onClose: listener => {
          const close = () => listener(new Error('peer closed'));
          socket.on('close', close);
          return () => { socket.off('close', close); };
        },
        close: () => socket.close(),
      };
      const channels = portable ? splitInstalledPlayerTransport(transport) : undefined;
      if (channels) projection = callPort(channels.projection, 1000);
      bridge = new HostBridge(channels?.core ?? transport, asks, { ...handlers, ready: () => bridge.send({ type: 'grant', asks, session: 'test', headless: false, journeys: true, version: { id: 'v1', seq: 1 }, display: { theme: 'light', textSize: 'default', contrast: 'default', motion: 'full', language: 'en' } }) }, 1000, family);
    });
  });
  cleanups.push(async () => {
    bridge?.close();
    for (const client of server.clients) client.terminate();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing local address');
  return { url: `ws://127.0.0.1:${address.port}/`, token: 'test-launch-credential', frames,
    bridge: () => bridge, drop: () => peer.terminate(), projection: () => projection!, connections: () => connections };
}

describe('installed-game SDK over a real loopback socket', () => {
  it('authenticates first, saves through the host and acknowledges quit after saving', async () => {
    const reasons: string[] = [];
    const server = await launcher({ save: async message => { reasons.push(message.reason); return { version: 'v2', seq: 2, at: '2026-10-15T00:00:00Z' }; } });
    const game = await connect(server);
    expect(server.frames[0]).toEqual({ token: server.token });
    expect(server.frames[1]).toMatchObject({ type: 'ready' });
    expect(game.grant.endpoint).toBe('core');
    expect('pick' in game).toBe(false);
    game.on('save.request', message => { void game.save(message.reason, []); });
    game.handle('quit', async () => { await game.save('leaving', []); return { saved: true }; });
    await expect(server.bridge().requestSave('interval')).resolves.toMatchObject({ version: 'v2' });
    await expect(server.bridge().request({ type: 'quit', reason: 'leaving' })).resolves.toEqual({ saved: true });
    expect(reasons).toEqual(['interval', 'leaving']);
    game.close();
  });
  it('uses the same protocol in check mode and reads launcher variables', async () => {
    const server = await launcher();
    vi.stubEnv('EW_SDK_URL', server.url); vi.stubEnv('EW_SDK_TOKEN', server.token); vi.stubEnv('EW_SDK_CHECK', '1');
    const game = await connect();
    expect(game.grant.endpoint).toBe('core');
    game.close();
  });
  it('opts into player projection on one authenticated socket while keeping ordinary core saves', async () => {
    const saved = vi.fn(async () => ({ version: 'v2', seq: 2, at: '2026-10-15T00:00:00Z' }));
    const launcherSocket = await launcher({ save: saved }, 'core', true);
    vi.stubEnv('EW_SDK_URL', launcherSocket.url);
    vi.stubEnv('EW_SDK_TOKEN', launcherSocket.token);
    const game = await connectWithRemotePlayerProjection();
    const descriptor: RemotePlayerProjectionDescriptor = { protocol: 'ew.remote-player.v1', calls: ['yards.view'], inputs: [] };
    const projection = serveRemotePlayerProjection(game.projection, descriptor, {
      admit: () => {},
      snapshot: ({ sender }) => [{ ew: 1, notice: 'yards.view', data: { sender } }],
      call: ({ sender }) => ({ sender }),
      input: () => {},
    });
    try {
      expect(game.core.grant.endpoint).toBe('core');
      expect(launcherSocket.connections()).toBe(1);
      expect(launcherSocket.frames.slice(0, 2)).toEqual([
        { token: launcherSocket.token },
        { ew: 1, type: 'ready', protocol: 1 },
      ]);
      await expect(launcherSocket.projection().call('ew.remote.describe')).resolves.toEqual(descriptor);
      await expect(launcherSocket.projection().call('ew.remote.snapshot', { sender: 'private-slot-sender' }))
        .resolves.toEqual([{ ew: 1, notice: 'yards.view', data: { sender: 'private-slot-sender' } }]);
      expect(launcherSocket.frames).toContainEqual(expect.objectContaining({ ewPlayerProjection: 1 }));
      projection.close();
      await expect(game.core.save('own', [])).resolves.toMatchObject({ version: 'v2' });
      expect(saved).toHaveBeenCalledTimes(1);
      expect(launcherSocket.connections()).toBe(1);
    } finally {
      projection.close();
      game.core.close();
    }
  });
  it('rejects a wrong credential without including it in the error', async () => {
    const server = await launcher();
    await expect(connect({ url: server.url, token: 'wrong-test-credential' })).rejects.toThrow('closed');
  });
  it('rejects a legacy combined endpoint', async () => {
    const server = await launcher({}, 'combined');
    await expect(connect(server)).rejects.toThrow('expected core grant');
  });
  it('rejects outstanding work when the launcher disappears', async () => {
    const server = await launcher({ save: () => new Promise(() => {}) });
    const game = await connect(server);
    const saved = game.save('own', []);
    const rejection = expect(saved).rejects.toThrow(/loopback connection (closed|failed)/);
    server.drop();
    await rejection;
  });
  it('fails missing environment without exposing supplied credentials', async () => {
    vi.stubEnv('EW_SDK_URL', ''); vi.stubEnv('EW_SDK_TOKEN', '');
    await expect(connect()).rejects.toThrow('launcher must provide');
    await expect(connect({ url: 'wss://example.invalid/', token: 'test-only' })).rejects.toThrow('loopback');
  });
});
