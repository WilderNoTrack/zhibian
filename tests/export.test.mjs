// The downloadable debate document: complete, escaped and script-free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { debateDocument, debateBody, exportFileName } from '../web/export.js';

const seat = (id, name, evidence, extra = {}) => ({
  id, name, evidence, badge: '', votes: 12, editedAt: '2026-09-03T08:00:00Z',
  sourceUrl: `https://www.zhihu.com/question/1/answer/${id}`, text: '回答正文' + evidence, ...extra
});
const debate = {
  id: 'auto-1', autoArranged: true, category: '情感与婚恋', title: '该不该要彩礼<script>alert(1)</script>',
  intro: '彩礼是诚意还是旧俗？', left: '彩礼该要', right: '彩礼不该要',
  lenses: ['彩礼是否合理', '是不是卖女儿'], hosts: ['一方认为合理，一方认为不合理。', ''],
  sharedQuestions: ['彩礼该不该要', '要彩礼是不是卖女儿'],
  questions: ['两边各自成立的前提是什么？'],
  rounds: [
    [seat('11', '甲', '合理要彩礼合情合理', { stance: '肯定', badge: '律师' }), seat('12', '乙', '彩礼毫无合理性', { stance: '否定' })],
    [seat('21', '丙', '要彩礼与卖女儿无关'), seat('22', '丁" onmouseover="x', '收彩礼就是卖女儿', { contextNote: '只呈现这条回答里关于嫁妆的判断。' })]
  ],
  items: new Array(9).fill({}), fetchedAt: '2026-09-15T06:00:00Z',
  arrangement: 'AI 自动编排：原句已逐字校验。'
};
const summaries = new Map([
  ['11', { summary: '第一句。第二句。', model: 'deepseek-v4-pro' }],
  ['12', { summary: '只有一句。', model: 'deepseek-flash' }]
]);

test('the document holds every round, both sides, quotes, summaries and source links', () => {
  const html = debateDocument(debate, { summaries, css: '.zb-export{color:red}', exportedAt: new Date('2026-09-15T08:00:00Z'), pageUrl: 'https://zhibian.wildernotrack.me/debate?id=auto-1' });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<style>\.zb-export\{color:red\}<\/style>/);
  assert.equal((html.match(/class="zb-round"/g) || []).length, 2);
  assert.equal((html.match(/class="zb-answer (left|right)"/g) || []).length, 4);
  for (const quote of ['合理要彩礼合情合理', '彩礼毫无合理性', '要彩礼与卖女儿无关', '收彩礼就是卖女儿']) assert.ok(html.includes(quote), quote);
  assert.match(html, /第一句。<br>第二句。/, 'one sentence per line');
  assert.match(html, /AI 观点摘要 · deepseek-v4-pro（阅读辅助，不是答主原话）/);
  assert.equal((html.match(/AI 摘要暂未生成/g) || []).length, 2, 'missing summaries are marked, not invented');
  assert.equal((html.match(/在知乎查看原文/g) || []).length, 5, 'four seat links plus the footer mention');
  assert.match(html, /这回合两人回答的是同一个问题：<b>彩礼该不该要<\/b>/);
  assert.match(html, /AI 判定这一方：肯定/);
  assert.match(html, /只呈现这条回答里关于嫁妆的判断/);
  assert.match(html, /两边各自成立的前提是什么？/);
  assert.match(html, /在线查看这场辩论：<a href="https:\/\/zhibian\.wildernotrack\.me\/debate\?id=auto-1">/);
  assert.match(html, /版权归原作者所有/);
});

test('external text is escaped and the document carries no script', () => {
  const html = debateDocument(debate, { summaries, css: 'a{} </style><script>bad()</script>' });
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /onmouseover="x/);
  assert.match(html, /该不该要彩礼&lt;script&gt;/);
});

test('the print view uses the same body without a document wrapper', () => {
  const body = debateBody(debate, { summaries });
  assert.match(body, /^<article class="zb-export">/);
  assert.doesNotMatch(body, /<html|<head[\s>]|<style/);
});

test('file names are safe on every platform', () => {
  const date = new Date(2026, 8, 15);
  assert.equal(exportFileName('该不该要彩礼？/ "测试" <x>', date, 'html'), '知辨-该不该要彩礼？测试x-20260915.html');
  assert.equal(exportFileName('', date, 'pdf'), '知辨-辩论-20260915.pdf');
  assert.ok(exportFileName('长'.repeat(80), date).length < 60);
});

test('the site loads the export stylesheet, which carries the print hand-off', async () => {
  const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.match(html, /export\.css/);
  const css = await readFile(new URL('../web/export.css', import.meta.url), 'utf8');
  assert.match(css, /body\.zb-printing > :not\(\.zb-export-print\)/);
  assert.match(css, /@page/);
});
