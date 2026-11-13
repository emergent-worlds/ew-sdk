/** Declared evidence exercises composition only. The separate actual-kernel control owns process proof. */
import {createHash} from 'node:crypto';
import {test,expect} from 'vitest';
import {checkRows,type CheckPlan} from '../check/runner.js';
import type {StaticEvidence} from '../check/scan.js';
import {CheckRelayLatch,CheckRelayStatus,settleCheckIsolation} from '../check/launch-admission.js';
type Launch=NonNullable<Parameters<typeof checkRows>[2]>;
function fixture(projection=false){
 const target=projection?'server':'linux-x64',prefix=`build/${target}`,file={path:`${prefix}/run`,size:20,sha256:'a'.repeat(64),executable:true};
 const plan:CheckPlan={root:'',folder:'kestrel',version:'version-1',target,entryPath:file.path,providerHosts:[],files:[file,...(projection?[{path:'game.html',size:1,sha256:'b'.repeat(64),executable:false}]:[])],manifest:{name:'Kestrel Yards',kind:'reality',version:'1.0.0',owner:'@mercerpress',entry:{installs:{[target]:prefix},...(projection?{web:'game.html',executables:{server:file.path},playerProjection:'ew.remote-player.v1'}:{})},asks:{saves:true}}};
 const scan:StaticEvidence={verifiedFiles:plan.files.length,hosts:[],providerHosts:[],archives:[],outsideExecutables:[],hostFindings:[],hostFindingCount:0,hostFindingsComplete:true};
 const subject={pid:13,startTicks:'1',parentPID:12,namespace:'pid:[100]',kind:'linux-proc-artifact-v1' as const,arch:'x64' as const,executableSHA256:file.sha256,executableBytes:20,executableDevice:'1',executableInode:'2'};
 const launch:Launch={admitted:true,runMs:60000,requestedSave:true,savedVersions:['saved-interval','saved-leaving'],saveReasons:['interval','leaving'],quitSaved:true,modelJobs:[],modelFailures:0,refused:0,endpoints:[],observedEndpoints:[],sdkSamples:1,samples:1,sampleErrors:0,missedSamples:0,sampler:'declared-composition',subject,isolationEvidence:{adapter:'linux-bwrap-sdk-only-v1',platform:'linux',arch:'x64',kernel:'declared-only',bwrapSHA256:'c'.repeat(64),pythonSHA256:'d'.repeat(64),relaySHA256:'e'.repeat(64),pidfdHelperSHA256:'f'.repeat(64),wrapper:{pid:11,startTicks:'1',parentPID:1,namespace:'pid:[99]'},namespaceInit:{pid:12,startTicks:'1',parentPID:11,namespace:'pid:[100]'},subject,relayStatusSettled:true,directNetworkAsksSupported:false},cleanup:{qualified:true,failures:[]}};
 return{plan,scan,launch};
}
function signCounter(){let calls=0;return{get calls(){return calls;},sign:async(input:Parameters<NonNullable<Parameters<typeof checkRows>[3]['sign']>>[0])=>{calls++;return{signature:'controlled-composition-only',fileListSha256:input.fileListSha256};}};}
test('MR3.4 refuses a relay failure discovered during Linux disposal before rows or signing can pass',async()=>{
 const latch=new CheckRelayLatch(()=>{});let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;}),failures:string[]=[];
 const cleanup=settleCheckIsolation({assertHealthy:()=>latch.assertHealthy(),dispose:()=>pending},failures);latch.fail('connection_cap');release();await cleanup;expect(failures).toEqual(['SDK_RELAY_LATCHED']);
 const f=fixture(),signer=signCounter();if(!f.launch.isolationEvidence||f.launch.isolationEvidence.adapter!=='linux-bwrap-sdk-only-v1')throw Error('Declared evidence is absent.');f.launch.isolationEvidence.relayFailure=latch.code();f.launch.cleanup={qualified:false,failures};const rows=await checkRows(f.plan,f.scan,f.launch,signer);expect(signer.calls).toBe(0);expect(rows[1]?.result).toBe('fail');expect(rows[5]?.result).toBe('pending');
});
test('MR3.4 refuses unsettled Linux relay and incomplete owned cleanup instead of creating a signature',async()=>{
 const changes:((value:Launch)=>void)[]=[value=>{if(value.isolationEvidence?.adapter==='linux-bwrap-sdk-only-v1')value.isolationEvidence.relayFailure='byte_cap';},value=>{if(value.isolationEvidence?.adapter==='linux-bwrap-sdk-only-v1')value.isolationEvidence.relayStatusSettled=false;},value=>{value.cleanup={qualified:false,failures:[]};},value=>{value.cleanup={qualified:true,failures:['UNKNOWN']};}];
 for(const change of changes){const f=fixture(),signer=signCounter();change(f.launch);const rows=await checkRows(f.plan,f.scan,f.launch,signer);expect(rows[1]?.result).toBe('fail');expect(signer.calls).toBe(0);}
});
test('MR3.4 preserves all six original prerequisites when declared Linux relay and cleanup are complete',async()=>{const f=fixture(),signer=signCounter(),rows=await checkRows(f.plan,f.scan,f.launch,signer);expect(signer.calls).toBe(1);expect(rows.map(row=>row.line)).toEqual([1,2,3,4,5,6]);expect(rows.every(row=>row.result==='pass')).toBe(true);expect(rows[1]?.evidence.requiredMs).toBe(60000);expect(rows[4]?.evidence.sampleEveryMs).toBe(250);});
test('MR3.4 keeps partial helper status and missing EOF permanently nonpassing',()=>{for(const complete of[true,false]){const latch=new CheckRelayLatch(()=>{}),status=new CheckRelayStatus(latch);status.push(Buffer.from('{"relayFailure":'));expect(()=>status.finish(complete)).toThrow();expect(latch.code()).toBe('helper_protocol');}});
test('MR3.4 settles split helper status and genuine empty EOF with their exact dispositions',()=>{const latch=new CheckRelayLatch(()=>{}),status=new CheckRelayStatus(latch);status.push(Buffer.from('{"relayFailure":"byte_'));status.push(Buffer.from('cap"}\n'));expect(()=>status.finish(true)).toThrow();expect(latch.code()).toBe('byte_cap');const healthy=new CheckRelayStatus(new CheckRelayLatch(()=>{}));expect(()=>healthy.finish(true)).not.toThrow();});
test('MR3.4 retains current server player-projection proof requirements while adding Linux isolation',async()=>{
 const f=fixture(true),signer=signCounter();expect((await checkRows(f.plan,f.scan,f.launch,signer))[1]?.result).toBe('fail');expect(signer.calls).toBe(0);
 const nonStateTreeSha256=createHash('sha256').update(JSON.stringify(f.plan.files.map(file=>[file.path,file.sha256,file.size]).sort((a,b)=>String(a[0])<String(b[0])?-1:1))).digest('hex');
 f.launch.playerProjection={protocol:'ew.remote-player.v1',executableSha256:'a'.repeat(64),descriptorSha256:'b'.repeat(64),nonStateTreeSha256,admittedPlayers:2,snapshots:2};expect((await checkRows(f.plan,f.scan,f.launch,signer)).every(row=>row.result==='pass')).toBe(true);expect(signer.calls).toBe(1);
 f.launch.playerProjection.nonStateTreeSha256='f'.repeat(64);expect((await checkRows(f.plan,f.scan,f.launch,signer))[1]?.result).toBe('fail');expect(signer.calls).toBe(1);
});
test('MR3.4 preserves omitted Linux fields in existing ordinary six-row evidence',async()=>{const f=fixture(),signer=signCounter();delete f.launch.subject;delete f.launch.isolationEvidence;delete f.launch.cleanup;const rows=await checkRows(f.plan,f.scan,f.launch,signer);expect(rows.every(row=>row.result==='pass')).toBe(true);expect(rows[1]?.evidence).not.toHaveProperty('cleanup');expect(rows[1]?.evidence).not.toHaveProperty('isolationFailure');expect(rows[4]?.evidence).not.toHaveProperty('subject');expect(rows[4]?.evidence).not.toHaveProperty('isolation');});
