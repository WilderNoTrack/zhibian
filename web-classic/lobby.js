import { escapeHtml as h } from './data.js';

const descriptions = {
  '情感与婚恋': { id: 'love', tone: 'coral', mark: '爱', description: '心动、金钱与边界。亲密关系里，谁都想被理解。', contrast: ['亲密', '独立'] },
  '职场与生存': { id: 'work', tone: 'blue', mark: '业', description: '收入、成长与下班后的自己。工作值得付出多少？', contrast: ['机会', '边界'] },
  '钱与消费': { id: 'money', tone: 'coral', mark: '钱', description: '存款的底气，花钱的快乐。有限的钱，怎么过日子？', contrast: ['当下', '未来'] },
  '家庭与代际': { id: 'family', tone: 'blue', mark: '家', description: '父母的心意，自己的生活。一家人也有不同的答案。', contrast: ['牵挂', '自主'] },
  '教育与养娃': { id: 'education', tone: 'blue', mark: '育', description: '想给孩子更好的，却不一定想到同一条路。', contrast: ['引导', '探索'] },
  '人生与选择': { id: 'life', tone: 'coral', mark: '路', description: '去哪座城市，过哪种生活。听听岔路上的人。', contrast: ['闯荡', '安定'] },
  '科技与 AI': { id: 'tech', tone: 'blue', mark: '新', description: '当工具越来越聪明，哪些事仍想自己来？', contrast: ['借力', '亲为'] },
  '影视与审美': { id: 'culture', tone: 'coral', mark: '影', description: '同一部作品，有人念念不忘，有人不以为然。', contrast: ['新意', '经典'] }
};

// Every stocked topic files into one of the hand-built categories, AI-arranged
// ones included — the card still says which is which, so nothing passes as
// hand-reviewed. The single curated showcase keeps its own spot at the top of
// the lobby instead of becoming a category of its own.
export function categories(topics) {
  const pool = topics.filter(t => t.featured !== true && t.category && typeof t.category === 'string');
  const names = [...Object.keys(descriptions).filter(name => pool.some(t => t.category === name)),
    ...new Set(pool.filter(t => !descriptions[t.category]).map(t => t.category).filter(Boolean))];
  return names.map(name => ({name, ...(descriptions[name] || {id:name, tone:'blue', mark:'谈', description:'看看不同的选择。', contrast:['这一边','另一边']}), topics:pool.filter(t=>t.category===name)}));
}

function sourceChip(t) {
  if (t.featured === true) return '今日热榜 · 已人工核对';
  if (t.featuredSource === 'hot') return '今日热榜 · AI 编排';
  return '换个话题';
}

// The polished, adversarial title when the model produced one; the original
// wording is never hidden, it becomes the subtitle.
function displayTitle(t) {
  return t.debateTitle || t.title;
}
function displayLabel(t) {
  return t.debateTitle && t.debateTitle !== t.title ? `${t.debateTitle === t.title ? '' : '知乎原题：'}${t.title}` : (t.label || t.intro);
}

function topicCard(t, icon) {
  const reading = t.editorialMode === 'reading';
  const auto = t.autoArranged === true;
  const count = reading ? '观点阅读' : `${t.reviewedPairs || 1} 组已核对观点`;
  return `<a class="topic-option lobby-topic${auto ? ' auto-topic' : ''}" href="/debate?id=${encodeURIComponent(t.id)}" data-action="choose-topic" data-id="${h(t.id)}">
    <div class="topic-option-meta"><span>${h(auto ? '辩题库 · AI 编排' : t.category)}</span><span>${h(count)}</span></div>
    <h2>${h(displayTitle(t))}</h2><p>${h(displayLabel(t))}</p>
    <div class="lobby-positions"><span class="coral-text">${h(t.leftShort)}</span><span class="tiny-vs">VS</span><span class="blue-text">${h(t.rightShort)}</span></div>
    <div class="lobby-enter"><span>${reading ? '进入观点阅读' : '进入辩论现场'}</span>${icon('arrow')}</div></a>`;
}

// One slide = one debate, shown on its own so the two sides are the point of
// the card rather than a footnote on it. The side panels start on the short
// labels and are upgraded to verified quotes by /api/preview once loaded.
function featuredSlide(t, icon, index) {
  const reading = t.editorialMode === 'reading';
  const auto = t.autoArranged === true;
  return `<a class="carousel-slide${auto ? ' auto-topic' : ''}" href="/debate?id=${encodeURIComponent(t.id)}" data-action="choose-topic" data-id="${h(t.id)}" data-slide="${index}" role="group" aria-roledescription="幻灯片" aria-label="${index + 1} / ${h(displayTitle(t))}">
    <div class="slide-top"><span class="slide-source">${h(sourceChip(t))}</span><span class="slide-rounds">${reading ? '观点阅读' : `${t.reviewedPairs || 1} 回合 · ${(t.reviewedPairs || 1) * 2} 条真实观点`}</span></div>
    <h3 class="slide-title">${h(displayTitle(t))}</h3>
    ${displayLabel(t) && displayLabel(t) !== displayTitle(t) ? `<p class="slide-origin">知乎原题：${h(displayLabel(t))}</p>` : ''}
    <div class="slide-sides">
      <div class="slide-side coral"><span class="slide-side-tag">左方</span><p class="slide-quote">${h(t.leftShort || t.left)}</p><span class="slide-author"></span></div>
      <div class="slide-vs" aria-hidden="true"><span>VS</span></div>
      <div class="slide-side blue"><span class="slide-side-tag">右方</span><p class="slide-quote">${h(t.rightShort || t.right)}</p><span class="slide-author"></span></div>
    </div>
    <span class="slide-enter">${reading ? '进入观点阅读' : '进入辩论现场'} ${icon('arrow')}</span>
    <p class="slide-positions" data-positions hidden></p></a>`;
}

