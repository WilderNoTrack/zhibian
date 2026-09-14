import { plainText } from './zhihu.mjs';

const defaultBaseUrl = 'https://api.deepseek.com';
const defaultModel = 'deepseek-flash';
// deepseek-flash sometimes sits in DeepSeek's queue: the response opens at once
// but only keep-alive lines arrive, for a minute or more. When the model has not
// started writing after a short wait, the same request goes to this model.
const fallbackModel = 'deepseek-v4-pro';
// The wait bounds only the time before output starts (queueing), never a long
// answer that is already being written.
const queueWaitMs = () => Math.max(1, Number(process.env.ZHIBIAN_AI_QUEUE_MS) || 5000);
const FALLBACK_QUEUE_WAIT_MS = 15000;
const TOTAL_TIMEOUT_MS = 90000;

function providerError(code, message, status = 503) {
  return Object.assign(new Error(message), { code, status });
}

function contentOf(payload) {
  const raw = payload?.choices?.[0]?.message?.content;
  return plainText(Array.isArray(raw) ? raw.map(part => part?.text || '').join('') : raw);
}

// Reads a server-sent-event completion. Blank lines and ": keep-alive" comments
// are what a queued request receives; `onOutput` fires on the first real delta.
async function readStream(body, onOutput) {
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = '', content = '';
  const handle = line => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let event;
    try { event = JSON.parse(data); } catch { return; }
    if (event.error) throw providerError('AI_UPSTREAM', 'AI 服务暂时不可用，请稍后重试。');
    const delta = event.choices?.[0]?.delta || {};
    const piece = Array.isArray(delta.content) ? delta.content.map(part => part?.text || '').join('') : delta.content;
    if (piece || delta.reasoning_content) onOutput();
    if (piece) content += piece;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.forEach(handle);
  }
  buffer += decoder.decode();
  if (buffer) handle(buffer);
  return content;
}

async function requestCompletion({ model, system, user, maxTokens, temperature, firstOutputMs, totalMs }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || defaultBaseUrl).replace(/\/+$/, '');
  const controller = new AbortController();
  let stopped = null;
  const stop = why => () => { stopped = why; controller.abort(); };
  let queueTimer = setTimeout(stop('queued'), firstOutputMs);
  const totalTimer = setTimeout(stop('timeout'), totalMs);
  const started = () => { if (queueTimer) { clearTimeout(queueTimer); queueTimer = null; } };
  try {
    const response = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        thinking: { type: 'disabled' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      })
    });
    if (!response.ok) throw providerError('AI_UPSTREAM', 'AI 服务暂时不可用，请稍后重试。', response.status === 429 ? 429 : 503);
    let content;
    if (typeof response.body?.getReader === 'function') {
      content = plainText(await readStream(response.body, started));
    } else {
      // A plain JSON reply: a proxy that ignores `stream`, or a test double.
      started();
      let payload;
      try { payload = await response.json(); } catch { throw providerError('AI_UPSTREAM', 'AI 返回格式无效。'); }
      content = contentOf(payload);
    }
    if (!content) throw providerError('AI_UPSTREAM', 'AI 没有返回有效内容。');
    return { content, model };
  } catch (error) {
    if (stopped === 'queued') throw providerError('AI_QUEUED', `${model} 在 ${firstOutputMs}ms 内没有开始输出`);
    if (stopped === 'timeout') throw providerError('AI_UPSTREAM', 'AI 服务响应超时，请稍后重试。');
    if (error?.code === 'AI_UPSTREAM') throw error;
    throw providerError('AI_UPSTREAM', 'AI 服务暂时不可用，请稍后重试。');
  } finally {
    clearTimeout(queueTimer);
    clearTimeout(totalTimer);
  }
}

// deepseek-flash first; if it is queued past the short wait or fails, the same
// request goes to deepseek-v4-pro. The result names the model that answered.
async function chatWithDeepSeek({ system, user, maxTokens = 320, temperature = 0.2 }) {
  if (!process.env.DEEPSEEK_API_KEY) throw providerError('AI_NOT_CONFIGURED', 'AI 服务尚未配置，请检查服务端环境变量。');
  const request = { system, user, maxTokens, temperature, totalMs: TOTAL_TIMEOUT_MS };
  try {
    return await requestCompletion({ ...request, model: defaultModel, firstOutputMs: queueWaitMs() });
  } catch (primaryError) {
    if (process.env.ZHIBIAN_DEBUG) console.error('[deepseek] primary model failed, using fallback:', primaryError.code, primaryError.message);
    try {
      return await requestCompletion({ ...request, model: fallbackModel, firstOutputMs: FALLBACK_QUEUE_WAIT_MS });
    } catch (fallbackError) {
      if (process.env.ZHIBIAN_DEBUG) console.error('[deepseek] fallback model failed:', fallbackError.code, fallbackError.message);
      throw providerError('AI_UPSTREAM', 'AI 服务暂时不可用，请稍后重试。', primaryError.status === 429 || fallbackError.status === 429 ? 429 : 503);
    }
  }
}

