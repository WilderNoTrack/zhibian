// 新手引导：高亮框 + 箭头气泡，逐步讲解每个页面。
//
// Each page has its own tour and plays once on first visit; the 「新手引导」
// button in the header replays the tour for whatever page is showing. The app
// announces the page with a `zhibian:view` event and pauses the 今日热辩
// carousel while it hears `zhibian:tour` {active: true}.
//
// Steps whose element is not on the page (no shared question, no vote count,
// a reading-mode topic…) are skipped, so a tour never points at empty space.

const STORE = 'zhibian.tour.';
const MARGIN = 12;  // keep the bubble this far from the viewport edge
const GAP = 16;     // space between the highlight and the bubble (room for the arrow)
const PAD = 8;      // highlight frame padding around the element

// The debate the home tour hands off to: 「该不该要彩礼」 (AI-arranged, three rounds).
export const DEMO_TOPIC_ID = 'auto-4cf3c5cdfc8d';
function goToDemoDebate() {
  // Go through the app's own topic link so routing stays in one place. If the
  // demo ever leaves the library, fall back to the first topic on the page.
  const link = document.querySelector(`[data-action="choose-topic"][data-id="${DEMO_TOPIC_ID}"]`)
    || document.querySelector('.feed-list .feed-title a');
  link?.click();
}

const left = '<span class="side-label side-left">左方</span>';
const right = '<span class="side-label side-right">右方</span>';
const curated = '<span class="badge badge-curated">人工核对</span>';
const auto = '<span class="badge badge-auto">AI 编排</span>';

