// The stent as a device (look T2, Mohammad 13 Nov 2026, stent-mesh.js stentLookD): rings placed on the tube, a white graft over the covered
// stretch (white where the light falls, nearly clear on the shaded side), an open stretch at the portal end ending in round crowns, a gold
// band where the graft starts; the veins' and the stent tool's stents the open stretch alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BARE_CM, GRAFT_FADE_STEPS, GRAFT_FADE_U, GRAFT_LEVELS, bareOf, graftAlpha, graftFade, stentLookD } from '../src/ui/stent-mesh.js';

// A straight vessel along +x, half-width 12 (so the mocks' unit is 1): f(a, v) = [a, 12 v]. The light comes from the top left, so the
// side at -y is the lit one.
const R = 12, f = (a, v) => [a, R * v];
const pts = (d) => { const n = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number), out = []; for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]); return out; };
const A = 300, bare = 80;
const inPoly = (p, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > p[1]) !== (P[j][1] > p[1]) && p[0] < (P[j][0] - P[i][0]) * (p[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
// The cover's opacity at a point: the fills laid over one another (each paints its opacity over what is under it).
const PARSED = new WeakMap();
const coverAt = (m, p) => { let L = PARSED.get(m); if (!L) PARSED.set(m, L = m.graft.map(([d, o]) => [pts(d), o])); let t = 1; for (const [P, o] of L) if (inPoly(p, P)) t *= 1 - o; return 1 - t; };
const whitest = (m, x, at = (a, v) => [a, R * v]) => Math.max(...[-0.9, -0.8, -0.7, -0.6, -0.5, -0.4].map((v) => coverAt(m, at(x, v))));   // (the lit side's whitest line at x)
// The whole graft's outline: the longest fill of the lowest light level (it spans the width and runs to the graft's end).
const wholeOf = (m) => m.graft.map(([d]) => pts(d)).reduce((best, P) => { const x = Math.max(...P.map((q) => q[0])), w = Math.max(...P.map((q) => q[1])) - Math.min(...P.map((q) => q[1])); return !best || x > best.x + 1e-6 || (Math.abs(x - best.x) < 1e-6 && w > best.w) ? { P, x, w } : best; }, null).P;

test('an all-bare stent (the veins\', the stent tool\'s): open rings end to end, no graft, no band', () => {
  const m = stentLookD(f, A, A);
  assert.equal(m.graft.length, 0);
  assert.equal(m.band, '');
  assert.equal(m.frontCov, '');
  const P = pts(m.frontBare + m.backBare);
  assert.ok(P.length > 100);
  for (const [x, y] of P) { assert.ok(x >= -0.01 && x <= A + 0.01, `inside its length: ${x}`); assert.ok(Math.abs(y) <= R + 1e-6, `on the tube: ${y}`); }
  assert.ok(Math.max(...P.map((p) => p[0])) > A - 20, 'it runs to the far end');
});

test('the portal end finishes in round crowns, not a straight cut', () => {
  const m = stentLookD(f, A, bare);
  const P = pts(m.frontBare), x0 = Math.min(...P.map((p) => p[0]));
  assert.ok(x0 >= 0 && x0 < 2, `the tips reach the end: ${x0}`);
  // the points at the very end are crown tips, a few across the width, not a line across it
  const tips = P.filter((p) => p[0] < x0 + 0.5);
  const ys = tips.map((p) => p[1]);
  assert.ok(tips.length >= 2 && tips.length < P.filter((p) => p[0] < 12).length / 2, 'a few tips, the rest of the first ring curving away');
  assert.ok(Math.max(...ys) - Math.min(...ys) > R / 2, 'crowns spread round the tube');
  // a crown is round: just past its tip the wire turns back slowly (cos), so points within 1 of the tip are close to it across
  assert.ok(!/ L0\.00 /.test(m.frontBare.replace(/M0\.00 [^L]*/g, '')), 'no stroke straight across at the end');
});

test('the covered stent: the graft runs from the band to a clean far end, inside the tube', () => {
  const m = stentLookD(f, A, bare);
  assert.ok(m.graft.length >= 3, 'fills by light level');
  const G = m.graft.flatMap(([d]) => pts(d));
  for (const [x, y] of G) { assert.ok(x >= bare - 0.01 && x <= A + 0.01, `the graft between the band and the end: ${x}`); assert.ok(Math.abs(y) <= R + 1e-6); }
  // the far end is a clean edge round the tube (13 Nov 2026: the scallops read as a ragged top end), past every crown of the last ring and inside the stent's length
  const base = wholeOf(m), ringMax = Math.max(...pts(m.frontCov).map((p) => p[0])), far = base.filter((p) => p[0] > ringMax - 0.5);
  assert.ok(far.length > 10 && Math.max(...far.map((p) => p[0])) - Math.min(...far.map((p) => p[0])) < 2.5, 'a clean end, not a scallop');
  assert.ok(far.every((p) => p[0] > ringMax || Math.abs(p[1]) > 0.9 * R), 'past the last crowns (but at the very sides)');
  assert.ok(Math.max(...base.map((p) => p[0])) <= A + 0.01, 'never past the stent\'s end');
  const B = pts(m.band);
  assert.ok(B.length > 10 && B.every(([x]) => x >= bare - 0.01 && x <= bare + 4.01), 'the gold band at the graft\'s start, bowed with the tube');
  assert.ok(m.tab, 'the gold tab near the far end');
  assert.ok(pts(m.frontCov).every(([x]) => x > bare && x <= A + 0.01), 'the covered rings start past the band');
});

test('one device: the open cells run on into the graft, with no gap at the gold band (13 Nov 2026, "the two fragments are NOT connected")', () => {
  for (const b of [50, 64.3, 80, 97]) {
    const m = stentLookD(f, A, b), bareMax = Math.max(...pts(m.frontBare).map((p) => p[0]));
    assert.ok(bareMax > b - 1 && bareMax <= b + 0.01, `the last open crowns reach the band at ${b}: ${bareMax.toFixed(2)}`);
    assert.ok(Math.min(...m.graft.flatMap(([d]) => pts(d)).map((p) => p[0])) <= b + 0.01, 'the graft starts at the band');
    assert.ok(Math.min(...pts(m.frontCov).map((p) => p[0])) - b < 4, 'the first covered ring sits just past the band');
  }
  // the all-bare stent's rings fill it end to end the same way
  const P = pts(stentLookD(f, A, A).frontBare).map((p) => p[0]);
  assert.ok(Math.max(...P) > A - 2 && Math.min(...P) < 2);
});

test('the graft is white where the light falls and nearly clear on the shaded side', () => {
  const m = stentLookD(f, A, bare);
  // part way along the covered stretch, well before the fade: across the tube from the lit side (-y) to the shaded one
  const across = Array.from({ length: 25 }, (_, i) => coverAt(m, [bare + 60, R * (-0.96 + 1.92 * i / 24)]));
  assert.ok(Math.min(...across) < 0.1 && Math.abs(Math.min(...across) - graftAlpha(0)) < 0.01, `the shaded side: a tenth of the white (${Math.min(...across).toFixed(3)})`);
  assert.ok(Math.max(...across) > 0.8 && Math.max(...across) < 0.87, `the lit side builds up to the graft's white: ${Math.max(...across).toFixed(3)}`);
  assert.ok(across.indexOf(Math.max(...across)) < 12 && across.indexOf(Math.min(...across)) > 12, 'white on the -y side, clear on the +y side');
  // each light level's fill lies on the lit side (-y), the highest one most of all
  const top = pts(m.graft.at(-1)[0]), meanY = top.reduce((s, p) => s + p[1], 0) / top.length;
  assert.ok(meanY < -2, `the brightest fill is on the lit side: ${meanY.toFixed(2)}`);
  assert.equal(GRAFT_LEVELS.length + 1, 6);
});

test('the graft\'s far end fades out softly: the cover thins to clear over a short length, no hard edge (Mohammad, 16 Nov 2026)', () => {
  for (const [Ax, b] of [[300, 80], [300, 50], [220, 64.3], [400, 97], [180, 40]]) {
    const m = stentLookD(f, Ax, b);
    const wire = pts(m.frontCov).concat(pts(m.backCov)), ringEnd = Math.max(...wire.map((p) => p[0]));
    const whole = wholeOf(m), gEnd = Math.max(...whole.map((p) => p[0]));
    // along the lit side (the whitest line) from the band to the end, in quarter-unit steps
    const prof = [];
    for (let x = b + 2; x < gEnd + 1; x += 0.25) prof.push([x, whitest(m, x)]);
    const full = Math.max(...prof.map((q) => q[1]));
    assert.ok(full > 0.8, `the body keeps the graft's white (${full.toFixed(3)}, A ${Ax} bare ${b})`);
    // thins away: never brightens toward the end once it starts to fall, and ends (almost) clear
    const top = prof.findIndex((q) => q[1] > full - 0.005 && q[0] > b + 10), fall = prof.findIndex((q, i) => i > top && q[1] < full - 0.02);
    for (let i = fall; i + 1 < prof.length; i++) assert.ok(prof[i + 1][1] <= prof[i][1] + 0.004, `fades monotonically at ${prof[i][0]}`);
    assert.ok(prof.at(-1)[1] < 0.03, `clear at the very end: ${prof.at(-1)[1].toFixed(3)}`);
    // short: it runs over two half-widths or so (never more than 2.6), and begins before the last ring so the last crowns sit on a thin cover
    const fadeLen = gEnd - prof[fall][0];
    assert.ok(fadeLen > R && fadeLen < 2.6 * R, `a short fade: ${fadeLen.toFixed(1)} long (half-width ${R})`);
    assert.ok(ringEnd <= gEnd + 0.01);
    // no step: from one quarter-unit to the next the opacity changes by less than a thirteenth of the white (a hard cut is the whole 0.86)
    let jump = 0;
    for (let i = 0; i + 1 < prof.length; i++) jump = Math.max(jump, Math.abs(prof[i + 1][1] - prof[i][1]));
    assert.ok(jump < 0.065, `no hard edge: the largest step ${jump.toFixed(3)}`);
  }
});

test('the fade is one profile: it starts and ends flat, and its fills add up (log transmittance) to it', () => {
  assert.equal(graftFade(0), 1);
  assert.equal(graftFade(GRAFT_FADE_STEPS + 1), 0);
  for (let i = 0; i <= GRAFT_FADE_STEPS; i++) assert.ok(graftFade(i) > graftFade(i + 1), `falls at step ${i}`);
  assert.ok(graftFade(1) > 0.97 && graftFade(GRAFT_FADE_STEPS) < 0.03, 'flat at both ends');
  assert.ok(GRAFT_FADE_STEPS >= 10 && GRAFT_FADE_U <= 30);
});

test('the fade follows a bending tube, and the wires are the same with it', () => {
  const Rc = 200, g = (a, v) => { const t = a / Rc, r = Rc + R * v; return [r * Math.sin(t), Rc - r * Math.cos(t)]; };
  const m = stentLookD(g, A, bare), n = stentLookD(f, A, bare);
  const at = (a) => whitest(m, a, g);
  // (the bend turns the lit side away, so the white is lower there than on the straight: compare along the tube)
  assert.ok(at(150) > 0.3, 'the body is white where the light falls');
  assert.ok(at(A - 28) > 0.3 && at(A - 8) < 0.5 * at(A - 28) && at(A - 1) < 0.02, `thinned near the end, clear at it, on the bend too (${at(A - 28).toFixed(2)}, ${at(A - 8).toFixed(2)}, ${at(A - 1).toFixed(2)})`);
  // the wires and the band are the stent's own (the fade touches only the graft's fills)
  assert.equal(n.frontCov.split('M').length, stentLookD(f, A, bare, 1).frontCov.split('M').length);
  assert.ok(m.frontCov && m.backCov && m.band && m.tab);
});

test('a clean far end: every light level\'s fill lies inside the whole graft, and its ends are smooth, not cut by chords (13 Nov 2026, "ragged top end")', () => {
  // a vessel that turns (a quarter circle of radius 200), as the TIPS does on its way to the hepatic vein
  const Rc = 200, g = (a, v) => { const t = a / Rc, r = Rc + R * v; return [r * Math.sin(t), Rc - r * Math.cos(t)]; };
  const m = stentLookD(g, A, bare), G = m.graft.map(([d]) => pts(d)), whole = wholeOf(m);
  const inside = inPoly;
  const dseg = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy || 1))); return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy); };
  const near = (p, P) => { let d = 1e9; for (let i = 0; i < P.length; i++) d = Math.min(d, dseg(p, P[i], P[(i + 1) % P.length])); return d; };
  for (let j = 0; j < G.length; j++) for (const p of G[j]) assert.ok(inside(p, whole) || near(p, whole) < 0.05, `fill ${j} pokes out of the graft at ${p.map((x) => x.toFixed(1))}`);
  // the base fill's outline turns gently everywhere (no corner over 50 degrees but where the end meets the sides)
  const P = whole;
  let sharp = 0;
  for (let i = 1; i + 1 < P.length; i++) {
    const a = [P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]], b = [P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]], la = Math.hypot(...a), lb = Math.hypot(...b);
    if (la > 1e-6 && lb > 1e-6 && Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / la / lb))) > 50 * Math.PI / 180) sharp++;
  }
  assert.ok(sharp <= 4, `the graft's outline has ${sharp} corners`);
  // the rings are drawn to their crowns' tips (sampled finely enough that no crown is cut flat, ring after ring by a different amount)
  const s = stentLookD(f, A, bare), Ac = 0.42 * 11;
  for (const ring of s.frontCov.split('M').filter((x) => x.trim()).map((x) => pts(x))) {
    const xs = ring.map((p) => p[0]), span = Math.max(...xs) - Math.min(...xs);
    if (Math.max(...xs) < A - 1) assert.ok(span > 2 * Ac - 0.12, `a ring's crowns cut flat: ${span.toFixed(2)} of ${(2 * Ac).toFixed(2)}`);
  }
});

