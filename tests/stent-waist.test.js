// A stent's drawn waist and the pressure colour's steps along it (src/ui/stent-waist.js, pressure-along.js, lesion-ease.js; 17 Nov 2026): the narrowed
// stretch lengthens with the waist's length and the stent never stretches; the colour's jet step sits at the waist's downstream end and moves when the
// flow reverses; a uniform stent has no step; switching the ends eases. Node only: the figure's own run of it is tests/stent-waist-figure.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stentWaist, lossShares } from '../src/ui/stent-waist.js';
import { alongCurve, LOSS_SPAN } from '../src/ui/pressure-along.js';
import { lesionEase, GEOM_SNAP } from '../src/ui/lesion-ease.js';
import { geomFix, profileAt, stentParts, waistSpan, endSpan } from '../src/engine/portal/stent-geom.js';
import { STENT_SITES } from '../src/engine/portal/topology.js';

const N = 64, S = 0.6, W = 12, LEN = 160;
// (A narrowing mid stent is the waist, g.red; at an end, the end stenosis s: stent-geom.js, since 17 Nov 2026.)
const factors = (g, s = S, site = STENT_SITES.mid, id = 'T') => { const f = site === STENT_SITES.mid ? stentWaist(id, { ...g, red: s }, 0, site, W, LEN) : stentWaist(id, g, s, site, W, LEN); return Array.from({ length: 4 * N + 1 }, (_, i) => f(i / (4 * N))); };
// The narrowed stretch: the share of the stent's length where the lumen is below half way down.
const narrowShare = (k, s = S) => k.filter((v) => v < 1 - s / 2).length / k.length;

test('the drawn waist lengthens with the waist length, and the stent is always drawn end to end', () => {
  let prev = 0;
  for (const waist of [0.5, 1, 2, 3, 4, 5, 6]) {
    const k = factors({ len: 8, waist, trans: 0 });
    const share = narrowShare(k);
    assert.ok(share > prev, `waist ${waist} cm: ${share} after ${prev}`);
    assert.ok(Math.abs(share - waist / 8) < 0.06, `waist ${waist} cm draws ${share} of the stent, not ${waist / 8}`);
    assert.equal(k.length, 4 * N + 1);
    assert.ok(k[0] > 0.99 && k.at(-1) > 0.99, 'the stent is open at both ends: it is not stretched or cut');
    assert.ok(Math.min(...k) > 1 - S - 0.011, 'the waist is as deep as the narrowing says');
    assert.ok(Math.min(...k) < 1 - S + 0.04, 'and no shallower (a pinch of 1 cm or less is drawn a little shallower, smoothed)');
    prev = share;
  }
});

test('the default stent reads as the 1 cm pinch it always drew', () => {
  const k = factors({ len: 8, waist: 1, trans: 0 }, 0.6, STENT_SITES.distal);
  const lo = k.indexOf(Math.min(...k)) / (4 * N);
  assert.ok(Math.abs(lo - 5 / 6) < 0.08, `the pinch sits in the distal third, ${lo}`);
  assert.ok(Math.abs(narrowShare(k) - 0.125) < 0.04);
});

test('a waist of no length is still drawn, as a pinch; smooth: no kink wider than a step in the table', () => {
  const k = factors({ len: 8, waist: 0, trans: 0 });
  assert.ok(Math.min(...k) < 1 - S + 0.05, `the pinch reaches the narrowing, ${Math.min(...k)}`);
  for (const g of [{ len: 8, waist: 3, trans: 0 }, { len: 8, waist: 3, trans: 1 }]) {
    const f = factors(g);
    for (let i = 2; i < f.length; i++) assert.ok(Math.abs(f[i] - 2 * f[i - 1] + f[i - 2]) < 0.2, `no kink at ${i}`);
  }
});

test('tapered ends make a ramp: the drawn stretch below the waist grows with the taper', () => {
  const a = factors({ len: 8, waist: 2, trans: 0 }), b = factors({ len: 8, waist: 2, trans: 1 });
  const wide = (k) => k.filter((v) => v < 0.97).length;
  assert.ok(wide(b) > wide(a) + 8, `${wide(b)} against ${wide(a)}`);
});

