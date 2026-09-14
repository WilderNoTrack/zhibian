// The search phrasings the model generated for a topic.
//
// Zhihu search returns at most ten results per query, so a topic is searched
// under several phrasings and the results merged. Generating them costs one
// model call, and re-generating on every restart would make a topic's coverage
// different each time — "the sources I found yesterday" would not be the
// sources I find today. Persisting them makes the retrieval plan reproducible.
//
// A topic that is *known* to be short of rounds is regenerated once per process
// instead: the stored phrasings already failed to reach those sources, so
// repeating them would repeat the same gap.
import { createJsonStore } from './json-store.mjs';

const store = createJsonStore({ name: 'topic-queries.json', limit: 120, label: 'topic-queries' });

export function loadTopicQueries() {
  return store.read();
}

export function saveTopicQueries(topic, queries) {
  if (!topic || !Array.isArray(queries) || !queries.length) return Promise.resolve();
  return store.put(topic, { queries, at: new Date().toISOString() });
}

export function resetTopicQueries() {
  return store.reset();
}

/** The stored phrasings for a topic, without the original wording. */
export function storedQueries(all, topic) {
  const entry = all?.[topic];
  if (!entry || !Array.isArray(entry.queries)) return null;
  return entry.queries.filter(query => typeof query === 'string' && query.trim());
}
