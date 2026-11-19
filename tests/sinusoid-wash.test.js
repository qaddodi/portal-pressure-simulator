// The wedged column's wash in the sinusoid view (Mohammad, 18 Nov 2026, HVPG and PPG slide 5: "the yellow/orange coloration should extend ... dive into the lobule and see the
// yellow/orange color extend from the central vein into the sinusoids"). It is scoped to the one slide that asks: every other slide has uWedge.x = 0 and draws as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { washProgress, WASH_DELAY_MS, WASH_MS } from '../src/ui/sinusoid-wash.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the wash waits for the view to settle, runs its length once, and holds at the end; reduced motion shows it finished', () => {
  assert.equal(washProgress(0), 0);
  assert.equal(washProgress(WASH_DELAY_MS), 0);
  const mid = washProgress(WASH_DELAY_MS + WASH_MS / 2);
  assert.ok(mid > 0.45 && mid < 0.55, `halfway ${mid}`);
  assert.equal(washProgress(WASH_DELAY_MS + WASH_MS), 1);
  assert.equal(washProgress(1e6), 1);
  assert.equal(washProgress(-50), 0);
  assert.equal(washProgress(0, true), 1);
  let last = 0;
  for (let t = 0; t <= WASH_DELAY_MS + WASH_MS + 100; t += 25) { const k = washProgress(t); assert.ok(k >= last, 'never goes back'); last = k; }
});

test('only the wedge-sinusoid slide of the HVPG deck asks for the wash, between its two balloon-up catheter slides', async () => {
  const dir = new URL('../src/ui/decks/', import.meta.url);
  const asking = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    for (const d of Object.values(await import(new URL(f, dir)))) if (d?.slides) d.slides.forEach((s, i) => { if (s.wash) asking.push([d.id, s.id, s.cam, d.slides[i - 1]?.cath, d.slides[i + 1]?.cath]); });
  }
  assert.deepEqual(asking, [['hvpg', 'wedge-sinusoid', 'lobule:sinusoid', 'wedge', 'result']]);
});

test('the shader washes only when told: uWedge.x is 0 by default, the front runs from the central end, and the flow stills inside it', () => {
  const gl = read('../src/ui/sinusoid-gl.js'), view = read('../src/ui/sinusoid-view.js');
  assert.match(gl, /uniform vec4 uWedge;/);
  assert.match(gl, /uniform vec3 cWedge;/);
  assert.match(gl, /if \(uWedge\.x <= 0\.0 \|\| abs\(span\) < 1\.0\) return 0\.0;/, 'off means no change at all');
  assert.match(gl, /float t = \(x - uEnd\.y\) \/ span;/, 'measured from the central end (uEnd.y) toward the portal end (uEnd.x)');
  assert.match(gl, /vec3 c = mix\(cLumen, cWedge, 0\.85 \* wz\);/);
  assert.equal((gl.match(/\* live\)?;/g) || []).length, 3, 'the shimmer, the sheen and the streaks are all stilled by it');
  const fs = gl.slice(gl.indexOf('float wedgeA('), gl.indexOf('// ── The space of Disse'));
  assert.equal((fs.match(/\{/g) || []).length, (fs.match(/\}/g) || []).length, 'braces balance in the shader text of the wash and the lumen');
  assert.equal((fs.match(/\(/g) || []).length, (fs.match(/\)/g) || []).length, 'parentheses balance');
  assert.match(view, /uWedge: \[0, 0, 0, 0\]/, 'default: off');
  assert.match(view, /const wantWash = shown > 0 && !dive && !!store\.get\(\)\.sinusoidWash && !model\.hide;/, 'only on a slide that asks, once the view has landed');
  assert.match(view, /!washBusy && pictureSame\(u, n\)/, 'a wash on its way keeps the view drawing, then it can rest');
});

test('the presenter turns the wash on with its slide and off with the others and at the deck\'s end', () => {
  const pres = read('../src/ui/presenter.js'), start = read('../src/ui/presenter-start.js'), store = read('../src/ui/store.js');
  assert.match(pres, /store\.set1\('sinusoidWash', !!s\.wash && !s\.visual\)/);
  assert.match(start, /presenting: false, sinusoidWash: false/);
  assert.match(store, /sinusoidWash: false,/);
});
