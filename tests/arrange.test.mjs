// Verification rules for AI-arranged rounds. No network, no upstream calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { locateQuote, verifyArrangement, autoDebate, keepRounds } from '../scripts/arrange.mjs';

const item = (id, name, text) => ({ id, name, text, sourceTitle: '来源标题', sourceUrl: 'https://www.zhihu.com/question/1/answer/' + id, badge: '', votes: 3, editedAt: null, avatarUrl: null });
const pool = [
  item('1', '甲', '说实话，没有人给我开工资。但我依然享受在其中，乐在其中。'),
  item('2', '乙', '不是不爱孩子，恰恰是因为爱，才不敢轻易把自己全部牺牲进去。'),
  item('3', '丙', '可以，看自己的家庭条件和自己的选择。'),
  item('4', '丁', '这个问题，不管怎么选，都不需要扯什么母爱不母爱的角度。')
];
const round = (lens, a, b, sharedQuestion = '该不该这样做？') => ({ lens, sharedQuestion,
  host: '本回合比较两人的条件判断。', seats: [{ stance: '肯定', ...a }, { stance: '否定', ...b }] });

test('locateQuote returns the author\'s real text, not the model\'s spacing', () => {
  const text = '第一句话讲得很长。\n  第二句\n保留了换行。';
  assert.equal(locateQuote(text, '第一句话讲得很长。'), '第一句话讲得很长。');
  assert.equal(locateQuote(text, '第二句 保留了换行。'), '第二句\n保留了换行。');
  assert.equal(locateQuote(text, '这句话不在原文里'), null);
  assert.equal(locateQuote(text, '第一'), null, 'quotes below the minimum length are rejected');
});

test('a round is seated only when both quotes exist verbatim and differ', () => {
  const { rounds, lenses, sharedQuestions, dropped } = verifyArrangement({ items: pool, arrangement: { rounds: [
    round('分歧点', { id: '1', side: 0, evidence: '说实话，没有人给我开工资。' }, { id: '2', side: 1, evidence: '不是不爱孩子，恰恰是因为爱，才不敢轻易把自己全部牺牲进去。' })
  ] } });
  assert.equal(rounds.length, 1);
  assert.equal(dropped.length, 0);
  assert.equal(rounds[0][0].name, '甲');
  assert.equal(rounds[0][1].name, '乙');
  assert.equal(rounds[0][0].evidence, '说实话，没有人给我开工资。');
  assert.equal(lenses[0], '分歧点');
  assert.deepEqual(sharedQuestions, ['该不该这样做？']);
});

test('a pair without a shared question is treated as merely related, not opposed', () => {
  const { rounds, dropped } = verifyArrangement({ items: pool, arrangement: { rounds: [
    round('看起来相关', { id: '1', side: 0, evidence: '说实话，没有人给我开工资。' }, { id: '2', side: 1, evidence: '不是不爱孩子，恰恰是因为爱，才不敢轻易把自己全部牺牲进去。' }, ''),
    round('太短', { id: '3', side: 0, evidence: '可以，看自己的家庭条件和自己的选择。' }, { id: '4', side: 1, evidence: '这个问题，不管怎么选，都不需要扯什么母爱不母爱的角度。' }, '该不该')
  ] } });
  assert.equal(rounds.length, 0);
  assert.deepEqual(dropped, [{ round: 0, reason: 'NO_SHARED_QUESTION' }, { round: 1, reason: 'NO_SHARED_QUESTION' }]);
});

