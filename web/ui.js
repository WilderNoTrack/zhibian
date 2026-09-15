// Shared markup helpers for the Zhihu-style interface.
import { escapeHtml as h } from './data.js';

const paths = {
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>', back: '<path d="m14 6-6 6 6 6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  arena: '<path d="M3 5h7v10H7l-4 4V5Zm11 0h7v14l-4-4h-3V5Z"/>',
  book: '<path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2V4Z"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>', guide: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>', download: '<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>', file: '<path d="M7 3h7l5 5v13H7V3Z"/><path d="M14 3v5h5M10 13h6m-6 4h6"/>', sound: '<path d="M4 10v4m4-8v12m4-14v16m4-13v10m4-7v4"/>',
  fire: '<path d="M12 3c1 3 5.5 5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.2 1-3.8 2.2-4.8 0 2 1 3.2 2.1 3.2 0-3.2-1-5.4 1.2-8.9Z"/>',
  up: '<path d="M12 6 5 17h14L12 6Z"/>', chat: '<path d="M4 5h16v11H9l-5 4V5Z"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  verified: '<path d="m12 3 2.3 1.7 2.9-.1.9 2.7 2.3 1.8-.9 2.8.9 2.8-2.3 1.7-.9 2.8-2.9-.1L12 21l-2.3-1.7-2.9.1-.9-2.8-2.3-1.7.9-2.8-.9-2.8 2.3-1.8.9-2.7 2.9.1L12 3Z"/><path d="m8.5 12 2.3 2.3 4.7-4.6"/>'
};
export const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
export const avatar = (s, size = '') => `<span class="avatar ${size}" aria-hidden="true"><span>${h(String(s.name || '?').slice(0, 1))}</span>${s.avatarUrl ? `<img src="${h(s.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>`;
export const sourceLink = (s, label = '在知乎看原文') => `<a class="source-link" href="${h(s.sourceUrl)}" target="_blank" rel="noopener noreferrer">${label}${icon('external')}</a>`;
export const stamp = value => value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '';

// A polished, adversarial title when the model produced one; the original
// Zhihu wording is never hidden — it is shown as 知乎原题.
export const displayTitle = t => t.debateTitle || t.title;
export const originTitle = t => (t.debateTitle && t.debateTitle !== t.title ? t.title : '');
export const topicSummary = t => t.label || t.intro || '';
export const roundCount = t => (t.editorialMode === 'reading' ? '观点阅读' : `${t.reviewedPairs || 1} 组已核对观点`);
export const enterLabel = t => (t.editorialMode === 'reading' ? '进入观点阅读' : '进入辩论现场');
export const originBadge = t => t.autoArranged
  ? '<span class="badge badge-auto">AI 编排</span>'
  : '<span class="badge badge-curated">人工核对</span>';

// One feed row, shared by the lobby and the library.
export function topicItem(t, extraClass = '') {
  const href = `/debate?id=${encodeURIComponent(t.id)}`, origin = originTitle(t);
  return `<article class="feed-item ${extraClass}">
    <div class="feed-meta">${t.category ? `<span class="tag">${h(t.category)}</span>` : ''}${originBadge(t)}${t.featuredSource === 'hot' || t.featured === true ? '<span class="badge badge-hot">今日热榜</span>' : ''}</div>
    <h2 class="feed-title"><a href="${href}" data-action="choose-topic" data-id="${h(t.id)}">${h(displayTitle(t))}</a></h2>
    ${origin ? `<p class="feed-origin">知乎原题：${h(origin)}</p>` : ''}
    ${topicSummary(t) ? `<p class="feed-excerpt">${h(topicSummary(t))}</p>` : ''}
    ${t.leftShort || t.rightShort ? `<div class="feed-positions"><span class="pos side-left"><i>左</i>${h(t.leftShort || t.left)}</span><span class="pos-vs">VS</span><span class="pos side-right"><i>右</i>${h(t.rightShort || t.right)}</span></div>` : ''}
    <div class="feed-actions"><a class="btn-soft" href="${href}" data-action="choose-topic" data-id="${h(t.id)}" tabindex="-1">${icon('arena')}${enterLabel(t)}</a><span class="action-meta">${icon('chat')}${roundCount(t)}</span>${t.addedAt ? `<span class="action-meta">收录于 ${h(t.addedAt)}</span>` : ''}</div>
  </article>`;
}
