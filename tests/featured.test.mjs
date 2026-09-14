// The background collector that turns hot headlines into library topics.
// Upstream stubs only — no Zhihu or DeepSeek calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(tmpdir(), 'zhibian-featured-'));
process.env.ZHIBIAN_DATA_DIR = dataDir;
const { createRequestHandler } = await import('../scripts/serve.mjs');
const { saveAutoTopic, autoTopicId, resetAutoTopics } = await import('../scripts/auto-topics.mjs');

const storeFile = () => path.join(dataDir, 'auto-topics.json');
function store() {
  try { return JSON.parse(readFileSync(storeFile(), 'utf8')); } catch { return { topics: [], hotAttempts: [] }; }
}
async function until(predicate, label) {
  for (let i = 0; i < 2000; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 10)); }
  assert.fail('never reached: ' + label);
}
const answer = (id, name, text) => ({ ContentID: id, ContentType: 'Answer', Title: '热榜话题 - 知乎',
  Url: 'https://www.zhihu.com/question/1/answer/' + id, ContentText: text, AuthorName: name, AuthorAvatar: '', AuthorBadgeText: '' });
const goodSearch = async () => ({ Code: 0, Data: { Items: [
  answer('1', '甲', '我支持这件事，值得去。'), answer('2', '乙', '我反对这件事，不该去。'),
  answer('3', '丙', '我也觉得可以，值得去。'), answer('4', '丁', '我认为不行，不该去。')] } });
const goodFilter = async input => ({ items: input.items.map(i => ({ id: i.id, relevant: true, reason: '相关。' })), model: 'stub' });
const goodArrange = async () => ({ model: 'stub', arrangement: { intro: 'x', left: '支持', right: '反对', questions: ['q'], rounds: [
  { lens: '看条件', sharedQuestion: '该不该去？', host: 'h', seats: [
    { id: '1', side: 0, stance: '肯定', evidence: '我支持这件事，值得去。' },
    { id: '2', side: 1, stance: '否定', evidence: '我反对这件事，不该去。' }] }] } });

const goodOpposition = async ({ rounds }) => ({ verdicts: rounds.map(() => ({ opposed: true, leftPosition: '支持', rightPosition: '反对', reason: '两侧立场相反。' })), model: 'stub' });

