import { escapeHtml as h } from './data.js';
import { icon, displayTitle, originTitle, topicItem } from './ui.js';

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
// ones included; the curated showcase stays in the 今日热辩 card instead.
export function categories(topics) {
  const pool = topics.filter(t => t.featured !== true && t.category && typeof t.category === 'string');
  const names = [...Object.keys(descriptions).filter(name => pool.some(t => t.category === name)),
    ...new Set(pool.filter(t => !descriptions[t.category]).map(t => t.category).filter(Boolean))];
  return names.map(name => ({ name, ...(descriptions[name] || { id: name, tone: 'blue', mark: '谈', description: '看看不同的选择。', contrast: ['这一边', '另一边'] }), topics: pool.filter(t => t.category === name) }));
}

// Where a carousel entry came from. Rotated library topics never pass as hot.
function sourceChip(t) {
  if (t.featured === true) return '今日热榜 · 已人工核对';
  if (t.featuredSource === 'hot') return '今日热榜 · AI 编排';
  return t.autoArranged ? '辩题库 · AI 编排' : '常驻辩题 · 已人工核对';
}

// Side panels start on the short labels and are upgraded to verified quotes
// by /api/preview once the slide is shown.
function featuredSlide(t, index) {
  const reading = t.editorialMode === 'reading', origin = originTitle(t);
  return `<a class="carousel-slide" href="/debate?id=${encodeURIComponent(t.id)}" data-action="choose-topic" data-id="${h(t.id)}" data-slide="${index}" role="group" aria-roledescription="幻灯片" aria-label="${index + 1} / ${h(displayTitle(t))}">
    <div class="slide-meta"><span class="hot-rank${index < 3 ? ' top' : ''}">${index + 1}</span><span class="badge badge-hot">${h(sourceChip(t))}</span><span class="slide-rounds">${reading ? '观点阅读' : `${t.reviewedPairs || 1} 回合 · ${(t.reviewedPairs || 1) * 2} 条真实观点`}</span></div>
    <h3 class="slide-title">${h(displayTitle(t))}</h3>
    ${origin ? `<p class="slide-origin">知乎原题：${h(origin)}</p>` : ''}
    <div class="slide-sides">
      <div class="slide-side side-left"><span class="side-label">左方</span><p class="slide-quote">${h(t.leftShort || t.left)}</p><span class="slide-author"></span></div>
      <span class="slide-vs" aria-hidden="true">VS</span>
      <div class="slide-side side-right"><span class="side-label">右方</span><p class="slide-quote">${h(t.rightShort || t.right)}</p><span class="slide-author"></span></div>
    </div>
    <p class="slide-positions" hidden></p>
    <span class="slide-enter">${reading ? '进入观点阅读' : '进入辩论现场'}${icon('arrow')}</span></a>`;
}

function featuredCard(topics) {
  if (!topics.length) return '';
  return `<section class="card hot-card" id="featured-carousel" aria-roledescription="轮播" aria-label="今日热辩">
    <header class="card-header"><h2>${icon('fire')}今日热辩</h2><span class="card-header-meta">${topics.length} 个辩题 · 5 秒自动切换</span>
      <div class="carousel-controls"><button class="carousel-arrow" data-action="carousel" data-dir="-1" aria-label="上一道辩题">${icon('back')}</button><button class="carousel-arrow" data-action="carousel" data-dir="1" aria-label="下一道辩题">${icon('arrow')}</button></div></header>
    <div class="carousel-viewport"><div class="carousel-track" id="featured-track">${topics.map(featuredSlide).join('')}</div></div>
    <div class="carousel-dots" role="tablist" aria-label="选择辩题">${topics.map((t, i) => `<button class="carousel-dot" role="tab" data-action="carousel-dot" data-index="${i}" aria-selected="${i === 0}" aria-label="第 ${i + 1} 道：${h(displayTitle(t))}" title="${h(displayTitle(t))}"></button>`).join('')}</div>
    <p class="sr-only" id="carousel-status" role="status" aria-live="polite">正在显示第 1 道，共 ${topics.length} 道</p>
  </section>`;
}