export const tours = {
  lobby: [
    {
      title: '欢迎来到知辨',
      body: '<p>知乎上吵了八百楼的问题，在这里十分钟就能把两边的道理听完。</p><p>知辨把知乎上<b>真实存在分歧</b>的回答摆到同一张桌子上：左边一句、右边一句，每一句都是答主原话，都能点回知乎核对。</p>',
      list: ['不必表态，也不必争赢，你可以只做观众', '接下来用 1 分钟带你认识首页', '随时按 Esc 退出；右上角「新手引导」可以重看']
    },
    {
      target: '.app-nav', placement: 'bottom',
      title: '三个主入口',
      body: '<p>顶部导航在每个页面都在，迷路了就从这里回去。</p>',
      list: ['<b>首页</b>：今日热辩、提问入口和全部辩题', '<b>辩题库</b>：检索全部辩题，只在本机查找，不调用知乎', '<b>辩论现场</b>：回到你最近打开的那一场辩论']
    },
    {
      target: '#header-search', placement: 'bottom',
      title: '随时搜索知乎',
      body: '<p>在任何页面输入<b>至少 2 个字</b>的问题，按回车就进入搜索页。</p><p>知辨会用几组不同说法去搜知乎的真实回答，再请 AI 筛掉跑题的内容。同一个问题 15 分钟内再搜会直接复用结果。</p>'
    },
    {
      target: '.ask-button', placement: 'bottom',
      title: '「提问」也是同一个入口',
      body: '<p>点它会弹出一个更大的输入框，适合写完整的问题。</p><p>如果搜到的相关回答够多，结果页会出现「自动编排」，让 AI 把这些回答排成一场辩论。</p>'
    },
    {
      target: '#featured-carousel', placement: 'bottom',
      title: '今日热辩',
      body: '<p>这里轮流展示值得一看的辩题，引导期间已帮你暂停轮播。</p>',
      list: ['平时<b>每 5 秒</b>自动换一道，<b>鼠标悬停</b>就暂停', '左上角标签写明来源：今日热榜 · 已人工核对／今日热榜 · AI 编排／常驻辩题', 'AI 改写过标题的题，下方会保留<b>「知乎原题」</b>，出处不藏']
    },
    {
      target: '.carousel-slide[aria-hidden="false"] .slide-sides', placement: 'bottom',
      title: '先预览两边在吵什么',
      body: `<p>${left} 用橙红色，${right} 用靛蓝色，各自展示一句<b>核对过的原句</b>和答主昵称。</p><p>点整张卡片的任意位置，就能进入这场辩论。</p>`
    },
    {
      target: '#featured-carousel .carousel-dots', placement: 'top',
      title: '切换辩题',
      body: '<p>点圆点可以跳到任意一道；卡片右上角的左右箭头也能前后翻。长条形的那个圆点就是当前这道。</p>'
    },
    {
      target: '#topic-search', placement: 'top',
      title: '心里已经有一个问题？',
      body: '<p>在这里写下你想围观的问题，点「搜索知乎」。</p><p>先看真实观点，觉得值得排成一场，再交给 AI 自动编排。编排成功的问题会自动收进辩题库。</p>'
    },
    {
      target: '.feed-card .category-tabs', placement: 'bottom',
      title: '按分类浏览',
      body: '<p>情感与婚恋、职场与生存、钱与消费……点一个分类就只看这一类辩题，旁边的数字是这个分类里的辩题数量。</p>'
    },
    {
      target: '.feed-list .feed-item', placement: 'top',
      title: '一张辩题卡怎么读',
      list: [
        '<span class="tag">蓝色标签</span> 这道题所属的分类',
        `${curated} 来源和原句都经过人工核对`,
        `${auto} AI 配对、服务端逐字校验原句，<b>不冒充</b>人工核对`,
        '<b>左 VS 右</b>：两边各自的立场，一眼看出在争什么',
        '<b>进入辩论现场</b>：点标题或按钮开始看'
      ]
    },
    {
      target: '.zh-side-col .category-list', placement: 'left',
      title: '分类侧栏',
      body: '<p>和上面的分类标签是同一组入口，多了一句说明，方便你挑感兴趣的话题。</p>'
    },
    {
      target: '.header-right [data-action="about"]', placement: 'bottom',
      title: '数据从哪里来',
      body: '<p>点这里查看知辨怎样使用知乎官方接口、AI 在哪些环节参与，以及哪些事 AI <b>绝对不做</b>：不补写内容、不评价作者、不裁决谁赢。</p>'
    },
    {
      target: '#tour-button', placement: 'bottom',
      title: '忘了怎么用？点这里',
      body: '<p>每个页面都有自己的引导：辩论现场、搜索结果、辩题库、本场回顾。在哪个页面点，就讲哪个页面。</p>'
    },
    {
      title: '首页就逛到这里',
      body: '<p>接下来去看一场真实的辩论吧：<b>「该不该要彩礼」</b>，彩礼到底是诚意还是旧俗，看知乎真实答主怎么吵。辩论现场第一次打开时，还有一段专门的引导带你看懂每个按钮。</p>',
      action: { label: '带我去看「该不该要彩礼」', run: goToDemoDebate }
    }
  ],

  category: [
    {
      target: '.topic-header', placement: 'bottom',
      title: '分类主页',
      body: '<p>这里是一个分类的全部辩题。顶部是分类说明，下面那行小字是这类话题里最常见的两种取向。</p>'
    },
    {
      target: '.feed-card .category-tabs', placement: 'bottom',
      title: '换个分类',
      body: '<p>点「全部」回到所有辩题，点其他标签直接切换分类。</p>'
    },
    {
      target: '.feed-list .feed-item', placement: 'top',
      title: '点进任意一题',
      list: [`${curated} 人工核对来源与原句`, `${auto} AI 配对、原句逐字校验`, '<b>左 VS 右</b>：两边各自的立场']
    },
    {
      target: '.topic-header .back-link', placement: 'bottom',
      title: '返回全部分类',
      body: '<p>回到首页，重新看今日热辩和全部辩题。</p>'
    }
  ],

  library: [
    {
      target: '.library-head', placement: 'bottom',
      title: '辩题库',
      body: '<p>这里收着全部辩题：人工核对的常驻辩题，加上通过「自动编排」生成、并且通过了逐字校验的自由提问。</p>'
    },
    {
      target: '#library-search', placement: 'bottom',
      title: '边输入边检索',
      body: '<p>按标题、立场、分类实时过滤，例如「辞职」「大城市」「AI」。</p><p>检索<b>只在本机辩题库里查</b>，不会消耗知乎的搜索次数。</p>'
    },
    {
      target: '.filter-tabs', placement: 'bottom',
      title: '按来源筛选',
      list: ['<b>全部</b>：所有辩题', `<b>人工核对</b>：${curated} 来源和原句由人工核对过`, `<b>AI 编排</b>：${auto} AI 配对，服务端逐字校验原句`]
    },
    {
      target: '.chip-row', placement: 'bottom',
      title: '按分类筛选',
      body: '<p>和来源筛选可以叠加使用，例如只看「职场与生存」里 AI 编排的题。</p>'
    },
    {
      target: '.result-count', placement: 'bottom',
      title: '符合条件的数量',
      body: '<p>每次改检索词或筛选条件，这个数字都会立刻更新。</p>'
    },
    {
      target: '.stat-board', placement: 'left',
      title: '收录概况',
      body: '<p>辩题库的总量，以及人工核对和 AI 编排各有多少，分得明明白白。</p>'
    },
    {
      target: '#library-results .feed-item', placement: 'top',
      title: '打开任意一题',
      body: '<p>每次打开都会<b>重新拉取知乎来源、逐字核对原句</b>。如果某条来源变了，这场就少一个回合，绝不拿虚构内容补位。</p>'
    }
  ],

  search: [
    {
      target: '.search-head', placement: 'bottom',
      title: '你正在搜索知乎',
      body: '<p>这一页展示的全部是知乎上的真实回答。AI 只负责筛掉跑题的内容，<b>不替你分左右阵营</b>。</p>'
    },
    {
      target: '.search-results .keyword-note', placement: 'bottom',
      title: '实际用了哪几组关键词',
      body: '<p>知乎每次搜索最多返回 10 条。为了听到不同立场，AI 会把你的问题换几种说法分别搜索，再合并去重。</p><p>这里如实列出用到的每一组关键词。</p>'
    },
    {
      target: '.search-results .search-summary', placement: 'bottom',
      title: '筛选结果',
      body: '<p>DeepSeek 判断每条回答能不能站到辩题的某一边，括号里是筛选前的原始数量。</p><p>没通过筛选的回答不会展示。</p>'
    },
    {
      target: '.arrange-cta', placement: 'bottom',
      title: '一键编排成一场辩论',
      body: '<p>相关回答达到 4 条时会出现这个按钮。点它之后：</p>',
      list: ['AI 只把<b>真实存在分歧</b>的回答配成回合', '另一位 AI 裁判复核两位作者是否真的站在两边，同向的直接删掉', '每句原话都和知乎正文逐字比对，对不上的席位直接丢弃', '配不出真实分歧就退回观点阅读，不补写内容']
    },
    {
      target: '.search-results .search-item', placement: 'top',
      title: '一条搜索结果',
      list: ['顶部是答主昵称和认证信息', '点标题或「阅读原文与来源」，在弹窗里读接口返回的正文', '「知乎原文」直接打开知乎原页面自己核对']
    },
    {
      target: '.restore-row', placement: 'top',
      title: '看够了？',
      body: '<p>点这里回到首页，看看已经编排好的辩题。</p>'
    }
  ],

  debate: [
    {
      title: '欢迎来到辩论现场',
      body: '<p>一个回合，两位真实答主，一人一句核对过的原句。</p><p>他们并没有真的同场辩论——是知辨把<b>立场相反</b>的知乎回答放到了一起。下面带你看懂这一页的每个部分。</p>'
    },
    {
      target: '.question-header .tag-row', placement: 'bottom',
      title: '先看这道题的「身份」',
      list: ['<span class="tag">蓝色标签</span> 所属分类', '<span class="badge badge-curated">已核对原句</span> 常驻辩题，来源与原句经过人工核对', '<span class="badge badge-auto">AI 自动编排 · 原句已逐字校验</span> AI 配对的题，原句由服务端逐字比对']
    },
    {
      target: '.question-header .question-title', placement: 'bottom',
      title: '辩题',
      body: '<p>标题下方的小字说明这场辩论要比较的是什么。</p>'
    },
    {
      target: '.question-header .number-board', placement: 'bottom',
      title: '规模一览',
      body: '<p><b>回合数 × 2 = 真实观点数</b>。</p><p>常驻辩题通常是三回合；AI 编排的题有几组真实分歧就排几个回合，不硬凑。</p>'
    },
    {
      target: '.question-actions [data-action="sources"]', placement: 'bottom',
      title: '本场全部来源',
      body: '<p>一次看完这场用到的所有知乎回答正文，每条都附知乎原文链接。</p>'
    },
    {
      target: '.lineup', placement: 'bottom',
      title: '双方阵容',
      list: [`${left} 在左、${right} 在右，卡片标题就是这一方的立场`, '每个头像对应<b>一个回合</b>的答主，点头像直接跳到那一回合', '底色高亮的，是正在台上的两位']
    },
    {
      target: '.round-tabs', placement: 'bottom',
      title: '回合切换',
      body: '<p>每个回合换一组答主、换一个比较角度。</p><p>点标签切换；也可以先点中一个标签，再用键盘 <b>← →</b> 切换。</p>'
    },
    {
      target: '.shared-card', placement: 'bottom',
      title: '两人回答的是同一个问题',
      body: '<p>这句话确认双方真的在回答同一件事，只是给出了相反的答案，而不是各说各话。</p>'
    },
    {
      target: '.opinion-card.side-left .card-author', placement: 'bottom',
      title: '真实答主',
      body: '<p>头像、昵称和认证都来自知乎官方接口。旁边写着这位答主代表哪一方。</p>'
    },
    {
      target: '.opinion-card.side-left .opinion-title', placement: 'right',
      title: '核对原句',
      body: '<p>加粗的这句话<b>一个字没改、标点都没动</b>，直接取自这位答主的知乎回答。</p><p>上方的小字会说明它是人工核对过的，还是服务端逐字校验过的。</p>'
    },
    {
      target: '.opinion-card.side-left .ai-summary', placement: 'right',
      title: 'AI 观点摘要',
      body: '<p>回答太长时先读这里：AI 只提炼这条回答的判断、前提和条件，<b>一句一行</b>。</p><p>它是阅读辅助，不是答主原话，也不评价作者。</p>'
    },
    {
      target: '.opinion-card.side-left .answer-actions', placement: 'top',
      title: '底部操作栏',
      list: ['<b>赞同 N</b>：这条回答在知乎上的赞同数，只读', '<b>原文与来源</b>：在弹窗里读接口返回的回答全文', '<b>知乎原文</b>：跳到知乎原页面自己核对，查得到才算数']
    },
    {
      target: '.opinion-card.side-left .critic-button', placement: 'top',
      title: 'AI 质询：挑个刺试试',
      list: ['写下你的质疑，AI 会<b>站在这条回答的立场</b>反驳你', '它的论据只取自这条回答的原文，不编新理由', '这是 <b>AI 模拟</b>，不是答主本人说的话，答主也不知情']
    },
    {
      target: '.opinion-card.side-right', placement: 'left',
      title: '右方同理',
      body: `<p>${right} 是另一位答主给出的相反观点，卡片上的操作完全一样。</p><p>建议两边都读完，再下自己的判断。</p>`
    },
    {
      target: '.round-footer .next-button', placement: 'top',
      title: '下一轮',
      body: '<p>读完这一回合就点这里。到最后一回合，按钮会变成<b>「看本场回顾」</b>，把双方所有原句并排对照。</p>'
    },
    {
      target: '.provenance-card', placement: 'top',
      title: '数据新鲜度',
      body: '<p>显示这些回答是什么时候从知乎接口取回的。「缓存于」表示 15 分钟内复用了同一次查询。</p><p>点右侧可以再次打开全部来源。</p>'
    },
    {
      title: '不必站队，先把两边听完',
      body: '<p>知辨不告诉你谁对谁错，它只保证一件事：你读到的每一句，都是知乎的原话，都能点回去看。</p><p>现在就试试点「AI 质询」，或者直接进入下一轮。</p>'
    }
  ],

  reading: [
    {
      target: '.notice-card', placement: 'bottom',
      title: '这道题暂时是「观点阅读」',
      body: '<p>这次返回的回答没有形成经过核对的正反两方，所以先不分两边，把真实来源原样摆出来。</p><p>知辨不会为了凑成一场辩论而补写内容。</p>'
    },
    {
      target: '.answer-list .source-article', placement: 'top',
      title: '逐条阅读来源',
      body: '<p>每条都是知乎接口返回的正文，底部可以打开知乎原文查看完整上下文。</p>'
    },
    {
      target: '.provenance-card', placement: 'top',
      title: '数据新鲜度',
      body: '<p>显示这些回答是什么时候从知乎接口取回的。</p>'
    }
  ],

  recap: [
    {
      target: '.recap-heading', placement: 'bottom',
      title: '本场回顾',
      body: '<p>看完所有回合后来到这里，把整场辩论收拢到一页。</p>'
    },
    {
      target: '.recap-pair', placement: 'top',
      title: '双方原句并排',
      body: `<p>${left} 和 ${right} 的每一句原句按回合排好，每句下面都有答主和知乎原文链接。</p>`
    },
    {
      target: '.questions-card', placement: 'top',
      title: '看完之后，还可以核对什么',
      body: '<p>这是编辑写的核对提示，帮你想想各自结论依赖哪些条件。它<b>不是 AI 裁决</b>，也不判定哪位答主获胜。</p>'
    },
    {
      target: '.recap-actions', placement: 'top',
      title: '接下来',
      body: '<p>回到辩论重读某一回合、查看本场全部来源，或者再挑一个辩题。</p>'
    }
  ]
};

