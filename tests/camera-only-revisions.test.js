import { stageSource } from './stage-src.js';
import test from 'node:test';
import assert from 'node:assert/strict';

// R04 (review pass 2): a camera-only move (pan, pinch, glide) rebuilds neither the labels' signature nor any string key. The
// signature follows revisions (the frame, the store's revision, the geometry's version, the vessels' shown set); the labels' key and
// the vessel layer's drawn view are numbers compared one by one.
const stage = stageSource();
const slice = (a, b) => stage.slice(stage.indexOf(a), stage.indexOf(b, stage.indexOf(a)));

test('the store counts a revision for every change but the model frame', async () => {
  const { store } = await import('../src/ui/store.js');
  const r0 = store.rev;
  store.set({ frame: { t: 1 } });
  assert.equal(store.rev, r0, 'a model frame alone is no revision');
  store.set({ labelLevel: 'all' });
  assert.equal(store.rev, r0 + 1);
  store.set({ frame: { t: 2 }, running: false });
  assert.equal(store.rev, r0 + 2, 'a frame with another key is one');
});

test('a camera-only call reuses the labels\' signature; a revision rebuilds it', () => {
  let built = 0;
  const st = { layers: { labels: true, chips: true }, selection: null, params: {} };
  const vessels = [{ vis: true, e: { id: 'PV' }, width: 8, g: { classList: { contains: () => false } } }];
  const env = {
    rev: 0, store: null, easeInOut: (v) => v, morph: 0, GEO_LAZY: true, labelGeo: 0, geometryVersion: 3, stentReady: () => false, rotU: 0,
    labelBase: () => 1, labelRestK: () => 1, resMask: 0, resLitRev: 0, sites: { list: null }, stageBox: () => ({ width: 1000 }), vt: { k: 1 }, zoomedIn: () => false, scan: { on: false }, fxSig: '', fx: null,
    slideGlow: [], explain: { key: null }, dop: { key: '' }, edgeRev: 0, projecting: false, glowSetAt: 0, sigWidth: (x) => Math.round(x.width), paramJSON: JSON.stringify,
    isImaging: () => false, layerMode: () => 'pressure', flagged: () => [], flagSigBuf: [], LABEL_REV: true,
    sameDeps: (a, b) => { for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return false; return true; },
    get EV() { built++; return vessels; },
  };
  env.store = { get: () => st, get rev() { return env.rev; } };
  env.live = new Proxy({}, { get: (_, k) => env[k] });
  const src = slice("  let sigText = '';", '  const sigStats');
  // (sloppy-mode `with`: the function's free names are the stand-ins above, read live)
  const labelSig = new Function('env', `with (env) { var sigStats = { builds: 0 }; ${src} return labelSig; }`)(env);
  const f = { metrics: {} };
  const a = labelSig(f);
  assert.equal(built, 1);
  for (let i = 0; i < 30; i++) assert.equal(labelSig(f), a, 'the camera moved: the same text');
  assert.equal(built, 1, 'no vessel list walked on camera frames');
  env.rev++; labelSig(f); assert.equal(built, 2, 'a store change rebuilds it');
  env.edgeRev++; labelSig(f); assert.equal(built, 3, 'a vessel shown, hidden or widened rebuilds it');
  env.geometryVersion++; labelSig(f); assert.equal(built, 4, 'new geometry rebuilds it');
  labelSig({ metrics: {} }); assert.equal(built, 5, 'a new model frame rebuilds it');
  env.vt = { k: 2 }; labelSig({ metrics: {} }); assert.equal(built, 6, 'a zoom past a label threshold rebuilds it');
});

test('the labels\' key and the drawn view are numbers, not joined text, on a camera frame', () => {
  assert.match(stage, /const key = labelKeyNow\(st, sig, b\);/);
  assert.match(stage, /const key = viewSame\(T, vCanvas\.width, vCanvas\.height\) \? (?:live\.)?(?:live\.)?veinsDrawKey : \+\+(?:live\.)?(?:live\.)?viewKeyN;/);
  assert.match(stage, /(?:live\.)?veinsDrawKey = key; viewKeep\.set\(viewNext\);/);
  // Every place that changes what the signature reads of the vessels bumps edgeRev.
  assert.match(stage, /x\.vis = vis; (?:live\.)?(?:live\.)?(?:live\.)?edgeRev\+\+; \}/);
  assert.match(stage, /if \((?:live\.)?(?:live\.)?sigWidthMoved\(x\)\) (?:live\.)?(?:live\.)?edgeRev\+\+;/);
  assert.match(stage, /if \(x\.ghost !== \(!openNow && !x\.reveal\?\.out\)\) (?:live\.)?(?:live\.)?edgeRev\+\+;/);
  const vs = slice('  function viewSame(T, w, h) {', '\n  }\n') + '\n  }';
  const viewKeep = new Float64Array(8).fill(NaN), viewNext = new Float64Array(8);
  let veinsDrawKey = '';
  const viewSame = new Function('viewKeep', 'viewNext', 'getKey', `return (${vs.trim().replace('typeof veinsDrawKey', 'typeof getKey()')});`)(viewKeep, viewNext, () => veinsDrawKey);
  const T = [2, 0, 0, 2, 10.0004, 20];
  assert.equal(viewSame(T, 100, 50), false, 'nothing drawn yet');
  veinsDrawKey = 1; viewKeep.set(viewNext);
  assert.equal(viewSame([2, 0, 0, 2, 10.0001, 20], 100, 50), true, 'the same view to a thousandth');
  assert.equal(viewSame([2, 0, 0, 2, 10.01, 20], 100, 50), false, 'a pan');
  assert.equal(viewSame(T, 101, 50), false, 'a resize');
});
