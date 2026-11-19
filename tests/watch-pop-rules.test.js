// The pop rules of the ?watch recorder (DBG-8, bible review 19 Nov 2026): card-pop, card-size-snap, glass-before-words, card-empty. The owner's first rule is "nothing pops" (17 Nov 22:01: appearance
// and disappearance of anything must never glitch; cards never show before fully loaded; fit content), and the only judge for it was scripts/frame-step.mjs, which ran on software-GL pictures. These judge the
// samples the recorder already keeps (K: the glass's drawn cards, W: do the slide cards hold their words), so a packet taken on a device names a pop. Each fires on its fault and stays quiet on the look-alike.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardPop, cardSizeSnap, glassBeforeWords, cardEmpty, judgeMotion, MOTION_RULES, POP_GAP_MS } from '../src/ui/watch/motion-rules.js';
import { exportHistory, decodeHistory } from '../src/ui/watch/history.js';
import { runRules } from '../src/ui/selfcheck/rules.js';
import { framesOf } from '../src/ui/selfcheck/rules-motion.js';
import '../src/ui/selfcheck/plugins.js';

const DT = 16;
const run = (n, fn) => Array.from({ length: n }, (_, i) => ({ t: i * DT, c: null, L: null, K: null, W: [1, 1, 1, 0], ...fn(i) }));
const card = (name, a, h = 200, w = 300) => [name, 10, 10, w, h, a];
const hist = (samples, more = {}) => ({ samples, events: [], traces: [], vb: null, env: { vw: 1440 }, ...more });

// ── card-pop (opacity-jump) ──
test('card-pop: a card that goes from gone to shown in one frame popped; so does one that vanishes', () => {
  const inn = run(20, (i) => ({ K: i < 10 ? [] : [card('pz-data', 1)] }));
  const f = cardPop(hist(inn));
  assert.equal(f.length, 1); assert.equal(f[0].rule, 'card-pop'); assert.match(f[0].what, /pz-data/); assert.match(f[0].where, /appeared in one frame/); assert.ok(f[0].why && f[0].owner);
  const out = run(20, (i) => ({ K: i < 10 ? [card('pz-text', 1)] : [] }));
  assert.match(cardPop(hist(out))[0].where, /vanished in one frame/);
  assert.equal(cardPop(hist(run(20, (i) => ({ K: [card('pz-data', i < 10 ? 1 : 0.2)] })))).length, 1, 'a drop of 0.8 in one frame');
});

test('card-pop must not fire: a fade over many frames, a dim step, a card that was never there, an unreadable source, a stalled page', () => {
  assert.deepEqual(cardPop(hist(run(40, (i) => ({ K: [card('pz-data', Math.min(1, i / 20))] })))), [], 'a fade in over 20 frames');
  assert.deepEqual(cardPop(hist(run(40, (i) => ({ K: [card('pz-data', i < 20 ? 1 : 0.7)] })))), [], 'a step of 0.3 is a settle, not a pop');
  assert.deepEqual(cardPop(hist(run(30, () => ({ K: [] })))), []);
  assert.deepEqual(cardPop(hist(run(30, (i) => ({ K: i >= 10 && i < 12 ? null : [card('pz-data', 1)] })))), [], 'unknown is not gone');
  const stalled = run(20, (i) => ({ K: i < 10 ? [] : [card('pz-data', 1)] })).map((s, i) => (i >= 10 ? { ...s, t: s.t + 2000 } : s));
  assert.ok(2000 > POP_GAP_MS);
  assert.deepEqual(cardPop(hist(stalled)), [], 'a page that was not drawing for 2 s shows no step');
});

// ── card-size-snap (height-jump, width-jump) ──
test('card-size-snap: a card whose height snaps 60 px in one frame, with calm frames either side, is named; so is a width snap', () => {
  const h = run(30, (i) => ({ K: [card('pz-data', 1, i < 15 ? 200 : 260)] }));
  const f = cardSizeSnap(hist(h));
  assert.equal(f.length, 1); assert.match(f[0].where, /height 200 to 260 px in one frame/);
  const w = run(30, (i) => ({ K: [card('pz-text', 1, 200, i < 15 ? 300 : 340)] }));
  assert.match(cardSizeSnap(hist(w))[0].where, /width 300 to 340/);
});

test('card-size-snap must not fire: a glide to the same size, a tiny change, a card that is fading in, a size change over a stalled gap', () => {
  assert.deepEqual(cardSizeSnap(hist(run(40, (i) => ({ K: [card('pz-data', 1, 200 + Math.min(60, i * 3))] })))), [], 'a glide: 3 px a frame');
  assert.deepEqual(cardSizeSnap(hist(run(30, (i) => ({ K: [card('pz-data', 1, i < 15 ? 200 : 206)] })))), [], '6 px is under the floor');
  assert.deepEqual(cardSizeSnap(hist(run(30, (i) => ({ K: [card('pz-data', i < 15 ? 0.02 : 1, i < 15 ? 100 : 260)] })))), [], 'a card at alpha 0.02 is not on show: its size is not seen');
  const gap = run(30, (i) => ({ K: [card('pz-data', 1, i < 15 ? 200 : 260)] })).map((s, i) => (i >= 15 ? { ...s, t: s.t + 1000 } : s));
  assert.deepEqual(cardSizeSnap(hist(gap)), []);
  // a fast glide: 14 px a frame for 10 frames has neighbours as large as the step, so it is not an outlier
  assert.deepEqual(cardSizeSnap(hist(run(40, (i) => ({ K: [card('pz-data', 1, 200 + Math.min(140, Math.max(0, i - 10) * 14))] })))), []);
});

