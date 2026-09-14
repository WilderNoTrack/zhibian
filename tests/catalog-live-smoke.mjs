// Opt-in only: calls the running local app and consumes official API quota on cache misses.
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:5173';
const get = async route => {
  const res = await fetch(base + route, {signal:AbortSignal.timeout(60000)});
  const body = await res.json();
  assert.equal(res.status,200,body.message || route);
  return body;
};
const {topics} = await get('/api/topics');
assert.equal(topics.length,16);
const results = [];
for(const topic of topics) {
    const d=await get('/api/debate?id='+topic.id);
    assert.equal(d.id,topic.id);
    assert.ok(d.items.every(s=>new URL(s.sourceUrl).hostname.endsWith('zhihu.com')));
    assert.ok(d.rounds.every(pair=>pair.length===2 && pair.every(s=>s.text.includes(s.evidence))));
    const result={id:d.id,mode:d.mode,pairs:d.rounds.length,sources:d.items.length,names:d.rounds.flat().map(s=>s.name)};
    results.push(result); console.log(JSON.stringify(result));
}
const hot=await get('/api/hot');
assert.ok(hot.items.length>0);
console.log(JSON.stringify({hotItems:hot.items.length,hotFetchedAt:hot.fetchedAt}));
const readings=results.filter(r=>!r.pairs).map(r=>r.id);
console.log(JSON.stringify({verifiedTopics:results.length,debates:results.length-readings.length,readingFallbacks:readings}));
