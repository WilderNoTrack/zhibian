import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as app from '../scripts/serve.mjs';

async function withApp(search, work) {
  assert.equal(typeof app.createRequestHandler, 'function', 'live API handler must exist');
  const server = http.createServer(app.createRequestHandler({ search }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await work('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const response = items => ({ Code: 0, Message: 'success', Data: { Items: items, HasMore: false } });
const source = (id, name, text, extra = {}) => ({
  ContentID: id, ContentType: 'Answer', Title: '可以辞职全职带娃吗?',
  Url: 'https://www.zhihu.com/question/123/answer/' + id + '?utm_source=test',
  ContentText: text, AuthorName: name, AuthorAvatar: '', AuthorBadgeText: '',
  CommentCount: 0, VoteUpCount: 0, EditTime: 1787582023, ...extra
});

test('catalog is available without spending a search request', async () => {
  await withApp(() => { throw Error('must not search'); }, async base => {
    const res = await fetch(base + '/api/topics');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.topics.some(t => t.id === 'parenting'));
    assert.ok(data.topics.every(t => !t.rounds));
  });
});
test('lobby and debate deep links load the app without exposing unrelated paths', async () => {
  await withApp(() => { throw Error('must not search'); }, async base => {
    for (const route of ['/topics', '/topics?category=family', '/library', '/debate?id=career']) {
      const res = await fetch(base + route);
      assert.equal(res.status, 200, route);
      assert.match(res.headers.get('content-type'), /text\/html/);
      assert.match(await res.text(), /id="app"/);
    }
    assert.equal((await fetch(base + '/not-a-page')).status, 404);
  });
});
test('search keeps real attribution, strips markup and rejects unsafe source links', async () => {
  await withApp(async query => {
    assert.equal(query, '带娃');
    return response([
      source('99', '真实名字', '首段<em>内容</em> &amp; 尾段'),
      source('98', '不安全', '内容', { Url: 'javascript:alert(1)' }),
      source('97', '冒充域名', '内容', { Url: 'https://zhihu.com.evil.test/answer/97' })
    ]);
  }, async base => {
    const res = await fetch(base + '/api/search?q=' + encodeURIComponent('带娃'));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0].name, '真实名字');
    assert.equal(data.items[0].text, '首段内容 & 尾段');
    assert.equal(data.items[0].originalText, '首段内容 & 尾段');
    assert.equal(data.items[0].sourceUrl, 'https://www.zhihu.com/question/123/answer/99?utm_source=test');
    assert.equal(data.items[0].kind, 'zhihu');
    assert.equal(data.items[0].background, null);
  });
});
test('matching source ids without the reviewed quote never fill a debate seat', async () => {
  await withApp(async () => response([source('2078831272391075654', '星澜', '已经完全修改的内容')]), async base => {
    const data = await (await fetch(base + '/api/debate?id=parenting')).json();
    assert.equal(data.rounds.length, 0);
    assert.equal(data.items.length, 1);
    assert.equal(data.mode, 'reading');
  });
});
test('reviewed opposing excerpts form a real pair without fictional filler', async () => {
  await withApp(async () => response([
    source('2078831272391075654', '星澜', '我自己，曾经是有一份工作的，而且说起来还不错，事业编的教师。但为了孩子。为了不在两地生活，我选择了辞职全职带着他们。\n说实话，没有人给我开工资。但我依然享受在其中，乐在其中。'),
    source('2078402735305762660', '鑫妈辅娃记', '我的答案：不愿意\n不是不爱孩子，恰恰是因为爱，才不敢轻易把自己全部牺牲进去。')
  ]), async base => {
    const data = await (await fetch(base + '/api/debate?id=parenting')).json();
    assert.equal(data.rounds.length, 1);
    assert.deepEqual(data.rounds[0].map(s => s.name), ['星澜', '鑫妈辅娃记']);
    assert.ok(data.rounds[0].every(s => s.text.includes(s.evidence)));
    assert.equal(data.mode, 'debate');
    assert.equal(data.missingSeats, 4);
  });
});
test('identical searches are cached and upstream quota failures are not retried', async () => {
  let calls = 0;
  await withApp(async () => { calls++; return response([]); }, async base => {
    await fetch(base + '/api/search?q=hello');
    const second = await (await fetch(base + '/api/search?q=hello')).json();
    assert.equal(calls, 1);
    assert.equal(second.cached, true);
  });
  calls = 0;
  await withApp(async () => { calls++; return { Code: 30001, Message: 'rate limit exceeded' }; }, async base => {
    const result = await fetch(base + '/api/search?q=hello');
    assert.equal(result.status, 429);
    assert.equal((await result.json()).code, 'RATE_LIMIT');
    assert.equal(calls, 1);
  });
});
test('invalid and cross-origin requests cannot spend the local account quota', async () => {
  await withApp(() => { throw Error('must not search'); }, async base => {
    assert.equal((await fetch(base + '/api/search?q=x')).status, 400);
    assert.equal((await fetch(base + '/api/debate?id=unknown')).status, 400);
    assert.equal((await fetch(base + '/api/search?q=hello', { headers: { Origin: 'https://evil.test' } })).status, 403);
    assert.equal((await fetch(base + '/api/search?q=hello', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  });
});
test('upstream exceptions are sanitized rather than exposing credentials or command output', async () => {
  await withApp(() => { throw Error('secret=do-not-disclose private-path'); }, async base => {
    const res = await fetch(base + '/api/search?q=hello');
    assert.equal(res.status, 502);
    assert.doesNotMatch(await res.text(), /do-not-disclose|private-path/);
  });
});