// Where the bubble goes, given the highlighted box. Pure, so it is unit-tested.
// `side` names where the bubble sits relative to the box; `arrow` is the arrow's
// offset along the bubble edge that faces the box. When nothing fits (a box
// taller than the screen on a phone) the bubble floats at the bottom, no arrow.
export function placeTip(box, tip, viewport, preferred = 'bottom') {
  const clamp = (value, min, max) => Math.max(min, Math.min(Math.max(min, max), value));
  const space = {
    bottom: viewport.height - (box.top + box.height) - GAP - MARGIN,
    top: box.top - GAP - MARGIN,
    right: viewport.width - (box.left + box.width) - GAP - MARGIN,
    left: box.left - GAP - MARGIN
  };
  const fits = side => (side === 'top' || side === 'bottom')
    ? space[side] >= tip.height
    : space[side] >= tip.width && viewport.height - MARGIN * 2 >= tip.height;
  const side = [preferred, 'bottom', 'top', 'right', 'left'].find(fits);
  if (!side) {
    return { side: 'float', left: clamp((viewport.width - tip.width) / 2, MARGIN, viewport.width - tip.width - MARGIN), top: Math.max(MARGIN, viewport.height - tip.height - MARGIN), arrow: null };
  }
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  if (side === 'top' || side === 'bottom') {
    const x = clamp(cx - tip.width / 2, MARGIN, viewport.width - tip.width - MARGIN);
    return { side, left: x, top: side === 'bottom' ? box.top + box.height + GAP : box.top - GAP - tip.height, arrow: clamp(cx - x, 22, tip.width - 22) };
  }
  const y = clamp(cy - tip.height / 2, MARGIN, viewport.height - tip.height - MARGIN);
  return { side, left: side === 'right' ? box.left + box.width + GAP : box.left - GAP - tip.width, top: y, arrow: clamp(cy - y, 22, tip.height - 22) };
}