export async function summarizeWithDeepSeek({ sourceId, text }) {
  const result = await chatWithDeepSeek({
    maxTokens: 320,
    system: '你是知乎观点阅读助手。先完整理解回答原文，再做轻度整理：尽量保留答主原有的语言风格、语气和第一人称，保留口语、犹豫、情绪与条件表达，不要改写成千篇一律的 AI 腔。只概括作者的核心判断、关键前提和条件，不评价作者人格，不补充原文之外的事实，不把有条件的表达改成绝对结论。输出 60 到 120 字的自然文字；每个完整句子单独一行，不要标题、列表或 Markdown。',
    user: `回答编号：${sourceId}\n\n回答原文：\n${text}`
  });
  const summary = result.content.replace(/\s*([。！？!?])\s*/g, '$1\n').replace(/\n{2,}/g, '\n').trim();
  return { summary: summary.slice(0, 1200), model: result.model };
}

// The critique is written as the answer's own case being made back at the
// reader, in the answer's own register — a role-play of the position, not a
// neutral review. It stays anchored to the answer: every rebuttal has to come
// from something the answer actually says, and it never invents facts, never
// guesses at the author's identity, and never claims to be the author.
export async function critiqueWithDeepSeek({ sourceId, topic, side, evidence, text, question }) {
  const result = await chatWithDeepSeek({
    maxTokens: 900,
    temperature: 0.45,
    system: `你要**站在这条知乎回答的立场上，用它的语气，把提问者的质疑顶回去**。不是在旁边分析这条回答，而是替它说话。

怎么做：
- 先接住提问者的点：承认他问到了什么，但立刻用这条回答里的理由反驳。
- 反驳的依据**只能来自这条回答的原文**：它的判断、它举的例子、它给的条件、它的措辞。回答里没有的论据不要编。
- 语气模仿这条回答本身：它口语就口语，它讲数据就讲数据，它带情绪就带情绪，它爱用比喻就用比喻。不要写成一板一眼的分析报告。
- 允许犀利、允许反问、允许"你这句话我不同意"，但只针对观点，不针对人。不要骂人，不评价提问者的人格、身份、职业、性别。
- 不要当裁判：不要说"双方都有道理"、不要给结论式评分、不要列举"优点缺点"，也不要写 "综上"。

如果这条回答**确实回答不了**提问者的质疑，就直接说它答不了、并指出它缺哪一环 —— 不要硬撑，也不要编。

严格只输出正文，不要 Markdown 标题，不要小标题，不要列表符号。120 到 260 字自然中文。`,
    user: `辩题：${topic}\n当前一方：${side}\n核对原句：${evidence}\n回答编号：${sourceId}\n\n这条回答的全文：\n${text}\n\n提问者的问题（请用上面这条回答的立场与语气回应）：${question}`
  });
  return { answer: result.content.slice(0, 1600), model: result.model };
}

