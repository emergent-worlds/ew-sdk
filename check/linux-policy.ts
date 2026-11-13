/** Closed Linux namespace policy; no creator-supplied flags or shell. */
import {join,relative,isAbsolute} from 'node:path';
export function fixedSDK(urlText:string):number {
 const url=new URL(urlText);
 if(url.protocol!=='ws:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw Error('One exact SDK endpoint is required');
 return Number(url.port);
}
export function linuxCheckArguments(input:{root:string;entry:string;control:string;python:string;libraries:readonly {source:string;target:string}[];relay:string;pidfd:string;port:number;token:string}):string[] {
 for(const path of [input.root,input.entry,input.control,input.python,input.relay,input.pidfd])if(!isAbsolute(path)||/[\x00-\x1f]/.test(path))throw Error('Invalid confinement path');
 const entry=relative(input.root,input.entry);
 if(!entry||entry.startsWith('../')||isAbsolute(entry)||!Number.isSafeInteger(input.port)||input.port<1||input.port>65535)throw Error('Invalid confinement entry or SDK port');
 // No host network, fallback user namespace, broad /usr, /etc, home, display or credentials.
 const args=['--unshare-user','--unshare-pid','--unshare-net','--unshare-ipc','--unshare-uts','--unshare-cgroup','--die-with-parent','--new-session','--cap-drop','ALL','--clearenv','--proc','/proc','--dev','/dev','--dir','/usr','--dir','/usr/bin','--dir','/control','--dir','/home','--tmpfs','/home/check','--tmpfs','/tmp','--ro-bind',input.root,'/artifact','--ro-bind',input.python,'/usr/bin/python3','--ro-bind',input.relay,'/control/relay.py','--ro-bind',input.pidfd,'/control/pidfd.py','--ro-bind',join(input.control,'sdk.sock'),'/control/sdk.sock'];
 for(const item of input.libraries){if(!['/lib','/lib64','/usr/lib'].includes(item.target)||!isAbsolute(item.source)||/[\x00-\x1f]/.test(item.source))throw Error('Unknown runtime mount');args.push('--ro-bind',item.source,item.target);}
 args.push('--remount-ro','/','--chdir','/artifact','--setenv','HOME','/home/check','--setenv','TMPDIR','/tmp/','--setenv','EW_SDK_URL',`ws://127.0.0.1:${input.port}/`,'--setenv','EW_SDK_TOKEN',input.token,'--setenv','EW_SDK_CHECK','1','--','/usr/bin/python3','-I','-B','/control/relay.py',`/artifact/${entry}`,String(input.port),'/control/sdk.sock');
 return args;
}
