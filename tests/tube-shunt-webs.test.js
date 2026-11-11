// A shunt's corners get a fillet web even where the vein beside it is in another tier (Mohammad, 11 Nov 2026, his TIPS close-ups: a brown wedge between the shunt and the
// right portal vein's run-on, a dark triangle where it meets the right hepatic vein). websByTier drops a mixed-tier web (a fin at the corner), unless one of its two rows is a
// shunt's (F_SHUNT); every other mixed-tier corner is dropped as before. Scenes are the TIPS's own two joins, laid out as the figure has them (tier numbers as stage.js has them).
import test from 'node:test';
import assert from 'node:assert/strict';
import { F_SHUNT, webInstances, websByTier } from '../src/ui/tube-data.js';
import { WEB_FLOATS } from '../src/ui/tube-joint.js';
import { polyline, scene } from './tube-web-helpers.js';

const TIER_NET = 16, TIER_FRONT = 17;
const R = 4;
const ROW = (w, p) => [w.data[p * WEB_FLOATS], w.data[p * WEB_FLOATS + 4]];

// The portal end: the right portal vein (front) runs on into the portal venules (net), the TIPS (front, a shunt) leaves it 39 degrees off the run.
function portalEnd(shuntFlag, tipsTier = TIER_FRONT, veinTier = TIER_FRONT) {
  return scene([
    { ...polyline([[600, 440], [509, 400]], R), tier: veinTier },   // 0: the right portal vein
    { ...polyline([[509, 400], [458, 378]], R), tier: veinTier === TIER_FRONT ? TIER_NET : veinTier },     // 1: its run-on, the right portal venules
    { ...polyline([[509, 400], [478, 350], [494, 282]], R), tier: tipsTier, flags: shuntFlag },   // 2: the TIPS
  ], [{ x: 509, y: 400, reach: 22, k: 3.6, fillet: 1, members: [0, 1, 2], trunk: 0 }]);
}
// The hepatic end: the right hepatic vein in two pieces (net) with the TIPS (front, a shunt) ending on the bend.
function hepaticEnd(shuntFlag) {
  return scene([
    { ...polyline([[446, 296], [503, 246]], R), tier: TIER_NET },    // 0: upstream
    { ...polyline([[503, 246], [616, 206]], R), tier: TIER_NET },    // 1: downstream
    { ...polyline([[494, 282], [508, 245]], R), tier: TIER_FRONT, flags: shuntFlag },   // 2: the TIPS
  ], [{ x: 503, y: 246, reach: 27, k: 3.6, fillet: 1, members: [0, 1, 2], trunk: 0 }]);
}
const drawn = (sc) => { const w = webInstances(sc.ent, sc.tube, sc.pts, {}); return { w, by: websByTier(w.data, w.count, sc.tube, {}, null, true) }; };

test('the shunt flag is the renderer\'s', async () => {
  globalThis.ResizeObserver ??= class { observe() {} };
  globalThis.MutationObserver ??= class { observe() {} };
  globalThis.window ??= globalThis;
  globalThis.Element ??= class {};
  globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
  globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
  globalThis.addEventListener ??= () => {};
  globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
  const gl = await import('../src/ui/veins-gl.js');
  assert.equal(F_SHUNT, gl.F_SHUNT);
  const bits = [gl.F_SEL, gl.F_DIFFUSE, gl.F_SHADOW, gl.F_DOTTED, gl.F_NOCASE, gl.F_SPEC, gl.F_EDGE, gl.F_VEIL, gl.F_WHOLE, 512];
  assert.ok(bits.every((b) => (b & F_SHUNT) === 0), 'no other flag shares its bit');
});

for (const [name, build] of [['portal', portalEnd], ['hepatic', hepaticEnd]]) {
  test(`TIPS ${name} end: every corner of the join gets a web, whatever tier the vein beside it is in`, () => {
    const { w, by } = drawn(build(F_SHUNT));
    assert.ok(w.count >= 2, `the join has ${w.count} corners`);
    assert.equal(by.n, w.count, `${by.n} of the ${w.count} corners are drawn`);
  });
  test(`the same ${name} corners with no shunt flag are dropped across tiers, as before (no other corner changes)`, () => {
    const { w, by } = drawn(build(0));
    assert.ok(w.count >= 2);
    assert.ok(by.n < w.count, 'a mixed-tier corner is dropped');
    // and what is kept is the same-tier corners only: for each web drawn, its two rows are in one tier
    const rows = build(0).rows;
    for (let p = 0; p < by.n; p++) { const [a, b] = [by.data[p * WEB_FLOATS], by.data[p * WEB_FLOATS + 4]]; assert.equal(rows[a].tier, rows[b].tier); }
  });
}

test('a shunt in the same tier as its vein changes nothing, and a web with no shunt row across tiers is still dropped', () => {
  const same = drawn(portalEnd(F_SHUNT, TIER_NET, TIER_NET));
  assert.equal(same.by.n, same.w.count, 'all in one tier: every corner drawn');
  const plain = drawn(portalEnd(0, TIER_NET, TIER_NET));
  assert.equal(plain.by.n, plain.w.count, 'the same with no flag');
  // the flag on the shunt does not open a corner between two other rows: the portal vein (front) and its run-on (net) make no web of their own (they run straight on)
  const sc = scene([
    { ...polyline([[600, 400], [500, 400]], R), tier: TIER_FRONT }, { ...polyline([[500, 400], [450, 440]], R), tier: TIER_NET }, { ...polyline([[500, 400], [500, 330]], R), tier: TIER_NET },
  ], [{ x: 500, y: 400, reach: 22, k: 3.6, fillet: 1, members: [0, 1, 2], trunk: 0 }]);
  const w = webInstances(sc.ent, sc.tube, sc.pts, {});
  const by = websByTier(w.data, w.count, sc.tube, {}, null, true);
  for (let p = 0; p < by.n; p++) { const [a, b] = ROW(by, p); assert.equal(sc.rows[a].tier, sc.rows[b].tier, 'only same-tier corners are drawn'); }
  assert.ok(by.n < w.count, 'two of its three corners cross tiers and are dropped');
});