function stripCodeFence(raw) {
  return String(raw ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function parseJsonArray(raw) {
  const candidate = stripCodeFence(raw);
  try { return JSON.parse(candidate); } catch {
    const match = candidate.match(/\[[\s\S]*\]/);
    try { return match ? JSON.parse(match[0]) : null; } catch { return null; }
  }
}

// A long batch can come back truncated mid-object. Salvage every complete entry
// instead of throwing the whole judgement away; an id with no verdict falls back
// to "not relevant", which is the conservative side.
function salvageJsonArray(raw) {
  const parsed = parseJsonArray(raw);
  if (Array.isArray(parsed)) return parsed;
  const out = [];
  for (const chunk of stripCodeFence(raw).match(/\{[^{}]*\}/g) || []) {
    try { const item = JSON.parse(chunk); if (item && typeof item === 'object') out.push(item); } catch { /* incomplete entry */ }
  }
  return out.length ? out : null;
}

function parseJsonObject(raw) {
  const candidate = stripCodeFence(raw);
  const pick = text => {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  };
  const direct = pick(candidate);
  if (direct) return direct;
  const match = candidate.match(/\{[\s\S]*\}/);
  return match ? pick(match[0]) : null;
}

// Zhihu search only ever returns ten results per query, so one query is a
// narrow window onto a topic: the answers that matter for the *other* side are
// often ranked out of it. Asking the model for several differently-worded
// queries widens that window to ten times the number of queries.
export async function expandQueriesWithDeepSeek({ topic, count = 3 }) {
  const result = await chatWithDeepSeek({
    maxTokens: 500,
    temperature: 0.3,
    system: `你是检索词助手。用户给出一个辩题，你要给出 ${count} 条**互不相同**的搜索词，用来在知乎上把这个辩题下不同立场的回答都搜出来。

要求：
- 每条都要短，像人真的会敲进搜索框的词，不要写成完整句子，不要带标点。
- 彼此必须明显不同：覆盖不同的口语说法，并且**分别用正反两方的用词**。例如辩题是「该不该裸辞」，一边的人会搜「裸辞后悔」，另一边会搜「裸辞值得」，还有人搜「裸辞 存款」。
- 补上这个辩题的常见侧面或具体场景（人群、金额、时间、后果）。
- 不要照抄原辩题本身，也不要加引号或解释。

严格只输出 JSON 数组，例如 ["裸辞后悔","裸辞值得","裸辞 存款"]，不要 Markdown，不要注释。`,
    user: `辩题：${topic}`
  });
  const parsed = parseJsonArray(result.content);
  const queries = (Array.isArray(parsed) ? parsed : [])
    .map(query => plainText(query).replace(/^["'【\[]|["'】\]]$/g, '').trim())
    .filter(query => query.length >= 2 && query.length <= 30)
    .filter((query, index, all) => all.indexOf(query) === index)
    .slice(0, count);
  if (!queries.length) {
    if (process.env.ZHIBIAN_DEBUG) console.error('[expandQueries] unparseable:', String(result.content).slice(0, 200));
    throw providerError('AI_UPSTREAM', 'AI 搜索词扩展返回格式无效。');
  }
  return { queries, model: result.model };
}

export async function filterWithDeepSeek({ topic, items }) {
  const result = await chatWithDeepSeek({
    maxTokens: 2000,
    temperature: 0.1,
    system: '你是知乎辩题的选材助手。判断每条回答能否作为这道辩题某一方的依据：只要它的立场、理由或经历能放进这道辩题的一边，就判 relevant=true，**不必来自与辩题字面相同的问题**（比如辩题是「该不该裸辞」，一篇讲「为什么我后悔裸辞」的回答可以算「不该」一方）。只有内容与辩题两边都搭不上、或完全在讨论另一个问题时才判 relevant=false；拿不准时保守保留。不判断左右阵营，不做分组，不根据答主头像、昵称、性别或职业推断。严格只输出 JSON 数组，每项格式为 {"id":"原编号","relevant":true或false,"reason":"不超过50字的依据"}，不要 Markdown。',
    user: `辩题：${topic}\n\n待筛选回答：\n${JSON.stringify(items.map(item => ({ id: item.id, sourceTitle: item.sourceTitle, text: item.text.slice(0, 5000) })))}`
  });
  const parsed = salvageJsonArray(result.content);
  if (!Array.isArray(parsed)) {
    // Truncation is the usual cause when there are many answers to judge.
    if (process.env.ZHIBIAN_DEBUG) console.error('[filter] unparseable, length', String(result.content).length, 'tail:', String(result.content).slice(-160));
    throw providerError('AI_UPSTREAM', 'AI 相关性筛选返回格式无效。');
  }
  const byId = new Map(parsed.filter(item => item && typeof item.id === 'string').map(item => [item.id, item]));
  const filtered = items.map(item => {
    const decision = byId.get(item.id);
    return { id: item.id, relevant: decision?.relevant === true, reason: plainText(decision?.reason).slice(0, 160) || 'AI 未确认与辩题直接相关。' };
  });
  return { items: filtered, model: result.model };
}

export async function arrangeWithDeepSeek({ topic, items, categories = [], categoryHintText = '' }) {
  const result = await chatWithDeepSeek({
    maxTokens: 3000,
    temperature: 0.2,
    system: `你是知乎观点编排助手。用户给出一道辩题和若干条与辩题相关的真实回答，你负责把其中**在同一问题上给出相反结论**的回答配成对照回合。

合格回合的唯一标准：把两条判断并排放在一起，能读成「一个说该／是／值得，另一个说不该／不是／不值得」。
逐条自检，不满足就删掉这个回合，不要降格凑数：
- 两条结论方向必须相反。都支持、都反对，只是理由、方案、归因、条件或角度不同 —— 不合格。
- 两条必须在回答同一个问题。一条在讨论该不该做，另一条在讨论怎么做、为什么做不成 —— 不合格。
- 每条都必须是一句明确的判断。「我做过 / 我见过 / 这类事情通常是… / 有些人会…」这种只陈述事实、经历或现象的描述句不能充当一方 —— 不合格。
- 只是补充前提、只是举反例、只是把对方的话说得更周全 —— 都不算相反结论，不合格。

好例：左「不到万不得已，千万不要辞掉还不错的工作」，右「没人帮衬就只能全职带娃，自己上手」——同问要不要辞职，一个反对一个支持。
坏例：左「真没必要辞职考研，不值当」，右「我的方案是不辞职，直接考非全 MBA」——两条都反对辞职，方向相同，删掉。

规则：
0. debateTitle：把这道辩题润色成一句**对立鲜明**的辩题，不超过 18 个字，必须是能让两边直接开打的问法（如「该不该裸辞去追梦」「父母该不该帮忙带娃」）。原标题是新闻陈述或长句时尤其要改写；原标题已经够锋利时也要原样填入，**不能留空**。
   category：从候选里**原样复制一个词**填入。候选与各自含义：${categoryHintText}。不能自己造词，不能省略；实在都不贴，就选人物关系或选择最接近的一个。
1. 每条回答最多出现一次。合格回合少于三个就少给，宁可只给一个甚至不给，也不要用不合格的配对填空。如果某条回答通篇只是叙述自己的做法或经历、找不到一句明确的判断，就不要把它编进任何回合。
   两条尽量来自**不同的知乎问题**：同一个问题下的回答常常共享前提、只呈现一种立场，跨问题更容易找到真正相反的两边。来源不同不影响成立。
2. sharedQuestion：两人共同回答的那个问题，不超过 20 字，必须能写成「该不该…／是不是…／值不值得…」这样的是非问句。写不出这样的问句，说明这一回合不合格，删掉它。
3. stance：这一方对 sharedQuestion 的回答，只能填「肯定」或「否定」两个词之一，必须与同回合另一席相反。如果两条要填同一个词，说明它们方向相同，删掉这个回合，不要为了凑数硬填。
4. evidence 必须从该条回答正文中逐字复制一段连续文字，10 到 60 字，且必须是**作者自己下判断**的那一句——不要选「有人认为…」「一群人觉得…」这类转述句，也不要选只描述现象的句子。不得改写、换词、拼接两处、加省略号或引号。复制错一个字，这个席位就会被服务端丢弃。
5. 不评价答主身份、性别、职业或立场标签；不判定谁对谁错；不输出胜负、分数或可信度。
6. left 和 right 是本场两条主线的简短概括，各不超过 8 个字，且要能在对应回答里找到依据。side 为 0 表示倾向 left，为 1 表示倾向 right，每个回合必须各有一条。
7. lens 说明本回合在比较什么，不超过 12 个字。host 是一句不超过 40 字的编排说明，指出本回合的比较范围与前提。intro 不超过 40 字。

严格只输出 JSON 对象，不要 Markdown，不要注释，格式：
{"debateTitle":"对立鲜明的辩题","category":"八个候选之一","intro":"...","left":"...","right":"...","rounds":[{"lens":"...","sharedQuestion":"...","host":"...","seats":[{"id":"原编号","side":0,"stance":"肯定或否定","evidence":"逐字原句","reason":"不超过30字"}]}],"questions":["不超过25字","不超过25字"]}`,
    user: `辩题：${topic}\n\n可编排的回答：\n${JSON.stringify(items.map(item => ({ id: item.id, author: item.name, sourceTitle: item.sourceTitle, text: String(item.text).slice(0, 6000) })))}`
  });
  const parsed = parseJsonObject(result.content);
  if (!parsed) {
    // A truncated response is the usual cause; log it so it is not mistaken for
    // a model-quality problem.
    if (process.env.ZHIBIAN_DEBUG) console.error('[arrange] unparseable, length', String(result.content).length, 'tail:', String(result.content).slice(-160));
    throw providerError('AI_UPSTREAM', 'AI 自动编排返回格式无效。');
  }
  return { arrangement: parsed, model: result.model };
}

// An independent judge for the pairs the arranger proposed. It never sees the
// arranger's own stance labels, so it cannot simply agree with them: it has to
// restate each side's position first. Used to drop rounds where both quotes
// actually argue the same way.
export async function verifyOppositionWithDeepSeek({ topic, rounds }) {
  const result = await chatWithDeepSeek({
    maxTokens: 1000,
    temperature: 0,
    system: `你是辩题裁判。用户给出一道辩题和若干组配对。每组有两方，每一方包含一段**引句**和这句引句在原文里的**前后文**。

你的任务是判断：**这两位作者本人，是不是真的站在相反的两边。**

按这个顺序做，不要跳步：
1. 先只看前后文，用一句话说出**这一方作者本人**的立场（他到底支持哪一边）。注意：引句里如果出现「有人认为」「一群人觉得」「他说」这类转述，那**不是作者本人的立场**；结合前后文，作者可能恰恰在反驳这句话。
2. 再对比两位作者本人的立场。

判定规则：
- 两位作者本人一个支持、一个反对 → opposed = true。
- 两位作者本人都支持、或都反对，只是理由、例子、程度、对象不同 → opposed = false。
- 某一方作者本人没有表态（只转述别人的观点、只描述现象、只讲故事） → opposed = false。
- 引句字面看着相反，但结合前后文会发现某一方作者其实同意另一方 → opposed = false。
- 两句在说两件不同的事 → opposed = false。

守则：**以作者本人在前后文里的真实立场为准，不要被引句字面或引句里的转述带偏。** 宁可判 opposed = false，也不要把只是「相关」的一对放过去。

输出字段：
- leftPosition / rightPosition：作者本人的立场，各不超过 12 字。
- leftSide / rightSide：对这道辩题本身，这位作者是**支持**还是**反对**，只能填「支持」或「反对」两个词之一。先想清楚各自的立场再填，**不要为了凑成对立而故意填反**。
- opposed：两位作者是不是真的不同边（一个支持一个反对才是 true）。

守则：**以作者本人在前后文里的真实立场为准，不要被引句字面或引句里的转述带偏。** 宁可判 opposed = false，也不要把只是「相关」的一对放过去。

严格只输出 JSON 数组，每项形如 {"index":0,"opposed":true,"leftPosition":"不超过12字","rightPosition":"不超过12字","leftSide":"支持或反对","rightSide":"支持或反对","reason":"不超过30字"}，不要 Markdown，不要注释。`,
    user: `辩题：${topic}\n\n待判定的配对：\n${JSON.stringify(rounds.map((round, index) => ({
      index,
      sharedQuestion: round.sharedQuestion,
      leftQuote: round.left,
      leftContext: round.leftContext || round.left,
      rightQuote: round.right,
      rightContext: round.rightContext || round.right
    })))}`
  });
  const parsed = parseJsonArray(result.content) || parseJsonArray(parseJsonObject(result.content)?.verdicts ? JSON.stringify(parseJsonObject(result.content).verdicts) : '');
  if (!Array.isArray(parsed)) {
    if (process.env.ZHIBIAN_DEBUG) console.error('[verifyOpposition] raw:', String(result.content).slice(0, 400));
    throw providerError('AI_UPSTREAM', 'AI 对立复核返回格式无效。');
  }
  const byIndex = new Map(parsed.filter(item => item && Number.isInteger(item.index)).map(item => [item.index, item]));
  const sides = ['支持', '反对'];
  const verdicts = rounds.map((_, index) => {
    const verdict = byIndex.get(index);
    return {
      opposed: verdict?.opposed === true,
      leftPosition: plainText(verdict?.leftPosition).slice(0, 20),
      rightPosition: plainText(verdict?.rightPosition).slice(0, 20),
      leftSide: sides.includes(plainText(verdict?.leftSide)) ? plainText(verdict.leftSide) : null,
      rightSide: sides.includes(plainText(verdict?.rightSide)) ? plainText(verdict.rightSide) : null,
      reason: plainText(verdict?.reason).slice(0, 60)
    };
  });
  return { verdicts, model: result.model };
}

export { defaultModel, fallbackModel };
