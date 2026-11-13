"""Trusted per-job network setup. No host namespace or global rule is ever configured."""
import ctypes, errno, hashlib, json, os, re, runpy, subprocess, sys

def fail():
    raise RuntimeError('OWNED_NETWORK_SETUP_REFUSED')

def normalized(rows):
    # Numeric/symbolic JSON spellings select the same exact kernel protocol/type.
    protocols={'tcp':6,'ipv6-icmp':58,'icmpv6':58}
    control={'nd-router-solicit':133,'nd-router-advert':134,'nd-neighbor-solicit':135,'nd-neighbor-advert':136}
    result=[]
    for row in rows:
        if set(row)=={'metainfo'}:continue
        if len(row)!=1:fail()
        kind,value=next(iter(row.items()))
        if kind not in ('table','chain','rule') or not isinstance(value,dict):fail()
        value={k:v for k,v in value.items() if k!='handle' and not(k=='flags' and v==[])}
        if kind=='rule':
            value=json.loads(json.dumps(value))
            for expression in value.get('expr',[]):
                match=expression.get('match')
                if not isinstance(match,dict):continue
                left=match.get('left')
                if left=={'meta':{'key':'l4proto'}} and isinstance(match.get('right'),str):match['right']=protocols.get(match['right'],match['right'])
                if left=={'payload':{'protocol':'icmpv6','field':'type'}}:
                    right=match.get('right')
                    if isinstance(right,dict) and set(right)=={'set'}:right['set']=[control.get(v,v) if isinstance(v,str) else v for v in right['set']]
        result.append({kind:value})
    return result

def drop_capabilities():
    libc=ctypes.CDLL(None,use_errno=True)
    # Existing rights are scoped to this already-owned user/network namespace.
    if libc.prctl(28,0xcf,0,0,0)!=0 or libc.prctl(38,1,0,0,0)!=0:fail()
    if libc.prctl(47,4,0,0,0)!=0:fail()
    for cap in range(64):
        if libc.prctl(24,cap,0,0,0)!=0 and ctypes.get_errno()!=errno.EINVAL:fail()
    class Header(ctypes.Structure):_fields_=[('version',ctypes.c_uint32),('pid',ctypes.c_int)]
    class Data(ctypes.Structure):_fields_=[('effective',ctypes.c_uint32),('permitted',ctypes.c_uint32),('inheritable',ctypes.c_uint32)]
    header=Header(0x20080522,0);data=(Data*2)()
    if libc.capset(ctypes.byref(header),ctypes.byref(data))!=0:fail()
    values=dict(line.split(':',1) for line in open('/proc/self/status',encoding='ascii') if ':' in line)
    if any(int(values[key].strip(),16)!=0 for key in ('CapEff','CapPrm','CapInh','CapBnd','CapAmb')) or values.get('NoNewPrivs','').strip()!='1':fail()

def setup():
    if len(sys.argv)!=4 or sys.argv[3]!='/control/sdk.sock':fail()
    with open('/control/network.json',encoding='utf8') as f:
        raw=f.read(1024*1024+1)
    if len(raw)>1024*1024:fail()
    config=json.loads(raw)
    if set(config)!=set(('hostNamespace','commands','policySHA256')) or not re.fullmatch(r'net:\[\d+\]',config['hostNamespace']) or os.readlink('/proc/self/ns/net')==config['hostNamespace'] or not re.fullmatch('[a-f0-9]{64}',config['policySHA256']):fail()
    # The parent starts only its owned existing slirp tool and confirms its actual ready FD first.
    if sys.stdin.buffer.readline(64)!=b'NETWORK_READY\n':fail()
    initial=subprocess.run(['/usr/bin/nft','-j','list','ruleset'],capture_output=True,check=True,timeout=2,env={})
    if len(initial.stdout)>1024*1024 or normalized(json.loads(initial.stdout)['nftables']):fail()
    commands=config['commands'];expected=[]
    for row in commands['nftables']:
        if set(row)!={'add'}:fail()
        value=row['add']
        if len(value)!=1:fail()
        kind,body=next(iter(value.items()))
        if kind not in ('table','chain','rule') or body.get('family')!='inet' or (body.get('name') if kind=='table' else body.get('table'))!='ew_check':fail()
        expected.append(value)
    subprocess.run(['/usr/bin/nft','-j','-f','-'],input=json.dumps(commands).encode(),capture_output=True,check=True,timeout=2,env={})
    observed=subprocess.run(['/usr/bin/nft','-j','-n','list','ruleset'],capture_output=True,check=True,timeout=2,env={})
    if len(observed.stdout)>1024*1024 or normalized(json.loads(observed.stdout)['nftables'])!=normalized(expected):fail()
    drop_capabilities()
    with os.fdopen(3,'w',encoding='ascii') as status:
        status.write(json.dumps({'policySHA256':config['policySHA256'],'nftReadback':True,'capabilitiesDropped':True})+'\n');status.flush()
    # The unchanged relay retains its original SDK connection/byte caps and owned pidfd drain.
    runpy.run_path('/control/relay.py',run_name='__main__')

if __name__=='__main__':
    try:setup()
    except SystemExit:
        raise
    except BaseException:
        # No exception body, paths, commands, values or credentials leave this boundary.
        try:os.write(3,b'{"refused":"OWNED_NETWORK_SETUP_REFUSED"}\n')
        except OSError:pass
        raise SystemExit(1)
