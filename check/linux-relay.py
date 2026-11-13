"""Trusted namespace relay. Any ceiling latches failure and drains its owned artifact."""
import asyncio, importlib.util, json, os, signal, sys

async def main():
    if len(sys.argv)!=4:raise RuntimeError('fixed relay arguments required')
    entry,port_text,socket_path=sys.argv[1:];port=int(port_text)
    if not 1<=port<=65535 or not entry.startswith('/artifact/') or socket_path!='/control/sdk.sock':raise RuntimeError('invalid relay boundary')
    spec=importlib.util.spec_from_file_location('trusted_pidfd','/control/pidfd.py');pidfd=importlib.util.module_from_spec(spec);spec.loader.exec_module(pidfd)
    api=pidfd.NativePidfd() # Refuses unsupported signal primitives before uploaded code.
    streams=set();connections=0;total=0;failed=asyncio.get_running_loop().create_future()
    def latch(code):
        if not failed.done():failed.set_result(code);print(json.dumps({'relayFailure':code}),flush=True)
        for stream in tuple(streams):stream.close()
    async def relay(reader,writer):
        nonlocal connections,total
        connections+=1
        if connections>4:latch('connection_cap');writer.close();return
        streams.add(writer);peer=None
        try:
            remote,peer=await asyncio.open_unix_connection(socket_path);streams.add(peer)
            async def copy(source,destination):
                nonlocal total
                while True:
                    data=await source.read(16384)
                    if not data:return
                    total+=len(data)
                    if total>64*1024*1024:latch('byte_cap');return
                    destination.write(data);await destination.drain()
            tasks=[asyncio.create_task(copy(reader,peer)),asyncio.create_task(copy(remote,writer))]
            await asyncio.wait(tasks,return_when=asyncio.FIRST_COMPLETED)
            for task in tasks:task.cancel()
            await asyncio.gather(*tasks,return_exceptions=True)
        finally:
            for stream in [writer,peer]:
                if stream:stream.close();streams.discard(stream)
    server=await asyncio.start_server(relay,'127.0.0.1',port,limit=65536)
    env={k:os.environ[k]for k in ['HOME','TMPDIR','EW_SDK_URL','EW_SDK_TOKEN','EW_SDK_CHECK']}
    child=await asyncio.create_subprocess_exec(entry,stdin=asyncio.subprocess.DEVNULL,stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.DEVNULL,env=env,close_fds=True)
    wait=asyncio.create_task(child.wait());expected=None
    try:
        try:expected=api.identity(child.pid)
        except FileNotFoundError:return await wait
        done,_=await asyncio.wait([wait,failed],return_when=asyncio.FIRST_COMPLETED)
        if failed in done:
            for number in [signal.SIGTERM,signal.SIGKILL]:
                pidfd.owned_signal(expected,number,api)
                try:await asyncio.wait_for(asyncio.shield(wait),2);break
                except asyncio.TimeoutError:pass
            if not wait.done():raise RuntimeError('owned artifact drain unconfirmed')
            return 1
        return await wait
    finally:
        server.close();await server.wait_closed()
        for stream in tuple(streams):stream.close()

if __name__=='__main__':sys.exit(asyncio.run(main()))
