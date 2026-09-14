import { escapeHtml as h } from './data.js';
import { icon, topicItem } from './ui.js';
import { page } from './lobby.js';

const norm = value => String(value ?? '').toLowerCase();

// Client-side only: the library never calls Zhihu.
export function filterTopics(topics, { term = '', source = 'all', category = 'all' } = {}) {
  const needle = norm(term).trim();
  return topics.filter(topic => {
    if (source === 'curated' && topic.autoArranged) return false;
    if (source === 'auto' && !topic.autoArranged) return false;
    if (category !== 'all' && topic.category !== category) return false;
    if (!needle) return true;
    return [topic.title, topic.debateTitle, topic.label, topic.intro, topic.category, topic.left, topic.right, topic.leftShort, topic.rightShort]
      .some(field => norm(field).includes(needle));
  });
}

export function libraryResults(topics, state) {
  const matched = filterTopics(topics, state);
  if (!matched.length) return `<div class="empty-state" role="status"><h3>没有匹配的辩题</h3><p>换个关键词，或者把筛选放宽一点。</p></div>`;
  return `<div class="feed-list">${matched.map(t => topicItem(t, 'library-card')).join('')}</div>`;
}

export function libraryView(topics, state) {
  const curated = topics.filter(t => !t.autoArranged).length, auto = topics.length - curated;
  const names = [...new Set(topics.map(t => t.category).filter(Boolean))];
  const control = (cls, value, label, group, currentValue) => `<button class="${cls}${currentValue === value ? ' on' : ''}" data-action="library-filter" data-group="${group}" data-value="${h(value)}" aria-pressed="${currentValue === value}">${h(label)}</button>`;
  const mainHtml = `<section class="card library-head">
      <h1>辩题库</h1>
      <p>人工核对的常驻辩题，加上本机编排收录的自由提问。</p>
      <form id="library-search" class="library-search" role="search"><label class="sr-only" for="library-query">在辩题库里检索</label>${icon('search')}<input id="library-query" type="search" autocomplete="off" placeholder="搜标题、立场、分类，例如「辞职」「大城市」「AI」" value="${h(state.term)}"><button class="btn-primary" type="submit">检索</button></form>
    </section>
    <section class="card library-body">
      <div class="filter-tabs" aria-label="按来源筛选">${control('filter-tab', 'all', '全部', 'source', state.source)}${control('filter-tab', 'curated', '人工核对', 'source', state.source)}${control('filter-tab', 'auto', 'AI 编排', 'source', state.source)}</div>
      <div class="chip-row" aria-label="按分类筛选">${control('chip', 'all', '全部分类', 'category', state.category)}${names.map(name => control('chip', name, name, 'category', state.category)).join('')}</div>
      <p class="result-count">共 <b id="library-count">${filterTopics(topics, state).length}</b> 个辩题</p>
      <div id="library-results" aria-live="polite">${libraryResults(topics, state)}</div>
    </section>`;
  const side = `<section class="card side-card"><h2 class="side-card-title">收录概况</h2>
      <dl class="stat-board"><div><dt>全部</dt><dd>${topics.length}</dd></div><div><dt>人工核对</dt><dd>${curated}</dd></div><div><dt>AI 编排</dt><dd>${auto}</dd></div></dl></section>
    <section class="card side-card"><h2 class="side-card-title">检索说明</h2><div class="side-card-body"><p>检索只在本机辩题库里查找，不调用知乎。打开任意一题都会重新拉取来源并逐字核对原句。</p><p>在顶部搜索框提问，编排成功的问题会自动收进这里。</p></div></section>`;
  return page(mainHtml, side);
}
