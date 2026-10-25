// The vessel and blood visuals from the October review (docs/REVIEW_2026-10.md §4, G9, G10, G12, G14 and G17):
// what each draws, checked without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { advanceStream, REVERSE_HOLD, bleedShapes, BLEED_JETS, BLEED_DROPS, bleedPulse, poolFill, chevFlowLevel, CHEV_Q_FULL } from '../src/ui/blood.js';
import { varixBead, beadRadius, BEAD_MAX } from '../src/ui/varix-bead.js';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const STAGE = src('src/ui/stage.js'), GL = src('src/ui/veins-gl.js');

test('G9: blood that turns round stands still for 0.6 s at the turn, then sets off the other way', () => {
  const st = { seed: 3 };
  advanceStream(st, 12, 12, 0.05);
  for (let i = 0; i < 100; i++) advanceStream(st, 12, 12, 0.05);
  assert.ok(st.vd > 0);
  // The flow reverses: the displayed mean eases down through zero, holds, then runs backwards.
  let t = 0, crossed = null, moved = null;
  for (let i = 0; i < 400 && moved == null; i++) {
    advanceStream(st, -12, -12, 0.05); t += 0.05;
    if (crossed == null && st.vSlow < 0) crossed = t;
    if (crossed != null && st.vd < 0) moved = t;
    if (crossed != null && moved == null) assert.equal(st.vd, 0, `still at ${t.toFixed(2)} s`);
  }
  assert.ok(crossed != null && moved != null);
  assert.ok(Math.abs(moved - crossed - REVERSE_HOLD) < 0.06, `held ${(moved - crossed).toFixed(2)} s`);
  assert.equal(REVERSE_HOLD, 0.6);
  // It eases off, never jumping to speed (under a sixth of its speed in any 50 ms), nor out of its stillness.
  let prev = st.vd, prevS = st.stasis;
  for (let i = 0; i < 40; i++) {
    advanceStream(st, -12, -12, 0.05);
    assert.ok(Math.abs(st.vd - prev) < 3.6, `speed ${prev.toFixed(2)} → ${st.vd.toFixed(2)}`);
    assert.ok(Math.abs(st.stasis - prevS) < 0.25, `stasis ${prevS.toFixed(2)} → ${st.stasis.toFixed(2)}`);
    prev = st.vd; prevS = st.stasis;
  }
  // A steady flow never holds.
  const s2 = { seed: 1 };
  for (let i = 0; i < 50; i++) { advanceStream(s2, 8, 8, 0.05); if (i) assert.ok(s2.vd > 0); }
});

test('G9: under reduced motion the stream stands still but points the way the flow goes now', () => {
  const st = { seed: 2 };
  advanceStream(st, 10, 10, 0.05);
  const D = st.D;
  advanceStream(st, -10, -10, 0.05, { still: true });
  assert.equal(st.D, D, 'nothing moves');
  assert.ok(st.vd < 0, 'it already points backwards');
});

test('G9: a watched vessel that reverses marks its station with ⟲, and no band is drawn round it', () => {
  // (Mohammad, 16 Oct: the dashed band is not needed.)
  assert.match(STAGE, /if \(x\.rev && \(!st\.imaging \|\| !!st\.found\?\.has\('flow'\)\)\) revShown\.add\(e\.id\); else revShown\.delete\(e\.id\);/, 'hidden in an imaging case until the flow is seen');
  assert.match(STAGE, /const rev = !!pr && revShown\.has\(STATION_VESSEL\[id\]\);/);
  assert.match(STAGE, /\{ t: '⟲', size: 12, weight: 650, cls: 'lb-rev', gap: 5 \}/);
  assert.match(src('styles/app.css'), /\.lb-rev \{ fill: var\(--flow-reversed\); \}/);
  assert.doesNotMatch(GL, /revInk/, 'no dashed band');
});

