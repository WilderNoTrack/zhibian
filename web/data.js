// UI state only; public opinions come from the local server.
import { topicIds } from './topic-ids.js';
// Curated topics are whitelisted. Free questions carry a `q:` prefix while they
// are being arranged, and become `auto-...` once the server has stored them.
export const isFreeTopic = id => typeof id === 'string' && (id.startsWith('q:') || id.startsWith('auto-'));
export const isKnownTopic = id => topicIds.includes(id) || isFreeTopic(id);
export function createState(topicId = 'parenting', roundCount = 3) {
  return { topicId, roundCount: Math.max(1, Math.min(3, roundCount)), round: 0, view: 'arena', seen: [0] };
}
export function transition(state, action) {
  if (action.type === 'topic') return isKnownTopic(action.id) ? createState(action.id, action.count ?? 3) : state;
  if (action.type === 'round' && Number.isInteger(action.index) && action.index >= 0 && action.index < state.roundCount) {
    return { ...state, round: action.index, view: 'arena', seen: [...new Set([...state.seen, action.index])] };
  }
  if (action.type === 'next') return state.round < state.roundCount - 1 ? transition(state, { type: 'round', index: state.round + 1 }) : { ...state, view: 'recap' };
  if (action.type === 'back') return transition(state, { type: 'round', index: Math.max(0, state.round - 1) });
  if (action.type === 'arena') return { ...state, view: 'arena' };
  return state;
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// The 今日热辩 strip rotates instead of repeating one card.
//
// A slide is a promise: "open me and you get a whole debate". Curated topics are
// re-checked against a live search on every open, so a source that drifts out of
// the search results costs that topic a round — and the slide would open onto a
// husk. `verifiedRounds` is what the topic actually rendered last time, so
// complete debates are featured first and decayed ones only fill a gap when
// there is nothing better. Nothing is invented — it only reorders the library.
export function pickFeatured(topics, seen = [], limit = 8, random = Math.random) {
  const shuffle = list => list.map(value => [random(), value]).sort((a, b) => a[0] - b[0]).map(pair => pair[1]);
  // Unknown counts are treated as full: a topic that has never been opened has
  // not been shown to be broken.
  const isComplete = topic => topic.editorialMode === 'reading' || topic.verifiedRounds === null || topic.verifiedRounds === undefined || topic.verifiedRounds >= 3;
  const complete = shuffle(topics.filter(isComplete));
  const partial = shuffle(topics.filter(topic => !isComplete(topic)));
  const rank = topic => (topic.featured === true ? 0 : topic.featuredSource === 'hot' ? 1 : 2);
  const order = list => [...list].sort((a, b) => rank(a) - rank(b));
  const unseen = order(complete.filter(topic => !seen.includes(topic.id)));
  const shown = order(complete.filter(topic => seen.includes(topic.id)));
  return [...unseen, ...shown, ...order(partial)].slice(0, limit);
}
