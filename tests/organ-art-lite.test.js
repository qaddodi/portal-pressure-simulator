// Lighter organ art (Settings › Figure performance, off by default): the colon's and small bowel's straight runs with fewer
// points (scripts/organ-art-lite.mjs → src/ui/organ-art-lite.js), set on the drawn paths by the stage (syncArtLite).
// Pinned here: the thinned lines never stray more than TOL from the drawn ones, the file is what the script makes from the
// art now, off loads and changes nothing, and on/off puts each path's d exactly where it should be.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COLON_ART, BOWEL_ART } from '../src/ui/organ-art.js';
import * as LITE from '../src/ui/organ-art-lite.js';
import { TOL, thin, pathsOf, liteSource } from '../scripts/organ-art-lite.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const stage = read('src/ui/stage.js');
const ARTS = { colon: COLON_ART, bowel: BOWEL_ART };

test('the lighter lines are the ones the script makes from the organ art now', () => {
  assert.equal(read('src/ui/organ-art-lite.js'), liteSource(), 'run node scripts/organ-art-lite.mjs && npm run stamp');
});

// The drawn and thinned d's as runs of [text, x, y] points (M x yLx y...), with what is not such a run kept as text.
const runsOf = (d) => d.split(/(?=M)/).map((sub) => {
  const m = sub.match(/^M(-?[\d.]+ -?[\d.]+(?:L-?[\d.]+ -?[\d.]+)+)(Z?)$/);
  return m ? { pts: m[1].split('L').map((t) => [t, ...t.split(' ').map(Number)]), z: m[2] } : { text: sub };
});
const segDist = ([, px, py], [, ax, ay], [, bx, by]) => {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};

test(`every thinned line stays within ${TOL} units of the drawn one, with its ends, curves and kept points as drawn`, () => {
  let before = 0, after = 0;
  for (const [id, art] of Object.entries(ARTS)) {
    const paths = pathsOf(art), spec = LITE.LITE_ART[id];
    assert.equal(spec.n, paths.length);
    const thinned = new Map(spec.list.map(([i, len, t]) => { assert.equal(paths[i][1].length, len); return [i, LITE.LITE_D[t]]; }));
    paths.forEach(([cls, d], i) => {
      const lite = thinned.get(i) ?? d;
      if (cls.split(' ').includes('ob-deep')) assert.equal(lite, d, 'the tubes’ centre lines the glows read stay as drawn');
      else assert.equal(lite, thin(d));
      const a = runsOf(d), b = runsOf(lite);
      assert.equal(b.length, a.length, 'the same pieces');
      a.forEach((ra, k) => {
        const rb = b[k];
        if (ra.text !== undefined) { assert.equal(rb.text, ra.text, 'a piece with curves is left as drawn'); return; }
        assert.equal(rb.z, ra.z);
        before += ra.pts.length; after += rb.pts.length;
        assert.equal(rb.pts[0][0], ra.pts[0][0]); assert.equal(rb.pts.at(-1)[0], ra.pts.at(-1)[0]);
        // The kept points are drawn points, in order, as their own text; every drawn point lies within TOL of the thinned line
        // (so does every point of it: distance to a segment is convex), and every thinned segment runs between drawn points.
        let j = 0;
        for (const q of rb.pts) { while (j < ra.pts.length && ra.pts[j][0] !== q[0]) j++; assert.ok(j < ra.pts.length, 'a kept point is a drawn one'); j++; }
        for (const p of ra.pts) {
          let best = Infinity;
          for (let q = 1; q < rb.pts.length && best > TOL; q++) best = Math.min(best, segDist(p, rb.pts[q - 1], rb.pts[q]));
          assert.ok(best <= TOL + 1e-9, `${id} path ${i}: a drawn point is ${best} from the thinned line`);
        }
      });
    });
  }
  assert.ok(after < before * 0.6, `about half the points (${after} of ${before})`);
});

test('off, nothing of it is in the first load, the offline copy or the stage’s work', () => {
  // Reached only through import() inside syncArtLite, which runs only when the switch is on or turned.
  assert.doesNotMatch(read('src/ui/main.js') + stage.replace(/import\('\.\/organ-art-lite\.js\?v=[0-9a-f]+'\)/, ''), /organ-art-lite\.js\?/);
  assert.match(stage, /onFigLab\(\(k\) => \{ if \(k === 'lightArt'\) syncArtLite\(\); \}\);\n {2}if \(figLab\('lightArt'\)\) syncArtLite\(\);/);
  const build = read('scripts/build.mjs');
  assert.match(build, /const liteChunks = .*src\/ui\/organ-art-lite\.js/);
  assert.match(build, /const cached = files\.filter\(\(f\) => .* && !liteChunks\.includes\(f\)\);/);
});

