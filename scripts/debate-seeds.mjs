// Seed topics for 今日热辩. Produced once with the model at development time
// (not at runtime), so they cost nothing to keep around; each one still has to
// go through the same search -> filter -> arrange pipeline as a hot headline
// before it becomes a debate, and nothing is invented to fill it.
export const debateSeeds = [
  { topic: '彩礼该不该被取消', category: '情感与婚恋' },
  { topic: '伴侣的手机该不该随便看', category: '情感与婚恋' },
  { topic: '该不该为了爱情远嫁', category: '情感与婚恋' },
  { topic: '没买房该不该结婚', category: '情感与婚恋' },
  { topic: '该不该为了涨薪频繁跳槽', category: '职场与生存' },
  { topic: '高薪大厂和稳定编制该选哪个', category: '职场与生存' },
  { topic: '下班后该不该回工作消息', category: '职场与生存' },
  { topic: '年轻人该不该超前消费', category: '钱与消费' },
  { topic: '该不该为了省钱明显降低生活品质', category: '钱与消费' },
  { topic: '父母该不该帮忙带娃', category: '家庭与代际' },
  { topic: '该不该送父母去养老院', category: '家庭与代际' },
  { topic: '成年后该不该和父母分开住', category: '家庭与代际' },
  { topic: '孩子该不该从小上补习班', category: '教育与养娃' },
  { topic: '该不该为了孩子维持一段不幸福的婚姻', category: '教育与养娃' },
  { topic: '大城市一张床和小城市一套房该怎么选', category: '人生与选择' },
  { topic: '该不该裸辞去追一个不确定的梦想', category: '人生与选择' },
  { topic: '用 AI 写的东西算不算创作', category: '科技与 AI' },
  { topic: '该不该让孩子用 AI 写作业', category: '科技与 AI' },
  { topic: '经典该不该被反复翻拍', category: '影视与审美' },
  { topic: '看电影该不该先看评分再决定', category: '影视与审美' }
];
