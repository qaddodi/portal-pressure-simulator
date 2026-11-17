// F49 (17 Nov 2026, iPhone 375 x 812): the stent of the stenosis slide stood behind the slide's card. The slide's subject (the vessel its mark rings,
// else its Doppler probe's) is kept in the room above a phone's cards by card-clear.js subjectDelta, called by stage-glide.js boxVT.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subjectDelta, squeezeBottom } from '../src/ui/card-clear.js';
import { focusRun } from '../src/ui/cam-room.js';
import { VB_ANAT } from '../src/ui/anatomy.js';
import { DECKS } from '../src/ui/decks.js';

const geo = { rw: 375, rh: 812, vb: VB_ANAT }, s0 = Math.min(375 / VB_ANAT[2], 812 / VB_ANAT[3]);
const ox = (375 - VB_ANAT[2] * s0) / 2 - VB_ANAT[0] * s0, oy = (812 - VB_ANAT[3] * s0) / 2 - VB_ANAT[1] * s0;
const screenY = (vt, wy) => oy + s0 * (vt.y + vt.k * wy);
// the real room: bars 110 px at the top, the words' card from 380 px down; the squeezed room the frame is fitted into reaches 0.35 H under it
const ins = { t: 110, b: 812 - 380, W: 375, H: 812 };
const room = { top: ins.t + 12, bottom: 812 - ins.b - 12, left: 8, right: 367 };

test('the squeezed room reaches under the card, so a frame fitted to it can hide the subject (what F49 was)', () => {
  assert.ok(812 - squeezeBottom(ins) > 380, 'the squeezed room ends below the real card edge');
});

test('a subject low in the frame is brought above the card, whole when it fits, and one already in is left alone', () => {
  const run = [[560, 230], [558, 330], [562, 425]];
  const low = { k: 1, x: 0, y: (420 - oy) / s0 - 425 };   // the run's foot at 420 px: under the card
  assert.ok(screenY(low, 425) > room.bottom);
  const d = subjectDelta(run, low, geo, room);
  const to = { k: 1, x: low.x + d.dx, y: low.y + d.dy };
  assert.ok(screenY(to, 425) <= room.bottom + 0.01 && screenY(to, 230) >= room.top - 0.01, 'the whole vessel is in the free room');
  assert.deepEqual(subjectDelta(run, to, geo, room), { dx: 0, dy: 0 });
  assert.deepEqual(subjectDelta(null, low, geo, room), { dx: 0, dy: 0 });
});

test('a vessel longer than the room keeps its middle in it', () => {
  const run = [[560, 0], [560, 900]];
  const vt = { k: 1, x: 0, y: 0 }, d = subjectDelta(run, vt, geo, room), to = { k: 1, x: d.dx, y: vt.y + d.dy };
  const my = screenY(to, 450);
  assert.ok(my >= room.top - 0.01 && my <= room.bottom + 0.01, `middle at ${my}`);
});

test('every slide with a ringed vessel or a probe has a subject on the plate, and the stenosis slide\'s is the stent', () => {
  let n = 0;
  for (const d of DECKS) for (const s of d.slides || []) {
    const has = (s.marks || (s.mark ? [s.mark] : [])).some((m) => (m.edges || []).length) || (s.tool?.kind === 'doppler' && s.tool.probe !== 'scope');
    if (!has) continue;
    const run = focusRun(s);
    if (run) { n++; assert.ok(run.length > 1 && run.every((p) => p.every(Number.isFinite)), `${d.id}/${s.id}`); }
  }
  assert.ok(n > 20, `${n} slides have a subject`);
  const jet = DECKS.find((d) => d.id === 'tips-complete').slides.find((s) => s.id === 'jet');
  assert.equal(focusRun(jet), focusRun({ mark: { edges: ['TIPS'] } }));
});
