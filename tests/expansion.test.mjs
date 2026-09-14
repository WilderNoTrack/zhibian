import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { publicCatalog, catalog } from '../scripts/catalog.mjs';
import { categories, lobbyView } from '../web/lobby.js';
import { transition, createState, pickFeatured } from '../web/data.js';
import {readFile} from 'node:fs/promises';
import {arrangeDebate, normalizeItems} from '../scripts/zhihu.mjs';

test('all eight category entrances lead only to their topics, covering sixteen unique debates', () => {
  const groups = categories(publicCatalog);
  assert.deepEqual(groups.map(c => [c.name, c.topics.length]), [
    ['情感与婚恋',3], ['职场与生存',3], ['钱与消费',3], ['家庭与代际',3],
    ['教育与养娃',1], ['人生与选择',1], ['科技与 AI',1], ['影视与审美',1]
  ]);
  const ids = new Set();
  for (const group of groups) {
    const doc = new JSDOM(lobbyView(publicCatalog, group.id)).window.document;
    assert.ok(doc.querySelector('.topic-header'), 'a category page shows its own header');
    for (const link of doc.querySelectorAll('.feed-title a[data-action="choose-topic"]')) {
      const id = new URL(link.href, 'http://localhost').searchParams.get('id');
      assert.equal(catalog.find(t => t.id === id)?.category, group.name);
      ids.add(id);
      assert.equal(transition(createState(), {type:'topic', id}).topicId, id);
    }
  }
  assert.equal(ids.size, 16);
  assert.equal(transition(createState(), {type:'topic', id:'missing'}).topicId, 'parenting');
});

test('every published debate has exactly three independently sourced rounds', () => {
  assert.equal(catalog.length, 17);
  for (const topic of catalog) {
    assert.equal(topic.selections.length, 3, `${topic.id} must have three rounds`);
    const sourceIds = topic.selections.flat().map(seat => seat.id);
    assert.equal(new Set(sourceIds).size, 6, `${topic.id} cannot reuse a source in another round`);
  }
});

test('today feature is a complete three-round debate rather than a list of outbound hot links', () => {
  const today = publicCatalog.find(topic => topic.id === 'today-hot');
  assert.ok(today, 'today debate must be in the public catalog');
  assert.equal(today.reviewedPairs, 3);
  const doc = new JSDOM(lobbyView(publicCatalog, null, [today])).window.document;
  const slide = doc.querySelector('#featured-carousel .carousel-slide[data-id="today-hot"]');
  assert.ok(slide, 'the curated feature leads the carousel');
  assert.match(slide.href, /\/debate\?id=today-hot/);
  assert.equal(slide.querySelectorAll('.slide-side').length, 2, 'and shows both sides of the question');
  assert.equal(doc.querySelectorAll('.hot-topic').length, 0, 'never a raw list of outbound hot links');
});

test('the lobby leads with the carousel, then the question box, then the feed', () => {
  const featured = pickFeatured(publicCatalog, [], 4, () => 0.5);
  const doc = new JSDOM(lobbyView(publicCatalog, null, featured)).window.document;
  const html = doc.body.innerHTML;
  assert.ok(doc.querySelector('#featured-carousel'));
  assert.equal(doc.querySelectorAll('#featured-track .carousel-slide').length, 4, 'one debate per slide');
  assert.equal(doc.querySelectorAll('#featured-track .slide-side').length, 8, 'each slide shows both sides');
  assert.equal(doc.querySelectorAll('.carousel-dot').length, 4, 'a dot per slide');
  assert.match(doc.querySelector('.slide-side.side-left').textContent, /左方/);
  assert.match(doc.querySelector('.slide-side.side-right').textContent, /右方/);
  assert.match(doc.querySelector('#featured-track .carousel-slide').textContent, /今日热榜|辩题库/, 'each slide names where it came from');
  assert.equal(doc.querySelectorAll('.recent-topics').length, 0, '最近新增 was removed');
  assert.equal(doc.querySelectorAll('.auto-topics').length, 0, '自由提问收录 was removed');
  assert.ok(doc.querySelector('#topic-query'), 'the question box lives in the lobby');
  assert.ok(html.indexOf('id="featured-carousel"') < html.indexOf('id="topic-search"'), '提问框在今日热辩之下');
  assert.ok(html.indexOf('id="topic-search"') < html.indexOf('feed-list'), '提问框在辩题流之上');
  assert.ok(doc.querySelectorAll('.feed-item').length >= 16, 'every stocked topic is in the feed');
  assert.equal(doc.querySelectorAll('.category-link').length, 8, 'the sidebar lists the eight categories');
  assert.doesNotMatch(doc.body.textContent, /万人围观|热度值/);
});

