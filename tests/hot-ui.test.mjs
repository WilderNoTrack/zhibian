import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { publicCatalog } from '../scripts/catalog.mjs';

test('the featured debate stays inside the lobby and the UI never asks for a raw hot-list', async () => {
  const dom = new JSDOM(await readFile(new URL('../web/index.html', import.meta.url), 'utf8'), { url: 'http://localhost/topics' });
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  let hotRequests = 0;
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  dom.window.scrollTo = () => {};
  globalThis.fetch = async url => {
    // The raw hot list is a server-side concern; the interface must render the
    // curated feature instead of listing outbound hot links itself.
    if (String(url).includes('/api/hot')) hotRequests++;
    if (url === '/api/topics') return { ok: true, json: async () => ({ topics: publicCatalog }) };
    if (String(url).startsWith('/api/preview')) return { ok: true, json: async () => ({ id: '', preview: null }) };
    assert.fail(`unexpected UI request: ${url}`);
  };
  async function until(fn) { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 5)); } assert.fail('UI timeout'); }
  try {
    await import('../web/app.js');
    await until(() => document.querySelector('#featured-carousel [data-id="today-hot"]'));
    document.querySelector('.category-link[data-category="tech"]').click();
    assert.equal(document.querySelector('h1').textContent, '科技与 AI');
    assert.equal(document.querySelector('#featured-carousel'), null, 'a category page drops the carousel');
    document.querySelector('[data-action="topics"]').click();
    await until(() => document.querySelector('#featured-carousel [data-id="today-hot"]'));
    assert.equal(hotRequests, 0, 'the interface never requests the raw hot list');
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; dom.window.close(); delete globalThis.window; delete globalThis.document; }
});
