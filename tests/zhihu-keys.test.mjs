// A supplementary Zhihu credential takes over when the primary one is out of
// quota or not authorised.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { searchZhihu, hotZhihu, useCliRunner } from '../scripts/zhihu.mjs';

const ok = { Code: 0, Data: { Items: [] } };
const MINUTE = 60 * 1000;
const saved = { primary: process.env.ZHIHU_ACCESS_SECRET, secondary: process.env.ZHIHU_ACCESS_SECRET_2 };
function setSecrets(primary, secondary) {
  if (primary === undefined) delete process.env.ZHIHU_ACCESS_SECRET; else process.env.ZHIHU_ACCESS_SECRET = primary;
  if (secondary === undefined) delete process.env.ZHIHU_ACCESS_SECRET_2; else process.env.ZHIHU_ACCESS_SECRET_2 = secondary;
}
afterEach(() => { setSecrets(saved.primary, saved.secondary); useCliRunner(null); });

// A fake CLI that answers per secret and records which secret each call used.
function fakeCli(answers, clock) {
  const calls = [];
  useCliRunner(async (args, env) => {
    calls.push({ secret: env.ZHIHU_ACCESS_SECRET, args });
    return { stdout: JSON.stringify(answers(env.ZHIHU_ACCESS_SECRET, args)) };
  }, { clock });
  return calls;
}

test('a quota-limited primary falls back to the supplementary credential', async () => {
  setSecrets('primary-secret', 'second-secret');
  let now = 0;
  const calls = fakeCli(secret => (secret === 'primary-secret' ? { Code: 30001 } : ok), () => now);
  assert.equal((await hotZhihu()).Code, 0);
  assert.deepEqual(calls.map(c => c.secret), ['primary-secret', 'second-secret']);
  assert.ok(calls.every(c => !c.args.includes('primary-secret') && !c.args.includes('second-secret')), 'secrets never go on the command line');

  calls.length = 0; now = 5 * MINUTE;
  await hotZhihu();
  assert.deepEqual(calls.map(c => c.secret), ['second-secret'], 'the exhausted one waits its turn for a while');

  calls.length = 0; now = 11 * MINUTE;
  await hotZhihu();
  assert.equal(calls[0].secret, 'primary-secret', 'tried first again after ten minutes');
});

test('each API keeps its own record: a hot-list limit does not reorder search', async () => {
  setSecrets('primary-secret', 'second-secret');
  const calls = fakeCli((secret, args) => (args[0] === 'hot' && secret === 'primary-secret' ? { Code: 30001 } : ok), () => 0);
  await hotZhihu();
  calls.length = 0;
  assert.equal((await searchZhihu('彩礼')).Code, 0);
  assert.deepEqual(calls.map(c => c.secret), ['primary-secret']);
});

test('an unauthorised primary also falls back', async () => {
  setSecrets('primary-secret', 'second-secret');
  const calls = fakeCli(secret => (secret === 'primary-secret' ? { Code: 20001 } : ok), () => 0);
  assert.equal((await searchZhihu('彩礼')).Code, 0);
  assert.deepEqual(calls.map(c => c.secret), ['primary-secret', 'second-secret']);
});

test('when every credential is limited the caller still sees the limit', async () => {
  setSecrets('primary-secret', 'second-secret');
  const calls = fakeCli(() => ({ Code: 30001 }), () => 0);
  assert.equal((await searchZhihu('彩礼')).Code, 30001);
  assert.equal(calls.length, 2);
});

test('without a supplementary credential nothing changes', async () => {
  setSecrets('primary-secret', undefined);
  const calls = fakeCli(() => ({ Code: 30001 }), () => 0);
  assert.equal((await hotZhihu()).Code, 30001);
  assert.deepEqual(calls.map(c => c.secret), ['primary-secret']);
});

test('a keychain primary (no env secret) is tried as-is before the supplementary one', async () => {
  setSecrets(undefined, 'second-secret');
  const calls = fakeCli(secret => (secret ? ok : { Code: 30001 }), () => 0);
  assert.equal((await searchZhihu('彩礼')).Code, 0);
  assert.deepEqual(calls.map(c => c.secret), [undefined, 'second-secret']);
});

test('the same secret configured twice is only used once', async () => {
  setSecrets('same-secret', 'same-secret');
  const calls = fakeCli(() => ({ Code: 30001 }), () => 0);
  await searchZhihu('彩礼');
  assert.equal(calls.length, 1);
});