test('two answers landing on the same stance are not an opposition', () => {
  const sameStance = { lens: '看着像对立', sharedQuestion: '该不该这样做？', host: 'x', seats: [
    { stance: '否定', id: '1', side: 0, evidence: '说实话，没有人给我开工资。' },
    { stance: '否定', id: '2', side: 1, evidence: '不是不爱孩子，恰恰是因为爱，才不敢轻易把自己全部牺牲进去。' }] };
  const missing = { lens: '没表态', sharedQuestion: '该不该这样做？', host: 'x', seats: [
    { id: '3', side: 0, evidence: '可以，看自己的家庭条件和自己的选择。' },
    { stance: '否定', id: '4', side: 1, evidence: '这个问题，不管怎么选，都不需要扯什么母爱不母爱的角度。' }] };
  const { rounds, dropped } = verifyArrangement({ items: pool, arrangement: { rounds: [sameStance, missing] } });
  assert.equal(rounds.length, 0, 'agreeing answers must not be presented as opposing sides');
  assert.deepEqual(dropped, [{ round: 0, reason: 'STANCE_NOT_OPPOSED' }, { round: 1, reason: 'STANCE_NOT_OPPOSED' }]);
});

test('a paraphrased quote is dropped instead of shown as the author\'s words', () => {  const { rounds, dropped } = verifyArrangement({ items: pool, arrangement: { rounds: [
    round('分歧点', { id: '1', side: 0, evidence: '答主说自己没有工资但很享受' }, { id: '2', side: 1, evidence: '不是不爱孩子，恰恰是因为爱，才不敢轻易把自己全部牺牲进去。' })
  ] } });
  assert.equal(rounds.length, 0);
  assert.deepEqual(dropped, [{ round: 0, reason: 'QUOTE_NOT_VERBATIM' }]);
});

test('unknown sources, reused sources and same-author pairs never reach the arena', () => {
  const unknown = verifyArrangement({ items: pool, arrangement: { rounds: [round('a', { id: '999', side: 0, evidence: '说实话，没有人给我开工资。' }, { id: '2', side: 1, evidence: '不是不爱孩子，恰恰是因为爱，才不敢轻易把自己全部牺牲进去。' })] } });
  assert.deepEqual(unknown.dropped, [{ round: 0, reason: 'UNKNOWN_SOURCE' }]);
  const reused = verifyArrangement({ items: pool, arrangement: { rounds: [
    round('a', { id: '1', side: 0, evidence: '说实话，没有人给我开工资。' }, { id: '2', side: 1, evidence: '不是不爱孩子，恰恰是因为爱，才不敢轻易把自己全部牺牲进去。' }),
    round('b', { id: '1', side: 0, evidence: '但我依然享受在其中，乐在其中。' }, { id: '3', side: 1, evidence: '可以，看自己的家庭条件和自己的选择。' })
  ] } });
  assert.equal(reused.rounds.length, 1);
  assert.deepEqual(reused.dropped, [{ round: 1, reason: 'DUPLICATE_SOURCE' }]);
  const sameAuthor = verifyArrangement({ items: [item('1', '甲', '可以，看自己的家庭条件和自己的选择。'), item('2', '甲', '不是不爱孩子，恰恰是因为爱，才不敢轻易把自己全部牺牲进去。')], arrangement: { rounds: [
    round('a', { id: '1', side: 0, evidence: '可以，看自己的家庭条件和自己的选择。' }, { id: '2', side: 1, evidence: '不是不爱孩子，恰恰是因为爱，才不敢轻易把自己全部牺牲进去。' })
  ] } });
  assert.deepEqual(sameAuthor.dropped, [{ round: 0, reason: 'SAME_AUTHOR' }]);
});

test('sides must actually be opposed and every round needs exactly two seats', () => {
  const oneSided = verifyArrangement({ items: pool, arrangement: { rounds: [
    round('a', { id: '1', side: 0, evidence: '说实话，没有人给我开工资。' }, { id: '2', side: 0, evidence: '不是不爱孩子，恰恰是因为爱，才不敢轻易把自己全部牺牲进去。' })
  ] } });
  assert.deepEqual(oneSided.dropped, [{ round: 0, reason: 'SIDES_NOT_OPPOSED' }]);
  const short = verifyArrangement({ items: pool, arrangement: { rounds: [{ lens: 'a', host: 'x', seats: [{ id: '1', side: 0, evidence: '说实话，没有人给我开工资。' }] }] } });
  assert.deepEqual(short.dropped, [{ round: 0, reason: 'INCOMPLETE_ROUND' }]);
});