test('the featured rail rotates: hot entries lead, then topics not shown before', () => {
  const catalogish = [
    { id: 'plain-a', title: 'A', label: '', leftShort: 'x', rightShort: 'y', reviewedPairs: 1 },
    { id: 'hot-b', title: 'B', label: '', leftShort: 'x', rightShort: 'y', reviewedPairs: 1, featuredSource: 'hot', featuredRank: 2 },
    { id: 'curated-c', title: 'C', label: '', leftShort: 'x', rightShort: 'y', reviewedPairs: 3, featured: true },
    { id: 'plain-d', title: 'D', label: '', leftShort: 'x', rightShort: 'y', reviewedPairs: 1 }
  ];
  const first = pickFeatured(catalogish, [], 4, () => 0.5).map(t => t.id);
  assert.deepEqual(first, ['curated-c', 'hot-b', 'plain-a', 'plain-d'], 'hot debates lead the rail, then the unseen');
  const second = pickFeatured(catalogish, ['plain-a'], 4, () => 0.5).map(t => t.id);
  assert.deepEqual(second, ['curated-c', 'hot-b', 'plain-d', 'plain-a'], 'already-seen topics rotate behind the unseen');
  assert.equal(pickFeatured(catalogish, [], 2, () => 0.5).length, 2, 'the rail respects its limit');
});

test('a slide only promises a debate that is actually complete', () => {
  const pool = [
    { id: 'full-1', title: 'A', reviewedPairs: 3, verifiedRounds: 3 },
    { id: 'decayed-hot', title: 'B', reviewedPairs: 3, verifiedRounds: 1, featured: true },
    { id: 'full-2', title: 'C', reviewedPairs: 3, verifiedRounds: 3 },
    { id: 'never-opened', title: 'D', reviewedPairs: 3 },
    { id: 'decayed-2', title: 'E', reviewedPairs: 3, verifiedRounds: 2, featuredSource: 'hot' }
  ];
  const picked = pickFeatured(pool, [], 5, () => 0.5).map(t => t.id);
  assert.deepEqual(picked.slice(0, 3).sort(), ['full-1', 'full-2', 'never-opened'], 'complete debates come first, and an unopened one is assumed whole');
  assert.deepEqual(picked.slice(3).sort(), ['decayed-2', 'decayed-hot'], 'decayed debates only fill what is left');
  // With nothing complete available the rail still shows something.
  const onlyDecayed = pickFeatured([{ id: 'a', verifiedRounds: 1 }, { id: 'b', verifiedRounds: 2 }], [], 2, () => 0.5).map(t => t.id);
  assert.equal(onlyDecayed.length, 2);
});

test('unarranged topics are labelled as reading rather than verified debate seats', () => {
  const doc = new JSDOM(lobbyView([{id:'pending', category:'家庭与代际', title:'新题', selections:[], editorialMode:'reading'}], 'family')).window.document;
  const item = doc.querySelector('.feed-item');
  assert.match(item.textContent, /观点阅读/);
  assert.doesNotMatch(item.textContent, /已核对观点|进入辩论现场/);
});

test('new debates match the reviewed official excerpts and lose seats when the quotes disappear', async () => {
  const fixtures = JSON.parse(await readFile(new URL('./fixtures/editorial-sources.json',import.meta.url),'utf8'));
  for (const [id, fixture] of Object.entries(fixtures)) {
    const config = catalog.find(t=>t.id===id);
    assert.ok(config, 'missing public debate '+id);
    const items = normalizeItems(fixture.response);
    const debate = arrangeDebate(config,items);
    assert.equal(debate.rounds.length,3,id);
    assert.equal(debate.items.length,6,id);
    assert.ok(debate.rounds.flat().every(s=>s.text.includes(s.evidence)),id);
    assert.equal(arrangeDebate(config,items.map(s=>({...s,text:'已修改'}))).mode,'reading',id);
  }
});

test('AA debate rejects a source whose question is no longer about AA instead of treating it as a valid seat', async () => {
  const fixtures = JSON.parse(await readFile(new URL('./fixtures/editorial-sources.json', import.meta.url), 'utf8'));
  const config = catalog.find(topic => topic.id === 'aa');
  const items = normalizeItems(fixtures.aa.response);
  const unrelated = items.map(item => item.id === '1912058136086438398'
    ? {...item, sourceTitle: '如何给阳台上的绿植浇水？'}
    : item);
  const debate = arrangeDebate(config, unrelated);
  assert.equal(debate.rounds.length, 2);
  assert.equal(debate.missingSeats, 2);
  assert.doesNotMatch(debate.rounds.flat().map(seat => seat.sourceTitle).join('\n'), /绿植/);
});

test('a dropped round does not renumber the rounds that survived', async () => {
  const fixtures = JSON.parse(await readFile(new URL('./fixtures/editorial-sources.json', import.meta.url), 'utf8'));
  const config = catalog.find(topic => topic.id === 'aa');
  const full = arrangeDebate(config, normalizeItems(fixtures.aa.response));
  assert.deepEqual(full.roundIndexes, [0, 1, 2], 'a complete debate numbers its rounds 1 2 3');

  // Break the first round's quote so it can no longer be seated.
  const broken = normalizeItems(fixtures.aa.response).map(item => item.id === config.selections[0][0].id
    ? { ...item, text: item.text.replace(config.selections[0][0].evidence, '已经改掉的一句话') }
    : item);
  const reduced = arrangeDebate(config, broken);
  assert.equal(reduced.rounds.length, 2);
  assert.deepEqual(reduced.roundIndexes, [1, 2], 'the survivors keep their original numbers');
  assert.match(reduced.lenses[0], /^第?二|第二/, 'and the label still matches the number shown');
});
