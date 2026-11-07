// The slide change's teaching card as one page (Mohammad, 1 Nov 2026: "Steps of BRTO or HVPG TIPS during slides makes the text slide
// with my finger then pops back ... This whole slide transition might need to be reimagined"). src/ui/card-page.js, presenter.js
// app.css .pz-page. Walks every slide of every deck, every view and every procedure step, as Next and Back would.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS } from '../src/ui/decks.js';
import { beatCount } from '../src/ui/slide-beats.js';
import { PROCS as PROC_TABLE, MEASURES, GRAFTS } from '../src/ui/proc-anim.js';
// (A measuring procedure, the EUS-PPG, steps like the others: its Next plays its steps before the slide moves on.)
const PROCS = { ...PROC_TABLE, ...MEASURES, ...GRAFTS };
import { pageOn, followOf, pageIn, FOLLOW } from '../src/ui/card-page.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const presenter = read('../src/ui/presenter.js');
const css = read('../styles/app.css');
const body = (name) => { const i = presenter.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return presenter.slice(i, presenter.indexOf('\n  }\n', i)); };
const procKind = (s) => (typeof s.procedure === 'string' ? s.procedure : s.procedure?.kind) || null;

// presenter.js turnsSlide, as written there, run against each state of the walk.
const turnsSrc = (() => { const i = presenter.indexOf('const turnsSlide = (dx) =>'); return presenter.slice(presenter.indexOf('=>', i) + 2, presenter.indexOf(';\n', i)); })();
const turnsSlide = new Function('dx', 'caseLift', 'lapseOn', 'procRun', 'procWait', 'slides', 'want', 'beat', 'lastBeat', `return ${turnsSrc};`);

// Next as presenter.js next() runs it on a landed slide (no case card, no time-lapse playing): a procedure's steps first (the first
// Next sends the catheter in, each next plays a step, the one after the last moves on), then the slide's views, then the next slide.
function pressNext(deck, st) {
  const s = deck.slides[st.at], P = PROCS[procKind(s)];
  if (P && !st.done) {
    if (st.step < 0) { st.step = 0; return 'step'; }
    if (st.step < P.stops.length - 1) { st.step++; return 'step'; }
    st.done = true;
  }
  if (st.beat < beatCount(s) - 1) { st.beat++; return 'view'; }
  if (st.at < deck.slides.length - 1) { st.at++; st.beat = 0; st.step = -1; st.done = false; return 'slide'; }
  return 'end';
}
const follows = (deck, st, dx) => turnsSlide(dx, null, false, st.step >= 0 && !st.done ? {} : null, false, deck.slides, st.at, st.beat, (i) => beatCount(deck.slides[i]) - 1);

test('every slide of every deck: a Next swipe moves the card only when that Next changes the slide, never on a step or a view', () => {
  let slides = 0, steps = 0, views = 0;
  for (const deck of DECKS) {
    const st = { at: 0, beat: 0, step: -1, done: false };
    for (let guard = 0; guard < 3000; guard++) {
      const f = follows(deck, st, -60), at = st.at, what = pressNext(deck, st);
      if (what === 'end') { assert.equal(f, false, `${deck.id}: the last slide's Next goes nowhere, so nothing follows`); break; }
      if (what === 'slide') slides++;
      else { assert.equal(f, false, `${deck.id} slide ${at + 2}: a Next that plays a ${what} keeps the card still (it went back on release)`); if (what === 'step') steps++; else views++; }
      if (what === 'slide' && !PROCS[procKind(deck.slides[at])]) assert.equal(f, true, `${deck.id} slide ${at + 2}: a Next that changes the slide follows the finger`);
    }
    assert.equal(st.at, deck.slides.length - 1, `${deck.id}: walked to its last slide`);
  }
  assert.ok(slides > 200, `walked ${slides} slide changes`);
  assert.ok(steps >= 15, `and ${steps} procedure steps (BRTO, BATO, TIPS), none followed`);
  assert.ok(views >= 1, `and ${views} views of the figure, none followed`);
});

test('every slide of every deck: a Back swipe moves the card only when Back changes the slide', () => {
  for (const deck of DECKS) {
    deck.slides.forEach((s, i) => {
      for (let beat = 0; beat < beatCount(s); beat++) {
        assert.equal(follows(deck, { at: i, beat, step: -1, done: false }, 60), beat === 0 && i > 0, `${deck.id} slide ${i + 2} view ${beat + 1}`);
        if (PROCS[procKind(s)]) assert.equal(follows(deck, { at: i, beat, step: 1, done: false }, 60), false, `${deck.id} slide ${i + 2}: Back during a procedure steps it back`);
      }
    });
  }
});

