import { createState, transition, escapeHtml as h, pickFeatured } from './data.js';
import { icon, avatar, sourceLink, stamp, displayTitle } from './ui.js';
import { lobbyView, categories, page } from './lobby.js';
import { libraryView, libraryResults } from './library.js';

const app = document.querySelector('#app'), overlay = document.querySelector('#overlay');
let state = createState(), current = null, catalog = [], returnFocus;
let pageVersion = 0, searchVersion = 0, searchItems = [], pageController, searchController;
let summaryController, summaryVersion = 0, summaryCache = new Map(), criticController, criticVersion = 0;
let catalogPromise;
let libraryState = { term: '', source: 'all', category: 'all' };
let featuredList = [], carouselIndex = 0, carouselTimer = null, carouselPaused = false;
const CAROUSEL_INTERVAL = 5000;
const SEEN_KEY = 'zhibian.featuredSeen';
const main = () => document.querySelector('#main');
// The onboarding tour (tour.js) learns which page is showing from this event,
// and asks the carousel to hold still while it points at things.
let tourActive = false;
function markView(view) {
  document.body.dataset.view = view;
  document.dispatchEvent(new window.CustomEvent('zhibian:view', { detail: { view } }));
}
document.addEventListener('zhibian:tour', event => { tourActive = event.detail?.active === true; });

function featuredSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
}
function rememberFeatured(ids) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...featuredSeen(), ...ids])].slice(-120))); } catch { /* Storage may be unavailable. */ }
}
function prefersReducedMotion() {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; } catch { return false; }
}
const announce = text => { document.querySelector('#announcement').textContent = text; };
async function api(url, signal, init = {}) {
  const response = await fetch(url, { ...init, signal }), data = await response.json();
  if (!response.ok) throw new Error(data.message || '暂时无法读取内容，请稍后重试。');
  return data;
}
function navigate(url) {
  if (window.location.pathname + window.location.search !== url) window.history.pushState({}, '', url);
  showRoute();
}
function setNavigation(view) {
  document.querySelectorAll('.app-nav [data-action]').forEach(link => {
    const active = link.dataset.action === view;
    link.classList.toggle('nav-active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
}
function getCatalog() {
  if (catalog.length) return Promise.resolve(catalog);
  if (!catalogPromise) catalogPromise = api('/api/topics').then(data => {
    catalog = data.topics; return catalog;
  }).catch(error => { catalogPromise = null; throw error; });
  return catalogPromise;
}

// ---- 今日热辩 carousel ----
function stopCarousel() {
  if (carouselTimer) { window.clearInterval(carouselTimer); carouselTimer = null; }
  carouselPaused = false;
}
function goToSlide(index, { speak = true } = {}) {
  const track = document.querySelector('#featured-track'), count = featuredList.length;
  if (!track || !count) return;
  carouselIndex = ((index % count) + count) % count;
  track.style.transform = `translateX(-${carouselIndex * 100}%)`;
  track.querySelectorAll('.carousel-slide').forEach((slide, i) => {
    slide.tabIndex = i === carouselIndex ? 0 : -1;
    slide.setAttribute('aria-hidden', String(i !== carouselIndex));
  });
  document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
    dot.setAttribute('aria-selected', String(i === carouselIndex));
    dot.tabIndex = i === carouselIndex ? 0 : -1;
  });
  const status = document.querySelector('#carousel-status');
  if (status && speak) status.textContent = `正在显示第 ${carouselIndex + 1} 道，共 ${count} 道`;
  // Only a slide the reader actually saw counts as seen.
  if (featuredList[carouselIndex]) rememberFeatured([featuredList[carouselIndex].id]);
  void loadSlidePreview(carouselIndex);
}
async function loadSlidePreview(index) {
  const slide = document.querySelector(`.carousel-slide[data-slide="${index}"]`), topic = featuredList[index];
  if (!slide || !topic || slide.dataset.preview === '1') return;
  slide.dataset.preview = '1';
  try {
    const data = await api('/api/preview?id=' + encodeURIComponent(topic.id));
    if (!data.preview || !slide.isConnected) return;
    const put = (side, item) => {
      if (!side || !item) return;
      side.querySelector('.slide-quote').textContent = `「${item.quote}」`;
      side.querySelector('.slide-author').textContent = item.name ? `—— ${item.name}` : '';
    };
    put(slide.querySelector('.slide-side.side-left'), data.preview.left);
    put(slide.querySelector('.slide-side.side-right'), data.preview.right);
    const positions = slide.querySelector('.slide-positions'), read = data.preview.positions;
    if (positions && read && (read.left || read.right)) {
      positions.textContent = `复核：左方 ${read.left || '—'}；右方 ${read.right || '—'}`;
      positions.hidden = false;
    }
  } catch { /* keep the short labels; never substitute generated text */ }
}
function startCarousel() {
  stopCarousel();
  if (!featuredList.length || !document.querySelector('#featured-track')) return;
  goToSlide(0, { speak: false });
  if (prefersReducedMotion()) return;
  const carousel = document.querySelector('#featured-carousel');
  carousel.addEventListener('pointerenter', () => { carouselPaused = true; });
  carousel.addEventListener('pointerleave', () => { carouselPaused = false; });
  carousel.addEventListener('focusin', () => { carouselPaused = true; });
  carousel.addEventListener('focusout', () => { carouselPaused = false; });
  carouselTimer = window.setInterval(() => {
    if (!document.querySelector('#featured-track')) { stopCarousel(); return; }
    if (!carouselPaused && !tourActive) goToSlide(carouselIndex + 1);
  }, CAROUSEL_INTERVAL);
}

// ---- Pages ----
const loadingPage = (title, text = '') => page(`<section class="card loading-state" role="status"><span class="spinner" aria-hidden="true"></span><h1>${title}</h1>${text ? `<p>${text}</p>` : ''}</section><div class="card skeleton" aria-hidden="true"><i></i><i></i><i></i></div><div class="card skeleton" aria-hidden="true"><i></i><i></i><i></i></div>`, '<div class="card skeleton" aria-hidden="true"><i></i><i></i></div>');

function renderLobby() {
  const selected = new URL(window.location.href).searchParams.get('category');
  const group = categories(catalog).find(c => c.id === selected);
  const featured = selected ? (featuredList = []) : (featuredList = pickFeatured(catalog, featuredSeen(), 8));
  main().innerHTML = lobbyView(catalog, selected, featured);
  document.title = (group?.name || '辩题大厅') + ' · 知辨';
  setNavigation('topics');
  startCarousel();
  markView(selected ? 'category' : 'lobby');
  main().focus({ preventScroll: true });
}
function renderLibrary() {
  main().innerHTML = libraryView(catalog, libraryState);
  document.title = '辩题库 · 知辨';
  setNavigation('library');
  markView('library');
  main().focus({ preventScroll: true });
}
function repaintLibrary() {
  const results = document.querySelector('#library-results');
  if (!results) return;
  results.innerHTML = libraryResults(catalog, libraryState);
  const count = document.querySelector('#library-count');
  if (count) count.textContent = String(results.querySelectorAll('.library-card').length);
}
function renderSearch() {
  const query = (new URL(window.location.href).searchParams.get('q') || '').trim();
  setNavigation('search');
  document.title = (query ? query + ' · 搜索' : '搜索') + ' · 知辨';
  const head = query.length >= 2
    ? `<section class="card search-head"><div class="eyebrow">${icon('search')}知乎站内搜索</div><h1>“${h(query)}”</h1><p>先看知乎上的真实回答。DeepSeek 只筛掉与题目无关的内容，不分左右阵营。</p></section><div id="topic-results" aria-live="polite"></div>`
    : `<section class="card empty-state"><h1>想围观什么问题？</h1><p>在顶部搜索框输入至少 2 个字，或点“提问”。</p><button class="btn-primary" data-action="ask">提问</button></section>`;
  const side = `<section class="card side-card"><h2 class="side-card-title">自动编排怎么工作</h2><div class="side-card-body"><ol class="steps"><li>搜索知乎，取回真实回答</li><li>DeepSeek 筛掉跑题的回答</li><li>AI 把真实存在分歧的回答配成对照</li><li>服务端逐字校验原句，对不上的席位直接丢弃</li></ol><p class="muted">配不出真实分歧时，退回观点阅读，不补写内容。</p></div></section>`;
  main().innerHTML = page(head, side);
  markView('search');
  main().focus({ preventScroll: true });
  if (query.length >= 2) void searchTopics(query);
}
function syncHeaderSearch() {
  const input = document.querySelector('#header-query'), button = document.querySelector('#header-search button[type="submit"]');
  if (input) input.value = window.location.pathname === '/search' ? (new URL(window.location.href).searchParams.get('q') || '') : '';
  if (button) button.disabled = false;
}
function showRoute() {
  const version = ++pageVersion;
  pageController?.abort(); searchController?.abort(); searchVersion++; closeDialog(); stopCarousel();
  window.scrollTo({ top: 0, behavior: 'instant' });
  syncHeaderSearch();
  const pathname = window.location.pathname === '/' ? '/topics' : window.location.pathname;
  if (pathname === '/search') return renderSearch();
  if (pathname === '/topics' || pathname === '/library') {
    const library = pathname === '/library';
    setNavigation(library ? 'library' : 'topics');
    if (catalog.length) return library ? renderLibrary() : renderLobby();
    main().innerHTML = loadingPage(`正在打开${library ? '辩题库' : '辩题大厅'}…`);
    getCatalog().then(() => { if (version === pageVersion) (library ? renderLibrary() : renderLobby()); }).catch(error => {
      if (version === pageVersion) main().innerHTML = page(`<section class="card empty-state" role="alert"><h1>目录暂时未能载入</h1><p>${h(error.message)}</p><button class="btn-primary" data-action="topics">重新读取目录</button></section>`, '');
    });
    return;
  }
  const params = new URL(window.location.href).searchParams;
  const freeQuery = (params.get('q') || '').trim();
  if (freeQuery) {
    const freeId = 'q:' + freeQuery;
    if (current?.id === freeId) { state = transition(state, { type: 'arena' }); render(); }
    else fetchDebate('/api/debate?q=' + encodeURIComponent(freeQuery), freeId);
    return;
  }
  const id = params.get('id') || state.topicId;
  if (current?.id === id) { state = transition(state, { type: 'arena' }); render(); }
  else fetchDebate('/api/debate?id=' + encodeURIComponent(id), id);
}
function shell() {
  app.innerHTML = `<header class="app-header"><div class="app-header-inner">
    <a class="brand" href="/topics" data-action="topics" aria-label="知辨，回到辩题大厅"><span class="brand-logo">知辨</span></a>
    <nav class="app-nav" aria-label="主导航"><a href="/topics" data-action="topics">首页</a><a href="/library" data-action="library">辩题库</a><a href="/debate" data-action="arena">辩论现场<i class="nav-dot" aria-hidden="true"></i></a></nav>
    <form id="header-search" class="header-search" role="search"><label class="sr-only" for="header-query">搜索知乎观点</label><input id="header-query" type="search" minlength="2" maxlength="100" autocomplete="off" placeholder="搜索知乎真实观点"><button type="submit" aria-label="搜索知乎">${icon('search')}</button></form>
    <button class="btn-primary ask-button" data-action="ask">提问</button>
    <div class="header-right"><button type="button" class="header-icon-button tour-button" id="tour-button" title="新手引导：讲解当前页面">${icon('guide')}<span>新手引导</span></button><button class="header-icon-button" data-action="about">${icon('info')}<span>知乎真实来源</span></button><span class="avatar viewer" title="旁观者席位：不必站队，自由看看"><span>观</span></span></div>
  </div></header><main id="main" tabindex="-1"></main><footer class="app-footer">知辨 · 让分歧被看见 · 真实来源 · 观点编排</footer>`;
}

// ---- Debate ----
async function fetchDebate(url, id) {
  const version = ++pageVersion;
  pageController?.abort(); pageController = new AbortController();
  state = transition(state, { type: 'topic', id }); current = null; closeDialog();
  setNavigation('arena');
  main().innerHTML = loadingPage('让真实观点上场。', '正在接入知乎：读取回答、核对来源与编排依据。不会用示例内容填补空缺。');
  window.scrollTo({ top: 0, behavior: 'instant' });
  // The arrangement runs a whole pipeline; let the reader watch the real steps
  // instead of a spinner. For an already-arranged topic the pool is cached, so
  // the list is short — that is the honest picture, not a delay being added.
  const job = newJobId();
  main().querySelector('#debate-stages')?.remove();
  const stageHost = document.createElement('section');
  stageHost.className = 'card';
  stageHost.id = 'debate-stages';
  stageHost.setAttribute('role', 'status');
  stageHost.innerHTML = '<p class="stage-heading">正在为这道辩题取材与编排…</p>';
  main().querySelector('.loading-state')?.after(stageHost);
  watchStages(job, stageHost, '正在接入知乎…');
  try {
    const data = await api(url + (url.includes('?') ? '&' : '?') + 'job=' + job, pageController.signal);
    if (version !== pageVersion) return;
    current = data; state = createState(id, data.rounds.length);
    // A freshly arranged free question joins the library, so drop the cached catalogue.
    if (typeof data.id === 'string' && data.id.startsWith('q:') && data.rounds.length) { catalog = []; catalogPromise = null; getCatalog().catch(() => {}); }
    render();
    announce(data.rounds.length ? `已载入 ${data.rounds.length} 组真实观点。` : '这组回答没有形成两方对照，已按观点阅读展示。');
  } catch (error) {
    if (version !== pageVersion || error.name === 'AbortError') return;
    main().innerHTML = page(`<section class="card empty-state error-state" role="alert">${icon('info')}<h1>这次没能把观点请来。</h1><p>${h(error.message)}</p><div class="button-row"><button class="btn-primary" data-action="retry">重新读取</button><button class="btn-secondary" data-action="topics">换个辩题</button></div></section>`, '');
  } finally { stopStageWatch(); }
}
function render() {
  if (!current) return;
  summaryController?.abort();
  setNavigation('arena');
  // With rounds, the debate goes full width so the two sides sit left and right;
  // the reading mode keeps the two-column page.
  main().innerHTML = questionHeader() + (current.rounds.length
    ? `<div class="zh-wide">${lineup()}${state.view === 'recap' ? recap() : arena()}<div class="debate-extras">${related()}${readingTip()}</div></div>`
    : page(arena(), related() + readingTip()));
  document.title = current.title + ' · 知辨';
  markView(state.view === 'recap' ? 'recap' : (current.rounds.length ? 'debate' : 'reading'));
  if (state.view === 'arena') void loadVisibleSummaries();
}
// The model returns the summary as one flowing paragraph, but readers take it in
// a sentence at a time — so each sentence gets its own line. Only where the line
// breaks fall changes; the wording is untouched.
function summaryLines(text) {
  return String(text ?? '')
    .split(/\r?\n+/)
    .flatMap(paragraph => paragraph.match(/[^。！？!?；;]+[。！？!?；;]*/g) || [paragraph])
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
}
async function loadVisibleSummaries() {
  const version = ++summaryVersion;
  summaryController = new AbortController();
  const seats = current?.rounds?.[state.round] || [];
  await Promise.all(seats.map(async source => {
    const node = [...document.querySelectorAll('.ai-summary')].find(item => item.dataset.summaryId === source.id);
    if (!node) return;
    const key = source.id + '\u0000' + (source.originalText || source.text);
    try {
      const result = summaryCache.get(key) || await api('/api/summarize', summaryController.signal, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: source.id, text: source.originalText || source.text })
      });
      summaryCache.set(key, result);
      if (version !== summaryVersion || !node.isConnected) return;
      node.classList.remove('pending');
      node.querySelector('[data-summary-text]').textContent = summaryLines(result.summary);
      node.querySelector('.ai-summary-model').textContent = `${result.model || 'AI'} 生成`;
    } catch (error) {
      if (version !== summaryVersion || error.name === 'AbortError' || !node.isConnected) return;
      node.classList.remove('pending'); node.classList.add('unavailable');
      node.querySelector('[data-summary-text]').textContent = 'AI 摘要暂时不可用，请先阅读原文。';
      node.querySelector('.ai-summary-model').textContent = '可直接阅读原文';
    }
  }));
}
const lensName = i => current.lenses?.[i] || `第 ${i + 1} 回合`;
const sideName = side => (side ? '右方' : '左方');
const sideTone = side => (side ? 'side-right' : 'side-left');

