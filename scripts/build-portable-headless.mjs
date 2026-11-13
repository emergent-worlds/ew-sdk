/** Actual matching Linux/Windows sample. Mac retains its unchanged Swift/JSC builder. */
import {build} from 'esbuild';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,mkdtemp,rm,copyFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const run=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const SOURCE='6a9fe9af5ca0bf7c49ae697edef44864272317d1';
export function portableHeadlessTarget(platform=process.platform,arch=process.arch){
 if(!['linux','win32'].includes(platform)||arch!=='x64')throw Error('Use the actual matching Linux or Windows x64 worker.');
 return{platform,arch,target:platform==='linux'?'linux-x64':'windows-x64',format:platform==='linux'?'elf64':'pe32+',extension:platform==='win32'?'.exe':''};
}
export function verifyPortableFormat(bytes,target){
 if(!['elf64','pe32+'].includes(target.format))throw Error('An exact supported native format is required.');
 if(target.format==='elf64'){if(bytes.length<64||bytes.subarray(0,4).toString('hex')!=='7f454c46'||bytes[4]!==2||bytes[5]!==1||bytes.readUInt16LE(18)!==62)throw Error('The artifact does not match the actual ELF64 x64 target.');}
 else{const pe=bytes.length>=64?bytes.readUInt32LE(0x3c):0;if(bytes.subarray(0,2).toString()!=='MZ'||pe<64||pe+26>bytes.length||bytes.readUInt32LE(pe)!==0x00004550||bytes.readUInt16LE(pe+4)!==0x8664||bytes.readUInt16LE(pe+24)!==0x20b)throw Error('The artifact does not match the actual PE32+ x64 target.');}
}
export function portableEmbeddedSource(bytes,target){
 verifyPortableFormat(bytes,target);let offset,size;
 if(target.format==='elf64'){
  const table=Number(bytes.readBigUInt64LE(40)),entrySize=bytes.readUInt16LE(58),count=bytes.readUInt16LE(60),strings=bytes.readUInt16LE(62);
  if(!Number.isSafeInteger(table)||entrySize<64||!count||strings>=count||table+entrySize*count>bytes.length)throw Error('Invalid native section table.');
  const names=table+entrySize*strings,base=Number(bytes.readBigUInt64LE(names+24)),length=Number(bytes.readBigUInt64LE(names+32));
  if(!Number.isSafeInteger(base)||!Number.isSafeInteger(length)||base+length>bytes.length)throw Error('Invalid native section names.');
  for(let i=0;i<count;i++){const section=table+i*entrySize,nameOffset=bytes.readUInt32LE(section);if(nameOffset>=length)throw Error('Invalid native section name.');
   const end=bytes.indexOf(0,base+nameOffset);if(end<0||end>=base+length)throw Error('Unterminated native section name.');
   if(bytes.subarray(base+nameOffset,end).toString()!=='.ewjs')continue;
   if(offset!==undefined||bytes.readBigUInt64LE(section+8)&5n)throw Error('Embedded application must have one read-only, non-executable section.');
   offset=Number(bytes.readBigUInt64LE(section+24));size=Number(bytes.readBigUInt64LE(section+32));
  }
 }else{
  const pe=bytes.readUInt32LE(60),count=bytes.readUInt16LE(pe+6),table=pe+24+bytes.readUInt16LE(pe+20);
  if(!count||table+count*40>bytes.length)throw Error('Invalid native section table.');
  for(let i=0;i<count;i++){const section=table+i*40,name=bytes.subarray(section,section+8).toString().replace(/\0.*$/,'');if(name!=='.ewjs')continue;
   const flags=bytes.readUInt32LE(section+36);if(offset!==undefined||(flags&0xa0000000)!==0||(flags&0x40000000)===0)throw Error('Embedded application must have one read-only, non-executable section.');
   size=bytes.readUInt32LE(section+8);if(size>bytes.readUInt32LE(section+16))throw Error('Embedded section cannot be zero-filled.');offset=bytes.readUInt32LE(section+20);
  }
 }
 if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(size)||size<1||offset<1||offset+size>bytes.length)throw Error('The complete embedded application is unavailable.');
 return{offset,size,bytes:bytes.subarray(offset,offset+size)};
}

