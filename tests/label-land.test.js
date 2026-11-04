// A glide with the labels up (premium-feel recs P2, 31 Oct): its labels are solved once, as it starts, for the framing it lands at,
// then carried there with no solve while it runs and none as it lands. Only where nothing the labels are placed against moves with
// the camera and what they show is the same at both ends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const body = (head) => stage.match(new RegExp(`${head.replace(/[()[\]{}.*+?^$|\\]/g, '\\$&')}[\\s\\S]*?\\n {2}\\}\\n`))?.[0];

const landSrc = body('function landable(from, to) {');
const base = () => ({
  landAt: -1e9, F: {}, inUpdate: false, catchUp: false, solvedFor: { sig: 'S', csig: 'C', ins: '' }, camMove: false, pinchHide: false,
  gestureOn: () => false, sameView: (a, b) => a.k === b.k && a.x === b.x && a.y === b.y,
  cath: { st: null }, lobuleOn: false, lz: null, morph: 0, morphTarget: 0, diveT: 0, sites: { list: null }, scan: { on: false }, dpr: { on: false },
  dop: { all: false }, E: {}, labelSig: () => 'S', calloutSig: () => 'C', labelIns: () => '',
});
const landable = (over = {}, from = { k: 1, x: 0, y: 0 }, to = { k: 2, x: -300, y: -200 }) => {
  const env = { ...base(), ...over };
  return new Function(...Object.keys(env), `${landSrc}\nreturn landable;`)(...Object.values(env))(from, to);
};

test('a plain glide with the labels up is solved for its landing, however far it zooms', () => {
  assert.ok(landSrc, 'landable is in stage.js');
  assert.equal(landable(), true);
  assert.equal(landable({}, { k: 1, x: 0, y: 0 }, { k: 1, x: 0, y: 0 }), false, 'not a move');
});

test('not where the labels are hidden, held, mid-solve or placed against something the camera moves', () => {
  for (const over of [{ F: null }, { inUpdate: true }, { catchUp: true }, { solvedFor: null }, { camMove: true }, { pinchHide: true },
    { gestureOn: () => true }, { cath: { st: {} } }, { lobuleOn: true }, { lz: { isOpen: () => true } }, { morph: 0.4 }, { diveT: 0.2 },
    { sites: { list: [] } }, { scan: { on: true } }, { dpr: { on: true } }, { dop: { all: true } }, { E: { TIPS: { vis: true } } }, { E: { DIPS: { vis: true } } },
    { landAt: performance.now() }, { labelSig: () => 'other' }, { calloutSig: () => 'other' }, { labelIns: () => '1,2' }]) {
    assert.equal(landable(over), false, JSON.stringify(Object.keys(over)));
  }
});

test('the landing is solved dry, at the landing framing, and the view is always put back', () => {
  const s = body('function solveLanding(to) {');
  assert.ok(s, 'solveLanding is in stage.js');
  assert.match(s, /vt = solveVT; CTM = null; refreshCTM\(\);\n\s*try \{/);
  assert.match(s, /\} finally \{ vt = keep; CTM = null; refreshCTM\(\); \}/);
  assert.match(s, /if \(sig === solvedFor\.sig && Math\.abs\(Math\.atan2\(CTM\.b, CTM\.a\) - solvedFor\.th\) <= SOLVE_TURN\)/, 'what the labels show is the same there');
  assert.match(s, /landAt = performance\.now\(\);\n\s*if \(layoutLabels\(F, true, true\)\)/);
  // (A dry solve finds the slots and stops before anything is drawn.)
  const lay = stage.slice(stage.indexOf('function layoutLabels(f, solve, dry = false)'));
  const dry = lay.indexOf('if (dry) return true;');
  assert.ok(dry > lay.indexOf('if (solve) labelSol = nextSol;') && dry < lay.indexOf('for (const it of out) renderBlock(it);'));
});
