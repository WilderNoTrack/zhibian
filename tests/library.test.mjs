// The library page: keyword search over everything, plus source and category filters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { filterTopics, libraryView, libraryResults } from '../web/library.js';

const topics = [
  { id: 'career', category: '职场与生存', title: '第一份工作，先收入还是先成长？', label: '先争取收入，还是先积累', intro: '两条真实回答的选择依据。', leftShort: '先立足', rightShort: '成长优先', reviewedPairs: 1, editorialMode: 'debate' },
  { id: 'city', category: '人生与选择', title: '毕业后要不要留在大城市？', label: '留下还是回老家', intro: '成本与机会的两难。', leftShort: '留城', rightShort: '回乡', reviewedPairs: 3, editorialMode: 'debate' },
  { id: 'auto-abc', category: '自由辩题', title: '该不该裸辞？', label: '留下还是走', intro: '存款与退路。', leftShort: '先找工作', rightShort: '该走就走', reviewedPairs: 2, editorialMode: 'debate', autoArranged: true }
];
const render = (state, list = topics) => new JSDOM(libraryView(list, { term: '', source: 'all', category: 'all', ...state })).window.document;
const ids = (state, list = topics) => filterTopics(list, state).map(t => t.id);

test('keyword search covers title, stance and category, and ignores case and spacing', () => {
  assert.deepEqual(ids({ term: '辞职' }), [], 'no false positive');
  assert.deepEqual(ids({ term: '大城市' }), ['city']);
  assert.deepEqual(ids({ term: '成长优先' }), ['career'], 'position labels are searchable');
  assert.deepEqual(ids({ term: '自由辩题' }), ['auto-abc'], 'category is searchable');
  assert.deepEqual(ids({ term: '  裸辞  ' }), ['auto-abc'], 'surrounding spaces are ignored');
  assert.deepEqual(ids({ term: '该不该裸辞' }), ['auto-abc']);
});

test('source and category filters narrow the library without touching the rest', () => {
  assert.deepEqual(ids({ source: 'curated' }), ['career', 'city']);
  assert.deepEqual(ids({ source: 'auto' }), ['auto-abc']);
  assert.deepEqual(ids({ category: '职场与生存' }), ['career']);
  assert.deepEqual(ids({ term: '留', source: 'curated' }), ['city'], 'filters combine');
  assert.deepEqual(ids({ term: '裸辞', source: 'curated' }), [], 'combined filters can be empty');
});

test('every card says whether it was hand-reviewed or AI arranged', () => {
  const doc = render({ term: '' });
  const cards = [...doc.querySelectorAll('.library-card')];
  assert.equal(cards.length, 3);
  assert.match(cards[0].textContent, /人工核对/);
  assert.ok(cards[0].querySelector('.badge-curated'), 'hand-reviewed topics carry the curated badge');
  const auto = cards.find(card => card.querySelector('.badge-auto'));
  assert.ok(auto, 'the AI topic carries the auto badge');
  assert.match(auto.textContent, /AI 编排/);
  assert.doesNotMatch(auto.textContent, /人工核对/);
  assert.match(auto.querySelector('h2 a').href, /\/debate\?id=auto-abc/);
});

test('the library header counts both kinds and the filters are present', () => {
  const doc = render({ term: '' });
  const stats = doc.querySelector('.stat-board').textContent;
  assert.match(stats, /2/, 'the board counts the two hand-reviewed topics');
  assert.match(stats, /1/, 'and the one AI topic');
  assert.match(doc.querySelector('.stat-board').textContent, /人工核对/);
  assert.ok(doc.querySelector('#library-query'), 'search box');
  const controls = [...doc.querySelectorAll('.filter-tab'), ...doc.querySelectorAll('.chip')];
  assert.ok(controls.some(c => c.dataset.group === 'source' && c.dataset.value === 'auto'));
  assert.ok(controls.some(c => c.dataset.group === 'category' && c.dataset.value === '人生与选择'));
  assert.equal(controls.filter(c => c.classList.contains('on')).length, 2, 'one active control per row');
});

test('an empty result explains itself instead of looking broken', () => {
  const doc = render({ term: '不存在的主题' });
  assert.equal(doc.querySelectorAll('.library-card').length, 0);
  assert.match(doc.querySelector('#library-results').textContent, /没有匹配的辩题/);
  const html = libraryResults(topics, { term: '大城市' });
  assert.match(html, /毕业后要不要留在大城市/);
});
