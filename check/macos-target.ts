/** The actual worker ABI determines the target and thin executable. No translation supplies proof. */
export type MacosCheckArchitecture='arm64'|'x64';
export function requireMacosWorker(platform:string,arch:string):MacosCheckArchitecture{
 if(platform!=='darwin'||arch!=='arm64'&&arch!=='x64')throw Error('This confinement executor requires current macOS arm64 or x64');return arch;
}
export function requireMacosClaimTarget(input:{platform:string;arch:string;target:string},actual:{platform:string;arch:string}):MacosCheckArchitecture{
 const arch=requireMacosWorker(actual.platform,actual.arch),target=arch==='arm64'?'macos-arm64':'macos-x64';
 if(input.platform!==actual.platform||input.arch!==arch||input.target!==target&&input.target!=='server')throw Error('The confinement executor does not match this worker');return arch;
}
export function requireMacosExecutable(header:Uint8Array,arch:MacosCheckArchitecture):void{
 const bytes=Buffer.from(header),cpu=arch==='arm64'?0x0100000c:0x01000007;
 if(bytes.length!==8||bytes.readUInt32LE(0)!==0xfeedfacf||bytes.readUInt32LE(4)!==cpu)throw Error(`The confined entry requires a thin macOS ${arch} executable`);
}
