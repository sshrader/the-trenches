// The main synxer.dev page, served by the same server as the game. Requests whose Host is in SITE_HOSTS get the files in
// /site (index.html, avatar, logo); every other host (frontline.synxer.dev, the Railway address, ...) gets the game.
import path from 'node:path';
import fs from 'node:fs/promises';

const hosts = new Set((process.env.SITE_HOSTS ?? 'synxer.dev,www.synxer.dev').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
const DIR = path.resolve(process.env.SITE_DIR || 'site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };

export const isSiteHost = (host) => hosts.has(String(host || '').toLowerCase().replace(/:\d+$/, ''));

/** Middleware (Express or plain `http`): answers for the main-site hosts and leaves everything else to the game. */
export async function siteMiddleware(req, res, next) {
  if (!isSiteHost(req.headers.host)) return next();
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    return res.end();
  }
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    rel = '/';
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(DIR, path.normalize(rel));
  if (!file.startsWith(DIR + path.sep) || path.basename(file).startsWith('.')) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  try {
    const data = await fs.readFile(file);
    res.setHeader('content-type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('cache-control', 'public, max-age=300');
    res.statusCode = 200;
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.statusCode = 404;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('Not found');
  }
}
