import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeWithDeepSeek, critiqueWithDeepSeek, filterWithDeepSeek } from '../scripts/deepseek.mjs';

test('DeepSeek summary prompt preserves the answerer voice instead of flattening it into generic AI prose', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: '我觉得先把日子过稳，再慢慢看成长。' } }] }) };
  };
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  try {
    const result = await summarizeWithDeepSeek({ sourceId: 'answer-1', text: '我觉得先把日子过稳，再慢慢看成长。' });
    assert.equal(result.summary, '我觉得先把日子过稳，再慢慢看成长。');
    const system = request.messages.find(message => message.role === 'system').content;
    assert.match(system, /保留.*语气/);
    assert.match(system, /第一人称/);
    assert.match(system, /条件/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test('DeepSeek critique uses the deepseek-flash model and returns a focused answer', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    const content = '先看这条回答把共同支出和情感往来混在了一起，再判断它的结论是否成立。';
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  try {
    const critique = await critiqueWithDeepSeek({
      sourceId: 'answer-1', topic: '情侣AA制', side: '左方：更看重共同承担',
      evidence: '共同支出应该按双方情况协商。', text: '回答全文', question: '这条观点最薄弱的地方是什么？'
    });
    assert.match(critique.answer, /共同支出/);
    assert.equal(critique.model, 'deepseek-flash');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].model, 'deepseek-flash');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

// ---- Streaming, queue wait and fallback ----
const encoder = new TextEncoder();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const delta = text => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
// A fake SSE body that stops (like real fetch) when the request is aborted.
function streamResponse(signal, { events = [], hang = false, gap = 0 } = {}) {
  const body = new ReadableStream({
    async start(controller) {
      const fail = () => { try { controller.error(new DOMException('aborted', 'AbortError')); } catch { /* already closed */ } };
      if (signal?.aborted) return fail();
      signal?.addEventListener('abort', fail, { once: true });
      for (const [index, line] of events.entries()) {
        if (gap && index > 0) await sleep(gap);
        if (signal?.aborted) return;
        try { controller.enqueue(encoder.encode(line)); } catch { return; }
      }
      if (!hang) { try { controller.close(); } catch { /* aborted */ } }
    }
  });
  return { ok: true, status: 200, body };
}
async function withDeepSeek(fetchImpl, run, queueMs) {
  const saved = { fetch: globalThis.fetch, key: process.env.DEEPSEEK_API_KEY, queue: process.env.ZHIBIAN_AI_QUEUE_MS };
  globalThis.fetch = fetchImpl;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  if (queueMs === undefined) delete process.env.ZHIBIAN_AI_QUEUE_MS; else process.env.ZHIBIAN_AI_QUEUE_MS = String(queueMs);
  try { await run(); } finally {
    globalThis.fetch = saved.fetch;
    if (saved.key === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = saved.key;
    if (saved.queue === undefined) delete process.env.ZHIBIAN_AI_QUEUE_MS; else process.env.ZHIBIAN_AI_QUEUE_MS = saved.queue;
  }
}

test('DeepSeek streams the completion, ignoring keep-alive lines', async () => {
  const requests = [];
  await withDeepSeek(async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return streamResponse(options.signal, { events: [': keep-alive\n\n', delta('先把日子'), delta('过稳。'), 'data: [DONE]\n\n'] });
  }, async () => {
    const result = await summarizeWithDeepSeek({ sourceId: 'a1', text: '回答正文' });
    assert.equal(result.summary, '先把日子过稳。');
    assert.equal(result.model, 'deepseek-flash');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].stream, true);
    assert.deepEqual(requests[0].thinking, { type: 'disabled' });
  });
});

test('a queued deepseek-flash request switches to deepseek-v4-pro after the short wait', async () => {
  const requests = [];
  await withDeepSeek(async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body.model);
    return body.model === 'deepseek-flash'
      ? streamResponse(options.signal, { events: [': keep-alive\n\n', ': keep-alive\n\n'], hang: true })
      : streamResponse(options.signal, { events: [delta('备用模型写出的摘要。'), 'data: [DONE]\n\n'] });
  }, async () => {
    const started = Date.now();
    const result = await summarizeWithDeepSeek({ sourceId: 'a1', text: '回答正文' });
    assert.equal(result.summary, '备用模型写出的摘要。');
    assert.equal(result.model, 'deepseek-v4-pro', 'the card names the model that actually answered');
    assert.deepEqual(requests, ['deepseek-flash', 'deepseek-v4-pro']);
    assert.ok(Date.now() - started < 1500, 'the switch happens after the queue wait, not after a full timeout');
  }, 60);
});

test('a slow answer that has already started is not switched to the fallback', async () => {
  const requests = [];
  await withDeepSeek(async (_url, options) => {
    requests.push(JSON.parse(options.body).model);
    return streamResponse(options.signal, { events: [delta('第一句。'), delta('第二句。'), delta('第三句。'), 'data: [DONE]\n\n'], gap: 80 });
  }, async () => {
    const result = await summarizeWithDeepSeek({ sourceId: 'a1', text: '回答正文' });
    assert.equal(result.model, 'deepseek-flash');
    assert.match(result.summary, /第三句/);
    assert.deepEqual(requests, ['deepseek-flash']);
  }, 50);
});

test('when both models fail the caller gets a plain AI_UPSTREAM error', async () => {
  const requests = [];
  await withDeepSeek(async (_url, options) => {
    const model = JSON.parse(options.body).model;
    requests.push(model);
    return model === 'deepseek-flash' ? streamResponse(options.signal, { events: [': keep-alive\n\n'], hang: true }) : { ok: false, status: 503 };
  }, async () => {
    await assert.rejects(summarizeWithDeepSeek({ sourceId: 'a1', text: '回答正文' }), error => error.code === 'AI_UPSTREAM');
    assert.deepEqual(requests, ['deepseek-flash', 'deepseek-v4-pro']);
  }, 40);
});

test('DeepSeek filters a batch of search results for direct topic relevance without assigning sides', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify([{ id: 'a1', relevant: true, reason: '直接讨论题目。' }, { id: 'a2', relevant: false, reason: '只提到关键词，实际讨论别的问题。' }]) } }] }) };
  };
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  try {
    const result = await filterWithDeepSeek({ topic: '情侣AA制', items: [
      { id: 'a1', sourceTitle: '情侣之间应该如何AA？', text: '回答正文一' },
      { id: 'a2', sourceTitle: '如何安排周末旅行？', text: '回答正文二' }
    ] });
    assert.deepEqual(result.items, [
      { id: 'a1', relevant: true, reason: '直接讨论题目。' },
      { id: 'a2', relevant: false, reason: '只提到关键词，实际讨论别的问题。' }
    ]);
    assert.equal(result.model, 'deepseek-flash');
    assert.equal(request.model, 'deepseek-flash');
    assert.match(request.messages[0].content, /某一方的依据/);
    assert.match(request.messages[0].content, /不必来自与辩题字面相同的问题/, 'an answer may join a side without coming from the same question page');
    assert.match(request.messages[0].content, /不判断左右阵营/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});
