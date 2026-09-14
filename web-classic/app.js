import { createState, transition, escapeHtml as h, pickFeatured } from './data.js';
import { lobbyView, categories } from './lobby.js';
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
function featuredSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
}
function rememberFeatured(ids) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...featuredSeen(), ...ids])].slice(-120))); } catch { /* Storage may be unavailable. */ }
}
function prefersReducedMotion() {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true; } catch { return false; }
}
const paths = {
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>', back: '<path d="m14 6-6 6 6 6"/>', chevron: '<path d="m8 10 4 4 4-4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  arena: '<path d="M3 5h7v10H7l-4 4V5Zm11 0h7v14l-4-4h-3V5Z"/>',
  book: '<path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2V4Z"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  user: '<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>', sound: '<path d="M4 10v4m4-8v12m4-14v16m4-13v10m4-7v4"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
const avatar = (s, color = '', size = '') => `<span class="avatar ${color} ${size}" aria-hidden="true"><span>${h(s.name.slice(0, 1))}</span>${s.avatarUrl ? `<img src="${h(s.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>`;
const sourceLink = (s, label = '在知乎看原文') => `<a class="source-link" href="${h(s.sourceUrl)}" target="_blank" rel="noopener noreferrer">${label} ${icon('arrow')}</a>`;
const stamp = value => value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
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
  document.querySelectorAll('.sidebar nav [data-action]').forEach(button => {
    const active = button.dataset.action === view;
    button.classList.toggle('nav-active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
}
function getCatalog() {
  if (catalog.length) return Promise.resolve(catalog);
  if (!catalogPromise) catalogPromise = api('/api/topics').then(data => {
    catalog = data.topics; return catalog;
  }).catch(error => { catalogPromise = null; throw error; });
  return catalogPromise;
}
function featuredTopics() {
  featuredList = pickFeatured(catalog, featuredSeen(), 8);
  return featuredList;
}
function stopCarousel() {
  if (carouselTimer) { window.clearInterval(carouselTimer); carouselTimer = null; }
  carouselPaused = false;
}
function goToSlide(index, { announce = true } = {}) {
  const track = document.querySelector('#featured-track');
  const count = featuredList.length;
  if (!track || !count) return;
  carouselIndex = ((index % count) + count) % count;
  track.style.transform = `translateX(-${carouselIndex * 100}%)`;
  document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
    dot.setAttribute('aria-selected', String(i === carouselIndex));
    dot.tabIndex = i === carouselIndex ? 0 : -1;
  });
  const status = document.querySelector('#carousel-status');
  if (status && announce) status.textContent = `正在显示第 ${carouselIndex + 1} 道，共 ${count} 道`;
  // Only a slide the reader actually saw counts as seen, so the next visit can
  // rotate something new in.
  if (featuredList[carouselIndex]) rememberFeatured([featuredList[carouselIndex].id]);
  void loadSlidePreview(carouselIndex);
}
async function loadSlidePreview(index) {
  const slide = document.querySelector(`.carousel-slide[data-slide="${index}"]`);
  const topic = featuredList[index];
  if (!slide || !topic || slide.dataset.preview === '1') return;
  slide.dataset.preview = '1';
  try {
    const data = await api('/api/preview?id=' + encodeURIComponent(topic.id));
    if (!data.preview || !slide.isConnected) return;
    const put = (side, item) => {
      if (!side || !item) return;
      const quote = side.querySelector('.slide-quote');
      const author = side.querySelector('.slide-author');
      if (quote) quote.textContent = `「${item.quote}」`;
      if (author) author.textContent = item.name ? `—— ${item.name}` : '';
    };
    put(slide.querySelector('.slide-side.coral'), data.preview.left);
    put(slide.querySelector('.slide-side.blue'), data.preview.right);
    const positions = slide.querySelector('.slide-positions');
    const read = data.preview.positions;
    if (positions && read && (read.left || read.right)) {
      positions.textContent = `复核：左方 ${read.left || '—'}；右方 ${read.right || '—'}`;
      positions.hidden = false;
    }
  } catch { /* keep the short labels; never substitute generated text */ }
}
function startCarousel() {
  stopCarousel();
  if (!featuredList.length) return;
  goToSlide(0, { announce: false });
  const status = document.querySelector('#carousel-status');
  if (status) status.textContent = `正在显示第 1 道，共 ${featuredList.length} 道`;
  if (prefersReducedMotion()) return;
  const carousel = document.querySelector('#featured-carousel');
  if (carousel) {
    carousel.addEventListener('pointerenter', () => { carouselPaused = true; });
    carousel.addEventListener('pointerleave', () => { carouselPaused = false; });
    carousel.addEventListener('focusin', () => { carouselPaused = true; });
    carousel.addEventListener('focusout', () => { carouselPaused = false; });
  }
  // Timers go through `window` (not the bare global) so a test harness that
  // swaps in a jsdom window can shut them down with it.
  window.setInterval(() => {
    if (!document.querySelector('#featured-track')) { stopCarousel(); return; }
    if (!carouselPaused) goToSlide(carouselIndex + 1);
  }, CAROUSEL_INTERVAL);
}
function renderLobby() {
  const selected = new URL(window.location.href).searchParams.get('category');
  const group = categories(catalog).find(c => c.id === selected);
  document.querySelector('#main').innerHTML = lobbyView(catalog, selected, icon, featuredTopics());
  document.querySelector('#view-label').textContent = '辩题大厅';
  document.querySelector('#category').textContent = group?.name || '全部分类';
  document.title = (group?.name || '辩题大厅') + ' · 知辨';
  setNavigation('topics');
  startCarousel();
  document.querySelector('#main').focus({ preventScroll: true });
}
function renderLibrary() {
  document.querySelector('#main').innerHTML = libraryView(catalog, libraryState, icon);
  document.querySelector('#view-label').textContent = '辩题库';
  document.querySelector('#category').textContent = '全部辩题';
  document.title = '辩题库 · 知辨';
  setNavigation('library');
  document.querySelector('#main').focus({ preventScroll: true });
}
function repaintLibrary() {
  const results = document.querySelector('#library-results');
  if (!results) return;
  results.innerHTML = libraryResults(catalog, libraryState, icon);
  const count = document.querySelector('#library-count');
  if (count) count.textContent = String(results.querySelectorAll('.library-card').length);
}
function showRoute() {
  const version = ++pageVersion;
  pageController?.abort(); searchController?.abort(); searchVersion++; closeDialog(); stopCarousel();
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (window.location.pathname === '/topics' || window.location.pathname === '/library') {
    const library = window.location.pathname === '/library';
    setNavigation(library ? 'library' : 'topics');
    if (catalog.length) return library ? renderLibrary() : renderLobby();
    document.querySelector('#main').innerHTML = `<section class="loading-state" role="status"><h1>正在打开${library ? '辩题库' : '辩题大厅'}…</h1></section>`;
    getCatalog().then(() => { if (version === pageVersion) (library ? renderLibrary() : renderLobby()); }).catch(error => {
      if (version === pageVersion) document.querySelector('#main').innerHTML = `<section class="loading-state" role="alert"><h1>目录暂时未能载入</h1><p>${h(error.message)}</p><button class="primary-button" data-action="topics">重新读取目录</button></section>`;
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
  app.innerHTML = `<aside class="sidebar"><button class="brand" data-action="arena" aria-label="知辨，返回当前辩论"><img src="./favicon.svg" alt=""><strong>知辨<span>ZHIBIAN</span></strong></button>
    <div class="nav-caption">把不同观点，放在一起看</div><nav aria-label="主导航">
    <button data-action="topics" aria-label="辩题大厅">${icon('grid')}<span>辩题大厅</span></button><button data-action="library" aria-label="辩题库">${icon('book')}<span>辩题库</span></button><button data-action="arena" aria-label="辩论现场">${icon('arena')}<span>辩论现场</span><i class="nav-dot"></i></button></nav>
    <div class="sidebar-note"><div class="small-mark">“ ”</div><p>先听听，<br>另一边怎么说。</p><span>你可以只做观众。</span></div><div class="sidebar-bottom"><span class="avatar viewer">观</span><div>旁观者席位<small>不必站队，自由看看</small></div></div></aside>
    <div class="workspace"><header class="topbar"><div class="breadcrumb"><span id="view-label">辩论现场</span><span>/</span><span id="category">知乎观点</span></div><button class="demo-tag live-tag" data-action="about">${icon('info')}知乎真实来源</button></header><main id="main" tabindex="-1"></main><footer class="site-footer"><span>知辨 · 让分歧被看见</span><span>真实来源 · 观点编排</span></footer></div>`;
}
async function fetchDebate(url, id) {
  const version = ++pageVersion;
  pageController?.abort(); pageController = new AbortController();
  state = transition(state, { type: 'topic', id }); current = null; closeDialog();
  setNavigation('arena');
  document.querySelector('#main').innerHTML = `<section class="loading-state" role="status"><span class="loading-orbit"></span><div class="eyebrow">正在接入知乎</div><h1>让真实观点上场。</h1><p>读取回答、核对来源与编排依据。不会用示例内容填补空缺。</p></section>`;
  window.scrollTo({ top: 0, behavior: 'instant' });
  try {
    const data = await api(url, pageController.signal);
    if (version !== pageVersion) return;
    current = data; state = createState(id, data.rounds.length);
    // A freshly arranged free question (q:) is added to the lobby, so drop the
    // cached catalogue. Opening an already-collected topic (auto-) changes nothing.
    if (typeof data.id === 'string' && data.id.startsWith('q:') && data.rounds.length) { catalog = []; catalogPromise = null; }
    render();
    announce(data.rounds.length ? `已载入 ${data.rounds.length} 组真实观点。` : '这组回答没有形成两方对照，已按观点阅读展示。');
  } catch (error) {
    if (version !== pageVersion || error.name === 'AbortError') return;
    document.querySelector('#main').innerHTML = `<section class="loading-state error-state" role="alert">${icon('info')}<h1>这次没能把观点请来。</h1><p>${h(error.message)}</p><button class="primary-button" data-action="retry">重新读取</button><button class="secondary-button" data-action="topics">换个辩题</button></section>`;
  }
}
function render() {
  if (!current) return;
  summaryController?.abort();
  setNavigation('arena');
  document.querySelector('#category').textContent = current.category;
  document.querySelector('#view-label').textContent = state.view === 'recap' ? '本场回顾' : (current.autoArranged ? '自动编排现场' : '辩论现场');
  document.querySelector('#main').innerHTML = state.view === 'recap' ? recap() : arena();
  document.title = current.title + ' · 知辨';
  if (state.view === 'arena') void loadVisibleSummaries();
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
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({sourceId: source.id, text: source.originalText || source.text})
      });
      summaryCache.set(key, result);
      if (version !== summaryVersion || !node.isConnected) return;
      node.classList.remove('pending');
      node.querySelector('[data-summary-text]').textContent = result.summary;
      node.querySelector('.ai-summary-model').textContent = `${result.model || 'AI'} 生成`;
    } catch (error) {
      if (version !== summaryVersion || error.name === 'AbortError' || !node.isConnected) return;
      node.classList.remove('pending'); node.classList.add('unavailable');
      node.querySelector('[data-summary-text]').textContent = 'AI 摘要暂时不可用，请先阅读原文。';
      node.querySelector('.ai-summary-model').textContent = '可直接阅读原文';
    }
  }));
}
function heading() {
  const n = current.rounds.length, auto = current.autoArranged;
  return `<section class="topic-heading"><div><div class="eyebrow"><span class="episode-dot"></span>${auto ? '自由辩题' : '本场辩题'}<span class="eyebrow-divider"></span>${h(current.category)}${auto ? '<span class="auto-chip">AI 自动编排 · 原句已逐字校验</span>' : ''}</div><h1>${current.titleLines.map(h).join('<br>')}</h1><p class="topic-intro">${h(current.intro)}</p></div><div class="heading-aside"><button class="text-button" data-action="topics">换个辩题 ${icon('arrow')}</button>${n ? `<div class="match-format"><b>${n}<span>对</span>${n}</b><small>${n * 2} 条真实观点 · ${n} 轮对照</small></div>` : ''}</div></section>`;
}
function provenance() {
  const auto = current.autoArranged;
  const tail = auto || current.rounds.length >= 3 ? '' : ' 未核对通过的回合不会用内容补位。';
  return `<div class="provenance"><span><i></i>知乎 API · ${current.cached ? '缓存于' : '获取于'} ${stamp(current.fetchedAt)}${auto && current.model ? ' · 编排模型 ' + h(current.model) : ''}</span><button data-action="sources">${current.items.length} 条来源 ${icon('arrow')}</button></div><p class="arrangement-note">${h(current.arrangement)}${tail}</p>`;
}
function arena() {
  if (!current.rounds.length) return heading() + provenance() + `<section class="reading-room"><h2>先看观点，不急着分两边。</h2><p>${h(current.notice || '当前返回的内容未形成已核对的对立组合，先保留真实来源。')}</p>${current.items.length ? current.items.map(sourceArticle).join('') : ''}</section>`;
  return heading() + `<section class="lineup" aria-label="双方阵容">${camp(0)}<div class="versus"><span>VS</span></div>${camp(1)}</section><section class="round-section" aria-label="辩论回合"><div class="round-navigation"><div class="round-tabs" role="tablist" aria-label="选择辩论回合">${current.lenses.map((name, i) => `<button id="round-${i}" role="tab" aria-controls="round-panel" aria-selected="${i === state.round}" tabindex="${i === state.round ? 0 : -1}" data-action="round" data-index="${i}" class="round-tab ${i === state.round ? 'selected' : ''}"><span class="round-number">0${i + 1}</span>${h(name)}</button>`).join('')}</div><span class="round-position">第 ${state.round + 1} / ${current.rounds.length} 回合</span></div>
    <div id="round-panel" role="tabpanel" aria-labelledby="round-${state.round}"><div class="host-line">${icon('sound')}<span class="host-label">${current.autoArranged ? 'AI 编排说明' : '编排说明'}</span><p>${h(current.hosts[state.round])}</p></div>${current.sharedQuestions?.[state.round] ? `<p class="shared-question">这回合两人回答的是同一个问题：<b>${h(current.sharedQuestions[state.round])}</b></p>` : ''}<div class="debate-pair">${current.rounds[state.round].map(card).join('')}</div></div>
    <div class="round-footer"><div class="watch-note">${icon('arena')}<span>不必急着站队，先把两边听完。</span></div><div class="round-actions"><button class="previous-button" data-action="previous" ${state.round === 0 ? 'disabled' : ''}>${icon('back')}上一轮</button><button class="primary-button" data-action="next">${state.round === current.rounds.length - 1 ? '看本场回顾' : '下一轮 · ' + h(current.lenses[state.round + 1])}${icon('arrow')}</button></div></div></section>` + provenance();
}
function camp(side) {
  const color = side ? 'blue' : 'coral';
  return `<div class="camp ${color}"><div class="camp-heading"><span class="camp-tag">${side ? '右方' : '左方'}</span><h2>${h(side ? current.right : current.left)}</h2></div><div class="seat-row">${current.rounds.map((pair, i) => `<button data-action="round" data-index="${i}" class="seat ${i === state.round ? 'on-stage' : ''}" aria-label="查看${h(pair[side].name)}的${h(current.lenses[i])}观点" aria-pressed="${i === state.round}" title="${h(pair[side].name)}">${avatar(pair[side], color)}<span class="seat-person"><b>${h(pair[side].name)}</b><small>${h(current.lenses[i])}</small></span></button>`).join('')}</div></div>`;
}
function card(s, side) {
  return `<article class="opinion-card ${side ? 'blue' : 'coral'}"><div class="card-author">${avatar(s, side ? 'blue' : 'coral', 'large')}<div class="author-info"><div class="author-name-line"><h3 title="${h(s.name)}">${h(s.name)}</h3>${s.badge ? `<span class="author-badge">${h(s.badge)}</span>` : ''}</div><span class="author-caption">知乎答主 · ${side ? '右方' : '左方'}观点</span></div><span class="quote-symbol" aria-hidden="true">“</span></div><span class="quote-label">${current.autoArranged ? '原回答原句 · 已逐字校验' : '原回答中的核对原句'}</span>${current.autoArranged && s.stance ? `<span class="stance-tag">AI 判定这一方：${h(s.stance)}</span>` : ''}<h2 class="opinion-title">${h(s.evidence)}</h2>
    <section class="ai-summary pending" data-summary-id="${h(s.id)}" aria-live="polite"><div class="ai-summary-heading"><span>${icon('spark')}AI 观点摘要</span><small class="ai-summary-model">正在整理</small></div><p data-summary-text>正在整理这条回答的核心观点…</p></section>
    ${s.contextNote ? `<p class="context-note">${h(s.contextNote)}</p>` : ''}
    <div class="answer-meta">${s.votes === null ? '' : `<span>${s.votes} 赞同</span>`}${s.editedAt ? `<span>更新于 ${stamp(s.editedAt).split(' ')[0]}</span>` : ''}</div><div class="card-actions"><button class="source-button source-prominent" data-action="source" data-side="${side}">${icon('book')}原文与来源</button><button class="critic-button" data-action="critic" data-side="${side}">${icon('spark')}AI 质询<span class="soon-label">可提问</span></button></div></article>`;
}
function recap() {
  return `<section class="recap-heading"><div class="eyebrow">本场回顾<span class="eyebrow-divider"></span>原观点对照</div><h1>分歧有来由，<br>选择有条件。</h1><p class="topic-intro">${h(current.title)}</p></section><div class="recap-pair">${[0, 1].map(side => `<section class="recap-camp ${side ? 'blue' : 'coral'}"><span class="camp-tag">${side ? '右方' : '左方'}</span><h2>${h(side ? current.right : current.left)}</h2>${current.rounds.map(pair => `<blockquote>${h(pair[side].evidence)}<cite>${h(pair[side].name)} · ${sourceLink(pair[side], '原文')}</cite></blockquote>`).join('')}</section>`).join('')}</div><section class="questions-card"><h2>看完之后，还可以核对什么？</h2>${current.questions.map((q, i) => `<p><span>0${i + 1}</span>${h(q)}</p>`).join('')}</section><p class="recap-disclaimer">引述来自知乎 API 返回正文；AI 摘要只是阅读辅助。核对问题为编辑提示，不是 AI 裁决，也不判定哪位答主获胜。</p><div class="recap-actions"><button class="secondary-button" data-action="arena">${icon('back')}回到辩论</button><button class="secondary-button" data-action="sources">查看本场来源</button><button class="primary-button" data-action="topics">再看一个辩题${icon('arrow')}</button></div>`;
}
const dialogHeader = (eyebrow, title) => `<div class="dialog-header"><div><div class="eyebrow">${h(eyebrow)}</div><h2 id="dialog-title">${h(title)}</h2></div><button class="icon-button" data-action="close" aria-label="关闭">${icon('close')}</button></div>`;
function openDialog(content, type = '') {
  if (!overlay.open) returnFocus = document.activeElement;
  overlay.className = type; overlay.innerHTML = content;
  if (!overlay.open) overlay.showModal();
  document.body.classList.add('modal-open');
}
function closeDialog() { if (overlay.open) overlay.close(); }
function openTopics() {
  navigate('/topics');
}
function sourceArticle(s) {
  const original = s.originalText || s.text;
  return `<article class="source-article"><div class="source-author">${avatar(s)}<b>${h(s.name)}</b><span>知乎来源</span></div><h3>${h(s.sourceTitle)}</h3><p>${h(original)}</p>${sourceLink(s, '在知乎查看完整原文')}<small>知乎接口返回正文；完整上下文以知乎原文为准。</small></article>`;
}
function openSources(side) {
  if (!current) return;
  const items = Number.isInteger(side) && current.rounds.length ? [current.rounds[state.round][side]] : current.items;
  openDialog(dialogHeader('每条观点，都有来处', '原文与来源') + `<div class="notice">${icon('info')}<p>来自知乎开放平台，获取于 ${stamp(current.fetchedAt)}。这里展示接口返回的正文；点击链接可在知乎查看完整上下文。阵营和回合是本应用的编排，不是真人同场辩论。</p></div><div class="source-list">${items.map(sourceArticle).join('')}</div>`, 'sources-dialog');
}
function openCritic(side) {
  const s = current?.rounds[state.round]?.[side]; if (!s) return;
  criticController?.abort();
  openDialog(dialogHeader('围绕观点，继续追问', 'AI 质询席') + `<div class="critic-target ${side ? 'blue' : 'coral'}">${avatar(s)}<div><small>当前选中 · ${h(s.name)}</small><p>${h(s.evidence)}</p></div></div><div class="notice">${icon('info')}<p>AI 只分析这条回答的论证，不评价答主身份，也不替你决定哪一方正确。你可以随时提问。</p></div><form class="critic-form" data-side="${side}" novalidate><label for="critic-question">你想问这条回答什么？</label><textarea id="critic-question" name="question" rows="3" maxlength="2000" placeholder="例如：这条观点最依赖什么前提？如果收入差距很大，结论还成立吗？"></textarea><button class="primary-button" type="submit">${icon('spark')}问 DeepSeek</button></form><section class="critique-result" data-critique-result aria-live="polite"><div class="critic-idle">${icon('spark')}<p>输入问题后，这里会基于回答全文给出质询。</p></div></section>${sourceLink(s)}<p class="dialog-footnote">AI 只分析论证，不替你判断谁赢，也不推测作者的私人身份。</p>`, 'critic-dialog');
}
async function runCritique(form) {
  const s = current?.rounds[state.round]?.[Number(form.dataset.side)], question = form.elements.question.value.trim(), result = document.querySelector('[data-critique-result]'), button = form.querySelector('button[type="submit"]');
  if (!s || !question || !result || !button) return;
  const requestVersion = ++criticVersion;
  criticController?.abort(); criticController = new AbortController();
  button.disabled = true; button.textContent = 'DeepSeek 思考中…'; result.className = 'critique-result pending'; result.textContent = '正在结合回答全文分析…';
  try {
    const data = await api('/api/critique', criticController.signal, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
      sourceId: s.id, topic: current.title, side: Number(form.dataset.side) ? current.right : current.left, evidence: s.evidence, text: s.originalText || s.text, question
    }) });
    if (requestVersion !== criticVersion || !result.isConnected) return;
    result.className = 'critique-result'; result.innerHTML = `<div class="analysis-label">${icon('spark')}DeepSeek 质询</div><p>${h(data.answer)}</p><small class="analysis-reference">基于 ${h(s.name)} 的知乎回答全文；AI 不替代原文核对。</small>`;
  } catch (error) {
    if (requestVersion !== criticVersion || error.name === 'AbortError' || !result.isConnected) return;
    result.className = 'critique-result unavailable'; result.textContent = error.message || 'AI 质询暂时不可用，请稍后再试。';
  } finally { if (requestVersion === criticVersion && button.isConnected) { button.disabled = false; button.innerHTML = `${icon('spark')}问 DeepSeek`; } }
}
async function searchTopics(query) {
  const version = ++searchVersion;
  searchController?.abort(); searchController = new AbortController();
  const results = document.querySelector('#topic-results'), submit = document.querySelector('#topic-search button');
  submit.disabled = true; submit.textContent = '搜索中…';
  results.innerHTML = '<div class="empty-state" role="status">正在搜索知乎真实观点…</div>';
  try {
    const data = await api('/api/search?q=' + encodeURIComponent(query), searchController.signal);
    if (version !== searchVersion || !results.isConnected) return;
    if (!data.items.length) {
      searchItems = [];
      results.innerHTML = '<div class="search-summary">找到 0 条</div><div class="empty-state"><h3>这次没有找到有效观点</h3><p>试试更具体的问题，或换一个关键词。</p></div><button class="secondary-button restore-topics" data-action="restore-topics">回到已编排辩题</button>';
      return;
    }
    results.innerHTML = `<div class="search-summary">找到 ${data.items.length} 条 · ${data.cached ? '缓存于' : '获取于'} ${stamp(data.fetchedAt)}</div><div class="empty-state" role="status">${icon('spark')}正在用 DeepSeek 筛选与“${h(query)}”直接相关的观点…</div>`;
    const filtered = await api('/api/filter', searchController.signal, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
      topic: query, items: data.items.map(item => ({ id: item.id, sourceTitle: item.sourceTitle, text: item.text.slice(0, 12000) }))
    }) });
    if (version !== searchVersion || !results.isConnected) return;
    const decisions = new Map((filtered.items || []).map(item => [item.id, item]));
    searchItems = data.items.filter(item => decisions.get(item.id)?.relevant === true);
    const arrangeCta = searchItems.length >= 4
      ? `<div class="auto-arrange-cta"><div><h3>想让 AI 把它们排成一场？</h3><p>AI 只把真实存在分歧的回答配成对照，每条原句都会与知乎返回的正文逐字校验；配不出的回合直接留空，不会补写内容。</p></div><button class="primary-button" data-action="auto-arrange" data-query="${h(query)}">自动编排这 ${searchItems.length} 条${icon('arrow')}</button></div>`
      : '';
    results.innerHTML = `<div class="search-summary">DeepSeek 已筛选 ${searchItems.length} 条直接相关观点（原始结果 ${data.items.length} 条） · ${h(filtered.model || 'deepseek-flash')}</div><p class="dialog-footnote">这里只判断是否直接讨论这个辩题，不自动分左右阵营；点击观点可阅读完整原文。</p>${arrangeCta}${searchItems.length ? searchItems.map((s, i) => `<button class="topic-option search-option" data-action="search-source" data-index="${i}"><div class="source-author">${avatar(s)}<b>${h(s.name)}</b></div><h3>${h(s.sourceTitle)}</h3><p>${h(s.text.slice(0, 150))}${s.text.length > 150 ? '…' : ''}</p><span class="search-open">阅读原文与来源 ${icon('arrow')}</span></button>`).join('') : '<div class="empty-state"><h3>没有通过相关性筛选的观点</h3><p>可以换一个更具体的辩题表述。</p></div>'}<button class="secondary-button restore-topics" data-action="restore-topics">回到已编排辩题</button>`;
  } catch (error) {
    if (version !== searchVersion || error.name === 'AbortError' || !results.isConnected) return;
    results.innerHTML = `<div class="empty-state" role="alert"><h3>相关性筛选暂时不可用</h3><p>${h(error.message)} 未展示未经筛选的结果。</p><button class="secondary-button" data-action="restore-topics">回到已编排辩题</button></div>`;
  } finally { if (version === searchVersion && submit.isConnected) { submit.disabled = false; submit.textContent = '搜索知乎'; } }
}
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
  if (action === 'topics') return openTopics();
  if (action === 'library') return navigate('/library');
  if (action === 'library-filter') {
    libraryState = { ...libraryState, [button.dataset.group]: button.dataset.value };
    document.querySelectorAll(`[data-action="library-filter"][data-group="${button.dataset.group}"]`).forEach(chip => {
      chip.classList.toggle('on', chip.dataset.value === button.dataset.value);
    });
    repaintLibrary();
    return;
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
  if (action === 'restore-topics') { renderLobby(); return; }
  if (action === 'search-source') {
    const s = searchItems[Number(button.dataset.index)];
    if (s) openDialog(dialogHeader('知乎真实来源', '原文与来源') + sourceArticle(s) + '<button class="secondary-button" data-action="close">回到搜索结果</button>', 'sources-dialog');
    return;
  }
  if (action === 'about') return openDialog(dialogHeader('关于这个版本', '真实观点，重新相遇。') + '<div class="about-content"><p>观点、作者与认证来自知乎官方接口；卡片上的 AI 观点摘要只针对接口返回的回答正文，不评价作者，也不补充原文之外的事实。</p><p>点击“原文与来源”可以阅读接口返回的正文并打开知乎完整上下文；新辩题搜索结果会先自动筛掉与题目无关的回答。</p><p>自由提问可以先按观点阅读，也可以点“自动编排”：AI 会把真实存在分歧的回答配成对照回合，并抄回逐字原句，服务端再与知乎返回的正文核对一次，对不上的席位直接丢弃。它只是阅读顺序，不代表谁赢。</p><p>已编排场次采用人工核对的来源与原句匹配。接口不再返回某条内容、或其依据发生变化时，该席位不会用虚构内容补齐。AI 质询与摘要统一使用 deepseek-flash，相关性筛选不负责分阵营。</p></div>', 'about-dialog');
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
  render(); announce(state.view === 'recap' ? '已进入本场回顾' : `第 ${state.round + 1} 回合：${current.lenses[state.round] || '观点阅读'}`);
  if (action === 'round') document.querySelector('#round-' + state.round)?.focus({ preventScroll: true });
  else if (action === 'next' || action === 'previous') {
    (document.querySelector('.round-tabs [aria-selected="true"]') || document.querySelector('#main')).focus({ preventScroll: true });
    (document.querySelector('.round-navigation') || document.querySelector('#main')).scrollIntoView({ block: 'start', behavior: 'instant' });
  } else { document.querySelector('#main').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
});
document.addEventListener('submit', e => {
  if (e.target.matches('.critic-form')) { e.preventDefault(); void runCritique(e.target); }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'topic-search') return;
  e.preventDefault(); const query = document.querySelector('#topic-query').value.trim(); if (query.length >= 2) searchTopics(query);
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'library-search') return;
  e.preventDefault();
  libraryState = { ...libraryState, term: document.querySelector('#library-query').value.trim() };
  repaintLibrary();
});
document.addEventListener('input', e => {
  if (e.target.id !== 'library-query') return;
  libraryState = { ...libraryState, term: e.target.value };
  repaintLibrary();
});
document.addEventListener('keydown', e => {
  if (!e.target.matches('[role="tab"]') || !current?.rounds.length) return;
  let index = state.round, count = current.rounds.length;
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