test('the table is made once for the same numbers, and again when one changes', () => {
  const g = { len: 8, waist: 3, trans: 0 };
  const f = stentWaist('M', g, S, 0.5, W, LEN);
  assert.equal(stentWaist('M', { ...g }, S, 0.5, W, LEN), f);
  assert.notEqual(stentWaist('M', { ...g, waist: 3.5 }, S, 0.5, W, LEN), f);
});

// ── The pressure colour ──
const flat = () => new Array(N).fill(1);
const narrowed = (g, s = S, site = STENT_SITES.mid) => { const f = stentWaist('C', { ...g, red: s }, 0, site, W, LEN); return Array.from({ length: N }, (_, i) => f(i / (N - 1))); };
const steepest = (a) => { let m = 0, at = 0; for (let i = 1; i < a.length; i++) if (a[i] - a[i - 1] > m) { m = a[i] - a[i - 1]; at = i; } return { m, at: at / (a.length - 1) }; };
// (The narrowing here is the stent's mid waist, g.red = s: stent-geom.js, since 17 Nov 2026.)
const parts = (kind, d, q, s, g) => { const r = stentParts(kind, d, q, 1, 0, { ...g, red: s }, {}); for (const f of ['tract', 'wall', 'waistWall', 'entry', 'jet', 'inlet', 'jetEnd', 'jetWaist', 'wallEnd', 'wallWaist', 'total']) r[f] *= q; return r; };

test('a uniform stent has no colour step: no curve at all, so the colour mixes by arc', () => {
  assert.equal(alongCurve(flat(), new Float32Array(N), { jet: 0.4, ends: 0.1, at: 0.6, dir: 1 }), null);
});

test('the jet is a rise at the waist\'s downstream end, and it moves to the other end when the flow reverses', () => {
  const g = geomFix({ len: 8, waist: 2, trans: 0 }, 'tips'), site = STENT_SITES.mid, k = narrowed(g);
  const pr = parts('tips', 10, 20, S, g);
  const span = waistSpan(g, {});
  const fw = lossShares(pr, g, site, 1, {}), rv = lossShares(pr, g, site, -1, {});
  // (The waist's jet is the second one, jet2 at at2: the first is the end stenosis's, none here.)
  const fwd = { jet: fw.jet2, at: fw.at2, dir: 1 }, rev = { jet: rv.jet2, at: rv.at2, dir: -1 };
  assert.equal(fw.jet, 0, 'no end stenosis, no first jet');
  assert.ok(fwd.jet > 0.1 && fwd.jet < 0.9, `the jet's share, ${fwd.jet}`);
  assert.ok(Math.abs(fwd.at - span.b0) < 1e-9 && Math.abs(rev.at - span.a0) < 1e-9, 'the flow\'s sign picks the end');
  // With the friction alone, the colour falls fast across the waist; the jet's step is the steepest part, just past the end the flow leaves by.
  const a = alongCurve(k, new Float32Array(N), { ...fwd, ends: 0 }), b = alongCurve(k, new Float32Array(N), { ...rev, ends: 0 });
  const sa = steepest(a), sb = steepest(b);
  assert.ok(sa.at > span.b0 - 0.02 && sa.at < span.b0 + LOSS_SPAN + 0.05, `forward: step at ${sa.at}, waist ends ${span.b0}`);
  assert.ok(sb.at > span.a0 - LOSS_SPAN - 0.05 && sb.at < span.a0 + 0.05, `reversed: step at ${sb.at}, waist starts ${span.a0}`);
  assert.ok(sa.at > sb.at + 0.1, 'the step moved with the flow');
  for (const c of [a, b]) { assert.equal(c[0], 0); assert.equal(c[N - 1], 1); for (let i = 1; i < N; i++) assert.ok(c[i] >= c[i - 1] - 1e-6, 'never back'); }
});

