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
