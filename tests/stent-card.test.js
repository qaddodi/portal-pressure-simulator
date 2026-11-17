// The stent cards (src/ui/tool-stent.js, 16 Nov 2026): the side view and the bar of where the pressure goes. They draw on the GPU, so the unit tests keep to
// what can be known without a browser: the outline is one fixed set of points whatever the geometry (so it glides), the printed parts add up to the printed
// drop, the card reads the numbers the tiles read, its colour is the figure's, and it says nothing it must not (an HVPG) and does nothing off the GPU.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { fingerprintOf } from '../src/engine/fingerprint.js';
import { PROBE_NORMAL, velNormal } from '../src/ui/velNormal.js';
import { EDGES } from '../src/engine/topology.js';
import { LOOKS } from '../src/ui/chart-looks/index.js';
import { makeCtx, withCtx, resolveProps } from '../src/ui/chart-looks/resolve.js';
import { EXT } from '../src/ui/slide-ext.js';
import { stentOutline, printedParts, readStent, createFollowN, openVelocity, localVelocity, stentTitle, N_PROFILE, SIDE } from '../src/ui/tool-stent.js';
import { geomFix, profileAt, waistSpan } from '../src/engine/stent-geom.js';

function settled(setup) {
  const e = new Engine();
  e.params.tips.on = true; e.params.tips.d = 10;
  setup?.(e);
  for (let i = 0; i < 1500; i++) e.step(0.05);
  const m = computeMetrics(e);
  return { e, m, fp: fingerprintOf(m, { params: e.params }) };
}

test('the outline has the same number of points for every geometry, so the picture glides rather than swaps', () => {
  const buf = new Float64Array(4 * (N_PROFILE + 1)), want = 2 * (N_PROFILE + 1);
  for (const [len, waist, trans, s, d, site] of [[8, 1, 0, 0, 10, 0.5], [8, 1, 0, 0.4, 10, 5 / 6], [10, 4, 1, 0.7, 12, 0.5], [4, 0, 0, 0.5, 6, 1 / 6], [6, 3, 2, 0.8, 8, 0.5]]) {
    const g = geomFix({ len, waist, trans }, 'tips'), L = g.len * SIDE.pxCm, n = stentOutline(buf, 30, L, 66, d * SIDE.pxMm, 0, s, g, site);
    assert.equal(n, want);
    for (let i = 0; i < 2 * want; i++) assert.ok(Number.isFinite(buf[i]), `point ${i}`);
    // the top edge runs from the portal end to the hepatic end, the bottom edge back, mirrored about the axis
    assert.equal(buf[0], 30); assert.ok(Math.abs(buf[2 * (N_PROFILE)] - (30 + L)) < 1e-9);
    for (let i = 0; i <= N_PROFILE; i++) {
      const q = 2 * N_PROFILE + 1 - i;
      assert.ok(Math.abs(buf[2 * i] - buf[2 * q]) < 1e-12 && Math.abs((66 - buf[2 * i + 1]) - (buf[2 * q + 1] - 66)) < 1e-9, `mirrored at ${i}`);
    }
  }
});

test('the narrowing is where the profile says: the waist is s narrower, the open stent the full diameter, and a longer waist draws more of it', () => {
  const buf = new Float64Array(4 * (N_PROFILE + 1)), dPx = 10 * SIDE.pxMm, g = geomFix({ len: 8, waist: 2, trans: 0 }, 'tips');
  stentOutline(buf, 0, 8 * SIDE.pxCm, 0, dPx, 0, 0.5, g, 0.5);
  const half = (i) => -buf[2 * i + 1], mid = N_PROFILE / 2;
  assert.ok(Math.abs(half(0) - dPx / 2) < 1e-9, 'open at the portal end');
  assert.ok(Math.abs(half(mid) - (dPx / 2) * 0.5) < 1e-9, 'half the diameter at the waist');
  const narrow = (waist) => { const gg = geomFix({ len: 8, waist, trans: 0 }, 'tips'); let n = 0; stentOutline(buf, 0, 8 * SIDE.pxCm, 0, dPx, 0, 0.5, gg, 0.5); for (let i = 0; i <= N_PROFILE; i++) if (half(i) < dPx / 2 - 1e-6) n++; return n; };
  assert.ok(narrow(3) > narrow(1) && narrow(1) > narrow(0), 'a waist that is longer is narrow over more of the stent');
  const w = waistSpan(g, 0.5);
  assert.ok(Math.abs(profileAt(g, 0.5, 0.5, w.c) - 0.5) < 1e-12);
});

