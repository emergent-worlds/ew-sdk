import { execFile } from 'node:child_process';
import { readFile, readdir, readlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { namedHost } from './scan.js';

const exec = promisify(execFile);
export interface SocketSample { endpoints: string[]; method: string }
/** Compare sampled IP endpoints with the declared names' addresses at the start of this run. */
export async function resolveNetworkAsk(hosts: readonly string[]): Promise<string[]> {
  const allowed = new Set(hosts.map(namedHost));
  for (const value of hosts) {
    const port = value.match(/:\d+$/)?.[0] ?? '';
    const host = value.slice(0, value.length - port.length).replace(/^\[|\]$/g, '');
    if (isIP(host)) continue;
    try { for (const address of await lookup(host, { all: true, verbatim: true })) allowed.add(namedHost(`${address.address.includes(':') ? `[${address.address}]` : address.address}${port}`)); }
    catch { /* An unused declared host need not be reachable; unmatched observed connections still fail. */ }
  }
  return [...allowed];
}
const endpoint = (value: string) => {
  if (value === '*.*' || value === '*:*') return undefined;
  const match = value.match(/^(.*)[.:](\d+)$/);
  if (!match || Number(match[2]) === 0) return undefined;
  const host = match[1]!.replace(/^\[|\]$/g, '');
  return `${host.includes(':') ? `[${host}]` : host}:${match[2]}`;
};

export function parseWindowsNetstat(text: string, pid: number): string[] {
  return text.split(/\r?\n/).flatMap(line => {
    const fields = line.trim().split(/\s+/);
    if (fields[0] !== 'TCP' || fields[4] !== String(pid) || fields[3] === 'LISTENING') return [];
    const remote = endpoint(fields[2]!); return remote ? [remote] : [];
  });
}
export function parseMacNetstat(text: string, pid: number): string[] {
  const lines = text.split(/\r?\n/);
  const header = lines.find(line => line.includes('Foreign Address') && line.includes('process:pid'));
  if (!header) throw new Error('the socket sampler did not recognize netstat');
  return lines.flatMap(line => {
    // macOS expands the header's address columns but uses shorter data columns.
    const fields = line.trim().split(/\s+/);
    if (!/^tcp[46]$/.test(fields[0] ?? '') || !fields[10]?.endsWith(`:${pid}`) || fields[5] === 'LISTEN') return [];
    const remote = endpoint(fields[4]!); return remote ? [remote] : [];
  });
}
function linuxEndpoint(value: string): string | undefined {
  const [address, portHex] = value.split(':'); const port = parseInt(portHex!, 16);
  if (!address || !port) return undefined;
  if (address.length === 8) return `${Buffer.from(address, 'hex').reverse().join('.')}:${port}`;
  if (address.length !== 32) throw new Error('the socket sampler received an invalid address');
  const bytes = Buffer.concat(Array.from({ length: 4 }, (_, i) => Buffer.from(address.slice(i * 8, i * 8 + 8), 'hex').reverse()));
  const groups = Array.from({ length: 8 }, (_, i) => bytes.readUInt16BE(i * 2).toString(16));
  return `[${groups.join(':')}]:${port}`;
}
export function parseLinuxSockets(text: string, owned: ReadonlySet<string>): string[] {
  return text.split(/\r?\n/).slice(1).flatMap(line => {
    const fields = line.trim().split(/\s+/);
    if (!owned.has(fields[9]!) || fields[3] === '0A') return [];
    const remote = linuxEndpoint(fields[2]!); return remote ? [remote] : [];
  });
}

/** Only the launched process's sockets are sampled; this is not a network sandbox. */
export async function sampleSockets(pid: number): Promise<SocketSample> {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('the socket sampler needs a process');
  if (process.platform === 'linux') {
    const links = await Promise.all((await readdir(`/proc/${pid}/fd`)).map(fd => readlink(`/proc/${pid}/fd/${fd}`).catch(() => '')));
    const owned = new Set(links.flatMap(link => link.match(/^socket:\[(\d+)\]$/)?.[1] ?? []));
    const tables = await Promise.all(['tcp', 'tcp6'].map(name => readFile(`/proc/${pid}/net/${name}`, 'utf8')));
    return { endpoints: tables.flatMap(text => parseLinuxSockets(text, owned)), method: 'proc-pid-fd-and-tcp' };
  }
  if (process.platform === 'darwin') {
    const { stdout } = await exec('/usr/sbin/netstat', ['-anv', '-p', 'tcp']);
    return { endpoints: parseMacNetstat(stdout, pid), method: 'netstat-process-pid' };
  }
  if (process.platform === 'win32') {
    const { stdout } = await exec('netstat.exe', ['-ano', '-p', 'tcp'], { windowsHide: true });
    return { endpoints: parseWindowsNetstat(stdout, pid), method: 'netstat-ano-pid' };
  }
  throw new Error('this operating system has no build-check socket sampler');
}
