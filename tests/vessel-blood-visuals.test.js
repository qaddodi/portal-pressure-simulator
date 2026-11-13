import { stageSource } from './stage-src.js';
// The vessel and blood visuals from the October review (docs/REVIEW_2026-10.md §4, G9, G10, G12, G14 and G17):
// what each draws, checked without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { advanceStream, REVERSE_HOLD, bleedShapes, BLEED_ROWS, bleedPulse, poolFill, POOL_SHARE, chevFlowLevel, CHEV_Q_FULL } from '../src/ui/blood.js';
import { LUMEN, LUMEN_AREA, LUMEN_BOTTOM, STO_N, lumenSurface, lumenAt } from '../src/ui/stomach-lumen.js';
import { varixBead, beadRadius, BEAD_MAX } from '../src/ui/varix-bead.js';
import { tokensOfLook, LOOK_IDS } from '../src/ui/theme-tokens.js';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const STAGE = stageSource(), GL = src('src/ui/veins-gl.js');

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
  assert.match(STAGE, /const stationRev = \(id\) => \{ const a = revVessels\(id\);/, 'a station tells the reversal of any vessel it stands on, with or without a number');
  assert.match(STAGE, /const rev = stationRev\(id\);/);
  assert.match(STAGE, /\{ t: '⟲', size: 12, weight: 650, cls: 'lb-rev', gap: 5 \}/);
  assert.match(src('styles/app.css'), /\.lb-rev \{ fill: var\(--flow-reversed\); \}/);
  assert.doesNotMatch(GL, /revInk/, 'no dashed band');
});

const SITES = { varix: [797, 232], fundus: [876, 304] };
test('G10: a bleed is a steady stream from the tear to a pool in the stomach, with no pulse, no welling and no splatter', () => {
  const ev = bleedShapes({ site: 'VAR', total: 500 }, 90, SITES);
  assert.equal(ev.length, BLEED_ROWS);
  assert.equal(ev[0][7], 0, 'the pool first');
  assert.match(GL, /uniform vec4 bleedB\[24\];/);
  const thread = ev[1];
  // Only the pool and the stream: no jets, drops or welling (kind 1) at the tear, and the shader draws none.
  assert.ok(ev.every((s) => s[7] !== 1), 'no jets, drops or welling');
  assert.doesNotMatch(GL, /bB\.w < 0\.5 \|\| bB\.w > 1\.5/, 'no jet pass in the shader');
  // The thread leaves the tear and falls to the pool's surface, landing inside the stomach's lumen.
  assert.equal(thread[7], 2);
  assert.ok(thread[1] < 260 && thread[3] === ev[0][0], 'from the tear to the surface');
  assert.ok(thread[2] > lumenAt(ev[0][0])[0] && thread[2] < lumenAt(ev[0][0])[1], 'lands inside the lumen');
  assert.equal(ev[0][2], thread[2], 'the pool ripples where the thread lands');
  // The pool is the stomach's lumen filled from the bottom: its level rises with the blood lost, stays inside the lumen
  // and never fills it.
  const level = (total) => bleedShapes({ site: 'VAR', total }, 90, SITES)[0][0];
  assert.ok(level(100) > level(400) && level(400) > level(1500), 'rises');
  assert.ok(level(0) < LUMEN_BOTTOM && level(1e6) >= lumenSurface(POOL_SHARE) - 1e-9, 'inside the lumen, never full');
  assert.equal(poolFill(0), 0.12, 'a puddle at once');
  // No pulse: nothing in the shapes depends on time or the heart rate (bleedShapes takes neither).
  assert.equal(bleedShapes.length, 3);
  // A slow bleed: a thread that breaks into drops sooner.
  const slow = bleedShapes({ site: 'VAR', total: 500 }, 15, SITES);
  assert.ok(slow[1][5] > thread[5], 'breaks into drops sooner');
  // A gastric varix: the thread falls straight from the fundus.
  const gt = bleedShapes({ site: 'GV', total: 500 }, 90, SITES)[1];
  assert.ok(Math.abs(gt[2] - gt[0]) < 5 && gt[3] > gt[1], 'straight down');
  // The scope's bleed is steady too, no beat in it (Mohammad 6 Nov 2026: "it should stop pulsing everywhere").
  for (const hr of [60, 80, 120]) for (const t of [0, 0.13, 0.3, 0.71, 1.3]) assert.equal(bleedPulse(t, hr), bleedPulse(0, 80));
});

