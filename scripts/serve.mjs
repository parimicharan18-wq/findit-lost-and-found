import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const base = resolve(process.argv[2] || 'dist');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const requested = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const file = resolve(base, `.${requested}`);
    const relativeFile = file.slice(base.length);
    if (relativeFile.startsWith(`${sep}..`) || !file.startsWith(`${base}${sep}`)) throw new Error('bad path');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    response.writeHead(200, { 'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'Cache-Control':'no-store' });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8', 'X-Content-Type-Options':'nosniff' });
    response.end('Not found');
  }
});
server.listen(4173, '127.0.0.1', () => console.log('FindIt preview available at http://127.0.0.1:4173'));
