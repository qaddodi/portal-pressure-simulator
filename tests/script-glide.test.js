// A card's glide or fade written by the frames (script-glide.js, 3 Nov 2026, cards trailing): its inline value is in the frame the glass reads
// it in, it takes over from where it stands, and it ends exactly at its target.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let T = 1000, q = [];
globalThis.requestAnimationFrame = (f) => { q.push(f); return q.length; };
globalThis.cancelAnimationFrame = () => {};
performance.now = () => T;
const sg = await import('../src/ui/script-glide.js');
const { easeArrive } = await import('../src/ui/ease.js');
const tick = (ms) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };
const mk = () => ({ style: {} });
const xy = (el) => el.style.translate.split(' ').map(parseFloat);

test('a translate glide writes each frame from its start to exactly its target, and asks for no frame after', () => {
  const el = mk();
  sg.glideTranslate(el, 0, 0, 100, -40, 120, easeArrive);
  assert.equal(el.style.translate, '0.00px 0.00px', 'written at once, where it starts');
  assert.ok(sg.glideRunning(el));
  let last = 0, frames = 0;
  while (sg.glideRunning(el) && frames < 40) { tick(8); frames++; const [x] = xy(el); assert.ok(x >= last - 1e-9 && x <= 100.0001, `x rises to its target (${last} -> ${x})`); last = x; }
  assert.equal(el.style.translate, '100.00px -40.00px');
  assert.ok(frames >= 14 && frames <= 16, `120 ms of 8 ms frames, was ${frames}`);
  tick(8);
  assert.equal(q.length, 0, 'no frame is asked for once it has landed');
});

test('a second glide takes over from where the first stands, never from a jump', () => {
  const el = mk();
  sg.glideTranslate(el, 0, 0, 100, 0, 200, easeArrive);
  for (let i = 0; i < 6; i++) tick(8);
  const [mid] = xy(el);
  assert.ok(mid > 5 && mid < 95);
  sg.glideTranslate(el, 100, 0, 0, 0, 200, easeArrive);   // (asked from its old target, as card.js moveTo does)
  assert.equal(xy(el)[0], mid, 'it goes on from where it stands');
  while (sg.glideRunning(el)) tick(8);
  assert.equal(el.style.translate, '0.00px 0.00px');
});

test('an opacity glide resolves at its target, and a stopped one keeps what it wrote', async () => {
  const el = mk();
  let done = false;
  sg.glideOpacity(el, 1, 0, 80, (u) => u).then(() => { done = true; });
  assert.equal(el.style.opacity, '1.000');
  for (let i = 0; i < 12; i++) tick(8);
  await Promise.resolve();
  assert.ok(done);
  assert.equal(el.style.opacity, '0.000');
  const b = mk();
  sg.glideTranslate(b, 0, 0, 50, 0, 100, (u) => u);
  tick(8); tick(8);
  const was = b.style.translate;
  sg.glideStop(b);
  tick(8); tick(8);
  assert.equal(b.style.translate, was);
  assert.ok(!sg.glideRunning(b));
});

test('a called glide writes in each frame from 0 to exactly 1, takes no frame after, and a stop ends it', () => {
  const el = mk(), seen = [];
  let done = 0;
  sg.glideCall(el, 64, (u) => u, (e) => seen.push(e), () => { done++; });
  assert.deepEqual(seen, [0], 'written at once, at its start');
  for (let i = 0; i < 12; i++) tick(8);
  assert.equal(seen[seen.length - 1], 1);
  assert.equal(seen.filter((e) => e === 1).length, 1, 'its last frame once');
  assert.ok(seen.every((e, i) => !i || e >= seen[i - 1]));
  assert.equal(done, 1);
  assert.equal(q.length, 0, 'no frame is asked for after it');
  const n = seen.length;
  sg.glideCall(el, 64, (u) => u, (e) => seen.push(e));
  tick(8); sg.glideStop(el); const m = seen.length; tick(8); tick(8);
  assert.equal(seen.length, m, 'a stopped glide writes nothing more');
  assert.ok(m > n);
});

import { readFileSync } from 'node:fs';
test('the instrument card keeps its height between tests, and a sheet\'s ease is the frames\'', () => {
  const src = readFileSync(new URL('../src/ui/dock.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /function setFit\(/, 'no glide of the card between heights (12 Nov 2026)');
  const sheet = readFileSync(new URL('../src/ui/sheet-move.js', import.meta.url), 'utf8');
  assert.doesNotMatch(sheet, /\.animate\(/, 'a sheet\'s ease is the frames\'');
});
