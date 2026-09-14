import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createState, transition, escapeHtml } from '../web/data.js';
import { handleRequest } from '../scripts/serve.mjs';

test('a spectator can watch every round and reach the recap without voting', () => {
  let s = createState();
  assert.equal(s.round, 0);
  s = transition(s, { type: 'next' });
  assert.equal(s.round, 1);
  s = transition(s, { type: 'next' });
  assert.equal(s.round, 2);
  s = transition(s, { type: 'next' });
  assert.equal(s.view, 'recap');
  assert.deepEqual(s.seen, [0, 1, 2]);
  s = transition(s, { type: 'arena' });
  assert.equal(s.round, 2);
  assert.equal(s.view, 'arena');
});
test('topic switches reset the round and invalid actions do not corrupt the view', () => {
  const s = transition(createState(), { type: 'round', index: 2 });
  assert.deepEqual(transition(s, { type: 'topic', id: 'career' }), createState('career'));
  for (const index of [-1, 3, NaN, 1.2]) assert.equal(transition(s, { type: 'round', index }), s);
  assert.equal(transition(s, { type: 'topic', id: 'missing' }), s);
  assert.equal(transition(createState(), { type: 'back' }).round, 0);
});
test('one real pair reaches recap without inventing two additional rounds', () => {
  const one = createState('career', 1);
  assert.equal(transition(one, { type: 'next' }).view, 'recap');
  assert.equal(transition(one, { type: 'round', index: 1 }), one);
  assert.equal(transition(one, { type: 'round', index: 2 }), one);
});
test('round count is reset to the number of real pairs returned for the next topic', () => {
  const next = transition(createState(), { type: 'topic', id: 'career', count: 1 });
  assert.equal(next.roundCount, 1);
  assert.equal(next.round, 0);
});
test('external text cannot become executable HTML', () => {
  assert.equal(escapeHtml('<img onerror="x">&\''), '&lt;img onerror=&quot;x&quot;&gt;&amp;&#39;');
});
test('preview serves only web assets and never exposes project documents', async () => {
  const server = http.createServer(handleRequest);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const root = await fetch(base);
    assert.equal(root.status, 200);
    assert.match(await root.text(), /知辨/);
    const js = await fetch(base + '/app.js');
    assert.match(js.headers.get('content-type'), /javascript/);
    assert.equal((await fetch(base + '/package.json')).status, 404);
    assert.equal((await fetch(base + '/%2e%2e%5cpackage.json')).status, 403);
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
