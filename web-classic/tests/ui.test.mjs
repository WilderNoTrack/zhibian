// DOM integration tests, not a substitute for browser layout or focus-trap checks.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';

// Keep the collected-topics store out of the repository during tests.
process.env.ZHIBIAN_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'zhibian-ui-'));
const { createRequestHandler } = await import('../../scripts/serve.mjs');

let dom, server, doc;
const realFetch = globalThis.fetch;
const newSources = JSON.parse(await readFile(new URL('../../tests/fixtures/editorial-sources.json', import.meta.url), 'utf8'));
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
const career = [
  item('2078822177592424215', '哲思说管理', '第一份工作，优先考虑能不能让你立足。'),
  item('2050361247149905157', '筱惠惠', '两种排序的核心共识，就是成长是首当其冲的，其他都可以商量，唯独成长不能迁就。')
];
async function until(predicate, label) {
  for (let i = 0; i < 150; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 10)); }
  assert.fail('UI did not reach expected state' + (label ? ' — ' + label : ''));
}
const click = selector => { const el = doc.querySelector(selector); assert.ok(el, selector); el.click(); };

before(async () => {
  server = http.createServer(createRequestHandler({ hot: async () => ({Code:0,Data:{Items:[]}}), summarize: async () => ({summary: 'AI 摘要测试：保留回答的条件与依据。', model: 'test-model'}), critique: async input => ({answer: `围绕“${input.question}”，这条回答的判断依赖它把家庭条件和个人选择放在一起比较。`, model: 'deepseek-flash'}), filter: async input => ({items: input.items.map(item => ({id: item.id, relevant: true, reason: '直接讨论当前辩题。'})), model: 'deepseek-flash'}), expandQueries: async ({ topic }) => ({ queries: [], model: 'stub' }), verifyOpposition: async ({rounds}) => ({verdicts: rounds.map(() => ({opposed: true, leftPosition: '支持', rightPosition: '反对', reason: '两侧立场相反。'})), model: 'deepseek-flash'}), arrange: async () => ({model: 'deepseek-flash', arrangement: {intro: '不同家庭条件，给出不同选择。', left: '愿意先全职', right: '倾向留职', questions: ['谁的替代照护更可靠？'],
    rounds: [
      {lens: '第一回合 · 选择理由', sharedQuestion: '该不该辞掉工作专心带娃？', host: '本回合比较两人对陪伴与自我的排序。', seats: [
        {id: '2078831272391075654', side: 0, stance: '肯定', evidence: '说实话，没有人给我开工资。', reason: '强调陪伴本身的价值。'},
        {id: '2078402735305762660', side: 1, stance: '否定', evidence: '不是不爱孩子，恰恰是因为爱，才不敢轻易把自己全部牺牲进去。', reason: '担心失去自我。'}]},
      {lens: '第二回合 · 现实条件', sharedQuestion: '有没有可靠照护时该不该保留工作？', host: '本回合换一组来源，看条件变化后判断是否改变。', seats: [
        {id: '2075350106732224981', side: 0, stance: '肯定', evidence: '可以，看自己的家庭条件和自己的选择。', reason: '以家庭条件为前提。'},
        {id: '2077701953874814493', side: 1, stance: '否定', evidence: '这个问题，不管怎么选，都不需要扯什么母爱不母爱的角度，直接从家庭利益角度出发做选择。', reason: '以家庭利益为前提。'}]}
    ]}}), search: async query => {
    if (query === '测试限流') return { Code: 30001 };
    const reviewed = Object.values(newSources).find(f => f.query === query);
    if (reviewed) return reviewed.response;
    return { Code: 0, Data: { Items: query.includes('第一份工作') ? career : query === '空白结果' ? [] : parenting } };
  } }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  dom = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'), { url: base });
  doc = dom.window.document;
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open'); setTimeout(() => this.dispatchEvent(new dom.window.Event('close')), 0);
  };
  globalThis.window = dom.window; globalThis.document = doc;
  globalThis.fetch = (url, options) => realFetch(new URL(url, base), options);
  await import('../app.js');
  await until(() => doc.querySelectorAll('.opinion-card').length === 2);
});
after(async () => {
  globalThis.fetch = realFetch; delete globalThis.document; delete globalThis.window;
  dom.window.close(); await new Promise(r => server.close(r));
});

test('real attribution, three pairs and AI summary/source controls render', async () => {
  assert.equal(doc.querySelectorAll('.seat').length, 6);
  assert.match(doc.querySelector('.card-author h3').textContent, /星澜/);
  assert.equal(doc.querySelectorAll('.excerpt, .background').length, 0);
  await until(() => doc.querySelector('.ai-summary')?.textContent.includes('AI 摘要测试'));
  assert.doesNotMatch(doc.querySelector('.opinion-card').textContent, /展开接口返回的原文|这条观点的背景与依据/);
  assert.equal(doc.querySelectorAll('.opinion-card details').length, 0);
  assert.match(doc.querySelector('.author-badge').textContent, /心理咨询师/);
  assert.ok(doc.querySelector('.source-button').classList.contains('source-prominent'));
  assert.doesNotMatch(doc.querySelector('main').textContent, /示例人物|林间|远舟/);
  click('[data-action="source"][data-side="0"]');
  assert.match(doc.querySelector('dialog h2').textContent, /原文与来源/);
  assert.match(doc.querySelector('dialog').textContent, /说实话，没有人给我开工资/);
  assert.match(doc.querySelector('dialog').textContent, /在知乎查看完整原文/);
  const link = doc.querySelector('dialog .source-link');
  assert.equal(link.href, 'https://www.zhihu.com/question/123/answer/2078831272391075654?utm_source=test');
  assert.match(link.rel, /noopener/);
  click('[data-action="close"]');
});
test('sidebar keeps navigation focused on topics and the current arena', () => {
  assert.equal(doc.querySelectorAll('.sidebar nav [data-action="sources"]').length, 0);
  assert.ok(doc.querySelector('.sidebar nav [data-action="topics"]'));
  assert.ok(doc.querySelector('.sidebar nav [data-action="arena"]'));
});
test('all rounds reach original-quote recap and brand really returns to the arena', () => {
  click('[data-action="next"]');
  assert.match(doc.querySelector('.card-author h3').textContent, /晓君养娃日记/);
  click('[data-action="next"]');
  assert.match(doc.querySelector('.context-note').textContent, /有可靠帮手时上班/);
  click('[data-action="next"]');
  assert.equal(doc.querySelectorAll('.recap-camp blockquote').length, 6);
  click('.brand');
  assert.equal(doc.querySelectorAll('.opinion-card').length, 2);
  assert.match(doc.querySelector('.round-position').textContent, /第 3/);
});
test('switching to another live debate renders all three verified rounds', async () => {
  click('[data-action="topics"]');
  assert.equal(dom.window.location.pathname, '/topics');
  assert.equal(doc.querySelector('dialog').open, false);
  click('[data-category="work"]');
  click('[data-action="choose-topic"][data-id="career"]');
  await until(() => doc.querySelector('.card-author h3')?.textContent === 'uyfkmm');
  assert.equal(doc.querySelectorAll('.seat').length, 6);
  assert.equal(doc.querySelectorAll('[role="tab"]').length, 3);
  doc.querySelector('[role="tab"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.match(doc.querySelector('.round-position').textContent, /第 2 \/ 3/);
  click('[data-action="next"]');
  click('[data-action="next"]');
  assert.equal(doc.querySelectorAll('.recap-camp blockquote').length, 6);
  click('.brand');
});
test('lobby categories drill down into matching topics and browser back restores the list', async () => {
  click('[data-action="topics"]');
  assert.equal(doc.querySelectorAll('.category-card').length, 8);
  assert.equal(doc.querySelector('nav [data-action="topics"]').getAttribute('aria-current'), 'page');
  click('[data-category="family"]');
  assert.equal(new URL(dom.window.location.href).searchParams.get('category'), 'family');
  assert.equal(doc.querySelectorAll('.lobby-topic').length, 3);
  assert.match(doc.querySelector('.lobby-topic').textContent, /专心带娃/);
  assert.doesNotMatch(doc.querySelector('.lobby-topic').textContent, /第一份工作/);
  click('[data-action="choose-topic"][data-id="parenting"]');
  await until(() => doc.querySelectorAll('.seat').length === 6);
  assert.equal(dom.window.location.pathname, '/debate');
  dom.window.history.back();
  await until(() => !!doc.querySelector('.lobby-topic'));
  assert.equal(new URL(dom.window.location.href).searchParams.get('category'), 'family');
  assert.equal(doc.querySelector('dialog').open, false);
  dom.window.history.back();
  await until(() => doc.querySelectorAll('.category-card').length === 8);
  click('nav [data-action="arena"]');
  await until(() => doc.querySelectorAll('.seat').length === 6);
});
test('the lobby leads with a one-at-a-time carousel and the question box, without the removed sections', async () => {
  click('[data-action="topics"]');
  await until(() => !!doc.querySelector('#featured-carousel'));
  assert.equal(doc.querySelectorAll('.recent-topics').length, 0, '最近新增 is gone');
  assert.equal(doc.querySelectorAll('.auto-topics').length, 0, '自由提问收录 is gone');
  assert.equal(doc.querySelectorAll('#featured-track .carousel-slide').length, 8, 'one debate per slide');
  assert.equal(doc.querySelectorAll('.carousel-dot').length, 8, 'eight dots under the carousel');
  assert.equal(doc.querySelectorAll('.carousel-arrow').length, 2, 'the carousel can be stepped');
  assert.equal(doc.querySelectorAll('#featured-track .slide-side').length, 16, 'every slide shows its two sides');
  const html = doc.querySelector('#main').innerHTML;
  assert.ok(html.indexOf('id="featured-carousel"') < html.indexOf('id="topic-search"'), '提问框在今日热辩之下');
  assert.ok(html.indexOf('id="topic-search"') < html.indexOf('class="category-grid"'), '提问框在分类之上');
  assert.equal(doc.querySelectorAll('nav [data-action="library"]').length, 1, 'the sidebar links to the library');
  const dots = [...doc.querySelectorAll('.carousel-dot')];
  dots[3].click();
  assert.equal(dots[3].getAttribute('aria-selected'), 'true', 'clicking a dot jumps to that debate');
  assert.equal(dots[0].getAttribute('aria-selected'), 'false');
  click('nav [data-action="arena"]');
  await until(() => doc.querySelectorAll('.seat').length === 6);
});
test('AI drawer supports arbitrary DeepSeek questions without canned analysis', async () => {
  click('[data-action="critic"][data-side="0"]');
  assert.match(doc.querySelector('dialog').textContent, /可以随时提问/);
  assert.equal(doc.querySelectorAll('dialog .critic-form').length, 1);
  doc.querySelector('#critic-question').value = '这条观点最依赖什么前提？';
  doc.querySelector('.critic-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => doc.querySelector('[data-critique-result]')?.textContent.includes('这条观点最依赖什么前提'));
  click('[data-action="close"]');
});
test('free search shows real source results and an explicit no-results state', async () => {
  await new Promise(r => setTimeout(r, 5));
  click('[data-action="topics"]');
  doc.querySelector('#topic-query').value = '空白结果';
  doc.querySelector('#topic-search').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => /这次没有找到有效观点/.test(doc.querySelector('#topic-results').textContent));
  doc.querySelector('#topic-query').value = '第一份工作';
  doc.querySelector('#topic-search').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => doc.querySelectorAll('.search-option').length === 2);
  assert.match(doc.querySelector('#topic-results').textContent, /DeepSeek 已筛选/);
  assert.match(doc.querySelector('#topic-results').textContent, /不自动分左右阵营/);
  click('.search-option');
  assert.match(doc.querySelector('dialog').textContent, /哲思说管理/);
  assert.ok(doc.querySelector('dialog a[href*="2078822177592424215"]'));
  click('[data-action="close"]');
});
test('each new topic deep-link renders its own sources and completes a three-round recap', async () => {
  for (const [id, fixture] of Object.entries(newSources)) {
    dom.window.history.pushState({}, '', '/debate?id=' + id);
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
    const first = fixture.response.Data.Items[0];
    const expectedName = first.AuthorName || first.AuthorSignature || `知乎答主 #${String(first.ContentID).slice(-6)}`;
    await until(() => doc.querySelector('.card-author h3')?.textContent === expectedName);
    assert.equal(doc.querySelectorAll('.opinion-card').length, 2, id);
    assert.equal(doc.querySelectorAll('.seat').length, 6, id);
    assert.equal(doc.querySelectorAll('[role="tab"]').length, 3, id);
    click('[data-action="next"]');
    click('[data-action="next"]');
    click('[data-action="next"]');
    assert.equal(doc.querySelectorAll('.recap-camp blockquote').length, 6, id);
    click('[data-action="topics"]');
    assert.equal(doc.querySelectorAll('.category-card').length, 8, id);
  }
});
test('a free question can be arranged by AI into a verified arena', async () => {
  await new Promise(r => setTimeout(r, 5));
  click('[data-action="topics"]');
  doc.querySelector('#topic-query').value = '测试自动编排';
  doc.querySelector('#topic-search').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => doc.querySelectorAll('.search-option').length === 6);
  assert.equal(doc.querySelectorAll('.auto-arrange-cta').length, 1, 'only offered once enough related answers exist');
  click('[data-action="auto-arrange"]');
  await until(() => !!doc.querySelector('.auto-chip'));
  assert.equal(new URL(dom.window.location.href).searchParams.get('q'), '测试自动编排');
  assert.equal(doc.querySelector('#view-label').textContent, '自动编排现场');
  assert.match(doc.querySelector('.auto-chip').textContent, /AI 自动编排/);
  assert.match(doc.querySelector('.quote-label').textContent, /已逐字校验/);
  assert.match(doc.querySelector('.host-label').textContent, /AI 编排说明/);
  assert.equal(doc.querySelectorAll('.opinion-card').length, 2);
  assert.equal(doc.querySelectorAll('[role="tab"]').length, 2);
  assert.equal(doc.querySelectorAll('.seat').length, 4);
  assert.match(doc.querySelector('.arrangement-note').textContent, /逐字校验/);
  click('[data-action="next"]');
  click('[data-action="next"]');
  assert.equal(doc.querySelectorAll('.recap-camp blockquote').length, 4);
  click('[data-action="library"]');
  await until(() => !!doc.querySelector('#library-query'));
  assert.equal(dom.window.location.pathname, '/library');
  assert.ok(doc.querySelectorAll('.library-card').length >= 17, 'the library lists the whole catalogue');
  const collected = [...doc.querySelectorAll('.library-card')].filter(card => card.classList.contains('auto-topic'));
  assert.ok(collected.length >= 1, 'the arranged question is collected into the library');
  assert.ok(collected.every(card => card.textContent.includes('AI 编排')), 'stocked topics keep the AI badge');
  assert.ok(collected.some(card => card.textContent.includes('测试自动编排')), 'the arranged question itself is listed');
  doc.querySelector('#library-query').value = '测试自动编排';
  doc.querySelector('#library-query').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(doc.querySelectorAll('.library-card').length, 1, 'keyword search narrows to the match');
  doc.querySelector('#library-query').value = '完全不相干的词';
  doc.querySelector('#library-query').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(doc.querySelectorAll('.library-card').length, 0);
  assert.match(doc.querySelector('#library-results').textContent, /没有匹配的辩题/);
  doc.querySelector('#library-query').value = '';
  doc.querySelector('#library-query').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  click('[data-action="library-filter"][data-group="source"][data-value="curated"]');
  assert.equal(doc.querySelectorAll('.library-card.auto-topic').length, 0, 'AI topics stay out of the hand-reviewed filter');
  click('[data-action="library-filter"][data-group="source"][data-value="auto"]');
  const autoCards = doc.querySelectorAll('.library-card');
  assert.ok(autoCards.length >= 1, 'the auto filter keeps the stocked topics');
  assert.ok([...autoCards].every(card => card.classList.contains('auto-topic')));
  click('[data-action="choose-topic"][data-id="' + doc.querySelector('.library-card').dataset.id + '"]');
  await until(() => !!doc.querySelector('.auto-chip'));
  assert.equal(doc.querySelectorAll('.opinion-card').length, 2);
  assert.match(doc.querySelector('.shared-question').textContent, /该不该辞掉工作专心带娃/);
});
test('search quota errors are shown without fake results', async () => {
  await new Promise(r => setTimeout(r, 5));
  click('[data-action="topics"]');
  await until(() => !!doc.querySelector('#topic-query'), 'lobby search box missing; page: ' + (doc.querySelector('#main')?.textContent.trim().slice(0, 160) || 'empty'));
  doc.querySelector('#topic-query').value = '测试限流';
  doc.querySelector('#topic-search').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => /暂时不可用/.test(doc.querySelector('#topic-results').textContent), 'results: ' + doc.querySelector('#topic-results').textContent.trim().slice(0, 200));
  assert.equal(doc.querySelectorAll('.search-option').length, 0);
  assert.match(doc.querySelector('#topic-results').textContent, /额度或频率受限/);
});
