// Arranged topics kept on disk so they can be browsed from the library later.
// Two ways in: a reader's own free question, or a headline taken from the hot
// list. Only source ids and already-verified quotes are stored; opening one
// re-runs the search and re-checks every quote. Nothing here is ever marked as
// human-reviewed.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const LIMIT = 80;
const plainText = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const debug = (...args) => { if (process.env.ZHIBIAN_DEBUG) console.error('[auto-topics]', ...args); };

// Resolved lazily so tests can redirect the store with ZHIBIAN_DATA_DIR.
function storeFile() {
  const dir = process.env.ZHIBIAN_DATA_DIR || fileURLToPath(new URL('../data/', import.meta.url));
  return path.join(dir, 'auto-topics.json');
}

let cache = null;
let queue = Promise.resolve();

export function autoTopicId(query) {
  return 'auto-' + createHash('sha256').update(query).digest('hex').slice(0, 12);
}

function isValid(topic) {
  return Boolean(topic) && typeof topic.id === 'string' && topic.id.startsWith('auto-')
    && typeof topic.query === 'string' && topic.query.trim()
    && typeof topic.title === 'string' && topic.title.trim()
    && Array.isArray(topic.selections) && topic.selections.length > 0
    && Array.isArray(topic.lenses) && Array.isArray(topic.hosts);
}

async function readStore() {
  if (cache) return cache;
  const file = storeFile();
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    // Accept the older array-only shape as well.
    const topics = Array.isArray(parsed) ? parsed : parsed?.topics;
    const attempts = Array.isArray(parsed?.hotAttempts) ? parsed.hotAttempts : [];
    cache = { topics: (Array.isArray(topics) ? topics : []).filter(isValid), hotAttempts: attempts.filter(t => typeof t === 'string') };
  } catch (error) {
    if (error.code !== 'ENOENT') debug('read failed', error.message);
    cache = { topics: [], hotAttempts: [] };
  }
  return cache;
}

async function writeStore(next) {
  const file = storeFile();
  await mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + process.pid + '.tmp';
  await writeFile(temp, JSON.stringify(next, null, 2), 'utf8');
  await rename(temp, file);
  cache = next;
}

export async function loadAutoTopics() {
  return (await readStore()).topics;
}

export async function loadHotAttempts() {
  return (await readStore()).hotAttempts;
}

export function findAutoTopic(topics, id) {
  return topics.find(topic => topic.id === id) || null;
}

export async function saveAutoTopic(record) {
  queue = queue.then(async () => {
    const store = await readStore();
    const topics = [record, ...store.topics.filter(topic => topic.id !== record.id)].slice(0, LIMIT);
    await writeStore({ ...store, topics });
  }).catch(error => { debug('save failed', error.message); });
  return queue;
}

/** Empties the store — for tests and for starting the library over. */
export async function resetAutoTopics() {
  queue = queue.then(async () => {
    cache = { topics: [], hotAttempts: [] };
    const file = storeFile();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(cache, null, 2), 'utf8');
  }).catch(error => { debug('reset failed', error.message); });
  return queue;
}

/** Remembers which headlines were already tried, so a failure is not retried. */
export async function rememberHotAttempts(labels) {  queue = queue.then(async () => {
    const store = await readStore();
    const hotAttempts = [...new Set([...store.hotAttempts, ...labels])].slice(-200);
    await writeStore({ ...store, hotAttempts });
  }).catch(error => { debug('attempt log failed', error.message); });
  return queue;
}

/** Shapes a stored record for browsing: same fields a curated topic exposes. */
export function publicAutoTopic(topic) {
  const { selections, query, hosts, lenses, sharedQuestions, questions, ...meta } = topic;
  return { ...meta, reviewedPairs: selections.length, editorialMode: 'debate' };
}

export function draftFromArrangement({ query, payload, model, featured = null, categories = [], forcedCategory = null }) {
  const selections = payload.rounds.map(([left, right]) => [
    { id: left.id, name: left.name, evidence: left.evidence, note: left.contextNote || null },
    { id: right.id, name: right.name, evidence: right.evidence, note: right.contextNote || null }
  ]);
  const polish = plainText(payload.debateTitle).slice(0, 24);
  // A curated seed keeps the category it was filed under; otherwise the model's
  // choice is honoured only when it is one of the hand-built categories.
  const modelCategory = plainText(payload.category);
  const chosen = forcedCategory && categories.includes(forcedCategory) ? forcedCategory
    : categories.includes(modelCategory) ? modelCategory : null;
  return {
    id: autoTopicId(query), autoArranged: true, query,
    // A polished, adversarial title for the carousel; the original stays as `query`.
    debateTitle: polish || null,
    category: chosen,
    title: payload.title, titleLines: payload.titleLines,
    intro: payload.intro, label: payload.label,
    left: payload.left, right: payload.right, leftShort: payload.leftShort, rightShort: payload.rightShort,
    lenses: payload.lenses, hosts: payload.hosts, sharedQuestions: payload.sharedQuestions,
    // What the independent judge read each side as. Kept so the UI can show the
    // reason a round is considered an opposition instead of just asserting it.
    oppositions: Array.isArray(payload.oppositions) ? payload.oppositions : null,
    questions: payload.questions, selections,
    featuredSource: featured?.source || null, featuredRank: featured?.rank ?? null, featuredLabel: featured?.label || null,
    addedAt: new Date().toISOString().slice(0, 10), reviewedAt: null,
    createdAt: new Date().toISOString(), model
  };
}