// The stage's switch, run on stand-ins for the drawn paths: the block from organ-art-lite's state to its listener.
function harness({ on = false, busy = false, mangle = false } = {}) {
  const block = stage.slice(stage.indexOf('  let artLite = false'), stage.indexOf("  onFigLab((k) => { if (k === 'lightArt')"));
  const el = (d) => ({ d, getAttribute() { return this.d; }, setAttribute(k, v) { assert.equal(k, 'd'); this.d = v; this.sets = (this.sets || 0) + 1; } });
  const organG = {}, organEls = {}, drawn = {};
  for (const [id, art] of Object.entries(ARTS)) {
    organEls[id] = el('key');
    drawn[id] = pathsOf(art).map(([, d]) => el(d));
    if (mangle && id === 'bowel') drawn[id][5].d += ' ';
    organG[id] = { querySelectorAll: (s) => (assert.equal(s, 'path'), [organEls[id], ...drawn[id]]) };
  }
  const env = { on, busy, loads: 0, pokes: 0 };
  const make = new Function('env', 'organG', 'organEls', `
    const figLab = (k) => k === 'lightArt' && env.on, platePoke = () => env.pokes++;
    let plateKey = 'k', plateStale = false;
    const lobuleOn = false, vtGliding = false, camMove = false, drifting = false, diveT = 0, morph = 0, morphTarget = 0, lvMoving = false, fluidEasing = () => false, spleenMoving = () => false;
    const gestureOn = () => env.busy;
    ${block.replace(/import\('\.\/organ-art-lite\.js\?v=[0-9a-f]+'\)/, '(env.loads++, env.load())')}
    return { sync: syncArtLite, plate: () => [plateKey, plateStale] };`);
  env.load = async () => LITE;
  return { env, drawn, organEls, ...make(env, organG, organEls) };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('Lighter organ art: off, nothing loads and no path or picture changes', async () => {
  const h = harness();
  h.sync(); await settle();
  assert.equal(h.env.loads, 0);
  assert.equal(h.env.pokes, 0);
  assert.deepEqual(h.plate(), ['k', false]);
  for (const list of Object.values(h.drawn)) for (const p of list) assert.equal(p.sets, undefined);
});

test('Lighter organ art: on sets the thinned lines and makes the pictures again; off puts every drawn line back', async () => {
  const h = harness({ on: true });
  h.sync(); await settle();
  assert.equal(h.env.loads, 1);
  for (const [id, art] of Object.entries(ARTS)) {
    const lite = new Map(LITE.LITE_ART[id].list.map(([i, , t]) => [i, LITE.LITE_D[t]]));
    pathsOf(art).forEach(([, d], i) => assert.equal(h.drawn[id][i].d, lite.get(i) ?? d));
    assert.equal(h.organEls[id].d, 'key', 'the organ’s own outline is never touched');
  }
  assert.deepEqual(h.plate(), ['', true]);
  assert.equal(h.env.pokes, 1);
  h.sync(); await settle();
  assert.equal(h.env.pokes, 1, 'no change, nothing done');
  h.env.on = false; h.sync();
  for (const [id, art] of Object.entries(ARTS)) pathsOf(art).forEach(([, d], i) => assert.equal(h.drawn[id][i].d, d));
  assert.equal(h.env.pokes, 2);
  h.env.on = true; h.sync(); await settle();
  assert.equal(h.env.loads, 1, 'loaded once');
});

test('Lighter organ art: waits while the figure moves; leaves art it was not made from as drawn', async () => {
  const h = harness({ on: true, busy: true });
  h.sync(); await settle();
  assert.equal(h.env.pokes, 0);
  assert.equal(h.drawn.bowel[0].sets, undefined);
  h.env.busy = false; h.sync();
  assert.equal(h.env.pokes, 1);
  const m = harness({ on: true, mangle: true });
  m.sync(); await settle();
  assert.equal(m.env.pokes, 0);
  for (const list of Object.values(m.drawn)) for (const p of list) assert.equal(p.sets, undefined);
});
