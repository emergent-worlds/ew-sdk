/** Self-contained current-Mac installed window and headless Check modes share one exact program. */
import {build} from 'esbuild';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,rm,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const run=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
export async function buildNativeWindow(output=resolve(root,'sample/build/macos-arm64/KestrelYards.app'),version='1.0.0'){
 if(process.platform!=='darwin'||process.arch!=='arm64'||!output.endsWith('.app')||!/^\d+\.\d+\.\d+$/.test(version))throw Error('This packaging path requires macOS arm64 and a release version');
 const temporary=await mkdtemp(join(tmpdir(),'ew-native-window-'));
 try{
  const bundle=join(temporary,'application.js');
  const result=await build({entryPoints:[resolve(root,'sample/native-headless/window-entry.ts')],outfile:bundle,bundle:true,minify:true,sourcemap:false,format:'iife',platform:'browser',target:'es2022',metafile:true,logLevel:'silent',define:{__kestrelRelease:JSON.stringify(version)}});
  for(const value of Object.values(result.metafile.outputs))if(value.imports.length)throw Error('Native window retains external application code');
  const script=Buffer.concat([await readFile(resolve(root,'sample/native-headless/runtime.js')),Buffer.from('\n'),await readFile(bundle)]);await writeFile(bundle,script);await mkdir(dirname(output),{recursive:true});
  const {stdout:sdk}=await run('/usr/bin/xcrun',['--sdk','macosx','--show-sdk-path']),{stdout:compiler}=await run('/usr/bin/swiftc',['--version']);
  await run('/usr/bin/swiftc',['-swift-version','5','-O','-D','EW_NATIVE_WINDOW','-module-name','KestrelYardsWindow','-sdk',sdk.trim(),'-target','arm64-apple-macosx13.0','-framework','JavaScriptCore','-framework','Foundation','-framework','AppKit',resolve(root,'sample/native-headless/main.swift'),resolve(root,'sample/native-headless/window.swift'),'-Xlinker','-sectcreate','-Xlinker','__TEXT','-Xlinker','__ewjs','-Xlinker',bundle,'-o',join(temporary,'kestrel-yards')],{maxBuffer:4*1024*1024});
  const executable=join(output,'Contents/MacOS/KestrelYards');await mkdir(dirname(executable),{recursive:true});await copyFile(join(temporary,'kestrel-yards'),executable);
  const plist=Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>KestrelYards</string><key>CFBundleIdentifier</key><string>com.emergentworldslabs.kestrelyards</string><key>CFBundleName</key><string>Kestrel Yards</string><key>CFBundleDisplayName</key><string>Kestrel Yards</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleVersion</key><string>${version}</string><key>LSMinimumSystemVersion</key><string>13.0</string><key>NSHighResolutionCapable</key><true/></dict></plist>`);await writeFile(join(output,'Contents/Info.plist'),plist);
  const bytes=await readFile(executable),{stdout:linkage}=await run('/usr/bin/otool',['-L',executable]);
  const receipt={format:'ew.sample-native-window.v1',version,sourceBundleSha256:hash(script),sourceBundleSize:script.length,compiler:{name:'swiftc',version:compiler.trim()},target:{platform:'darwin',arch:'arm64',minimumOS:'13.0'},embeddedSection:{segment:'__TEXT',section:'__ewjs'},linkage:linkage.split('\n').slice(1).map(s=>s.trim()).filter(Boolean),artifact:{sha256:hash(bytes),size:bytes.length},bundle:{name:basename(output),executable:'Contents/MacOS/KestrelYards',infoPlistSha256:hash(plist),infoPlistSize:plist.length}};
  await writeFile(`${output}.build.json`,JSON.stringify(receipt,null,2)+'\n');return receipt;
 }finally{await rm(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)console.log(JSON.stringify(await buildNativeWindow(process.argv[2]?resolve(process.argv[2]):undefined,process.argv[3])));