function questionHeader() {
  const n = current.rounds.length, auto = current.autoArranged;
  return `<section class="question-header"><div class="question-header-inner">
    <div class="question-main">
      <div class="tag-row">${current.category ? `<span class="tag">${h(current.category)}</span>` : ''}<span class="tag tag-plain">${auto ? '自由辩题' : '本场辩题'}</span>${auto ? '<span class="badge badge-auto">AI 自动编排 · 原句已逐字校验</span>' : '<span class="badge badge-curated">已核对原句</span>'}</div>
      <h1 class="question-title">${h(current.title)}</h1>
      ${current.intro ? `<p class="question-detail">${h(current.intro)}</p>` : ''}
      <div class="question-actions"><button class="btn-primary" data-action="sources">${icon('book')}查看 ${current.items.length} 条来源</button><button class="btn-secondary" data-action="topics">${icon('grid')}换个辩题</button>${state.view === 'recap' ? `<button class="btn-ghost" data-action="arena">${icon('back')}回到辩论</button>` : ''}</div>
    </div>
    <dl class="number-board">${n ? `<div><dt>回合</dt><dd>${n}</dd></div><div><dt>真实观点</dt><dd>${n * 2}</dd></div>` : `<div><dt>知乎来源</dt><dd>${current.items.length}</dd></div>`}</dl>
  </div></section>`;
}
function provenance() {
  const auto = current.autoArranged;
  const tail = auto || current.rounds.length >= 3 ? '' : ' 未核对通过的回合不会用内容补位。';
  return `<section class="card provenance-card"><div class="provenance-line"><span class="live-dot" aria-hidden="true"></span>知乎 API · ${current.cached ? '缓存于' : '获取于'} ${stamp(current.fetchedAt)}${auto && current.model ? ' · 编排模型 ' + h(current.model) : ''}<button class="link-button" data-action="sources">${current.items.length} 条来源${icon('arrow')}</button></div>${tail ? `<p class="arrangement-note">${tail.trim()}</p>` : ''}</section>`;
}
function arena() {
  if (!current.rounds.length) {
    return `<section class="card notice-card"><h2>先看观点，不急着分两边。</h2><p>${h(current.notice || '当前返回的内容未形成已核对的对立组合，先保留真实来源。')}</p></section>${current.items.length ? `<section class="card answer-list"><h2 class="list-header">${current.items.length} 条知乎来源</h2>${current.items.map(sourceArticle).join('')}</section>` : ''}${provenance()}`;
  }
  const r = state.round, n = current.rounds.length, shared = current.sharedQuestions?.[r];
  return `<section class="card round-card"><div class="round-navigation"><div class="round-tabs" role="tablist" aria-label="选择辩论回合">${current.rounds.map((_, i) => `<button id="round-${i}" role="tab" aria-controls="round-panel" aria-selected="${i === r}" tabindex="${i === r ? 0 : -1}" data-action="round" data-index="${i}" class="round-tab${i === r ? ' selected' : ''}"><span class="round-number">${String((current.roundIndexes?.[i] ?? i) + 1).padStart(2, '0')}</span>${h(current.lenses?.[i] || '')}</button>`).join('')}</div><span class="round-position">第 ${r + 1} / ${n} 回合</span></div></section>
    <div id="round-panel" role="tabpanel" aria-labelledby="round-${r}">
      ${shared ? `<section class="card shared-card"><p class="shared-question">这回合两人回答的是同一个问题：<b>${h(shared)}</b></p></section>` : ''}
      <div class="debate-pair">${current.rounds[r].map(card).join('<div class="versus" aria-hidden="true"><span>VS</span></div>')}</div>
    </div>
    <section class="card round-footer"><div class="watch-note">${icon('arena')}<span>不必急着站队，先把两边听完。</span></div><div class="round-actions"><button class="btn-secondary previous-button" data-action="previous"${r === 0 ? ' disabled' : ''}>${icon('back')}上一轮</button><button class="btn-primary next-button" data-action="next">${r === n - 1 ? '看本场回顾' : '下一轮 · ' + h(lensName(r + 1))}${icon('arrow')}</button></div></section>
    ${provenance()}`;
}
function card(s, side) {
  const auto = current.autoArranged;
  return `<article class="card answer-item opinion-card ${sideTone(side)}">
    <div class="answer-stance"><span class="side-label">${sideName(side)}</span><span class="answer-stance-text">${h(side ? current.right : current.left)}</span></div>
    <div class="card-author">${avatar(s, 'large')}<div class="author-info"><div class="author-name-line"><h3 title="${h(s.name)}">${h(s.name)}</h3>${s.badge ? `<span class="author-badge">${icon('verified')}${h(s.badge)}</span>` : ''}</div><span class="author-caption">知乎答主 · ${sideName(side)}观点</span></div></div>
    <span class="quote-label">${auto ? '原回答原句 · 已逐字校验' : '原回答中的核对原句'}</span>
    ${auto && s.stance ? `<span class="stance-tag">AI 判定这一方：${h(s.stance)}</span>` : ''}
    <blockquote class="opinion-title">${h(s.evidence)}</blockquote>
    <section class="ai-summary pending" data-summary-id="${h(s.id)}" aria-live="polite"><div class="ai-summary-heading"><span>${icon('spark')}AI 观点摘要</span><small class="ai-summary-model">正在整理</small></div><p data-summary-text>正在整理这条回答的核心观点…</p></section>
    ${s.editedAt ? `<p class="answer-time">编辑于 ${stamp(s.editedAt).split(' ')[0]}</p>` : ''}
    <div class="answer-actions">${s.votes === null || s.votes === undefined ? '' : `<span class="vote-pill" title="知乎上的赞同数">${icon('up')}赞同 ${h(s.votes)}</span>`}<button class="action-button source-button" data-action="source" data-side="${side}">${icon('book')}原文与来源</button><button class="action-button critic-button" data-action="critic" data-side="${side}">${icon('spark')}AI 质询<span class="soon-label">可提问</span></button>${sourceLink(s, '知乎原文')}</div>
  </article>`;
}
function camp(side) {
  return `<div class="card camp ${sideTone(side)}"><div class="camp-heading"><span class="side-label">${sideName(side)}</span><h3>${h(side ? current.right : current.left)}</h3></div><div class="seat-list">${current.rounds.map((pair, i) => {
    const on = i === state.round && state.view === 'arena';
    return `<button data-action="round" data-index="${i}" class="seat${on ? ' on-stage' : ''}" aria-label="查看${h(pair[side].name)}的${h(lensName(i))}观点" aria-pressed="${on}">${avatar(pair[side])}<span class="seat-person"><b>${h(pair[side].name)}</b><small>${h(lensName(i))}</small></span></button>`;
  }).join('')}</div></div>`;
}
function related() {
  const list = catalog.filter(t => t.category === current.category && t.id !== state.topicId && t.featured !== true).slice(0, 5);
  if (!list.length) return '';
  return `<section class="card side-card"><h2 class="side-card-title">相关辩题</h2><ul class="related-list">${list.map(t => `<li><a href="/debate?id=${encodeURIComponent(t.id)}" data-action="choose-topic" data-id="${h(t.id)}">${h(displayTitle(t))}</a><span>${t.editorialMode === 'reading' ? '观点阅读' : `${t.reviewedPairs || 1} 组观点`}${t.autoArranged ? ' · AI 编排' : ''}</span></li>`).join('')}</ul></section>`;
}
function lineup() {
  return `<section class="lineup" aria-label="双方阵容">${camp(0)}<div class="versus versus-vertical" aria-hidden="true"><span>VS</span></div>${camp(1)}</section>`;
}
function readingTip() {
  return `<section class="card side-card"><h2 class="side-card-title">阅读提示</h2><div class="side-card-body"><p>作者并未实际同场辩论，观点可能来自不同问题。阵营与回合是本应用的编排，不代表谁赢。</p><button class="btn-soft" data-action="about">${icon('info')}关于真实来源</button></div></section>`;
}
function recap() {
  return `<section class="card recap-heading"><div class="eyebrow">本场回顾 · 原观点对照</div><h2 class="recap-title">分歧有来由，选择有条件。</h2><p class="muted">${h(current.title)}</p></section>
    <div class="recap-pair">${[0, 1].map(side => `<section class="card recap-camp ${sideTone(side)}"><div class="camp-heading"><span class="side-label">${sideName(side)}</span><h3>${h(side ? current.right : current.left)}</h3></div>${current.rounds.map(pair => `<blockquote>${h(pair[side].evidence)}<cite>${avatar(pair[side], 'tiny')}<span>${h(pair[side].name)}</span>${sourceLink(pair[side], '原文')}</cite></blockquote>`).join('')}</section>`).join('')}</div>
    <section class="card questions-card"><h2>看完之后，还可以核对什么？</h2><ol>${current.questions.map(q => `<li>${h(q)}</li>`).join('')}</ol></section>
    <p class="recap-disclaimer">引述来自知乎 API 返回正文；AI 摘要只是阅读辅助。核对问题为编辑提示，不是 AI 裁决，也不判定哪位答主获胜。</p>
    <section class="card recap-actions"><button class="btn-secondary" data-action="arena">${icon('back')}回到辩论</button><button class="btn-secondary" data-action="sources">查看本场来源</button><button class="btn-primary" data-action="topics">再看一个辩题${icon('arrow')}</button></section>`;
}

