import { escapeHtml as h } from './data.js';

const norm = value => String(value ?? '').toLowerCase();

export function filterTopics(topics, { term = '', source = 'all', category = 'all' } = {}) {
  const needle = norm(term).trim();
  return topics.filter(topic => {
    if (source === 'curated' && topic.autoArranged) return false;
    if (source === 'auto' && !topic.autoArranged) return false;
    if (category !== 'all' && topic.category !== category) return false;
    if (!needle) return true;
    return [topic.title, topic.label, topic.intro, topic.category, topic.left, topic.right, topic.leftShort, topic.rightShort]
      .some(field => norm(field).includes(needle));
  });
}

function libraryCard(t, icon) {
  const auto = t.autoArranged === true;
  const reading = t.editorialMode === 'reading';
  return `<a class="library-card${auto ? ' auto-topic' : ''}" href="/debate?id=${encodeURIComponent(t.id)}" data-action="choose-topic" data-id="${h(t.id)}">
    <div class="library-card-top"><span class="library-badge ${auto ? 'auto' : 'curated'}">${auto ? 'AI 编排' : '人工核对'}</span><span class="library-cat">${h(t.category)}</span></div>
    <h3>${h(t.title)}</h3>
    <p>${h(t.label || t.intro)}</p>
    <div class="library-card-foot"><span>${reading ? '观点阅读' : `${t.reviewedPairs || 1} 组观点`}</span><span>${h(t.addedAt || '')}</span>${icon('arrow')}</div></a>`;
}

export function libraryResults(topics, state, icon) {
  const matched = filterTopics(topics, state);
  if (!matched.length) return `<div class="empty-state" role="status"><h3>没有匹配的辩题</h3><p>换个关键词，或者把筛选放宽一点。</p></div>`;
  return `<div class="library-grid">${matched.map(t => libraryCard(t, icon)).join('')}</div>`;
}

export function libraryView(topics, state, icon) {
  const curated = topics.filter(t => !t.autoArranged).length;
  const auto = topics.length - curated;
  const categories = [...new Set(topics.map(t => t.category))];
  const chip = (value, label, group, current) => `<button class="filter-chip${current === value ? ' on' : ''}" data-action="library-filter" data-group="${group}" data-value="${h(value)}">${h(label)}</button>`;
  return `<section class="library-page">
    <div class="eyebrow"><span class="episode-dot"></span>辩题库 · 全站可检索</div>
    <header class="lobby-heading"><div><h1>辩题库</h1><p>人工核对的常驻辩题，加上本机编排收录的自由提问。<b>${curated}</b> 个人工核对 · <b>${auto}</b> 个 AI 编排。</p></div><div class="lobby-count"><strong id="library-count">${topics.length}</strong><span>个辩题</span></div></header>
    <form id="library-search" class="library-search" role="search"><label class="sr-only" for="library-query">在辩题库里检索</label>${icon('search')}<input id="library-query" type="search" autocomplete="off" placeholder="搜标题、立场、分类，例如「辞职」「大城市」「AI」" value="${h(state.term)}"><button class="small-button" type="submit">检索</button></form>
    <div class="filter-rows">
      <div class="filter-row"><span class="filter-label">来源</span>${chip('all', '全部', 'source', state.source)}${chip('curated', '人工核对', 'source', state.source)}${chip('auto', 'AI 编排', 'source', state.source)}</div>
      <div class="filter-row"><span class="filter-label">分类</span>${chip('all', '全部分类', 'category', state.category)}${categories.map(name => chip(name, name, 'category', state.category)).join('')}</div>
    </div>
    <section id="library-results" aria-live="polite">${libraryResults(topics, state, icon)}</section>
    <p class="lobby-catalog-note">检索只在本机辩题库里查找，不调用知乎。打开任意一题都会重新拉取来源并逐字核对原句。</p></section>`;
}
