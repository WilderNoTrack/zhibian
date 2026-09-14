// Archived classic frontend (web-classic/). Kept so the previous interface can
// still be started side by side on its own port; it hands every /api/ request to
// the same handler as the main app, so data rules never fork.
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('./', import.meta.url)));
const port = Number(process.env.CLASSIC_UI_PORT || 5175);
const pages = new Set(['/', '/topics', '/library', '/debate', '/search']);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

async function serveStatic(req, res) {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + (pages.has(pathname) ? '/index.html' : pathname));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': mime[path.extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://*.zhimg.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
      'Referrer-Policy': 'no-referrer'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 400);
    res.end('Not found');
  }
}

export function createZhihuUiHandler(apiHandler) {
  return (req, res) => {
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); res.end('仅限本机访问。'); return; }
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { res.writeHead(400); res.end(); return; }
    return pathname.startsWith('/api/') ? apiHandler(req, res) : serveStatic(req, res);
  };
}

// Same .env rules as serve.mjs: only when started directly, real env wins.
async function loadLocalEnv() {
  try {
    const text = await readFile(path.resolve(root, '..', '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match || match[1] in process.env) continue;
      process.env[match[1]] = match[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    }
  } catch { /* No local .env: use the ambient environment. */ }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await loadLocalEnv();
  // Imported after .env so modules that read configuration at load time see it.
  const { handleRequest } = await import('../scripts/serve.mjs');
  http.createServer(createZhihuUiHandler(handleRequest)).listen(port, '127.0.0.1', () => {
    console.log('Zhibian (classic UI): http://localhost:' + port + '/topics');
  });
}
