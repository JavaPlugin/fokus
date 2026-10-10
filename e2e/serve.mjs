// Test-Server für Playwright: liefert den Web-Export aus wie Caddy (try_files {path} {path}.html
// {path}/index.html /index.html) und reicht /api an die API weiter (gleiche Herkunft wie in
// Produktion). /__bump ändert sw.js, damit der Test ein Update simulieren kann. Keine Abhängigkeit.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { createGzip } from 'node:zlib';
import { extname, join, normalize } from 'node:path';

const root = join(import.meta.dirname, '..', 'apps', 'web', 'dist');
const port = Number(process.env.WEB_PORT ?? 4173);
const api = Number(process.env.API_PORT ?? 3100);
let bump = 0;
const CSP =
  "default-src 'self'; script-src 'self' 'sha256-67fhrP0+BkBqmgGGXTtgiVO/9EQs3QruYNU/7fnRkI8='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function file(path) {
  const clean = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, '');
  for (const p of [clean, `${clean}.html`, join(clean, 'index.html'), 'index.html']) {
    const full = join(root, p);
    if (!full.startsWith(root)) continue;
    if (existsSync(full) && statSync(full).isFile()) return full;
  }
  return null;
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  // wie Caddy: robots.txt und sitemap.xml kommen von der API
  if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml')
    req.url = `/api/seo${url.pathname}`;
  if (url.pathname.startsWith('/api/') || req.url.startsWith('/api/seo/')) {
    const fwd = request(
      { host: '127.0.0.1', port: api, path: req.url, method: req.method, headers: req.headers },
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      },
    );
    fwd.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(fwd);
    return;
  }
  if (url.pathname === '/__bump') {
    bump++;
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(String(bump));
    return;
  }
  const full = file(url.pathname);
  if (!full) {
    res.writeHead(404);
    res.end();
    return;
  }
  const headers = { 'content-type': types[extname(full)] ?? 'application/octet-stream' };
  // Dieselbe Content-Security-Policy wie in deploy/Caddyfile: die Tests laufen mit ihr
  if (extname(full) === '.html') headers['content-security-policy'] = CSP;
  if (url.pathname === '/sw.js') {
    // Neue Version simulieren: anderer Inhalt = neuer Service Worker
    headers['cache-control'] = 'no-cache';
    res.writeHead(200, headers);
    const s = createReadStream(full);
    s.on('end', () => res.end(`\n// bump ${bump}\n`));
    s.pipe(res, { end: false });
    return;
  }
  // Wie Caddy: komprimiert und gehashte Dateien lange im Cache
  if (url.pathname.startsWith('/_expo/static/'))
    headers['cache-control'] = 'public, max-age=31536000, immutable';
  if (
    /gzip/.test(req.headers['accept-encoding'] ?? '') &&
    /text|javascript|json|svg|xml/.test(headers['content-type'])
  ) {
    headers['content-encoding'] = 'gzip';
    res.writeHead(200, headers);
    createReadStream(full).pipe(createGzip()).pipe(res);
    return;
  }
  res.writeHead(200, headers);
  createReadStream(full).pipe(res);
}).listen(port, '127.0.0.1', () => console.info(`Test-Server auf http://127.0.0.1:${port}`));
