/** Pure builder target controls. Real Swift/JSC build and scan remain OS-qualified separately. */
import {it,expect} from 'vitest';
import {nativeHeadlessTarget} from '../scripts/build-native-headless.mjs';
it('MR3.4 builds the native JSC sample only for its exact current Mac ABI',()=>{
 expect(nativeHeadlessTarget('darwin','arm64')).toEqual({platform:'darwin',arch:'arm64',triple:'arm64-apple-macosx13.0',cpu:0x0100000c});
 expect(nativeHeadlessTarget('darwin','x64')).toEqual({platform:'darwin',arch:'x64',triple:'x86_64-apple-macosx13.0',cpu:0x01000007});
});
it('MR3.4 refuses non-Mac or unsupported native JSC sample build targets',()=>{
 for(const [platform,arch]of [['linux','x64'],['win32','x64'],['darwin','ia32'],['darwin','arm']])expect(()=>nativeHeadlessTarget(platform,arch)).toThrow();
});
