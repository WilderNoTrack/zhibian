// Multi-query retrieval. Zhihu search caps at ten results per query, so the
// server asks the model for extra phrasings, searches each, and merges the
// results — otherwise the answers arguing the other side stay invisible.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.ZHIBIAN_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'zhibian-pool-'));
const { createRequestHandler } = await import('../scripts/serve.mjs');
const { resetTopicQueries } = await import('../scripts/topic-queries.mjs');
const { resetTopicHealth, recordTopicHealth } = await import('../scripts/topic-health.mjs');

const answer = (id, name, text) => ({ ContentID: id, ContentType: 'Answer', Title: '来源问题 - 知乎',
  Url: `https://www.zhihu.com/question/1/answer/${id}`, ContentText: text, AuthorName: name, AuthorAvatar: '', AuthorBadgeText: '' });
const ok = items => ({ Code: 0, Data: { Items: items } });

async function withApp(overrides, work) {
  const searches = [];
  let filtered = null, arranged = null;
  const server = http.createServer(createRequestHandler({
    hot: async () => ok([]),
    expandQueries: async () => ({ queries: ['裸辞后悔', '裸辞值得'], model: 'stub' }),
    search: async query => { searches.push(query); return ok(overrides.items?.[query] || []); },
    filter: async input => { filtered = input.items; return { items: input.items.map(i => ({ id: i.id, relevant: true, reason: '相关' })), model: 'stub' }; },
    arrange: async input => { arranged = input.items; return { model: 'stub', arrangement: { rounds: [] } }; },
    verifyOpposition: async ({ rounds }) => ({ verdicts: rounds.map(() => ({ opposed: true, leftPosition: '支持', rightPosition: '反对' })), model: 'stub' }),
    ...overrides.handlers
  }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { await work('http://127.0.0.1:' + server.address().port, { searches: () => searches, filtered: () => filtered, arranged: () => arranged }); }
  finally { await new Promise(r => server.close(r)); }
}

test('a topic is searched under every generated phrasing, then merged', async () => {
  const items = {
    '该不该裸辞': [answer('1', '甲', '辞了以后我后悔了。'), answer('2', '乙', '我裸辞了，很值。')],
    '裸辞后悔': [answer('2', '乙', '我裸辞了，很值。'), answer('3', '丙', '后悔的人比想象的多。')],
    '裸辞值得': [answer('4', '丁', '裸辞之后我睡得很好。')]
  };
  await withApp({ items }, async (base, seen) => {
    await fetch(base + '/api/debate?q=' + encodeURIComponent('该不该裸辞'));
    assert.deepEqual(seen.searches(), ['该不该裸辞', '裸辞后悔', '裸辞值得'], 'the original first, then each generated phrasing');
    const ids = seen.filtered().map(item => item.id);
    assert.deepEqual([...ids].sort(), ['1', '2', '3', '4'], 'answers from every phrasing reach the filter');
    assert.equal(new Set(ids).size, ids.length, 'and an answer returned twice is only kept once');
  });
});

test('the original wording is always searched, and a broken expansion degrades to it', async () => {
  const searched = [];
  await withApp({
    items: { '该不该裸辞': [answer('1', '甲', '辞了以后我后悔了。')] },
    handlers: { expandQueries: async () => { throw Object.assign(new Error('no ai'), { code: 'AI_NOT_CONFIGURED' }); }, search: async query => { searched.push(query); return ok(searched.length === 1 ? [answer('1', '甲', '辞了以后我后悔了。')] : []); } }
  }, async base => {
    await fetch(base + '/api/debate?q=' + encodeURIComponent('该不该裸辞'));
    assert.deepEqual(searched, ['该不该裸辞'], 'without generated phrasings it still searches the question itself');
  });
});

test('when a phrasing fails, the answers already gathered are still used', async () => {
  await withApp({
    items: { '该不该裸辞': [answer('1', '甲', '辞了以后我后悔了。'), answer('2', '乙', '我裸辞了，很值。')] },
    handlers: {
      search: async query => {
        if (query === '裸辞后悔') throw Object.assign(new Error('limited'), { status: 429, code: 'RATE_LIMIT' });
        return ok([answer('1', '甲', '辞了以后我后悔了。'), answer('2', '乙', '我裸辞了，很值。')]);
      }
    }
  }, async (base, seen) => {
    const data = await (await fetch(base + '/api/debate?q=' + encodeURIComponent('该不该裸辞'))).json();
    assert.equal(data.code, undefined, 'a partial pool must not turn into an error page');
    assert.deepEqual(seen.filtered().map(i => i.id).sort(), ['1', '2'], 'whatever was already gathered is used');
  });
});

test('generated phrasings are kept on disk and reused instead of re-asking', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  await resetTopicQueries();
  await resetTopicHealth();
  let expansions = 0;
  const handlers = { expandQueries: async () => { expansions++; return { queries: [`裸辞后悔${expansions}`, '裸辞值得'], model: 'stub' }; } };
  const items = { '该不该裸辞': [answer('1', '甲', '辞了以后我后悔了。')] };
  await withApp({ items, handlers }, async base => {
    await fetch(base + '/api/debate?q=' + encodeURIComponent('该不该裸辞'));
    assert.equal(expansions, 1);
  });
  // The write is fire-and-forget, and reset() already created the file, so poll
  // for the entry itself rather than for the file.
  const planFile = path.join(process.env.ZHIBIAN_DATA_DIR, 'topic-queries.json');
  const readPlan = () => { try { return JSON.parse(readFileSync(planFile, 'utf8')); } catch { return {}; } };
  for (let i = 0; i < 200 && !readPlan()['该不该裸辞']; i++) await new Promise(r => setTimeout(r, 10));
  const saved = readPlan();
  assert.deepEqual(saved['该不该裸辞'].queries, ['裸辞后悔1', '裸辞值得'], 'the plan is written down');

  // A second server process would read that file; here the in-process cache is
  // cleared to prove the stored plan is what gets used.
  await withApp({ items: { '该不该裸辞': [answer('1', '甲', '辞了以后我后悔了。')], '裸辞后悔1': [answer('2', '乙', '我裸辞了，很值。')] }, handlers }, async (base, seen) => {
    await fetch(base + '/api/debate?q=' + encodeURIComponent('该不该裸辞'));
    assert.equal(expansions, 1, 'the stored phrasings are reused, not regenerated');
    assert.deepEqual(seen.searches(), ['该不该裸辞', '裸辞后悔1', '裸辞值得']);
  });
});

test('a topic known to be short of rounds rerolls its phrasings', async () => {
  await resetTopicQueries();
  await resetTopicHealth();
  let expansions = 0;
  const handlers = { expandQueries: async () => { expansions++; return { queries: [`第${expansions}轮`, '另一边'], model: 'stub' }; } };
  const items = { '该不该裸辞': [answer('1', '甲', '辞了以后我后悔了。')] };
  await withApp({ items, handlers }, async base => {
    await fetch(base + '/api/debate?q=' + encodeURIComponent('该不该裸辞'));
    assert.equal(expansions, 1);
  });
  // Pretend that attempt only produced a one-round debate.
  await recordTopicHealth('q:该不该裸辞', 1);
  await withApp({ items, handlers }, async base => {
    await fetch(base + '/api/debate?q=' + encodeURIComponent('该不该裸辞'));
    assert.equal(expansions, 2, 'a topic that came up short gets a fresh plan');
  });
});

test('the interface reports the real pipeline stages while a search runs', async () => {
  await withApp({ items: { '该不该裸辞': [answer('1', '甲', '辞了以后我后悔了。')] } }, async base => {
    const data = await (await fetch(base + '/api/search?q=' + encodeURIComponent('该不该裸辞') + '&job=test-job')).json();
    assert.ok(Array.isArray(data.queries) && data.queries.includes('该不该裸辞'), 'the response names the phrasings that were used');
    const stages = (await (await fetch(base + '/api/progress?job=test-job')).json()).stages;
    assert.ok(stages.length >= 3, 'the pipeline recorded several stages');
    assert.ok(stages.some(s => s.label.includes('搜索')), 'including which keywords were searched');
    assert.ok(stages.some(s => s.label.includes('合并去重')), 'and that the pool was merged');
    const unknown = (await (await fetch(base + '/api/progress?job=nope')).json()).stages;
    assert.deepEqual(unknown, [], 'an unknown job reports nothing instead of an error');
  });
});
