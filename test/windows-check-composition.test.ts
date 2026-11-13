/** Declared protocol/aggregation controls only; no Windows kernel, build or signature proof. */
import {expect,test} from 'vitest';
import {checkRows,type CheckPlan} from '../check/runner.js';
import type {StaticEvidence} from '../check/scan.js';
import {bindWindowsSubject,parseWindowsHelperFrame,windowsCleanupConfirmed,windowsCleanupQualified,readWindowsIsolationFailure,
 type WindowsFinished,type WindowsIsolationEvidence} from '../check/windows-subject.js';

test('MR3.4 binds only exact trusted Windows identity frames and rejects an immutable image substitution',()=>{
 const ready=parseWindowsHelperFrame(JSON.stringify({kind:'ready',pid:42,createdAt:'133000000000000000',sha256:'a'.repeat(64),bytes:256,
  volume:'2',fileId:'b'.repeat(32),profileHash:'c'.repeat(64),policyInstalledBeforeResume:true}));
 if(ready.kind!=='ready')throw Error('The declared ready frame is absent.');
 expect(bindWindowsSubject(ready,{sha256:'a'.repeat(64),size:256})).toMatchObject({kind:'windows-held-process-v1',pid:42,executableSHA256:'a'.repeat(64)});
 expect(()=>bindWindowsSubject(ready,{sha256:'d'.repeat(64),size:256})).toThrow();
 expect(()=>parseWindowsHelperFrame(JSON.stringify({...ready,unexpected:'uploaded'}))).toThrow();
 expect(()=>parseWindowsHelperFrame(JSON.stringify({kind:'verified',id:0x100000000}))).toThrow();
});

test('MR3.4 cleans a refused Windows preflight without converting it into qualified run evidence',()=>{
 const clean:WindowsFinished={kind:'finished',ready:false,jobEmpty:true,filtersRetired:true,profileDeleted:true,loopbackUnchanged:true,cleaned:true,failure:'EXISTING_LOOPBACK_AUTHORITY_UNAVAILABLE'};
 expect(windowsCleanupConfirmed(clean)).toBe(true);expect(windowsCleanupQualified(clean)).toBe(false);
 expect(windowsCleanupConfirmed({...clean,jobEmpty:false})).toBe(false);
 expect(windowsCleanupQualified({...clean,ready:true,failure:null})).toBe(true);
 expect(windowsCleanupQualified({...clean,ready:true,failure:null,loopbackUnchanged:false})).toBe(false);
});

test('MR3.4 retains only bounded static Windows native causes without echoing arbitrary failure text',()=>{
 const evidence={adapter:'windows-appcontainer-sdk-only-v1',phase:'setup',primary:'FILTER_ENGINE_AUTHORITY_UNAVAILABLE',ownedResourcesRetired:true,loopbackUnchanged:true,controlRetained:false,cleanupFailures:[]};
 expect(readWindowsIsolationFailure({kind:'ew.windows-check-isolation-failure.v1',evidence})).toEqual(evidence);
 expect(readWindowsIsolationFailure({kind:'ew.windows-check-isolation-failure.v1',evidence:{...evidence,primary:'PRIVATE_VALUE'}})).toBeUndefined();
 expect(()=>parseWindowsHelperFrame(JSON.stringify({kind:'finished',ready:false,jobEmpty:true,filtersRetired:true,profileDeleted:true,loopbackUnchanged:false,cleaned:true,failure:'PRIVATE_VALUE'}))).toThrow();
});

test('MR3.4 requires complete Windows owned cleanup and the original six prerequisites before the signing gate',async()=>{
 const file={path:'build/windows/kestrel.exe',size:256,sha256:'a'.repeat(64),executable:true};
 const plan:CheckPlan={root:'',folder:'kestrel',version:'version-1',target:'windows-x64',entryPath:file.path,files:[file],providerHosts:[],
  manifest:{name:'Kestrel Yards',kind:'reality',version:'1.0.0',owner:'@mercerpress',entry:{installs:{'windows-x64':'build/windows'}},asks:{saves:true}}};
 const scan:StaticEvidence={verifiedFiles:1,hosts:[],providerHosts:[],archives:[],outsideExecutables:[],hostFindings:[],hostFindingCount:0,hostFindingsComplete:true};
 const isolation:WindowsIsolationEvidence={adapter:'windows-appcontainer-sdk-only-v1',platform:'win32',arch:'x64',helperSHA256:'b'.repeat(64),profileHash:'c'.repeat(64),
  policyInstalledBeforeResume:true,jobEmpty:true,filtersRetired:true,profileDeleted:true,loopbackUnchanged:true,cleaned:true};
 const launch:NonNullable<Parameters<typeof checkRows>[2]>={admitted:true,runMs:60000,requestedSave:true,savedVersions:['interval','leaving'],saveReasons:['interval','leaving'],quitSaved:true,
  modelJobs:[],modelFailures:0,refused:0,endpoints:[],observedEndpoints:[],sdkSamples:240,samples:240,sampleErrors:0,missedSamples:0,sampler:'declared-control-only',isolationEvidence:isolation,cleanup:{qualified:true,failures:[]}};
 let signatures=0;const sign=async(input:Parameters<NonNullable<Parameters<typeof checkRows>[3]['sign']>>[0])=>{signatures++;return{signature:'declared-pure-gate-control',fileListSha256:input.fileListSha256};};
 for(const field of ['jobEmpty','filtersRetired','profileDeleted','loopbackUnchanged','cleaned'] as const){
  const rows=await checkRows(plan,scan,{...launch,isolationEvidence:{...isolation,[field]:false}},{sign});expect(rows[1]?.result).toBe('fail');expect(rows[5]?.result).toBe('pending');
 }
 expect(signatures).toBe(0);
 const rows=await checkRows(plan,scan,launch,{sign});expect(rows.map(row=>row.line)).toEqual([1,2,3,4,5,6]);expect(rows.every(row=>row.result==='pass')).toBe(true);expect(signatures).toBe(1);
 expect(rows[1]?.evidence.requiredMs).toBe(60000);expect(rows[4]?.evidence.sampleEveryMs).toBe(250);
});
