import { loopbackTransport, splitInstalledPlayerTransport, type Transport } from '@emergent-worlds/host';
import { connectCore, type CoreHost } from '@emergent-worlds/host/loader';

export type { CoreHost } from '@emergent-worlds/host/loader';
export { serveRemotePlayerProjection } from '@emergent-worlds/host';
export type {
  PortNotice, RemotePlayerProjectionCall, RemotePlayerProjectionDescriptor, RemotePlayerProjectionHandlers,
  RemotePlayerProjectionIdentity, RemotePlayerProjectionInput, RemotePlayerProjectionNotice,
  RemotePlayerProjectionSelection, RemotePlayerProjectionServer, RemotePlayerProjectionSnapshot, Transport,
} from '@emergent-worlds/host';

export interface ConnectOptions {
  /** Supplied directly by an embedding shell, or read from EW_SDK_URL. */
  url?: string;
  /** One-launch credential. Never persist it or include it in diagnostics. */
  token?: string;
  signal?: AbortSignal;
}

async function openConnection(options: ConnectOptions): Promise<Transport> {
  const env = typeof process === 'undefined' ? undefined : process.env;
  const url = options.url ?? env?.EW_SDK_URL;
  const token = options.token ?? env?.EW_SDK_TOKEN;
  if (!url || !token) throw new Error('the launcher must provide EW_SDK_URL and EW_SDK_TOKEN');
  return loopbackTransport(url, token, { signal: options.signal });
}

/** E16: check mode and ordinary play use the same game and host connection. */
export async function connect(options: ConnectOptions = {}): Promise<CoreHost> {
  return connectCore(await openConnection(options));
}

/** An installed game opts into a separate player projection on its authenticated launcher socket. */
export async function connectWithRemotePlayerProjection(options: ConnectOptions = {}): Promise<{ core: CoreHost; projection: Transport }> {
  const transport = await openConnection(options);
  try {
    const { core, projection } = splitInstalledPlayerTransport(transport);
    const host = await connectCore(core);
    if (options.signal?.aborted) throw new Error('loopback connection cancelled');
    return { core: host, projection };
  } catch (error) {
    transport.close();
    throw error;
  }
}
