// Drift check for the hand-curated debates.
//
// Every curated topic is supposed to open as a complete three-round debate. Its
// sources are re-checked against a live Zhihu search on every open, and the
// search only ever returns 10 results — so when an answer slips out of that
// window, the topic silently loses a round. This walks all of them and says
// which ones stopped being complete, and why.
//
//   node scripts/audit-curated.mjs            # uses http://127.0.0.1:5173
//   PORT=5175 node scripts/audit-curated.mjs
//
// Run it with the server up: it goes through the same API the interface uses,
// so it also refreshes data/topic-health.json (which is what the lobby reads to
// decide whether a slide is safe to feature).
import { catalog } from './catalog.mjs';

const port = process.env.PORT || 5173;
const base = `http://127.0.0.1:${port}`;
const expected = 3;

let blocked = false;
const rows = [];
for (const topic of catalog) {
  let data;
  try { data = await (await fetch(`${base}/api/debate?id=${topic.id}`)).json(); }
  catch (error) { rows.push({ id: topic.id, rounds: null, why: `请求失败：${error.message}` }); continue; }
  if (data.code) {
    rows.push({ id: topic.id, rounds: null, why: data.code });
    if (data.code === 'RATE_LIMIT') { blocked = true; break; }
    continue;
  }
  const byId = new Map(data.items.map(item => [item.id, item]));
  const why = [];
  topic.selections.forEach((pair, index) => {
    const missing = pair.map(seat => {
      const item = byId.get(seat.id);
      if (!item) return '来源已不在搜索结果里';
      if (!item.text.includes(seat.evidence)) return '引句已不在正文里';
      return null;
    }).filter(Boolean);
    if (missing.length) why.push(`回合${index + 1}：${[...new Set(missing)].join('、')}`);
  });
  rows.push({ id: topic.id, rounds: data.rounds.length, why });
}

const ok = rows.filter(row => row.rounds === expected);
const short = rows.filter(row => typeof row.rounds === 'number' && row.rounds < expected);
const failed = rows.filter(row => row.rounds === null);

console.log(`常驻辩题巡检：${ok.length}/${rows.length} 完整`);
for (const row of short) {
  console.log(`✗ ${row.id}：只有 ${row.rounds} 个回合`);
  row.why.forEach(line => console.log(`    ${line}`));
}
for (const row of failed) console.log(`? ${row.id}：未能判定（${row.why}）`);
if (blocked) console.log('\n中途遇到限流，结果不完整 —— 稍后重跑。');

if (short.length) {
  console.log('\n这些题目的来源已经漂出搜索结果。服务端现在会用模型给出的多个关键词分别搜索再合并');
  console.log('（每个关键词最多 10 条），所以多数漂移能被找回来；仍然缺失的，只能重新挑选那一回合的来源。');
  console.log('长期建议：常驻题配置里补存每个席位的 sourceUrl，这样还能用 question answers 兜底。');
}