const SITES = { varix: [800, 120], fundus: [870, 300], stomachPool: [880, 360] };
test('G10: a bleed spurts with the heartbeat, runs down into the stomach and pools there, nothing popping on or off', () => {
  const ev = bleedShapes({ site: 'VAR', total: 500 }, 90, 0.3, SITES, 80);
  assert.equal(ev[0][7], 0, 'the pool first');
  assert.ok(ev.length <= 24, 'fits the shader');
  assert.match(GL, /uniform vec4 bleedB\[24\];/);
  const jets = ev.slice(1, 1 + BLEED_JETS), drops = ev.slice(1 + BLEED_JETS, 1 + BLEED_JETS + BLEED_DROPS), run = ev.slice(1 + BLEED_JETS + BLEED_DROPS);
  for (const j of jets) {
    assert.equal(j[7], 1);
    assert.ok(j[3] < j[1], 'up the esophagus');
    assert.ok(j[4] > j[5], 'tapered toward its tip');
  }
  for (const j of bleedShapes({ site: 'GV', total: 500 }, 90, 0.3, SITES).slice(1, 1 + BLEED_JETS)) assert.ok(j[3] > j[1], 'down into the fundus');
  // The trickle runs downhill from the tear to the pool's surface.
  const trickle = run.slice(0, -3);
  assert.ok(trickle.length >= 3);
  for (const s of trickle) assert.ok(s[3] > s[1], 'downhill');
  assert.ok(Math.abs(trickle.at(-1)[3] - (ev[0][4] + 2)) < 1e-9, 'into the pool');
  // The pool fills its bowl from below, its depth on the square-root law, and stays inside it.
  const depth = (total) => { const p = bleedShapes({ site: 'VAR', total }, 90, 0, SITES)[0]; return p[1] + p[3] - p[4]; };
  assert.ok(Math.abs(depth(400) / depth(100) - 2) < 1e-9);
  assert.ok(depth(1e6) < 2 * ev[0][3], 'never above the bowl');
  assert.equal(poolFill(0), 0.12, 'a puddle at once');
  // The jets lengthen on each beat: longer in systole than between beats, and the beat follows the heart rate.
  const jl = (t, hr) => { const j = bleedShapes({ site: 'VAR', total: 500 }, 90, t, SITES, hr)[1]; return Math.hypot(j[2] - j[0], j[3] - j[1]); };
  assert.ok(jl(0.09, 60) > 1.5 * jl(0.6, 60));
  assert.ok(Math.abs(bleedPulse(0.3, 60) - bleedPulse(1.3, 60)) < 1e-9 && Math.abs(bleedPulse(0.15, 120) - bleedPulse(0.65, 120)) < 1e-9);
  // A slow bleed oozes: short jets and faint drops.
  const slow = bleedShapes({ site: 'VAR', total: 500 }, 15, 0.09, SITES, 60);
  assert.ok(Math.hypot(slow[1][2] - slow[1][0], slow[1][3] - slow[1][1]) < 0.4 * jl(0.09, 60));
  // No shape pops on or off: every alpha moves smoothly.
  for (const site of ['VAR', 'GV']) {
    let prev = null;
    for (let t = 0; t < 3; t += 0.002) {
      const a = bleedShapes({ site, total: 500 }, 90, t, SITES, 80).map((s) => s[6]);
      if (prev) a.forEach((x, i) => assert.ok(Math.abs(x - prev[i]) < 0.03, `${site} shape ${i} at ${t.toFixed(3)} s`));
      prev = a;
    }
  }
  // Paused, the drops stand at different stages (a still picture of the spray).
  assert.equal(new Set(drops.map((d) => d[1].toFixed(2))).size, BLEED_DROPS);
});