// ── glass-before-words (glass-alone, bare-card) ──
test('glass-before-words: the teaching card\'s glass shown with no words in any card for a tenth of a second is named', () => {
  const s = run(30, () => ({ K: [card('pz-shade', 1)], W: [0, 0, 0, 0] }));
  const f = glassBeforeWords(hist(s));
  assert.equal(f.length, 1); assert.equal(f[0].rule, 'glass-before-words'); assert.match(f[0].where, /no words in any card/);
});

test('glass-before-words must not fire: words present, the slide still being fitted unseen, the glass fading, one frame, an unread words bit', () => {
  assert.deepEqual(glassBeforeWords(hist(run(30, () => ({ K: [card('pz-shade', 1)], W: [1, 0, 0, 0] })))), []);
  assert.deepEqual(glassBeforeWords(hist(run(30, () => ({ K: [card('pz-shade', 1)], W: [0, 0, 0, 1] })))), [], 'prep: fitted unseen');
  assert.deepEqual(glassBeforeWords(hist(run(30, () => ({ K: [card('pz-shade', 0.1)], W: [0, 0, 0, 0] })))), [], 'not yet shown');
  assert.deepEqual(glassBeforeWords(hist(run(30, (i) => ({ K: [card('pz-shade', 1)], W: i === 10 ? [0, 0, 0, 0] : [1, 1, 1, 0] })))), [], 'one frame');
  assert.deepEqual(glassBeforeWords(hist(run(30, () => ({ K: [card('pz-shade', 1)], W: null })))), [], 'unknown is not empty');
  assert.deepEqual(glassBeforeWords(hist(run(30, () => ({ K: [card('pz-shade', 1)], W: undefined })))), [], 'a history from before the words bit');
});

// ── card-empty (card-no-text) ──
test('card-empty: a data card shown with nothing in it is named, per card', () => {
  const s = run(30, () => ({ K: [card('pz-data', 1), card('pz-text', 1)], W: [1, 0, 0, 0] }));
  const f = cardEmpty(hist(s));
  assert.equal(f.length, 1); assert.match(f[0].what, /pz-data/); assert.equal(f[0].rule, 'card-empty');
});

test('card-empty must not fire: a card with words, one not on show, one being fitted, a card that is not a slide card', () => {
  assert.deepEqual(cardEmpty(hist(run(30, () => ({ K: [card('pz-data', 1)], W: [1, 1, 1, 0] })))), []);
  assert.deepEqual(cardEmpty(hist(run(30, () => ({ K: [card('pz-data', 0.1)], W: [1, 0, 0, 0] })))), []);
  assert.deepEqual(cardEmpty(hist(run(30, () => ({ K: [card('pz-data', 1)], W: [1, 0, 0, 1] })))), []);
  assert.deepEqual(cardEmpty(hist(run(30, () => ({ K: [card('toast', 1)], W: [0, 0, 0, 0] })))), []);
});

// ── the whole path: registry, history, recorder ──
test('the four rules are in the motion list and the registry, and a calm screen with words has no finding of any', () => {
  for (const id of ['card-pop', 'card-size-snap', 'glass-before-words', 'card-empty']) { assert.ok(MOTION_RULES.some((r) => r.id === id), id); assert.ok(runRules(null, { history: framesOf(hist(run(30, () => ({ K: [card('pz-data', 1)] })))), kinds: ['series'] }).every((f) => f.rule !== id)); }
  assert.deepEqual(judgeMotion(hist(run(60, () => ({ K: [card('pz-shade', 1), card('pz-text', 1), card('pz-data', 1)], W: [1, 1, 0, 0] })))).map((f) => f.rule), []);
  const pops = runRules(null, { history: framesOf(hist(run(20, (i) => ({ K: i < 10 ? [] : [card('pz-data', 1)] })))), kinds: ['series'] });
  assert.ok(pops.some((f) => f.rule === 'card-pop' && f.owner && f.why), 'the registry runs it for the recorder and the packet');
});

test('the words bit survives a packet: export, decode, judge; and a history without it still decodes', () => {
  const s = run(60, () => ({ K: [card('pz-shade', 1)], W: [0, 0, 0, 0] }));
  const out = decodeHistory(exportHistory({ samples: s, startedAt: 'x', env: { vw: 1440 } }, { seconds: 10 }));
  assert.deepEqual(out.samples[10].W, [0, 0, 0, 0]);
  assert.equal(glassBeforeWords(out).length, 1);
  const old = decodeHistory(exportHistory({ samples: run(20, () => ({ K: [card('pz-data', 1)], W: undefined })), env: {} }, { seconds: 10 }));
  assert.equal('W' in old.samples[3], false);
});
