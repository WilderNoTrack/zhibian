// Turns an AI arrangement into seats, but only after every quote is re-checked
// against the real answer text. A seat that fails verification is dropped, never
// replaced with generated text.
import { plainText } from './zhihu.mjs';

const MIN_QUOTE = 6;
const MAX_QUOTE = 300;

function compact(value) {
  return String(value ?? '').replace(/\s+/g, '');
}

/**
 * Returns the exact slice of `text` that the quote refers to, or null.
 * A loosely-spaced quote is recovered by locating it on the whitespace-stripped
 * text and mapping the match back onto the original string, so the displayed
 * quote is always the author's real text rather than the model's rendering.
 */
export function locateQuote(text, quote) {
  const source = String(text ?? '');
  const raw = String(quote ?? '').trim();
  if (!source || raw.length < MIN_QUOTE || raw.length > MAX_QUOTE) return null;
  const direct = source.indexOf(raw);
  if (direct !== -1) return source.slice(direct, direct + raw.length);
  const compactSource = compact(source), compactQuote = compact(raw);
  if (compactQuote.length < MIN_QUOTE || compactQuote.length > MAX_QUOTE) return null;
  const hit = compactSource.indexOf(compactQuote);
  if (hit === -1) return null;
  const offsets = [];
  for (let i = 0; i < source.length; i++) if (!/\s/.test(source[i])) offsets.push(i);
  const start = offsets[hit], end = offsets[hit + compactQuote.length - 1];
  if (start === undefined || end === undefined) return null;
  return source.slice(start, end + 1);
}

const MIN_SHARED_QUESTION = 4;
const AFFIRMATIVE = '肯定';
const NEGATIVE = '否定';

export function verifyArrangement({ items, arrangement }) {
  const byId = new Map((items || []).map(item => [item.id, item]));
  const rounds = [], lenses = [], hosts = [], sharedQuestions = [], dropped = [];
  const used = new Set();
  const rawRounds = Array.isArray(arrangement?.rounds) ? arrangement.rounds : [];
  rawRounds.forEach((round, index) => {
    const seats = (Array.isArray(round?.seats) ? round.seats : []).map(seat => {
      const item = byId.get(String(seat?.id ?? '').trim());
      if (!item) { dropped.push({ round: index, reason: 'UNKNOWN_SOURCE' }); return null; }
      if (used.has(item.id)) { dropped.push({ round: index, reason: 'DUPLICATE_SOURCE' }); return null; }
      const evidence = locateQuote(item.text, seat?.evidence);
      if (!evidence) { dropped.push({ round: index, reason: 'QUOTE_NOT_VERBATIM' }); return null; }
      return { ...item, evidence, title: evidence, side: Number(seat?.side) === 1 ? 1 : 0,
        stance: plainText(seat?.stance).slice(0, 6) || null,
        contextNote: plainText(seat?.reason).slice(0, 160) || null };
    });
    if (seats.length !== 2) { dropped.push({ round: index, reason: 'INCOMPLETE_ROUND' }); return; }
    if (!seats.every(Boolean)) return;
    const left = seats.find(seat => seat.side === 0), right = seats.find(seat => seat.side === 1);
    if (!left || !right) { dropped.push({ round: index, reason: 'SIDES_NOT_OPPOSED' }); return; }
    if (left.name === right.name) { dropped.push({ round: index, reason: 'SAME_AUTHOR' }); return; }
    // A round only counts as an opposition if the model can name the one question
    // both answers are deciding. If it cannot, the pair is merely related.
    const shared = plainText(round?.sharedQuestion).slice(0, 60);
    if (shared.length < MIN_SHARED_QUESTION) { dropped.push({ round: index, reason: 'NO_SHARED_QUESTION' }); return; }
    // And the two answers must land on opposite answers to it. This is the
    // deterministic check against "both sides actually agree".
    const opposed = (left.stance === AFFIRMATIVE && right.stance === NEGATIVE)
      || (left.stance === NEGATIVE && right.stance === AFFIRMATIVE);
    if (!opposed) { dropped.push({ round: index, reason: 'STANCE_NOT_OPPOSED' }); return; }
    used.add(left.id); used.add(right.id);
    rounds.push([left, right]);
    sharedQuestions.push(shared);
    lenses.push(plainText(round?.lens).slice(0, 40) || shared);
    hosts.push(plainText(round?.host).slice(0, 200) || '本回合保留两位答主的原始表达与各自前提。');
  });
  return { rounds, lenses, hosts, sharedQuestions, dropped };
}

// Drops rounds the independent judge rejected, keeping the per-round labels
// aligned and recording why. A payload with no rounds left reads as reading.
// The quote plus a window of the text around it. A quote can read as one stance
// on its own while the surrounding sentences reverse it ("一群人说…但我不同意"),
// so the judge has to see the context to rule on it.
export function contextAround(text, evidence, radius = 140) {
  const source = String(text ?? ''), quote = String(evidence ?? '');
  const at = source.indexOf(quote);
  if (at < 0) return '';
  const start = Math.max(0, at - radius), end = Math.min(source.length, at + quote.length + radius);
  return `${start > 0 ? '…' : ''}${source.slice(start, end).replace(/\s+/g, ' ')}${end < source.length ? '…' : ''}`;
}

