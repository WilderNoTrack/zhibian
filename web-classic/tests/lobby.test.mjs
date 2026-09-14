import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.ZHIBIAN_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'zhibian-lobby-'));
const { createRequestHandler } = await import('../../scripts/serve.mjs');

test('opening or refreshing a category URL renders its list without loading a debate', async () => {
  let searchCalls = 0;
  const server = http.createServer(createRequestHandler({ search: async () => {
    searchCalls++; throw new Error('Browsing the catalog must not query Zhihu.');
  } }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const dom = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'), { url: base + '/topics?category=work' });
  const originalFetch = globalThis.fetch;
  let debateRequests = 0;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  dom.window.scrollTo = () => {};
  globalThis.fetch = (url, options) => {
    if (url.startsWith('/api/debate')) debateRequests++;
    return originalFetch(new URL(url, base), options);
  };
  try {
    await import('../app.js');
    for (let i = 0; i < 100 && !document.querySelector('.lobby-topic'); i++) await new Promise(r => setTimeout(r, 10));
    assert.equal(document.querySelector('h1').textContent, '职场与生存');
    assert.ok(document.querySelectorAll('.lobby-topic').length >= 3, 'the curated topics are listed; AI ones may join them');
    assert.match(document.querySelector('.lobby-topic').href, /\/debate\?id=career$/);
    assert.equal(debateRequests, 0);
    assert.equal(searchCalls, 0);
    assert.equal(document.querySelector('dialog').open, false);
    dom.window.history.replaceState({}, '', '/topics?category=unknown');
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
    assert.match(document.querySelector('h1').textContent, /还没有这个分类/);
    assert.equal(document.querySelectorAll('.lobby-topic').length, 0);
    assert.equal(searchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    dom.window.close(); delete globalThis.window; delete globalThis.document;
    await new Promise(resolve => server.close(resolve));
  }
});
