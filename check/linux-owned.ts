/** Finite owned-family drain. Inputs come only from the trusted Linux adapter, never a build. */
import type {LinuxProcessIdentity} from './linux-subject.js';
import {sameLinuxProcess} from './linux-subject.js';
export interface OwnedLinuxDrain {
 wrapper:LinuxProcessIdentity; init?:LinuxProcessIdentity; known:Map<number,LinuxProcessIdentity>;
 discover():Promise<LinuxProcessIdentity[]>;
 current(pid:number):Promise<LinuxProcessIdentity|null>;
 signal(identity:LinuxProcessIdentity,signal:'SIGTERM'|'SIGKILL'):Promise<void>;
 sleep():Promise<void>;
 now():number;
}
export function rememberOwnedLinux(known:Map<number,LinuxProcessIdentity>,identity:LinuxProcessIdentity):void {
 const previous=known.get(identity.pid);
 if(previous&&!sameLinuxProcess(previous,identity))throw Error('Owned process identity changed');
 if(!previous&&known.size>=256)throw Error('Owned process family bound exceeded');
 known.set(identity.pid,identity);
}
export async function drainOwnedLinuxFamily(input:OwnedLinuxDrain):Promise<void>{
 let firstFailure:unknown;
 const failed=(error:unknown)=>{firstFailure??=error;};
 const live=async(identity:LinuxProcessIdentity)=>{const current=await input.current(identity.pid);if(current&&!sameLinuxProcess(current,identity))throw Error('Owned process identity changed');return current!==null;};
 const discover=async()=>{try{for(const item of await input.discover())rememberOwnedLinux(input.known,item);}catch(error){failed(error);}};
 const present=async()=>{let any=false;for(const item of input.known.values()){try{if(await live(item))any=true;}catch(error){any=true;failed(error);}}return any;};
 for(const signal of ['SIGTERM','SIGKILL']as const){
  await discover();
  // Discovery failure cannot authorize foreign signals or prevent a fresh-verified owned init drain.
  for(const identity of [input.init,input.wrapper]){if(!identity)continue;try{if(await live(identity))await input.signal(identity,signal);}catch(error){failed(error);}}
  const until=input.now()+5000;
  do{await discover();if(!await present()){if(firstFailure)throw firstFailure;return;}await input.sleep();}while(input.now()<until);
 }
 await discover();const remains=await present();
 if(firstFailure)throw firstFailure;if(remains)throw Error('Owned Linux process family remains');
}