export function portableApplicationEntry(sourceRoot=root){
 return 'import {connect} from '+JSON.stringify(resolve(sourceRoot,'src/index.ts'))+'; import {createYard} from '+JSON.stringify(resolve(sourceRoot,'sample/src/core.ts'))+'; void (async()=>{await createYard(await connect({url:__launch.url,token:__launch.token}));})().catch(()=>__fatal());';
}
export async function verifyPortableApplicationInputs(receipt,sourceRoot=root){
 const inputs=receipt?.fullSDKKestrelEngineSources;
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))throw Error('The complete application source inventory is required.');
 const entry=portableApplicationEntry(sourceRoot),inline=inputs['native-entry.ts'];
 if(inline?.kind!=='exact-inline-entry'||inline.contents!==entry||inline.sha256!==hash(Buffer.from(entry)))throw Error('The actual inline application entry differs from current source.');
 const runtime=inputs['sample/native-headless/runtime.js'];
 if(!runtime||runtime.kind!==undefined||runtime.sha256!==hash(await readFile(join(sourceRoot,'sample/native-headless/runtime.js'))))throw Error('The native bridge runtime differs from current source.');
 for(const[name,original]of Object.entries(inputs)){
  if(name==='native-entry.ts')continue;
  if(!original||original.kind!==undefined||original.sha256!==hash(await readFile(resolve(sourceRoot,name))))throw Error('An application source differs from the actual current input.');
 }
 if(!inputs['src/index.ts']||!inputs['sample/src/core.ts'])throw Error('The actual full SDK sample roots are required.');
}

