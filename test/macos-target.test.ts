/** Declared header/worker data exercises dispatch only; it is not a native artifact or kernel proof. */
import {test,expect} from 'vitest';
import {requireMacosWorker,requireMacosClaimTarget,requireMacosExecutable} from '../check/macos-target.js';
const thin=(cpu:number)=>{const bytes=Buffer.alloc(8);bytes.writeUInt32LE(0xfeedfacf);bytes.writeUInt32LE(cpu,4);return bytes;};
test('MR3.4 binds each macOS claim to the actual current worker and exact thin executable ABI',()=>{
 for(const arch of['arm64','x64'] as const){const target=arch==='arm64'?'macos-arm64':'macos-x64';expect(requireMacosClaimTarget({platform:'darwin',arch,target},{platform:'darwin',arch})).toBe(arch);expect(requireMacosClaimTarget({platform:'darwin',arch,target:'server'},{platform:'darwin',arch})).toBe(arch);expect(()=>requireMacosExecutable(thin(arch==='arm64'?0x0100000c:0x01000007),arch)).not.toThrow();}
});
test('MR3.4 refuses translated mismatched universal truncated and unsupported macOS check targets',()=>{
 for(const arch of['arm64','x64'] as const){const other=arch==='arm64'?'x64':'arm64',target=other==='arm64'?'macos-arm64':'macos-x64';expect(()=>requireMacosClaimTarget({platform:'darwin',arch,target},{platform:'darwin',arch})).toThrow();expect(()=>requireMacosExecutable(thin(other==='arm64'?0x0100000c:0x01000007),arch)).toThrow();const universal=thin(0x0100000c);universal.writeUInt32BE(0xcafebabe);expect(()=>requireMacosExecutable(universal,arch)).toThrow();expect(()=>requireMacosExecutable(new Uint8Array(7),arch)).toThrow();}
 for(const worker of[{platform:'linux',arch:'x64'},{platform:'darwin',arch:'ia32'},{platform:'win32',arch:'x64'}])expect(()=>requireMacosWorker(worker.platform,worker.arch)).toThrow();
});
