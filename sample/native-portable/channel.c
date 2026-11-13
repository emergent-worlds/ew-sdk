/* RFC6455 client for the single exact launcher-captured IPv4 loopback endpoint.
 * No TLS, DNS, redirects, proxy, HTTP authorization or alternate destination exists. */
#include "channel.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <limits.h>
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <bcrypt.h>
typedef SOCKET EWSocket;
#define EW_BAD INVALID_SOCKET
#define ew_socket_close closesocket
static int would_block(void){return WSAGetLastError()==WSAEWOULDBLOCK;}
static int random_bytes(uint8_t *p,size_t n){return n<=ULONG_MAX && BCryptGenRandom(NULL,p,(ULONG)n,BCRYPT_USE_SYSTEM_PREFERRED_RNG)==0;}
uint64_t ew_millis(void){return GetTickCount64();}
#else
#include <sys/types.h>
#include <sys/socket.h>
#include <sys/select.h>
#include <sys/random.h>
#include <netinet/in.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <time.h>
typedef int EWSocket;
#define EW_BAD (-1)
#define ew_socket_close close
static int would_block(void){return errno==EAGAIN||errno==EWOULDBLOCK||errno==EINTR;}
static int random_bytes(uint8_t *p,size_t n){while(n){ssize_t k=getrandom(p,n,0);if(k<0){if(errno==EINTR)continue;return 0;}if(!k)return 0;p+=k;n-=(size_t)k;}return 1;}
uint64_t ew_millis(void){struct timespec t;if(clock_gettime(CLOCK_MONOTONIC,&t))abort();return (uint64_t)t.tv_sec*1000u+(uint64_t)t.tv_nsec/1000000u;}
#endif
typedef struct EWFrame{struct EWFrame *next;size_t bytes,sent,payload;uint8_t data[];} EWFrame;
struct EWChannel{EWSocket socket;int used,opened,fragmented,winsock_started;size_t buffered,message_bytes,queued_payload,queued_frames;uint8_t *buffer,*message;EWFrame *first,*last;};
static uint32_t rol(uint32_t x,unsigned n){return(x<<n)|(x>>(32-n));}
/* SHA-1 is mandated only for the WebSocket accept challenge, never an authentication primitive. */
static void sha1(const uint8_t *input,size_t n,uint8_t out[20]){
 uint32_t h[5]={0x67452301,0xefcdab89,0x98badcfe,0x10325476,0xc3d2e1f0};
 uint8_t data[128]={0};size_t blocks=(n+9+63)/64;uint64_t bits=(uint64_t)n*8;
 if(n>119)abort();memcpy(data,input,n);data[n]=0x80;for(unsigned j=0;j<8;j++)data[blocks*64-1-j]=(uint8_t)(bits>>(8*j));
 for(size_t b=0;b<blocks;b++){uint32_t w[80];for(unsigned j=0;j<16;j++){const uint8_t *p=data+b*64+j*4;w[j]=(uint32_t)p[0]<<24|(uint32_t)p[1]<<16|(uint32_t)p[2]<<8|p[3];}for(unsigned j=16;j<80;j++)w[j]=rol(w[j-3]^w[j-8]^w[j-14]^w[j-16],1);
  uint32_t a=h[0],c=h[2],d=h[3],e=h[4],v=h[1];for(unsigned j=0;j<80;j++){uint32_t f,k;if(j<20){f=(v&c)|(~v&d);k=0x5a827999;}else if(j<40){f=v^c^d;k=0x6ed9eba1;}else if(j<60){f=(v&c)|(v&d)|(c&d);k=0x8f1bbcdc;}else{f=v^c^d;k=0xca62c1d6;}uint32_t t=rol(a,5)+f+e+k+w[j];e=d;d=c;c=rol(v,30);v=a;a=t;}h[0]+=a;h[1]+=v;h[2]+=c;h[3]+=d;h[4]+=e;
 }for(unsigned j=0;j<20;j++)out[j]=(uint8_t)(h[j/4]>>(24-8*(j%4)));
}
static const char b64[]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
static void base64(const uint8_t *p,size_t n,char *out){size_t j=0;for(size_t i=0;i<n;i+=3){uint32_t v=(uint32_t)p[i]<<16;if(i+1<n)v|=(uint32_t)p[i+1]<<8;if(i+2<n)v|=p[i+2];out[j++]=b64[v>>18];out[j++]=b64[(v>>12)&63];out[j++]=i+1<n?b64[(v>>6)&63]:'=';out[j++]=i+2<n?b64[v&63]:'=';}out[j]=0;}
int ew_valid_utf8(const uint8_t *p,size_t n){for(size_t i=0;i<n;){unsigned c=p[i++],extra;uint32_t value,min;if(c<0x80)continue;if(c>=0xc2&&c<=0xdf){extra=1;value=c&31;min=0x80;}else if(c>=0xe0&&c<=0xef){extra=2;value=c&15;min=0x800;}else if(c>=0xf0&&c<=0xf4){extra=3;value=c&7;min=0x10000;}else return 0;if(n-i<extra)return 0;while(extra--){c=p[i++];if((c&0xc0)!=0x80)return 0;value=(value<<6)|(c&63);}if(value<min||value>0x10ffff||(value>=0xd800&&value<=0xdfff))return 0;}return 1;}
int ew_launcher_url(const char *url,unsigned *port,const char **path){
 const char *prefix="ws://127.0.0.1:";if(strncmp(url,prefix,strlen(prefix)))return 0;const char *p=url+strlen(prefix),*start=p;unsigned value=0;
 while(*p>='0'&&*p<='9'){if(value>6553)return 0;value=value*10+(unsigned)(*p++-'0');}if(p==start||!value||value>65535||(*p&&*p!='/'))return 0;
 for(const char *v=p;*v;v++){unsigned char ch=(unsigned char)*v;if(!((ch>='a'&&ch<='z')||(ch>='A'&&ch<='Z')||(ch>='0'&&ch<='9')||strchr("-._~!$&'()*+,;=:@/%",ch)))return 0;if(ch=='%'&&(!(v[1]&&v[2])||!((v[1]>='0'&&v[1]<='9')||(v[1]>='a'&&v[1]<='f')||(v[1]>='A'&&v[1]<='F'))||!((v[2]>='0'&&v[2]<='9')||(v[2]>='a'&&v[2]<='f')||(v[2]>='A'&&v[2]<='F'))))return 0;}
 *port=value;*path=*p?p:"/";return strlen(*path)<=2048;
}
static int ready(EWSocket s,int write,unsigned ms){
#ifndef _WIN32
 if(s<0||s>=FD_SETSIZE)return 0;
#endif
 fd_set set;FD_ZERO(&set);FD_SET(s,&set);struct timeval t={(long)(ms/1000),(long)((ms%1000)*1000)};return select((int)s+1,write?NULL:&set,write?&set:NULL,NULL,&t)>0;}
