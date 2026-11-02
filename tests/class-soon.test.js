import test from 'node:test';
import assert from 'node:assert/strict';
import { classSoon, textSoon } from '../src/ui/class-soon.js';

const fake = () => { const on = new Set(); return { textContent: '', classList: { toggle: (n, v) => { if (v) on.add(n); else on.delete(n); }, has: (n) => on.has(n) } }; };
const later = () => new Promise((r) => setTimeout(r, 30));

test('class writes wait for the rest pass and the last ask wins', async () => {
  const el = fake();
  classSoon(el, 'a', true); classSoon(el, 'b', true); classSoon(el, 'a', false);
  assert.equal(el.classList.has('b'), false, 'nothing written on the spot');
  await later();
  assert.equal(el.classList.has('a'), false);
  assert.equal(el.classList.has('b'), true);
});

test('words are set once, the last ask winning', async () => {
  const el = fake();
  textSoon(el, 'one'); textSoon(el, 'two');
  assert.equal(el.textContent, '');
  await later();
  assert.equal(el.textContent, 'two');
});

test('a missing element is ignored', () => { classSoon(null, 'a', true); textSoon(null, 'x'); });

test('runSoon runs after the queued class writes, in order', async () => {
  const { runSoon } = await import('../src/ui/class-soon.js');
  const el = fake(), seen = [];
  classSoon(el, 'a', true);
  runSoon(() => seen.push(el.classList.has('a')));
  runSoon(() => seen.push('second'));
  assert.deepEqual(seen, []);
  await later();
  assert.deepEqual(seen, [true, 'second']);
});