export function featuredView(topics, icon) {
  if (!topics.length) return '';
  return `<div class="section-heading"><div><h2>今日热辩</h2><p>一次一道辩题，5 秒自动切换；下面的圆点可以跳到任意一道。</p></div><span class="hot-updated">${topics.length} 个辩题</span></div>
  <section class="carousel" id="featured-carousel" aria-roledescription="轮播" aria-label="今日热辩">
    <div class="carousel-viewport"><div class="carousel-track" id="featured-track">${topics.map((t, i) => featuredSlide(t, icon, i)).join('')}</div></div>
    <button class="carousel-arrow prev" data-action="carousel" data-dir="-1" aria-label="上一道辩题">${icon('back')}</button>
    <button class="carousel-arrow next" data-action="carousel" data-dir="1" aria-label="下一道辩题">${icon('arrow')}</button>
    <div class="carousel-dots" role="tablist" aria-label="选择辩题">${topics.map((t, i) => `<button class="carousel-dot" role="tab" data-action="carousel-dot" data-index="${i}" aria-selected="${i === 0}" aria-label="第 ${i + 1} 道：${h(displayTitle(t))}" title="${h(displayTitle(t))}"></button>`).join('')}</div>
    <p class="carousel-status" id="carousel-status" role="status" aria-live="polite">正在显示第 1 道，共 ${topics.length} 道</p>
  </section>`;
}

export function searchArea(icon) {
  return `<section class="lobby-search-area" aria-label="搜索其他知乎观点">
    <div class="lobby-search-heading"><div><h2>心里已经有一个问题？</h2><p>直接搜索知乎，先看真实观点；想让 AI 把它们排成一场，再点自动编排。编排成功会自动收进辩题库。</p></div>${icon('search')}</div>
    <form id="topic-search" class="topic-search"><label class="sr-only" for="topic-query">搜索知乎观点</label>${icon('search')}<input id="topic-query" type="search" required minlength="2" maxlength="100" autocomplete="off" placeholder="输入想讨论的问题"><button class="small-button" type="submit">搜索知乎</button></form>
    <div id="topic-results" aria-live="polite"></div>
    <p class="dialog-footnote">只在点击搜索时查询，同一关键词缓存 15 分钟。</p></section>`;
}

export function lobbyView(topics, selected, icon, featured = []) {
  const regularTopics = topics.filter(t => !t.featured && !t.autoArranged);
  const groups = categories(topics), category = groups.find(c => c.id === selected);
  if (selected && !category) return `<section class="loading-state"><h1>还没有这个分类。</h1><p>回到大厅，看看已经开放的辩题。</p><button class="primary-button" data-action="topics">返回辩题大厅</button></section>`;
  return `<section class="lobby-page">
    ${category ? `<a href="/topics" data-action="topics" class="lobby-back">${icon('back')}全部分类</a>` : '<div class="eyebrow"><span class="episode-dot"></span>辩题大厅 · 自由入席</div>'}
    <header class="lobby-heading"><div><h1>${h(category ? category.name : '今天，想围观什么？')}</h1><p>${h(category ? category.description : '不必表态，不必争赢。挑个问题，听听另一边怎么说。')}</p></div><div class="lobby-count"><strong>${category ? category.topics.length : groups.length}</strong><span>${category ? '个辩题' : '个分类'}</span></div></header>
    ${category ? `<nav class="category-switch" aria-label="辩题分类">${groups.map(c => `<a href="/topics?category=${encodeURIComponent(c.id)}" data-action="category" data-category="${h(c.id)}" ${c.id === selected ? 'aria-current="page"' : ''}>${h(c.name)}<span>${c.topics.length}</span></a>`).join('')}</nav><section class="lobby-topic-grid" aria-label="${h(category.name)}的辩题">${category.topics.map(t=>topicCard(t,icon)).join('')}</section>` : `
      <section id="hot-topics" class="hot-section" aria-label="今日热辩">${featuredView(featured, icon)}</section>
      ${searchArea(icon)}
      <section class="category-grid" aria-label="辩题分类">${groups.map(c => `<a class="category-card ${h(c.tone)}" href="/topics?category=${encodeURIComponent(c.id)}" data-action="category" data-category="${h(c.id)}"><div class="category-top"><span class="category-mark" aria-hidden="true">${h(c.mark)}</span><span>${c.topics.length} 个辩题</span></div><h2>${h(c.name)}</h2><p>${h(c.description)}</p><div class="category-contrast"><span>${h(c.contrast[0])}</span><i>／</i><span>${h(c.contrast[1])}</span></div><div class="category-bottom"><span>进入分类</span>${icon('arrow')}</div></a>`).join('')}</section>`}
    <p class="lobby-catalog-note">常驻辩题人工核对来源与原句；AI 编排的辩题逐字校验但不冒充人工核对。来源发生变化时该场会少一个回合，绝不用虚构内容补位。</p>
    </section>`;
}
