/* Embeds the complete ordinary SDK/Kestrel/Engine application. No std/os/Node loader is installed. */
#include "quickjs.h"
#include "channel.h"
#include "embedded.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>
#include <limits.h>
typedef struct{uint64_t due;int id;JSValue callback;} EWTimer;
typedef struct{JSRuntime *runtime;JSContext *context;EWChannel *channel;const char *url;JSValue callback;EWTimer timers[1024];int next_timer,closed,failed;} EWApplication;
static EWApplication *application(JSContext *context){return JS_GetContextOpaque(context);}
static JSValue refused(JSContext *context){return JS_ThrowInternalError(context,"The embedded application is unavailable.");}
static void fail(EWApplication *app){app->failed=1;ew_channel_close(app->channel);}
static JSValue fatal_call(JSContext *context,JSValueConst self,int argc,JSValueConst *argv){(void)self;(void)argc;(void)argv;fail(application(context));return JS_UNDEFINED;}
static JSValue utf8_call(JSContext *context,JSValueConst self,int argc,JSValueConst *argv){
 (void)self;if(argc!=1)return refused(context);size_t n;const char *text=JS_ToCStringLen(context,&n,argv[0]);if(!text)return JS_EXCEPTION;
 uint8_t *normalized=malloc(n?n:1);if(!normalized){JS_FreeCString(context,text);return JS_ThrowOutOfMemory(context);}memcpy(normalized,text,n);JS_FreeCString(context,text);
 /* QuickJS represents lone UTF16 surrogates as WTF8; TextEncoder replaces each one with U+FFFD. */
 for(size_t j=0;j+2<n;j++)if(normalized[j]==0xed&&normalized[j+1]>=0xa0&&normalized[j+1]<=0xbf&&(normalized[j+2]&0xc0)==0x80){normalized[j]=0xef;normalized[j+1]=0xbf;normalized[j+2]=0xbd;j+=2;}
 JSValue buffer=JS_NewArrayBufferCopy(context,normalized,n);free(normalized);if(JS_IsException(buffer))return buffer;
 JSValue value=JS_NewTypedArray(context,1,&buffer,JS_TYPED_ARRAY_UINT8);JS_FreeValue(context,buffer);return value;
}
static const char alphabet[]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
static JSValue btoa_call(JSContext *context,JSValueConst self,int argc,JSValueConst *argv){
 (void)self;if(argc!=1)return JS_NULL;size_t n;const uint8_t *text=(const uint8_t *)JS_ToCStringLen(context,&n,argv[0]);if(!text)return JS_EXCEPTION;
 uint8_t *bytes=malloc(n?n:1);if(!bytes){JS_FreeCString(context,(const char *)text);return JS_ThrowOutOfMemory(context);}size_t count=0;int valid=1;
 for(size_t i=0;i<n;i++){unsigned c=text[i];if(c>=0x80){if((c!=0xc2&&c!=0xc3)||i+1>=n||(text[i+1]&0xc0)!=0x80){valid=0;break;}c=((c&31)<<6)|(text[++i]&63);}bytes[count++]=(uint8_t)c;}
 JS_FreeCString(context,(const char *)text);if(!valid||count>(SIZE_MAX-1)/4*3){free(bytes);return JS_NULL;}
 size_t length=((count+2)/3)*4;char *encoded=malloc(length+1);if(!encoded){free(bytes);return JS_ThrowOutOfMemory(context);}size_t at=0;
 for(size_t i=0;i<count;i+=3){uint32_t v=(uint32_t)bytes[i]<<16;if(i+1<count)v|=(uint32_t)bytes[i+1]<<8;if(i+2<count)v|=bytes[i+2];encoded[at++]=alphabet[v>>18];encoded[at++]=alphabet[(v>>12)&63];encoded[at++]=i+1<count?alphabet[(v>>6)&63]:'=';encoded[at++]=i+2<count?alphabet[v&63]:'=';}
 free(bytes);JSValue result=JS_NewStringLen(context,encoded,length);free(encoded);return result;
}
static int base64_value(unsigned c){if(c>='A'&&c<='Z')return(int)c-'A';if(c>='a'&&c<='z')return(int)c-'a'+26;if(c>='0'&&c<='9')return(int)c-'0'+52;if(c=='+')return 62;if(c=='/')return 63;return -1;}
static JSValue atob_call(JSContext *context,JSValueConst self,int argc,JSValueConst *argv){
 (void)self;if(argc!=1)return JS_NULL;size_t n;const char *text=JS_ToCStringLen(context,&n,argv[0]);if(!text)return JS_EXCEPTION;if(n%4||n>(SIZE_MAX-1)/2){JS_FreeCString(context,text);return JS_NULL;}
 char *decoded=malloc(n*2+1);if(!decoded){JS_FreeCString(context,text);return JS_ThrowOutOfMemory(context);}size_t at=0;int valid=1;
 for(size_t i=0;i<n;i+=4){int a=base64_value((unsigned char)text[i]),b=base64_value((unsigned char)text[i+1]),c=base64_value((unsigned char)text[i+2]),d=base64_value((unsigned char)text[i+3]);unsigned padding=text[i+3]=='='?1u:0u;if(text[i+2]=='=')padding++;
  if(a<0||b<0||(padding==2&&(text[i+3]!='='||(b&15)))||(padding==1&&(c<0||(c&3)))||(!padding&&(c<0||d<0))||(padding&&i+4!=n)){valid=0;break;}
  uint32_t value=(uint32_t)a<<18|(uint32_t)b<<12|(uint32_t)(c<0?0:c)<<6|(uint32_t)(d<0?0:d);
  for(unsigned j=0;j<3-padding;j++){unsigned byte=(value>>(16-8*j))&255;if(byte<128)decoded[at++]=(char)byte;else{decoded[at++]=(char)(0xc0|(byte>>6));decoded[at++]=(char)(0x80|(byte&63));}}
 }JS_FreeCString(context,text);JSValue result=valid?JS_NewStringLen(context,decoded,at):JS_NULL;free(decoded);return result;
}
static JSValue timer_call(JSContext *context,JSValueConst self,int argc,JSValueConst *argv){
 (void)self;EWApplication *app=application(context);double delay;if(argc!=2||!JS_IsFunction(context,argv[0])||JS_ToFloat64(context,&delay,argv[1])||!isfinite(delay)||delay<0||delay>INT32_MAX||app->next_timer==INT_MAX)return refused(context);
 for(size_t j=0;j<1024;j++)if(!app->timers[j].id){EWTimer *t=&app->timers[j];t->id=++app->next_timer;t->due=ew_millis()+(uint64_t)fmax(1,ceil(delay));t->callback=JS_DupValue(context,argv[0]);return JS_NewInt32(context,t->id);}return refused(context);
}
static JSValue clear_timer_call(JSContext *context,JSValueConst self,int argc,JSValueConst *argv){
 (void)self;EWApplication *app=application(context);int32_t id;if(argc!=1||JS_ToInt32(context,&id,argv[0]))return refused(context);for(size_t j=0;j<1024;j++)if(app->timers[j].id==id){app->timers[j].id=0;JS_FreeValue(context,app->timers[j].callback);break;}return JS_UNDEFINED;
}
static JSValue open_call(JSContext *context,JSValueConst self,int argc,JSValueConst *argv){
 (void)self;EWApplication *app=application(context);if(argc!=2||!JS_IsFunction(context,argv[1]))return JS_FALSE;size_t n;const char *url=JS_ToCStringLen(context,&n,argv[0]);if(!url)return JS_EXCEPTION;
 int same=n==strlen(app->url)&&memcmp(url,app->url,n)==0;JS_FreeCString(context,url);if(!same||!ew_channel_open(app->channel,app->url))return JS_FALSE;JS_FreeValue(context,app->callback);app->callback=JS_DupValue(context,argv[1]);return JS_TRUE;
}
static JSValue send_call(JSContext *context,JSValueConst self,int argc,JSValueConst *argv){
 (void)self;if(argc!=1||!JS_IsString(argv[0]))return JS_FALSE;size_t n;const char *text=JS_ToCStringLen(context,&n,argv[0]);if(!text)return JS_EXCEPTION;int ok=n<=EW_FRAME_BYTES&&ew_channel_send(application(context)->channel,(const uint8_t *)text,n);JS_FreeCString(context,text);return JS_NewBool(context,ok);
}
static JSValue close_call(JSContext *context,JSValueConst self,int argc,JSValueConst *argv){(void)self;(void)argc;(void)argv;EWApplication *app=application(context);app->closed=1;ew_channel_finish(app->channel);return JS_UNDEFINED;}
static void native_event(void *opaque,const char *kind,const uint8_t *data,size_t length){
 EWApplication *app=opaque;JSContext *context=app->context;if(JS_IsUndefined(app->callback))return;
 JSValue args[2]={JS_NewString(context,kind),JS_NewStringLen(context,data?(const char *)data:"",length)};
 JSValue result=JS_Call(context,app->callback,JS_UNDEFINED,2,args);JS_FreeValue(context,args[0]);JS_FreeValue(context,args[1]);if(JS_IsException(result))fail(app);JS_FreeValue(context,result);
 if(strcmp(kind,"error")==0)fail(app);else if(strcmp(kind,"close")==0)app->closed=1;
}
static int install(JSContext *context,JSValue global,const char *name,JSCFunction *function,int argc){return JS_SetPropertyStr(context,global,name,JS_NewCFunction(context,function,name,argc));}
int main(void){
 if(ew_runtime_notice[0]==0){fputs("The runtime notice is unavailable.\n",stderr);return 1;}
 EWApplication app;memset(&app,0,sizeof(app));app.callback=JS_UNDEFINED;app.url=getenv("EW_SDK_URL");const char *token=getenv("EW_SDK_TOKEN"),*path;unsigned port;
 if(!app.url||!token||!token[0]||strlen(token)>=EW_FRAME_BYTES||!ew_launcher_url(app.url,&port,&path)){fputs("The launcher must supply one exact loopback endpoint and credential.\n",stderr);return 1;}(void)path;
 app.channel=ew_channel_new();app.runtime=JS_NewRuntime();if(!app.channel||!app.runtime)goto refused;
 JS_SetMaxStackSize(app.runtime,2u*1024u*1024u);app.context=JS_NewContext(app.runtime);if(!app.context)goto refused;JS_SetContextOpaque(app.context,&app);
 JSValue global=JS_GetGlobalObject(app.context),launch=JS_NewObject(app.context);char port_text[6];snprintf(port_text,sizeof(port_text),"%u",port);
 if(JS_SetPropertyStr(app.context,launch,"url",JS_NewString(app.context,app.url))<0||JS_SetPropertyStr(app.context,launch,"token",JS_NewString(app.context,token))<0||JS_SetPropertyStr(app.context,launch,"port",JS_NewString(app.context,port_text))<0||JS_SetPropertyStr(app.context,global,"__launch",launch)<0){JS_FreeValue(app.context,global);goto refused;}
 if(install(app.context,global,"__utf8",utf8_call,1)<0||install(app.context,global,"__btoa",btoa_call,1)<0||install(app.context,global,"__atob",atob_call,1)<0||install(app.context,global,"__timer",timer_call,2)<0||install(app.context,global,"__clearTimer",clear_timer_call,1)<0||install(app.context,global,"__open",open_call,2)<0||install(app.context,global,"__send",send_call,1)<0||install(app.context,global,"__close",close_call,0)<0||install(app.context,global,"__fatal",fatal_call,0)<0){JS_FreeValue(app.context,global);goto refused;}JS_FreeValue(app.context,global);
 JSValue evaluated=JS_Eval(app.context,(const char *)ew_application,ew_application_size,"embedded-sdk-application.js",JS_EVAL_TYPE_GLOBAL);if(JS_IsException(evaluated)){JS_FreeValue(app.context,evaluated);goto refused;}JS_FreeValue(app.context,evaluated);
 while(!app.closed&&!app.failed){
  JSContext *job_context;while(JS_IsJobPending(app.runtime)){if(JS_ExecutePendingJob(app.runtime,&job_context)<0){fail(&app);break;}if(app.failed||app.closed)break;}if(app.closed||app.failed)break;
  uint64_t now=ew_millis();unsigned wait=50;for(size_t j=0;j<1024;j++){EWTimer *timer=&app.timers[j];if(!timer->id)continue;if(timer->due<=now){JSValue callback=timer->callback;timer->id=0;JSValue result=JS_Call(app.context,callback,JS_UNDEFINED,0,NULL);JS_FreeValue(app.context,callback);if(JS_IsException(result))fail(&app);JS_FreeValue(app.context,result);wait=0;if(app.failed||app.closed)break;}else if(timer->due-now<wait)wait=(unsigned)(timer->due-now);}
  if(!app.failed&&!app.closed)ew_channel_poll(app.channel,wait,native_event,&app);
 }
 goto cleanup;
refused:app.failed=1;
cleanup:
 if(app.failed)fputs("The embedded application failed.\n",stderr);
 if(app.context){for(size_t j=0;j<1024;j++)if(app.timers[j].id)JS_FreeValue(app.context,app.timers[j].callback);JS_FreeValue(app.context,app.callback);JS_FreeContext(app.context);}if(app.runtime)JS_FreeRuntime(app.runtime);ew_channel_free(app.channel);return app.failed?1:0;
}

