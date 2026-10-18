import {afterEach,expect,it} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {bundleStandaloneEntry} from '../scripts/build-standalone-sample.mjs';
import {scanTree} from '../check/scan.ts';
const roots=[];afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function directory(){const root=await mkdtemp(join(tmpdir(),'ew-sdk-package-test-'));roots.push(root);return root;}
it('removes unreachable source routes while the unchanged production scan still refuses reachable endpoint occurrences',async()=>{
 const root=await directory(),entry=join(root,'entry.js'),output=join(root,'run.js');
 await writeFile(join(root,'unused.js'),'export function unused(){return fetch("https://unused.example/path");}');
 await writeFile(entry,'import {unused} from "./unused.js"; console.log(["https://runtime.example/one","https://runtime.example/two"]);');
 const hash=await bundleStandaloneEntry(entry,output),bytes=await readFile(output);expect(bytes.toString()).not.toContain('unused.example');expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
 const evidence=await scanTree(root,[{path:'run.js',sha256:hash,size:bytes.length,executable:false}],'server',{name:'Kestrel Yards',kind:'reality',version:'1.0.0',owner:'@mercerpress',entry:{installs:{server:'run.js'}},asks:{}},[]);
 expect(evidence.hosts).toEqual(['runtime.example']);expect(evidence.hostFindings).toHaveLength(2);expect(evidence.hostFindings.every(row=>row.reason==='potential-endpoint')).toBe(true);expect(evidence.hostFindingsComplete).toBe(true);
 for(const row of evidence.hostFindings)expect(bytes.subarray(row.offset,row.offset+row.rawLength).toString()).toBe(row.raw);
});
it('refuses a source dependency that would require a remote runtime import',async()=>{
 const root=await directory(),entry=join(root,'entry.js');await writeFile(entry,'import value from "https://runtime.example/program.js"; console.log(value);');await expect(bundleStandaloneEntry(entry,join(root,'run.js'))).rejects.toThrow();
});