static int nonblocking(EWSocket s){
#ifdef _WIN32
 u_long one=1;return ioctlsocket(s,FIONBIO,&one)==0;
#else
 int flags=fcntl(s,F_GETFL,0);return flags>=0&&fcntl(s,F_SETFL,flags|O_NONBLOCK)==0;
#endif
}
static int send_some(EWSocket s,const uint8_t *p,size_t n){
#ifdef _WIN32
 return send(s,(const char *)p,(int)n,0);
#else
 return (int)send(s,p,n,MSG_NOSIGNAL);
#endif
}
static int equal_ci(const char *a,const char *b){while(*a&&*b){unsigned x=(unsigned char)*a++,y=(unsigned char)*b++;if(x>='A'&&x<='Z')x+=32;if(y>='A'&&y<='Z')y+=32;if(x!=y)return 0;}return *a==*b;}
static int token_ci(char *value,const char *expected){char *at=value;while(at&&*at){char *end=strchr(at,',');if(end)*end=0;while(*at==' '||*at=='\t')at++;char *tail=at+strlen(at);while(tail>at&&(tail[-1]==' '||tail[-1]=='\t'))*--tail=0;if(equal_ci(at,expected))return 1;at=end?end+1:NULL;}return 0;}
EWChannel *ew_channel_new(void){EWChannel *c=calloc(1,sizeof(*c));if(!c)return NULL;c->socket=EW_BAD;c->buffer=malloc(EW_FRAME_BYTES+14);c->message=malloc(EW_FRAME_BYTES);if(!c->buffer||!c->message){ew_channel_free(c);return NULL;}return c;}
static int write_all(EWSocket s,const char *p,size_t n,uint64_t until){while(n){uint64_t now=ew_millis();if(now>=until||!ready(s,1,(unsigned)(until-now)))return 0;int k=send_some(s,(const uint8_t *)p,n);if(k<0&&would_block())continue;if(k<=0)return 0;p+=k;n-=(size_t)k;}return 1;}
int ew_channel_open(EWChannel *c,const char *url){
 unsigned port;const char *path;if(c->used||!ew_launcher_url(url,&port,&path))return 0;c->used=1;
#ifdef _WIN32
 WSADATA data;if(WSAStartup(MAKEWORD(2,2),&data))return 0;c->winsock_started=1;
#endif
 c->socket=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);if(c->socket==EW_BAD||!nonblocking(c->socket))goto fail;
 struct sockaddr_in address;memset(&address,0,sizeof(address));address.sin_family=AF_INET;address.sin_port=htons((uint16_t)port);address.sin_addr.s_addr=htonl(0x7f000001);
 uint64_t until=ew_millis()+5000;int connected=connect(c->socket,(struct sockaddr *)&address,sizeof(address));
