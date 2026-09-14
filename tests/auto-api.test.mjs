// Free question -> search -> AI relevance filter -> AI arrangement, with the
// server-side verbatim check in between. All upstream calls are controlled.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Keep the collected-topics store out of the repository during tests.
process.env.ZHIBIAN_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'zhibian-auto-'));
const { createRequestHandler } = await import('../scripts/serve.mjs');

const response = items => ({ Code: 0, Message: 'success', Data: { Items: items, HasMore: false } });
const source = (id, name, text) => ({
  ContentID: id, ContentType: 'Answer', Title: '毕业后要留在大城市吗 - 知乎',
  Url: 'https://www.zhihu.com/question/123/answer/' + id + '?utm_source=test',
  ContentText: text, AuthorName: name, AuthorAvatar: '', AuthorBadgeText: '',
  CommentCount: 0, VoteUpCount: 5, EditTime: 1787582023
});
const items = [
  source('1', '甲', '先说钱：房租会吃掉我大半工资，所以我更想留在本地。'),
  source('2', '乙', '我更看重机会，大城市能给我本地给不了的岗位。'),
  source('3', '丙', '如果家里能帮衬首付，留在大城市是划算的。'),
  source('4', '丁', '没有可靠收入之前，别急着留在大城市。'),
  source('5', '戊', '小城市的生活成本低，我过得更松弛。'),
  source('6', '己', '关键是你想要什么样的十年，城市只是手段。')
];

