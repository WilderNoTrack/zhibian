// Editorial arrangements, reviewed against official API excerpts on 2026-09-14.
// No answer text is synthesized: a seat only appears if its exact evidence still exists.
import { extraCatalog } from './catalog-extra.mjs';
import { roundsById } from './curated-rounds.mjs';
import { topicIds } from '../web/topic-ids.js';
const originalCatalog = [
  {
    id: 'parenting', query: '该不该辞职全职带娃', category: '家庭与代际',
    title: '该不该辞掉工作，专心带娃？', titleLines: ['该不该辞掉工作，', '专心带娃？'],
    intro: '陪伴的价值，与职业中断的代价。听听真实经历里的不同选择。',
    label: '陪伴与自我，如何两全', left: '愿意阶段性全职', right: '倾向保留工作',
    leftShort: '有条件地选择全职', rightShort: '看重职业与独立',
    lenses: ['选择理由', '亲身经历', '现实条件'],
    hosts: ['有人享受全职陪伴，有人担忧牺牲自我。不同回答来自不同家庭，不能直接互换结论。', '没有长辈帮忙的家庭，也可能选择完全不同的照护方式。', '照护是否可靠，与工作是否值得保留，需要放在具体条件里比较。'],
    questions: ['有没有可靠的替代照护？', '职业中断和家庭支出，分别由谁承担？', '作出选择的人，是否保有调整的余地？'],
    selections: [
      [
        { id: '2078831272391075654', evidence: '说实话，没有人给我开工资。但我依然享受在其中，乐在其中。', background: '我自己，曾经是有一份工作的，而且说起来还不错，事业编的教师。但为了孩子。为了不在两地生活，我选择了辞职全职带着他们。' },
        { id: '2078402735305762660', evidence: '不是不爱孩子，恰恰是因为爱，才不敢轻易把自己全部牺牲进去。' }
      ],
      [
        { id: '2075350106732224981', evidence: '可以，看自己的家庭条件和自己的选择。', background: '我是全职带娃，产假结束就没去上班了，现在一个人带娃，老公一个人上班养我们两个。' },
        { id: '2077701953874814493', evidence: '这个问题，不管怎么选，都不需要扯什么母爱不母爱的角度，直接从家庭利益角度出发做选择。', background: '一岁多的孩子送去幼托中心，我还是照常上班，晚上接回来夫妻俩一起照看。' }
      ],
      [
        { id: '2078753903634540148', evidence: '3、没人帮衬，或者帮衬的人并不专业，那就全职带娃 ，自己上手。', note: '这条回答同时支持“有可靠帮手时上班”。本席位仅呈现其对缺少可靠照护时的条件判断。' },
        { id: '2034279333792044550', evidence: '以一个过来人的经验建议你，不到万不得已，千万不要辞掉还不错的工作，千万不要全职在家带孩子。', background: '但我坚持住了，一直工作，很庆幸自己的坚持。' }
      ]
    ]
  },
  {
    id: 'career', query: '第一份工作 高薪 成长', category: '职场与生存',
    title: '第一份工作，先收入还是先成长？', titleLines: ['第一份工作，', '先收入还是先成长？'],
    intro: '先让自己站稳，还是把成长排在第一位？两条真实回答的选择依据。',
    label: '先争取收入，还是先积累', left: '先满足生存与独立', right: '成长空间放在首位',
    leftShort: '先立足，再权衡', rightShort: '成长优先', lenses: ['选择依据'],
    hosts: ['这里比较的是优先顺序，而不是把高薪和成长说成不能兼得。'],
    questions: ['收入能否覆盖基本生活？', '岗位是否有可验证的成长机会？', '两条回答的前提与你的情况一样吗？'],
    selections: roundsById.career
  }
];
const featuredCatalog = [{
  id: 'today-hot', featured: true, featuredDate: '2026-09-14', query: '胖东来 四年 学员制 招工', category: '今日热辩',
  title: '胖东来四年学员制，是培养人才还是一种用工策略？', titleLines: ['胖东来四年学员制，', '是培养人才还是用工策略？'],
  intro: '它在当天知乎热榜出现。三轮观点，讨论“学员”二字背后的承诺与风险。',
  label: '四年之后，走向社会还是被提前安排离场？', left: '更像人才培养', right: '警惕用工包装',
  leftShort: '人才培养的尝试', rightShort: '用工风险的提醒',
  lenses: ['第一回合 · 出发点', '第二回合 · 制度风险', '第三回合 · 员工处境'],
  hosts: [
    '一边将它理解为面向零售行业的人才培养，另一边要求先看合同到期后的员工保障。',
    '第二回合讨论的是制度设计的后果，而不是把企业动机简单归为单一答案。',
    '第三回合保留支持者和质疑者的不同判断，原文可追溯。'
  ],
  questions: ['“学员制”承诺了什么，未承诺什么？', '合同期限与培养目标如何同时成立？', '哪一边的前提更需要被验证？'],
  selections: roundsById['today-hot'], reviewedAt: '2026-09-14', addedAt: '2026-09-14'
}];
export const catalog = [...originalCatalog, ...extraCatalog, ...featuredCatalog].sort((a,b) => topicIds.indexOf(a.id) - topicIds.indexOf(b.id));
export const publicCatalog = catalog.map(({ selections, query, hosts, lenses, questions, ...meta }) => ({
  ...meta, reviewedAt: meta.reviewedAt || '2026-09-14', editorialMode: selections.length ? 'debate' : 'reading',
  reviewedPairs: selections.length
}));