test('the printed parts add up to the printed drop, whatever the split', () => {
  const out = [];
  for (const parts of [[0.9, 4.1, 1, 1.1], [2.04, 2.04, 2.04, 1], [0.04, 0.04, 0.04, 0.04], [7, 0, 0, 0], [0, 0, 0, 0], [1.25, 1.25, 1.25, 1.25], [3.333, 3.333, 0.333, 0]]) {
    const total = printedParts(parts, out), sum = out.reduce((a, b) => a + b, 0);
    assert.equal(sum, total, `${parts}`);
    assert.equal(total, Math.round(parts.reduce((a, b) => a + b, 0) * 10));
    out.forEach((v, i) => assert.ok(Math.abs(v - parts[i] * 10) < 1 + 1e-9, `no part is moved more than a tenth: ${parts[i]} → ${v / 10}`));
  }
});

test('the card reads the numbers the tiles read: from the slide\'s fingerprint, or from a frame\'s metrics, the same', () => {
  const { m, fp } = settled((e) => { e.params.stenosis.TIPS = 0.4; });
  const a = readStent(fp, 'TIPS'), b = readStent({ metrics: m }, 'TIPS');
  assert.ok(a && b);
  for (const k of ['flow', 'dp', 'g0', 'g1', 'g2', 'tract', 'wall', 'ends', 'jet', 'ppg', 'lumen', 'vel']) assert.ok(Math.abs(a[k] - b[k]) < 1e-9, k);
  assert.equal(a.flow, fp.tipsFlow); assert.equal(a.dp, fp.tipsDp); assert.equal(a.vel, fp.tipsVel);
  assert.equal(a.vel, Math.max(a.g0, a.g1, a.g2), 'the peak tile is the highest of the three points the card prints');
  assert.ok(Math.abs(a.tract + a.wall + a.ends + a.jet - a.dp) < 0.35 * a.dp, 'the four parts are the stent\'s drop, to what the smoothed flow leaves');
  const none = settled((e) => { e.params.tips.on = false; });
  assert.equal(readStent(none.fp, 'TIPS'), null);
  assert.equal(readStent({ metrics: none.m }, 'TIPS'), null);
});

test('the drop across the stent is less than the PPG, and the bar\'s outside part is what is left', () => {
  const { fp } = settled((e) => { e.params.stenosis.TIPS = 0.4; });
  const r = readStent(fp, 'TIPS');
  assert.ok(r.dp < r.ppg, `across the stent ${r.dp} is less than the PPG ${r.ppg}`);
  assert.ok(r.dp > 0.3 * r.ppg);
});

test('the lumen is coloured as the figure paints the stent: the same ramp against the same 90 to 190 cm/s', () => {
  assert.deepEqual([...PROBE_NORMAL.TIPS], [90, 190]);
  assert.deepEqual([...PROBE_NORMAL.DIPS], [90, 190]);
  const k = EDGES.findIndex((e) => e.id === 'TIPS');
  const f = { D: new Float64Array(EDGES.length).fill(10), Q: new Float64Array(EDGES.length) };
  assert.deepEqual([...velNormal(k, f, null)], [90, 190], 'the figure reads a stent against it');
  // the local velocity: the open stent's over the share of the lumen squared; a half-width waist runs four times as fast
  const v0 = openVelocity(1.6, 10, 'TIPS');
  assert.ok(v0 > 40 && v0 < 120, `an open 10 mm stent at 1.6 L/min reads ${v0}`);
  assert.ok(Math.abs(localVelocity(v0, 0.5) - 4 * v0) < 1e-9);
  assert.equal(localVelocity(v0, 1), v0);
});

test('the three Doppler points are the Doppler card\'s own numbers, and a narrowing raises the highest', () => {
  const open = readStent(settled().fp, 'TIPS'), narrow = readStent(settled((e) => { e.params.stenosis.TIPS = 0.6; }).fp, 'TIPS');
  assert.ok(narrow.vel > open.vel * 1.5, `${narrow.vel} against ${open.vel}`);
  assert.ok(narrow.jet > open.jet, 'a narrowing has a jet');
  assert.ok(open.jet < 1e-6 || open.jet < narrow.jet / 3);
});

test('the follower runs a jump as a glide, a stream straight, and settles on the goal', () => {
  const f = createFollowN(3), a = new Float64Array([0, 0, 0]), b = new Float64Array([1, 0.5, 0]);
  f.snap(a);
  assert.equal(f.goal(b, 1000), true);
  assert.equal(f.glide, true, 'a jump of this size is glided');
  assert.equal(f.at(1100), true);
  assert.ok(f.v[0] > 0 && f.v[0] < 1);
  assert.equal(f.at(5000), false);
  assert.deepEqual([...f.v], [1, 0.5, 0]);
  const c = new Float64Array([1.004, 0.5, 0]);
  assert.equal(f.goal(c, 5100), true);
  assert.equal(f.glide, false, 'a small step after a quiet spell is followed straight');
  assert.equal(f.goal(c, 5110), true, 'the same goal asked again while moving keeps moving');
});