// ---- Dialogs ----
const dialogHeader = (eyebrow, title) => `<div class="dialog-header"><div><div class="eyebrow">${h(eyebrow)}</div><h2 id="dialog-title">${h(title)}</h2></div><button class="icon-button" data-action="close" aria-label="关闭">${icon('close')}</button></div>`;
function openDialog(header, body, type = '') {
  if (!overlay.open) returnFocus = document.activeElement;
  overlay.className = type; overlay.innerHTML = header + `<div class="dialog-body">${body}</div>`;
  if (!overlay.open) overlay.showModal();
  document.body.classList.add('modal-open');
}
function closeDialog() { if (overlay.open) overlay.close(); }
function sourceArticle(s) {
  return `<article class="source-article"><div class="source-author">${avatar(s)}<b>${h(s.name)}</b>${s.badge ? `<span>${h(s.badge)}</span>` : '<span>知乎来源</span>'}</div><h3>${h(s.sourceTitle)}</h3><p>${h(s.originalText || s.text)}</p>${sourceLink(s, '在知乎查看完整原文')}<small>知乎接口返回正文；完整上下文以知乎原文为准。</small></article>`;
}
function openSources(side) {
  if (!current) return;
  const items = Number.isInteger(side) && current.rounds.length ? [current.rounds[state.round][side]] : current.items;
  openDialog(dialogHeader('每条观点，都有来处', '原文与来源'), `<div class="notice">${icon('info')}<p>来自知乎开放平台，获取于 ${stamp(current.fetchedAt)}。这里展示接口返回的正文；点击链接可在知乎查看完整上下文。阵营和回合是本应用的编排，不是真人同场辩论。</p></div><div class="source-list">${items.map(sourceArticle).join('')}</div>`, 'sources-dialog');
}
function openCritic(side) {
  const s = current?.rounds[state.round]?.[side]; if (!s) return;
  criticController?.abort();
  openDialog(dialogHeader('把你的质疑顶回来', 'AI 替这一方回应'), `<div class="critic-target ${sideTone(side)}">${avatar(s)}<div><small>当前选中 · ${h(s.name)}</small><p>${h(s.evidence)}</p></div></div><div class="notice">${icon('info')}<p><b>下面这段是 AI 模拟的反驳，不是 ${h(s.name)} 本人说的话。</b>它只站在这条回答的立场上、用这条回答的语气回你，论据全部取自这条回答的原文；答主不知道、也没有参与。</p></div><form class="critic-form" data-side="${side}" novalidate><label for="critic-question">你想怎么质疑它？</label><textarea id="critic-question" name="question" rows="3" maxlength="2000" placeholder="例如：你说的这条前提在我这儿不成立，凭什么？／收入差距很大的话，你的结论还站得住吗？"></textarea><div class="dialog-actions">${sourceLink(s)}<button class="btn-primary" type="submit">${icon('spark')}让它回应</button></div></form><section class="critique-result" data-critique-result aria-live="polite"><div class="critic-idle">${icon('spark')}<p>输入你的质疑后，AI 会以这条回答的立场反驳你。</p></div></section><p class="dialog-footnote">模拟内容，不是答主原话；不推测作者身份，也不会用这条回答里没提到的理由来反驳你。</p>`, 'critic-dialog');
}
function openAsk() {
  openDialog(dialogHeader('向知乎提一个问题', '提问'), `<form id="ask-form" class="ask-form"><label for="ask-query">写下你想围观的问题</label><textarea id="ask-query" name="query" rows="3" maxlength="100" placeholder="例如：该不该为了孩子辞掉工作？"></textarea><p class="dialog-footnote">知辨会先搜索知乎真实回答，再用 DeepSeek 筛掉无关观点；是否自动编排成一场，由你决定。</p><div class="dialog-actions"><button type="button" class="btn-secondary" data-action="close">取消</button><button class="btn-primary" type="submit">${icon('search')}搜索知乎</button></div></form>`, 'ask-dialog');
  document.querySelector('#ask-query')?.focus();
}
function openAbout() {
  openDialog(dialogHeader('关于这个版本', '真实观点，重新相遇。'), '<div class="about-content"><p>观点、作者与认证来自知乎官方接口；卡片上的 AI 观点摘要只针对接口返回的回答正文，不评价作者，也不补充原文之外的事实。</p><p>点击“原文与来源”可以阅读接口返回的正文并打开知乎完整上下文；新辩题搜索结果会先自动筛掉与题目无关的回答。</p><p>自由提问可以先按观点阅读，也可以点“自动编排”：AI 会把真实存在分歧的回答配成对照回合，并抄回逐字原句，服务端再与知乎返回的正文核对一次，对不上的席位直接丢弃。它只是阅读顺序，不代表谁赢。</p><p>已编排场次采用人工核对的来源与原句匹配。接口不再返回某条内容、或其依据发生变化时，该席位不会用虚构内容补齐。AI 质询与摘要默认使用 deepseek-flash，排队超过 5 秒自动改用 deepseek-v4-pro，卡片上会标出实际作答的模型；相关性筛选不负责分阵营。</p></div>', 'about-dialog');
}
async function runCritique(form) {
  const s = current?.rounds[state.round]?.[Number(form.dataset.side)], question = form.elements.question.value.trim(), result = document.querySelector('[data-critique-result]'), button = form.querySelector('button[type="submit"]');
  if (!s || !question || !result || !button) return;
  const requestVersion = ++criticVersion;
  criticController?.abort(); criticController = new AbortController();
  button.disabled = true; button.textContent = '正在组织回应…'; result.className = 'critique-result pending'; result.textContent = '正在站在这条回答的立场上组织回应…';
  try {
    const data = await api('/api/critique', criticController.signal, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      sourceId: s.id, topic: current.title, side: Number(form.dataset.side) ? current.right : current.left, evidence: s.evidence, text: s.originalText || s.text, question
    }) });
    if (requestVersion !== criticVersion || !result.isConnected) return;
    result.className = 'critique-result'; result.innerHTML = `<div class="analysis-label">${icon('spark')}AI 模拟回应${data.model ? ` · ${h(data.model)}` : ''}</div><p>${h(data.answer)}</p><small class="analysis-reference">AI 模拟，不是 ${h(s.name)} 本人说的话；论据取自这条回答的知乎原文，请以原文为准。</small>`;
  } catch (error) {
    if (requestVersion !== criticVersion || error.name === 'AbortError' || !result.isConnected) return;
    result.className = 'critique-result unavailable'; result.textContent = error.message || 'AI 质询暂时不可用，请稍后再试。';
  } finally { if (requestVersion === criticVersion && button.isConnected) { button.disabled = false; button.innerHTML = `${icon('spark')}让它回应`; } }
}