// The judge is asked to restate each side in words *and* to commit to a binary
// side. Two deterministic checks follow from that, so the round does not survive
// on the judge's checkbox alone:
//   - the two restatements must not read the same, and
//   - the two committed sides must actually differ.
// A judge that ticks "opposed" while describing both authors as agreeing is the
// failure mode this catches without having to trust the tick.
export function judgeVerdicts(verdicts) {
  const normalize = value => String(value ?? '').replace(/[\s，。、,.]/g, '');
  return verdicts.map(verdict => {
    const sameWords = normalize(verdict.leftPosition) !== ''
      && normalize(verdict.leftPosition) === normalize(verdict.rightPosition);
    const sameSide = Boolean(verdict.leftSide) && verdict.leftSide === verdict.rightSide;
    const rejected = verdict.opposed !== true || sameWords || sameSide;
    const reason = verdict.opposed !== true ? verdict.reason
      : sameSide ? '裁判给出的一侧立场相同'
        : sameWords ? '两侧复述出来的立场相同' : verdict.reason;
    return { ...verdict, opposed: !rejected, reason };
  });
}

export function keepRounds(payload, rawVerdicts) {
  const verdicts = judgeVerdicts(rawVerdicts);
  const keep = payload.rounds.map((_, index) => verdicts[index]?.opposed === true);
  if (keep.every(Boolean)) return { ...payload, oppositions: verdicts.map(v => ({ left: v.leftPosition, right: v.rightPosition })) };
  const kept = payload.rounds.map((_, index) => index).filter(index => keep[index]);
  const rejected = payload.rounds.map((_, index) => index).filter(index => !keep[index])
    .map(index => ({ round: index, reason: 'NOT_REALLY_OPPOSED' }));
  return {
    ...payload,
    rounds: kept.map(index => payload.rounds[index]),
    lenses: kept.map(index => payload.lenses[index]),
    hosts: kept.map(index => payload.hosts[index]),
    sharedQuestions: kept.map(index => payload.sharedQuestions[index]),
    oppositions: kept.map(index => ({ left: verdicts[index].leftPosition, right: verdicts[index].rightPosition })),
    mode: kept.length ? payload.mode : 'reading',
    missingSeats: 6 - kept.length * 2,
    notice: kept.length ? payload.notice : '这组回答之间没有形成真正的两方对立，先按原观点阅读。',
    verification: { ...payload.verification, dropped: [...(payload.verification?.dropped || []), ...rejected] }
  };
}

// Free questions are addressed as q:<query> until they are stored, when they
// become auto-<hash>. Kept in one place so callers key their caches the same way.
export const freeTopicId = query => 'q:' + query;

export function autoDebate({ query, items = [], arrangement = null, model = null }) {
  const { rounds, lenses, hosts, sharedQuestions, dropped } = verifyArrangement({ items, arrangement });
  const pick = (value, max, fallback) => plainText(value).slice(0, max) || fallback;
  const questions = (Array.isArray(arrangement?.questions) ? arrangement.questions : [])
    .map(question => plainText(question).slice(0, 60)).filter(Boolean).slice(0, 3);
  const arrangementNote = rounds.length
    ? 'AI 自动编排：每个席位的原句都已与知乎返回的正文逐字校验，未通过校验的席位会被直接丢弃，不会用生成内容补位。这是观点对照，不是真人同场辩论。'
    : 'AI 未能从这组回答里整理出稳定的两方对照，因此不编造对立，先按观点原文阅读。';
  return {
    id: freeTopicId(query), autoArranged: true, query,
    // The model may polish the wording into a sharper, more adversarial title;
    // the original wording is kept in `title` either way.
    debateTitle: plainText(arrangement?.debateTitle).slice(0, 24) || null,
    category: plainText(arrangement?.category) || '自由辩题',
    title: query, titleLines: [query],
    intro: pick(arrangement?.intro, 120, '由 AI 从知乎搜索结果中编排的一场观点对照。'),
    label: pick(arrangement?.intro, 120, '由 AI 从知乎搜索结果中编排的一场观点对照。'),
    left: pick(arrangement?.left, 20, '一种判断'),
    right: pick(arrangement?.right, 20, '另一种判断'),
    leftShort: pick(arrangement?.left, 12, '一种判断'),
    rightShort: pick(arrangement?.right, 12, '另一种判断'),
    lenses, hosts, sharedQuestions, rounds, items, model,
    notice: rounds.length ? null
      : items.length ? '这组回答之间没有形成稳定的两方对照，先按原观点阅读。'
        : '这次没有找到与这个问题直接相关的观点，换一个更具体的说法再试。',
    mode: rounds.length ? 'debate' : 'reading',
    missingSeats: 6 - rounds.length * 2,
    verification: { checked: Array.isArray(arrangement?.rounds) ? arrangement.rounds.length : 0, dropped },
    questions: questions.length ? questions : ['两边各自成立的前提是什么？', '这组回答遗漏了什么条件？'],
    arrangement: arrangementNote
  };
}
