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
import { stentOutline, VW, printedParts, readStent, createFollowN, openVelocity, localVelocity, stentTitle, N_PROFILE, SIDE, sideLayout } from '../src/ui/tool-stent.js';
import { deepMerge, sanitizeParams } from '../src/engine/scenario.js';
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

test('everything lies inside the picture, for every stent size, length and text size, and no row of words touches another', () => {
  const buf = new Float64Array(4 * (N_PROFILE + 1));
  for (const fs of [9, 11, 12.8, 14]) {
    const S = sideLayout(fs, {});
    for (const d of [6, 8, 10, 12]) for (const len of [4, 8, 10]) for (const s of [0, 0.5, 0.9]) {
      const g = geomFix({ len, waist: 2, trans: 1 }, 'tips'), L = g.len * S.pxCm, x0 = S.x0 + (S.span - L) / 2;
      stentOutline(buf, x0, L, S.cy, d * S.pxMm, 0, s, g, 0.5);
      for (let i = 0; i < 2 * (N_PROFILE + 1); i++) {
        assert.ok(buf[2 * i] >= 0 && buf[2 * i] <= VW, `x ${buf[2 * i]}`);
        assert.ok(buf[2 * i + 1] > S.dimY + 4 && buf[2 * i + 1] < S.gateTop, `y ${buf[2 * i + 1]} is between the dimension line and the gates' ticks (${d} mm, words ${fs})`);
      }
    }
    // the rows, each as tall as its words (about 1.1 of their size): the dimension words, the gates' numbers, the caption, the key; none on another, all inside the picture
    const rows = [S.labY, S.numY, S.capY, S.keyY];
    for (let k = 1; k < rows.length; k++) assert.ok(rows[k] - rows[k - 1] >= fs * 1.1, `row ${k} clears row ${k - 1} at words ${fs}`);
    assert.ok(S.dimY - S.labY >= fs * 0.55, 'the dimension line is under its words');
    assert.ok(S.keyY + fs * 0.6 <= S.h && S.labY - fs * 0.6 >= -1, 'the first and last rows are inside the picture');
    assert.ok(S.h <= 130, `no tall blank band (${S.h.toFixed(0)} at words ${fs})`);
  }
});