test('unrolled part of the way, nothing past the front is drawn', () => {
  const m = stentLookD(f, A, bare, 0.5);
  for (const d of [m.frontBare, m.backBare, m.frontCov, m.backCov, ...m.graft.map((g) => g[0])]) for (const [x] of pts(d)) assert.ok(x <= A / 2 + 0.01, `past the front: ${x}`);
  assert.equal(stentLookD(f, A, bare, 0.1).graft.length, 0, 'no graft before the front reaches it');
});

test('the bare stretch is 2 cm of the shunt, never more than two fifths of it', () => {
  assert.equal(BARE_CM, 2);
  assert.equal(bareOf(100, 8), 25);
  assert.equal(bareOf(100, 4), 40, 'a short shunt keeps some cover');
  assert.equal(bareOf(100, 0), 25, 'an unknown length is the usual 8 cm');
});

test('every covered stent the app draws (TIPS, DIPS, the stent tool\'s portal-to-hepatic shunts, whatever their length) fades at its end; the all-bare ones have no cover to end', () => {
  // stage-transitions meshPaths gives every stent to stentLookD with bare = bareOf(drawn length, shunt length): shunts of 4 to 14 cm, drawn 60 to 400 long
  for (const lenCm of [4, 6, 8, 10, 14]) for (const drawn of [60, 120, 240, 400]) {
    const b = bareOf(drawn, lenCm), m = stentLookD(f, drawn, b);
    if (!m.graft.length) continue;   // (too short to carry a cover)
    const end = Math.max(...m.graft.flatMap(([d]) => pts(d)).map((p) => p[0]));
    assert.ok(coverAt(m, [end - 0.2, -0.67 * R]) < 0.05, `${lenCm} cm, drawn ${drawn}: clear at the end`);
    assert.ok(coverAt(m, [b + 4, -0.67 * R]) > 0.75, `${lenCm} cm, drawn ${drawn}: white after the band`);
  }
  assert.equal(stentLookD(f, A, A).graft.length, 0, 'an all-bare stent (the veins\', the stent tool\'s) has no cover');
});