test('the card is named by what it shows', () => {
  assert.equal(stentTitle({}), 'TIPS, side view');
  assert.equal(stentTitle({ vessel: 'DIPS', show: ['lumen'] }), 'DIPS, side view');
  assert.equal(stentTitle({ vessel: 'TIPS', show: ['loss'] }), 'TIPS, where the pressure goes');
  assert.equal(EXT.owner.tools.stent, 'S');
  assert.equal(EXT.tools.stent.short({ show: ['loss'] }), 'Pressure loss');
});

test('every look the card names is in the table, and every look resolves in every look with no missing token', () => {
  const mine = Object.keys(LOOKS).filter((k) => k.startsWith('stent.'));
  assert.ok(mine.length >= 25);
  for (const [theme, dark] of [['light', false], ['soft', false], ['dark', true]]) for (const palette of ['navy', 'black']) {
    const c = withCtx(makeCtx({ host: '', scale: {} }), { theme, dark, palette });
    for (const k of mine) for (const v of Object.values(resolveProps(LOOKS[k], c, {}, {}))) assert.doesNotMatch(String(v), /255, 0, 255/, `${k} ${theme}/${palette}`);
  }
});

// The card made and driven in jsdom (no GL there: the pictures are drawn only in a browser; the model they are drawn from is real).
async function made() {
  const { JSDOM } = await import('jsdom');
  const w = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true }).window;
  Object.assign(globalThis, { window: w, document: w.document, Element: w.Element, MutationObserver: w.MutationObserver, getComputedStyle: w.getComputedStyle.bind(w),
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame: (f) => setTimeout(f, 16), ResizeObserver: class { observe() {} disconnect() {} }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }) });
  w.document.documentElement.style.setProperty('--ramp-velocity', '#C9973F 0, #E2CF9A .2, #5DB4A4 .5, #9A7ED6 .8, #4A2A8C 1');
  const { createStent } = await import('../src/ui/tool-stent.js');
  const { store } = await import('../src/ui/store.js');
  return { card: createStent(), store, doc: w.document };
}

test('the made card: every piece has a look, its outline keeps its point count through any change, its words are the stent\'s and never an HVPG', async () => {
  const { card, store, doc } = await made();
  doc.body.append(card.el);
  const { e, fp } = settled((x) => { x.params.stenosis.TIPS = 0.4; });
  store.set({ params: e.params });
  card.configure({ vessel: 'TIPS', show: ['lumen', 'loss'], to: 'ppg' });
  card.pin(fp);
  const pieces = [...card.el.querySelectorAll('[data-look]')];
  assert.ok(pieces.length > 40, `${pieces.length} pieces`);
  for (const p of pieces) assert.ok(LOOKS[p.getAttribute('data-look')], `${p.getAttribute('data-look')} is in the table`);
  const outlines = pieces.filter((p) => ['stent.wall', 'stent.lumen'].includes(p.getAttribute('data-look')));
  assert.equal(outlines.length, 2);
  const counts = () => outlines.map((p) => p._pts.n);
  const first = counts();
  assert.deepEqual(first, [2 * (N_PROFILE + 1), 2 * (N_PROFILE + 1)]);
  // the same card, a different stent: a wider one, a longer waist, tapered ends, the narrowing at the portal end, no narrowing at all
  for (const set of [(p) => { p.stentGeom = { TIPS: { len: 10, waist: 4, trans: 1 } }; p.tips.d = 12; }, (p) => { p.stenosis.TIPS = 0.8; p.stenosisSite = { TIPS: 'proximal' }; }, (p) => { p.stenosis.TIPS = 0; }]) {
    set(e.params); store.set({ params: { ...e.params } });
    card.configure({ vessel: 'TIPS', show: ['lumen', 'loss'], to: 'ppg' });
    assert.deepEqual(counts(), first, 'the same points, only moved');
  }
  const words = pieces.filter((p) => p._t != null).map((p) => p._t).join(' | ');
  assert.match(words, /Stent \d/); assert.match(words, /PPG \d/); assert.match(words, /Along the length/); assert.match(words, /Outside the stent/);
  assert.doesNotMatch(words, /HVPG|wedge/i);
  card.pin({ tipsFlow: null });   // (the stent comes out: it fades, its outline stays, "No stent" is the word)
  assert.deepEqual(counts(), first);
  card.dispose();
});

test('the card shows the slide\'s pictures and fades the rest; it keeps no frame of its own outside the scheduler', async () => {
  const { card, doc } = await made();
  doc.body.append(card.el);
  card.configure({ vessel: 'DIPS', show: ['loss'] });
  const stages = [...card.el.querySelectorAll('.sc-stage')];
  assert.equal(stages.length, 2);
  card.dispose();
});