// ---- Search ----
function goSearch(query) {
  const q = String(query || '').trim();
  if (q.length < 2) { announce('请输入至少 2 个字的问题。'); return; }
  closeDialog();
  navigate('/search?q=' + encodeURIComponent(q));
}
// What the server is actually doing, while it does it.
//
// The pipeline reports its real stages (which keywords were searched, whether
// the opposition was independently checked) and the interface polls for them.
// This is a window, not a progress bar: nothing here is estimated, and if the
// server has not reported anything yet the caller's own placeholder is shown.
let stageTimer = null;
function newJobId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function stopStageWatch() {
  if (!stageTimer) return;
  try { window.clearInterval(stageTimer); } catch { /* the window is already gone */ }
  stageTimer = null;
}
function paintStages(host, stages, fallback) {
  const rows = stages.length ? stages : [{ label: fallback, detail: '' }];
  host.innerHTML = `<ol class="stage-list">${rows.map((stage, index) => {
    const running = index === rows.length - 1;
    return `<li class="stage ${running ? 'running' : 'done'}"><span class="stage-mark" aria-hidden="true">${running ? '' : '✓'}</span><span class="stage-body"><b>${h(stage.label)}</b>${stage.detail ? `<small>${h(stage.detail)}</small>` : ''}</span></li>`;
  }).join('')}</ol>`;
}
function watchStages(job, host, fallback) {
  stopStageWatch();
  const tick = async () => {
    // A test harness closes the window mid-flight; polling must not resurrect it.
    if (typeof window === 'undefined' || !host.isConnected) { stopStageWatch(); return; }
    try {
      const data = await api('/api/progress?job=' + encodeURIComponent(job));
      if (typeof window === 'undefined' || !host.isConnected) { stopStageWatch(); return; }
      paintStages(host, data.stages || [], fallback);
    } catch { /* stages are a nicety; the real request still reports its own errors */ }
  };
  void tick();
  stageTimer = window.setInterval(tick, 500);
}
async function searchTopics(query) {
  const version = ++searchVersion;
  searchController?.abort(); searchController = new AbortController();
  const results = document.querySelector('#topic-results'), submit = document.querySelector('#header-search button[type="submit"]');
  if (!results) return;
  if (submit) submit.disabled = true;
  const job = newJobId();
  results.innerHTML = `<section class="card" role="status"><p class="stage-heading">${icon('search')}正在搜索知乎真实观点…</p><div id="search-stages"></div></section>`;
  watchStages(job, results.querySelector('#search-stages'), '正在向知乎发起搜索…');
  const restore = '<div class="restore-row"><button class="btn-secondary restore-topics" data-action="restore-topics">回到已编排辩题</button></div>';
  try {
    const data = await api('/api/search?q=' + encodeURIComponent(query) + '&job=' + job, searchController.signal);
    if (version !== searchVersion || !results.isConnected) return;
    // Say which phrasings were used: one search returns at most ten results, so
    // the count the reader sees only makes sense next to the keywords behind it.
    const usedKeywords = data.queries?.length > 1
      ? `<p class="keyword-note">${icon('search')}用了 ${data.queries.length} 组关键词，每组最多 10 条，已合并去重：${data.queries.map(term => `<span class="keyword">${h(term)}</span>`).join('')}</p>`
      : '';
    if (!data.items.length) {
      searchItems = [];
      results.innerHTML = `<section class="card"><p class="search-summary">找到 0 条</p>${usedKeywords}<div class="empty-state"><h3>这次没有找到有效观点</h3><p>试试更具体的问题，或换一个关键词。</p></div></section>${restore}`;
      return;
    }
    results.innerHTML = `<section class="card"><p class="search-summary">找到 ${data.items.length} 条 · ${data.cached ? '缓存于' : '获取于'} ${stamp(data.fetchedAt)}</p>${usedKeywords}<div class="empty-state" role="status">${icon('spark')}<p>正在用 DeepSeek 筛选与“${h(query)}”直接相关的观点…</p></div></section>`;
    const filtered = await api('/api/filter', searchController.signal, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      topic: query, items: data.items.map(item => ({ id: item.id, sourceTitle: item.sourceTitle, text: item.text.slice(0, 12000) }))
    }) });
    if (version !== searchVersion || !results.isConnected) return;
    const decisions = new Map((filtered.items || []).map(item => [item.id, item]));
    searchItems = data.items.filter(item => decisions.get(item.id)?.relevant === true);
    const cta = searchItems.length >= 4
      ? `<section class="card arrange-cta"><div><h3>${icon('spark')}想让 AI 把它们排成一场？</h3><p>AI 只把真实存在分歧的回答配成对照，每条原句都会与知乎返回的正文逐字校验；配不出的回合直接留空，不会补写内容。</p></div><button class="btn-primary" data-action="auto-arrange" data-query="${h(query)}">自动编排这 ${searchItems.length} 条${icon('arrow')}</button></section>`
      : '';
    const list = searchItems.length
      ? `<div class="feed-list">${searchItems.map((s, i) => `<article class="feed-item search-item"><div class="source-author">${avatar(s)}<b>${h(s.name)}</b>${s.badge ? `<span>${h(s.badge)}</span>` : ''}</div><h2 class="feed-title"><button class="link-title search-option" data-action="search-source" data-index="${i}">${h(s.sourceTitle)}</button></h2><p class="feed-excerpt">${h(s.text.slice(0, 150))}${s.text.length > 150 ? '…' : ''}</p><div class="feed-actions">${s.votes === null || s.votes === undefined ? '' : `<span class="vote-pill">${icon('up')}赞同 ${h(s.votes)}</span>`}<button class="action-button" data-action="search-source" data-index="${i}">${icon('book')}阅读原文与来源</button>${sourceLink(s, '知乎原文')}</div></article>`).join('')}</div>`
      : '<div class="empty-state"><h3>没有通过相关性筛选的观点</h3><p>可以换一个更具体的辩题表述。</p></div>';
    results.innerHTML = `${cta}<section class="card search-results"><div class="search-summary">DeepSeek 已筛选 ${searchItems.length} 条直接相关观点（原始结果 ${data.items.length} 条） · ${h(filtered.model || 'deepseek-flash')}<small>这里只判断能否站到辩题的某一边，不自动分左右阵营；点击观点可阅读完整原文。</small></div>${usedKeywords}${list}</section>${restore}`;
  } catch (error) {
    if (version !== searchVersion || error.name === 'AbortError' || !results.isConnected) return;
    results.innerHTML = `<section class="card empty-state" role="alert"><h3>相关性筛选暂时不可用</h3><p>${h(error.message)} 未展示未经筛选的结果。</p></section>${restore}`;
  } finally { stopStageWatch(); if (version === searchVersion && submit?.isConnected) submit.disabled = false; }
}