test('the narrowing is where the profile says: the waist is s narrower, the open stent the full diameter, and a longer waist draws more of it', () => {
  const buf = new Float64Array(4 * (N_PROFILE + 1)), dPx = 10 * SIDE.pxMm, g = geomFix({ len: 8, waist: 2, trans: 0, red: 0.5 }, 'tips');
  stentOutline(buf, 0, 8 * SIDE.pxCm, 0, dPx, 0, 0, g, 0.5);   // (a 50 % waist mid stent, no end stenosis: 17 Nov 2026, the two narrowings)
  const half = (i) => -buf[2 * i + 1], mid = N_PROFILE / 2;
  assert.ok(Math.abs(half(0) - dPx / 2) < 1e-9, 'open at the portal end');
  assert.ok(Math.abs(half(mid) - (dPx / 2) * 0.5) < 1e-9, 'half the diameter at the waist');
  const narrow = (waist) => { const gg = geomFix({ len: 8, waist, trans: 0, red: 0.5 }, 'tips'); let n = 0; stentOutline(buf, 0, 8 * SIDE.pxCm, 0, dPx, 0, 0, gg, 0.5); for (let i = 0; i <= N_PROFILE; i++) if (half(i) < dPx / 2 - 1e-6) n++; return n; };
  assert.ok(narrow(3) > narrow(1) && narrow(1) > narrow(0), 'a waist that is longer is narrow over more of the stent');
  const w = waistSpan(g, 0.5);
  assert.ok(Math.abs(profileAt(g, 0, 0.5, w.c) - 0.5) < 1e-12);
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

/** The key's "In and out" number as the card prints it (the staircase's third column: Outside, Tract, In and out, Friction, Jet). */
const inOutOf = (card) => { const v = [...card.el.querySelectorAll('[data-look="stent.lab"]')].map((p) => p._t); return parseFloat(v[2]); };

// The card made and driven in jsdom (no GL there: the pictures are drawn only in a browser; the model they are drawn from is real).
async function made() {
  const { JSDOM } = await import('jsdom');
  const w = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true }).window;
  Object.assign(globalThis, { window: w, document: w.document, Element: w.Element, MutationObserver: w.MutationObserver, getComputedStyle: w.getComputedStyle.bind(w),
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame: (f) => setTimeout(f, 16), ResizeObserver: class { observe() {} disconnect() {} }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }) });
  w.document.documentElement.style.setProperty('--ramp-pressure', '#B8D5ED 0, #85B6E9 5, #6787E8 10, #925CDD 12, #A4216E 20, #680C2F 30');
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
  const outlines = pieces.filter((p) => ['stent.lumen', 'stent.graft'].includes(p.getAttribute('data-look')));
  assert.equal(outlines.length, 3, 'the lumen twice (velocity colours, pressure colours) and the cover');
  assert.equal(pieces.filter((p) => /^stent\.wire\./.test(p.getAttribute('data-look'))).length, 7, 'the device the figure draws: its rings, glint, band and tab');
  const counts = () => outlines.map((p) => p._pts.n);
  const grad = card.el.querySelector('linearGradient');
  assert.equal(grad.getAttribute('gradientUnits'), 'userSpaceOnUse', 'a path drawn from points has no box for a gradient to take: it is in the picture\'s own units');
  assert.equal(pieces.find((p) => p.getAttribute('data-look') === 'stent.lumen').getAttribute('fill'), `url(#${grad.id})`);
  assert.ok(grad.querySelectorAll('stop').length >= 17);
  assert.ok([...grad.querySelectorAll('stop')].every((st) => st._g && st._g['stop-color']), 'every stop has the colour of the lumen at its place');
  const wires = pieces.filter((p) => /^stent\.wire\./.test(p.getAttribute('data-look')));
  assert.ok(wires.find((p) => p.getAttribute('data-look') === 'stent.wire.frontCov')._polys.length > 0, 'the covered stretch\'s rings are drawn');
  assert.ok(wires.find((p) => p.getAttribute('data-look') === 'stent.wire.frontBare')._polys.length > 0, 'and the bare stretch\'s');
  const first = counts();
  assert.deepEqual(first, [2 * (N_PROFILE + 1), 2 * (N_PROFILE + 1), 2 * (N_PROFILE + 1)]);
  // the same card, a different stent: a wider one, a longer waist, tapered ends, the narrowing at the portal end, no narrowing at all
  for (const set of [(p) => { p.stentGeom = { TIPS: { len: 10, waist: 4, trans: 1 } }; p.tips.d = 12; }, (p) => { p.stenosis.TIPS = 0.8; p.stenosisSite = { TIPS: 'proximal' }; }, (p) => { p.stenosis.TIPS = 0; }]) {
    set(e.params); store.set({ params: { ...e.params } });
    card.configure({ vessel: 'TIPS', show: ['lumen', 'loss'], to: 'ppg' });
    assert.deepEqual(counts(), first, 'the same points, only moved');
  }
  const words = pieces.filter((p) => p._t != null).map((p) => p._t).join(' | ');
  assert.match(words, /PPG \d/); assert.match(words, /Across the stent \d/); assert.match(words, /In and out/); assert.match(words, /Friction/); assert.match(words, /Tract/); assert.match(words, /Outside/);
  assert.doesNotMatch(words, /Along the length|Local/, 'the old grouping is gone');
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
  assert.equal(stages.length, 2, 'a card that shows no traces makes no third picture');
  card.configure({ vessel: 'DIPS', show: ['trace'] });
  assert.equal(card.el.querySelectorAll('.sc-stage').length, 3, 'made when a slide first asks for it');
  card.dispose();
});

