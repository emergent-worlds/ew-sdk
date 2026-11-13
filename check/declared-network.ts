/** One launch-time authority for the existing declared TCP hosts and optional ports. */
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {createHash} from 'node:crypto';
import {namedHost} from './scan.js';
export interface DeclaredEndpoint {readonly address:string;readonly family:4|6;readonly port:number|null}
export interface DeclaredNetworkPolicy {
 readonly format:'ew.check.declared-tcp.v1';readonly asks:readonly string[];readonly addresses:readonly DeclaredEndpoint[];
 readonly hosts:readonly {readonly name:string;readonly addresses:readonly string[]}[];readonly providers:readonly {readonly name:string;readonly port:number|null;readonly addresses:readonly string[]}[];readonly unresolved:readonly string[];
 readonly allowedEndpoints:readonly string[];readonly endpointsText:string;readonly endpointsSHA256:string;readonly digest:string;
}
type Resolver=(hostname:string)=>Promise<readonly {address:string;family:number}[]>;
const resolve:Resolver=hostname=>lookup(hostname,{all:true,verbatim:true});
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function split(value:string){const normalized=namedHost(value),match=/^(\[[^\]]+\]|[^:]+)(?::([0-9]+))?$/.exec(normalized);if(!match)throw Error('Declared network host differs.');const hostname=match[1]!.replace(/^\[|\]$/g,''),port=match[2]===undefined?null:Number(match[2]);if(port!==null&&(!Number.isSafeInteger(port)||port<1||port>65535))throw Error('Declared network port differs.');return{normalized,hostname,port};}
function address(value:string){const family=isIP(value);if(!family)throw Error('DNS did not return an actual IP address.');return{address:family===6?new URL(`http://[${value}]/`).hostname.slice(1,-1):value,family:family as 4|6};}
function sealed(value:Omit<DeclaredNetworkPolicy,'digest'>):DeclaredNetworkPolicy{const out={...value,digest:digest(value)};Object.freeze(out.asks);for(const row of out.addresses)Object.freeze(row);Object.freeze(out.addresses);for(const row of out.hosts){Object.freeze(row.addresses);Object.freeze(row);}Object.freeze(out.hosts);for(const row of out.providers){Object.freeze(row.addresses);Object.freeze(row);}Object.freeze(out.providers);Object.freeze(out.unresolved);Object.freeze(out.allowedEndpoints);return Object.freeze(out);}
export async function resolveDeclaredNetwork(asks:readonly string[],providers:readonly string[],resolver:Resolver=resolve):Promise<DeclaredNetworkPolicy>{
 const normalized=[...new Set(asks.map(value=>split(value).normalized))].sort();
 if(normalized.length>256)throw Error('Declared network policy exceeds the existing finite host-finding capacity.');
 const configuredProviders=[...new Set(providers.map(value=>split(value).normalized))].sort().map(split),providerRows:{name:string;port:number|null;addresses:string[]}[]=[];
 const lookups=new Map<string,ReturnType<Resolver>>();const lookupOnce=(hostname:string)=>{let pending=lookups.get(hostname);if(!pending){pending=resolver(hostname);lookups.set(hostname,pending);}return pending;};
 const overlap=(a:number|null,b:number|null)=>a===null||b===null||a===b;
 // Empty-network execution preserves the previous no-DNS path and unchanged SDK-only adapter.
 if(normalized.length){for(const configured of configuredProviders){const name=configured.hostname;
  const captured=new Set<string>();if(isIP(name))captured.add(address(name).address);else{let rows:readonly {address:string;family:number}[];try{rows=await lookupOnce(name);}catch{throw Error('Current provider network addresses are unavailable.');}if(!rows.length)throw Error('Current provider network addresses are unavailable.');for(const row of rows){const actual=address(row.address);if(actual.family!==row.family)throw Error('Provider address family differs.');captured.add(actual.address);}}providerRows.push({name,port:configured.port,addresses:[...captured].sort()});
 }}
 const endpoints=new Map<string,DeclaredEndpoint>(),hosts=new Map<string,string[]>(),unresolved:string[]=[];
 for(const grant of normalized){const {hostname,port}=split(grant);if(providerRows.some(row=>row.name===hostname&&overlap(port,row.port)))throw Error('Direct provider network authority is not available to a build.');
  let rows:readonly {address:string;family:number}[];
  if(isIP(hostname)){const actual=address(hostname);rows=[actual];}else{try{rows=await lookupOnce(hostname);}catch{rows=[];}}
  if(!rows.length){unresolved.push(grant);continue;}
  const captured=new Set<string>();for(const row of rows){const actual=address(row.address);if(actual.family!==row.family||providerRows.some(provider=>provider.addresses.includes(actual.address)&&overlap(port,provider.port)))throw Error('A declared address conflicts with the current provider exclusion.');captured.add(actual.address);const endpoint={...actual,port};endpoints.set(`${actual.family}|${actual.address}|${port??'*'}`,endpoint);}
  hosts.set(hostname,[...new Set([...(hosts.get(hostname)??[]),...captured])].sort());
  if(endpoints.size>4096)throw Error('Resolved network policy exceeds the finite kernel-policy capacity.');
 }
 const addresses=[...endpoints.values()].sort((a,b)=>a.family-b.family||a.address.localeCompare(b.address,'en')||(a.port??0)-(b.port??0));
 const endpointsText=addresses.map(row=>`${row.family},${row.address},${row.port??'*'}`).join(';');
 if(Buffer.byteLength(endpointsText)>24000)throw Error('The actual kernel policy exceeds the bounded native launch protocol.');
 const allowedEndpoints=[...new Set([...normalized,...addresses.map(row=>(row.family===6?`[${row.address}]`:row.address)+(row.port===null?'':`:${row.port}`))])].sort();
 return sealed({format:'ew.check.declared-tcp.v1',asks:normalized,addresses,hosts:[...hosts].sort(([a],[b])=>a.localeCompare(b,'en')).map(([name,addresses])=>({name,addresses})),providers:providerRows,unresolved,allowedEndpoints,endpointsText,endpointsSHA256:createHash('sha256').update(endpointsText).digest('hex')});
}
/** Refuse mutation or a foreign caller's incomplete policy before native configuration. */
export function assertDeclaredNetwork(value:DeclaredNetworkPolicy):void{
 if(value.format!=='ew.check.declared-tcp.v1'||!value.asks.length||value.asks.length>256||value.addresses.length>4096)throw Error('The genuine declared-network policy is absent.');
 const grants=value.asks.map(split);if(JSON.stringify([...new Set(grants.map(row=>row.normalized))].sort())!==JSON.stringify(value.asks))throw Error('The formal network asks differ.');
 const overlap=(a:number|null,b:number|null)=>a===null||b===null||a===b;if(grants.some(row=>value.providers.some(provider=>provider.name===row.hostname&&overlap(provider.port,row.port)))||value.addresses.some(row=>value.providers.some(provider=>provider.addresses.includes(row.address)&&overlap(provider.port,row.port))))throw Error('Direct provider authority was introduced.');
 const allowed=[...new Set([...value.asks,...value.addresses.map(row=>(row.family===6?`[${row.address}]`:row.address)+(row.port===null?'':`:${row.port}`))])].sort();if(JSON.stringify(allowed)!==JSON.stringify(value.allowedEndpoints))throw Error('The observed endpoint authority differs.');
 const {digest:original,...body}=value;if(original!==digest(body)||createHash('sha256').update(value.endpointsText).digest('hex')!==value.endpointsSHA256)throw Error('The captured network authority changed.');
 const text=value.addresses.map(row=>{const actual=address(row.address);if(actual.family!==row.family||row.port!==null&&(!Number.isSafeInteger(row.port)||row.port<1||row.port>65535))throw Error('Captured endpoint differs.');return`${row.family},${actual.address},${row.port??'*'}`;}).join(';');if(text!==value.endpointsText)throw Error('The actual native endpoints differ.');
}
