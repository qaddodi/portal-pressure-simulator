import { stageSource } from './stage-src.js';
// A slide change is one move (premium-feel R1): over the plate the cards come in during the camera's last 40 percent, and a change
// of patient eases under the glide, where the figure can move smoothly while its organs change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const stage = stageSource();
const run = src.slice(src.indexOf('async function transitionRun('), src.indexOf('function paintOverlays('));
const cam = src.slice(src.indexOf('async function camera('), src.indexOf('const cardsEntering ='));

test('always one move: the share of the glide and the shared morph window', () => {
  assert.doesNotMatch(src, /ONE_MOVE|QUICK_SLIDE|onemove|quickslide/);
  assert.match(src, /const CARDS_AT = 0\.75, MORPH_ONE_MS = 1200;/);
  assert.match(src, /const MORPH_MS = 2000;/, 'the old window stays for a question\'s answer');
});

test('the stage says what is left of its glide, read from the glide itself', () => {
  assert.match(stage, /(?:live\.)?(?:live\.)?vtGliding = true; (?:live\.)?(?:live\.)?vtUntil = t0 \+ ms; (?:live\.)?(?:live\.)?vtMs = ms;/);
  assert.match(stage, /glideLeft: \(\) => \((?:live\.)?vtGliding \|\| (?:live\.)?viewXf \? \{ left: Math\.max\(0, (?:live\.)?vtUntil - performance\.now\(\)\), ms: (?:live\.)?vtMs \} : \{ left: 0, ms: 0 \}\),/);
});

test('what stays serial: the liver, a catheter, a case or question card, an instrument, a figure that cannot move smoothly', () => {
  assert.match(run, /const plate = bare && !ct && !!cam && !LOBULE_CAM\.test\(cam\) && !store\.get\(\)\.lobule && !store\.get\(\)\.sinusoid;/);
  assert.match(run, /const under = plate && later && !caseCard && underTool\(s\.tool\) && !!stage\.canDrift\?\.\(\) && \(fv\.view \|\| 'anatomic'\) === store\.get\(\)\.view;/);
  assert.match(run, /else if \(cam\) await camera\(cam, fv, cut, plate \? CARDS_AT : 0, prepWith\);/);
});

test('the change of patient starts with the glide, and is awaited only once the cards are in', () => {
  const start = run.indexOf("morphP = morphTo(st, cut, MORPH_ONE_MS, false).finally(() => app.classList.remove('pz-morph-under'));");
  const glide = run.indexOf('else if (cam) await camera(cam, fv, cut, plate ? CARDS_AT : 0, prepWith);');
  const cards = run.indexOf('bare = false; cardsIn({ i: to, gen: g });');
  const awaited = run.indexOf('if (morphP) { if (!await morphP) return; shownState = own ? -1 : si; ui?.tools.hold(false); }');
  assert.ok(start > 0 && start < glide && glide < cards && cards < awaited);
  // (A kept data card rides the model as it eases, from the start of the change.)
  assert.ok(run.lastIndexOf('if (keepNow.data && keepNow.swap) followData(s, to, st, cut);', start) > run.indexOf('if (under) {'));
});