// ---- Events ----
overlay.addEventListener('close', () => {
  document.body.classList.remove('modal-open');
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
});
overlay.addEventListener('click', e => {
  if (e.target !== overlay) return;
  const r = overlay.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog();
});
document.addEventListener('error', e => { if (e.target.matches?.('.avatar img')) e.target.remove(); }, true);
document.addEventListener('click', e => {
  const button = e.target.closest('[data-action]'); if (!button || button.disabled) return;
  if (button.tagName === 'A') {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
  }
  const action = button.dataset.action, side = Number(button.dataset.side);
  if (action === 'close') return closeDialog();
  if (action === 'topics' || action === 'restore-topics') return navigate('/topics');
  if (action === 'library') return navigate('/library');
  if (action === 'ask') return openAsk();
  if (action === 'about') return openAbout();
  if (action === 'library-filter') {
    libraryState = { ...libraryState, [button.dataset.group]: button.dataset.value };
    document.querySelectorAll(`[data-action="library-filter"][data-group="${button.dataset.group}"]`).forEach(chip => {
      const on = chip.dataset.value === button.dataset.value;
      chip.classList.toggle('on', on); chip.setAttribute('aria-pressed', String(on));
    });
    return repaintLibrary();
  }
  if (action === 'carousel') return goToSlide(carouselIndex + Number(button.dataset.dir));
  if (action === 'carousel-dot') return goToSlide(Number(button.dataset.index));
  if (action === 'category') return navigate('/topics?category=' + encodeURIComponent(button.dataset.category));
  if (action === 'retry') return showRoute();
  if (action === 'choose-topic') return navigate('/debate?id=' + encodeURIComponent(button.dataset.id));
  if (action === 'auto-arrange') return navigate('/debate?q=' + encodeURIComponent(button.dataset.query));
  if (action === 'sources') return openSources();
  if (action === 'source') return openSources(side);
  if (action === 'critic') return openCritic(side);
  if (action === 'search-source') {
    const s = searchItems[Number(button.dataset.index)];
    if (s) openDialog(dialogHeader('知乎真实来源', '原文与来源'), sourceArticle(s) + '<div class="dialog-actions"><button class="btn-secondary" data-action="close">回到搜索结果</button></div>', 'sources-dialog');
    return;
  }
  if (action === 'arena' && window.location.pathname !== '/debate') {
    return state.topicId.startsWith('q:')
      ? navigate('/debate?q=' + encodeURIComponent(state.topicId.slice(2)))
      : navigate('/debate?id=' + encodeURIComponent(state.topicId));
  }
  if (!current) return;
  if (action === 'round') state = transition(state, { type: 'round', index: Number(button.dataset.index) });
  else if (action === 'next') state = transition(state, { type: 'next' });
  else if (action === 'previous') state = transition(state, { type: 'back' });
  else if (action === 'arena') state = transition(state, { type: 'arena' });
  else return;
  render(); announce(state.view === 'recap' ? '已进入本场回顾' : `第 ${state.round + 1} 回合：${current.lenses?.[state.round] || '观点阅读'}`);
  if (action === 'round' && button.matches('[role="tab"]')) document.querySelector('#round-' + state.round)?.focus({ preventScroll: true });
  else if (state.view === 'arena' && action !== 'arena') {
    (document.querySelector('.round-tabs [aria-selected="true"]') || main()).focus({ preventScroll: true });
    (document.querySelector('.round-card') || main()).scrollIntoView({ block: 'start', behavior: 'instant' });
  } else { main().focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
});
document.addEventListener('submit', e => {
  const form = e.target;
  if (form.matches('.critic-form')) { e.preventDefault(); void runCritique(form); return; }
  if (form.id === 'header-search') { e.preventDefault(); goSearch(document.querySelector('#header-query').value); return; }
  if (form.id === 'topic-search') { e.preventDefault(); goSearch(document.querySelector('#topic-query').value); return; }
  if (form.id === 'ask-form') { e.preventDefault(); goSearch(document.querySelector('#ask-query').value); return; }
  if (form.id === 'library-search') {
    e.preventDefault();
    libraryState = { ...libraryState, term: document.querySelector('#library-query').value.trim() };
    repaintLibrary();
  }
});
document.addEventListener('input', e => {
  if (e.target.id !== 'library-query') return;
  libraryState = { ...libraryState, term: e.target.value };
  repaintLibrary();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'ask-query' && !e.shiftKey && !e.isComposing) { e.preventDefault(); goSearch(e.target.value); return; }
  if (!e.target.matches('[role="tab"].round-tab') || !current?.rounds.length) return;
  let index = state.round; const count = current.rounds.length;
  if (e.key === 'ArrowRight') index = (index + 1) % count;
  else if (e.key === 'ArrowLeft') index = (index + count - 1) % count;
  else if (e.key === 'Home') index = 0;
  else if (e.key === 'End') index = count - 1;
  else return;
  e.preventDefault(); state = transition(state, { type: 'round', index }); render(); document.querySelector('#round-' + index).focus();
});
shell();
window.addEventListener('popstate', showRoute);
getCatalog().catch(() => {});
showRoute();
