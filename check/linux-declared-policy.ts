/** Exact per-job nftables and file policy for the already-owned network namespace. */
import {assertDeclaredNetwork,type DeclaredNetworkPolicy} from './declared-network.js';
import {linuxCheckArguments} from './linux-policy.js';
export function linuxDeclaredNft(network:DeclaredNetworkPolicy,port:number){
 assertDeclaredNetwork(network);if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('The actual SDK port differs.');
 const family='inet',table='ew_check';
 const rows:unknown[]=[{add:{table:{family,name:table}}},{add:{chain:{family,table,name:'output',type:'filter',hook:'output',prio:0,policy:'drop'}}}];
 const match=(left:unknown,right:unknown)=>({match:{op:'==',left,right}});
 const allow=(address:string,version:4|6,selectedPort:number|null)=>{const expr:unknown[]=[match({meta:{key:'l4proto'}},'tcp'),match({payload:{protocol:version===4?'ip':'ip6',field:'daddr'}},address)];if(selectedPort!==null)expr.push(match({payload:{protocol:'tcp',field:'dport'}},selectedPort));expr.push({accept:null});rows.push({add:{rule:{family,table,chain:'output',expr}}});};
 allow('127.0.0.1',4,port);for(const endpoint of network.addresses)allow(endpoint.address,endpoint.family,endpoint.port);
 // These link-control types cannot carry an application TCP/UDP payload. NET_RAW is dropped before exec.
 if(network.addresses.some(row=>row.family===6))rows.push({add:{rule:{family,table,chain:'output',expr:[match({meta:{key:'oifname'}},'tap0'),match({meta:{key:'l4proto'}},'ipv6-icmp'),match({payload:{protocol:'icmpv6',field:'type'}},{set:[133,134,135,136]}),{accept:null}]}}});
 return{nftables:rows};
}
export function linuxDeclaredHosts(network:DeclaredNetworkPolicy){assertDeclaredNetwork(network);return'127.0.0.1 localhost\n::1 localhost\n'+network.hosts.flatMap(row=>row.addresses.map(address=>`${address} ${row.name}\n`)).join('');}
export function linuxDeclaredArguments(input:Parameters<typeof linuxCheckArguments>[0]&{nft:string;networkHelper:string}){
 const args=linuxCheckArguments(input),end=args.indexOf('--remount-ro');if(end<0)throw Error('The normal namespace arguments differ.');
 args.splice(end,0,'--cap-add','CAP_NET_ADMIN','--cap-add','CAP_SETPCAP','--preserve-fds','1','--dir','/etc','--ro-bind',input.nft,'/usr/bin/nft','--ro-bind',input.networkHelper,'/control/network.py','--ro-bind',input.control+'/network.json','/control/network.json','--ro-bind',input.control+'/hosts','/etc/hosts','--ro-bind',input.control+'/nsswitch.conf','/etc/nsswitch.conf','--ro-bind',input.control+'/resolv.conf','/etc/resolv.conf');
 const relay=args.lastIndexOf('/control/relay.py');if(relay<0)throw Error('The actual trusted relay entry differs.');args[relay]='/control/network.py';return args;
}
