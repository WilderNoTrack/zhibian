// Explicit, opt-in smoke check against the running real local service.
// Run: node tests/live-smoke.mjs (may consume up to one uncached Zhihu search).
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:5173';
const nativeFetch = globalThis.fetch;
const dom = new JSDOM(await readFile(new URL('../web/index.html', import.meta.url), 'utf8'), { url: base });
dom.window.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.fetch = (url, options) => nativeFetch(new URL(url, base), options);
try {
  await import('../web/app.js');
  for (let i = 0; i < 500 && !document.querySelector('.opinion-card, .error-state, .reading-room'); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(document.querySelector('.opinion-card'), document.querySelector('main').textContent);
  assert.equal(document.querySelectorAll('.seat').length, 6);
  assert.doesNotMatch(document.querySelector('main').textContent, /示例人物|虚构示例/);
  console.log(JSON.stringify({
    title: document.querySelector('h1').textContent,
    authors: [...document.querySelectorAll('.seat-person b')].map(el => el.textContent),
    quotes: [...document.querySelectorAll('.opinion-title')].map(el => el.textContent),
    provenance: document.querySelector('.provenance').textContent,
    note: 'Real API-to-DOM smoke check only; not browser visual verification.'
  }, null, 2));
} finally {
  globalThis.fetch = nativeFetch;
  dom.window.close(); delete globalThis.document; delete globalThis.window;
}