test('the jet\'s rise is its share of the whole fall, spread over a few samples, and the friction keeps the rest', () => {
  const g = geomFix({ len: 8, waist: 2, trans: 0 }, 'tips'), k = narrowed(g);
  const none = alongCurve(k, new Float32Array(N), null), lo = 0.3;
  const withJet = alongCurve(k, new Float32Array(N), { jet: lo, ends: 0, at: 0.8, dir: 1 });
  assert.ok(withJet[Math.round(0.78 * (N - 1))] < none[Math.round(0.78 * (N - 1))] + 1e-6, 'before the exit the colour has fallen no more than the friction alone says');
  const step = withJet[Math.round((0.8 + LOSS_SPAN) * (N - 1))] - withJet[Math.round(0.8 * (N - 1))];
  assert.ok(step > lo * 0.9 && step < lo + 0.05, `the jet's step is its ${lo} share, ${step}`);
  const ends = alongCurve(k, new Float32Array(N), { jet: 0, ends: 0.2, at: 0.5, dir: 1 });
  assert.ok(ends[2] > 0.05 && 1 - ends[N - 3] > 0.05, 'half the entrance and exit loss at each end');
});

test('a stent with no local loss keeps the colour it had', () => {
  const k = narrowed(geomFix({ len: 8, waist: 1, trans: 0 }, 'tips'));
  assert.deepEqual(Array.from(alongCurve(k, new Float32Array(N), { jet: 0, ends: 0, at: 0.5, dir: 1 })), Array.from(alongCurve(k, new Float32Array(N))));
});

test('abrupt to tapered: the jet\'s share falls with the cone and the colour changes by steps no bigger than a frame of easing', () => {
  const site = STENT_SITES.mid;
  let prev = null;
  for (let tr = 0; tr <= 1.0001; tr += 0.05) {
    const g = geomFix({ len: 8, waist: 2, trans: tr }, 'tips'), sh = lossShares(parts('tips', 10, 20, S, g), g, site, 1, {});
    const c = alongCurve(narrowed(g), new Float32Array(N), sh);
    if (prev) for (let i = 0; i < N; i++) assert.ok(Math.abs(c[i] - prev[i]) < 0.12, `ends ${tr.toFixed(2)}: sample ${i} moved ${Math.abs(c[i] - prev[i])}`);
    prev = Float32Array.from(c);
  }
});

// ── The easing ──
const P = (g) => ({ stenosis: { TIPS: 0.6 }, thrombus: {}, stentGeom: g });
test('a stent\'s waist and ends ease to the params: no pop on a drag or on Abrupt to Tapered', () => {
  const l = lesionEase(), raw0 = P({ TIPS: { len: 8, waist: 1, trans: 0 } });
  assert.equal(l.view(raw0, 0), raw0);
  const goal = P({ TIPS: { len: 8, waist: 4, trans: 1 } });
  assert.ok(l.differs(goal));
  const seen = [];
  for (let i = 0; i < 200 && l.differs(goal); i++) seen.push(l.view(goal, 1 / 60).stentGeom.TIPS);
  assert.ok(seen.length > 10 && seen.length < 80, `${seen.length} frames`);
  for (let i = 1; i < seen.length; i++) {
    assert.ok(seen[i].waist >= seen[i - 1].waist && seen[i].trans >= seen[i - 1].trans, 'only forward');
    assert.ok(seen[i].waist - seen[i - 1].waist < 1.7, 'no frame takes the whole of it');
  }
  assert.ok(seen[0].waist > 1 && seen[0].waist < 3 && seen[0].trans > 0 && seen[0].trans < 1, 'the first frame is a step on the way');
  assert.equal(l.view(goal, 1 / 60), goal, 'at rest the params themselves come back');
  assert.equal(l.differs(goal), false);
  assert.ok(GEOM_SNAP > 0);
});

test('a first write of a stent\'s geometry eases from its defaults, not from nothing', () => {
  const l = lesionEase();
  l.view(P({}), 0);
  const goal = P({ TIPS: { len: 8, waist: 4, trans: 0 } });
  const first = l.view(goal, 1 / 60).stentGeom.TIPS;
  assert.equal(first.len, 8, 'the stent keeps its length');
  assert.ok(first.waist > 1 && first.waist < 4, `the waist starts from 1 cm, ${first.waist}`);
  // And the params going back to nothing ease back to the defaults, then leave the record.
  const back = P({});
  for (let i = 0; i < 200 && l.differs(back); i++) l.view(back, 1 / 60);
  assert.equal(l.differs(back), false);
  assert.equal(l.view(back, 1 / 60), back);
});