test('the trace card: fixed curves that start at the PPG and end at zero, five sites in order, one set of pieces for any stent and any panels', async () => {
  const { card, store, doc } = await made();
  doc.body.append(card.el);
  const { e, fp } = settled((x) => { x.params.stenosis.TIPS = 0.5; });
  store.set({ params: e.params });
  card.configure({ vessel: 'TIPS', show: ['trace'] });
  card.pin(fp);
  await new Promise((r) => setTimeout(r, 1500));   // (the glide from nothing to the slide's numbers)
  const pieces = [...card.el.querySelectorAll('[data-look]')];
  for (const p of pieces) assert.ok(LOOKS[p.getAttribute('data-look')], `${p.getAttribute('data-look')} is in the table`);
  const kind = (re) => pieces.filter((p) => re.test(p.getAttribute('data-look')));
  assert.equal(kind(/^stent\.tr\.line\./).length, 3);
  assert.equal(kind(/^stent\.tr\.badge$/).length, 5);
  assert.equal(kind(/^stent\.tr\.site$/).length, 5);
  const lines = kind(/^stent\.tr\.line\./);
  for (const b of [...card.el.querySelectorAll('.sc-tracesw button')].reverse()) { b.click(); await new Promise((r) => setTimeout(r, 1200)); }   // (each chart in turn, ending on the pressure)
  const nPts = lines.map((p) => p._pts.n);
  assert.deepEqual(nPts, [161, 161, 161]);
  for (const l of lines) for (let i = 0; i < 2 * l._pts.n; i++) assert.ok(Number.isFinite(l._pts.buf[i]), `every point is a number ${l.getAttribute('data-look')} ${i} ${l._pts.buf[i]}`);
  // the pressure curve falls from the PPG's height at the portal end to the baseline at the IVC end; the energy curve rises over the same x
  const [pr, en] = lines, b = pr._pts.buf, c = en._pts.buf;
  assert.ok(b[1] < b[2 * 160 + 1] - 1, 'the pressure ends lower than it starts (y runs down the picture)');
  assert.ok(c[1] > c[2 * 160 + 1] + 1, 'the energy lost ends higher than it starts');
  for (let i = 1; i <= 160; i++) assert.ok(b[2 * i] > b[2 * i - 2], 'x runs one way');
  const badges = kind(/^stent\.tr\.badge$/).map((p) => p._g.cx);
  for (let k = 1; k < 5; k++) assert.ok(badges[k] >= badges[k - 1], 'the sites run portal to IVC');
  const words = pieces.filter((p) => p._t != null).map((p) => p._t).join(' | ');
  assert.match(words, /Static pressure/); assert.match(words, /Energy lost/); assert.match(words, /Mean velocity/); assert.match(words, /Schematic/);
  assert.doesNotMatch(words, /HVPG|wedge/i);
  // another stent, the velocity chart: the same curves, only moved; the chart the slide asked for is the one in view, the switch fades the others
  e.params.tips.d = 12; e.params.stentGeom = { TIPS: { len: 10, waist: 4, trans: 1 } };
  store.set({ params: { ...e.params } });
  card.configure({ vessel: 'TIPS', show: ['trace'], pick: 'velocity' });
  await new Promise((r) => setTimeout(r, 1500));
  assert.deepEqual(lines.map((p) => p._pts.n), nPts);
  assert.equal(lines[2]._g.opacity, 1); assert.equal(lines[0]._g.opacity, 0);
  const sw = [...card.el.querySelectorAll('.sc-tracesw button')];
  assert.deepEqual(sw.map((b) => b.textContent), ['Pressure', 'Energy lost', 'Velocity']);
  sw[0].click();
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(lines[0]._g.opacity, 1); assert.equal(lines[2]._g.opacity, 0);
  card.dispose();
});

