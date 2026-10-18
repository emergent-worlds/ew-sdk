/** Fresh self-contained sample packaging. This does not classify, sign or release an artifact. */
import {build} from 'esbuild';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {builtinModules} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const run=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
export const standaloneFlags=Object.freeze(['--compile','--minify','--reject-unresolved','--sourcemap=none','--no-compile-autoload-dotenv','--no-compile-autoload-bunfig','--no-compile-autoload-tsconfig','--no-compile-autoload-package-json']);
const builtins=new Set(builtinModules.flatMap(name=>[name,`node:${name}`]));
/** Bundle actual reachable code; external runtime files are not a self-contained sample. */
export async function bundleStandaloneEntry(entry,outfile){
 const result=await build({entryPoints:[entry],outfile,bundle:true,minify:true,sourcemap:false,format:'esm',platform:'node',target:'es2023',metafile:true,logLevel:'silent'});
 for(const output of Object.values(result.metafile.outputs))for(const dependency of output.imports)if(dependency.external&&!builtins.has(dependency.path))throw Error('The standalone sample retains an external runtime dependency.');
 return createHash('sha256').update(await readFile(outfile)).digest('hex');
}
export async function buildStandaloneSample(output=resolve(root,'sample/build/server/kestrel-yards')){
 const temporary=await mkdtemp(join(tmpdir(),'ew-sdk-package-'));
 try{
  const bundle=join(temporary,'headless.mjs'),sourceBundleSha256=await bundleStandaloneEntry(resolve(root,'sample/src/headless.ts'),bundle);
  await mkdir(dirname(output),{recursive:true});
  const {stdout:version}=await run('bun',['--version'],{cwd:root});
  await run('bun',['build',...standaloneFlags,bundle,'--outfile',output],{cwd:root});
  const bytes=await readFile(output),receipt={format:'ew.sample-package.v1',sourceBundleSha256,compiler:{name:'bun',version:version.trim()},target:{platform:process.platform,arch:process.arch},flags:standaloneFlags,artifact:{sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length}};
  await writeFile(`${output}.build.json`,JSON.stringify(receipt,null,2)+'\n');return receipt;
 }finally{await rm(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){const receipt=await buildStandaloneSample(process.argv[2]?resolve(process.argv[2]):undefined);console.log(JSON.stringify(receipt));}
