// Onboarding tour: bubble placement and step content. Layout itself needs a
// real browser; these checks cover the pure parts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { placeTip, tours, DEMO_TOPIC_ID } from '../web/tour.js';

const viewport = { width: 1280, height: 800 };
const tip = { width: 360, height: 220 };

test('bubble sits under the frame when there is room, arrow aimed at its centre', () => {
  const box = { left: 100, top: 100, width: 200, height: 60 };
  const place = placeTip(box, tip, viewport, 'bottom');
  assert.equal(place.side, 'bottom');
  assert.equal(place.top, 100 + 60 + 16);
  assert.equal(place.left + place.arrow, 200, 'arrow points at the frame centre');
});

test('bubble flips above when the frame is near the bottom of the screen', () => {
  const place = placeTip({ left: 400, top: 650, width: 300, height: 80 }, tip, viewport, 'bottom');
  assert.equal(place.side, 'top');
  assert.ok(place.top + tip.height <= 650);
});

test('side placement is honoured when it fits, and falls back when it does not', () => {
  assert.equal(placeTip({ left: 80, top: 200, width: 500, height: 300 }, tip, viewport, 'right').side, 'right');
  // No room on the right, and too tall for above/below: the bubble goes left.
  assert.equal(placeTip({ left: 900, top: 100, width: 360, height: 600 }, tip, viewport, 'right').side, 'left');
});

test('a frame taller than the screen gets a floating bubble without an arrow', () => {
  const place = placeTip({ left: 8, top: 4, width: 384, height: 792 }, { width: 376, height: 240 }, { width: 400, height: 800 }, 'bottom');
  assert.equal(place.side, 'float');
  assert.equal(place.arrow, null);
  assert.ok(place.top + 240 <= 800);
});

test('on a phone the bubble stays inside the screen and the arrow stays on the bubble', () => {
  const phone = { width: 400, height: 800 }, narrow = { width: 376, height: 200 };
  const place = placeTip({ left: 330, top: 60, width: 60, height: 30 }, narrow, phone, 'bottom');
  assert.ok(place.left >= 12 && place.left + narrow.width <= phone.width - 12 + 0.001);
  assert.ok(place.arrow >= 22 && place.arrow <= narrow.width - 22);
});

test('every page tour has titled steps and at least one element to point at', () => {
  for (const [name, steps] of Object.entries(tours)) {
    assert.ok(steps.length >= 3, name);
    assert.ok(steps.some(step => step.target), name + ' points at something');
    for (const step of steps) {
      assert.ok(step.title, name);
      assert.ok(step.body || step.list, name + ': ' + step.title);
    }
  }
  assert.ok(!tours.lobby[0].target, 'the home tour opens with a welcome');
  assert.equal(typeof tours.lobby.at(-1).action.run, 'function', 'the home tour ends by offering a debate');
  assert.match(tours.lobby.at(-1).action.label, /该不该要彩礼/, 'the demo debate is the bride-price one');
  assert.match(DEMO_TOPIC_ID, /^auto-[0-9a-f]+$/);
});

test('tour copy keeps the product promises: AI simulates, never rules', () => {
  const text = JSON.stringify(tours.debate);
  assert.match(text, /AI 模拟/);
  assert.match(text, /不是答主本人/);
  assert.doesNotMatch(text, /AI 判断谁对|找到真相/);
});

test('the page loads the tour script and stylesheet', async () => {
  const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.match(html, /tour\.js/);
  assert.match(html, /tour\.css/);
});