test('G12 taken back: the pressure legend is as it was (its scale is absolute pressure; the cut-offs are HVPG)', () => {
  // (Mohammad, 16 Oct.)
  const cm = src('src/ui/colormap.js');
  assert.match(cm, /export const PRESSURE_TICKS = \[0, 10, 20, 30\];/);
  assert.doesNotMatch(cm, /PRESSURE_MARKS/);
  assert.doesNotMatch(src('src/ui/main.js'), /lg-mark|PRESSURE_MARKS/);
  assert.deepEqual([...src('styles/tokens.css').matchAll(/--ramp-pressure: (#[0-9A-F]{6}) 0,/g)].map((m) => m[1]), ['#DCEBF7']);
});

test('G14: the esophageal varix strands bead once the varix is large, as the endoscopy draws it', () => {
  assert.equal(varixBead(3), 0);
  assert.equal(varixBead(6), 0, 'small: a smooth column');
  assert.equal(varixBead(8), BEAD_MAX);
  assert.ok(varixBead(7) > 0 && varixBead(7) < BEAD_MAX, 'eases in about the endoscopy\'s beaded size (grow 0.5, 7 mm)');
  for (let d = 2; d < 12; d += 0.1) assert.ok(varixBead(d + 0.1) >= varixBead(d));
  // Smooth where the strands leave and rejoin the trunk; between, swelling and narrowing by up to b.
  const r = 2, b = BEAD_MAX, len = 240, u0 = 0.22;
  assert.equal(beadRadius(r, b, u0, len, 1, u0), r);
  assert.ok(Math.abs(beadRadius(r, b, 1, len, 1, u0) - r) < 1e-9);
  const rs = Array.from({ length: 64 }, (_, i) => beadRadius(r, b, i / 63, len, 1, u0));
  assert.ok(Math.max(...rs) > r * 1.25 && Math.min(...rs) < r * 0.75);
  assert.ok(rs.every((x) => x >= r * (1 - b) - 1e-9 && x <= r * (1 + b) + 1e-9));
  assert.equal(beadRadius(r, 0, 0.5, len, 1, u0), r);
  assert.match(STAGE, /sd\.bead = e\.id === 'C1a' \? Math\.round\(varixBead\(f\.metrics\?\.varix\?\.d\)/);
});

test('G17: with reduced motion the chevrons stand still, spaced by flow', () => {
  assert.equal(chevFlowLevel(CHEV_Q_FULL), 0);
  assert.equal(chevFlowLevel(CHEV_Q_FULL * 3), 0);
  assert.ok(Math.abs(chevFlowLevel(CHEV_Q_FULL / 2) - 1) < 1e-9);
  assert.ok(Math.abs(chevFlowLevel(-CHEV_Q_FULL / 4) - 2) < 1e-9, 'either way');
  assert.equal(chevFlowLevel(0.01), 3);
  assert.match(STAGE, /flowData\[o \+ 13\] = chevFlowLevel\(q\);/);
  assert.match(STAGE, /still: reduceMotion\.matches, chev:/);
  assert.match(GL, /if \(still == 1\) lv = max\(lv, texelFetch\(flow, ivec2\(3, id\), 0\)\.y\);/);
});

test('A7: the pressure ramp gets darker at every stop, so 12 and 20 mmHg differ in lightness, not only in hue', () => {
  // (Mohammad, 18 Oct: round 2 review A7.)
  const m = src('styles/tokens.css').match(/--ramp-pressure: ([^;]+);/)[1];
  const stops = m.split(',').map((x) => x.trim().split(/\s+/));
  assert.deepEqual(stops.map((x) => +x[1]), [0, 5, 10, 12, 20, 30]);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return 0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s;
  };
  const Ls = stops.map((x) => L(x[0]));
  for (let i = 1; i < Ls.length; i++) assert.ok(Ls[i] < Ls[i - 1] - 0.03, `stop ${stops[i][1]} mmHg is not darker than ${stops[i - 1][1]}: ${Ls.map((v) => v.toFixed(3))}`);
  assert.ok(Ls[3] - Ls[4] > 0.1, '12 and 20 mmHg differ clearly in lightness');
});