#ifdef _WIN32
 if(connected!=0&&WSAGetLastError()!=WSAEWOULDBLOCK)goto fail;
#else
 if(connected!=0&&errno!=EINPROGRESS)goto fail;
#endif
 if(connected!=0){int error=0;
#ifdef _WIN32
 int size=sizeof(error);
#else
 socklen_t size=sizeof(error);
#endif
 if(!ready(c->socket,1,5000)||getsockopt(c->socket,SOL_SOCKET,SO_ERROR,(char *)&error,&size)!=0||error)goto fail;}
 uint8_t nonce[16],accepted[20];char key[25],challenge[61],expected[29];if(!random_bytes(nonce,sizeof(nonce)))goto fail;base64(nonce,16,key);
 snprintf(challenge,sizeof(challenge),"%s258EAFA5-E914-47DA-95CA-C5AB0DC85B11",key);sha1((const uint8_t *)challenge,60,accepted);base64(accepted,20,expected);
 char request[2304];int n=snprintf(request,sizeof(request),"GET %s HTTP/1.1\r\nHost: 127.0.0.1:%u\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n",path,port,key);if(n<0||(size_t)n>=sizeof(request)||!write_all(c->socket,request,(size_t)n,until))goto fail;
 char header[16385];size_t used=0;while(used<sizeof(header)-1){uint64_t now=ew_millis();if(now>=until||!ready(c->socket,0,(unsigned)(until-now)))goto fail;int k=recv(c->socket,header+used,1,0);if(k<0&&would_block())continue;if(k!=1)goto fail;if(header[used]==0)goto fail;used++;if(used>=4&&!memcmp(header+used-4,"\r\n\r\n",4))break;}header[used]=0;
 if(used<4||memcmp(header+used-4,"\r\n\r\n",4))goto fail;char *line=strstr(header,"\r\n");if(!line)goto fail;*line=0;if(strncmp(header,"HTTP/1.1 101",12)||!(header[12]==0||header[12]==' '))goto fail;
 int upgrade=0,connection=0,accept=0;line+=2;while(*line){char *end=strstr(line,"\r\n");if(!end)goto fail;*end=0;if(!*line)break;char *colon=strchr(line,':');if(!colon||line[0]==' '||line[0]=='\t')goto fail;*colon++=0;while(*colon==' '||*colon=='\t')colon++;char *tail=colon+strlen(colon);while(tail>colon&&(tail[-1]==' '||tail[-1]=='\t'))*--tail=0;
  if(equal_ci(line,"Upgrade")){if(upgrade++||!equal_ci(colon,"websocket"))goto fail;}
  else if(equal_ci(line,"Connection")){if(connection++||!token_ci(colon,"Upgrade"))goto fail;}
  else if(equal_ci(line,"Sec-WebSocket-Accept")){if(accept++||strcmp(colon,expected))goto fail;}
  else if(equal_ci(line,"Sec-WebSocket-Extensions")||equal_ci(line,"Sec-WebSocket-Protocol"))goto fail;
  line=end+2;
 }if(upgrade!=1||connection!=1||accept!=1)goto fail;c->opened=1;return 1;
