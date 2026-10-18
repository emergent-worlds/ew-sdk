import { BuildTarget, Manifest, portablePath } from '@emergent-worlds/host';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { createReadStream } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export interface CheckFile { path: string; sha256: string; size: number; executable: boolean }
export interface HostFinding { path: string; offset: number; raw: string; rawLength: number; rawSha256: string; host: string | null; reason: 'potential-endpoint' | 'invalid-endpoint' | 'partial-token' }
export interface StaticEvidence { verifiedFiles: number; hosts: string[]; providerHosts: string[]; archives: string[]; outsideExecutables: string[]; hostFindings: HostFinding[]; hostFindingCount: number; hostFindingsComplete: boolean }
// Evidence capacity is explicit. Incomplete findings cannot admit a build or signing.
export const MAX_HOST_FINDINGS = 256;

export function folderPath(value: string): string {
  if (!value || value.length > 512 || value.includes('\\') || value.includes('\0') || isAbsolute(value) || value.split('/').some(part => !part || part === '.' || part === '..') || /^[a-z]:/i.test(value)) throw new Error('the check tree contains an invalid path');
  return value;
}
export const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** Check runners receive an already laid-out tree; links are never executable inputs. */
export async function checkedPath(root: string, path: string): Promise<string> {
  folderPath(path);
  const base = await realpath(root);
  let current = base;
  for (const part of path.split('/')) {
    current = resolve(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error('the check tree contains a link');
  }
  const actual = await realpath(current);
  const rel = relative(base, actual);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('the check tree escapes its root');
  if (!(await lstat(actual)).isFile()) throw new Error('the check tree names a non-file');
  return actual;
}

export function validateFiles(files: readonly CheckFile[]): void {
  if (!Array.isArray(files) || files.length === 0 || files.length > 10000) throw new Error('a build check takes one to 10000 files');
  const seen = new Set<string>();
  for (const file of files) {
    const path = folderPath(file.path);
    // A case-folded collision cannot be installed consistently across the desktop targets.
    const key = path.normalize('NFC').toLowerCase();
    if (seen.has(key) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.executable !== 'boolean') throw new Error('the check tree contains an invalid or duplicate file');
    seen.add(key);
  }
}

export function namedHost(value: string): string {
  const lower = value.toLowerCase();
  const match = /^(\[[a-f0-9:]+\]|[^:]+)(?::(\d{1,5}))?$/.exec(lower);
  if (!match) throw new Error('the check received an invalid host');
  const host = match[1]!, port = match[2];
  if (port !== undefined && Number(port) > 65535) throw new Error('the check received an invalid port');
  let normalized = host;
  if (host.startsWith('[')) {
    if (isIP(host.slice(1, -1)) !== 6) throw new Error('the check received an invalid IPv6 host');
    normalized = new URL(`http://${host}`).hostname;
  } else if (/^[0-9.]+$/.test(host)) {
    if (isIP(host) !== 4) throw new Error('the check received an invalid IPv4 host');
  } else {
    normalized = host.endsWith('.') ? host.slice(0,-1) : host;
    if (normalized.length > 253 || !normalized.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw new Error('the check received an invalid DNS host');
  }
  return normalized + (port === undefined ? '' : `:${Number(port)}`);
}
export function hostAllowed(endpoint: string, allowed: readonly string[]): boolean {
  const value = namedHost(endpoint);
  return allowed.some(item => {
    const grant = namedHost(item);
    return value === grant || (!/:\d+$/.test(grant) && value.replace(/:\d+$/, '') === grant);
  });
}

const archiveName = /\.(?:zip|tar|tgz|gz|bz2|xz|7z|rar|cab|iso|dmg)$/i;
function archiveMagic(bytes: Buffer): boolean {
  return (bytes[0] === 0x50 && bytes[1] === 0x4b && [3, 5, 7].includes(bytes[2] ?? 0) && [4, 6, 8].includes(bytes[3] ?? 0)) || bytes.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b])) || bytes.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) || bytes.subarray(0, 4).toString('ascii') === 'Rar!' || bytes.subarray(0, 3).toString('ascii') === 'BZh' || bytes.subarray(0, 6).equals(Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0])) || bytes.subarray(257, 262).toString('ascii') === 'ustar';
}
const executableMagic = (bytes: Buffer) => bytes.subarray(0, 2).toString('ascii') === 'MZ' || bytes.subarray(0, 2).toString('ascii') === '#!' || ['7f454c46', 'feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca'].includes(bytes.subarray(0, 4).toString('hex'));
const hostPattern = /\b(https?|wss?):\/\/([^\s/?#"'`<>(){}\\\x00-\x20]+)|\b((?:\d{1,3}\.){3}\d{1,3})(:\d{1,5})?|\b((?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+(?:com|net|org|io|dev|app|ai|co|cloud|local))(:\d{1,5})?/gi;

/** Prefix authority comes only from the parsed immutable manifest, never a caller exemption. */
export function declaredBuildPrefixes(input: unknown): string[] {
  const manifest = Manifest.parse(input);
  const prefixes = Object.values(manifest.entry?.installs ?? {});
  if (!prefixes.length) throw new Error('the manifest declares no build prefixes');
  for (const prefix of prefixes) if (!portablePath(prefix)) throw new Error('the manifest declares an invalid build prefix');
  const folded = prefixes.map(prefix => prefix.toLowerCase());
  for (let i = 0; i < folded.length; i++) for (let j = i + 1; j < folded.length; j++) {
    if (under(folded[i]!, folded[j]!) || under(folded[j]!, folded[i]!)) throw new Error('the manifest declares overlapping build prefixes');
  }
  return prefixes;
}

/** Conservative static evidence. Embedded metadata is not silently exempted. */
export async function scanTree(root: string, files: readonly CheckFile[], target: BuildTarget, input: unknown, providers: readonly string[]): Promise<StaticEvidence> {
  validateFiles(files); const manifest = Manifest.parse(input); const prefixes = declaredBuildPrefixes(manifest);
  const prefix = manifest.entry?.installs?.[BuildTarget.parse(target)];
  if (!prefix) throw new Error('the active build target is not declared');
  providers.forEach(namedHost);
  const hosts = new Set<string>();
  const hostFindings: HostFinding[] = []; let hostFindingCount = 0; let croppedFinding = false;
  const archives: string[] = []; const outsideExecutables: string[] = [];
  for (const file of files) {
    const path = await checkedPath(root, file.path);
    const stat = await lstat(path);
    if (stat.size !== file.size || (process.platform !== 'win32' && Boolean(stat.mode & 0o111) !== file.executable)) throw new Error('a file differs from the checked tree');
    const hash = createHash('sha256'); let count = 0; let tail = ''; let first = Buffer.alloc(0); let processedThrough = -1;
    const inspect = (text: string, base: number, final: boolean) => {
      for (const match of text.matchAll(hostPattern)) {
        const end = match.index! + match[0].length;
        // Leave possible boundary-spanning tokens for the next chunk, including right context.
        if (!final && end > text.length - 2048) { if(match[0].length > 2048) croppedFinding = true; continue; }
        const absoluteEnd = base + end;
        if (absoluteEnd <= processedThrough) continue;
        processedThrough = absoluteEnd;
        const explicit = match[1] !== undefined;
        const authority = explicit ? match[2]! : '';
        const raw = explicit ? authority.slice(authority.lastIndexOf('@')+1) : `${match[3] ?? match[5]}${match[4] ?? match[6] ?? ''}`;
        const offset = base + match.index! + match[0].lastIndexOf(raw);
        const left = text[match.index! - 1] ?? '', right = text[end] ?? '';
        let host: string | null = null, reason: HostFinding['reason'] = 'potential-endpoint';
        if (!explicit && (/[a-z0-9_.-]/i.test(left) || /[a-z0-9_.:@-]/i.test(right))) reason = 'partial-token';
        else { try {
          if (explicit) {
            // Preserve byte offsets, but decode UTF-8 strictly before URL normalization.
            const decodedAuthority = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(authority, 'latin1'));
            const parsed = new URL(`${match[1]}://${decodedAuthority}/`), explicitPort = /:(\d+)$/.exec(raw)?.[1];
            host = namedHost(parsed.hostname + (explicitPort === undefined ? '' : `:${Number(explicitPort)}`));
          } else host = namedHost(raw);
        } catch { reason = 'invalid-endpoint'; if (explicit && /[^\x00-\x7f]/.test(authority)) croppedFinding = true; } }
        if (host !== null) hosts.add(host);
        hostFindingCount++; if(raw.length > 512) croppedFinding = true;
        if (hostFindings.length < MAX_HOST_FINDINGS) hostFindings.push({path:file.path, offset, raw:raw.slice(0,512), rawLength:raw.length, rawSha256:createHash('sha256').update(raw,'latin1').digest('hex'), host, reason});
      }
    };
    for await (const chunk of createReadStream(path)) {
      const bytes = Buffer.from(chunk); count += bytes.length; hash.update(bytes);
      if (count > file.size) throw new Error('a file changed during the scan');
      if (first.length < 512) first = Buffer.concat([first, bytes]).subarray(0, 512);
      if (under(file.path, prefix)) {
        // Latin-1 keeps one character per byte; endpoint grammar is ASCII and offsets are exact.
        const text = tail + bytes.toString('latin1');
        inspect(text, count - bytes.length - tail.length, false);
        tail = text.slice(-4096);
      }
    }
    if (under(file.path, prefix)) inspect(tail, count - tail.length, true);
    if (count !== file.size || hash.digest('hex') !== file.sha256) throw new Error('a file differs from the checked tree');
    if (archiveName.test(file.path) || archiveMagic(first)) archives.push(file.path);
    if ((file.executable || executableMagic(first)) && !prefixes.some(declared => under(file.path, declared))) outsideExecutables.push(file.path);
  }
  const sorted = [...hosts].sort();
  return { verifiedFiles: files.length, hosts: sorted, providerHosts: sorted.filter(host => hostAllowed(host, providers)), archives, outsideExecutables, hostFindings, hostFindingCount, hostFindingsComplete: !croppedFinding && hostFindingCount <= MAX_HOST_FINDINGS };
}
