// The hot-list API has a small daily quota; the server must not spend it on
// every lobby load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.ZHIBIAN_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'zhibian-hot-budget-'));
const { createRequestHandler } = await import('../scripts/serve.mjs');
const { fileHotState, nextBeijingMidnight, beijingDay } = await import('../scripts/hot-budget.mjs');

const HOUR = 60 * 60 * 1000;
const start = Date.parse('2026-09-15T02:00:00Z'); // 10:00 Beijing time
const list = { Code: 0, Data: { Items: [{ Title: '要不要换工作', Url: 'https://www.zhihu.com/question/1' }] } };
const quiet = { search: async () => ({ Code: 0, Data: { Items: [] } }), expandQueries: async () => ({ queries: [], model: 'stub' }) };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function withServer(options, work) {
  const server = http.createServer(createRequestHandler({ ...quiet, ...options }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await work(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('Beijing day helpers', () => {
  assert.equal(beijingDay(Date.parse('2026-09-15T15:59:00Z')), '2026-09-15');
  assert.equal(beijingDay(Date.parse('2026-09-15T16:00:00Z')), '2026-09-16');
  assert.equal(new Date(nextBeijingMidnight(start)).toISOString(), '2026-09-15T16:00:00.000Z');
});

test('a whole day of requests every five minutes fetches the hot list at most ten times', async () => {
  let calls = 0, now = start;
  await withServer({ hot: async () => { calls++; return list; }, clock: () => now }, async base => {
    for (let minute = 0; minute < 24 * 60; minute += 5) {
      now = start + minute * 60 * 1000;
      assert.equal((await fetch(base + '/api/hot')).status, 200);
    }
  });
  assert.ok(calls <= 10, `${calls} calls in 24 hours`);
  assert.ok(calls >= 9, 'the list is still refreshed through the day');
});

test('once Zhihu reports the quota used up, nothing is called until Beijing midnight', async () => {
  let calls = 0, now = start;
  await withServer({ hot: async () => { calls++; return { Code: 30001 }; }, clock: () => now }, async base => {
    assert.equal((await fetch(base + '/api/hot')).status, 429);
    for (let hour = 1; hour <= 13; hour++) { now = start + hour * HOUR; await fetch(base + '/api/hot'); } // until 23:00
    assert.equal(calls, 1, 'no retries for the rest of the day');
    now = nextBeijingMidnight(start) + 60 * 1000; // 00:01 the next day
    await fetch(base + '/api/hot');
    assert.equal(calls, 2, 'tries again once the quota has reset');
  });
});

test('a restarted server reuses the saved list instead of calling again', async () => {
  let calls = 0;
  const hot = async () => { calls++; return list; };
  await withServer({ hot, clock: () => start, hotState: fileHotState() }, async base => {
    assert.equal((await fetch(base + '/api/hot')).status, 200);
  });
  await withServer({ hot, clock: () => start + HOUR, hotState: fileHotState() }, async base => {
    const data = await (await fetch(base + '/api/hot')).json();
    assert.equal(data.items[0].title, '要不要换工作');
    assert.equal(data.cached, true);
  });
  assert.equal(calls, 1);
});

test('twenty lobby loads spend at most one hot-list call', async () => {
  let calls = 0;
  await withServer({ hot: async () => { calls++; return { Code: 30001 }; } }, async base => {
    for (let i = 0; i < 20; i++) { assert.equal((await fetch(base + '/api/topics')).status, 200); await sleep(15); }
  });
  assert.equal(calls, 1);
});
