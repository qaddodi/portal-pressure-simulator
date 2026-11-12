import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrganStack, viewDrift, VIEW_TOL } from '../src/ui/organs-gl.js';
import { counts } from '../src/ui/frame-counts.js';
import { heldBin } from '../src/ui/idle-keys.js';
import { shareFor, sharePrep, sharePlan, shareKeep, bloodHeld, BLOOD_BLUR_MS } from '../src/ui/blur-share.js';
import { blurBoxesInto } from '../src/ui/glass-gl.js';

// R2 (10 Nov 2026): the redraws at rest that show nothing new. The organ layer's "view moved" (a matrix off by the last digit), its
// "page changed" (a colour bin flipping across its edge) and the cards' glass blur (one for each of the blood's composites).

// ── the organ layer's view test ──
const M0 = [1.37, 0, 0, 1.37, 212.6, 88.1];

test('the same matrix is no drift; a last-digit change is under the tolerance; a pixel is not', () => {
  assert.equal(viewDrift(M0, M0.slice(), 1200, 800), 0);
  const jitter = [M0[0] * (1 + 1e-12), 1e-14, -1e-14, M0[3] * (1 - 1e-12), M0[4] + 3e-9, M0[5] - 3e-9];
  assert.ok(viewDrift(jitter, M0, 1200, 800) < VIEW_TOL / 100, 'the last digits');
  assert.ok(viewDrift([M0[0], 0, 0, M0[3], M0[4] + 1, M0[5]], M0, 1200, 800) > 0.99, 'one pixel across');
  assert.ok(Math.abs(viewDrift([M0[0], 0, 0, M0[3], M0[4] + 1 / 128, M0[5]], M0, 1200, 800) - 1 / 128) < 1e-9, 'a 128th is a 128th');
});

test('the drift is the worst over the whole canvas: a small zoom shifts the far corner most', () => {
  const zoomed = [M0[0] * 1.00001, 0, 0, M0[3] * 1.00001, M0[4], M0[5]];
  const d = viewDrift(zoomed, M0, 1200, 800);
  assert.ok(d > 0.01 && d < VIEW_TOL, `a 1e-5 zoom is ${d} px at the far corner`);
  const more = [M0[0] * 1.0001, 0, 0, M0[3] * 1.0001, M0[4], M0[5]];
  assert.ok(viewDrift(more, M0, 1200, 800) > VIEW_TOL);
});

test('a matrix that cannot be compared is a move', () => {
  assert.equal(viewDrift([NaN, 0, 0, 1, 0, 0], M0, 100, 100), Infinity);
  assert.equal(viewDrift(M0, [0, 0, 0, 0, 0, 0], 100, 100), Infinity);
});

class FakeMO { observe() {} disconnect() {} takeRecords() { return []; } }
function fakeGL() {
  let id = 0;
  const gl = new Proxy({ canvas: { width: 400, height: 300 } }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return k;
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return (_, what) => (what === 'ACTIVE_UNIFORMS' || what === gl.ACTIVE_UNIFORMS ? 0 : true);
      if (/^create/.test(k)) return () => ({ id: ++id });
      return () => {};
    },
  });
  return gl;
}
function stack() {
  const paints = [];
  const painter = {
    describe(spec, m) { return { sig: '1|0', ops: [[`${spec.name}|${m.join()}`, [50, 0, 250, 100]]] }; },
    paintGroup(spec) { paints.push(spec.name); }, paintGroupInto() {}, layMasked() {}, endFrame() {}, trim() {}, dropKept() {},
    stats: () => ({ meshes: 0, kept: 0 }), dispose() {},
  };
  const was = globalThis.MutationObserver;
  globalThis.MutationObserver = FakeMO;
  const st = createOrganStack(fakeGL(), { painter });
  st.setOrder(['liver']);
  st.setLive(new Map([['liver', [{ spec: { name: 'liver', ops: [] }, m: [1, 0, 0, 1, 0, 0] }]]]), null);
  return { st, paints, done: () => { globalThis.MutationObserver = was; } };
}

test('at rest over 2 s of model states the organ layer repaints 0 times for "view moved"; a 1 px move repaints', () => {
  const t = stack();
  try {
    assert.equal(t.st.render(M0.slice(), 400, 300), true, 'the first picture');
    const before = counts.organ, paints = t.paints.length;
    // (20 model states, each moving the matrix by the last digits, as the camera is composed again.)
    for (let i = 1; i <= 20; i++) {
      const m = [M0[0] * (1 + i * 1e-13), 0, 0, M0[3] * (1 - i * 1e-13), M0[4] + i * 1e-9, M0[5] - i * 1e-9];
      assert.equal(t.st.stale(m, 400, 300), false, `state ${i} is not stale`);
      assert.equal(t.st.render(m, 400, 300), null, `state ${i} paints nothing`);
    }
    assert.equal(counts.organ, before, 'no repaint counted');
    assert.equal(t.paints.length, paints, 'nothing painted from shapes');
    // (Drift builds on the picture drawn, not on the last frame: 40 steps of a 1000th of a pixel, 0.04 px in all, repaint once past a 64th.)
    let repaints = 0;
    for (let i = 1; i <= 40; i++) if (t.st.render([M0[0], 0, 0, M0[3], M0[4] + i / 1000, M0[5]], 400, 300) !== null) repaints++;
    assert.ok(repaints >= 1 && repaints <= 3, `a slow drift repaints now and then (${repaints}), never builds up unseen`);
    const c2 = counts.organ;
    assert.notEqual(t.st.render([M0[0], 0, 0, M0[3], M0[4] + 1.5, M0[5]], 400, 300), null, 'a pixel and a half');
    assert.equal(counts.organ, c2 + 1);
  } finally { t.done(); }
});