test('the bar prints the stent\'s own entry and exit loss, never 0.0 for a patient that has it, under a name that is not the Ends control\'s', async () => {
  const { card, store, doc } = await made();
  doc.body.append(card.el);
  for (const [d, s] of [[8, 0.25], [8, 0.6], [10, 0.6]]) {
    const e = new Engine(); e.loadPreset('cirr-decomp');
    e.setParams(sanitizeParams(deepMerge(e.params, { tips: { on: true, d }, stenosis: { TIPS: s }, pulsatile: false, respiration: false })));
    e.settle(3);
    const m = computeMetrics(e), fp = fingerprintOf(m, { params: e.params });
    store.set({ params: { ...e.params } });
    card.pin(fp); card.configure({ vessel: 'TIPS', show: ['loss'], to: 'ppg' });
    await new Promise((r) => setTimeout(r, 1500));
    assert.ok([...card.el.querySelectorAll('[data-look="stent.key.text"]')].some((p) => p._t === 'In and out'), 'the key names it');
    const want = m.tips.parts.entry * (m.tips.dp / (m.tips.parts.tract + m.tips.parts.wall + m.tips.parts.entry + m.tips.parts.jet + m.tips.parts.inlet));
    assert.ok(want > 0.05, `this patient has an entry loss (${want})`);
    assert.ok(Math.abs(inOutOf(card) - want) <= 0.11, `${inOutOf(card)} for ${want.toFixed(2)} at ${d} mm and ${s}`);
  }
  assert.ok(![...card.el.querySelectorAll('[data-look="stent.key.text"]')].some((p) => /^Ends/.test(p._t)), 'no part is called Ends');
  card.dispose();
});

test('the lumen is coloured by velocity or by pressure: the switch fades one over the other, and the pressure colours fall along the stent', async () => {
  const { card, store, doc } = await made();
  doc.body.append(card.el);
  const { e, fp } = settled((x) => { x.params.stenosis.TIPS = 0.5; });
  store.set({ params: e.params });
  card.configure({ vessel: 'TIPS', show: ['lumen'] });
  card.pin(fp);
  await new Promise((r) => setTimeout(r, 1500));
  const lum = [...card.el.querySelectorAll('[data-look="stent.lumen"]')];
  assert.equal(lum.length, 2);
  assert.equal(lum[1]._g.opacity, 0, 'velocity colours to start with');
  const btns = [...card.el.querySelectorAll('.sc-color button')];
  assert.deepEqual(btns.map((b) => b.textContent), ['Velocity', 'Pressure']);
  btns[1].click();
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(lum[1]._g.opacity, 1, 'pressure colours over it');
  assert.equal(btns[1].getAttribute('aria-pressed'), 'true');
  const stops = [...card.el.querySelectorAll(`linearGradient[id$="p"] stop`)].map((st) => st._g['stop-color']);
  assert.ok(stops.length >= 17 && stops.every((c) => c && c !== '#888888'), 'every stop has a pressure colour');
  assert.ok(new Set(stops).size > 3, 'the colour changes along the stent');
  card.configure({ vessel: 'TIPS', show: ['lumen'] });
  assert.equal(btns[1].getAttribute('aria-pressed'), 'true', 'a slide that does not ask leaves the viewer\'s choice');
  btns[0].click();
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(lum[1]._g.opacity, 0, 'and the switch goes back');
  card.dispose();
  const b = await made();
  b.doc.body.append(b.card.el); b.store.set({ params: e.params });
  b.card.configure({ vessel: 'TIPS', show: ['lumen'], color: 'pressure' }); b.card.pin(fp);
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal([...b.card.el.querySelectorAll('[data-look="stent.lumen"]')][1]._g.opacity, 1, 'a slide can ask for pressure');
  b.card.dispose();
});

test('a live frame (the Tests dock\'s, the metrics untouched) prints the in-and-out loss: 0.3 at a 60 % abrupt waist, never 0.0', async () => {
  const { card, store, doc } = await made();
  doc.body.append(card.el);
  for (const trans of [0, 1]) {
    const e = new Engine(); e.loadPreset('cirr-decomp');
    e.setParams(sanitizeParams(deepMerge(e.params, { tips: { on: true, d: 10 }, stenosis: { TIPS: 0.6 }, stentGeom: { TIPS: { len: 8, waist: 1, trans } }, pulsatile: false, respiration: false })));
    e.settle(3);
    const m = computeMetrics(e);
    store.set({ params: { ...e.params } });
    card.configure({ vessel: 'TIPS', show: ['lumen', 'loss'], to: 'ppg' });
    card.update({ metrics: m });
    await new Promise((r) => setTimeout(r, 1500));
    const val = inOutOf(card), inOut = `In and out ${val}`;
    assert.ok(val >= 0.2 && val <= 0.4, `${inOut} (the engine has ${m.tips.parts.entry.toFixed(2)}) with ends ${trans ? 'tapered' : 'abrupt'}`);
  }
  card.dispose();
});

