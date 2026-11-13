/** Authored authority controls only. They do not supply kernel, account, build or signing evidence. */
import {expect,test} from 'vitest';
import {resolveDeclaredNetwork,assertDeclaredNetwork} from '../check/declared-network.js';
import {hostAllowed} from '../check/scan.js';
import {macosDeclaredProfile} from '../check/macos-declared-network.js';
import {macosCheckProfile} from '../check/macos-isolation.js';
import {linuxDeclaredNft,linuxDeclaredHosts,linuxDeclaredArguments} from '../check/linux-declared-policy.js';
import {parseWindowsHelperFrame,bindWindowsNetworkPolicy} from '../check/windows-subject.js';
const resolver=async(name:string)=>{if(name==='salt-harbor.test')return[{address:'192.0.2.20',family:4},{address:'2001:db8::20',family:6}];if(name==='provider.test')return[{address:'192.0.2.80',family:4}];throw Error('The declared unused host is unresolved.');};
test('MR3.4 captures exact declared hosts optional ports and IPv6 addresses once for kernel and socket authority',async()=>{
 const policy=await resolveDeclaredNetwork(['SALT-HARBOR.test:443','salt-harbor.test','unused.test:8443'],['provider.test'],resolver);assertDeclaredNetwork(policy);
 expect(policy.asks).toEqual(['salt-harbor.test','salt-harbor.test:443','unused.test:8443']);expect(policy.unresolved).toEqual(['unused.test:8443']);
 expect(policy.addresses).toEqual([{address:'192.0.2.20',family:4,port:null},{address:'192.0.2.20',family:4,port:443},{address:'2001:db8::20',family:6,port:null},{address:'2001:db8::20',family:6,port:443}]);
 expect(hostAllowed('192.0.2.20:8443',policy.allowedEndpoints)).toBe(true);expect(hostAllowed('[2001:db8::20]:443',policy.allowedEndpoints)).toBe(true);expect(hostAllowed('192.0.2.21:443',policy.allowedEndpoints)).toBe(false);
 const fixed=await resolveDeclaredNetwork(['salt-harbor.test:443'],['provider.test'],resolver);expect(hostAllowed('192.0.2.20:8443',fixed.allowedEndpoints)).toBe(false);expect(Object.isFrozen(policy.addresses[0])).toBe(true);
});
test('MR3.4 refuses provider names and resolved aliases without broadening empty or unused declared networking',async()=>{
 await expect(resolveDeclaredNetwork(['provider.test:443'],['provider.test'],resolver)).rejects.toThrow();
 await expect(resolveDeclaredNetwork(['192.0.2.80:443'],['provider.test'],resolver)).rejects.toThrow();
 await expect(resolveDeclaredNetwork(['192.0.2.80:443'],['provider.test:443'],resolver)).rejects.toThrow();
 await expect(resolveDeclaredNetwork(['192.0.2.80'],['provider.test:443'],resolver)).rejects.toThrow();
 const otherPort=await resolveDeclaredNetwork(['192.0.2.80:8443'],['provider.test:443'],resolver);expect(otherPort.addresses).toEqual([{address:'192.0.2.80',family:4,port:8443}]);
 await expect(resolveDeclaredNetwork(['salt-harbor.test:443'],['unresolved-provider.test'],resolver)).rejects.toThrow();
 let calls=0;const empty=await resolveDeclaredNetwork([],['unresolved-provider.test'],async()=>{calls++;throw Error();});expect(calls).toBe(0);expect(empty.addresses).toEqual([]);
 const policy=await resolveDeclaredNetwork(['salt-harbor.test:443'],[],resolver);expect(()=>assertDeclaredNetwork({...policy,endpointsText:'4,192.0.2.21,443'})).toThrow();expect(()=>assertDeclaredNetwork({...policy,allowedEndpoints:['192.0.2.21']})).toThrow();
});
test('MR3.4 adds only captured IP port Seatbelt rules while preserving the exact SDK-only Mac profile prefix',async()=>{
 const policy=await resolveDeclaredNetwork(['salt-harbor.test:443'],[],resolver),input={root:'/private/check/tree',entry:'/private/check/tree/game',scratch:'/private/check/scratch',port:49152},profile=macosDeclaredProfile(input,policy);
 expect(profile.startsWith(macosCheckProfile(input))).toBe(true);expect(profile).toContain('(remote tcp "192.0.2.20:443")');expect(profile).toContain('(remote tcp "[2001:db8::20]:443")');expect(profile).not.toContain('salt-harbor.test');expect(profile).not.toContain('192.0.2.21');expect(profile).not.toContain('(allow network*)');
});
test('MR3.4 limits the private Linux nft policy to exact declared TCP and SDK endpoints before capability drop',async()=>{
 const policy=await resolveDeclaredNetwork(['salt-harbor.test:443'],[],resolver),actual=linuxDeclaredNft(policy,49152),text=JSON.stringify(actual);
 expect(text).toContain('"policy":"drop"');expect(text).toContain('192.0.2.20');expect(text).toContain('2001:db8::20');expect(text).not.toContain('192.0.2.21');expect(text).not.toContain('"right":"udp"');expect(linuxDeclaredHosts(policy)).toContain('192.0.2.20 salt-harbor.test');
 const args=linuxDeclaredArguments({root:'/owned/tree',entry:'/owned/tree/game',control:'/owned/control',python:'/usr/bin/python3',libraries:[],relay:'/trusted/linux-relay.py',pidfd:'/trusted/linux-pidfd.py',port:49152,token:'declared-control-only',nft:'/usr/sbin/nft',networkHelper:'/trusted/linux-declared-relay.py'});
 expect(args).toContain('--unshare-net');expect(args).toContain('--unshare-user');expect(args).not.toContain('--share-net');expect(args).toContain('CAP_NET_ADMIN');expect(args).toContain('/control/network.py');expect(args).toContain('/etc/nsswitch.conf');expect(args).toContain('--remount-ro');expect(args.indexOf('/etc/nsswitch.conf')).toBeLessThan(args.indexOf('--remount-ro'));
});
test('MR3.4 binds the native Windows policy digest before accepting an actual held image identity',async()=>{
 const policy=await resolveDeclaredNetwork(['salt-harbor.test:443'],[],resolver),base={kind:'ready',pid:42,createdAt:'133000000000000000',sha256:'a'.repeat(64),bytes:256,volume:'2',fileId:'b'.repeat(32),profileHash:'c'.repeat(64),policyInstalledBeforeResume:true};
 const parsed=parseWindowsHelperFrame(JSON.stringify({...base,networkSHA256:policy.endpointsSHA256}));if(parsed.kind!=='ready')throw Error('The declared protocol frame is absent.');expect(()=>bindWindowsNetworkPolicy(parsed,policy)).not.toThrow();expect(()=>bindWindowsNetworkPolicy({...parsed,networkSHA256:'f'.repeat(64)},policy)).toThrow();expect(()=>bindWindowsNetworkPolicy({...parsed,networkSHA256:undefined},policy)).toThrow();expect(()=>bindWindowsNetworkPolicy(parsed)).toThrow();
 const legacy=parseWindowsHelperFrame(JSON.stringify(base));if(legacy.kind!=='ready')throw Error('The legacy protocol frame is absent.');expect(()=>bindWindowsNetworkPolicy(legacy)).not.toThrow();
});
