// A tiny static file server: `npm start` (the app at http://127.0.0.1:8080/) and the browser checks.
//   node scripts/serve.mjs [dir] [port]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, normalize } from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };

// `prefix` ('/preview'): the site answers under that path as well (the gallery page runs only on the preview copy, by its address).
export function serve(dir, port = 0, { prefix = '' } = {}) {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    try {
      let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (prefix && (p === prefix || p.startsWith(`${prefix}/`))) p = p.slice(prefix.length) || '/';
      if (p.endsWith('/')) p += 'index.html';
      const file = join(root, p);
      if (!file.startsWith(root) || !(await stat(file)).isFile()) throw new Error('not found');
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404); res.end('Not found');
    }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${server.address().port}${prefix}/`, close: () => server.close() })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await serve(process.argv[2] || '.', Number(process.argv[3] || 8080));
  console.log(`Serving ${process.argv[2] || '.'} at ${s.url}`);
}
