import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { catalog, publicCatalog } from './catalog.mjs';
import { searchZhihu, hotZhihu, normalizeHotItems, normalizeItems, arrangeDebate } from './zhihu.mjs';
import { summarizeWithDeepSeek, critiqueWithDeepSeek, filterWithDeepSeek, arrangeWithDeepSeek, verifyOppositionWithDeepSeek, expandQueriesWithDeepSeek, defaultModel } from './deepseek.mjs';
import { autoDebate, keepRounds, contextAround, freeTopicId } from './arrange.mjs';
import { loadAutoTopics, loadHotAttempts, saveAutoTopic, publicAutoTopic, draftFromArrangement, findAutoTopic, rememberHotAttempts } from './auto-topics.mjs';
import { debateSeeds } from './debate-seeds.mjs';
import { loadTopicHealth, recordTopicHealth, knownRounds } from './topic-health.mjs';
import { loadTopicQueries, saveTopicQueries, storedQueries } from './topic-queries.mjs';
import { memoryHotState, fileHotState, beijingDay, nextBeijingMidnight } from './hot-budget.mjs';

const root = path.resolve(fileURLToPath(new URL('../web/', import.meta.url)));
const port = Number(process.env.PORT || 5173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
async function serveStatic(req, res) {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const isPage = ['/', '/topics', '/library', '/debate', '/search'].includes(pathname);
    const target = path.resolve(root, '.' + (isPage ? '/index.html' : pathname));
    if (!target.startsWith(root + path.sep) && target !== root) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': mime[path.extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://*.zhimg.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
      'Referrer-Policy': 'no-referrer'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 400);
    res.end('Not found');
  }
}
export function createRequestHandler({ search = searchZhihu, hot = hotZhihu, summarize = summarizeWithDeepSeek, critique = critiqueWithDeepSeek, filter = filterWithDeepSeek, arrange = arrangeWithDeepSeek, verifyOpposition = verifyOppositionWithDeepSeek, expandQueries = expandQueriesWithDeepSeek, hotState = memoryHotState(), hotIntervalMinutes = Number(process.env.ZHIBIAN_HOT_INTERVAL_MINUTES) || 60, clock = () => Date.now() } = {}) {
  // The eight hand-built categories; AI topics may only be filed into one of
  // these, never into a category of their own. The hints tell the model what
  // each one actually covers, so a headline like "餐馆利润靠酒水" lands in
  // 钱与消费 instead of whatever sounded technical.
  const allowedCategories = [...new Set(publicCatalog.filter(t => !t.featured).map(t => t.category))];
  const CATEGORY_HINTS = {
    '情感与婚恋': '恋爱、婚姻、彩礼、亲密关系',
    '职场与生存': '工作、跳槽、编制、职场关系与权益',
    '钱与消费': '收入、存款、消费习惯、生意与利润',
    '家庭与代际': '父母、子女、带娃、养老、是否同住',
    '教育与养娃': '升学、补习、养育方式、为孩子做的决定',
    '人生与选择': '城市选择、梦想、裸辞、生活方式',
    '科技与 AI': 'AI 工具、互联网与技术产品',
    '影视与审美': '电影、剧集、翻拍、评分、审美与娱乐'
  };
  const categoryHintText = allowedCategories.map(name => `${name}（${CATEGORY_HINTS[name] || ''}）`).join('；');
  const cache = new Map(), inFlight = new Map(), summaryCache = new Map(), summaryInFlight = new Map(), critiqueCache = new Map(), critiqueInFlight = new Map(), filterCache = new Map(), filterInFlight = new Map(), arrangeCache = new Map(), arrangeInFlight = new Map(), oppositionCache = new Map(), oppositionInFlight = new Map(), queryCache = new Map();
  let hotPending = null;
  let cooldown = 0;
  const send = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(data));
  };
  // The hot list has its own small daily quota, and every lobby load used to be
  // able to spend a call. Now it is fetched at most once per `hotIntervalMinutes`
  // (an hour by default), and not at all after Zhihu reports the quota used up
  // until the next Beijing midnight. Between fetches the last list is reused,
  // however old. A call is counted before it is made, so a crash or timeout
  // mid-call still counts toward the interval.
  const HOT_MIN_INTERVAL = Math.max(1, hotIntervalMinutes) * 60 * 1000;
  async function cachedHot() {
    if (hotPending) return hotPending;
    const state = await hotState.load();
    // Checked again after the await: a concurrent request may have started the call.
    if (hotPending) return hotPending;
    const at = clock();
    if (state.day !== beijingDay(at)) { state.day = beijingDay(at); state.calls = 0; }
    const last = Array.isArray(state.last?.data?.items) ? state.last : null;
    if (last && at - last.fetched < HOT_MIN_INTERVAL) return { ...last.data, cached: true };
    const holding = at < (state.blockedUntil || 0) || at - (state.lastCallAt || 0) < HOT_MIN_INTERVAL;
    if (holding) {
      if (last) return { ...last.data, cached: true };
      throw { status: 429, code: 'RATE_LIMIT', message: '热榜还没到下次刷新时间，或今日额度已用完；分类仍可浏览。' };
    }
    state.calls = (state.calls || 0) + 1;
    state.lastCallAt = at;
    hotPending = (async () => {
      await hotState.save();
      try {
        const result = await hot();
        if (result.Code === 30001) {
          state.blockedUntil = nextBeijingMidnight(clock());
          throw { status: 429, code: 'RATE_LIMIT', message: '知乎热榜今日额度已用完，明天再刷新；分类仍可浏览。' };
        }
        if (result.Code === 20001) throw { status: 503, code: 'AUTH_REQUIRED', message: '热榜凭据不可用，请检查官方 CLI 配置。' };
        if (result.Code === 'CLI_MISSING') throw { status: 503, code: 'CLI_MISSING', message: '找不到知乎 CLI。' };
        if (result.Code !== 0 || !Array.isArray(result.Data?.Items)) throw new Error('UPSTREAM_ERROR');
        const data = { items: normalizeHotItems(result), fetchedAt: new Date(clock()).toISOString(), cached: false };
        state.last = { fetched: clock(), data };
        return data;
      } finally {
        await hotState.save();
      }
    })();
    try { return await hotPending; } finally { hotPending = null; }
  }
  // At most two Zhihu CLI searches run at once. A search that finds both slots
  // busy waits for its turn instead of failing, so carousel previews and the
  // background hot-list collection cannot turn a reader's click into
  // "查询暂时受限". Reader-initiated searches are served before background work.
  const SEARCH_SLOTS = 2, SLOT_WAIT_MS = 30000, BACKGROUND_SLOT_WAIT_MS = 120000;
  let activeSearches = 0;
  const slotQueue = [];
  function acquireSearchSlot(background) {
    if (activeSearches < SEARCH_SLOTS && !slotQueue.length) { activeSearches++; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const waiter = { background, resolve };
      waiter.timer = setTimeout(() => {
        const at = slotQueue.indexOf(waiter);
        if (at !== -1) slotQueue.splice(at, 1);
        reject({ status: 429, code: 'RATE_LIMIT', message: '知乎搜索排队太久，请稍后再试。不会自动重复请求。' });
      }, background ? BACKGROUND_SLOT_WAIT_MS : SLOT_WAIT_MS);
      slotQueue.push(waiter);
    });
  }
  function releaseSearchSlot() {
    const reader = slotQueue.findIndex(waiter => !waiter.background);
    const next = slotQueue.splice(reader === -1 ? 0 : reader, 1)[0];
    if (!next) { activeSearches--; return; }
    // The slot passes straight to the next waiter; the active count is unchanged.
    clearTimeout(next.timer);
    next.resolve();
  }
  // No local cap on how many searches run: the account's daily search quota is
  // far larger than this site uses. Only Zhihu's own rate-limit answer pauses
  // searching, for a minute.
  const searchLimited = () => Date.now() < cooldown;
  const limitedError = () => ({ status: 429, code: 'RATE_LIMIT', message: '知乎接口额度或频率受限，请稍后再试。不会自动重复请求。' });
  async function cachedSearch(query, { background = false } = {}) {
    const existing = cache.get(query);
    if (existing && Date.now() - existing.fetched < 15 * 60 * 1000) return { ...existing.data, cached: true };
    if (inFlight.has(query)) return inFlight.get(query);
    if (searchLimited()) throw limitedError();
    const pending = (async () => {
      await acquireSearchSlot(background);
      try {
        // Zhihu may have rate-limited another search while this one was waiting.
        if (searchLimited()) throw limitedError();
        const result = await search(query);
        if (result.Code !== 0) {
          if (result.Code === 30001) { cooldown = Date.now() + 60000; throw { status: 429, code: 'RATE_LIMIT', message: '知乎接口额度或频率受限，请稍后再试。' }; }
          if (result.Code === 20001) throw { status: 503, code: 'AUTH_REQUIRED', message: '知乎凭据不可用。请在运行服务的当前用户下配置官方 CLI。' };
          if (result.Code === 'CLI_MISSING') throw { status: 503, code: 'CLI_MISSING', message: '找不到知乎 CLI，请检查服务端配置。' };
          throw new Error('UPSTREAM_ERROR');
        }
        if (!Array.isArray(result.Data?.Items)) throw new Error('MALFORMED_RESPONSE');
        const data = { items: normalizeItems(result), fetchedAt: new Date().toISOString(), cached: false };
        if (cache.size >= 60) cache.delete(cache.keys().next().value);
        cache.set(query, { fetched: Date.now(), data });
        return data;
      } finally { releaseSearchSlot(); }
    })();
    inFlight.set(query, pending);
    try { return await pending; } finally { inFlight.delete(query); }
  }
  // A window onto what the pipeline is actually doing. The interface polls
  // /api/progress while a search or an arrangement is in flight, so the reader
  // sees the real stages — which keywords were searched, whether the opposition
  // was independently checked — instead of an invented progress bar. In memory
  // only and short lived: a job is one request, not a record.
  const jobs = new Map();
  const JOB_TTL = 5 * 60 * 1000;
  function reporter(jobId) {
    if (!jobId || typeof jobId !== 'string' || jobId.length > 64) return () => {};
    return (label, detail = '') => {
      const now = Date.now();
      for (const [key, job] of jobs) if (now - job.at > JOB_TTL) jobs.delete(key);
      if (jobs.size > 40) jobs.delete(jobs.keys().next().value);
      const job = jobs.get(jobId) || { stages: [], at: now };
      jobs.set(jobId, { stages: [...job.stages, { label, detail: String(detail).slice(0, 160) }], at: now });
    };
  }
  // Zhihu search returns at most ten results, so a single query is a narrow
  // window: the answers that argue the other side are often ranked out of it.
  // The model proposes a few differently-worded queries, each is searched, and
  // the results are merged into one deduplicated pool — ten times as wide,
  // without asking for anything that is not a real search result.
  const QUERY_VARIANTS = Math.max(0, Number(process.env.ZHIBIAN_QUERY_VARIANTS ?? 3));
  async function cachedQueries(topic, id = null, report = () => {}) {
    const key = 'queries:' + topic, existing = queryCache.get(key);
    if (existing) return existing;
    if (!QUERY_VARIANTS) return [topic];

    // Reuse the phrasings this topic was searched under before, so the pool it
    // gets does not change every time the process restarts. A topic that is
    // known to be short of rounds is the exception: those phrasings already
    // failed to reach the missing sources, so this process rerolls them once.
    const short = (knownRounds(await loadTopicHealth(), id || topic) ?? 3) < 3;
    const stored = storedQueries(await loadTopicQueries(), topic);
    if (stored?.length && !short) {
      const queries = [topic, ...stored].slice(0, QUERY_VARIANTS + 1);
      report('用已有的关键词组检索', queries.slice(1).join(' / '));
      queryCache.set(key, queries);
      return queries;
    }
    try {
      report('让 AI 换个角度给出搜索词', short ? '上次的关键词没覆盖全，这次重掷' : '');
      const result = await expandQueries({ topic, count: QUERY_VARIANTS });
      const queries = [topic, ...(result?.queries || [])].slice(0, QUERY_VARIANTS + 1);
      if (process.env.ZHIBIAN_DEBUG) console.error('[queries]', topic, short ? '(rerolled)' : '', '→', queries.slice(1).join(' / '));
      report('确定了 ' + (queries.length - 1) + ' 组关键词', queries.slice(1).join(' / '));
      void saveTopicQueries(topic, queries.slice(1));
      if (queryCache.size >= 80) queryCache.delete(queryCache.keys().next().value);
      queryCache.set(key, queries);
      return queries;
    } catch (error) {
      // Widening the net is best-effort: a failure falls back to the one query.
      if (process.env.ZHIBIAN_DEBUG) console.error('[queries] falling back to one query:', error.code || error.message);
      queryCache.set(key, [topic]);
      return [topic];
    }
  }
  async function cachedSearchPool(topic, { id = null, report = () => {}, background = false } = {}) {
    const queries = await cachedQueries(topic, id, report);
    const merged = [], seen = new Set();
    let fetchedAt = null, cached = true;
    for (const [index, query] of queries.entries()) {
      let result;
      report(`在知乎搜索（第 ${index + 1} / ${queries.length} 组）`, query);
      try { result = await cachedSearch(query, { background }); } catch (error) {
        // Whatever was already gathered still beats failing the whole page.
        if (merged.length) { if (process.env.ZHIBIAN_DEBUG) console.error('[pool] partial:', query, error.code); break; }
        throw error;
      }
      fetchedAt = result.fetchedAt; cached = cached && result.cached;
      for (const item of result.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        merged.push({ ...item, matchedQuery: query });
      }
    }
    report('合并去重', `${queries.length} 组关键词 · 候选池 ${merged.length} 条`);
    return { items: merged, queries, fetchedAt, cached };
  }
  async function cachedSummary(sourceId, text) {
    const key = sourceId + '\u0000' + text;
    const existing = summaryCache.get(key);
    if (existing) return { ...existing, cached: true };
    if (summaryInFlight.has(key)) return summaryInFlight.get(key);
    const pending = (async () => {
      const result = await summarize({ sourceId, text });
      if (!result || typeof result.summary !== 'string' || !result.summary.trim()) throw { status: 503, code: 'AI_UPSTREAM', message: 'AI 摘要没有返回有效内容。' };
      const data = { summary: result.summary.trim().slice(0, 1200), model: String(result.model || defaultModel) };
      if (summaryCache.size >= 120) summaryCache.delete(summaryCache.keys().next().value);
      summaryCache.set(key, data);
      return { ...data, cached: false };
    })();
    summaryInFlight.set(key, pending);
    try { return await pending; } finally { summaryInFlight.delete(key); }
  }
  async function cachedCritique(input) {
    const key = JSON.stringify(input), existing = critiqueCache.get(key);
    if (existing) return { ...existing, cached: true };
    if (critiqueInFlight.has(key)) return critiqueInFlight.get(key);
    const pending = (async () => {
      const result = await critique(input);
      if (!result || typeof result.answer !== 'string' || !result.answer.trim()) throw { status: 503, code: 'AI_UPSTREAM', message: 'AI 质询没有返回有效内容。' };
      const data = { answer: result.answer.trim().slice(0, 1600), model: String(result.model || defaultModel) };
      if (critiqueCache.size >= 120) critiqueCache.delete(critiqueCache.keys().next().value);
      critiqueCache.set(key, data);
      return { ...data, cached: false };
    })();
    critiqueInFlight.set(key, pending);
    try { return await pending; } finally { critiqueInFlight.delete(key); }
  }
  // A batch of twenty answers overflows the model's answer budget and comes back
  // truncated, so judge them a few at a time and merge the verdicts.
  const FILTER_BATCH = 8;
  async function cachedFilter(input) {
    const key = JSON.stringify(input), existing = filterCache.get(key);
    if (existing) return { ...existing, cached: true };
    if (filterInFlight.has(key)) return filterInFlight.get(key);
    const pending = (async () => {
      const batches = [];
      for (let i = 0; i < input.items.length; i += FILTER_BATCH) batches.push(input.items.slice(i, i + FILTER_BATCH));
      if (!batches.length) batches.push([]);
      const allowed = new Map(input.items.map(item => [item.id, item]));
      const items = [];
      let model = defaultModel;
      for (const itemsInBatch of batches) {
        const result = await filter({ ...input, items: itemsInBatch });
        if (!result || !Array.isArray(result.items)) throw { status: 503, code: 'AI_UPSTREAM', message: 'AI 相关性筛选没有返回有效结果。' };
        model = String(result.model || model);
        items.push(...result.items.filter(item => allowed.has(item.id)).map(item => ({ id: item.id, relevant: item.relevant === true, reason: String(item.reason || '未提供筛选依据。').trim().slice(0, 160) })));
      }
      const data = { items, model };
      if (filterCache.size >= 60) filterCache.delete(filterCache.keys().next().value);
      filterCache.set(key, data);
      return { ...data, cached: false };
    })();
    filterInFlight.set(key, pending);
    try { return await pending; } finally { filterInFlight.delete(key); }
  }
  async function cachedArrange({ topic, items }) {
    const key = topic + '\u0000' + items.map(item => item.id + ':' + String(item.text).length).join(',');
    const existing = arrangeCache.get(key);
    if (existing) return { ...existing, cached: true };
    if (arrangeInFlight.has(key)) return arrangeInFlight.get(key);
    const pending = (async () => {
      const result = await arrange({ topic, items, categories: allowedCategories, categoryHintText });
      if (!result || !result.arrangement || typeof result.arrangement !== 'object') throw { status: 503, code: 'AI_UPSTREAM', message: 'AI 自动编排没有返回有效结果。' };
      const data = { arrangement: result.arrangement, model: String(result.model || defaultModel) };
      if (arrangeCache.size >= 60) arrangeCache.delete(arrangeCache.keys().next().value);
      arrangeCache.set(key, data);
      return { ...data, cached: false };
    })();
    arrangeInFlight.set(key, pending);
    try { return await pending; } finally { arrangeInFlight.delete(key); }
  }
  // Independent opposition judge. The arranger's own stance labels are never
  // trusted — the judge sees only the two quotes and has to restate each side
  // first, so it cannot simply agree with what the arranger claimed.
  async function cachedOpposition({ topic, rounds }) {
    const key = topic + '\u0000' + rounds.map(round => round.left + '|' + round.right).join('\u0000');
    const existing = oppositionCache.get(key);
    if (existing) return { ...existing, cached: true };
    if (oppositionInFlight.has(key)) return oppositionInFlight.get(key);
    const pending = (async () => {
      // The judge doubles the AI calls per round, so a transient blip is more
      // likely; retry once, then give up rather than shipping an unjudged pair.
      let result;
      for (let attempt = 0; attempt < 2; attempt++) {
        try { result = await verifyOpposition({ topic, rounds }); break; } catch (error) {
          if (attempt === 1) throw error;
          if (process.env.ZHIBIAN_DEBUG) console.error('[opposition] retrying after', error.code || error.message);
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }
      if (!result || !Array.isArray(result.verdicts)) throw { status: 503, code: 'AI_UPSTREAM', message: 'AI 对立复核没有返回有效结果。' };
      const data = { verdicts: result.verdicts, model: String(result.model || defaultModel) };
      if (oppositionCache.size >= 60) oppositionCache.delete(oppositionCache.keys().next().value);
      oppositionCache.set(key, data);
      return { ...data, cached: false };
    })();
    oppositionInFlight.set(key, pending);
    try { return await pending; } finally { oppositionInFlight.delete(key); }
  }
  // Free question -> search -> AI relevance filter -> AI arrangement ->独立对立复核.
  // Every step is cached, so repeating a question costs no extra upstream calls.
  async function autoPipeline(query, { featured = null, category = null, report = () => {}, background = false } = {}) {
    const data = await cachedSearchPool(query, { id: freeTopicId(query), report, background });
    if (!data.items.length) return { payload: autoDebate({ query }), fetchedAt: data.fetchedAt, cached: data.cached };
    report('判断哪些回答能站到这一题的一边');
    const filtered = await cachedFilter({ topic: query, items: data.items.map(item => ({ id: item.id, sourceTitle: item.sourceTitle, text: item.text })) });
    const decisions = new Map(filtered.items.map(item => [item.id, item]));
    const relevant = data.items.filter(item => decisions.get(item.id)?.relevant === true);
    report('相关性筛选完成', '直接相关 ' + relevant.length + ' 条 / 候选 ' + data.items.length + ' 条');
    // Bounding the arranger's input: a pool of thirty-odd answers would make a
    // prompt that is slow, expensive and mostly ignored. Sixteen is enough to
    // find three real oppositions.
    const arrangeItems = relevant.slice(0, 16);
    report('挑出最适合编排的回答', arrangeItems.length + ' 条送入编排');
    if (relevant.length < 4) return { payload: autoDebate({ query, items: relevant }), fetchedAt: data.fetchedAt, cached: data.cached };
    report('让 AI 把立场相反的回答配成回合');
    const pooled = await cachedArrange({ topic: query, items: arrangeItems.map(item => ({ id: item.id, name: item.name, sourceTitle: item.sourceTitle, text: item.text })) });
    let payload = autoDebate({ query, items: relevant, arrangement: pooled.arrangement, model: pooled.model });
    // The judge sees the two quotes *with their surrounding text* — never the
    // arranger's own stance labels — so it can catch a quote that only looks
    // like one stance until you read what comes after it. Rounds it rejects are
    // dropped before anything is shown or stored.
    if (payload.rounds.length) {
      report('请另一位裁判复核：两边是不是真的对立');
      const judged = await cachedOpposition({
        topic: query,
        rounds: payload.rounds.map((pair, index) => ({
          sharedQuestion: payload.sharedQuestions[index],
          left: pair[0].evidence,
          leftContext: contextAround(pair[0].text, pair[0].evidence),
          right: pair[1].evidence,
          rightContext: contextAround(pair[1].text, pair[1].evidence)
        }))
      });
      payload = keepRounds(payload, judged.verdicts);
      const notOpposed = payload.verification.dropped.filter(entry => entry.reason === 'NOT_REALLY_OPPOSED').length;
      report('复核完成', notOpposed ? '删掉了 ' + notOpposed + ' 组只是相关、并不对立的配对' : '落座 ' + payload.rounds.length + ' 个回合');
    }
    // Only a question that produced a verified, genuinely opposed round becomes a topic.
    if (payload.rounds.length) await saveAutoTopic(draftFromArrangement({
      query, payload, model: pooled.model, featured, forcedCategory: category,
      categories: category && allowedCategories.includes(category) ? [category] : allowedCategories
    }));
    return { payload,
      fetchedAt: data.fetchedAt, cached: data.cached && pooled.cached };
  }

  // Headlines carry no answers, so a hot item only becomes a debatable topic
  // after the same search -> filter -> arrange pipeline runs on it. That spends
  // AI calls without a click, so it is bounded: a handful per round, never a
  // retry of something that already failed, and it only runs when the carousel
  // is short of hot entries.
  const FEATURED_PER_ROUND = 3;
  const FEATURED_TARGET = 4;
  // The hot list is mostly news and politics, while this product deliberately
  // stays on personal decisions. This is a coarse keyword guard, not a real
  // classifier: a headline is only collected if it reads like a decision
  // question and carries none of the words the product stays out of.
  const FEATURED_WANT = /(该不该|要不要|能不能|可不可以|值不值得|有没有必要|是不是|算不算|值得吗|应该如何|如何看待|如何评价|为什么|为啥)/;
  const FEATURED_SKIP = /(民族|主权|领土|分裂|独立|战争|军事|外交|制裁|政府|政策|立法|人大|政协|两会|选举|公投|法院|判决|获刑|逮捕|立案|纪委|查处|落马|事故|伤亡|疫情|地震|洪水|灾害|股价|股市|涨停|上市|并购|股权|公告|财报|收购|遗产)/;
  const collectable = title => FEATURED_WANT.test(title) && !FEATURED_SKIP.test(title);
  let featuredJob = null, featuredBlockedUntil = 0, blockedHot = null;
  // Candidate debates for the carousel: real hot headlines first, then seeded
  // crowd-pleasers the model helped pick. Both go through the same pipeline, so
  // nothing enters the library without verified opposing quotes.
  async function featuredCandidates(known, tried) {
    const out = [];
    try {
      const hot = await cachedHot();
      for (const item of hot.items) {
        if (item.title && item.title.length >= 2 && collectable(item.title) && !known.has(item.title) && !tried.has(item.title)) {
          out.push({ topic: item.title, title: item.title, source: 'hot', rank: item.rank, category: null });
        }
      }
    } catch (error) {
      blockedHot = error.code || 'HOT_UNAVAILABLE';
      // Seed topics below still go through the pipeline; only the headlines are skipped.
      if (process.env.ZHIBIAN_DEBUG) console.error('[featured] hot skipped', blockedHot);
    }
    for (const seed of debateSeeds) {
      if (!known.has(seed.topic) && !tried.has(seed.topic)) {
        out.push({ topic: seed.topic, title: seed.topic, source: 'seed', rank: null, category: seed.category });
      }
    }
    return out;
  }
  async function buildFeatured() {
    if (featuredJob) return featuredJob;
    if (Date.now() < featuredBlockedUntil) return null;
    featuredJob = (async () => {
      const evaluated = [];
      let blocked = null;
      try {
        const known = new Set((await loadAutoTopics()).map(topic => topic.query));
        const tried = new Set(await loadHotAttempts());
        const candidates = (await featuredCandidates(known, tried)).slice(0, FEATURED_PER_ROUND);
        for (const candidate of candidates) {
          try {
            await autoPipeline(candidate.topic, { featured: { source: candidate.source, rank: candidate.rank, label: candidate.title }, category: candidate.category, background: true });
            // Reaching here means the headline was really evaluated, even if it
            // turned out to have no usable opposition. Only then is it spent.
            evaluated.push(candidate.title);
          } catch (error) {
            blocked = error.code || 'UPSTREAM_UNAVAILABLE';
            if (process.env.ZHIBIAN_DEBUG) console.error('[featured] stopped at', candidate.title, blocked);
            break;
          }
        }
      } catch (error) {
        // The hot list can be rate-limited or unavailable; the carousel still
        // works with whatever the library already holds.
        blocked = error.code || 'HOT_UNAVAILABLE';
        if (process.env.ZHIBIAN_DEBUG) console.error('[featured] skipped', blocked);
      }
      if (evaluated.length) await rememberHotAttempts(evaluated);
      // An upstream problem must not be retried on every lobby load, and must
      // not burn the remaining headlines. A transient AI hiccup gets a shorter
      // pause than a search/quota problem, so a blip does not freeze collection.
      const pause = blocked === 'RATE_LIMIT' ? 5 * 60 * 1000 : blocked === 'AI_UPSTREAM' ? 2 * 60 * 1000 : 10 * 60 * 1000;
      if (blocked) featuredBlockedUntil = Date.now() + pause;
      return null;
    })().finally(() => { featuredJob = null; });
    return featuredJob;
  }
  async function refreshFeatured() {
    const stocked = (await loadAutoTopics()).filter(topic => topic.featuredSource).length;
    if (stocked >= FEATURED_TARGET) return;
    void buildFeatured();
  }
  // A slide's opposing quotes. Built from a live search so every quote is
  // re-checked right now, never from whatever was stored last time; the result
  // is cached so rotating back to a slide costs nothing.
  const previewCache = new Map();
  async function topicPreview(topic) {
    const cached = previewCache.get(topic.id);
    if (cached) return cached;
    // Carousel previews are background work: a reader's click goes ahead of them.
    const data = await cachedSearchPool(topic.query, { id: topic.id, background: true });
    const debate = arrangeDebate(topic, data.items);
    const round = debate.rounds[0];
    const preview = round ? {
      id: topic.id,
      left: { name: round[0].name, quote: round[0].evidence },
      right: { name: round[1].name, quote: round[1].evidence },
      sharedQuestion: debate.sharedQuestions?.[0] || null,
      // What the independent judge read each side as — shown so the claim
      // "these two disagree" is checkable rather than asserted.
      positions: debate.oppositions?.[0] || null
    } : null;
    if (preview) {
      if (previewCache.size >= 40) previewCache.delete(previewCache.keys().next().value);
      previewCache.set(topic.id, preview);
    }
    return preview;
  }
  async function readJson(req, maxBytes = 90000) {
    return new Promise((resolve, reject) => {
      let total = 0, body = '';
      req.setEncoding('utf8');
      req.on('data', chunk => {
        total += Buffer.byteLength(chunk);
        if (total > maxBytes) { reject({ status: 400, code: 'INVALID_INPUT', message: '请求内容过大。' }); req.destroy(); return; }
        body += chunk;
      });
      req.on('end', () => {
        try { resolve(JSON.parse(body || '{}')); } catch { reject({ status: 400, code: 'INVALID_INPUT', message: '请求内容不是有效 JSON。' }); }
      });
      req.on('error', () => reject({ status: 400, code: 'INVALID_INPUT', message: '请求内容无法读取。' }));
    });
  }
  // Besides loopback, a deployment behind a reverse proxy names its public
  // domain(s) in ZHIBIAN_PUBLIC_HOSTS (comma-separated host names, no port).
  const publicHosts = (process.env.ZHIBIAN_PUBLIC_HOSTS || '').split(',').map(name => name.trim().toLowerCase()).filter(Boolean);
  const allowedHost = host => {
    const name = host.toLowerCase().replace(/:\d+$/, '');
    return /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) || (publicHosts.includes(name) && /^[a-z0-9.-]+(:\d+)?$/.test(host.toLowerCase()));
  };
  // Same-origin by host: behind TLS termination the browser says https:// while
  // this process only sees plain HTTP, so the scheme cannot be compared.
  const sameHost = (origin, host) => { try { return new URL(origin).host.toLowerCase() === host.toLowerCase(); } catch { return false; } };
  return async (req, res) => {
    const host = req.headers.host || '';
    if (!allowedHost(host)) return send(res, 403, { message: '仅限本机访问。' });
    let url;
    try { url = new URL(req.url, 'http://' + host); } catch { return send(res, 400, { message: '请求地址无效。' }); }
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res);
    if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && !sameHost(req.headers.origin, host))) return send(res, 403, { message: '不接受跨站查询。' });
    if (url.pathname === '/api/topics') {
      // Kick off hot-headline collection in the background; the response never waits for it.
      void refreshFeatured();
      const health = await loadTopicHealth();
      const withHealth = topic => ({ ...topic, verifiedRounds: knownRounds(health, topic.id) });
      return send(res, 200, { topics: [...publicCatalog.map(withHealth), ...(await loadAutoTopics()).map(publicAutoTopic).map(withHealth)] });
    }
    try {
      if (url.pathname === '/api/preview') {
        if (req.method !== 'GET') return send(res, 405, { message: '仅支持读取。' });
        const id = (url.searchParams.get('id') || '').trim();
        if (!id) return send(res, 400, { message: '请提供辩题 ID。' });
        const topic = catalog.find(t => t.id === id) || findAutoTopic(await loadAutoTopics(), id);
        if (!topic) return send(res, 404, { message: '辩题不存在。' });
        // A missing or changed source degrades to the lobby's short labels; it
        // is never replaced with generated text.
        const preview = await topicPreview(topic).catch(error => {
          if (process.env.ZHIBIAN_DEBUG) console.error('[preview]', id, error.code || error.message);
          return null;
        });
        return send(res, 200, { id, preview });
      }
      if (url.pathname === '/api/summarize') {
        if (req.method !== 'POST') return send(res, 405, { message: 'AI 摘要只接受 POST 请求。' });
        const body = await readJson(req);
        const sourceId = typeof body.sourceId === 'string' ? body.sourceId.trim() : '';
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!sourceId || !text || text.length > 60000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) return send(res, 400, { code: 'INVALID_INPUT', message: '请提供有效的回答内容。' });
        return send(res, 200, await cachedSummary(sourceId, text));
      }
      if (url.pathname === '/api/critique') {
        if (req.method !== 'POST') return send(res, 405, { message: 'AI 能力只接受 POST 请求。' });
        const body = await readJson(req);
        const sourceId = typeof body.sourceId === 'string' ? body.sourceId.trim() : '';
        const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
        const side = typeof body.side === 'string' ? body.side.trim() : '';
        const evidence = typeof body.evidence === 'string' ? body.evidence.trim() : '';
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        const question = typeof body.question === 'string' ? body.question.trim() : '';
        const invalid = value => !value || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
        if ([sourceId, topic, side, evidence, text, question].some(invalid) || topic.length > 500 || side.length > 200 || evidence.length > 6000 || text.length > 60000 || question.length > 2000) {
          return send(res, 400, { code: 'INVALID_INPUT', message: '请提供有效的题目、阵营与回答内容。' });
        }
        return send(res, 200, await cachedCritique({ sourceId, topic, side, evidence, text, question }));
      }
      if (url.pathname === '/api/filter') {
        if (req.method !== 'POST') return send(res, 405, { message: 'AI 相关性筛选只接受 POST 请求。' });
        const body = await readJson(req, 500000);
        const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
        const items = Array.isArray(body.items) ? body.items : [];
        const validItems = items.length > 0 && items.length <= 60 && items.every(item => item && typeof item.id === 'string' && item.id.trim() && typeof item.sourceTitle === 'string' && item.sourceTitle.trim() && typeof item.text === 'string' && item.text.trim() && item.text.length <= 12000);
        if (!topic || topic.length > 500 || !validItems) return send(res, 400, { code: 'INVALID_INPUT', message: '请提供有效的辩题和搜索结果。' });
        return send(res, 200, await cachedFilter({ topic, items: items.map(item => ({ id: item.id.trim(), sourceTitle: item.sourceTitle.trim(), text: item.text.trim() })) }));
      }
      if (req.method !== 'GET') return send(res, 405, { message: '仅支持读取。' });
      if (url.pathname === '/api/hot') return send(res, 200, await cachedHot());
      if (url.pathname === '/api/progress') {
        const job = url.searchParams.get('job') || '';
        return send(res, 200, { stages: jobs.get(job)?.stages || [] });
      }
      if (url.pathname === '/api/search') {
        const query = (url.searchParams.get('q') || '').trim();
        if (query.length < 2 || query.length > 100 || /[\x00-\x1f]/.test(query)) return send(res, 400, { message: '请输入 2–100 个字符的辩题。' });
        // Same multi-query pool the debate view uses: one search is capped at ten
        // results, which is far too narrow to judge what people actually say.
        const data = await cachedSearchPool(query, { report: reporter(url.searchParams.get('job')) });
        return send(res, 200, data);
      }
      if (url.pathname === '/api/debate') {
        const freeQuery = (url.searchParams.get('q') || '').trim();
        if (freeQuery) {
          if (freeQuery.length < 2 || freeQuery.length > 100 || /[\x00-\x1f]/.test(freeQuery)) return send(res, 400, { code: 'INVALID_INPUT', message: '请输入 2–100 个字符的辩题。' });
          const result = await autoPipeline(freeQuery, { report: reporter(url.searchParams.get('job')) });
          return send(res, 200, { ...result.payload, fetchedAt: result.fetchedAt, cached: result.cached });
        }
        const requestedId = url.searchParams.get('id');
        const config = catalog.find(t => t.id === requestedId)
          || findAutoTopic(await loadAutoTopics(), requestedId);
        if (!config) return send(res, 400, { message: '这个辩题尚未编排。可以通过搜索查看原始观点。' });
        const data = await cachedSearchPool(config.query, { id: config.id });
        const debate = arrangeDebate(config, data.items);
        // Remember what this topic actually rendered, so the lobby can feature
        // debates that are still complete instead of ones that quietly decayed
        // when a source drifted out of the search results.
        if (!config.autoArranged || !debate.rounds.length) void recordTopicHealth(config.id, debate.rounds.length);
        return send(res, 200, { ...debate, fetchedAt: data.fetchedAt, cached: data.cached });
      }
      return send(res, 404, { message: '接口不存在。' });
    } catch (error) {
      if (process.env.ZHIBIAN_DEBUG) console.error('[zhibian]', url.pathname, error);
      const known = ['RATE_LIMIT', 'AUTH_REQUIRED', 'CLI_MISSING', 'AI_NOT_CONFIGURED', 'AI_UPSTREAM', 'INVALID_INPUT'].includes(error.code);
      return send(res, known ? error.status : 502, { code: known ? error.code : 'UPSTREAM_UNAVAILABLE', message: known ? error.message : '暂时无法获取知乎内容，请稍后手动重试。未使用虚构内容替代。' });
    }
  };
}
export const handleRequest = createRequestHandler();
// Loads a local .env only when the server is started directly, so `npm test`
// never picks up real credentials. Real environment variables always win.
async function loadLocalEnv() {
  try {
    const text = await readFile(path.resolve(root, '..', '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match || match[1] in process.env) continue;
      process.env[match[1]] = match[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    }
  } catch { /* No local .env: use the ambient environment. */ }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await loadLocalEnv();
  // The real server keeps the hot-list call count on disk, so a restart or a
  // deploy cannot spend the day's quota again.
  http.createServer(createRequestHandler({ hotState: fileHotState() })).listen(port, '127.0.0.1', () => {
    console.log('Zhibian preview: http://localhost:' + port);
  });
}
