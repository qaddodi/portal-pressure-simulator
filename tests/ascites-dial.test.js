import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Ascites tab: the abdominal pressure dial left of the belly and the drain right of it.
const js = readFileSync(new URL('../src/ui/instruments.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the dial bands sit at the real cut-offs: 12 (intra-abdominal hypertension) and 20 (compartment syndrome) on 0-30', () => {
  assert.ok(js.includes("const IAP_MAX = 30, IAP_BANDS = [[0, 12, 'ok'], [12, 20, 'caution'], [20, 30, 'danger']];"));
  assert.ok(js.includes("const iapSev = (v) => (v >= 20 ? 'danger' : v >= 12 ? 'caution' : 'ok');"));
  assert.ok(js.includes('const sev = iapSev(a.iap);\n    dial.set(a.iap);'), 'the dial follows the reading every frame');
  assert.match(js, /v = Math.min\(n, IAP_MAX\)/, 'a reading above 30 parks the knob at the top, the number stays true');
});

test('the drain sends the litres and the albumin choice, and the old paracentesis row is gone (no second drain)', () => {
  assert.ok(js.includes("onAction({ kind: 'paracentesis', mL: L * 1000, albumin: albOn() })"));
  assert.doesNotMatch(js, /h\('b', \{\}, 'Paracentesis'\)/);
  assert.equal((js.match(/class: 'ab-drain'/g) || []).length, 1);
});

test('dial and drain show only in the Ascites tab; there the old pressure bar is hidden so the reading is not shown twice', () => {
  assert.ok(css.includes('.ab-dial-box, .ab-dp { display: none; }'));
  assert.ok(css.includes('.dock-pane > .instrument-view.ab .ab-iap { display: none; }'));
  assert.ok(css.includes('.dock-pane > .instrument-view.ab .ab-dial-box { display: block;'));
  assert.ok(css.includes('.dock-pane > .instrument-view.ab .ab-dp { display: grid;'));
});

test('at every card width the dial fits beside the belly and the drain keeps at least 84 px (from a 320 px phone up)', () => {
  assert.ok(css.includes('--ab-bw: clamp(96px, min(100cqi - 208px, 45.5cqi - 14px, 250px), 250px)'));
  for (let W = 280; W <= 1000; W += 2) {
    const B = Math.max(96, Math.min(W - 208, 0.455 * W - 14, 250)), side = (W - B - 16) / 2, dial = (B * 76) / 128;
    assert.ok(dial + 6 <= side + 0.01, `dial ${dial.toFixed(1)} + 6 > side ${side.toFixed(1)} at ${W}px`);
    assert.ok(side >= 84 - 0.01, `drain ${side.toFixed(1)} px at ${W}px`);
  }
});

test('the belly\'s daily balance never flashes: averaged, held until 100 mL/day past the shown hundred, changed at most every 1.5 s', async () => {
  const { balanceHold } = await import('../src/ui/balance-hold.js');
  assert.ok(js.includes("b === 0 ? ['steady', '', 'Steady']"), 'zero reads Steady, never blank');
  assert.doesNotMatch(js, /setText\(rateEl, r100 === 0 \? ''/);
  assert.doesNotMatch(css, /ab-rate-out/, 'a change never dips or hides the line');
  // 60 frames a second for 20 s of each case; count how often the shown value changes
  const run = (rate) => { const hd = balanceHold(); const changes = []; for (let f = 0; f <= 1200; f++) { const t = f * 1000 / 60; if (hd.step(rate(t), t) != null) changes.push(t); } return changes; };
  const gaps = (c) => c.slice(1).map((t, i) => t - c[i]);
  // beat-to-beat wobble round ±50 (the old flashing): one label, set once
  assert.equal(run((t) => 50 + 120 * Math.sin(t / 130)).length, 1);
  assert.equal(run((t) => -40 + 300 * Math.sin(t / 70)).length, 1);
  // a big swing every breath on diuretics (2200 to 1500): settles, few changes, never faster than the hold
  const breath = run((t) => -1850 + 350 * Math.sin(t / 640));
  assert.ok(breath.length <= 4, `${breath.length} changes`);
  // time running fast: the balance sweeps from -2200 to +2000 in 10 s; the line follows but never faster than every 1.5 s
  const sweep = run((t) => Math.min(2000, -2200 + 0.42 * t));
  assert.ok(sweep.length > 3);
  for (const g of gaps(sweep)) assert.ok(g >= 1500 - 1e-6, `changed after ${g.toFixed(0)} ms`);
  // paused (a constant rate): set once, then still
  assert.equal(run(() => 2000).length, 1);
  // a broken reading counts as zero, not NaN on screen
  const hd = balanceHold(); assert.equal(hd.step(NaN, 0), 0);
});
