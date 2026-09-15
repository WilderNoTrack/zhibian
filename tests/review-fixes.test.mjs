// Regression tests for bugs found in the 2026-09-15 code review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.ZHIBIAN_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'zhibian-review-'));
const { createRequestHandler } = await import('../scripts/serve.mjs');
const { catalog } = await import('../scripts/catalog.mjs');
const { debateSeeds } = await import('../scripts/debate-seeds.mjs');
const { createState, transition } = await import('../web/data.js');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const empty = { Code: 0, Data: { Items: [] } };
const noVariants = async () => ({ queries: [], model: 'stub' });
async function withServer(handler, work) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await work(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
async function until(predicate, label) {
  for (let i = 0; i < 150; i++) { if (predicate()) return; await sleep(20); }
  assert.fail('timed out: ' + label);
}

test("a reader's search waits for a slot instead of failing while previews are loading", async () => {
  const started = [];
  const handler = createRequestHandler({
    hot: async () => empty, expandQueries: noVariants,
    search: async query => { started.push(query); await sleep(250); return empty; }
  });
  await withServer(handler, async base => {
    const queryOf = id => catalog.find(topic => topic.id === id).query;
    // Two carousel previews take both search slots…
    const busy = ['aa', 'partner'].map(id => fetch(`${base}/api/preview?id=${id}`));
    await until(() => started.length >= 2, 'both slots busy');
    // …a third preview queues behind them, then the reader searches.
    const queuedPreview = fetch(`${base}/api/preview?id=privacy`);
    await sleep(80);
    const reader = await fetch(`${base}/api/search?q=${encodeURIComponent('读者自己的问题')}`);
    assert.equal(reader.status, 200, 'the reader is queued, not refused');
    for (const response of await Promise.all([...busy, queuedPreview])) assert.equal(response.status, 200);
    assert.ok(started.indexOf('读者自己的问题') !== -1 && started.indexOf('读者自己的问题') < started.indexOf(queryOf('privacy')),
      'the reader goes ahead of a background preview that was queued first');
  });
});

test('seed topics are still collected when the hot list is rate limited', async () => {
  const searched = [];
  const handler = createRequestHandler({
    hot: async () => ({ Code: 30001 }), expandQueries: noVariants,
    search: async query => { searched.push(query); return empty; }
  });
  await withServer(handler, async base => {
    assert.equal((await fetch(`${base}/api/topics`)).status, 200);
    await until(() => searched.length > 0, 'a seed search');
    assert.ok(searched.some(query => debateSeeds.some(seed => seed.topic === query)), 'a seed topic went through the pipeline');
  });
});

test('every curated topic names and explains each of its rounds', () => {
  for (const topic of catalog) {
    assert.equal(topic.lenses.length, topic.selections.length, `${topic.id}: one lens per round`);
    assert.equal(topic.hosts.length, topic.selections.length, `${topic.id}: one note per round`);
    assert.ok(topic.lenses.every(lens => typeof lens === 'string' && lens.trim()), `${topic.id}: no blank lens`);
  }
});

test('a debate with more than three verified rounds can reach every round', () => {
  let state = createState('auto-x', 4);
  assert.equal(state.roundCount, 4);
  state = transition(state, { type: 'round', index: 3 });
  assert.equal(state.round, 3);
  assert.equal(transition(state, { type: 'next' }).view, 'recap');
  assert.equal(createState('auto-y', 0).roundCount, 1, 'never fewer than one round');
});
