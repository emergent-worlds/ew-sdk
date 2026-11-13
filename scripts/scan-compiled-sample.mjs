/** Static-only diagnosis of the exact local sample artifact. It cannot produce a signed pass. */
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { scanTree } from '../check/scan.ts';
const root = await mkdtemp(join(tmpdir(), 'ew-compiled-static-'));
try {
  const entry = 'build/server/run';
  await mkdir(join(root, 'build/server'), { recursive: true });
  await copyFile(process.argv[2]?resolve(process.argv[2]):new URL('../sample/build/server/kestrel-yards', import.meta.url), join(root, entry));
  const artifact = await readFile(join(root, entry));
  const manifest = { name:'Kestrel Yards', kind:'reality', version:'1.0.0', owner:'@mercerpress', entry:{installs:{server:'build/server'}}, asks:{saves:true,while_away:true,agent:'change'} };
  const bytes = Buffer.from(JSON.stringify(manifest));
  await writeFile(join(root, 'manifest.json'), bytes, { mode:0o600 });
  const sha = value => createHash('sha256').update(value).digest('hex');
  const files = [{path:entry,sha256:sha(artifact),size:artifact.length,executable:true},{path:'manifest.json',sha256:sha(bytes),size:bytes.length,executable:false}];
  const evidence = await scanTree(root, files, 'server', manifest, []);
  console.log(JSON.stringify({artifact:files[0],evidence,scope:'Static-only exact compiled sample diagnosis. No execution, provider catalogue, metadata exemption, confinement or signing acceptance.'}));
} finally { await rm(root, { recursive:true, force:true }); }