test('a change after the landing never starts mid-glide, and the move ends only once the glide has landed', () => {
  assert.match(run, /if \(!plate \|\| \(later && !under\)\) await until\(\(\) => cut\(\) \|\| !stage\.gliding\(\), 1500\);/);
  assert.match(run, /if \(later && !under\) \{ if \(!await morphTo\(st, cut, MORPH_ONE_MS\)\) return;/);
  assert.match(run, /await wait\(60\); await until\(\(\) => cut\(\) \|\| !cardsEntering\(bareSeen \? CARDS_SEEN : 0\), 1200\);\s*if \(cut\(\)\) return;\s*(?:\/\/[^\n]*\n\s*)*if \(plate\) \{ await until\(\(\) => cut\(\) \|\| !stage\.gliding\(\), 1500\); if \(cut\(\)\) return; \}/);
});

// Cards in sight, marks next (the polish of 31 Oct): over the plate with the same patient the unseen cards' last fitting runs under the glide's
// first frames and the cards come in at its 60 percent point on any machine; the slide's labels, glows and marks start once the cards are in
// sight rather than after the title's last frame; and a slide asked for again while the cards are out waits for no fade that is not running.
test('same patient over the plate: the cards\' last fitting starts as the glide does, and the cards wait for it, not for a second fitting', () => {
  assert.match(run, /let prep = null, bareSeen = false;\s*const prepWith = plate && !swap && !caseCard \? \(\) => \{ prep \|\|= unseenFit\(cut\); \} : null;/);
  const glide = run.indexOf('else if (cam) await camera(cam, fv, cut, plate ? CARDS_AT : 0, prepWith);');
  assert.ok(run.indexOf('const prepWith = ') > 0 && run.indexOf('const prepWith = ') < glide);
  // (the smooth-frames gate still runs right before the cards, as it always did: only the fitting started early)
  assert.match(run, /if \(prep\) \{ if \(await prep\) await smooth\(cut, QUICK_SMOOTH\); \} else await unseen\(cut\);\s*if \(cut\(\)\) return;/);
  assert.match(src, /async function unseenFit\(cut\) \{\s*if \(ui\) \{ reFit\(\); layout\(\); await painted\(\); await painted\(\); if \(cut\(\) \|\| !ui\) return false; layout\(\); \}\s*return true;\s*\}/);
  // (Every other path still fits the cards after the glide, or after the change of patient: no `prep` there.)
  assert.equal(run.split('prep ||= unseenFit(cut)').length, 2, 'one place starts the early fitting');
});

test('the slide\'s marks start once the cards are in sight (CARDS_SEEN), and the card size is read only after the last step', () => {
  assert.match(src, /const CARDS_SEEN = D_SMALL - 40;/);
  assert.match(src, /const cardsEntering = \(left = 0\) => /);
  assert.match(src, /t\.endTime - \(t\.localTime \|\| 0\) > left/);
  // (the camera's own wait for the cards to be fully in, before a rise, is the whole step, as before)
  assert.match(cam, /await until\(\(\) => cut\(\) \|\| !cardsEntering\(\), 1200\);/);
  // (the size the cards settle at is read after their last step, past the marks)
  const marks = run.indexOf('paintOverlays(fv, to, st);'), last = run.indexOf('if (bareSeen) { await Promise.race('), sig = run.indexOf('lastCam = cam; framedSig = cardSig();');
  assert.ok(marks > 0 && last > marks && sig > last, 'marks, then the wait for the last step, then the size is read');
  // (only with the same patient over the plate: a change of patient's marks wait for the model)
  assert.match(run, /bareSeen = plate && !swap && !caseCard;/);
});

test('words out: cards already out or on their way out make the move wait only for what is still fading', () => {
  const out = src.slice(src.indexOf('function wordsOut(next) {'), src.indexOf('const fadeLeft ='));
  assert.match(out, /const leaving = !dataOut && !out\.some\(/);
  assert.match(out, /const fading = leaving \? Math\.max\(fadeLeft\(\[\.\.\.out, data, ui\.scl, ui\.shade\]\), \.\.\.\(byThrow \? \[\] : \[\.\.\.out, data, ui\.shade\]\.map\(throwLeft\)\)\) : 0;/, 'what is still fading, by the browser (a thrown card is timed by throwsOut(), push B)');
  assert.match(out, /if \(leaving\) return fading \? fading \+ 20 : 0;\s*\n[^\n]*\n\s*if \(threw\) \{ thrownNow = true; return 0; \}\s*\n\s*return D_SMALL \+ 20;/);
  assert.match(src, /const fadeLeft = \(els\) => els\.reduce\(/);
});

test('an instrument that only reads the model rides the change under the glide; one that records or plays on arrival still waits', () => {
  assert.match(src, /const RIDES_MODEL = new Set\(\['profile', 'curve', 'flows', 'plane', 'criteria', 'path', 'trace'\]\);/);
  assert.match(src, /const underTool = \(t\) => !t \|\| \(RIDES_MODEL\.has\(t\.kind\) && !\(t\.kind === 'trace' && t\.range === 'beats'\)\);/);
  // (none of the recording instruments, nor the catheter's, is on the list)
  const list = /const RIDES_MODEL = new Set\(\[([^\]]*)\]\)/.exec(src)[1];
  for (const k of ['doppler', 'beats', 'vitals', 'hvpg', 'fibroscan', 'scope']) assert.ok(!list.includes(`'${k}'`), `${k} waits for the slide's state`);
  // (the shipped decks: a slide's tool of those kinds is the whole list, so a new kind is a deliberate addition)
  assert.match(run, /const under = plate && later && !caseCard && underTool\(s\.tool\)/);
});

test('a move cut by a newer slide leaves its cards unseen instead of bringing them in for the newer move to fade out again', () => {
  const tr = src.slice(src.indexOf('async function transition(to) {'), src.indexOf('async function transitionRun('));
  assert.match(tr, /if \(mine && bare && want === to\) \{ bare = false; layout\(\); cardsIn\(\); \}/);
  assert.doesNotMatch(tr, /if \((?:mine && )?bare\) \{ bare = false; layout\(\); cardsIn\(\); \}/);
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
  const flip = src.slice(src.indexOf('async function flipMove('), src.indexOf('async function beatMove('));
  assert.ok(flip.indexOf('await camera(cam, v, cut)') > 0 && flip.indexOf('await camera(cam, v, cut)') < flip.indexOf('paintOverlays(v, i,'));
});

// Behind a case card the camera eases out to the whole patient: the new patient starts when that glide has landed (it takes 480 to 900 ms),
// not a flat 1.5 s after it set off, and at once when the figure was already whole.
test('the case card\'s retreat ends with its glide', () => {
  const rc = src.slice(src.indexOf('async function caseRun('), src.indexOf('// A question card (slide field question)'));
  assert.match(rc, /stage\.fitSlow\(gl\);\s*(?:\/\/[^\n]*\n\s*)*await until\(\(\) => cut\(\) \|\| !stage\.gliding\(\), gl \+ 600\);\s*await until\(\(\) => cut\(\) \|\| !stage\.gliding\(\), 600\); if \(cut\(\)\) return false;/);
  assert.ok(rc.indexOf('gl + 600);') < rc.indexOf('await morphTo(st, cut'), 'the patient changes only once the camera is still');
});

// A leave takes the step below its entrance (motion-scale-shipped): a slide's halos come in over 500 ms and leave over one small step, with the
// cards and labels, so the camera does not set off under an old halo still fading. ?onemove=0 keeps the old fade.
test('a slide\'s halos leave in one small step, and only the slide\'s own', () => {
  assert.match(stage, /for \(const \[id, l\] of glow\.lit\) if \(!want\.has\(id\)\) \{ l\.to = 0; if \(src === 'slide'\) l\.dur = Math\.min\(l\.dur, D_SMALL \/ 1000\); \}/);
  // (the way in is unchanged: a slide's glow still eases in over its own 500 ms)
  assert.match(stage, /o\.at = g\.at; o\.dur = 500;\n\s+slideGlowOut\.push\(o\);[\s\S]*?setGlowSrc\('slide', slideGlowOut\);/);
});