async function withServer(overrides, work) {
  const server = http.createServer(createRequestHandler({ search: goodSearch, filter: goodFilter, expandQueries: async ({ topic }) => ({ queries: [], model: 'stub' }), arrange: goodArrange, verifyOpposition: goodOpposition, hot: async () => ({ Code: 0, Data: { Items: [] } }), ...overrides }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { await work('http://127.0.0.1:' + server.address().port); } finally { await new Promise(r => server.close(r)); }
}
const headlines = list => async () => ({ Code: 0, Data: { Items: list.map((title, i) => ({ Title: title, Url: 'https://www.zhihu.com/question/' + (100 + i) })) } });

test('an unavailable hot list never breaks the lobby', async () => {
  await withServer({ hot: async () => { throw new Error('hot down'); } }, async base => {
    const res = await fetch(base + '/api/topics');
    assert.equal(res.status, 200);
    const topics = (await res.json()).topics;
    assert.ok(topics.length >= 17, 'the curated catalogue is still served');
    assert.equal(topics.filter(t => t.featuredSource === 'hot').length, 0);
  });
});

test('a headline that really arranges is collected into the library', async () => {
  await resetAutoTopics();
  await withServer({ hot: headlines(['该不该辞职去旅行', '要不要读第二个学位']) }, async base => {
    assert.equal((await (await fetch(base + '/api/topics')).json()).topics.filter(t => t.featuredSource === 'hot').length, 0, 'not collected before the background job runs');
    await until(() => ['该不该辞职去旅行', '要不要读第二个学位'].every(q => store().topics.some(t => t.query === q) && store().hotAttempts.includes(q)), 'both headlines collected and recorded');
    const data = await (await fetch(base + '/api/topics')).json();
    const hot = data.topics.filter(t => t.featuredSource === 'hot');
    assert.equal(hot.length, 2);
    assert.deepEqual(hot.map(t => t.featuredRank).sort(), [1, 2], 'the hot rank is kept');
    assert.ok(hot.every(t => t.reviewedAt === null), 'never marked as hand-reviewed');
    assert.ok(['要不要读第二个学位', '该不该辞职去旅行'].every(q => store().hotAttempts.includes(q)), 'both are recorded as evaluated');
    const opened = await (await fetch(base + '/api/debate?id=' + hot[0].id)).json();
    assert.ok(opened.rounds.length >= 1, 'a collected headline opens as a real debate');
    assert.match(opened.arrangement, /AI 自动编排/);
  });
});

test('a headline with no usable opposition is spent, not retried forever', async () => {
  await resetAutoTopics();
  await withServer({
    hot: headlines(['要不要养第二只猫']),
    arrange: async () => ({ model: 'stub', arrangement: { rounds: [] } }),
    verifyOpposition: async ({ rounds }) => ({ verdicts: rounds.map(() => ({ opposed: true, leftPosition: '支持', rightPosition: '反对', reason: 'stub' })), model: 'stub' })
  }, async base => {
    await fetch(base + '/api/topics');
    await until(() => store().hotAttempts.includes('要不要养第二只猫'), 'the headline is recorded as evaluated');
    assert.equal(store().topics.some(t => t.query === '要不要养第二只猫'), false, 'nothing is invented to fill the slot');
  });
});

test('news and politics headlines are skipped instead of stocked in the library', async () => {
  await resetAutoTopics();
  await withServer({ hot: headlines([
    '某地法院判决一起股权纠纷案，如何从法律角度解读？',
    '如何看待苏格兰、威尔士和北爱尔兰的领导人将共商民族自决权利？',
    '程序员删光公司数据获刑五年，暴露出哪些问题？',
    '该不该为了省钱搬到郊区住？'
  ]) }, async base => {
    await fetch(base + '/api/topics');
    await until(() => store().topics.some(t => t.query === '该不该为了省钱搬到郊区住？'), 'the decision question is collected');
    const collected = store().topics.map(t => t.query);
    assert.ok(collected.includes('该不该为了省钱搬到郊区住？'));
    assert.equal(collected.some(title => /法院|民族自决|获刑/.test(title)), false, 'news and political headlines are never stocked');
    assert.equal(store().hotAttempts.some(title => /法院|民族自决|获刑/.test(title)), false, 'and they are not even attempted');
  });
});

test('an upstream failure does not spend the headline, and the collector backs off', async () => {
  await resetAutoTopics();
  let hotCalls = 0, arrangeCalls = 0;
  await withServer({
    hot: async () => { hotCalls++; return { Code: 0, Data: { Items: [{ Title: '该不该把房子卖掉', Url: 'https://www.zhihu.com/question/9' }] } }; },
    arrange: async () => { arrangeCalls++; throw Object.assign(new Error('AI 服务暂时不可用'), { status: 503, code: 'AI_UPSTREAM' }); }
  }, async base => {
    await fetch(base + '/api/topics');
    await until(() => arrangeCalls === 1, 'the collector tried once');
    await new Promise(r => setTimeout(r, 60));
    assert.equal(store().hotAttempts.includes('该不该把房子卖掉'), false, 'a failed headline is not marked as tried');
    assert.equal(store().topics.some(t => t.query === '该不该把房子卖掉'), false, 'and nothing is collected from it');
    await fetch(base + '/api/topics');
    await new Promise(r => setTimeout(r, 60));
    assert.equal(hotCalls, 1, 'the collector backs off instead of retrying on every load');
    assert.equal(arrangeCalls, 1);
  });
});

test('the slide preview carries real author names and verbatim quotes', async () => {
  await resetAutoTopics();
  await withServer({ hot: headlines(['该不该辞职去旅行']) }, async base => {
    await fetch(base + '/api/topics');
    await until(() => store().topics.some(t => t.query === '该不该辞职去旅行'), 'a collected topic exists to preview');
    const topic = store().topics.find(t => t.query === '该不该辞职去旅行');
    const data = await (await fetch(base + '/api/preview?id=' + topic.id)).json();
    assert.equal(data.id, topic.id);
    assert.equal(data.preview.left.name, '甲');
    assert.match(data.preview.left.quote, /我支持这件事，值得去。/);
    assert.equal(data.preview.right.name, '乙');
    assert.match(data.preview.right.quote, /我反对这件事，不该去。/);
    assert.ok(data.preview.sharedQuestion, 'the shared question comes with the preview');
  });
});

test('a preview whose stored quote no longer matches degrades to nothing', async () => {
  await withServer({ hot: headlines([]) }, async base => {
    await saveAutoTopic({ id: autoTopicId('来源已换的辩题'), autoArranged: true, query: '来源已换的辩题',
      title: '来源已换的辩题', titleLines: ['来源已换的辩题'], intro: 'x', label: 'x',
      left: '支持', right: '反对', leftShort: '支持', rightShort: '反对',
      lenses: ['a'], hosts: ['b'], sharedQuestions: ['该不该？'], questions: [],
      selections: [[{ id: '1', name: '甲', evidence: '这句话已经不在正文里了。' }, { id: '2', name: '乙', evidence: '我反对这件事，不该去。' }]],
      featuredSource: null, featuredRank: null, featuredLabel: null, addedAt: '2026-09-14', reviewedAt: null, createdAt: '2026-09-14', model: 'stub' });
    const data = await (await fetch(base + '/api/preview?id=' + autoTopicId('来源已换的辩题'))).json();
    assert.equal(data.preview, null, 'a dead quote is dropped instead of being shown');
  });
});