// ── the organ layer's page changes: a colour bin held ──
test('a pressure breathing across a bin edge keeps its colour bin; a real move takes the next one', () => {
  let bin = NaN, flips = 0, naive = NaN, naiveFlips = 0;
  const qP = (v) => Math.round(v * 2) / 2;
  for (let i = 0; i < 40; i++) {
    const v = 12.25 + (i % 2 ? 0.08 : -0.08);   // (the filtered pressure, 0.16 mmHg across the edge between two bins)
    const b = heldBin(bin, v); if (b !== bin && i > 0) flips++; bin = b;
    const n = qP(v); if (n !== naive && i > 0) naiveFlips++; naive = n;
  }
  assert.ok(naiveFlips >= 38, `without a hold the colour flips each state (${naiveFlips})`);
  assert.equal(flips, 0, 'with it, never');
  assert.equal(bin, 12);
  assert.equal(heldBin(bin, 12.35), 12, 'under 0.4 mmHg away: held');
  assert.equal(heldBin(bin, 12.5), 12.5, 'past 0.4: the new bin');
  assert.equal(heldBin(NaN, 3.3), 3.5, 'nothing shown yet: the bin');
});

// ── the cards' glass blur ──
const grid = { x: 0, y: 0, X0: 0, Y0: 0, X1: 2000, Y1: 1200, T: 16 };
const t = 8, bw = 250, bh = 150;
const keep = (k) => (out, pool, boxes, ox, oy, tt, w, h) => blurBoxesInto(out, pool, boxes, ox, oy, tt, w, h, k);
const card = { x: 1500, y: 300, w: 400, h: 300 };
const under = [{ x: 1600, y: 400, w: 60, h: 60 }];   // (blood drawn under the card)

test('the gap holds only a blur the blood alone calls for', () => {
  assert.equal(BLOOD_BLUR_MS, 250, 'the blood in the glass at 4 Hz (heat recs H2)');
  assert.equal(bloodHeld(1000, 1010, BLOOD_BLUR_MS), true);
  assert.equal(bloodHeld(1000, 1200, BLOOD_BLUR_MS), true);
  assert.equal(bloodHeld(1000, 1250, BLOOD_BLUR_MS), false);
  assert.equal(bloodHeld(-1, 5, BLOOD_BLUR_MS), false, 'no blur kept yet');
  assert.equal(bloodHeld(1000, 1010, 0), false, 'no gap, no hold');
});

function prime(S) {
  sharePrep(S, { id: 'a', boxes: [card], v: 5, f: 10 });
  sharePlan(S, grid, t, bw, bh, false, keep(11));
  shareKeep(S, 1000); S.phase = 'draw';
}

test('blood under a card in a frame the gap holds is not blurred; the next blur covers every frame since', () => {
  const S = shareFor(new Map(), {}, 'k');
  prime(S);
  sharePrep(S, { id: 'a', boxes: [card], v: 5, f: 11 });
  const held = sharePlan(S, grid, t, bw, bh, false, keep(11), () => under, keep(23), null, 0, 1016, BLOOD_BLUR_MS);
  assert.equal(held.same, true);
  assert.equal(S.held, 1);
  assert.equal(S.snap.f[0], 10, 'the snapshot stays at the blur kept: the next range starts from it');
  S.phase = 'draw';
  sharePrep(S, { id: 'a', boxes: [card], v: 5, f: 12 });
  const p = sharePlan(S, grid, t, bw, bh, false, keep(11), () => under, keep(23), null, 0, 1000 + BLOOD_BLUR_MS + 1, BLOOD_BLUR_MS);
  assert.equal(p.same, false, 'past the gap it blurs');
  assert.ok(p.parts && p.parts.length, 'the part the blood reached');
});

test('the picture, the card or the grid moving blurs at once, whatever the gap', () => {
  const S = shareFor(new Map(), {}, 'k');
  prime(S);
  // the picture under the glass changed (a new view or layer picture): the dirty path is not offered, so all parts blur
  sharePrep(S, { id: 'a', boxes: [card], v: 6, f: 11 });
  assert.equal(sharePlan(S, grid, t, bw, bh, false, keep(11), () => under, keep(23), null, 0, 1005, BLOOD_BLUR_MS).same, false, 'picture');
  S.phase = 'draw';
  // the card's box moved
  sharePrep(S, { id: 'a', boxes: [{ ...card, x: card.x - 30 }], v: 5, f: 11 });
  assert.equal(sharePlan(S, grid, t, bw, bh, false, keep(11), () => under, keep(23), null, 0, 1005, BLOOD_BLUR_MS).same, false, 'box');
});

test('at rest on a 60 Hz page the blood under a card blurs 4 times a second, not 30 or 60', () => {
  const S = shareFor(new Map(), {}, 'k');
  prime(S);
  let blurs = 0, f = 10;
  for (let i = 1; i <= 120; i++) {   // 2 s of display frames, each a composite of the blood
    const now = 1000 + i * 16.7 + (i % 3 ? 0 : 2);   // (a little jitter)
    f++;
    sharePrep(S, { id: 'a', boxes: [card], v: 5, f });
    const p = sharePlan(S, grid, t, bw, bh, false, keep(11), () => under, keep(23), null, 0, now, BLOOD_BLUR_MS);
    if (!p.same) { blurs++; shareKeep(S, now); }
    S.phase = 'draw';
  }
  assert.ok(blurs >= 7 && blurs <= 9, `${blurs} blurs in 120 frames`);
});
