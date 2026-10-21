import {beforeAll,afterAll,it,expect} from 'vitest';
import {buildNativeWindow} from '../scripts/build-native-window.mjs';
import {scanTree} from '../check/scan.ts';
import {reviewedMetadata} from '../check/reviewed-metadata.ts';
import {mkdtemp,rm,mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const supported=process.platform==='darwin'&&process.arch==='arm64',sha=b=>createHash('sha256').update(b).digest('hex');let root,packages=[];
beforeAll(async()=>{if(!supported)return;root=await mkdtemp(join(tmpdir(),'ew-window-exact-'));for(let n=0;n<2;n++)packages.push(await buildNativeWindow(join(root,`program-${n}`),`1.0.${n}`));},30000);
afterAll(async()=>{if(root)await rm(root,{recursive:true,force:true});});
it.skipIf(!supported)('binds both actual window programs and all exact reviewed contexts without inheriting another artifact',async()=>{
 expect(packages[0].artifact.sha256).not.toBe(packages[1].artifact.sha256);
 for(let n=0;n<2;n++){
  const bytes=await readFile(join(root,`program-${n}`)),record=reviewedMetadata.find(r=>r.artifactSha256===sha(bytes));expect(record).toBeDefined();expect(record.target).toBe('macos-arm64');expect(record.path).toBe('build/macos-arm64/run');expect(record.artifactSize).toBe(bytes.length);
  expect(sha(bytes.subarray(record.embedded.offset,record.embedded.offset+record.embedded.size))).toBe(packages[n].sourceBundleSha256);
  for(const finding of record.occurrences){const context=Buffer.from(finding.context);expect(bytes.subarray(finding.contextOffset,finding.contextOffset+context.length)).toEqual(context);expect(sha(context)).toBe(finding.contextSha256);}
  const tree=join(root,`tree-${n}`);await mkdir(join(tree,'build/macos-arm64'),{recursive:true});await writeFile(join(tree,'build/macos-arm64/run'),bytes);await chmod(join(tree,'build/macos-arm64/run'),0o700);
  const manifest={name:'Kestrel Yards',kind:'reality',version:`1.0.${n}`,owner:'@mercerpress',entry:{installs:{'macos-arm64':'build/macos-arm64'}},asks:{saves:true,agent:'change',input:['text'],while_away:true}},manifestBytes=Buffer.from(JSON.stringify(manifest));await writeFile(join(tree,'manifest.json'),manifestBytes);
  const files=[{path:'manifest.json',sha256:sha(manifestBytes),size:manifestBytes.length,executable:false},{path:'build/macos-arm64/run',sha256:sha(bytes),size:bytes.length,executable:true}];
  const scan=await scanTree(tree,files,'macos-arm64',manifest,[]);expect(scan.hosts).toEqual([]);expect(scan.hostFindingsComplete).toBe(true);expect(scan.hostFindings.filter(f=>f.reason==='reviewed-non-network')).toHaveLength(4);
  bytes[bytes.length-1]^=1;await writeFile(join(tree,'build/macos-arm64/run'),bytes);files[1].sha256=sha(bytes);const changed=await scanTree(tree,files,'macos-arm64',manifest,[]);expect(changed.hosts).toEqual(['127.0.0.1','t.local']);expect(changed.hostFindings.some(f=>f.reason==='reviewed-non-network')).toBe(false);
 }
},10000);
