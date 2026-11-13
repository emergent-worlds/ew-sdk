// Trusted per-job checker. No elevation, persistent filter, loopback setting or uploaded policy.
#define WIN32_LEAN_AND_MEAN
#define _WIN32_WINNT 0x0A00
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <userenv.h>
#include <sddl.h>
#include <aclapi.h>
#include <fwpmu.h>
#include <netfw.h>
#include <networkisolation.h>
#include <bcrypt.h>
#include <rpc.h>
#include <filesystem>
#include <string>
#include <vector>
#include <array>
#include <algorithm>
#include <iostream>
#include <sstream>
#include <cstdint>
#include <stdexcept>

struct Refusal { const char* code; };
static void require(bool value,const char* code){if(!value)throw Refusal{code};}
struct Handle {
 HANDLE value=nullptr;
 explicit Handle(HANDLE h=nullptr):value(h){}
 ~Handle(){if(value&&value!=INVALID_HANDLE_VALUE)CloseHandle(value);}
 Handle(const Handle&)=delete;Handle& operator=(const Handle&)=delete;
 void reset(HANDLE h=nullptr){if(value&&value!=INVALID_HANDLE_VALUE)CloseHandle(value);value=h;}
};
static std::string hex(const BYTE* bytes,size_t count){const char* digits="0123456789abcdef";std::string out;out.reserve(count*2);for(size_t i=0;i<count;i++){out+=digits[bytes[i]>>4];out+=digits[bytes[i]&15];}return out;}
static std::string hashBytes(const BYTE* bytes,size_t count){
 BCRYPT_ALG_HANDLE algorithm=nullptr;BCRYPT_HASH_HANDLE hash=nullptr;std::array<BYTE,32> digest{};
 require(BCryptOpenAlgorithmProvider(&algorithm,BCRYPT_SHA256_ALGORITHM,nullptr,0)>=0,"HASH_UNAVAILABLE");
 try{require(BCryptCreateHash(algorithm,&hash,nullptr,0,nullptr,0,0)>=0,"HASH_UNAVAILABLE");require(count<=MAXDWORD&&BCryptHashData(hash,const_cast<BYTE*>(bytes),static_cast<ULONG>(count),0)>=0,"HASH_UNAVAILABLE");require(BCryptFinishHash(hash,digest.data(),32,0)>=0,"HASH_UNAVAILABLE");}
 catch(...){if(hash)BCryptDestroyHash(hash);BCryptCloseAlgorithmProvider(algorithm,0);throw;}
 BCryptDestroyHash(hash);BCryptCloseAlgorithmProvider(algorithm,0);return hex(digest.data(),digest.size());
}
static std::string hashFile(HANDLE file,ULONGLONG expected){
 BCRYPT_ALG_HANDLE algorithm=nullptr;BCRYPT_HASH_HANDLE hash=nullptr;std::array<BYTE,65536> bytes{};std::array<BYTE,32> digest{};ULONGLONG total=0;LARGE_INTEGER zero{};
 require(SetFilePointerEx(file,zero,nullptr,FILE_BEGIN)!=0,"ARTIFACT_READ_REFUSED");require(BCryptOpenAlgorithmProvider(&algorithm,BCRYPT_SHA256_ALGORITHM,nullptr,0)>=0,"HASH_UNAVAILABLE");
 try{require(BCryptCreateHash(algorithm,&hash,nullptr,0,nullptr,0,0)>=0,"HASH_UNAVAILABLE");for(;;){DWORD count=0;require(ReadFile(file,bytes.data(),static_cast<DWORD>(bytes.size()),&count,nullptr)!=0,"ARTIFACT_READ_REFUSED");if(!count)break;total+=count;require(total<=expected,"ARTIFACT_CHANGED");require(BCryptHashData(hash,bytes.data(),count,0)>=0,"HASH_UNAVAILABLE");}require(total==expected&&BCryptFinishHash(hash,digest.data(),32,0)>=0,"ARTIFACT_CHANGED");}
 catch(...){if(hash)BCryptDestroyHash(hash);BCryptCloseAlgorithmProvider(algorithm,0);throw;}
 BCryptDestroyHash(hash);BCryptCloseAlgorithmProvider(algorithm,0);return hex(digest.data(),digest.size());
}
static std::wstring environment(const wchar_t* key){DWORD length=GetEnvironmentVariableW(key,nullptr,0);require(length>1&&length<=8193,"CLEAN_ENVIRONMENT_UNAVAILABLE");std::wstring value(length,L'\0');require(GetEnvironmentVariableW(key,value.data(),length)==length-1,"CLEAN_ENVIRONMENT_UNAVAILABLE");value.resize(length-1);return value;}
static std::wstring sidText(PSID sid){LPWSTR text=nullptr;require(ConvertSidToStringSidW(sid,&text)!=0,"SID_UNAVAILABLE");std::wstring result(text);LocalFree(text);return result;}
static std::string sidHash(PSID sid){return hashBytes(static_cast<BYTE*>(sid),GetLengthSid(sid));}
static ULONGLONG numeric(const wchar_t* text){require(text&&*text,"INPUT_REFUSED");ULONGLONG value=0;for(const wchar_t* p=text;*p;p++){require(*p>=L'0'&&*p<=L'9'&&value<=(MAXULONGLONG-9)/10,"INPUT_REFUSED");value=value*10+(*p-L'0');}return value;}
static std::string asciiHash(const wchar_t* text){std::string value;for(const wchar_t* p=text;*p;p++){require((*p>=L'0'&&*p<=L'9')||(*p>=L'a'&&*p<=L'f'),"INPUT_REFUSED");value+=static_cast<char>(*p);}require(value.size()==64,"INPUT_REFUSED");return value;}
static std::wstring canonical(HANDLE file){std::vector<wchar_t> value(32768);DWORD n=GetFinalPathNameByHandleW(file,value.data(),static_cast<DWORD>(value.size()),FILE_NAME_NORMALIZED|VOLUME_NAME_DOS);require(n>0&&n<value.size(),"PATH_REFUSED");return std::wstring(value.data(),n);}
static FILE_ID_INFO identity(HANDLE file){FILE_ID_INFO value{};require(GetFileInformationByHandleEx(file,FileIdInfo,&value,sizeof(value))!=0,"FILE_ID_UNAVAILABLE");return value;}
static bool sameFile(const FILE_ID_INFO& a,const FILE_ID_INFO& b){return a.VolumeSerialNumber==b.VolumeSerialNumber&&memcmp(a.FileId.Identifier,b.FileId.Identifier,16)==0;}
static ULONGLONG createdAt(HANDLE process){FILETIME created{},exited{},kernel{},user{};require(GetProcessTimes(process,&created,&exited,&kernel,&user)!=0,"PROCESS_ID_UNAVAILABLE");return (static_cast<ULONGLONG>(created.dwHighDateTime)<<32)|created.dwLowDateTime;}
static bool descendantsEmpty(HANDLE job){JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info{};require(QueryInformationJobObject(job,JobObjectBasicAccountingInformation,&info,sizeof(info),nullptr)!=0,"JOB_CUSTODY_UNAVAILABLE");return info.ActiveProcesses==0;}
static std::vector<std::wstring> loopbackConfiguration(){
 DWORD count=0;PSID_AND_ATTRIBUTES entries=nullptr;require(NetworkIsolationGetAppContainerConfig(&count,&entries)==ERROR_SUCCESS,"LOOPBACK_CONFIGURATION_UNAVAILABLE");std::vector<std::wstring> values;
 try{require(count<=4096,"LOOPBACK_CONFIGURATION_CAPACITY");for(DWORD i=0;i<count;i++)values.push_back(sidText(entries[i].Sid)+L":"+std::to_wstring(entries[i].Attributes));}
 catch(...){for(DWORD i=0;i<count;i++)HeapFree(GetProcessHeap(),0,entries[i].Sid);HeapFree(GetProcessHeap(),0,entries);throw;}
 for(DWORD i=0;i<count;i++)HeapFree(GetProcessHeap(),0,entries[i].Sid);HeapFree(GetProcessHeap(),0,entries);std::sort(values.begin(),values.end());return values;
}
static void ownAcl(const std::wstring& path,PSID worker,PSID package,DWORD packageAccess){
 std::array<BYTE,SECURITY_MAX_SID_SIZE> system{};DWORD size=static_cast<DWORD>(system.size());require(CreateWellKnownSid(WinLocalSystemSid,nullptr,system.data(),&size)!=0,"SID_UNAVAILABLE");
 EXPLICIT_ACCESSW entries[3]{};PSID identities[]={worker,system.data(),package};DWORD rights[]={GENERIC_ALL,GENERIC_ALL,packageAccess};
 for(int i=0;i<3;i++){entries[i].grfAccessPermissions=rights[i];entries[i].grfAccessMode=SET_ACCESS;entries[i].grfInheritance=SUB_CONTAINERS_AND_OBJECTS_INHERIT;entries[i].Trustee.TrusteeForm=TRUSTEE_IS_SID;entries[i].Trustee.TrusteeType=TRUSTEE_IS_UNKNOWN;entries[i].Trustee.ptstrName=static_cast<LPWSTR>(identities[i]);}
 PACL acl=nullptr;require(SetEntriesInAclW(3,entries,nullptr,&acl)==ERROR_SUCCESS,"OWNED_ACL_UNAVAILABLE");DWORD status=SetNamedSecurityInfoW(const_cast<LPWSTR>(path.c_str()),SE_FILE_OBJECT,DACL_SECURITY_INFORMATION|PROTECTED_DACL_SECURITY_INFORMATION,nullptr,nullptr,acl,nullptr);LocalFree(acl);require(status==ERROR_SUCCESS,"OWNED_ACL_UNAVAILABLE");
}
struct NetworkEndpoint {int family=0;std::array<BYTE,16> address{};USHORT port=0;};
static std::vector<NetworkEndpoint> parseEndpoints(const std::wstring& input){
 require(input.size()<=24000,"INPUT_REFUSED");std::vector<NetworkEndpoint> result;std::wistringstream rows(input);std::wstring row;
 while(std::getline(rows,row,L';')){require(!row.empty()&&result.size()<4096,"INPUT_REFUSED");auto first=row.find(L','),last=row.rfind(L',');require(first==1&&last>first+1&&last+1<row.size(),"INPUT_REFUSED");std::wstring host=row.substr(first+1,last-first-1),port=row.substr(last+1);NetworkEndpoint value;value.family=row[0]==L'4'?4:row[0]==L'6'?6:0;require(value.family!=0&&host.size()<=45,"INPUT_REFUSED");require(InetPtonW(value.family==4?AF_INET:AF_INET6,host.c_str(),value.address.data())==1,"INPUT_REFUSED");if(port!=L"*"){auto n=numeric(port.c_str());require(n>0&&n<65536,"INPUT_REFUSED");value.port=static_cast<USHORT>(n);}result.push_back(value);}
 return result;
}
struct Sandbox {
 Handle process,thread,job,executable,mutex;HANDLE engine=nullptr;HDESK desktop=nullptr;PSID package=nullptr;bool ownsProfile=false;bool resumed=false;bool assignedToJob=false;bool loopbackObserved=false;bool ownedCleaned=false;
 std::wstring profileName,entryPath,profileDirectory;std::vector<UINT64> filters;std::vector<std::wstring> beforeLoopback;FILE_ID_INFO executableID{};ULONGLONG executableBytes=0,creation=0;std::string executableHash;DWORD pid=0;bool jobEmpty=false,filtersRetired=false,profileDeleted=false,loopbackUnchanged=false;
 ~Sandbox(){if(process.value&&!assignedToJob)TerminateProcess(process.value,1);if(job.value)TerminateJobObject(job.value,1);if(engine)FwpmEngineClose0(engine);if(desktop)CloseDesktop(desktop);if(ownsProfile)DeleteAppContainerProfile(profileName.c_str());if(package)FreeSid(package);}
 void addBlock(const GUID& layer,const GUID& sublayer,std::vector<FWPM_FILTER_CONDITION0> conditions){FWPM_FILTER0 filter{};filter.displayData.name=const_cast<wchar_t*>(L"EW owned SDK-only build check");filter.layerKey=layer;filter.subLayerKey=sublayer;filter.action.type=FWP_ACTION_BLOCK;filter.weight.type=FWP_EMPTY;filter.numFilterConditions=static_cast<UINT32>(conditions.size());filter.filterCondition=conditions.data();UINT64 id=0;require(FwpmFilterAdd0(engine,&filter,nullptr,&id)==ERROR_SUCCESS,"EXACT_NETWORK_POLICY_UNAVAILABLE");filters.push_back(id);}
 void network(USHORT port){
  FWPM_SESSION0 session{};session.flags=FWPM_SESSION_FLAG_DYNAMIC;session.txnWaitTimeoutInMSec=5000;require(UuidCreate(&session.sessionKey)==RPC_S_OK,"NATIVE_NONCE_UNAVAILABLE");require(FwpmEngineOpen0(nullptr,RPC_C_AUTHN_WINNT,nullptr,&session,&engine)==ERROR_SUCCESS,"FILTER_ENGINE_AUTHORITY_UNAVAILABLE");
  GUID sublayer{};require(UuidCreate(&sublayer)==RPC_S_OK,"NATIVE_NONCE_UNAVAILABLE");FWPM_SUBLAYER0 owner{};owner.subLayerKey=sublayer;owner.displayData.name=const_cast<wchar_t*>(L"EW owned build check");owner.weight=0x8000;require(FwpmSubLayerAdd0(engine,&owner,nullptr)==ERROR_SUCCESS,"EXACT_NETWORK_POLICY_UNAVAILABLE");
  FWPM_FILTER_CONDITION0 sid{};sid.fieldKey=FWPM_CONDITION_ALE_PACKAGE_ID;sid.matchType=FWP_MATCH_EQUAL;sid.conditionValue.type=FWP_SID;sid.conditionValue.sid=package;
  FWPM_FILTER_CONDITION0 address{};address.fieldKey=FWPM_CONDITION_IP_REMOTE_ADDRESS;address.matchType=FWP_MATCH_NOT_EQUAL;address.conditionValue.type=FWP_UINT32;address.conditionValue.uint32=0x7f000001;
  FWPM_FILTER_CONDITION0 remotePort{};remotePort.fieldKey=FWPM_CONDITION_IP_REMOTE_PORT;remotePort.matchType=FWP_MATCH_NOT_EQUAL;remotePort.conditionValue.type=FWP_UINT16;remotePort.conditionValue.uint16=port;
  FWPM_FILTER_CONDITION0 protocol{};protocol.fieldKey=FWPM_CONDITION_IP_PROTOCOL;protocol.matchType=FWP_MATCH_NOT_EQUAL;protocol.conditionValue.type=FWP_UINT8;protocol.conditionValue.uint8=IPPROTO_TCP;
  addBlock(FWPM_LAYER_ALE_AUTH_CONNECT_V4,sublayer,{sid,address});addBlock(FWPM_LAYER_ALE_AUTH_CONNECT_V4,sublayer,{sid,remotePort});addBlock(FWPM_LAYER_ALE_AUTH_CONNECT_V4,sublayer,{sid,protocol});addBlock(FWPM_LAYER_ALE_AUTH_CONNECT_V6,sublayer,{sid});addBlock(FWPM_LAYER_ALE_AUTH_LISTEN_V4,sublayer,{sid});addBlock(FWPM_LAYER_ALE_AUTH_LISTEN_V6,sublayer,{sid});
 }
 void networkDeclared(USHORT port,const std::vector<NetworkEndpoint>& endpoints){
  FWPM_SESSION0 session{};session.flags=FWPM_SESSION_FLAG_DYNAMIC;session.txnWaitTimeoutInMSec=5000;require(UuidCreate(&session.sessionKey)==RPC_S_OK,"NATIVE_NONCE_UNAVAILABLE");require(FwpmEngineOpen0(nullptr,RPC_C_AUTHN_WINNT,nullptr,&session,&engine)==ERROR_SUCCESS,"FILTER_ENGINE_AUTHORITY_UNAVAILABLE");
  GUID sublayer{};require(UuidCreate(&sublayer)==RPC_S_OK,"NATIVE_NONCE_UNAVAILABLE");FWPM_SUBLAYER0 owner{};owner.subLayerKey=sublayer;owner.displayData.name=const_cast<wchar_t*>(L"EW owned declared TCP check");owner.weight=0x8000;require(FwpmSubLayerAdd0(engine,&owner,nullptr)==ERROR_SUCCESS,"EXACT_NETWORK_POLICY_UNAVAILABLE");
  FWPM_FILTER_CONDITION0 sid{};sid.fieldKey=FWPM_CONDITION_ALE_PACKAGE_ID;sid.matchType=FWP_MATCH_EQUAL;sid.conditionValue.type=FWP_SID;sid.conditionValue.sid=package;
  auto add=[&](const GUID& layer,std::vector<FWPM_FILTER_CONDITION0> conditions,bool permit){
   UINT64 weight=permit?1:0;FWPM_FILTER0 filter{};filter.displayData.name=const_cast<wchar_t*>(L"EW exact captured TCP authority");filter.layerKey=layer;filter.subLayerKey=sublayer;filter.action.type=permit?FWP_ACTION_PERMIT:FWP_ACTION_BLOCK;filter.weight.type=FWP_UINT64;filter.weight.uint64=&weight;filter.numFilterConditions=static_cast<UINT32>(conditions.size());filter.filterCondition=conditions.data();
   // A soft permit can still be refused by the worker's existing firewall. No hard-permit flag is set.
   UINT64 id=0;require(FwpmFilterAdd0(engine,&filter,nullptr,&id)==ERROR_SUCCESS,"EXACT_NETWORK_POLICY_UNAVAILABLE");filters.push_back(id);FWPM_FILTER0* actual=nullptr;require(FwpmFilterGetById0(engine,id,&actual)==ERROR_SUCCESS&&actual!=nullptr,"EXACT_NETWORK_POLICY_UNAVAILABLE");bool same=actual->action.type==filter.action.type&&actual->flags==filter.flags&&actual->weight.type==FWP_UINT64&&actual->weight.uint64&&*actual->weight.uint64==weight&&actual->numFilterConditions==conditions.size()&&IsEqualGUID(actual->layerKey,layer)&&IsEqualGUID(actual->subLayerKey,sublayer);
   for(const auto& b:conditions){bool found=false;for(UINT32 n=0;same&&n<actual->numFilterConditions;n++){const auto& a=actual->filterCondition[n];if(!IsEqualGUID(a.fieldKey,b.fieldKey)||a.matchType!=b.matchType||a.conditionValue.type!=b.conditionValue.type)continue;switch(b.conditionValue.type){case FWP_SID:found=EqualSid(a.conditionValue.sid,b.conditionValue.sid)!=0;break;case FWP_UINT8:found=a.conditionValue.uint8==b.conditionValue.uint8;break;case FWP_UINT16:found=a.conditionValue.uint16==b.conditionValue.uint16;break;case FWP_UINT32:found=a.conditionValue.uint32==b.conditionValue.uint32;break;case FWP_BYTE_ARRAY16_TYPE:found=memcmp(a.conditionValue.byteArray16->byteArray16,b.conditionValue.byteArray16->byteArray16,16)==0;break;default:found=false;}if(found)break;}same=same&&found;}
   FwpmFreeMemory0(reinterpret_cast<void**>(&actual));require(same,"EXACT_NETWORK_POLICY_UNAVAILABLE");
  };
  auto allow=[&](const NetworkEndpoint& endpoint){FWPM_FILTER_CONDITION0 address{};address.fieldKey=FWPM_CONDITION_IP_REMOTE_ADDRESS;address.matchType=FWP_MATCH_EQUAL;FWP_BYTE_ARRAY16 v6{};if(endpoint.family==4){address.conditionValue.type=FWP_UINT32;UINT32 raw=0;memcpy(&raw,endpoint.address.data(),4);address.conditionValue.uint32=ntohl(raw);}else{address.conditionValue.type=FWP_BYTE_ARRAY16_TYPE;memcpy(v6.byteArray16,endpoint.address.data(),16);address.conditionValue.byteArray16=&v6;}
   FWPM_FILTER_CONDITION0 protocol{};protocol.fieldKey=FWPM_CONDITION_IP_PROTOCOL;protocol.matchType=FWP_MATCH_EQUAL;protocol.conditionValue.type=FWP_UINT8;protocol.conditionValue.uint8=IPPROTO_TCP;std::vector<FWPM_FILTER_CONDITION0> conditions{sid,address,protocol};FWPM_FILTER_CONDITION0 remotePort{};if(endpoint.port){remotePort.fieldKey=FWPM_CONDITION_IP_REMOTE_PORT;remotePort.matchType=FWP_MATCH_EQUAL;remotePort.conditionValue.type=FWP_UINT16;remotePort.conditionValue.uint16=endpoint.port;conditions.push_back(remotePort);}add(endpoint.family==4?FWPM_LAYER_ALE_AUTH_CONNECT_V4:FWPM_LAYER_ALE_AUTH_CONNECT_V6,conditions,true);
  };
  NetworkEndpoint sdk;sdk.family=4;sdk.address[0]=127;sdk.address[3]=1;sdk.port=port;allow(sdk);for(const auto& endpoint:endpoints)allow(endpoint);
  add(FWPM_LAYER_ALE_AUTH_CONNECT_V4,{sid},false);add(FWPM_LAYER_ALE_AUTH_CONNECT_V6,{sid},false);add(FWPM_LAYER_ALE_AUTH_LISTEN_V4,{sid},false);add(FWPM_LAYER_ALE_AUTH_LISTEN_V6,{sid},false);
 }
 void verify(){
  require(process.value&&GetProcessId(process.value)==pid&&createdAt(process.value)==creation,"PROCESS_ID_CHANGED");DWORD status=0;require(GetExitCodeProcess(process.value,&status)!=0&&status==STILL_ACTIVE,"ARTIFACT_NOT_CURRENT");
  Handle token;HANDLE raw=nullptr;require(OpenProcessToken(process.value,TOKEN_QUERY,&raw)!=0,"TOKEN_UNAVAILABLE");token.reset(raw);DWORD needed=0;GetTokenInformation(token.value,TokenAppContainerSid,nullptr,0,&needed);std::vector<BYTE> info(needed);require(needed>0&&GetTokenInformation(token.value,TokenAppContainerSid,info.data(),needed,&needed)!=0,"TOKEN_UNAVAILABLE");require(EqualSid(reinterpret_cast<TOKEN_APPCONTAINER_INFORMATION*>(info.data())->TokenAppContainer,package)!=0,"APPCONTAINER_CHANGED");
  std::vector<wchar_t> path(32768);DWORD count=static_cast<DWORD>(path.size());require(QueryFullProcessImageNameW(process.value,0,path.data(),&count)!=0,"ARTIFACT_CHANGED");Handle image(CreateFileW(std::wstring(path.data(),count).c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr));require(image.value!=INVALID_HANDLE_VALUE&&sameFile(identity(image.value),executableID),"ARTIFACT_CHANGED");require(sameFile(identity(executable.value),executableID),"ARTIFACT_CHANGED");
 }
 void stop(){if(job.value)require(TerminateJobObject(job.value,0)!=0,"OWNED_JOB_STOP_UNAVAILABLE");}
 void cleanup(){
  if(process.value&&!assignedToJob){require(TerminateProcess(process.value,1)!=0,"OWNED_SUSPENDED_STOP_UNAVAILABLE");require(WaitForSingleObject(process.value,5000)==WAIT_OBJECT_0,"OWNED_SUSPENDED_ABSENCE_UNCONFIRMED");}
  if(job.value){if(!descendantsEmpty(job.value))stop();ULONGLONG end=GetTickCount64()+5000;while(!descendantsEmpty(job.value)&&GetTickCount64()<end)Sleep(25);jobEmpty=descendantsEmpty(job.value);require(jobEmpty,"OWNED_JOB_ABSENCE_UNCONFIRMED");}
  else jobEmpty=true;
  process.reset();thread.reset();executable.reset();
  if(engine){HANDLE old=engine;engine=nullptr;require(FwpmEngineClose0(old)==ERROR_SUCCESS,"DYNAMIC_FILTER_RETIREMENT_UNCONFIRMED");HANDLE reader=nullptr;require(FwpmEngineOpen0(nullptr,RPC_C_AUTHN_WINNT,nullptr,nullptr,&reader)==ERROR_SUCCESS,"DYNAMIC_FILTER_RETIREMENT_UNCONFIRMED");bool retired=true;for(UINT64 id:filters){FWPM_FILTER0* found=nullptr;DWORD status=FwpmFilterGetById0(reader,id,&found);if(found)FwpmFreeMemory0(reinterpret_cast<void**>(&found));if(status!=FWP_E_FILTER_NOT_FOUND)retired=false;}FwpmEngineClose0(reader);require(retired,"DYNAMIC_FILTER_RETIREMENT_UNCONFIRMED");}filtersRetired=true;
  if(desktop){HDESK old=desktop;desktop=nullptr;require(CloseDesktop(old)!=0,"OWNED_DESKTOP_RETIREMENT_UNCONFIRMED");}
  if(ownsProfile){require(DeleteAppContainerProfile(profileName.c_str())==S_OK,"OWNED_PROFILE_RETIREMENT_UNCONFIRMED");ownsProfile=false;}profileDeleted=true;
  ownedCleaned=true;
  if(loopbackObserved){loopbackUnchanged=loopbackConfiguration()==beforeLoopback;require(loopbackUnchanged,"LOOPBACK_CONFIGURATION_CHANGED");}
 }
};
static void setup(Sandbox& box,const std::wstring& root,const std::wstring& entry,const std::wstring& scratch,USHORT port,const std::string& expected,ULONGLONG bytes,const std::vector<NetworkEndpoint>* endpoints=nullptr){
 Handle token;HANDLE raw=nullptr;require(OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY,&raw)!=0,"WORKER_ID_UNAVAILABLE");token.reset(raw);DWORD needed=0;GetTokenInformation(token.value,TokenUser,nullptr,0,&needed);std::vector<BYTE> user(needed);require(needed>0&&GetTokenInformation(token.value,TokenUser,user.data(),needed,&needed)!=0,"WORKER_ID_UNAVAILABLE");PSID worker=reinterpret_cast<TOKEN_USER*>(user.data())->User.Sid;
 std::string workerHash=sidHash(worker);box.profileName=L"EW2.BuildCheck."+std::wstring(workerHash.begin(),workerHash.begin()+24);std::wstring mutexName=L"Global\\"+box.profileName;box.mutex.reset(CreateMutexW(nullptr,TRUE,mutexName.c_str()));require(box.mutex.value&&GetLastError()!=ERROR_ALREADY_EXISTS,"WORKER_CHECK_SLOT_OCCUPIED");
 PSID expectedSid=nullptr;require(DeriveAppContainerSidFromAppContainerName(box.profileName.c_str(),&expectedSid)==S_OK,"PROFILE_ID_UNAVAILABLE");std::wstring expectedText=sidText(expectedSid);FreeSid(expectedSid);box.beforeLoopback=loopbackConfiguration();box.loopbackObserved=true;require(std::any_of(box.beforeLoopback.begin(),box.beforeLoopback.end(),[&](const std::wstring& value){return value.rfind(expectedText+L":",0)==0;}),"EXISTING_LOOPBACK_AUTHORITY_UNAVAILABLE");
 require(CreateAppContainerProfile(box.profileName.c_str(),L"EW disposable SDK build check",L"Owned temporary build check profile",nullptr,0,&box.package)==S_OK,"FRESH_PROFILE_UNAVAILABLE");box.ownsProfile=true;require(sidText(box.package)==expectedText,"PROFILE_ID_CHANGED");
 if(endpoints)box.networkDeclared(port,*endpoints);else box.network(port);
 Handle rootHandle(CreateFileW(root.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));require(rootHandle.value!=INVALID_HANDLE_VALUE,"OWNED_ROOT_UNAVAILABLE");std::wstring actualRoot=canonical(rootHandle.value);
 auto safe=[](const std::wstring& path){DWORD attributes=GetFileAttributesW(path.c_str());return attributes!=INVALID_FILE_ATTRIBUTES&&!(attributes&FILE_ATTRIBUTE_REPARSE_POINT);};require(safe(root)&&safe(scratch),"OWNED_ROOT_UNAVAILABLE");
 box.executable.reset(CreateFileW(entry.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));require(box.executable.value!=INVALID_HANDLE_VALUE&&safe(entry),"ARTIFACT_READ_REFUSED");box.entryPath=canonical(box.executable.value);require(box.entryPath.size()>actualRoot.size()+1&&_wcsnicmp(box.entryPath.c_str(),actualRoot.c_str(),actualRoot.size())==0&&box.entryPath[actualRoot.size()]==L'\\',"ARTIFACT_OUTSIDE_ROOT");LARGE_INTEGER size{};require(GetFileSizeEx(box.executable.value,&size)!=0&&static_cast<ULONGLONG>(size.QuadPart)==bytes,"ARTIFACT_CHANGED");box.executableBytes=bytes;box.executableID=identity(box.executable.value);box.executableHash=hashFile(box.executable.value,bytes);require(box.executableHash==expected,"ARTIFACT_CHANGED");
 IMAGE_DOS_HEADER dos{};DWORD got=0;LARGE_INTEGER offset{};SetFilePointerEx(box.executable.value,offset,nullptr,FILE_BEGIN);require(ReadFile(box.executable.value,&dos,sizeof(dos),&got,nullptr)!=0&&got==sizeof(dos)&&dos.e_magic==IMAGE_DOS_SIGNATURE&&dos.e_lfanew>=sizeof(dos)&&static_cast<ULONGLONG>(dos.e_lfanew)+sizeof(IMAGE_NT_HEADERS64)<=bytes,"AMD64_PE_REQUIRED");offset.QuadPart=dos.e_lfanew;require(SetFilePointerEx(box.executable.value,offset,nullptr,FILE_BEGIN)!=0,"AMD64_PE_REQUIRED");IMAGE_NT_HEADERS64 pe{};require(ReadFile(box.executable.value,&pe,sizeof(pe),&got,nullptr)!=0&&got==sizeof(pe)&&pe.Signature==IMAGE_NT_SIGNATURE&&pe.FileHeader.Machine==IMAGE_FILE_MACHINE_AMD64&&pe.OptionalHeader.Magic==IMAGE_NT_OPTIONAL_HDR64_MAGIC,"AMD64_PE_REQUIRED");
 std::vector<std::wstring> paths{root};for(const auto& item:std::filesystem::recursive_directory_iterator(root)){require(paths.size()<10001&&safe(item.path().wstring()),"IMMUTABLE_TREE_REFUSED");paths.push_back(item.path().wstring());}for(const auto& path:paths)ownAcl(path,worker,box.package,GENERIC_READ|GENERIC_EXECUTE);ownAcl(scratch,worker,box.package,GENERIC_ALL);
 std::wstring desktopName=L"EWCheck"+std::to_wstring(GetCurrentProcessId());
 EXPLICIT_ACCESSW desktopEntries[2]{};PSID desktopSids[]={worker,box.package};DWORD desktopRights[]={GENERIC_ALL,DESKTOP_CREATEWINDOW|DESKTOP_CREATEMENU|DESKTOP_READOBJECTS|DESKTOP_WRITEOBJECTS};for(int i=0;i<2;i++){desktopEntries[i].grfAccessPermissions=desktopRights[i];desktopEntries[i].grfAccessMode=SET_ACCESS;desktopEntries[i].Trustee.TrusteeForm=TRUSTEE_IS_SID;desktopEntries[i].Trustee.ptstrName=static_cast<LPWSTR>(desktopSids[i]);}
 PACL desktopAcl=nullptr;require(SetEntriesInAclW(2,desktopEntries,nullptr,&desktopAcl)==ERROR_SUCCESS,"PRIVATE_DESKTOP_UNAVAILABLE");SECURITY_DESCRIPTOR desktopDescriptor{};bool descriptorReady=InitializeSecurityDescriptor(&desktopDescriptor,SECURITY_DESCRIPTOR_REVISION)&&SetSecurityDescriptorDacl(&desktopDescriptor,TRUE,desktopAcl,FALSE);SECURITY_ATTRIBUTES desktopSecurity{sizeof(desktopSecurity),&desktopDescriptor,FALSE};if(descriptorReady)box.desktop=CreateDesktopW(desktopName.c_str(),nullptr,nullptr,0,GENERIC_ALL,&desktopSecurity);LocalFree(desktopAcl);require(box.desktop!=nullptr,"PRIVATE_DESKTOP_UNAVAILABLE");
 box.job.reset(CreateJobObjectW(nullptr,nullptr));require(box.job.value!=nullptr,"OWNED_JOB_UNAVAILABLE");JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};limits.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE|JOB_OBJECT_LIMIT_ACTIVE_PROCESS;limits.BasicLimitInformation.ActiveProcessLimit=256;require(SetInformationJobObject(box.job.value,JobObjectExtendedLimitInformation,&limits,sizeof(limits))!=0,"OWNED_JOB_UNAVAILABLE");JOBOBJECT_BASIC_UI_RESTRICTIONS ui{};ui.UIRestrictionsClass=JOB_OBJECT_UILIMIT_HANDLES|JOB_OBJECT_UILIMIT_READCLIPBOARD|JOB_OBJECT_UILIMIT_WRITECLIPBOARD|JOB_OBJECT_UILIMIT_SYSTEMPARAMETERS|JOB_OBJECT_UILIMIT_DISPLAYSETTINGS|JOB_OBJECT_UILIMIT_GLOBALATOMS|JOB_OBJECT_UILIMIT_DESKTOP|JOB_OBJECT_UILIMIT_EXITWINDOWS;require(SetInformationJobObject(box.job.value,JobObjectBasicUIRestrictions,&ui,sizeof(ui))!=0,"OWNED_JOB_UNAVAILABLE");
 SIZE_T attributeBytes=0;InitializeProcThreadAttributeList(nullptr,1,0,&attributeBytes);std::vector<BYTE> attributes(attributeBytes);auto list=reinterpret_cast<PPROC_THREAD_ATTRIBUTE_LIST>(attributes.data());require(InitializeProcThreadAttributeList(list,1,0,&attributeBytes)!=0,"PROCESS_POLICY_UNAVAILABLE");
 PSID internet=nullptr;require(ConvertStringSidToSidW(L"S-1-15-3-1",&internet)!=0,"NETWORK_CAPABILITY_UNAVAILABLE");SID_AND_ATTRIBUTES capability{internet,SE_GROUP_ENABLED};SECURITY_CAPABILITIES security{box.package,&capability,1,0};
 try{require(UpdateProcThreadAttribute(list,0,PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,&security,sizeof(security),nullptr,nullptr)!=0,"PROCESS_POLICY_UNAVAILABLE");
  std::vector<wchar_t> windows(32768);UINT count=GetWindowsDirectoryW(windows.data(),static_cast<UINT>(windows.size()));require(count>0&&count<windows.size(),"CLEAN_ENVIRONMENT_UNAVAILABLE");std::vector<std::wstring> env={L"EW_SDK_CHECK=1",L"EW_SDK_TOKEN="+environment(L"EW_SDK_TOKEN"),L"EW_SDK_URL=ws://127.0.0.1:"+std::to_wstring(port)+L"/",L"HOME="+scratch,L"SYSTEMROOT="+std::wstring(windows.data(),count),L"TEMP="+scratch,L"TMP="+scratch};std::sort(env.begin(),env.end());std::vector<wchar_t> block;for(const auto& row:env){block.insert(block.end(),row.begin(),row.end());block.push_back(0);}block.push_back(0);
  STARTUPINFOEXW startup{};startup.StartupInfo.cb=sizeof(startup);std::wstring desktop=L"winsta0\\"+desktopName;startup.StartupInfo.lpDesktop=desktop.data();startup.lpAttributeList=list;PROCESS_INFORMATION child{};std::wstring command=L"\""+entry+L"\"";require(CreateProcessW(entry.c_str(),command.data(),nullptr,nullptr,FALSE,EXTENDED_STARTUPINFO_PRESENT|CREATE_SUSPENDED|CREATE_UNICODE_ENVIRONMENT|CREATE_NO_WINDOW,block.data(),root.c_str(),&startup.StartupInfo,&child)!=0,"APPCONTAINER_LAUNCH_REFUSED");box.process.reset(child.hProcess);box.thread.reset(child.hThread);box.pid=child.dwProcessId;box.creation=createdAt(box.process.value);require(AssignProcessToJobObject(box.job.value,box.process.value)!=0,"OWNED_JOB_ADMISSION_REFUSED");box.assignedToJob=true;box.verify();require(ResumeThread(box.thread.value)!=static_cast<DWORD>(-1),"APPCONTAINER_RESUME_REFUSED");box.resumed=true;
 }catch(...){LocalFree(internet);DeleteProcThreadAttributeList(list);throw;}LocalFree(internet);DeleteProcThreadAttributeList(list);
}
int wmain(int argc,wchar_t** argv){
 Sandbox box;const char* failure=nullptr;bool ready=false;std::string networkHash;
 try{require(SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32|LOAD_LIBRARY_SEARCH_APPLICATION_DIR)!=0,"TRUSTED_DLL_SEARCH_UNAVAILABLE");SYSTEM_INFO machine{};GetNativeSystemInfo(&machine);require(machine.wProcessorArchitecture==PROCESSOR_ARCHITECTURE_AMD64&&sizeof(void*)==8,"ACTUAL_WINDOWS_X64_REQUIRED");require(argc==7||argc==8,"INPUT_REFUSED");const ULONGLONG port=numeric(argv[4]);require(port>0&&port<65536,"INPUT_REFUSED");std::vector<NetworkEndpoint> endpoints;if(argc==8){endpoints=parseEndpoints(argv[7]);std::string encoded;for(const wchar_t* c=argv[7];*c;c++){require(*c<128,"INPUT_REFUSED");encoded.push_back(static_cast<char>(*c));}networkHash=hashBytes(reinterpret_cast<const BYTE*>(encoded.data()),encoded.size());}setup(box,argv[1],argv[2],argv[3],static_cast<USHORT>(port),asciiHash(argv[5]),numeric(argv[6]),argc==8?&endpoints:nullptr);ready=true;
  std::cout<<"{\"kind\":\"ready\",\"pid\":"<<box.pid<<",\"createdAt\":\""<<box.creation<<"\",\"sha256\":\""<<box.executableHash<<"\",\"bytes\":"<<box.executableBytes<<",\"volume\":\""<<box.executableID.VolumeSerialNumber<<"\",\"fileId\":\""<<hex(box.executableID.FileId.Identifier,16)<<"\",\"profileHash\":\""<<sidHash(box.package)<<"\",\"policyInstalledBeforeResume\":true"<<(networkHash.empty()?std::string(""):std::string(",\"networkSHA256\":\"")+networkHash+"\"")<<"}"<<std::endl;
  std::string pending;HANDLE input=GetStdHandle(STD_INPUT_HANDLE);bool stop=false;
  while(!stop){DWORD code=0;require(GetExitCodeProcess(box.process.value,&code)!=0,"PROCESS_ID_UNAVAILABLE");if(code!=STILL_ACTIVE)break;DWORD bytes=0;if(!PeekNamedPipe(input,nullptr,0,nullptr,&bytes,nullptr)){box.stop();break;}if(bytes){char chunk[1024];DWORD n=0;require(ReadFile(input,chunk,std::min<DWORD>(bytes,sizeof(chunk)),&n,nullptr)!=0,"CONTROL_CHANNEL_REFUSED");pending.append(chunk,n);require(pending.size()<=4096,"CONTROL_CHANNEL_REFUSED");size_t end;while((end=pending.find('\n'))!=std::string::npos){std::string line=pending.substr(0,end);pending.erase(0,end+1);std::istringstream command(line);std::string operation,extra;unsigned long id=0;require(static_cast<bool>(command>>operation>>id)&&id>0&&!(command>>extra),"CONTROL_CHANNEL_REFUSED");if(operation=="verify"){box.verify();std::cout<<"{\"kind\":\"verified\",\"id\":"<<id<<"}"<<std::endl;}else if(operation=="stop"){box.stop();std::cout<<"{\"kind\":\"stopped\",\"id\":"<<id<<"}"<<std::endl;stop=true;}else throw Refusal{"CONTROL_CHANNEL_REFUSED"};}}Sleep(25);}
 }catch(const Refusal& refused){failure=refused.code;}catch(...){failure="NATIVE_REFUSAL";}
 try{box.cleanup();}catch(const Refusal& refused){if(!failure)failure=refused.code;}catch(...){if(!failure)failure="OWNED_CLEANUP_UNCONFIRMED";}
 std::cout<<"{\"kind\":\"finished\",\"ready\":"<<(ready?"true":"false")<<",\"jobEmpty\":"<<(box.jobEmpty?"true":"false")<<",\"filtersRetired\":"<<(box.filtersRetired?"true":"false")<<",\"profileDeleted\":"<<(box.profileDeleted?"true":"false")<<",\"loopbackUnchanged\":"<<(box.loopbackUnchanged?"true":"false")<<",\"cleaned\":"<<(box.ownedCleaned?"true":"false")<<",\"failure\":"<<(failure?std::string("\"")+failure+"\"":"null")<<"}"<<std::endl;
 return failure?1:0;
}