async function withApp(overrides, work) {
  const server = http.createServer(createRequestHandler({
    search: async () => response(items),
    filter: async input => ({ items: input.items.map(item => ({ id: item.id, relevant: true, reason: '直接讨论是否留在大城市。' })), model: 'deepseek-flash' }),
    expandQueries: async ({ topic }) => ({ queries: [], model: 'stub' }), verifyOpposition: async ({ rounds }) => ({ verdicts: rounds.map(() => ({ opposed: true, leftPosition: '支持', rightPosition: '反对', reason: '两侧立场相反。' })), model: 'stub' }),
    arrange: async () => ({ arrangement: { intro: '条件不同，答案不同。', left: '倾向留下', right: '倾向离开', questions: ['谁的替代方案更可行？'], rounds: [
      { lens: '看的条件', sharedQuestion: '毕业后要不要留在大城市？', host: '本回合比较两人的现实条件。', seats: [
        { id: '2', side: 0, stance: '肯定', evidence: '我更看重机会，大城市能给我本地给不了的岗位。', reason: '强调机会。' },
        { id: '1', side: 1, stance: '否定', evidence: '先说钱：房租会吃掉我大半工资，所以我更想留在本地。', reason: '强调成本。' }] }
    ] }, model: 'deepseek-flash' }),
    ...overrides
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await work('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const topic = encodeURIComponent('毕业后要留在大城市吗');

test('a free question is filtered by AI then arranged into a verified arena', async () => {
  await withApp({}, async base => {
    const res = await fetch(base + '/api/debate?q=' + topic);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.autoArranged, true);
    assert.equal(data.id, 'q:毕业后要留在大城市吗');
    assert.equal(data.category, '自由辩题');
    assert.equal(data.mode, 'debate');
    assert.equal(data.rounds.length, 1);
    assert.equal(data.items.length, 6, 'all filtered sources stay readable');
    const [left, right] = data.rounds[0];
    assert.equal(left.name, '乙');
    assert.equal(right.name, '甲');
    assert.equal(left.evidence, '我更看重机会，大城市能给我本地给不了的岗位。');
    assert.equal(right.evidence, '先说钱：房租会吃掉我大半工资，所以我更想留在本地。');
    assert.equal(data.left, '倾向留下');
    assert.equal(data.verification.checked, 1);
    assert.deepEqual(data.verification.dropped, []);
    assert.match(data.arrangement, /AI 自动编排/);
  });
});

test('a fabricated quote drops its round instead of reaching the page', async () => {
  await withApp({ arrange: async () => ({ arrangement: { left: '留下', right: '离开', rounds: [
    { lens: '看的条件', host: 'x', seats: [
      { id: '2', side: 0, evidence: '乙认为大城市机会更多', reason: '复述。' },
      { id: '1', side: 1, evidence: '先说钱：房租会吃掉我大半工资，所以我更想留在本地。' }] }
  ] }, model: 'deepseek-flash' }) }, async base => {
    const data = await (await fetch(base + '/api/debate?q=' + topic)).json();
    assert.equal(data.rounds.length, 0);
    assert.equal(data.mode, 'reading');
    assert.deepEqual(data.verification.dropped, [{ round: 0, reason: 'QUOTE_NOT_VERBATIM' }]);
    assert.match(data.notice, /没有形成稳定的两方对照/);
    assert.match(data.arrangement, /不编造对立/);
    assert.equal(data.items.length, 6, 'the real answers are still listed');
  });
});

test('too few relevant answers never trigger an arrangement', async () => {
  let arranged = 0;
  await withApp({
    filter: async input => ({ items: input.items.map(item => ({ id: item.id, relevant: ['1', '2'].includes(item.id), reason: '仅两条直接相关。' })), model: 'deepseek-flash' }),
    arrange: async () => { arranged++; return null; }
  }, async base => {
    const data = await (await fetch(base + '/api/debate?q=' + topic)).json();
    assert.equal(arranged, 0, 'arrangement must not run below the threshold');
    assert.equal(data.mode, 'reading');
    assert.equal(data.rounds.length, 0);
    assert.equal(data.items.length, 2);
    assert.deepEqual(data.items.map(item => item.id), ['1', '2']);
  });
});

test('a pair the independent judge reads as the same side is dropped, not shown', async () => {
  await withApp({
    verifyOpposition: async ({ rounds }) => ({
      verdicts: rounds.map(() => ({ opposed: false, leftPosition: '都反对裸辞', rightPosition: '都反对裸辞', reason: '两侧方向相同。' })),
      model: 'stub'
    })
  }, async base => {
    const data = await (await fetch(base + '/api/debate?q=' + topic)).json();
    assert.equal(data.rounds.length, 0, 'a same-direction pair must not reach the page');
    assert.equal(data.mode, 'reading');
    assert.ok(data.verification.dropped.some(d => d.reason === 'NOT_REALLY_OPPOSED'));
    assert.match(data.notice, /没有形成真正的两方对立/);
    const library = (await (await fetch(base + '/api/topics')).json()).topics;
    assert.equal(library.some(t => t.query === topic), false, 'and this question is not stocked in the library either');
  });
});

test('the judge sees quotes with context but never the arranger\'s own labels', async () => {
  let seen = null;
  await withApp({
    verifyOpposition: async ({ rounds }) => {
      seen = rounds;
      return { verdicts: rounds.map(() => ({ opposed: true, leftPosition: '支持', rightPosition: '反对', reason: '相反。' })), model: 'stub' };
    }
  }, async base => {
    await fetch(base + '/api/debate?q=' + topic);
    assert.equal(seen.length, 1);
    assert.deepEqual(Object.keys(seen[0]).sort(), ['left', 'leftContext', 'right', 'rightContext', 'sharedQuestion']);
    assert.ok(!('stance' in seen[0]) && !('note' in seen[0]) && !('reason' in seen[0]), 'the judge must not see the arranger labels');
    assert.match(seen[0].left, /我更看重机会/);
    assert.match(seen[0].right, /先说钱/);
  });
});

test('an empty relevance result keeps the page honest rather than showing raw search hits', async () => {
  await withApp({ filter: async input => ({ items: input.items.map(item => ({ id: item.id, relevant: false, reason: '都与辩题无关。' })), model: 'deepseek-flash' }) }, async base => {
    const data = await (await fetch(base + '/api/debate?q=' + topic)).json();
    assert.equal(data.items.length, 0);
    assert.equal(data.mode, 'reading');
    assert.match(data.notice, /没有找到与这个问题直接相关的观点/);
  });
});

test('the same free question is served from cache without new upstream calls', async () => {
  let searches = 0, arrangements = 0;
  await withApp({
    search: async () => { searches++; return response(items); },
    arrange: async () => { arrangements++; return { arrangement: { rounds: [] }, model: 'deepseek-flash' }; }
  }, async base => {
    await fetch(base + '/api/debate?q=' + topic);
    await fetch(base + '/api/debate?q=' + topic);
    assert.equal(searches, 1);
    assert.equal(arrangements, 1);
  });
});

test('an unconfigured AI surfaces as an explicit error, never as content', async () => {
  await withApp({ arrange: async () => { throw Object.assign(new Error('AI 服务尚未配置。'), { status: 503, code: 'AI_NOT_CONFIGURED' }); } }, async base => {
    const res = await fetch(base + '/api/debate?q=' + topic);
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.code, 'AI_NOT_CONFIGURED');
    assert.equal(data.rounds, undefined);
  });
});

test('a free question still needs a usable query', async () => {
  await withApp({}, async base => {
    assert.equal((await fetch(base + '/api/debate?q=x')).status, 400);
  });
});
