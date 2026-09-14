import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequestHandler} from '../scripts/serve.mjs';
const good = {Title:'书皮该不该统一？', Url:'https://www.zhihu.com/question/2078976752232280700', Summary:'公开的问题描述'};
async function withHot(hot, work) {
  const server = http.createServer(createRequestHandler({hot, search:()=>{throw Error('must not search');}}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {await work('http://127.0.0.1:'+server.address().port);} finally {await new Promise(r=>server.close(r));}
}
test('hot feed normalizes real ranked sources, filters hostile links, deduplicates and caches concurrent loads', async()=>{
  let calls=0;
  await withHot(async()=>{calls++; await new Promise(r=>setTimeout(r,20)); return {Code:0,Data:{Items:[good,{...good,Url:'https://zhihu.com.evil.test/question/3'},good,{Title:'<b>另一题</b>',Url:'https://www.zhihu.com/question/4'}]}};},async base=>{
    const responses=await Promise.all([fetch(base+'/api/hot'),fetch(base+'/api/hot')]);
    assert.equal(responses[0].status,200);
    const data=await responses[0].json();
    assert.equal(data.items.length,2);
    assert.equal(data.items[0].title,'书皮该不该统一？');
    assert.equal(data.items[0].rank,1);
    assert.equal(data.items[1].rank,4);
    assert.equal(data.items[1].title,'另一题');
    assert.ok(Date.parse(data.fetchedAt));
    assert.equal((await(await fetch(base+'/api/hot')).json()).cached,true);
    assert.equal(calls,1);
  });
});
test('hot failures are sanitized and cooled down without hiding the local category catalog',async()=>{
  let calls=0;
  await withHot(async()=>{calls++; throw Error('private-path secret-value');},async base=>{
    const res=await fetch(base+'/api/hot'); assert.equal(res.status,502);
    assert.doesNotMatch(await res.text(),/secret-value|private-path/);
    await fetch(base+'/api/hot'); assert.equal(calls,1);
    assert.equal((await fetch(base+'/api/topics')).status,200);
    assert.equal((await fetch(base+'/api/hot',{headers:{Origin:'https://evil.test'}})).status,403);
  });
});