test('every slide of every deck takes the same page path: question, visual, case, catheter, monitor and procedure slides included', () => {
  let n = 0;
  for (const deck of DECKS) for (const s of deck.slides) { assert.equal(pageOn({ up: true }), true, `${deck.id}: ${s.title || '?'}`); n++; }
  assert.ok(n > 250, `${n} slides`);
  const g = body('glassTurn');
  assert.match(g, /const on = up && !booting && !reduce\.matches && pageOn\(\{ up, caseCard: !!caseCard, monKept \}\);/, 'the page path asks nothing of the slide coming');
  for (const k of ['booting', 'reduce', 'caseCard', 'monKept']) assert.equal(pageOn({ up: true, [k]: true }), false, k);
  assert.equal(pageOn({ up: false }), false, 'a card not up has nothing to turn');
});

test('the follow eases toward its room the whole way and never fades the card away', () => {
  assert.deepEqual(followOf(0), { x: 0, o: 1 });
  let last = 0;
  for (let dx = 4; dx <= 600; dx += 4) {
    const f = followOf(-dx);
    assert.ok(f.x < last && f.x > -FOLLOW.max, `${dx}: keeps moving, never past ${FOLLOW.max} px`);
    assert.ok(f.o >= FOLLOW.fade - 1e-9 && f.o <= 1, `${dx}`);
    last = f.x;
  }
  assert.ok(followOf(40).x > 0);
});

test('the glass and the words come in by the same keyframes, transform and opacity only', () => {
  for (const k of ['next', 'back', 'jump']) for (const fr of pageIn(k, 24, 6)) assert.deepEqual(Object.keys(fr).sort(), ['opacity', 'transform']);
  assert.equal(pageIn('next', 24, 6)[0].transform, 'translateX(24px)');
  assert.equal(pageIn('back', 24, 6)[0].transform, 'translateX(-24px)');
  assert.equal(pageIn('jump', 24, 6)[0].transform, 'translateY(6px)');
  assert.match(body('wordsTurnIn'), /const frames = pageIn\(k, d, RISE_PX\)[\s\S]*t\.animate\?\.\(frames, how\)[\s\S]*ui\.shade\.animate\?\.\(frames, how\)/, 'one set of keyframes, on both');
  assert.match(body('wordsFreeze'), /\[\[t, a\], \[ui\.shade, shadeAnim\]\]/, 'Next mid-entrance stops both where they are');
});

test('during motion the page changes only transform and opacity: no clip, no layout read, no glass resized', () => {
  assert.doesNotMatch(presenter, /CARD_PAGE|CARD_TURN|cardpage|cardturn/);
  const pull = body('pullTo');
  assert.match(pull, /for \(const el of \(pull\.els \?\?= swipeEls\(\)\)\)/, 'the glass and the words follow together');
  assert.match(presenter, /const pageEls = \(\) => \[ui\.text, ui\.shade\];/);
  assert.doesNotMatch(pull + body('pullLet'), /clip|getBoundingClientRect|offset(Width|Height|Top|Left)/, 'the follow reads no layout and clips nothing');
  assert.match(presenter, /const turnRoom = \(\) => parseFloat\(readStyle\(ui\.root\)\.getPropertyValue\('--pz-turn-d'\)\) \|\| 20;/, 'no box read at the change');
  const i = css.indexOf('/* The teaching card as one page'), page = css.slice(i, css.indexOf('\n.', css.indexOf('[data-out="jump"]):not(.pz-leave)', i)));
  for (const k of ['next', 'back', 'jump']) assert.ok(page.includes(`.pz-page:is(.pz-card, .stack)[data-out="${k}"].pz-leave`), `the glass leaves ${k} with its words`);
  assert.doesNotMatch(page.replace(/\/\*[\s\S]*?\*\//g, ''), /clip|top|height|width/, 'no glass size or clip eased');
  assert.match(body('wordsOut'), /ui\.shade\.dataset\.out = turnNow;/, 'the glass is told the way with the words');
  assert.match(presenter, /if \(pageForce\) \{ pageForce = false; if \(keepNow\.text\) keepNow = \{ \.\.\.keepNow, text: false \}; \}/, 'a card followed out never stays');
});

test('let go after a swipe, the card carries on out from where the finger left it, never back toward where it was', () => {
  assert.match(body('pullLet'), /if \(out\) pageThrow\(x, els\);/, 'as one page: the glass and the words both');
  assert.match(body('pageThrow'), /for \(const el of els\) \{ el\.style\.setProperty\('--pz-turn-d', `\$\{\(Math\.abs\(x\) \+ d\)\.toFixed\(1\)\}px`\);/);
});
