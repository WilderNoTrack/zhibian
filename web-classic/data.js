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

// The 今日热辩 strip rotates instead of repeating one card. Hot and curated
// entries always lead (their order is shuffled so the strip is not static);
// the remaining slots prefer topics this browser has not been shown yet, then
// fall back to anything else. Nothing is invented — it only reorders the library.
export function pickFeatured(topics, seen = [], limit = 8, random = Math.random) {
  const isHot = topic => topic.featured === true || topic.featuredSource === 'hot';
  const shuffle = list => list.map(value => [random(), value]).sort((a, b) => a[0] - b[0]).map(pair => pair[1]);
  const hot = shuffle(topics.filter(isHot));
  const rest = shuffle(topics.filter(topic => !isHot(topic)));
  const unseen = rest.filter(topic => !seen.includes(topic.id));
  const shown = rest.filter(topic => seen.includes(topic.id));
  return [...hot, ...unseen, ...shown].slice(0, limit);
}