test('the profile the figure draws is the engine\'s profile: the same waist, the same ends (within the smoothing)', () => {
  const g = geomFix({ len: 8, waist: 3, trans: 1, red: S }, 'tips'), site = STENT_SITES.distal, f = stentWaist('E', g, 0.4, site, W, LEN);
  // (The end stenosis is abrupt: the smoothing rounds its two steps, so the match is judged away from them, and its depth at its middle.)
  const e = endSpan(g, site, null), sig = (0.3 * W) / LEN, nearStep = (u) => Math.abs(u - e.a0) < 3 * sig || Math.abs(u - e.b0) < 3 * sig;
  let worst = 0;
  for (let i = 0; i <= 200; i++) if (!nearStep(i / 200)) worst = Math.max(worst, Math.abs(f(i / 200) - profileAt(g, 0.4, site, i / 200)));
  assert.ok(worst < 0.06, `the figure follows profileAt to ${worst}`);
  assert.ok(Math.abs(f(e.c) - 0.6) < 0.03, `the stenosis is drawn its full depth at its middle, ${f(e.c)}`);
  assert.ok(Math.abs(f(0.5) - (1 - S)) < 0.03, `and the waist its full depth mid stent, ${f(0.5)}`);
});

test('a stent\'s stenosis eases between its ends, a waist never moves it, and a stenosis that comes stands where it is set', () => {
  const l = lesionEase(), mk = (site, geom = {}) => ({ stenosis: { TIPS: 0.6 }, thrombus: {}, stenosisSite: { TIPS: site }, stentGeom: geom });
  const a = mk('proximal');
  assert.equal(l.view(a, 0), a);
  assert.equal(l.differs(a), false);
  const b = mk('distal');
  assert.ok(l.differs(b));
  const seen = [];
  for (let i = 0; i < 200 && l.differs(b); i++) seen.push(l.view(b, 1 / 60).stentSiteU?.TIPS ?? STENT_SITES.distal);
  assert.ok(seen.length > 8 && seen.length < 80, `${seen.length} frames`);
  assert.ok(seen[0] > STENT_SITES.proximal && seen[0] < STENT_SITES.distal, 'the first frame is a step on the way');
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1] && seen[i] - seen[i - 1] < 0.2, 'forward, in steps');
  assert.equal(l.view(b, 1 / 60), b, 'at rest the params themselves come back');
  // A waist set mid stent leaves the stenosis at its end: only the waist eases (17 Nov 2026: two narrowings, neither moves the other).
  const c = mk('distal', { TIPS: { len: 8, waist: 4, trans: 0, red: 0.3 } });
  const first = l.view(c, 1 / 60);
  assert.ok(!first.stentSiteU || first.stentSiteU.TIPS === STENT_SITES.distal, 'the stenosis stays at the hepatic vein end');
  assert.ok(first.stentGeom.TIPS.red > 0 && first.stentGeom.TIPS.red < 0.3, 'the waist closes in, eased');
  for (let i = 0; i < 200 && l.differs(c); i++) l.view(c, 1 / 60);
  assert.equal(l.differs(c), false);
  // A stenosis that comes stands at its end at once.
  const fresh = lesionEase();
  fresh.view({ stenosis: {}, thrombus: {} }, 0);
  const d = fresh.view(mk('proximal'), 1 / 60);
  assert.ok(!d.stentSiteU || d.stentSiteU.TIPS === STENT_SITES.proximal);
});

test('a stent label\'s end stenosis names the end the params name, proximal or distal (play-test 17 Nov 2026: it always said "distal", the statement had been left inside a comment)', async () => {
  const { stentFacts } = await import('../src/ui/stent-waist.js');
  const { EDGES } = await import('../src/engine/portal/topology.js');
  for (const id of ['TIPS', 'DIPS']) {
    const e = EDGES.find((x) => x.id === id), key = id.toLowerCase();
    const mk = (site) => ({ [key]: { on: true, d: 8 }, stenosis: { [id]: 0.4 }, stenosisSite: { [id]: site } });
    assert.equal(stentFacts(e, mk('proximal')).end, 'proximal', `${id} proximal`);
    assert.equal(stentFacts(e, mk('distal')).end, 'distal', `${id} distal`);
  }
});
