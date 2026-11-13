// A presenter's camera glide over one view (label-system-review #6): the new slide's labels were held until it landed (camMove), the old ones
// riding the whole glide and the new set swapping in at the landing. Now they are solved as it sets off, for where it lands (the camera put to
// its end, the morph as it is), handed to the GPU, and crossed with the old set, frozen as ghosts, on the glide's own progress: no timer.
// glide-labels.js glideXfStart / glideXfStep / glideXfEnd, driven with a recording label layer and solver.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { installPage } = await import('../scripts/warm/dom.mjs');
installPage();
globalThis.requestAnimationFrame = () => 1;
const { createGlideLabels } = await import('../src/ui/glide-labels.js');
const { cancelMay, mayWaiting } = await import('../src/ui/frame.js');

function rig({ slices = 0 } = {}) {
  const log = [];
  const gl = {
    lost: false,
    freezeGhosts() { log.push(['freeze']); return 3; },
    crossfade(o, n) { log.push(['xf', +o.toFixed(3), +n.toFixed(3)]); },
    dropGhosts() { log.push(['drop']); },
  };
  const live = {
    vt: { k: 1, x: 0, y: 0 }, vtGliding: true, vtTarget: null, camMove: false, F: {}, labelGL: gl, viewXf: null, cath: { st: null }, zoomBase: null,
    gestureOn: () => false, lobuleOn: false, lz: null, diveT: 0, morph: 0, morphTarget: 0, rotU: 0, sites: { list: null }, scan: { on: false },
    dprobePaint() {}, scanPaint() {}, glSuppress: false, labelJob: null, glass: { style: {} }, labelSvg: null, xfOp: '', xfHold: false, xfSolving: false,
    handRide: false, labelKey: [], solveAsked: false, solvedFor: null, stats: { layouts: 0 }, labelKeyArr: [], keyInto: (to, from) => from.slice(), JOB_NOW: { maxWait: 0 },
    easeInOut: (t) => t, CTM: null,
    labelGlSync() { log.push(['sync', live.glSuppress, { ...live.vt }]); },
  };
  let left = slices;
  const solves = [], cuts = [];
  const st = {
    XF_SLICE_MS: 8,
    handRideEnd() { live.handRide = false; }, labelJobDrop() { live.labelJob = null; }, labelJobStep() { return false; },
    labelSliceRun() { cuts.push({ vt: { ...live.vt }, suppress: live.glSuppress }); return --left <= 0; },
    labelTail() { log.push(['tail', { ...live.vt }]); }, refreshCTM() {}, sitesPaint() {}, xfLayer(n) { live.layerOp = n; },
    updateLabels(f, force) {
      solves.push({ vt: { ...live.vt }, force, gliding: live.vtGliding, camMove: live.camMove, suppress: live.glSuppress });
      if (slices > 0) live.labelJob = { g: {}, key: [1], solvedFor: { sig: 's' }, t0: 0 };
    },
  };
  const v = createGlideLabels(st, live);
  return { v, live, log, solves, cuts };
}

const TO = { k: 2, x: -300, y: -120 };

test('at the glide\'s start the labels are solved for its end camera, at rest there, then handed to the GPU under the camera as it stands', () => {
  const { v, live, log, solves } = rig();
  live.camMove = true;   // (a glide already under way: the solve still sees the camera at rest)
  assert.equal(v.glideXfStart(TO), true);
  assert.equal(solves.length, 1);
  assert.deepEqual(solves[0], { vt: TO, force: true, gliding: false, camMove: false, suppress: true });
  assert.deepEqual(live.vt, { k: 1, x: 0, y: 0 }, 'the camera put back');
  assert.equal(live.vtGliding, true); assert.equal(live.camMove, true); assert.equal(live.glSuppress, false);
  assert.deepEqual(log[0], ['freeze'], 'the old labels frozen as ghosts first');
  assert.deepEqual(log.find((e) => e[0] === 'sync'), ['sync', false, { k: 1, x: 0, y: 0 }], 'synced to the GPU once the stage is back');
  assert.deepEqual(log.at(-1), ['xf', 1, 0], 'the old set at full, the new at nothing');
});

