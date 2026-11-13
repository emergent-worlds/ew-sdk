import type {DeclaredNetworkPolicy} from './declared-network.js';
/** Only the trusted native helper's held process/file handles supply these identities. */
export const WINDOWS_REFUSAL_CODES=["ACTUAL_WINDOWS_X64_REQUIRED", "AMD64_PE_REQUIRED", "APPCONTAINER_CHANGED", "APPCONTAINER_LAUNCH_REFUSED", "APPCONTAINER_RESUME_REFUSED", "ARTIFACT_CHANGED", "ARTIFACT_NOT_CURRENT", "ARTIFACT_OUTSIDE_ROOT", "ARTIFACT_READ_REFUSED", "CLEAN_ENVIRONMENT_UNAVAILABLE", "CONTROL_CHANNEL_REFUSED", "DYNAMIC_FILTER_RETIREMENT_UNCONFIRMED", "EXACT_NETWORK_POLICY_UNAVAILABLE", "EXISTING_LOOPBACK_AUTHORITY_UNAVAILABLE", "FILE_ID_UNAVAILABLE", "FILTER_ENGINE_AUTHORITY_UNAVAILABLE", "FRESH_PROFILE_UNAVAILABLE", "HASH_UNAVAILABLE", "HELPER_BINDING_DEADLINE", "IMMUTABLE_TREE_REFUSED", "INPUT_REFUSED", "JOB_CUSTODY_UNAVAILABLE", "LOOPBACK_CONFIGURATION_CAPACITY", "LOOPBACK_CONFIGURATION_CHANGED", "LOOPBACK_CONFIGURATION_UNAVAILABLE", "NATIVE_NONCE_UNAVAILABLE", "NATIVE_PROTOCOL_UNCONFIRMED", "NATIVE_REFUSAL", "NETWORK_CAPABILITY_UNAVAILABLE", "OWNED_ACL_UNAVAILABLE", "OWNED_CLEANUP_UNCONFIRMED", "OWNED_DESKTOP_RETIREMENT_UNCONFIRMED", "OWNED_JOB_ABSENCE_UNCONFIRMED", "OWNED_JOB_ADMISSION_REFUSED", "OWNED_JOB_STOP_UNAVAILABLE", "OWNED_JOB_UNAVAILABLE", "OWNED_PROFILE_RETIREMENT_UNCONFIRMED", "OWNED_ROOT_UNAVAILABLE", "OWNED_SCRATCH_RETAINED", "OWNED_SUSPENDED_ABSENCE_UNCONFIRMED", "OWNED_SUSPENDED_STOP_UNAVAILABLE", "PATH_REFUSED", "PRIVATE_DESKTOP_UNAVAILABLE", "PROCESS_ID_CHANGED", "PROCESS_ID_UNAVAILABLE", "PROCESS_POLICY_UNAVAILABLE", "PROFILE_ID_CHANGED", "PROFILE_ID_UNAVAILABLE", "SID_UNAVAILABLE", "TOKEN_UNAVAILABLE", "TRUSTED_DLL_SEARCH_UNAVAILABLE", "WORKER_CHECK_SLOT_OCCUPIED", "WORKER_ID_UNAVAILABLE"] as const;
export type WindowsRefusalCode=typeof WINDOWS_REFUSAL_CODES[number];
const knownCode=(value:unknown):value is WindowsRefusalCode=>typeof value==='string'&&WINDOWS_REFUSAL_CODES.some(code=>code===value);
export interface WindowsArtifactSubject{
 kind:'windows-held-process-v1';arch:'x64';pid:number;createdAt:string;executableSHA256:string;executableBytes:number;volume:string;fileId:string;
}
export interface WindowsIsolationEvidence{
 adapter:'windows-appcontainer-sdk-only-v1'|'windows-appcontainer-declared-tcp-v1';platform:'win32';arch:'x64';helperSHA256:string;profileHash:string;
 policyInstalledBeforeResume:true;jobEmpty:boolean;filtersRetired:boolean;profileDeleted:boolean;loopbackUnchanged:boolean;cleaned:boolean;nativeFailure?:WindowsRefusalCode;
}
export interface WindowsReady{
 kind:'ready';pid:number;createdAt:string;sha256:string;bytes:number;volume:string;fileId:string;profileHash:string;policyInstalledBeforeResume:true;networkSHA256?:string;
}
export interface WindowsFinished{
 kind:'finished';ready:boolean;jobEmpty:boolean;filtersRetired:boolean;profileDeleted:boolean;loopbackUnchanged:boolean;cleaned:boolean;failure:WindowsRefusalCode|null;
}
export type WindowsHelperFrame=WindowsReady|WindowsFinished|{kind:'verified'|'stopped';id:number};
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function exact(value:Record<string,unknown>,keys:readonly string[]){if(Object.keys(value).length!==keys.length||keys.some(key=>!(key in value)))throw Error('Windows helper protocol differs.');}
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const decimal=(value:unknown):value is string=>typeof value==='string'&&/^[0-9]{1,20}$/.test(value);
export function parseWindowsHelperFrame(text:string):WindowsHelperFrame{
 const value:unknown=JSON.parse(text);if(!record(value))throw Error('Windows helper protocol differs.');
 if(value.kind==='ready'){
  exact(value,['kind','pid','createdAt','sha256','bytes','volume','fileId','profileHash','policyInstalledBeforeResume',...(value.networkSHA256===undefined?[]:['networkSHA256'])]);if(value.networkSHA256!==undefined&&!hash(value.networkSHA256))throw Error('The actual network policy identity differs.');
  if(!Number.isSafeInteger(value.pid)||Number(value.pid)<1||!decimal(value.createdAt)||!hash(value.sha256)||!Number.isSafeInteger(value.bytes)||Number(value.bytes)<64||!decimal(value.volume)||typeof value.fileId!=='string'||!/^[a-f0-9]{32}$/.test(value.fileId)||!hash(value.profileHash)||value.policyInstalledBeforeResume!==true)throw Error('Windows artifact identity is incomplete.');
  return{kind:'ready',pid:Number(value.pid),createdAt:value.createdAt,sha256:value.sha256,bytes:Number(value.bytes),volume:value.volume,fileId:value.fileId,profileHash:value.profileHash,policyInstalledBeforeResume:true,...(typeof value.networkSHA256==='string'?{networkSHA256:value.networkSHA256}:{})};
 }
 if(value.kind==='verified'||value.kind==='stopped'){
  exact(value,['kind','id']);if(!Number.isSafeInteger(value.id)||Number(value.id)<1||Number(value.id)>0xffffffff)throw Error('Windows helper original differs.');return{kind:value.kind,id:Number(value.id)};
 }
 if(value.kind==='finished'){
  exact(value,['kind','ready','jobEmpty','filtersRetired','profileDeleted','loopbackUnchanged','cleaned','failure']);
  for(const key of['ready','jobEmpty','filtersRetired','profileDeleted','loopbackUnchanged','cleaned'])if(typeof value[key]!=='boolean')throw Error('Windows cleanup is incomplete.');
  if(value.failure!==null&&!knownCode(value.failure))throw Error('Windows helper cause is not a static guard code.');
  return{kind:'finished',ready:value.ready===true,jobEmpty:value.jobEmpty===true,filtersRetired:value.filtersRetired===true,profileDeleted:value.profileDeleted===true,loopbackUnchanged:value.loopbackUnchanged===true,cleaned:value.cleaned===true,failure:value.failure};
 }
 throw Error('Windows helper protocol differs.');
}
/** Retiring owned resources does not turn a clean preflight refusal into a passing run. */
export function windowsCleanupConfirmed(value:Pick<WindowsFinished,'jobEmpty'|'filtersRetired'|'profileDeleted'|'cleaned'>):boolean{return value.jobEmpty&&value.filtersRetired&&value.profileDeleted&&value.cleaned;}
export function windowsCleanupQualified(value:WindowsFinished):boolean{return value.ready&&windowsCleanupConfirmed(value)&&value.loopbackUnchanged&&value.failure===null;}
export interface WindowsFailureEvidence{adapter:'windows-appcontainer-sdk-only-v1'|'windows-appcontainer-declared-tcp-v1';phase:'setup'|'binding';primary:WindowsRefusalCode;ownedResourcesRetired:boolean;loopbackUnchanged:boolean;controlRetained:boolean;cleanupFailures:('OWNED_CLEANUP_UNCONFIRMED'|'OWNED_SCRATCH_RETAINED')[]}
export class WindowsIsolationError extends Error{
 readonly kind='ew.windows-check-isolation-failure.v1';
 constructor(readonly evidence:WindowsFailureEvidence){super('Trusted Windows check isolation refused');}
}
export function readWindowsIsolationFailure(error:unknown):WindowsFailureEvidence|undefined{
 if(!record(error)||error.kind!=='ew.windows-check-isolation-failure.v1'||!record(error.evidence))return;
 const e=error.evidence;
 if(!['windows-appcontainer-sdk-only-v1','windows-appcontainer-declared-tcp-v1'].includes(String(e.adapter))||!['setup','binding'].includes(String(e.phase))||!knownCode(e.primary)||
  typeof e.ownedResourcesRetired!=='boolean'||typeof e.loopbackUnchanged!=='boolean'||typeof e.controlRetained!=='boolean'||
  !Array.isArray(e.cleanupFailures)||e.cleanupFailures.length>8||e.cleanupFailures.some(value=>value!=='OWNED_CLEANUP_UNCONFIRMED'&&value!=='OWNED_SCRATCH_RETAINED'))return;
 return{adapter:e.adapter==='windows-appcontainer-declared-tcp-v1'?'windows-appcontainer-declared-tcp-v1':'windows-appcontainer-sdk-only-v1',phase:e.phase==='setup'?'setup':'binding',primary:e.primary,ownedResourcesRetired:e.ownedResourcesRetired,loopbackUnchanged:e.loopbackUnchanged,controlRetained:e.controlRetained,cleanupFailures:e.cleanupFailures.map(value=>value==='OWNED_CLEANUP_UNCONFIRMED'?'OWNED_CLEANUP_UNCONFIRMED':'OWNED_SCRATCH_RETAINED')};
}
export function bindWindowsSubject(value:WindowsReady,expected:{sha256:string;size:number}):WindowsArtifactSubject{
 if(value.sha256!==expected.sha256||value.bytes!==expected.size)throw Error('The actual Windows image differs from the immutable check.');
 return{kind:'windows-held-process-v1',arch:'x64',pid:value.pid,createdAt:value.createdAt,executableSHA256:value.sha256,executableBytes:value.bytes,volume:value.volume,fileId:value.fileId};
}

/** A held image cannot substitute a different native endpoint policy during launch. */
export function bindWindowsNetworkPolicy(ready:WindowsReady,network?:DeclaredNetworkPolicy):void{if(network?ready.networkSHA256!==network.endpointsSHA256:ready.networkSHA256!==undefined)throw Error('The native network policy differs from the actual captured endpoints.');}
