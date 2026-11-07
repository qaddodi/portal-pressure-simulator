// The Anatomy's labels through the dive into the lobule and the rise out of it are part of the figure (Mohammad, 4 Nov 2026: on the way out
// "labels show up too early, wrong place, in place while zoom is zooming out"): each pinned point is carried by the dive's own camera record,
// the one veins-gl draws the figure under; the rest ride the same matrix; and the layer shows exactly as much as the anatomy shows through the
// field, on the zoom, not a clock, with no fade and no timer at the landing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from '../scripts/warm/dom.mjs';

installPage();   // (the stage's modules read the page's globals as they load: observers, matchMedia, the document)
const { camOut } = await import('../src/ui/stage-label-host.js');
const { camAbout, camNew, cams } = await import('../src/ui/scene-cam.js');
const { createDive } = await import('../src/ui/stage-dive.js');

test('a pinned point rides the dive record exactly (k about the dive point), then a card zoom, and keeps the identity when there is none', () => {
  const d = camAbout(camNew(), 4, 100, 50);   // (×4 about (100, 50): p' = 4 p + (1 - 4) (100, 50))
  assert.deepEqual(camOut([100, 50], d, null), [100, 50], 'the fixed point stays');
  assert.deepEqual(camOut([110, 60], d, null), [140, 90]);
  assert.deepEqual(camOut([110, 60], camNew(), null), [110, 60], 'no dive: untouched');
  assert.deepEqual(camOut([110, 60], null, null), [110, 60]);
  const zoomM = [2, 0, 0, 2, 5, 7];   // (a card's zoom after the dive: card ∘ dive ∘ base, as veins-gl composes them)
  assert.deepEqual(camOut([110, 60], d, zoomM), [2 * 140 + 5, 2 * 90 + 7]);
  assert.deepEqual(camOut([110, 60], null, zoomM), [225, 127], 'a card zoom alone, as before');
});

// A stage with only what a frame of the zoom touches: the page's layers as plain records, the lobule's field as a stub, no renderer.
function stageFor() {
  const el = (id) => ({ id, style: {}, classList: { contains: () => false } });
  const lab = el('labels'), svg = el(''), vCanvas = Object.assign(el('veins'), { width: 1200, height: 800 });
  const rides = [], ends = [];
  const rider = { riding: false, ride(m) { this.riding = true; rides.push(m.slice()); }, rideEnd() { this.riding = false; ends.push(rides.length); }, pinDraw() {}, canRide: () => true };
  const wrap = { querySelector: (s) => (s === '#labels' ? lab : null), classList: { contains: () => false }, clientWidth: 1200, clientHeight: 800 };
  const live = {
    diveAt: [300, 200], diveLand: { x: 300, y: 200, r: 60 }, diveOut: true, riseFast: true, riseLine: true, lobuleOn: false, veins: null, rideCTM: null, labelRider: rider,
    easeInOut: (u) => u * u * (3 - 2 * u), stageWake() {}, camOx: 0, camOy: 0, camDive: 1, camShow: 1, diveOrig: null, diveHid: false, labHid: false, diveFadeO: null,
    lz: { isShown: () => true, current: () => ({ x: 300, y: 200, r: 60 }), warm() {}, setDiveZoom() {}, setDive() {}, shared: false },
  };
  const st = { wrap, svg, vCanvas, syncSemantic() {}, applyVT() {}, defaultVT() {}, drawFrame() { return 0; }, driftEnd() {}, liverBox: () => null, lobuleBackstop() {}, lobuleStep() {}, nextFrame() { return 0; }, refreshCTM() {}, riseVT: () => null, sameView: () => true, spleenMoving: () => false, update() {}, updateLabels() {}, worldToLocal: () => [0, 0] };
  return { dive: createDive(st, live), lab, live, rides, ends, rider };
}

test('on the rise the labels show through the field as the anatomy does (1 - its cover, on the zoom), ride the dive record, and land whole with no fade', () => {
  const { dive, lab, live, rides, ends, rider } = stageFor();
  const DIVEC = cams.stage.dive;
  const seen = [];
  for (let t = 0.99; t > 0; t -= 0.03) {
    dive.diveFrame(t);
    assert.equal(lab.style.transition, 'none', 'its own CSS fade is off while the zoom drives it');
    seen.push({ t: +t.toFixed(2), k: DIVEC.k, op: lab.style.opacity, riding: rider.riding });
    if (DIVEC.k > 1.0001) {
      assert.equal(rider.riding, true, `rides at t ${t}`);
      const m = rides[rides.length - 1];
      assert.deepEqual(m, [DIVEC.k, 0, 0, DIVEC.k, DIVEC.x, DIVEC.y], 'the ride matrix is the dive record the figure is drawn under');
    }
  }
  assert.equal(+seen[0].op, 0, 'deep in the lobule, under a whole field: gone');
  const on = seen.filter((s) => +s.op > 0), whole = seen.filter((s) => +s.op === 1);
  assert.ok(on.length > 3 && whole.length > 3, `fades in through the field and is whole well before the landing: ${JSON.stringify(seen)}`);
  assert.ok(on.every((s, i) => i === 0 || +s.op >= +on[i - 1].op), 'monotone on the zoom');
  assert.ok(whole.some((s) => s.k > 2), `whole while the figure is still magnified (×2 and more), riding it: ${JSON.stringify(whole)}`);
  dive.diveFrame(0);
  assert.equal(lab.style.opacity, '', 'landed: the layer is its own again, nothing left to fade in');
  assert.equal(lab.style.transition, '');
  assert.equal(rider.riding, false, 'the ride ends at the landing');
  assert.equal(ends.length, 1);
  assert.equal(live.labHid, false);
});

test('on the dive in, the labels ride the figure until the field covers it, and are gone once it is whole', () => {
  const { dive, lab, rider } = stageFor();
  const DIVEC = cams.stage.dive;
  const seen = [];
  for (let t = 0.01; t < 0.9; t += 0.03) { dive.diveFrame(t); seen.push({ t: +t.toFixed(2), k: +DIVEC.k.toFixed(2), op: lab.style.opacity, riding: rider.riding }); }
  assert.equal(+seen[0].op, 1, 'whole as the zoom starts');
  assert.ok(seen.some((s) => +s.op === 1 && s.k > 1.5 && s.riding), 'riding the magnified figure, whole');
  assert.ok(seen.every((s, i) => i === 0 || +s.op <= +seen[i - 1].op || s.op === ''), 'monotone out on the zoom');
  assert.equal(+seen[seen.length - 1].op, 0, 'gone under the whole field');
});