fail:ew_channel_close(c);return 0;
}
static int enqueue(EWChannel *c,unsigned opcode,const uint8_t *p,size_t n){
 size_t charged=opcode==1?n:0;
 if(c->socket==EW_BAD||n>EW_FRAME_BYTES||c->queued_frames>=1000||c->queued_payload>EW_FRAME_BYTES-charged)return 0;
 size_t header=n<126?2:n<=65535?4:10;EWFrame *f=malloc(sizeof(*f)+header+4+n);if(!f)return 0;f->next=NULL;f->bytes=header+4+n;f->sent=0;f->payload=charged;f->data[0]=(uint8_t)(0x80|opcode);f->data[1]=(uint8_t)(0x80|(n<126?n:n<=65535?126:127));if(header==4){f->data[2]=(uint8_t)(n>>8);f->data[3]=(uint8_t)n;}else if(header==10){for(unsigned j=0;j<8;j++)f->data[2+j]=(uint8_t)((uint64_t)n>>(56-j*8));}
 if(!random_bytes(f->data+header,4)){free(f);return 0;}for(size_t j=0;j<n;j++)f->data[header+4+j]=p[j]^f->data[header+j%4];
 if(c->last)c->last->next=f;else c->first=f;c->last=f;c->queued_payload+=charged;c->queued_frames++;return 1;
}
int ew_channel_send(EWChannel *c,const uint8_t *p,size_t n){return ew_valid_utf8(p,n)&&enqueue(c,1,p,n);}
static int flush(EWChannel *c){
 while(c->first){EWFrame *f=c->first;int n=send_some(c->socket,f->data+f->sent,f->bytes-f->sent);if(n<0&&would_block())return 1;if(n<=0)return 0;f->sent+=(size_t)n;if(f->sent<f->bytes)return 1;c->first=f->next;if(!c->first)c->last=NULL;c->queued_payload-=f->payload;c->queued_frames--;free(f);}return 1;
}
static void finish(EWChannel *c,const uint8_t *payload,size_t length){if(c->socket!=EW_BAD&&enqueue(c,8,payload,length)){uint64_t until=ew_millis()+500;while(c->first&&ew_millis()<until){if(!flush(c))break;if(c->first&&!ready(c->socket,1,10))continue;}}ew_channel_close(c);}
void ew_channel_finish(EWChannel *c){const uint8_t normal[2]={3,232};finish(c,normal,2);}
int ew_channel_poll(EWChannel *c,unsigned wait,EWEvent event,void *opaque){
 if(c->socket==EW_BAD)return 0;if(c->opened){c->opened=0;event(opaque,"open",NULL,0);if(c->socket==EW_BAD)return 0;}
 if(!flush(c))goto fail;
 if(!ready(c->socket,0,wait))return 1;
 int got=recv(c->socket,(char *)c->buffer+c->buffered,(int)(EW_FRAME_BYTES+14-c->buffered),0);if(got<0&&would_block())return 1;if(got<=0)goto fail;c->buffered+=(size_t)got;
 while(c->buffered>=2){
  uint8_t *p=c->buffer;unsigned fin=p[0]>>7,opcode=p[0]&15;size_t header=2;uint64_t length=p[1]&127;if((p[0]&0x70)||(p[1]&0x80))goto fail;
  if(length==126){if(c->buffered<4)break;length=(uint64_t)p[2]<<8|p[3];header=4;if(length<126)goto fail;}else if(length==127){if(c->buffered<10)break;if(p[2]&0x80)goto fail;length=0;for(unsigned j=0;j<8;j++)length=(length<<8)|p[2+j];header=10;if(length<65536)goto fail;}
  if(length>EW_FRAME_BYTES||((opcode&8)&&(!fin||length>125)))goto fail;if(c->buffered<header+(size_t)length)break;const uint8_t *data=p+header;
  if(opcode==8){if(length==1)goto fail;if(length>=2){unsigned code=(unsigned)data[0]<<8|data[1];if(!((code>=1000&&code<=1014&&code!=1004&&code!=1005&&code!=1006)||(code>=3000&&code<=4999))||!ew_valid_utf8(data+2,(size_t)length-2))goto fail;}finish(c,data,(size_t)length);event(opaque,"close",NULL,0);return 0;}
  else if(opcode==9){if(!enqueue(c,10,data,(size_t)length))goto fail;}
  else if(opcode==10){}
  else if(opcode==0||opcode==1){if((opcode==0&&!c->fragmented)||(opcode==1&&c->fragmented)||c->message_bytes>EW_FRAME_BYTES-(size_t)length)goto fail;memcpy(c->message+c->message_bytes,data,(size_t)length);c->message_bytes+=(size_t)length;c->fragmented=!fin;if(fin){if(!ew_valid_utf8(c->message,c->message_bytes))goto fail;event(opaque,"message",c->message,c->message_bytes);c->message_bytes=0;if(c->socket==EW_BAD)return 0;}}
  else goto fail;
  size_t consumed=header+(size_t)length;c->buffered-=consumed;memmove(c->buffer,c->buffer+consumed,c->buffered);
 }return 1;
fail:ew_channel_close(c);event(opaque,"error",NULL,0);return -1;
}
void ew_channel_close(EWChannel *c){if(!c)return;if(c->socket!=EW_BAD){ew_socket_close(c->socket);c->socket=EW_BAD;}while(c->first){EWFrame *f=c->first;c->first=f->next;free(f);}c->last=NULL;c->queued_frames=c->queued_payload=0;}
void ew_channel_free(EWChannel *c){if(!c)return;ew_channel_close(c);free(c->buffer);free(c->message);
#ifdef _WIN32
 if(c->winsock_started)WSACleanup();
#endif
 free(c);}