test('the crossfade follows the glide\'s own progress, and the landing gives the new set the figure', () => {
  const { v, live, log } = rig();
  v.glideXfStart(TO);
  assert.equal(live.layerOp, 0, "the layers the GPU does not draw wait for the new set too");
  const at = (u) => { v.glideXfStep(u); return log.at(-1); };
  assert.deepEqual(at(0.25), ['xf', 1, 0]);
  assert.deepEqual(at(0.75), ['xf', 0.023, 0.023], 'handed over at the middle, never both strong');
  assert.deepEqual(at(0.6), ['xf', 0.023, 0.023], 'a retarget that starts its progress over never takes the new labels back');
  assert.deepEqual(at(1), ['xf', 0, 1]);
  v.glideXfEnd();
  assert.deepEqual(log.at(-1), ['drop'], 'landed: the ghosts go');
  assert.equal(live.layerOp, 1);
  log.length = 0; v.glideXfEnd(); v.glideXfStep(0.5);
  assert.deepEqual(log, [], 'nothing left running');
});

test('a solve longer than its first slice runs a slice a frame at the glide\'s end, and the two cross over what is left of it', () => {
  const { v, live, log, cuts } = rig({ slices: 2 });
  v.glideXfStart(TO);
  assert.ok(live.labelJob, 'pending');
  assert.equal(mayWaiting('label solve'), false, 'no idle slice runs it under the moving camera');
  v.glideXfStep(0.3);
  assert.deepEqual(log.at(-1), ['xf', 1, 0], 'still solving: the ghosts at full');
  assert.deepEqual(cuts[0], { vt: TO, suppress: true }, 'its slice runs at the end camera');
  v.glideXfStep(0.6);
  assert.equal(live.labelJob, null, 'landed');
  assert.ok(log.some((e) => e[0] === 'tail' && e[1].k === TO.k), 'its tail ran at the end camera');
  assert.deepEqual(log.at(-1), ['xf', 1, 0]);
  v.glideXfStep(0.8);
  assert.deepEqual(log.at(-1), ['xf', 0.023, 0.023]);
});

test('a glide that lands with its solve still running holds the ghosts until it lands at rest', () => {
  const { v, live, log } = rig({ slices: 5 });
  v.glideXfStart(TO);
  v.glideXfStep(1);
  v.glideXfEnd();
  assert.equal(live.xfHold, true);
  assert.ok(mayWaiting('label solve'), 'the solve goes on at rest');
  assert.deepEqual(log.at(-1), ['xf', 1, 0]);
  assert.ok(!log.some((e) => e[0] === 'drop'));
  cancelMay('label solve');
});

test('no GPU labels (released, lost) or a camera that is not the presenter\'s alone: the labels are held for the landing, as before', () => {
  for (const set of [(l) => { l.labelGL = null; }, (l) => { l.labelGL.lost = true; }, (l) => { l.cath.st = { keep: true }; }, (l) => { l.lobuleOn = true; }, (l) => { l.morph = 0.4; l.morphTarget = 1; }]) {
    const { v, live, solves } = rig();
    set(live);
    assert.equal(v.glideXfStart(TO), false);
    assert.equal(solves.length, 0);
  }
});

test('a change between the views begun over the glide ends its crossfade first: the new labels stand, and are what the change freezes', () => {
  const { v, live, log } = rig();
  v.glideXfStart(TO);
  v.glideXfStep(0.6);
  v.glideXfCut();
  assert.deepEqual(log.at(-1), ['drop']);
  assert.equal(live.layerOp, 1);
  log.length = 0; v.glideXfStep(0.9); v.glideXfEnd();
  assert.deepEqual(log, [], 'the glide has no crossfade left');
});
