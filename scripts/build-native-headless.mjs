/** macOS headless target. All application code is embedded as raw bytes. */
import {build} from 'esbuild';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,rm,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const run=promisify(execFile), root=fileURLToPath(new URL('../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function buildNativeHeadless(output=resolve(root,'sample/build/server-macos/kestrel-yards')) {
 if(process.platform!=='darwin'||process.arch!=='arm64') throw Error('This target requires macOS arm64. Other targets remain unsupported.');
 const temporary=await mkdtemp(join(tmpdir(),'ew-native-sample-'));
 try {
  const bundle=join(temporary,'application.js');
  const result=await build({stdin:{contents:`import {connect} from ${JSON.stringify(resolve(root,'src/index.ts'))}; import {createYard} from ${JSON.stringify(resolve(root,'sample/src/core.ts'))}; void (async()=>{await createYard(await connect({url:__launch.url,token:__launch.token}));})().catch(()=>__fatal());`,resolveDir:root,sourcefile:'native-entry.ts'},outfile:bundle,bundle:true,minify:true,sourcemap:false,format:'iife',platform:'browser',target:'es2022',metafile:true,logLevel:'silent'});
  for(const value of Object.values(result.metafile.outputs)) if(value.imports.length) throw Error('Native sample retains external application code.');
  const script=Buffer.concat([await readFile(resolve(root,'sample/native-headless/runtime.js')),Buffer.from('\n'),await readFile(bundle)]);
  await writeFile(bundle,script); await mkdir(dirname(output),{recursive:true});
  const {stdout:sdk}=await run('/usr/bin/xcrun',['--sdk','macosx','--show-sdk-path']);
  const {stdout:version}=await run('/usr/bin/swiftc',['--version']);
  await run('/usr/bin/swiftc',['-swift-version','5','-O','-module-name','KestrelYardsHeadless','-sdk',sdk.trim(),'-target','arm64-apple-macosx13.0','-framework','JavaScriptCore','-framework','Foundation',resolve(root,'sample/native-headless/main.swift'),'-Xlinker','-sectcreate','-Xlinker','__TEXT','-Xlinker','__ewjs','-Xlinker',bundle,'-o',join(temporary,'kestrel-yards')],{maxBuffer:4*1024*1024});
  // Keep the linker identity stable before copying to the caller-selected destination.
  await copyFile(join(temporary,'kestrel-yards'),output);
  const bytes=await readFile(output),{stdout:linkage}=await run('/usr/bin/otool',['-L',output]);
  const receipt={format:'ew.sample-native-package.v1',sourceBundleSha256:hash(script),sourceBundleSize:script.length,compiler:{name:'swiftc',version:version.trim()},target:{platform:'darwin',arch:'arm64',minimumOS:'13.0'},embeddedSection:{segment:'__TEXT',section:'__ewjs'},linkage:linkage.split('\n').slice(1).map(s=>s.trim()).filter(Boolean),artifact:{sha256:hash(bytes),size:bytes.length}};
  await writeFile(`${output}.build.json`,JSON.stringify(receipt,null,2)+'\n');return receipt;
 } finally {await rm(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) console.log(JSON.stringify(await buildNativeHeadless(process.argv[2]?resolve(process.argv[2]):undefined)));
