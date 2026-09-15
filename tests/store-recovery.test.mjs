// A damaged data file must never be silently replaced by the next save.
// Runs in its own file: the stores cache their first read per process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'zhibian-store-'));
process.env.ZHIBIAN_DATA_DIR = dir;
const truncatedLibrary = JSON.stringify({ topics: [{ id: 'auto-1', query: '甲', title: '甲', selections: [[{}, {}]], lenses: [], hosts: [] }], hotAttempts: ['旧热榜'] }).slice(0, -4);
writeFileSync(path.join(dir, 'auto-topics.json'), truncatedLibrary);
writeFileSync(path.join(dir, 'topic-health.json'), '{"career": {"rounds": 3');
mkdirSync(path.join(dir, 'topic-queries.json')); // a path that cannot be read as a file

const { loadAutoTopics, saveAutoTopic } = await import('../scripts/auto-topics.mjs');
const { loadTopicHealth, recordTopicHealth } = await import('../scripts/topic-health.mjs');
const { loadTopicQueries, saveTopicQueries } = await import('../scripts/topic-queries.mjs');
const topic = id => ({ id, query: id, title: id, selections: [[{}, {}]], lenses: [], hosts: [] });
const asideOf = name => readdirSync(dir).filter(file => file.startsWith(name + '.corrupt-'));

test('a truncated library is copied aside before the next save replaces it', async () => {
  assert.deepEqual(await loadAutoTopics(), []);
  await saveAutoTopic(topic('auto-2'));
  const aside = asideOf('auto-topics.json');
  assert.equal(aside.length, 1, 'the damaged file is kept');
  assert.equal(readFileSync(path.join(dir, aside[0]), 'utf8'), truncatedLibrary);
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'auto-topics.json'), 'utf8')).topics.map(t => t.id), ['auto-2']);
});

test('a truncated keyed store is copied aside as well', async () => {
  assert.deepEqual(await loadTopicHealth(), {});
  await recordTopicHealth('parenting', 3);
  assert.equal(asideOf('topic-health.json').length, 1);
  assert.equal(JSON.parse(readFileSync(path.join(dir, 'topic-health.json'), 'utf8')).parenting.rounds, 3);
});

test('a store that cannot be read at all is left alone and does not throw', async () => {
  assert.deepEqual(await loadTopicQueries(), {});
  await saveTopicQueries('某个辩题', ['关键词']);
  assert.ok(statSync(path.join(dir, 'topic-queries.json')).isDirectory());
});
