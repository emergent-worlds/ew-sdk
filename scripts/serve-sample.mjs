// Disposable browser fixture, separate from the folder that would be published.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root = new URL('../', import.meta.url);
await mkdir(new URL('check/build/', root), { recursive: true });
await build({ entryPoints: [fileURLToPath(new URL('check/frame-host.ts', root))], outfile: fileURLToPath(new URL('check/build/host.js', root)), bundle: true, format: 'esm', platform: 'browser' });
const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  if (request.url === '/favicon.ico') { response.statusCode = 204; response.end(); return; }
  if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Kestrel Yards browser fixture</title><style>body{margin:0}iframe{width:100vw;height:92vh;border:0}</style><iframe title="Kestrel Yards" sandbox="allow-scripts" src="/web/index.html"></iframe><button>Change fixture theme</button><output></output><script type="module" src="/check-host.js"></script>'); return;
  }
  const path = request.url === '/check-host.js' ? new URL('check/build/host.js', root) : /^\/web\/[a-z.-]+$/.test(request.url ?? '') ? new URL(`sample/build${request.url}`, root) : undefined;
  if (!path) { response.statusCode = 404; response.end(); return; }
  try { const data = await readFile(path); response.setHeader('Content-Type', path.pathname.endsWith('.js') ? 'application/javascript' : path.pathname.endsWith('.css') ? 'text/css' : 'text/html'); response.end(data); }
  catch { response.statusCode = 404; response.end(); }
});
server.listen(0, '127.0.0.1', () => console.log(`Kestrel browser fixture http://127.0.0.1:${server.address().port}/`));
