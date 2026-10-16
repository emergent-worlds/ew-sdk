import { loopbackTransport } from '@emergent-worlds/host';
import { connectCore, type CoreHost } from '@emergent-worlds/host/loader';

export type { CoreHost } from '@emergent-worlds/host/loader';

export interface ConnectOptions {
  /** Supplied directly by an embedding shell, or read from EW_SDK_URL. */
  url?: string;
  /** One-launch credential. Never persist it or include it in diagnostics. */
  token?: string;
  signal?: AbortSignal;
}

/** E16: check mode and ordinary play use the same game and host connection. */
export async function connect(options: ConnectOptions = {}): Promise<CoreHost> {
  const env = typeof process === 'undefined' ? undefined : process.env;
  const url = options.url ?? env?.EW_SDK_URL;
  const token = options.token ?? env?.EW_SDK_TOKEN;
  if (!url || !token) throw new Error('the launcher must provide EW_SDK_URL and EW_SDK_TOKEN');
  const transport = await loopbackTransport(url, token, { signal: options.signal });
  return connectCore(transport);
}