// ---- Runtime (browser only) ----
let active = null, root = null, pending = null, ticker = null, frame = 0;
const memorySeen = new Set();
const q = selector => root?.querySelector(selector);

function seen(name) {
  try { return localStorage.getItem(STORE + name) === 'done'; } catch { return memorySeen.has(name); }
}
function markSeen(name) {
  memorySeen.add(name);
  try { localStorage.setItem(STORE + name, 'done'); } catch { /* storage unavailable: remember for this page load */ }
}
function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
function resolve(step) {
  if (!step.target) return null;
  return typeof step.target === 'function' ? step.target() : document.querySelector(step.target);
}
function visible(el) {
  if (!el?.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
function emit(isActive) {
  document.dispatchEvent(new window.CustomEvent('zhibian:tour', { detail: { active: isActive } }));
}
function waitFor(test, timeout) {
  return new Promise(done => {
    const started = Date.now();
    const poll = () => (test() || Date.now() - started > timeout ? done() : window.setTimeout(poll, 250));
    poll();
  });
}

function build() {
  root = document.createElement('div');
  root.className = 'tour-root';
  root.dataset.side = 'center';
  root.innerHTML = `<div class="tour-blocker"></div>
    <div class="tour-spotlight" hidden><span class="tour-badge" aria-hidden="true"></span></div>
    <section class="tour-tip is-moving" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      <span class="tour-arrow" aria-hidden="true"></span>
      <div class="tour-tip-head"><span class="tour-step"></span><span class="tour-keys">← → 切换 · Esc 退出</span><button type="button" class="tour-close" aria-label="退出新手引导"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div>
      <div class="tour-progress" aria-hidden="true"><i></i></div>
      <h2 id="tour-title"></h2>
      <div id="tour-body" class="tour-body"></div>
      <div class="tour-foot"><button type="button" class="tour-skip">跳过引导</button><div class="tour-nav"><button type="button" class="btn-secondary tour-prev">上一步</button><button type="button" class="btn-primary tour-next">下一步</button><button type="button" class="btn-primary tour-action" hidden></button></div></div>
    </section>`;
  document.body.append(root);
  root.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  // Summaries and avatars load late and change card heights; keep the frame on its element.
  ticker = window.setInterval(position, 300);
}

function start(name) {
  if (!tours[name] || active || document.querySelector('#overlay[open]')) return false;
  // Drop steps for parts this page does not have, so the counter reads 1, 2, 3…
  const steps = tours[name].filter(step => !step.target || visible(resolve(step)));
  // A tour with nothing on screen to point at is not worth opening.
  if (!steps.some(step => step.target)) return false;
  active = { name, steps, index: -1, el: null, token: 0, returnFocus: document.activeElement };
  build();
  emit(true);
  void show(0, 1);
  return true;
}

async function show(index, direction) {
  const run = active;
  if (!run) return;
  let step = run.steps[index], el = step && resolve(step);
  while (step && step.target && !visible(el)) {
    index += direction;
    step = run.steps[index];
    el = step && resolve(step);
  }
  if (!step) {
    if (index >= run.steps.length) end(false);
    return;
  }
  const token = ++run.token;
  run.index = index; run.el = el;
  fill(step, index);
  const tip = q('.tour-tip');
  tip.classList.add('is-moving');
  root.classList.toggle('is-center', !step.target);
  if (el) {
    scrollToTarget(el, step);
    await settle();
  }
  if (active !== run || run.token !== token) return;
  root.classList.add('is-animating');
  window.setTimeout(() => root?.classList.remove('is-animating'), 360);
  position();
  tip.classList.remove('is-moving');
  (step.action && index === run.steps.length - 1 ? q('.tour-action') : q('.tour-next')).focus({ preventScroll: true });
}

function fill(step, index) {
  const total = active.steps.length, last = index === total - 1;
  q('.tour-step').textContent = `第 ${index + 1} / ${total} 步`;
  q('.tour-progress i').style.width = `${((index + 1) / total) * 100}%`;
  q('.tour-badge').textContent = String(index + 1);
  q('#tour-title').textContent = step.title;
  q('#tour-body').innerHTML = (step.body || '') + (step.list ? `<ul>${step.list.map(item => `<li>${item}</li>`).join('')}</ul>` : '');
  q('.tour-prev').hidden = index === 0;
  q('.tour-skip').hidden = last;
  const next = q('.tour-next'), action = q('.tour-action');
  next.textContent = last ? '完成' : '下一步';
  next.className = `${last && step.action ? 'btn-secondary' : 'btn-primary'} tour-next`;
  action.hidden = !(last && step.action);
  if (last && step.action) action.textContent = step.action.label;
}

function scrollToTarget(el, step) {
  const r = el.getBoundingClientRect(), vh = window.innerHeight;
  const header = document.querySelector('.app-header')?.getBoundingClientRect().height || 0;
  const tipHeight = q('.tour-tip').offsetHeight + GAP;
  const sideways = (step.placement === 'left' || step.placement === 'right') && window.innerWidth > 900;
  const needed = sideways ? r.height : r.height + tipHeight;
  const comfortable = r.top >= header + PAD && r.bottom + (sideways ? PAD : Math.min(tipHeight, 0)) <= vh - PAD
    && placeTip(frameBox(r), { width: q('.tour-tip').offsetWidth, height: q('.tour-tip').offsetHeight }, viewport(), step.placement).side !== 'float';
  if (comfortable) return;
  // Leave room for the bubble below the element when it can fit, otherwise just
  // bring the element's top under the sticky header.
  const offset = needed < vh - header - 24
    ? header + Math.max(16, (vh - header - needed) / 2)
    : header + 16;
  window.scrollTo({ top: Math.max(0, window.scrollY + r.top - offset), behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function settle() {
  return new Promise(done => {
    let last = -1, still = 0, frames = 0;
    const tick = () => {
      const y = window.scrollY;
      still = y === last ? still + 1 : 0;
      last = y;
      if (still >= 4 || ++frames > 90) done(); else window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
}

const viewport = () => ({ width: document.documentElement.clientWidth, height: window.innerHeight });
function frameBox(r) {
  const vp = viewport();
  const left = Math.max(4, r.left - PAD), top = Math.max(4, r.top - PAD);
  return { left, top, width: Math.max(0, Math.min(vp.width - 4, r.right + PAD) - left), height: Math.max(0, Math.min(vp.height - 4, r.bottom + PAD) - top) };
}

function schedule() {
  if (frame) return;
  frame = window.requestAnimationFrame(() => { frame = 0; position(); });
}

function position() {
  const run = active;
  if (!run || !root) return;
  const step = run.steps[run.index];
  if (!step) return;
  const tip = q('.tour-tip'), spot = q('.tour-spotlight'), arrow = q('.tour-arrow');
  const size = { width: tip.offsetWidth, height: tip.offsetHeight }, vp = viewport();
  if (!step.target || !run.el?.isConnected) {
    spot.hidden = true;
    root.dataset.side = 'center';
    tip.style.left = `${Math.max(MARGIN, (vp.width - size.width) / 2)}px`;
    tip.style.top = `${Math.max(MARGIN, (vp.height - size.height) / 2)}px`;
    return;
  }
  const box = frameBox(run.el.getBoundingClientRect());
  if (spot.hidden) {
    // Appear in place instead of flying in from the corner.
    spot.classList.add('no-anim');
    spot.hidden = false;
  }
  Object.assign(spot.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  // A frame hugging the screen edge would cut the step number off; tuck it inside.
  spot.classList.toggle('badge-inside', box.left < 18 || box.top < 18);
  if (spot.classList.contains('no-anim')) { void spot.offsetWidth; spot.classList.remove('no-anim'); }
  const place = placeTip(box, size, vp, step.placement || 'bottom');
  root.dataset.side = place.side;
  tip.style.left = `${place.left}px`;
  tip.style.top = `${place.top}px`;
  arrow.hidden = place.arrow === null;
  if (place.side === 'top' || place.side === 'bottom') { arrow.style.left = `${place.arrow}px`; arrow.style.top = ''; }
  else if (place.arrow !== null) { arrow.style.top = `${place.arrow}px`; arrow.style.left = ''; }
}

function goNext() {
  if (!active) return;
  if (active.index >= active.steps.length - 1) end(false);
  else void show(active.index + 1, 1);
}
function goPrev() {
  if (active && active.index > 0) void show(active.index - 1, -1);
}

function onClick(event) {
  const target = event.target;
  if (target.closest('.tour-next')) return goNext();
  if (target.closest('.tour-prev')) return goPrev();
  if (target.closest('.tour-skip, .tour-close')) return end(true);
  if (target.closest('.tour-action')) {
    const run = active.steps[active.index].action.run;
    end(false);
    return run();
  }
  if (target.closest('.tour-blocker')) {
    // Clicks outside the bubble are held back; nudge the bubble so it is noticed.
    const tip = q('.tour-tip');
    tip.classList.remove('is-nudge'); void tip.offsetWidth; tip.classList.add('is-nudge');
  }
}

function onKey(event) {
  if (!active) return;
  if (event.key === 'Escape') { event.preventDefault(); end(true); }
  else if (event.key === 'ArrowRight') { event.preventDefault(); goNext(); }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); goPrev(); }
  else if (event.key === 'Tab') {
    const focusable = [...q('.tour-tip').querySelectorAll('button:not([hidden]):not([disabled])')];
    if (!focusable.length) return;
    event.preventDefault();
    const at = focusable.indexOf(document.activeElement);
    const nextIndex = event.shiftKey ? (at <= 0 ? focusable.length - 1 : at - 1) : (at + 1) % focusable.length;
    focusable[nextIndex].focus();
  } else return;
  // Keep the page's own shortcuts (round tabs use ← →) from firing underneath.
  event.stopPropagation();
}

function end(skipped) {
  const run = active;
  if (!run) return;
  active = null;
  markSeen(run.name);
  window.clearInterval(ticker);
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('scroll', schedule);
  window.removeEventListener('resize', schedule);
  root?.remove();
  root = null;
  emit(false);
  if (run.returnFocus?.isConnected && run.returnFocus !== document.body) run.returnFocus.focus({ preventScroll: true });
  if (skipped) {
    // Show where the tour lives, so skipping is not a dead end.
    const button = document.querySelector('#tour-button');
    button?.classList.remove('is-hint'); void button?.offsetWidth; button?.classList.add('is-hint');
    window.setTimeout(() => button?.classList.remove('is-hint'), 3200);
  }
}

function onView(view) {
  window.clearTimeout(pending);
  if (active || !tours[view] || seen(view)) return;
  pending = window.setTimeout(async () => {
    if (active || document.body.dataset.view !== view) return;
    // Search results arrive after the page; wait for them rather than touring an empty page.
    if (view === 'search') {
      await waitFor(() => document.querySelector('.search-results') || document.body.dataset.view !== 'search' || document.querySelector('#topic-results [role="alert"]'), 90000);
      if (!document.querySelector('.search-results')) return;
    }
    // Let the first AI summary land so the answer card stops growing under the frame.
    if (view === 'debate') await waitFor(() => !document.querySelector('.ai-summary.pending'), 8000);
    if (document.body.dataset.view !== view) return;
    start(view);
  }, 900);
}

function replay() {
  window.clearTimeout(pending);
  if (active) return;
  const view = document.body.dataset.view || 'lobby';
  if (!start(view)) start('lobby');
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('zhibian:view', event => onView(event.detail?.view));
  document.addEventListener('click', event => {
    if (!event.target.closest?.('#tour-button')) return;
    event.preventDefault();
    replay();
  });
  if (document.body?.dataset.view) onView(document.body.dataset.view);
}
