/** The trusted executable must bind before SDK grant or account effects. No traffic replay queue. */
export class CheckLaunchAdmission {
 private state:'pending'|'admitted'|'refused'='pending';private readySeen=false;private granted=false;
 ready():boolean{if(this.state==='refused'||this.readySeen)throw Error('SDK ready refused');this.readySeen=true;if(this.state==='admitted'){this.granted=true;return true;}return false;}
 admit():boolean{if(this.state!=='pending')throw Error('Executable binding refused');this.state='admitted';if(this.readySeen){this.granted=true;return true;}return false;}
 assertEffect():void{if(this.state!=='admitted'||!this.granted)throw Error('SDK effect before trusted executable admission');}
 async effect<T>(verify:()=>Promise<void>,run:()=>T|Promise<T>):Promise<T>{this.assertEffect();await verify();this.assertEffect();return run();}
 refuse():void{this.state='refused';this.granted=false;}
}
export interface IsolationFailureEvidence {adapter:'linux-bwrap-sdk-only-v1'|'linux-bwrap-declared-tcp-v1';phase:string;primary:string;cleanupFailures:string[];familyAbsent:boolean;controlRetained:boolean}
export class CheckIsolationError extends Error {
 readonly kind='ew.check-isolation-failure.v1';
 constructor(readonly evidence:IsolationFailureEvidence){super('Trusted Linux check isolation refused');}
}
/** An overflow cannot be repaired by closing only an auxiliary stream. */
export class CheckRelayLatch {
 private failure:'connection_cap'|'byte_cap'|'helper_protocol'|undefined;private connections=0;private bytes=0;
 constructor(private readonly closeAll:()=>void){}
 fail(code:'connection_cap'|'byte_cap'|'helper_protocol'){if(!this.failure)this.failure=code;this.closeAll();}
 connection(){if(++this.connections>4)this.fail('connection_cap');this.assertHealthy();}
 transfer(bytes:number){if(!Number.isSafeInteger(bytes)||bytes<0)this.fail('helper_protocol');this.bytes+=bytes;if(this.bytes>64*1024*1024)this.fail('byte_cap');this.assertHealthy();}
 assertHealthy(){if(this.failure)throw Error(`SDK_RELAY_${this.failure}`);}
 code(){return this.failure;}
}

/** Preserve a separately bundled trusted executor's bounded failure without serializing Error bodies. */
export function readIsolationFailure(error:unknown):IsolationFailureEvidence|undefined {
 if(!error||typeof error!=='object'||(error as {kind?:unknown}).kind!=='ew.check-isolation-failure.v1')return;
 const e=(error as {evidence?:IsolationFailureEvidence}).evidence;
 if(!e||!['linux-bwrap-sdk-only-v1','linux-bwrap-declared-tcp-v1'].includes(e.adapter)||!['setup','binding'].includes(e.phase)||typeof e.familyAbsent!=='boolean'||typeof e.controlRetained!=='boolean'||!Array.isArray(e.cleanupFailures)||e.cleanupFailures.length>8||e.cleanupFailures.some(v=>v!=='OWNED_FAMILY_OR_CONTROL_CLEANUP_UNCONFIRMED'))return;
 const known=['Error','AbortError','TypeError','RangeError','UNKNOWN_FAILURE','CANCELLED','SDK_RELAY_connection_cap','SDK_RELAY_byte_cap','SDK_RELAY_helper_protocol'];
 return {...e,primary:known.includes(e.primary)?e.primary:'UNCLASSIFIED_REFUSAL',cleanupFailures:[...e.cleanupFailures]};
}

/** Settle all bounded helper status bytes before cleanup can qualify. */
export class CheckRelayStatus {
 private bytes=0;private pending='';private settled=false;
 constructor(private readonly latch:CheckRelayLatch){}
 push(chunk:Buffer):void{if(this.settled){this.latch.fail('helper_protocol');return;}this.bytes+=chunk.length;if(this.bytes>4096){this.pending='';this.latch.fail('helper_protocol');return;}this.pending+=chunk.toString('utf8');let end:number;while((end=this.pending.indexOf('\n'))>=0){const line=this.pending.slice(0,end);this.pending=this.pending.slice(end+1);try{const value=JSON.parse(line);if(Object.keys(value).length!==1||!['connection_cap','byte_cap'].includes(value.relayFailure))throw Error();this.latch.fail(value.relayFailure);}catch{this.latch.fail('helper_protocol');}}}
 finish(complete:boolean):void{if(!complete||this.pending.length)this.latch.fail('helper_protocol');this.settled=true;this.latch.assertHealthy();}
}
/** A relay may latch while disposal awaits namespace drain. Always inspect afterward. */
export async function settleCheckIsolation(isolated:{assertHealthy?():void;dispose():Promise<void>},failures:string[]):Promise<void>{
 try{isolated.assertHealthy?.();}catch{failures.push('SDK_RELAY_LATCHED');}
 try{await isolated.dispose();}catch{failures.push('OWNED_ISOLATION_CLEANUP_UNCONFIRMED');}
 try{isolated.assertHealthy?.();}catch{if(!failures.includes('SDK_RELAY_LATCHED'))failures.push('SDK_RELAY_LATCHED');}
}
