/** Normal matching-worker build; no compiler installation or cross-worker artifact claim. */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,lstat,mkdir,mkdtemp,copyFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,basename,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function buildWindowsCheckHelper(){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('The normal Windows helper requires its actual Windows x64 compiler worker.');
 const root=fileURLToPath(new URL('../',import.meta.url)),source=join(root,'check/windows-isolation-native.cpp');
 const located=spawnSync('where.exe',['cl.exe'],{encoding:'utf8',timeout:10000,maxBuffer:65536,windowsHide:true});
 if(located.status!==0)throw Error('The existing Microsoft C++ developer command environment is unavailable.');
 const compiler=located.stdout.split(/\r?\n/).map(value=>value.trim()).find(value=>value&&basename(value).toLowerCase()==='cl.exe');
 if(!compiler)throw Error('The existing Microsoft C++ compiler is unavailable.');
 const tool=await lstat(compiler);if(!tool.isFile()||tool.isSymbolicLink())throw Error('The normal Windows compiler is not a regular tool.');
 const scratch=await mkdtemp(join(tmpdir(),'ew-windows-check-build-'));
 try{
  const output=join(scratch,'windows-isolation-native.exe');
  const args=['/nologo','/std:c++20','/EHsc','/MT','/W4','/guard:cf','/DUNICODE','/D_UNICODE','/DWIN32_LEAN_AND_MEAN',source,'/Fe'+output,
   '/link','/MACHINE:X64','/DYNAMICBASE','/NXCOMPAT','/GUARD:CF','Userenv.lib','Fwpuclnt.lib','Rpcrt4.lib','Bcrypt.lib','Advapi32.lib','User32.lib','FirewallAPI.lib','Ws2_32.lib'];
  const env={...process.env,CL:undefined,_CL_:undefined,LINK:undefined,_LINK_:undefined};
  const compiled=spawnSync(compiler,args,{env,cwd:scratch,encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024,windowsHide:true});
  if(compiled.status!==0)throw Error('The normal trusted Windows helper compilation failed.');
  const bytes=await readFile(output);
  if(bytes.length<256||bytes.length>32*1024*1024||bytes.readUInt16LE(0)!==0x5a4d)throw Error('The normal Windows helper is not a bounded PE image.');
  const pe=bytes.readUInt32LE(0x3c);
  if(pe<64||pe+26>bytes.length||bytes.readUInt32LE(pe)!==0x00004550||bytes.readUInt16LE(pe+4)!==0x8664||bytes.readUInt16LE(pe+24)!==0x020b)
   throw Error('The normal Windows helper does not target AMD64 PE32+.');
  const sha256=hash(bytes),destination=join(root,'dist/check');await mkdir(destination,{recursive:true});
  await copyFile(output,join(destination,'windows-isolation-native.exe'));
  if(hash(await readFile(join(destination,'windows-isolation-native.exe')))!==sha256)throw Error('The compiled Windows helper changed during normal output copy.');
  const version=spawnSync(compiler,['/Bv'],{encoding:'utf8',timeout:10000,maxBuffer:65536,windowsHide:true});
  await writeFile(join(destination,'windows-helper-build.json'),JSON.stringify({kind:'normal-Windows-helper-build-source',platform:process.platform,nodeArchitecture:process.arch,nativeWorkerQualified:false,
   sourceSHA256:hash(await readFile(source)),compiler:{path:resolve(compiler),sha256:hash(await readFile(compiler)),versionOutput:version.stdout+version.stderr},
   command:[compiler,...args],helperSHA256:sha256,helperBytes:bytes.length,compilationExitCode:compiled.status},null,2)+'\n');
  return {sha256,source};
 }finally{await rm(scratch,{recursive:true,force:true});}
}

/** Inject the actual compilation hash into this exact trusted module only. */
export function windowsHelperHashPlugin(sha256){
 if(!/^[a-f0-9]{64}$/.test(sha256))throw Error('The actual helper hash is unavailable.');
 const owner=fileURLToPath(new URL('../check/windows-isolation.ts',import.meta.url));
 return{name:'actual-normal-windows-helper-hash',setup(build){build.onLoad({filter:/windows-isolation\.ts$/},async args=>{
  if(resolve(args.path)!==resolve(owner))throw Error('The Windows helper hash owner changed.');
  const source=await readFile(owner,'utf8'),sentinel="const HELPER_SHA256='__EW_CHECK_HELPER_SHA256__';";
  if(source.split(sentinel).length!==2)throw Error('The trusted helper binding declaration changed.');
  return{contents:source.replace(sentinel,`const HELPER_SHA256=${JSON.stringify(sha256)};`),loader:'ts',resolveDir:dirname(owner)};
 });}};
}
