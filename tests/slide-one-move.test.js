// A slide change is one move (premium-feel R1): over the plate the cards come in during the camera's last 40 percent, and a change
// of patient eases under the glide, where the figure can move smoothly while its organs change. ?onemove=0 is the chain as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const run = src.slice(src.indexOf('async function transitionRun('), src.indexOf('function paintOverlays('));
const cam = src.slice(src.indexOf('async function camera('), src.indexOf('const cardsEntering ='));

test('the flag, the share of the glide and the shared morph window', () => {
  assert.match(src, /const ONE_MOVE = !\/\[\?&\]onemove=0\\b\/\.test\(location\.search\);/);
  assert.match(src, /const CARDS_AT = 0\.4, MORPH_ONE_MS = 1200;/);
  assert.match(src, /const MORPH_MS = 2000;/, 'the old window stays for ?onemove=0 and a question\'s answer');
});

test('the stage says what is left of its glide, read from the glide itself', () => {
  assert.match(stage, /vtGliding = true; vtUntil = t0 \+ ms; vtMs = ms;/);
  assert.match(stage, /glideLeft: \(\) => \(vtGliding \? \{ left: Math\.max\(0, vtUntil - performance\.now\(\)\), ms: vtMs \} : \{ left: 0, ms: 0 \}\),/);
});

test('camera() resolves at the glide\'s last part only when asked, over the plate', () => {
  assert.match(cam, /async function camera\(cam, s, cut, early = 0, begun = null\)/);
  // (The glide has set off: the hook runs, then one timer to the point asked for and a look, never a poll alone: late timers in a busy glide put the cards after its landing.)
  assert.match(cam, /frameTo\(v === 'circuit' \? 'fit' : cam, s, gl\);\s*begun\?\.\(\);[^\n]*\n\s*(?:\/\/[^\n]*\n\s*)*if \(early && gl\) \{\s*(?:\/\/[^\n]*\n\s*)*const g0 = stage\.glideLeft\?\.\(\);\s*if \(g0\?\.ms\) await wait\(Math\.max\(0, g0\.left - g0\.ms \* early - 40\)\);\s*await until\(\(\) => \{ if \(cut\(\)\) return true; const g = stage\.glideLeft\?\.\(\); return !g \|\| g\.left <= g\.ms \* early; \}, gl \+ 1500\); return;\s*\}\s*await wait\(gl\);/);
  // (The lobule's way in keeps its own waits: its branch returns before the plate's glide.)
  const lob = cam.slice(cam.indexOf('if (LOBULE_CAM.test(cam))'), cam.indexOf("const v = s.view || 'anatomic';"));
  assert.doesNotMatch(lob, /early/);
});

test('what stays serial: the liver, a catheter, a case or question card, an instrument, a figure that cannot move smoothly', () => {
  assert.match(run, /const plate = ONE_MOVE && bare && !ct && !!cam && !LOBULE_CAM\.test\(cam\) && !store\.get\(\)\.lobule && !store\.get\(\)\.sinusoid;/);
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
  assert.match(run, /if \(later && !under\) \{ if \(!await morphTo\(st, cut, ONE_MOVE \? MORPH_ONE_MS : MORPH_MS\)\) return;/);
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
  assert.match(run, /if \(prep\) \{ if \(await prep\) await smooth\(cut\); \} else await unseen\(cut\);\s*if \(cut\(\)\) return;/);
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
  const marks = run.indexOf('paintOverlays(fv, to, st);'), last = run.indexOf('if (bareSeen) { await until(() => cut() || !cardsEntering(), 1200); if (cut()) return; }'), sig = run.indexOf('lastCam = cam; framedSig = cardSig();');
  assert.ok(marks > 0 && last > marks && sig > last, 'marks, then the wait for the last step, then the size is read');
  // (only with the same patient over the plate: a change of patient's marks wait for the model)
  assert.match(run, /bareSeen = plate && !swap && !caseCard;/);
});

test('words out: cards already out or on their way out make the move wait only for what is still fading', () => {
  const out = src.slice(src.indexOf('function wordsOut(next) {'), src.indexOf('const fadeLeft ='));
  assert.match(out, /const leaving = !dataOut && !out\.some\(/);
  assert.match(out, /const fading = leaving \? fadeLeft\(\[\.\.\.out, data, ui\.scl, ui\.shade\]\) : 0;/);
  assert.match(out, /if \(leaving\) return fading \? fading \+ 20 : 0;\s*\n\s*return D_SMALL \+ 20;/);
  assert.match(src, /const fadeLeft = \(els\) => els\.reduce\(/);
});

test('an instrument that only reads the model rides the change under the glide; one that records or plays on arrival still waits', () => {
  assert.match(src, /const RIDES_MODEL = new Set\(\['profile', 'curve', 'flows', 'plane', 'criteria', 'trace'\]\);/);
  assert.match(src, /const underTool = \(t\) => !t \|\| \(RIDES_MODEL\.has\(t\.kind\) && !\(t\.kind === 'trace' && t\.range === 'beats'\)\);/);
  // (none of the recording instruments, nor the catheter's, is on the list)
  const list = /const RIDES_MODEL = new Set\(\[([^\]]*)\]\)/.exec(src)[1];
  for (const k of ['doppler', 'beats', 'vitals', 'hvpg', 'fibroscan', 'scope']) assert.ok(!list.includes(`'${k}'`), `${k} waits for the slide's state`);
  // (the shipped decks: a slide's tool of those kinds is the whole list, so a new kind is a deliberate addition)
  assert.match(run, /const under = plate && later && !caseCard && underTool\(s\.tool\)/);
});

test('a move cut by a newer slide leaves its cards unseen instead of bringing them in for the newer move to fade out again', () => {
  const tr = src.slice(src.indexOf('async function transition(to) {'), src.indexOf('async function transitionRun('));
  assert.match(tr, /if \(bare && want === to\) \{ bare = false; layout\(\); cardsIn\(\); \}/);
  assert.doesNotMatch(tr, /if \(bare\) \{ bare = false; layout\(\); cardsIn\(\); \}/);
});
