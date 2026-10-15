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

test('the belly\'s daily balance never flashes: it holds its hundred until 100 mL/day past it, reads Steady at zero, and fades between values', () => {
  assert.ok(js.includes('if (rateShown != null && Math.abs(r - rateShown) <= 100) return;'));
  assert.ok(js.includes('rateAvg + (raw - rateAvg) * (1 - Math.exp(-dt / 6000))'), 'the beat-to-beat swing is averaged out first');
  assert.ok(js.includes("b === 0 ? ['steady', '', 'Steady']"));
  assert.doesNotMatch(js, /setText\(rateEl, r100 === 0 \? ''/, 'never blanked');
  assert.ok(css.includes('.ab .ab-belly > .ab-big > .ab-rate.ab-rate-out { opacity: 0; }'));
  // the rule itself: a rate wobbling round ±50 keeps one label
  let shown = null; const seen = new Set();
  const paint = (r) => { if (shown != null && Math.abs(r - shown) <= 100) return; shown = Math.round(r / 100) * 100; };
  for (let i = 0; i < 200; i++) { paint(50 + 15 * Math.sin(i)); seen.add(shown); }
  assert.equal(seen.size, 1);
});
