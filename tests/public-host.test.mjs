// Host and origin checks for a deployment behind a TLS-terminating proxy.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.ZHIBIAN_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'zhibian-host-'));
process.env.ZHIBIAN_PUBLIC_HOSTS = 'zhibian.example.test';
const { createRequestHandler } = await import('../scripts/serve.mjs');

let server, port;
before(async () => {
  server = http.createServer(createRequestHandler({
    hot: async () => ({ Code: 0, Data: { Items: [] } }),
    summarize: async () => ({ summary: '摘要。', model: 'stub' })
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
after(() => new Promise(resolve => server.close(resolve)));

function request(pathname, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method: body ? 'POST' : 'GET', headers }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    if (body) req.end(body); else req.end();
  });
}
const summarize = JSON.stringify({ sourceId: 'a1', text: '一段回答正文。' });

test('loopback keeps working as before', async () => {
  assert.equal(await request('/topics', { Host: `localhost:${port}` }), 200);
});

test('the configured public domain can load pages', async () => {
  assert.equal(await request('/topics', { Host: 'zhibian.example.test' }), 200);
});

test('an unlisted host is still refused', async () => {
  assert.equal(await request('/topics', { Host: 'evil.example.test' }), 403);
});

test('an https page on the public domain may POST to the API through the proxy', async () => {
  assert.equal(await request('/api/summarize', { Host: 'zhibian.example.test', Origin: 'https://zhibian.example.test', 'Content-Type': 'application/json' }, summarize), 200);
});

test('a different origin is refused even on the public domain', async () => {
  assert.equal(await request('/api/summarize', { Host: 'zhibian.example.test', Origin: 'https://evil.example.test', 'Content-Type': 'application/json' }, summarize), 403);
  assert.equal(await request('/api/summarize', { Host: 'zhibian.example.test', 'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'application/json' }, summarize), 403);
});
