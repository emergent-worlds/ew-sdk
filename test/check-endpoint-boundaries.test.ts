import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {scanTree,hostAllowed} from '../check/scan.js';
const manifest={name:'Kestrel Yards',kind:'reality',version:'1.0.0',owner:'@mercerpress',entry:{installs:{server:'build/server'}},asks:{saves:true}};
async function scan(text:string){const root=await mkdtemp(join(tmpdir(),'astra-r7-static-'));try {const path='build/server/run',bytes=Buffer.from(text);await mkdir(join(root,'build/server'),{recursive:true});await writeFile(join(root,path),bytes);await chmod(join(root,path),0o755);return await scanTree(root,[{path,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),executable:true}],'server',manifest,[]);}finally{await rm(root,{recursive:true,force:true});}}
it('does not replace the real URL port with query or fragment digits',async()=>{const e=await scan('https://runtime.example:8443?q=:443 https://runtime.example:8443#x:443');expect(e.hostFindingsComplete).toBe(true);expect(e.hosts).toEqual(['runtime.example:8443']);expect(hostAllowed(e.hosts[0]!,['runtime.example:443'])).toBe(false);expect(e.hostFindings.map(f=>f.raw)).toEqual(['runtime.example:8443','runtime.example:8443']);});
it('retains the endpoint of a valid URL with a leading-zero port',async()=>{const e=await scan('https://runtime.example:000443/path');expect(new URL('https://runtime.example:000443/path').hostname).toBe('runtime.example');expect(e.hosts).toEqual(['runtime.example:443']);});
it('does not claim a different endpoint after Latin-1 decoding UTF-8 URL bytes',async()=>{const text='https://bücher.example/path',e=await scan(text);if(e.hostFindingsComplete)expect(e.hosts).toContain(new URL(text).hostname);});
