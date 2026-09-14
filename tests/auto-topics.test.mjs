// Free-question collection: what gets stored, how it is deduplicated, and that
// opening a stored topic re-checks every quote against a fresh search.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(tmpdir(), 'zhibian-store-'));
process.env.ZHIBIAN_DATA_DIR = dataDir;

const { loadAutoTopics, saveAutoTopic, publicAutoTopic, draftFromArrangement, autoTopicId, findAutoTopic } = await import('../scripts/auto-topics.mjs');
const { createRequestHandler } = await import('../scripts/serve.mjs');

const seat = (id, name, text) => ({ id, name, text, evidence: text, title: text, sourceTitle: '来源标题', sourceUrl: 'https://www.zhihu.com/question/1/answer/' + id, badge: '', votes: 1, editedAt: null, avatarUrl: null });
const payload = (query, rounds) => ({
  category: '自由辩题', title: query, titleLines: [query], intro: '条件不同，答案不同。',
  label: '条件不同，答案不同。', left: '该做', right: '不该做', leftShort: '该做', rightShort: '不该做',
  lenses: rounds.map((_, i) => '分歧点' + i), hosts: rounds.map(() => '编排说明。'),
  sharedQuestions: rounds.map(() => '该不该这样做？'),
  rounds, questions: ['两边前提一样吗？']
});

// Runs first on purpose: the module caches the store on first read.
test('a corrupt store is ignored instead of breaking the lobby', async () => {
  writeFileSync(path.join(dataDir, 'auto-topics.json'), '{ not json');
  assert.deepEqual(await loadAutoTopics(), []);
});

test('topic ids are stable and namespaced away from the curated catalogue', () => {
  assert.equal(autoTopicId('该不该裸辞'), autoTopicId('该不该裸辞'));
  assert.notEqual(autoTopicId('该不该裸辞'), autoTopicId('该不该读研'));
  assert.match(autoTopicId('该不该裸辞'), /^auto-[0-9a-f]{12}$/);
});

test('a stored draft keeps only source ids and verified quotes', () => {
  const rounds = [[seat('1', '甲', '我支持这件事。'), seat('2', '乙', '我反对这件事。')]];
  const draft = draftFromArrangement({ query: '该不该这样做', payload: payload('该不该这样做', rounds), model: 'deepseek-flash' });
  assert.equal(draft.id, autoTopicId('该不该这样做'));
  assert.equal(draft.autoArranged, true);
  assert.equal(draft.selections.length, 1);
  assert.deepEqual(draft.selections[0].map(s => s.id), ['1', '2']);
  assert.deepEqual(draft.selections[0].map(s => s.evidence), ['我支持这件事。', '我反对这件事。']);
  assert.equal(draft.reviewedAt, null, 'AI arrangements are never marked as reviewed');
  const lobby = publicAutoTopic(draft);
  assert.equal(lobby.selections, undefined, 'quotes must not leak into the lobby payload');
  assert.equal(lobby.query, undefined);
  assert.equal(lobby.reviewedPairs, 1);
  assert.equal(lobby.autoArranged, true);
});

test('saving the same question twice updates in place instead of duplicating', async () => {
  const rounds = [[seat('1', '甲', '我支持这件事。'), seat('2', '乙', '我反对这件事。')]];
  const draft = draftFromArrangement({ query: '该不该这样做', payload: payload('该不该这样做', rounds), model: 'deepseek-flash' });
  await saveAutoTopic(draft);
  await saveAutoTopic({ ...draft, intro: '改过的说明。' });
  const list = await loadAutoTopics().then(all => all.filter(t => t.id === draft.id));
  assert.equal(list.length, 1);
  assert.equal(list[0].intro, '改过的说明。');
  assert.ok(findAutoTopic(await loadAutoTopics(), draft.id));
});

test('the store is capped so it cannot grow without bound', async () => {
  for (let i = 0; i < 85; i++) await saveAutoTopic({ id: 'auto-' + String(i).padStart(12, '0'), query: 'q' + i, title: 'q' + i, lenses: [], hosts: [], selections: [[{ id: 'a', evidence: 'b' }]] });
  const all = await loadAutoTopics();
  assert.equal(all.length, 80);
  assert.equal(all[0].query, 'q84', 'newest first');
  assert.equal(all.some(t => t.query === 'q0'), false, 'oldest entries fall off');
});

test('a collected question appears in the lobby and is re-verified when opened', async () => {
  const dataDir2 = mkdtempSync(path.join(tmpdir(), 'zhibian-store2-'));
  process.env.ZHIBIAN_DATA_DIR = dataDir2;
  const good = seat('11', '甲', '我支持这件事。'), bad = seat('12', '乙', '我反对这件事。');
  const fine = draftFromArrangement({ query: '该不该这样做', payload: payload('该不该这样做', [[good, bad]]), model: 'deepseek-flash' });
  const stale = draftFromArrangement({ query: '已经改过的回答', payload: payload('已经改过的回答', [[{ ...good, id: '99' }, { ...bad, id: '98' }]]), model: 'deepseek-flash' });
  await saveAutoTopic(fine);
  await saveAutoTopic(stale);
  const server = http.createServer(createRequestHandler({ search: async () => ({ Code: 0, Data: { Items: [{ ContentID: '11', ContentType: 'Answer', Title: '来源标题 - 知乎', Url: 'https://www.zhihu.com/question/1/answer/11', ContentText: '我支持这件事。', AuthorName: '甲', AuthorAvatar: '', AuthorBadgeText: '' }, { ContentID: '12', ContentType: 'Answer', Title: '来源标题 - 知乎', Url: 'https://www.zhihu.com/question/1/answer/12', ContentText: '我反对这件事。', AuthorName: '乙', AuthorAvatar: '', AuthorBadgeText: '' }] } }) }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const topics = (await (await fetch(base + '/api/topics')).json()).topics;
    const listed = topics.find(t => t.id === fine.id);
    assert.ok(listed, 'collected topic is listed in the lobby');
    assert.equal(listed.autoArranged, true);
    assert.equal(listed.reviewedPairs, 1);
    const opened = await (await fetch(base + '/api/debate?id=' + fine.id)).json();
    assert.equal(opened.autoArranged, true);
    assert.equal(opened.rounds.length, 1);
    assert.deepEqual(opened.sharedQuestions, ['该不该这样做？']);
    assert.match(opened.arrangement, /AI 自动编排/);
    const missing = await (await fetch(base + '/api/debate?id=' + stale.id)).json();
    assert.equal(missing.rounds.length, 0, 'answers that no longer match disappear instead of being faked');
    assert.equal(missing.mode, 'reading');
  } finally { await new Promise(r => server.close(r)); }
});
