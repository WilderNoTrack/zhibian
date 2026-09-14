// How many rounds a topic actually produced the last time it was served.
// Curated topics are checked against a live search on every open, so a source
// that drifts out of the search results silently costs that topic a round. That
// number is remembered here so the lobby can feature debates that really are
// complete instead of ones that decayed without anyone noticing.
import { createJsonStore } from './json-store.mjs';

const store = createJsonStore({ name: 'topic-health.json', label: 'topic-health' });

export function loadTopicHealth() {
  return store.read();
}

/** Records what a topic actually rendered. Fire-and-forget; never blocks a response. */
export function recordTopicHealth(id, rounds, reason = null) {
  if (!id) return Promise.resolve();
  return store.put(id, { rounds, reason, at: new Date().toISOString() });
}

export function resetTopicHealth() {
  return store.reset();
}

/** Rounds a topic is known to render, or null when it has never been opened. */
export function knownRounds(health, id) {
  const entry = health?.[id];
  return entry && Number.isInteger(entry.rounds) ? entry.rounds : null;
}