test('autoDebate reports a reading payload when no round survives', () => {
  const payload = autoDebate({ query: '该不该辞职全职带娃', items: pool, arrangement: null });
  assert.equal(payload.id, 'q:该不该辞职全职带娃');
  assert.equal(payload.autoArranged, true);
  assert.equal(payload.mode, 'reading');
  assert.equal(payload.rounds.length, 0);
  assert.equal(payload.category, '自由辩题');
  assert.deepEqual(payload.titleLines, ['该不该辞职全职带娃']);
  assert.equal(payload.missingSeats, 6);
  assert.match(payload.arrangement, /不编造对立/);
  assert.match(payload.notice, /没有形成稳定的两方对照/);
  assert.equal(payload.questions.length, 2);
});

test('autoDebate labels the arrangement as AI-generated and keeps the drop log', () => {
  const payload = autoDebate({ query: '该不该辞职全职带娃', items: pool, model: 'deepseek-flash', arrangement: {
    intro: '条件不同，结论不同。', left: '愿意先全职', right: '倾向留职',
    questions: ['谁的替代照护更可靠？'],
    rounds: [
      round('分歧点', { id: '1', side: 0, evidence: '说实话，没有人给我开工资。' }, { id: '2', side: 1, evidence: '不是不爱孩子，恰恰是因为爱，才不敢轻易把自己全部牺牲进去。' }),
      round('凑数的', { id: '3', side: 0, evidence: '可以，看自己的家庭条件和自己的选择。' }, { id: '4', side: 1, evidence: '这句是编的' })
    ]
  } });
  assert.equal(payload.mode, 'debate');
  assert.equal(payload.rounds.length, 1);
  assert.equal(payload.left, '愿意先全职');
  assert.equal(payload.right, '倾向留职');
  assert.match(payload.arrangement, /AI 自动编排/);
  assert.deepEqual(payload.questions, ['谁的替代照护更可靠？']);
  assert.equal(payload.verification.checked, 2);
  assert.deepEqual(payload.verification.dropped, [{ round: 1, reason: 'QUOTE_NOT_VERBATIM' }]);
});

test('a judge that restates both sides the same way is overruled', () => {
  const payload = { rounds: [[{ name: '甲' }, { name: '乙' }]], lenses: ['x'], hosts: ['y'], sharedQuestions: ['该不该？'], mode: 'debate', verification: { dropped: [] }, notice: null };
  const same = keepRounds(payload, [{ opposed: true, leftPosition: '弊大于利', rightPosition: '弊大于利。', reason: '看起来相反' }]);
  const sameSide = keepRounds(payload, [{ opposed: true, leftPosition: '反对利大于弊', rightPosition: '弊大于利', leftSide: '反对', rightSide: '反对', reason: '措辞不同但同边' }]);
  assert.equal(sameSide.rounds.length, 0, 'two sides the judge itself marks 反对 must not pass');
  assert.equal(same.rounds.length, 0, 'ticking "opposed" while describing both sides identically must not pass');
  assert.equal(same.mode, 'reading');
  assert.ok(same.verification.dropped.some(d => d.reason === 'NOT_REALLY_OPPOSED'));
  const different = keepRounds(payload, [{ opposed: true, leftPosition: '弊大于利', rightPosition: '利大于弊', leftSide: '反对', rightSide: '支持', reason: '相反' }]);
  assert.equal(different.rounds.length, 1);
  assert.deepEqual(different.oppositions, [{ left: '弊大于利', right: '利大于弊' }]);
  const vetoed = keepRounds(payload, [{ opposed: false, leftPosition: '都反对', rightPosition: '都反对', reason: '同向' }]);
  assert.equal(vetoed.rounds.length, 0);
});
