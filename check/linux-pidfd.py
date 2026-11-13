"""Trusted one-shot pidfd signal. No numeric-PID kill fallback or inherited credentials."""
import json, os, signal, sys
from pathlib import Path

class NativePidfd:
    def __init__(self):
        if sys.platform!='linux' or not hasattr(os,'pidfd_open') or not hasattr(signal,'pidfd_send_signal'):raise RuntimeError('PIDFD_UNAVAILABLE')
    def identity(self,pid):
        text=Path('/proc/%d/stat'%pid).read_text();end=text.rfind(')');fields=text[end+2:].split()
        if end<0 or len(fields)<20:raise RuntimeError('IDENTITY_INVALID')
        return {'pid':int(text.split(' ',1)[0]),'startTicks':fields[19],'namespace':os.readlink('/proc/%d/ns/pid'%pid)}
    def open(self,pid):return os.pidfd_open(pid,0)
    def send(self,fd,number):signal.pidfd_send_signal(fd,number,None,0)
    def close(self,fd):os.close(fd)

def owned_signal(expected,number,api=None):
    if set(expected)!= {'pid','startTicks','namespace'} or type(expected['pid']) is not int or expected['pid']<1 or not isinstance(expected['startTicks'],str) or not expected['startTicks'].isdigit() or not isinstance(expected['namespace'],str) or number not in [0,signal.SIGTERM,signal.SIGKILL]:raise RuntimeError('SIGNAL_INPUT_INVALID')
    api=api or NativePidfd();fd=None
    try:
        if api.identity(expected['pid'])!=expected:raise RuntimeError('SIGNAL_IDENTITY_REFUSED')
        fd=api.open(expected['pid'])
        # Opening can race PID exit/reuse. Refuse unless the opened handle and current record bind.
        if api.identity(expected['pid'])!=expected:raise RuntimeError('SIGNAL_IDENTITY_REFUSED')
        api.send(fd,number)
        return 'OWNED_SIGNAL_SENT'
    except ProcessLookupError:return 'OWNED_ALREADY_EXITED'
    except FileNotFoundError:return 'OWNED_ALREADY_EXITED'
    finally:
        if fd is not None:api.close(fd)

if __name__=='__main__':
    try:
        if sys.argv[1:]==['capability']:
            api=NativePidfd();expected=api.identity(os.getpid());status=owned_signal(expected,0,api)
            if status!='OWNED_SIGNAL_SENT':raise RuntimeError('PIDFD_UNAVAILABLE')
            print('{"status":"PIDFD_AVAILABLE"}')
        elif len(sys.argv)==4 and sys.argv[1]=='signal':
            expected=json.loads(sys.argv[2]);number={'TERM':signal.SIGTERM,'KILL':signal.SIGKILL}[sys.argv[3]]
            print(json.dumps({'status':owned_signal(expected,number)}))
        else:raise RuntimeError('SIGNAL_INPUT_INVALID')
    except BaseException:
        print('{"status":"PIDFD_REFUSED"}');sys.exit(1)
