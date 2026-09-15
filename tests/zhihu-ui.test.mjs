// DOM integration tests for the app frontend (web/). Not a
// substitute for browser layout checks.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';

process.env.ZHIBIAN_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'zhibian-zhihu-ui-'));
const { createRequestHandler } = await import('../scripts/serve.mjs');

let dom, server, doc, base;
const realFetch = globalThis.fetch;
const newSources = JSON.parse(await readFile(new URL('./fixtures/editorial-sources.json', import.meta.url), 'utf8'));
const item = (id, name, text, extra = {}) => ({ ContentType: 'Answer', ContentID: id, Title: '测试来源问题 - 知乎',
  Url: `https://www.zhihu.com/question/123/answer/${id}?utm_source=test`, ContentText: text,
  AuthorName: name, AuthorAvatar: '', AuthorBadgeText: '', CommentCount: 0, VoteUpCount: 7, EditTime: 1787582023, ...extra });
const parenting = [
  item('2078831272391075654', '星澜', '说实话，没有人给我开工资。但我依然享受在其中，乐在其中。', {AuthorBadgeText: '心理咨询师'}),
  item('2078402735305762660', '鑫妈辅娃记', '不是不爱孩子，恰恰是因为爱，才不敢轻易把自己全部牺牲进去。'),
  item('2075350106732224981', '晓君养娃日记', '可以，看自己的家庭条件和自己的选择。\n我是全职带娃，产假结束就没去上班了，现在一个人带娃，老公一个人上班养我们两个。'),
  item('2077701953874814493', '水刃木', '这个问题，不管怎么选，都不需要扯什么母爱不母爱的角度，直接从家庭利益角度出发做选择。'),
  item('2078753903634540148', '元来时你', '3、没人帮衬，或者帮衬的人并不专业，那就全职带娃 ，自己上手。'),
  item('2034279333792044550', '橙子汽水', '以一个过来人的经验建议你，不到万不得已，千万不要辞掉还不错的工作，千万不要全职在家带孩子。')
];
async function until(predicate, label) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 10)); }
  assert.fail('UI did not reach expected state' + (label ? ' — ' + label : ''));
}
const click = selector => { const el = doc.querySelector(selector); assert.ok(el, selector); el.click(); };
const submit = selector => doc.querySelector(selector).dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

before(async () => {
  const api = createRequestHandler({
    hot: async () => ({ Code: 0, Data: { Items: [] } }),
    summarize: async () => ({ summary: 'AI 摘要测试：保留回答的条件。第二句给出依据。第三句说明边界。', model: 'test-model' }),
    critique: async input => ({ answer: `围绕“${input.question}”的质询。`, model: 'deepseek-flash' }),
    filter: async input => ({ items: input.items.map(i => ({ id: i.id, relevant: true, reason: '直接相关' })), model: 'deepseek-flash' }),
    expandQueries: async ({ topic }) => ({ queries: [], model: 'stub' }), arrange: async () => { throw Object.assign(new Error('not used'), { status: 503, code: 'AI_NOT_CONFIGURED', message: '未配置' }); },
    search: async query => {
      const reviewed = Object.values(newSources).find(f => f.query === query);
      return reviewed ? reviewed.response : { Code: 0, Data: { Items: parenting } };
    }
  });
  server = http.createServer(api);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  const html = await (await realFetch(base + '/debate?id=parenting')).text();
  dom = new JSDOM(html, { url: base + '/debate?id=parenting' });
  doc = dom.window.document;
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open'); setTimeout(() => this.dispatchEvent(new dom.window.Event('close')), 0);
  };
  globalThis.window = dom.window; globalThis.document = doc;
  globalThis.fetch = (url, options) => realFetch(new URL(url, base), options);
  await import('../web/app.js');
  await until(() => doc.querySelectorAll('.opinion-card').length === 2, 'debate loads');
});
after(async () => {
  globalThis.fetch = realFetch; delete globalThis.document; delete globalThis.window;
  dom.window.close(); await new Promise(r => server.close(r));
});

test('static server serves the isolated frontend and keeps pages on index.html', async () => {
  for (const page of ['/', '/topics', '/library', '/debate', '/search']) {
    const res = await realFetch(base + page);
    assert.equal(res.status, 200, page);
    assert.match(await res.text(), /zhihu\.css/);
  }
  assert.equal((await realFetch(base + '/../scripts/serve.mjs')).status, 404);
});