function composer() {
  return `<section class="card composer" aria-label="搜索其他知乎观点">
    <div class="composer-head"><span class="avatar viewer" aria-hidden="true"><span>观</span></span><div><h2>心里已经有一个问题？</h2><p>直接搜索知乎，先看真实观点；想让 AI 把它们排成一场，再点自动编排。编排成功会自动收进辩题库。</p></div></div>
    <form id="topic-search" class="composer-form"><label class="sr-only" for="topic-query">搜索知乎观点</label><input id="topic-query" type="search" required minlength="2" maxlength="100" autocomplete="off" placeholder="输入想讨论的问题，例如：年轻人该不该先存钱？"><button class="btn-primary" type="submit">${icon('search')}搜索知乎</button></form>
    <p class="composer-tip">只在点击搜索时查询，同一关键词缓存 15 分钟。</p>
  </section>`;
}

function feedCard(groups, selected, topics) {
  return `<section class="card feed-card" aria-label="${selected ? '分类辩题' : '全部辩题'}">
    <nav class="category-tabs" aria-label="辩题分类"><a href="/topics" data-action="topics"${selected ? '' : ' aria-current="page"'}>全部</a>${groups.map(c => `<a href="/topics?category=${encodeURIComponent(c.id)}" data-action="category" data-category="${h(c.id)}"${c.id === selected ? ' aria-current="page"' : ''}>${h(c.name)}<span>${c.topics.length}</span></a>`).join('')}</nav>
    <div class="feed-list">${topics.length ? topics.map(t => topicItem(t)).join('') : '<div class="empty-state"><h3>这个分类还没有辩题</h3></div>'}</div>
    <p class="feed-note">常驻辩题人工核对来源与原句；AI 编排的辩题逐字校验但不冒充人工核对。来源发生变化时该场会少一个回合，绝不用虚构内容补位。</p>
  </section>`;
}

function categoryHeader(c) {
  return `<section class="card topic-header tone-${h(c.tone)}">
    <a href="/topics" data-action="topics" class="back-link">${icon('back')}全部分类</a>
    <div class="topic-header-body"><span class="topic-mark" aria-hidden="true">${h(c.mark)}</span>
      <div class="topic-header-text"><h1>${h(c.name)}</h1><p>${h(c.description)}</p><div class="topic-contrast"><span>${h(c.contrast[0])}</span><i>／</i><span>${h(c.contrast[1])}</span></div></div>
      <div class="topic-count"><strong>${c.topics.length}</strong><span>个辩题</span></div></div>
  </section>`;
}

function lobbySidebar(groups, selected) {
  return `<section class="card side-card"><h2 class="side-card-title">辩题分类</h2>
    <ul class="category-list">${groups.map(c => `<li><a class="category-link tone-${h(c.tone)}" href="/topics?category=${encodeURIComponent(c.id)}" data-action="category" data-category="${h(c.id)}"${c.id === selected ? ' aria-current="page"' : ''}><span class="category-mark" aria-hidden="true">${h(c.mark)}</span><span class="category-text"><b>${h(c.name)}</b><small>${h(c.description)}</small></span><span class="category-count">${c.topics.length}</span></a></li>`).join('')}</ul></section>
  <section class="card side-card"><h2 class="side-card-title">知辨是什么</h2><div class="side-card-body">
    <p>把知乎上真实存在分歧的回答放在一起看。不必表态，不必争赢。</p>
    <ul class="principles"><li>每条观点都能回到知乎原文</li><li>原句逐字核对，不补写内容</li><li>AI 只做摘要与质询，不裁决胜负</li></ul>
    <button class="btn-soft" data-action="about">${icon('info')}了解真实来源</button></div></section>`;
}

export const page = (mainHtml, sideHtml) => `<div class="zh-page"><div class="zh-main-col">${mainHtml}</div><aside class="zh-side-col">${sideHtml}</aside></div>`;

export function lobbyView(topics, selected, featured = []) {
  const groups = categories(topics), category = groups.find(c => c.id === selected);
  if (selected && !category) {
    return page(`<section class="card empty-state"><h1>还没有这个分类。</h1><p>回到大厅，看看已经开放的辩题。</p><button class="btn-primary" data-action="topics">返回辩题大厅</button></section>`, lobbySidebar(groups, null));
  }
  const mainHtml = category
    ? categoryHeader(category) + feedCard(groups, selected, category.topics)
    : `<h1 class="sr-only">辩题大厅</h1>${featuredCard(featured)}${composer()}${feedCard(groups, null, groups.flatMap(g => g.topics))}`;
  return page(mainHtml, lobbySidebar(groups, selected));
}
