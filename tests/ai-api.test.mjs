import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequestHandler } from '../scripts/serve.mjs';

async function withApp(summarize, work, extras = {}) {
  const server = http.createServer(createRequestHandler({ summarize, ...extras }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await work('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

async function postJson(base, body, headers = {}) {
  return fetch(base + '/api/summarize', {
    method: 'POST', headers: {'Content-Type': 'application/json', ...headers},
    body: JSON.stringify(body)
  });
}

async function post(path, base, body) {
  return fetch(base + path, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
  });
}

test('AI summary endpoint delegates source text without exposing provider credentials', async () => {
  let received;
  await withApp(async input => {
    received = input;
    return { summary: '这是一段保留条件的测试摘要。', model: 'test-model' };
  }, async base => {
    const response = await postJson(base, { sourceId: 'answer-1', text: '原始回答内容' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { summary: '这是一段保留条件的测试摘要。', model: 'test-model', cached: false });
    assert.deepEqual(received, { sourceId: 'answer-1', text: '原始回答内容' });
    assert.doesNotMatch(await (await postJson(base, { sourceId: 'answer-2', text: '第二条' })).text(), /sk-|secret|key/i);
  });
});

test('AI summary endpoint rejects missing or oversized source text before calling the provider', async () => {
  let calls = 0;
  await withApp(async () => { calls++; return { summary: '不应出现' }; }, async base => {
    assert.equal((await postJson(base, { sourceId: '', text: '内容' })).status, 400);
    assert.equal((await postJson(base, { sourceId: 'x', text: 'x'.repeat(60001) })).status, 400);
    assert.equal(calls, 0);
  });
});

test('AI critique accepts arbitrary user questions', async () => {
  const calls = [];
  await withApp(async () => ({ summary: '摘要' }), async base => {
    const critiqueResponse = await post('/api/critique', base, {
      sourceId: 'a1', topic: '情侣AA制', side: '左方', evidence: '共同承担', text: '回答全文',
      question: '这条回答有没有偷换概念？'
    });
    assert.equal(critiqueResponse.status, 200);
    assert.deepEqual(await critiqueResponse.json(), { answer: '质询结果', model: 'deepseek-flash', cached: false });
  }, {
    critique: async input => { calls.push({type: 'critique', ...input}); return { answer: '质询结果', model: 'deepseek-flash' }; }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].question, '这条回答有没有偷换概念？');
});

test('AI filter endpoint runs automatically on a batch of search results', async () => {
  let received;
  await withApp(async () => ({ summary: '摘要' }), async base => {
    const response = await post('/api/filter', base, { topic: '情侣AA制', items: [
      { id: 'a1', sourceTitle: '情侣AA制怎么分摊？', text: '回答正文' }
    ] });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [{ id: 'a1', relevant: true, reason: '直接讨论题目。' }], model: 'deepseek-flash', cached: false });
  }, { filter: async input => { received = input; return { items: [{ id: 'a1', relevant: true, reason: '直接讨论题目。' }], model: 'deepseek-flash' }; } });
  assert.equal(received.topic, '情侣AA制');
  assert.equal(received.items[0].id, 'a1');
});