export async function buildPortableHeadless(output){
 const target=portableHeadlessTarget();output=resolve(output??join(root,'sample/build',target.target,'KestrelYards'+target.extension));
 const runtimeRoot=join(root,'vendor/quickjs-ng'),source=JSON.parse(await readFile(join(runtimeRoot,'source.json'),'utf8'));
 if(source.commit!==SOURCE||source.version!=='0.11.0'||source.license!=='MIT')throw Error('The exact reviewed QuickJS source is required.');
 for(const[name,digest]of Object.entries(source.files))if(hash(await readFile(join(runtimeRoot,name)))!==digest)throw Error('QuickJS source differs from the reviewed original.');
 const temporary=await mkdtemp(join(tmpdir(),'ew-portable-sample-')),commands=[];
 try{
  const bundle=join(temporary,'application.js');
  const applicationSource=portableApplicationEntry();
  const bundled=await build({stdin:{contents:applicationSource,resolveDir:root,sourcefile:'native-entry.ts'},outfile:bundle,bundle:true,minify:true,sourcemap:false,format:'iife',platform:'browser',target:'es2022',metafile:true,logLevel:'silent'});
  for(const value of Object.values(bundled.metafile.outputs))if(value.imports.length)throw Error('The native sample retains external application code.');
  const runtimeBytes=await readFile(join(root,'sample/native-headless/runtime.js'));
  const script=Buffer.concat([runtimeBytes,Buffer.from('\n'),await readFile(bundle)]);
  const sourceInputs={};for(const name of Object.keys(bundled.metafile.inputs))sourceInputs[name]=name==='native-entry.ts'?{kind:'exact-inline-entry',sha256:hash(Buffer.from(applicationSource)),contents:applicationSource}:{sha256:hash(await readFile(resolve(root,name)))};
  sourceInputs['sample/native-headless/runtime.js']={sha256:hash(runtimeBytes)};
  sourceInputs['native-entry.ts']={kind:'exact-inline-entry',sha256:hash(Buffer.from(applicationSource)),contents:applicationSource};
  await verifyPortableApplicationInputs({fullSDKKestrelEngineSources:sourceInputs});
  const generated=join(temporary,'generated');await mkdir(generated);
  const payload=[...script,0];const rows=[];for(let i=0;i<payload.length;i+=32)rows.push(payload.slice(i,i+32).map(n=>'0x'+n.toString(16).padStart(2,'0')).join(',')+',');
  const notice=await readFile(join(runtimeRoot,'LICENSE'));const noticeRows=[];for(let i=0;i<notice.length+1;i+=32)noticeRows.push([...Buffer.concat([notice,Buffer.from([0])]).subarray(i,i+32)].map(n=>'0x'+n.toString(16).padStart(2,'0')).join(',')+',');
  const noticeHeader='#ifdef _MSC_VER\n#pragma section(".ewnote",read)\n__declspec(allocate(".ewnote"))\n#else\n__attribute__((section(".ewnote"),used,aligned(1)))\n#endif\nstatic const volatile unsigned char ew_runtime_notice[]={\n'+noticeRows.join('\n')+'\n};\n';
  const header='#include <stddef.h>\n#ifdef _MSC_VER\n#pragma section(".ewjs",read)\n__declspec(allocate(".ewjs"))\n#else\n__attribute__((section(".ewjs"),used,aligned(1)))\n#endif\nstatic const unsigned char ew_application[]={\n'+rows.join('\n')+'\n};\nstatic const size_t ew_application_size='+script.length+';\n'+noticeHeader;
  await writeFile(join(generated,'embedded.h'),header);
  const env={...process.env};for(const key of['CFLAGS','CXXFLAGS','LDFLAGS','CC','CXX','CMAKE_TOOLCHAIN_FILE','CMAKE_PROJECT_TOP_LEVEL_INCLUDES'])delete env[key];
  const buildRoot=join(temporary,'build'),configure=['-S',join(root,'sample/native-portable'),'-B',buildRoot,'-DEW_EMBEDDED_DIR='+generated,'-DCMAKE_BUILD_TYPE=Release'];
  if(process.platform==='win32')configure.push('-G','Visual Studio 17 2022','-A','x64');
  const buildDeadline=Date.now()+150000;
  const invoke=async(command,args)=>{const remaining=buildDeadline-Date.now();if(remaining<=0)throw Error('The finite native build deadline expired.');const result=await run(command,args,{cwd:root,env,timeout:remaining,maxBuffer:4*1024*1024,windowsHide:true});commands.push({command:[command,...args],stdout:result.stdout,stderr:result.stderr});return result;};
  const version=await invoke('cmake',['--version']);await invoke('cmake',configure);await invoke('cmake',['--build',buildRoot,'--target','ew_native','--config','Release','--parallel','2']);
  const artifact=join(buildRoot,...(process.platform==='win32'?['Release','KestrelYards.exe']:['KestrelYards']));const bytes=await readFile(artifact);verifyPortableFormat(bytes,target);const embedded=portableEmbeddedSource(bytes,target);if(!embedded.bytes.subarray(0,script.length).equals(script)||!embedded.bytes.subarray(script.length).length||!embedded.bytes.subarray(script.length).every(n=>n===0))throw Error('The complete actual source bundle is missing from the read-only artifact section.');if(!bytes.includes(notice))throw Error('The runtime license notice is missing from the actual artifact.');
  const nativeSources={};for(const name of['main.c','channel.c','channel.h','CMakeLists.txt'])nativeSources[name]=hash(await readFile(join(root,'sample/native-portable',name)));
  const cache=await readFile(join(buildRoot,'CMakeCache.txt'),'utf8');
  await mkdir(dirname(output),{recursive:true});await copyFile(artifact,output);await writeFile(output+'.quickjs-license.txt',notice);if(process.platform!=='win32')await chmod(output,0o755);
  const receipt={format:'ew.sample-portable-native-package.v1',target,compiler:{name:'cmake-system-C',cmake:version.stdout.split('\n')[0],commands,cache},runtime:{name:'quickjs-ng',version:source.version,commit:SOURCE,license:source.license,licenseSHA256:hash(notice),licenseIncludedInArtifact:true,sourceFiles:source.files,standardLibraryModulesInstalled:false},sourceBundleSha256:hash(script),sourceBundleSize:script.length,embeddedSection:{name:'.ewjs',offset:embedded.offset,size:embedded.size,sha256:hash(embedded.bytes)},embeddedHeaderSHA256:hash(Buffer.from(header)),fullSDKKestrelEngineSources:sourceInputs,nativeSources,artifact:{sha256:hash(bytes),size:bytes.length},nativeExecutableLaunched:false,buildOrNetworkAcceptanceClaimed:false};
  await writeFile(output+'.build.json',JSON.stringify(receipt,null,2)+'\n');return receipt;
 }finally{await rm(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)console.log(JSON.stringify(await buildPortableHeadless(process.argv[2])));
