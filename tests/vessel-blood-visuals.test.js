// The vessel and blood visuals from the October review (docs/REVIEW_2026-10.md §4, G9, G10, G12, G14 and G17):
// what each draws, checked without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { advanceStream, REVERSE_HOLD, bleedShapes, BLEED_JETS, chevFlowLevel, CHEV_Q_FULL } from '../src/ui/blood.js';
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
test('G10: a bleed is a pool and four tapered jets into the lumen, each spurting in turn', () => {
  const ev = bleedShapes({ site: 'VAR', total: 500 }, 90, 0.3, SITES);
  assert.equal(ev.length, 1 + BLEED_JETS);
  assert.equal(ev[0][7], 0, 'the pool first');
  for (const j of ev.slice(1)) {
    assert.equal(j[7], 1);
    assert.ok(j[3] < j[1], 'up the esophagus');
    assert.ok(j[4] > j[5], 'tapered toward its tip');
  }
  for (const j of bleedShapes({ site: 'GV', total: 500 }, 90, 0.3, SITES).slice(1)) assert.ok(j[3] > j[1], 'down into the fundus');
  // The pool grows on the square-root law.
  const r = (total) => bleedShapes({ site: 'VAR', total }, 90, 0, SITES)[0][2];
  assert.ok(Math.abs(r(2000) / r(500) - 2) < 1e-9);
  // No jet pops on or off: each eases in from nothing and thins to nothing as its cycle wraps.
  for (let i = 1; i <= BLEED_JETS; i++) {
    let prev = null;
    for (let t = 0; t < 3; t += 0.002) {
      const a = bleedShapes({ site: 'VAR', total: 500 }, 90, t, SITES)[i][6];
      if (prev != null) assert.ok(Math.abs(a - prev) < 0.03, `jet ${i} at ${t.toFixed(3)} s`);
      prev = a;
    }
  }
  // Paused, the jets stand at four different stages (a still picture of the spurts).
  const still = bleedShapes({ site: 'VAR', total: 500 }, 90, 0, SITES).slice(1).map((j) => j[3]);
  assert.equal(new Set(still.map((y) => y.toFixed(2))).size, BLEED_JETS);
  assert.match(GL, /uniform vec4 bleedB\[10\];/);
});

test('G12: the pressure legend marks the HVPG cut-offs 5, 10, 12 and 20, with their meaning on hover', () => {
  const cm = src('src/ui/colormap.js');
  const marks = [...cm.matchAll(/\[(\d+), '(\d+) mmHg: ([^']+)'\]/g)];
  assert.deepEqual(marks.map((m) => +m[1]), [5, 10, 12, 20]);
  for (const m of marks) { assert.equal(m[1], m[2]); assert.match(m[3], /HVPG/); }
  assert.match(cm, /from about this HVPG, the risk of variceal bleeding rises steeply/, 'the 12 wording the project uses');
  assert.match(cm, /export const PRESSURE_TICKS = \[0, 10, 20, 30\];/, 'the numbers stay as they were');
  assert.match(src('src/ui/main.js'), /PRESSURE_MARKS\.map\(\(\[p, t\]\) => \[at\(p\), t\]\)/);
  // Dark mode lifts the ramp's low end; the light themes keep theirs.
  const tok = src('styles/tokens.css');
  const ramps = [...tok.matchAll(/--ramp-pressure: (#[0-9A-F]{6}) 0,/g)].map((m) => m[1]);
  assert.deepEqual(ramps, ['#DCEBF7', '#9FC9EA', '#9FC9EA']);
  // The colour table is built again when the theme changes the ramp.
  assert.match(cm, /LUT_SRC === cssVar\('--ramp-pressure'\)/);
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