test('the stomach lumen: rows read off its outline, a pool that fills it from the bottom, the shader reads the same rows', () => {
  assert.equal(LUMEN.length, STO_N);
  // The rows run from the cardia to the lowest point and are empty below it.
  assert.ok(LUMEN[0][1] - LUMEN[0][0] > 100 && LUMEN_BOTTOM > 550 && LUMEN_BOTTOM < 570);
  assert.equal(LUMEN.at(-1)[1] - LUMEN.at(-1)[0], 0);
  for (const [l, r] of LUMEN) assert.ok(r >= l);
  // Its surface for a share of the area: lower for less, the bottom for none, the top row for all, and the area under it adds up.
  let prev = Infinity;
  for (const share of [0, 0.05, 0.2, 0.5, 0.8, 1]) { const y = lumenSurface(share); assert.ok(y <= prev + 1e-9); prev = y; }
  for (const share of [0.1, 0.46, 0.8]) {
    const y = lumenSurface(share);
    let area = 0;
    for (let yy = y; yy < 575; yy += 0.25) { const [l, r] = lumenAt(yy); area += (r - l) * 0.25; }
    assert.ok(Math.abs(area / LUMEN_AREA - share) < 0.012, `share ${share}: ${(area / LUMEN_AREA).toFixed(3)}`);
  }
  // The shader's rows are these.
  assert.match(GL, /const vec2 STO\[\$\{STO_N\}\] = vec2\[\$\{STO_N\}\]\(\$\{LUMEN\.map\(/, 'built into the shader at run time from these rows');
  assert.match(GL, /if \(bB\.w > 1\.5\) \{/);
});

test('G12 taken back: the pressure legend is as it was (its scale is absolute pressure; the cut-offs are HVPG)', () => {
  // (Mohammad, 16 Oct.)
  const cm = src('src/ui/colormap.js');
  assert.match(cm, /export const PRESSURE_TICKS = \[0, 10, 20, 30\];/);
  assert.doesNotMatch(cm, /PRESSURE_MARKS/);
  assert.doesNotMatch(src('src/ui/main.js'), /lg-mark|PRESSURE_MARKS/);
  // (The pressure ramp is per look since the visual-style C1/C2 work: Linen's pale end, Oat's old one, the dark looks' own. The cut-offs and ticks above are unchanged.)
  const pale = Object.fromEntries(LOOK_IDS.map((id) => [id, tokensOfLook(id)['ramp-pressure'].split(',')[0].trim()]));
  assert.deepEqual(pale, { light: '#B8D5ED 0', soft: '#DCEBF7 0', dark: '#D7E7F4 0', navy: '#D7E7F4 0', black: '#D7E7F4 0' });
  assert.deepEqual(src('styles/tokens.css').match(/--ramp-pressure: [^;]+;/g).length, 4, 'light, the system dark block, dark and soft print it; the palettes take Dark\'s');
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
  // (The esophageal strands, and since visual-style V3 the fundal channels' too, each by its own varix: varix-bead.js BEAD_SITE.)
  assert.match(STAGE, /sd\.bead = BEAD_SITE\[e\.id\] \? Math\.round\(varixBead\(f\.metrics\?\.\[BEAD_SITE\[e\.id\]\]\?\.d\)/);
});

test('G17: with reduced motion the chevrons stand still, spaced by flow', () => {
  assert.equal(chevFlowLevel(CHEV_Q_FULL), 0);
  assert.equal(chevFlowLevel(CHEV_Q_FULL * 3), 0);
  assert.ok(Math.abs(chevFlowLevel(CHEV_Q_FULL / 2) - 1) < 1e-9);
  assert.ok(Math.abs(chevFlowLevel(-CHEV_Q_FULL / 4) - 2) < 1e-9, 'either way');
  assert.equal(chevFlowLevel(0.01), 3);
  assert.match(STAGE, /flowData\[o \+ 13\] = chevFlowLevel\(q\);/);
  assert.match(STAGE, /L\.still = reduceMotion\.matches; L\.chev = cA > 0;/);
  assert.match(GL, /if \(still == 1\) lv = max\(lv, texelFetch\(flow, ivec2\(3, id\), 0\)\.y\);/);
});

test('the flow arrowheads stand 2.5 times as far apart, by one constant on the level, so every zoom still eases between its doublings', () => {
  // (Mohammad, 31 Oct: "too many chevrons btw, can we make them less".) Added after the reduced-motion level, so that keeps its flow steps.
  const m = GL.match(/lv = max\(lv, texelFetch\(flow, ivec2\(3, id\), 0\)\.y\);[\s\S]*?float Pc = 28\.0 \* exp2\(lv\);\s*lv \+= ([\d.]+);\s*float n = floor\(lv\), fr = lv - n;/);
  assert.ok(m, 'the spread sits after the still level and after the end ramp takes its spacing');
  assert.ok(Math.abs(2 ** +m[1] - 2.5) < 1e-5, `2 ** ${m[1]} is the spacing factor`);
  // The heads shown per length (every head of the finer level, the odd ones fading as the level climbs) fall to a third to a half at any zoom.
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const dens = (lv) => { const n = Math.floor(lv), fr = lv - n; return (1 + (1 - ss(0.15, 0.85, fr))) / (2 * 28 * 2 ** n); };
  for (let lv = 0; lv < 6; lv += 0.05) {
    const r = dens(lv + +m[1]) / dens(lv);
    assert.ok(r > 0.3 && r < 0.52, `at level ${lv.toFixed(2)} the heads fall to ${r.toFixed(3)} of what they were`);
  }
  // The head's end ramp still follows the old spacing, so a short vessel's heads are no dimmer for it.
  assert.match(GL, /ramp = max\(2\.0 \* L, 0\.3 \* Pc\)/);
});

const okL = (hex) => {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s;
};
const rampOf = (id, name) => tokensOfLook(id)[name].split(',').map((x) => x.trim().split(/\s+/));
const contrast = (a, b) => {
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test('A7: the pressure ramp gets darker at every stop, in every look, so 12 and 20 mmHg differ in lightness, not only in hue', () => {
  // (Mohammad, 18 Oct: round 2 review A7. Per look since C1: the dark looks keep the rule at a higher floor.)
  for (const id of LOOK_IDS) {
    const stops = rampOf(id, 'ramp-pressure');
    assert.deepEqual(stops.map((x) => +x[1]), [0, 5, 10, 12, 20, 30]);
    const Ls = stops.map((x) => okL(x[0]));
    for (let i = 1; i < Ls.length; i++) assert.ok(Ls[i] < Ls[i - 1] - 0.03, `${id}: stop ${stops[i][1]} mmHg is not darker than ${stops[i - 1][1]}: ${Ls.map((v) => v.toFixed(3))}`);
    assert.ok(Ls[3] - Ls[4] > 0.1, `${id}: 12 and 20 mmHg differ clearly in lightness`);
  }
});

test('C1: on the dark looks every lens ramp keeps a floor (a 30 mmHg vessel was 1.41:1 against Dark), and the light looks are as they were', () => {
  const ground = { dark: '#1A1917', navy: '#0E1422', black: '#000000' };
  for (const id of ['dark', 'navy', 'black']) {
    assert.deepEqual(rampOf(id, 'ramp-pressure'), rampOf('dark', 'ramp-pressure'), `${id} takes Dark's pressure ramp`);
    const top = rampOf(id, 'ramp-pressure').at(-1)[0];
    assert.ok(contrast(top, ground[id]) >= 2.5, `${id}: 30 mmHg is ${contrast(top, ground[id]).toFixed(2)}:1`);
    assert.ok(Math.abs(okL(top) - 0.5) < 0.02, '30 mmHg sits at about L .5');
    for (const name of ['ramp-flow', 'ramp-velocity', 'ramp-heat', 'ramp-drop']) {
      const end = rampOf(id, name).at(-1)[0];
      assert.ok(okL(end) >= 0.47 && contrast(end, ground[id]) >= 2.5, `${id} ${name}: its dark end is ${end} (L ${okL(end).toFixed(3)}, ${contrast(end, ground[id]).toFixed(2)}:1)`);
    }
  }
  // Same stops, positions and bright ends as the light looks'; only the dark end moved.
  for (const name of ['ramp-flow', 'ramp-velocity', 'ramp-heat', 'ramp-drop']) {
    const lt = rampOf('light', name), dk = rampOf('dark', name);
    assert.deepEqual(dk.map((x) => x[1]), lt.map((x) => x[1]));
    assert.deepEqual(dk.slice(0, -1), lt.slice(0, -1), `${name}: every stop but the dark end is the light looks'`);
  }
  for (const name of ['ramp-flow', 'ramp-velocity', 'ramp-heat', 'ramp-drop']) assert.deepEqual(rampOf('soft', name), rampOf('light', name));
});

test('C2: Linen pales its 0 and 5 mmHg stops against the paper; Soft keeps today\'s two', () => {
  assert.deepEqual(rampOf('light', 'ramp-pressure').slice(0, 2).map((x) => x[0]), ['#B8D5ED', '#85B6E9']);
  assert.deepEqual(rampOf('soft', 'ramp-pressure').slice(0, 2).map((x) => x[0]), ['#DCEBF7', '#99C2ED']);
  assert.ok(contrast('#B8D5ED', '#F1EBE0') > 1.25, '0 mmHg on Linen');
  // The rest of the ramp is the same in both light looks.
  assert.deepEqual(rampOf('light', 'ramp-pressure').slice(2), rampOf('soft', 'ramp-pressure').slice(2));
});

test('C1: the colour tables are built again for a new look (colormap.js listens to the theme epoch)', () => {
  const cm = src('src/ui/colormap.js');
  assert.match(cm, /import \{ onTheme \} from '\.\/theme-epoch\.js';/);
  assert.match(cm, /onTheme\(\(\) => \{\s*lutBuilt = false; GRADS\.clear\(\); deltaReady = false;\s*for \(const reset of SCALES\) reset\(\);/);
  assert.match(cm, /SCALES\.push\(\(\) => \{ built = false; cssKept\.clear\(\); \}\);/);
});

test('the bleed slides frame the esophagus down to the bottom of the stomach, so the pool is on screen', async () => {
  const { REGIONS } = await import('../src/ui/decks.js');
  const { BLEED } = await import('../src/ui/decks/variceal-bleed.js');
  const [x0, y0, x1, y1] = REGIONS.bleed;
  assert.ok(x0 < 797 && y0 < 232 && x1 > 990 && y1 > LUMEN_BOTTOM + 20, 'the tear, the whole stomach and its lowest point');
  // The varices window stops at y 360, above any pool: slides with a bleed running use the taller one.
  assert.ok(REGIONS.varices[3] < LUMEN_BOTTOM);
  for (const id of ['tear', 'minutes', 'blood', 'rebleed', 'failure']) assert.equal(BLEED.slides.find((s) => s.id === id).cam, 'bleed', id);
});
