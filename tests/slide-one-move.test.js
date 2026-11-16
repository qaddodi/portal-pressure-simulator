// A slide change is one move (premium-feel R1): over the plate the cards come in during the camera's last 40 percent, and a change
// of patient eases under the glide, where the figure can move smoothly while its organs change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { createGlow } from '../src/ui/stage-glow.js';
import { presenterSource } from './split-src.js';

const src = presenterSource();
const run = src.slice(src.indexOf('async function transitionRun('), src.indexOf('function paintOverlays('));
const cam = src.slice(src.indexOf('async function camera('), src.indexOf('const cardsEntering ='));




test('the change of patient starts with the glide, and is awaited only once the cards are in', () => {
  const start = run.indexOf("morphP = morphTo(st, cut, MORPH_ONE_MS, false).finally(() => app.toggleAttribute('data-pz-morph-under', false));");
  const glide = run.indexOf('else if (cam) { if (prepWith)');
  const cards = run.indexOf('bare = false; cardsIn({ i: to, gen: g });');
  const awaited = run.indexOf('if (morphP) { if (!await morphP) return; shownState = own ? -1 : si; ui?.tools.hold(false); }');
  assert.ok(start > 0 && start < glide && glide < cards && cards < awaited);
  // (A kept data card rides the model as it eases, from the start of the change.)
  assert.ok(run.lastIndexOf('if (keepNow.data && keepNow.swap) followData(s, to, st, cut);', start) > run.indexOf('if (under) {'));
});


// Cards in sight, marks next (the polish of 31 Oct): over the plate with the same patient the unseen cards' last fitting runs under the glide's
// first frames and the cards come in at its 60 percent point on any machine; the slide's labels, glows and marks start once the cards are in
// sight rather than after the title's last frame; and a slide asked for again while the cards are out waits for no fade that is not running.
test('same patient over the plate: the cards\' last fitting runs before the camera frames, and the cards wait for it, not for a second fitting', () => {
  const glide = run.indexOf('else if (cam) { if (prepWith)');
  assert.ok(run.indexOf('const prepWith = ') > 0 && run.indexOf('const prepWith = ') < glide);
  // (the smooth-frames gate still runs right before the cards, as it always did: only the fitting started early)
  // (Every other path still fits the cards after the glide, or after the change of patient: no `prep` there.)
  assert.equal(run.split('unseenFit(cut)').length, 3, 'the fitting starts before either camera frames (the lead-in one, the slide\'s own), once');
});

test('the slide\'s marks start once the cards are in sight (CARDS_SEEN), and the card size is read only after the last step', () => {
  // (the camera's own wait for the cards to be fully in, before a rise, is the whole step, as before)
  // (the size the cards settle at is read after their last step, past the marks)
  const marks = run.indexOf('paintOverlays(fv, to, st);'), last = run.indexOf('if (bareSeen) { await Promise.race('), sig = run.indexOf('lastCam = cam; framedSig = cardSig();');
  assert.ok(marks > 0 && last > marks && sig > last, 'marks, then the wait for the last step, then the size is read');
  // (only with the same patient over the plate: a change of patient's marks wait for the model)
});


test('an instrument that only reads the model rides the change under the glide; one that records or plays on arrival still waits', () => {
  // (none of the recording instruments, nor the catheter's, is on the list)
  const list = /const RIDES_MODEL = new Set\(\[([^\]]*)\]\)/.exec(src)[1];
  for (const k of ['doppler', 'beats', 'vitals', 'hvpg', 'fibroscan', 'scope']) assert.ok(!list.includes(`'${k}'`), `${k} waits for the slide's state`);
  // (the shipped decks: a slide's tool of those kinds is the whole list, so a new kind is a deliberate addition)
});


// A camera beat and a flip of the scale (they wait for no cards) used to wait a flat 1.5 s after the glide set off, though the glide lands in
// 480 to 900 ms (camMs, and an arc's stretch), and at all when the framing did not change: their call-outs came late. Now the wait is the glide's.
test('a move that waits for no cards ends with its glide: polled, cut by a newer beat', () => {
  const tail = cam.slice(cam.indexOf('if (gl) { await until('), cam.indexOf('else await waitCut(gl, cut);') + 'else await waitCut(gl, cut);'.length);
  assert.ok(tail.startsWith('if (gl) {'), 'a glide is waited for');
  // (a change of view still morphing is moving too, and the wait is cut by a newer press: push B)
  assert.match(tail, /^if \(gl\) \{ await until\(\(\) => cut\(\) \|\| \(!stage\.gliding\(\) && !stage\.viewChanging\?\.\(\)\), gl \+ 1500\); return; \}\s*if \(switching\) await viewSettled\(cut, stage\);\s*else await waitCut\(gl, cut\);$/);
  // (polled, never one timer: a beat pressed again while this one moves is noticed within a frame or two, not after the glide)
  assert.doesNotMatch(tail, /glideLeft/);
  // (the callers: a beat and a flip of the scale paint their call-outs right after the camera returns)
  const beatMove = src.slice(src.indexOf('async function beatMove('), src.indexOf('function clearPill()'));
  assert.ok(beatMove.indexOf('await camera(cam, v, cut)') > 0 && beatMove.indexOf('await camera(cam, v, cut)') < beatMove.indexOf('paintOverlays(v, i,'));
  const flip = src.slice(src.indexOf('async function flipMove('), src.indexOf('\n  }\n', src.indexOf('async function flipMove(')));
  assert.ok(flip.indexOf('await camera(cam, v, cut)') > 0 && flip.indexOf('await camera(cam, v, cut)') < flip.indexOf('paintOverlays(v, i,'));
});

// Behind a case card the camera eases out to the whole patient: the new patient starts when that glide has landed (it takes 480 to 900 ms),
// not a flat 1.5 s after it set off, and at once when the figure was already whole.
test('the case card\'s retreat ends with its glide', () => {
  const rc = src.slice(src.indexOf('async function caseRun('), src.indexOf('// A question card (slide field question)'));
  assert.ok(rc.indexOf('gl + 600);') < rc.indexOf('await morphTo(st, cut'), 'the patient changes only once the camera is still');
});

// A leave takes the step below its entrance (motion-scale-shipped): a slide's halos came in over 500 ms and left over one small step. Since 15 Nov 2026 (app review
// R1-7) no vessel is drawn with a glow at all, so a slide's glow sources are named and dropped at once: nothing eases and no frame is asked for.
test('a slide\'s glow sources are named and dropped at once: nothing eases, and the figure is not woken for them', () => {
  const live = {};
  const E = { A: { e: { from: 'x', to: 'y' } }, B: { e: { from: 'y', to: 'z' } } };
  const { setGlowSrc, glow } = createGlow({ E, EI: {} }, live);
  setGlowSrc('slide', [{ id: 'A', col: 'red' }, { id: 'B', col: null }, { id: 'nothere', col: null }]);
  assert.deepEqual([...glow.lit.keys()].sort(), ['A', 'B'], 'the vessels named, the unknown one left out');
  assert.equal(glow.lit.get('A').to, 1);
  assert.equal(glow.raf, 0, 'no frame asked for');
  setGlowSrc('hover', [{ id: 'B' }]);
  setGlowSrc('slide', []);
  assert.deepEqual([...glow.lit.keys()], ['B'], 'a vessel two sources name stays while one of them does');
  setGlowSrc('hover', []);
  assert.equal(glow.lit.size, 0, 'and goes with the last');
  assert.notEqual(live.glowSync, true, 'the glow sync is not set for a glow that is not drawn');
});