test('the card with one switch: the stent, and under it the chart of the lens (velocity, pressure, or where it goes), the colour and the chart changing together', async () => {
  const { card, store, doc } = await made();
  doc.body.append(card.el);
  const { e, fp } = settled((x) => { x.params.stenosis.TIPS = 0.5; });
  store.set({ params: e.params });
  card.configure({ vessel: 'TIPS', show: ['card'], to: 'ppg' });
  card.pin(fp);
  await new Promise((r) => setTimeout(r, 1500));
  const btns = [...card.el.querySelectorAll('.sc-lens button')];
  assert.deepEqual(btns.map((b) => b.textContent), ['Velocity', 'Pressure', 'Where it goes']);
  const stages = () => [...card.el.querySelectorAll('.sc-stage')].map((s) => !s.hidden && s.style.display !== 'none');
  const lum = [...card.el.querySelectorAll('[data-look="stent.lumen"]')];
  const lines = () => [...card.el.querySelectorAll('[data-look^="stent.tr.line."]')].map((p) => p._g.opacity);
  assert.equal(lum[1]._g.opacity, 0, 'velocity colours first');
  assert.deepEqual(lines(), [0, 0, 1], 'and the velocity chart');
  btns[1].click(); await new Promise((r) => setTimeout(r, 1500));
  assert.equal(lum[1]._g.opacity, 1, 'pressure colours');
  assert.deepEqual(lines(), [1, 0, 0], 'and the pressure chart');
  btns[2].click(); await new Promise((r) => setTimeout(r, 1500));
  assert.equal(card.el.querySelectorAll('.sc-color, .sc-tracesw').length, 2, 'the two older switches exist but are not shown in this card');
  assert.equal(btns[2].getAttribute('aria-pressed'), 'true');
  void stages;
  card.dispose();
});

test('the flow: a fixed set of streaks carried along the lumen, faster where the lumen is narrow, none for a stent with no flow', async () => {
  const { card, store, doc } = await made();
  doc.body.append(card.el);
  const { e, fp } = settled((x) => { x.params.stenosis.TIPS = 0.6; });
  store.set({ params: e.params });
  card.configure({ vessel: 'TIPS', show: ['lumen'] });
  card.pin(fp);
  await new Promise((r) => setTimeout(r, 1500));
  const flow = [...card.el.querySelectorAll('[data-look="stent.flow"]')][0];
  assert.ok(flow && flow._pts.n === 36 * 3, 'one path of 36 streaks (a tail, a head and a lifted pen each)');
  assert.equal(flow._g.opacity, 1);
  const before = Array.from(flow._pts.buf);
  await new Promise((r) => setTimeout(r, 400));
  const after = Array.from(flow._pts.buf);
  let moved = 0;
  for (let i = 0; i < 36; i++) { assert.ok(Number.isFinite(after[6 * i]) && Number.isFinite(after[6 * i + 1])); if (Math.abs(after[6 * i + 2] - before[6 * i + 2]) > 0.5 && after[6 * i + 2] > before[6 * i + 2]) moved++; assert.ok(after[6 * i + 2] > after[6 * i], 'a streak runs with the flow: its head is ahead of its tail'); }
  assert.ok(moved >= 20, `${moved} of 36 streaks moved on`);
  card.pin({ ...fp, tipsFlow: 0, tipsG0: 0, tipsG1: 0, tipsG2: 0 });
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(flow._g.opacity, 0, 'a stent with no flow has no streaks');
  card.dispose();
});
