import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
// Absolute path verified by the installed official skill's status command.
const cli = process.env.ZHIHU_CLI_PATH || 'C:\\Users\\32390\\AppData\\Local\\ZhihuCLI\\current\\zhihu-cli.exe';

export async function searchZhihu(query) {
  return callCli(['search', 'zhihu', '--query', query, '--count', '10']);
}
export async function hotZhihu() {
  return callCli(['hot', '--limit', '20']);
}
async function callCli(args) {
  try {
    const { stdout } = await execute(cli, args, {
      windowsHide: true, timeout: 45000, maxBuffer: 3 * 1024 * 1024, encoding: 'utf8'
    });
    return JSON.parse(stdout.replace(/^\uFEFF/, ''));
  } catch (error) {
    // CLI may exit nonzero with a structured error. Never expose raw stdout/stderr.
    if (process.env.ZHIBIAN_DEBUG) console.error('[zhihu-cli]', {
      code: error.code, signal: error.signal, killed: error.killed,
      message: String(error.message).slice(0, 160),
      stdout: String(error.stdout || '').slice(0, 200), stderr: String(error.stderr || '').slice(0, 200)
    });
    for (const output of [error.stdout, error.stderr]) {
      try {
        const result = JSON.parse(output);
        if (result.Code !== undefined) return result;
        if (result.code === 'AUTH_REQUIRED' || result.error?.code === 'AUTH_REQUIRED') {
          return { Code: 20001 };
        }
      } catch { /* Non-JSON diagnostics stay server-side. */ }
    }
    if (error.code === 'ENOENT') return { Code: 'CLI_MISSING' };
    throw new Error('UPSTREAM_UNAVAILABLE');
  }
}

export function plainText(value) {
  return String(value ?? '').replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, key) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[key]))
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (match, number) => {
      const n = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }).trim();
}

function safeUrl(raw, image = false) {
  try {
    const url = new URL(raw);
    const domain = image ? 'zhimg.com' : 'zhihu.com';
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !(url.hostname === domain || url.hostname.endsWith('.' + domain))) return null;
    return url.href;
  } catch { return null; }
}

export function normalizeHotItems(result) {
  const seen = new Set();
  return (result.Data?.Items || []).flatMap((item, index) => {
    const sourceUrl = safeUrl(item.Url), title = plainText(item.Title);
    if (!sourceUrl || !title || seen.has(sourceUrl)) return [];
    seen.add(sourceUrl);
    return [{title, sourceUrl, rank: index + 1}];
  });
}

export function normalizeItems(result) {
  const seen = new Set();
  return (result.Data?.Items || []).flatMap(item => {
    const sourceUrl = safeUrl(item.Url);
    const text = plainText(item.ContentText);
    if (!sourceUrl || !text) return [];
    const url = new URL(sourceUrl);
    const id = url.pathname.match(/\/answer\/(\d+)/)?.[1] || url.pathname.match(/\/p\/(\d+)/)?.[1] || url.pathname;
    if (seen.has(id)) return [];
    seen.add(id);
    const author = plainText(item.AuthorName) || plainText(item.AuthorSignature);
    return [{ id, kind: 'zhihu', name: author || `知乎答主 #${id.slice(-6)}`,
      sourceTitle: plainText(item.Title).replace(/\s*-\s*知乎$/, ''), sourceUrl,
      text, originalText: text, avatarUrl: safeUrl(item.AuthorAvatar, true), badge: plainText(item.AuthorBadgeText),
      background: null, evidence: null,
      votes: Number.isFinite(item.VoteUpCount) ? item.VoteUpCount : null,
      editedAt: Number.isFinite(item.EditTime) ? new Date(item.EditTime * 1000).toISOString() : null
    }];
  });
}

function sourceMatchesTopic(config, source) {
  const terms = Array.isArray(config.relevanceTerms) ? config.relevanceTerms.filter(Boolean) : [];
  if (!terms.length) return true;
  const title = String(source.sourceTitle || '').toLocaleLowerCase();
  return terms.some(term => title.includes(String(term).toLocaleLowerCase()));
}

export function arrangeDebate(config, items) {
  const rounds = [], lenses = [], hosts = [], sharedQuestions = [], oppositions = [], roundIndexes = [], usedSources = new Set();
  config.selections.forEach((pair, index) => {
    const selected = pair.map(selection => {
      const s = items.find(item => item.id === selection.id && item.text.includes(selection.evidence) && sourceMatchesTopic(config, item));
      if (!s || usedSources.has(s.id)) return null;
      return { ...s, evidence: selection.evidence, title: selection.evidence,
        background: selection.background && s.text.includes(selection.background) ? selection.background : null,
        contextNote: selection.note || null };
    });
    if (selected.every(Boolean) && selected[0].name !== selected[1].name) {
      rounds.push(selected); lenses.push(config.lenses[index]); hosts.push(config.hosts[index]);
      sharedQuestions.push(config.sharedQuestions?.[index] || null);
      oppositions.push(config.oppositions?.[index] || null);
      // Which original round this is, so a dropped round does not renumber the rest.
      roundIndexes.push(index);
      selected.forEach(s => usedSources.add(s.id));
    }
  });
  const { selections, query, sharedQuestions: _shared, oppositions: _oppositions, ...meta } = config;
  return { ...meta, rounds, lenses, hosts, sharedQuestions, oppositions, roundIndexes, items, mode: rounds.length ? 'debate' : 'reading',
    missingSeats: 6 - rounds.length * 2,
    arrangement: config.autoArranged
      ? 'AI 自动编排：原句已与知乎返回的正文逐字校验，未通过校验的席位会被直接丢弃，不会用生成内容补位。这是观点对照，不是真人同场辩论。'
      : '人工核对的观点编排；非真人同场辩论；不同来源的语境可能不同。' };
}