test('debate page: question header, answer cards, lineup and AI summary', async () => {
  assert.ok(doc.querySelector('.question-header .question-title').textContent.length > 0);
  assert.equal(doc.querySelectorAll('.lineup .seat').length, 6);
  assert.equal(doc.querySelectorAll('.round-tab').length, 3);
  await until(() => doc.querySelector('.ai-summary')?.textContent.includes('AI 摘要测试'), 'summary');
  const summaryText = doc.querySelector('[data-summary-text]').textContent;
  assert.equal(summaryText.split(String.fromCharCode(10)).length, 3, 'each sentence gets its own line');
  assert.match(summaryText, /第一句|保留回答的条件/);
  assert.ok(doc.querySelector('.opinion-card.side-left .opinion-title').textContent.length > 0);
  assert.match(doc.querySelector('.app-nav .nav-active').textContent, /辩论现场/);
});

test('source dialog and AI critique work from an answer card', async () => {
  click('[data-action="source"][data-side="0"]');
  assert.match(doc.querySelector('dialog h2').textContent, /原文与来源/);
  assert.match(doc.querySelector('dialog .source-link').rel, /noopener/);
  click('dialog [data-action="close"]');
  click('[data-action="critic"][data-side="1"]');
  doc.querySelector('#critic-question').value = '前提是什么？';
  submit('.critic-form');
  await until(() => doc.querySelector('[data-critique-result]')?.textContent.includes('前提是什么'), 'critique');
  assert.match(doc.querySelector('[data-critique-result] .analysis-label').textContent, /AI 模拟回应/);
  await until(() => !doc.querySelector('.critic-form button[type="submit"]').disabled, 'button re-enabled');
  assert.match(doc.querySelector('.critic-form button[type="submit"]').textContent, /让它回应/, 'the button keeps its label after a reply');
  click('dialog [data-action="close"]');
});

test('rounds advance to the recap and seats jump back into the arena', () => {
  click('[data-action="next"]');
  assert.match(doc.querySelector('.round-position').textContent, /第 2/);
  click('[data-action="next"]');
  click('[data-action="next"]');
  assert.equal(doc.querySelectorAll('.recap-camp blockquote').length, 6);
  click('.lineup .seat[data-index="1"]');
  assert.equal(doc.querySelectorAll('.opinion-card').length, 2);
  assert.match(doc.querySelector('.round-position').textContent, /第 2/);
});

test('lobby shows the hot carousel, composer and category feed', async () => {
  click('.app-nav [data-action="topics"]');
  await until(() => doc.querySelector('#featured-track'), 'lobby');
  assert.ok(doc.querySelectorAll('.carousel-slide').length >= 1);
  assert.ok(doc.querySelector('#topic-search'));
  assert.ok(doc.querySelectorAll('.feed-item').length >= 16);
  const firstCategory = doc.querySelector('.category-link');
  firstCategory.click();
  await until(() => doc.querySelector('.topic-header'), 'category page');
  assert.equal(new URL(dom.window.location.href).searchParams.get('category'), firstCategory.dataset.category);
  assert.equal(doc.querySelectorAll('#featured-track').length, 0);
});

test('library filters live without calling Zhihu', async () => {
  click('.app-nav [data-action="library"]');
  await until(() => doc.querySelector('#library-results'), 'library');
  const all = doc.querySelectorAll('.library-card').length;
  click('[data-action="library-filter"][data-group="source"][data-value="auto"]');
  assert.equal(doc.querySelectorAll('.library-card').length, 0);
  assert.equal(doc.querySelector('#library-count').textContent, '0');
  click('[data-action="library-filter"][data-group="source"][data-value="all"]');
  const input = doc.querySelector('#library-query');
  input.value = '不存在的关键词xyz';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.match(doc.querySelector('#library-results').textContent, /没有匹配/);
  input.value = '';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(doc.querySelectorAll('.library-card').length, all);
});

test('header search opens the search page with filtered results and arrange CTA', async () => {
  doc.querySelector('#header-query').value = '要不要辞职带娃';
  submit('#header-search');
  assert.equal(dom.window.location.pathname, '/search');
  await until(() => doc.querySelector('[data-action="auto-arrange"]'), 'search results');
  assert.equal(doc.querySelectorAll('.search-item').length, 6);
  click('.search-item [data-action="search-source"]');
  assert.match(doc.querySelector('dialog').textContent, /在知乎查看完整原文/);
  click('dialog [data-action="close"]');
});

test('ask dialog routes into search', async () => {
  click('[data-action="ask"]');
  assert.ok(doc.querySelector('#ask-form'));
  doc.querySelector('#ask-query').value = '年轻人该不该存钱';
  submit('#ask-form');
  assert.equal(new URL(dom.window.location.href).searchParams.get('q'), '年轻人该不该存钱');
  assert.equal(doc.querySelector('#header-query').value, '年轻人该不该存钱');
});
