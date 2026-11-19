// The shuffle of the words' card and the data card on a screen too short for both (19 Nov 2026, Mohammad: "I like shuffle, let's implement it when the
// vertical screen is not enough. No text scrolling inside cards."). The pure parts run here; the page's behaviour is read from the source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHUF, shufPose, shufKeyframes, shufDim, spring, shufEnd, shufDrag, shufDir, createShuffle } from '../src/ui/card-shuffle.js';
import { WORDS_MIN_PX } from '../src/ui/card-type.js';

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('at p = 0 the words are in front and the instrument is a strip behind; at p = 1 it is the other way round', () => {
  const w0 = shufPose('words', 0, 300), d0 = shufPose('data', 0, 340), w1 = shufPose('words', 1, 300), d1 = shufPose('data', 1, 340);
  assert.deepEqual([w0.f, d0.f, w1.f, d1.f], [1, 0, 0, 1]);
  assert.equal(w0.s, 1); assert.equal(d1.s, 1);
  assert.ok(Math.abs(w0.y) < 1e-9 && Math.abs(d1.y) < 1e-9);
  assert.ok(Math.abs(d0.y + SHUF.lift) < 1e-9 && Math.abs(w1.y + SHUF.lift) < 1e-9);
  assert.equal(d0.vis, SHUF.strip); assert.equal(w1.vis, SHUF.strip);
  assert.equal(w0.vis, 300); assert.equal(d1.vis, 340);
  assert.ok(Math.abs(d0.s - SHUF.back) < 1e-9);
});

test('a card behind shows only a strip no taller than the lift above the card in front (it never crosses into it)', () => {
  const g = shufPose('data', 0, 340);
  assert.ok(g.vis * g.s <= SHUF.lift + 4, `a ${g.vis} px strip at ${g.s}`);
  assert.ok(SHUF.strip > 12, 'a strip you can see and tap');
});

test('the words slip out to the side at the middle and are back at the ends; the instrument never moves sideways', () => {
  assert.equal(shufPose('words', 0, 300).x, 0); assert.ok(Math.abs(shufPose('words', 1, 300).x) < 1e-9);
  // (6, play-test: the layers swapped in one frame while the words were still 130 px over the instrument. The words leave by their own width, so at the middle the two do not overlap.)
  assert.ok(Math.abs(shufPose('words', 0.5, 300, 32, 340).x - (340 + SHUF.gapX)) < 1e-9);
  assert.equal(SHUF.tilt, 0, 'no turn: the glass follows a translation and a scale, never a turn');
  for (let i = 0; i <= 20; i++) assert.equal(shufPose('data', i / 20, 340).x, 0);
});

test('the top edge of a scaled card is held where the pose says: its translate makes up for the turn about the centre', () => {
  for (const h of [200, 340]) for (const p of [0, 0.3, 0.7, 1]) {
    const g = shufPose('data', p, h);
    const top = g.ty + (1 - g.s) * h / 2;   // where the top edge stands once scaled about the centre
    assert.ok(Math.abs(top - g.y) < 1e-9);
  }
});

test('the keyframes run from offset 0 to 1 in even steps, and are smooth at their ends (the front card is whole, nothing cut)', () => {
  const k = shufKeyframes('data');
  for (const list of [k.tf, k.clip, k.dim]) {
    assert.equal(list.length, SHUF.steps + 1);
    assert.equal(list[0].offset, 0); assert.equal(list.at(-1).offset, 1);
  }
  assert.match(k.tf[0].transform, /scale\(0\.92/); assert.match(k.tf.at(-1).transform, /scale\(1\.0000\)/);
  // (in front, the clip reaches past the box so the shadow is whole; behind, it leaves the strip)
  // (the foot is a share of the card's own height: 100%, never a length measured when the shuffle was built, CRD-3)
  assert.match(k.clip.at(-1).clipPath, /^inset\(-40\.0px -40\.0px calc\(\(100% - 24px\) \* 0\.0000 - 40\.0px\) -40\.0px round 18px\)$/);
  assert.match(k.clip[0].clipPath, /^inset\(0\.0px 0\.0px calc\(\(100% - 24px\) \* 1\.0000 - 0\.0px\) 0\.0px round 18px\)$/);
  assert.equal(+k.dim.at(-1).opacity, 0); assert.ok(+k.dim[0].opacity > 0.2);
});

test('the words card is dimmer in two layers than the data card in one (each half the weight)', () => {
  assert.ok(shufDim('words', 1, 2) * 2 <= SHUF.dimWords + 1e-9);
  assert.equal(shufDim('data', 0), SHUF.dimData);
  assert.equal(shufDim('data', 1), 0); assert.equal(shufDim('words', 0), 0);
});

test('the spring settles on its end without passing it, and a release goes the way the finger was going', () => {
  let p = 0, v = 0, over = 0, n = 0;
  for (; n < 400; n++) { const s = spring(p, v, 1, 1 / 60); p = s.p; v = s.v; over = Math.max(over, p - 1); if (s.done) break; }
  assert.ok(n < 100, `${n} frames`);
  assert.equal(p, 1); assert.ok(over < 1e-6, 'no overshoot');
  assert.equal(shufEnd(0.4, 0), 0); assert.equal(shufEnd(0.6, 0), 1);
  assert.equal(shufEnd(0.3, 2), 1, 'a quick throw up carries it'); assert.equal(shufEnd(0.7, -2), 0);
  assert.equal(shufDrag(0, 85), 0.5);
  assert.ok(shufDrag(0, -170) > -0.3 && shufDrag(0, -170) < 0, 'it gives a little past the end');
});

test('layout shuffles only a screen too short for the pair, and a card with readings to tuck is not shuffled', () => {
  const s = src('src/ui/presenter-ladders.js');
  assert.match(s, /if \(!below && sw && !wideSheet\(dd\)\) \{\s*shuf = true; below = true; stepDk\(1\);/);
  assert.match(s, /live\.shuffle\?\.park\(\);\s*\n\s*try \{ layoutNow\(\); \} finally \{ live\.shuffle\?\.resume\(\); \}/);
  assert.match(s, /live\.shuffle\?\.sync\(shuf, lockKey \|\| ''\)/);
  assert.match(s, /let y = shuf \? top0 :/);
  assert.match(s, /shift = shuf \? SHUF\.lift \* k :/);
  assert.match(s, /!shuf && !wideSheet\(dd\)\) rise = pairRise/, 'a shuffled pair does not rise');
  assert.match(s, /textLock = \{ key: lockKey, below, shuf,/, 'the shuffle is part of what a slide keeps');
});

test('the fit parks the shuffle while it measures, and nothing scrolls inside a card for want of room', () => {
  const z = src('src/ui/presenter-zoom.js');
  assert.match(z, /live\.shuffle\?\.park\(\);[^\n]*\n\s*try \{ fitEach\(els\); \} finally \{ live\.shuffle\?\.resume\(\); \}/);
  assert.doesNotMatch(z, /pz-scrolls/);
  assert.doesNotMatch(src('styles/app-05-presenter-cards.css'), /pz-scrolls/);
  assert.match(z, /Math\.min\(1, WORDS_MIN_PX \/ sm\)/, 'the words\' zoom never takes lettering under 12 px');
  assert.equal(WORDS_MIN_PX, 12);
});

test('the swipe up or down moves the stack only once it is clearly up or down, on a card or the figure, and never over a control', () => {
  const p = src('src/ui/presenter.js');
  assert.match(p, /live\.shuffle = createShuffle\(live\)/);
  assert.match(p, /const k = cardSwipe\(t\.clientX - shufT\.x, t\.clientY - shufT\.y\);\s*\n\s*if \(k < 0\) \{ shufT = null; return; \}/);
  assert.match(p, /shufT\.on = true; sw = null;/, 'the slide swipe lets go of it');
  assert.match(p, /ownsTouch\(e\.target\.closest\?\.\('canvas'\)\?\.parentElement \?\? e\.target/);
});

test('the shuffle moves cards only by animations (a transform added to its own, a clip, a veil), scrubbed on the frame scheduler', () => {
  const m = src('src/ui/card-shuffle.js');
  assert.doesNotMatch(m, /requestAnimationFrame/);
  assert.match(m, /frameFor\('shuffle'\)/);
  assert.match(m, /composite: 'add'/);
  assert.match(m, /pseudoElement: '::after'/);
  assert.doesNotMatch(m, /style\.(transform|translate|scale|rotate|clipPath|opacity)\s*=/, 'no inline style is written per frame');
  const css = src('styles/app-05-presenter-cards.css');
  assert.match(css, /\.pz-shade\.pz-shuf::after/);
  assert.match(css, /\.pz\.pz-shuf\.pz-shuf-data \.pz-data \{ z-index: 3; \}/);
});

test('the words of a shuffled card are fitted alone: Regular, then the title a step down, then the CAUSES line gone (7, play-test: words clipped by 16 to 37 px)', () => {
  const s = src('src/ui/presenter-ladders.js');
  assert.match(s, /const ch0 = ch, gap0 = gap; ch = 0; gap = 0;\s*trim = 0;\s*let fits = steps\(\);\s*if \(!fits\) for \(const n of \[1, 2\]\) \{ trim = n; fits = steps\(\); if \(fits\) break; \}/);
  assert.match(s, /if \(!fits\) for \(const n of \[0, 1, 2\]\) \{ trim = n; if \(step\(\)\) break; \}\s*\n\s*ch = ch0; gap = gap0;/, 'then Compact, as a phone on its side always did');
  // (and the sweep's own rule, fit-rules.js, names a words card whose content runs past its box.)
  assert.match(src('src/ui/gallery/fit-rules.js'), /content runs \$\{Math\.round\(low\)\} px past its box/);
});

test('a swipe up brings the instrument forward and a swipe down the words, mid-glide too: six alternating swipes are six moves (3, play-test)', () => {
  assert.equal(shufDir(0.3, 0, 40), 1); assert.equal(shufDir(0.7, 0, -40), 0);
  assert.equal(shufDir(0.5, 0, 18), 1); assert.equal(shufDir(0.5, 0, -18), 0);
  assert.equal(shufDir(0.2, 1.2, 5), 1, 'a quick flick counts, however short'); assert.equal(shufDir(0.8, -1.2, -5), 0);
  assert.equal(shufDir(0.7, 0, 4), 1, 'a nudge goes to the nearer end'); assert.equal(shufDir(0.3, 0, -4), 0);
  const sh = createShuffle({ ui: null }); assert.equal(sh.active(), false);
  let p = 0; for (let i = 0; i < 6; i++) p = shufDir(p, 0, i % 2 ? -40 : 40);
  assert.equal(p, 0, 'up, down, up, down, up, down ends with the words in front');
});

test('the strip of the card behind is a place on the screen: the touch glue asks the shuffle, not the elements (3, play-test)', () => {
  const p = src('src/ui/presenter.js');
  assert.match(p, /behind: sh\.stripHit\(t\.clientX, t\.clientY\)/);
  assert.doesNotMatch(p, /behind\.contains\(e\.target\)/);
  const m = src('src/ui/card-shuffle.js');
  assert.match(m, /function stripHit\(x, y\)/);
  assert.match(src('src/ui/presenter-start.js'), /tapTracker\(data, \{ ok: \(\) => \(zoomReady\(\) && !\(live\.shuffle\?\.active\(\) && live\.shuffle\.front\(\) !== 'data'\)\) \|\| zoom\.up/);
});

test('the glass of the card behind is cut to its strip (the GPU draws it where a page clip-path cannot reach) (2, play-test)', () => {
  const m = src('src/ui/card-shuffle.js');
  assert.match(m, /const cutOf = \(el\) =>/);
  assert.match(m, /get bottom\(\) \{ return footOf\(el\); \}/);
  assert.match(src('src/ui/presenter-start.js'), /cut: \(g\) => live\.shuffle\?\.cutOf\(g\) \|\| null/);
  assert.match(m, /\[ui\.text, 'words', 2, 0, false\]/, 'the words show no strip of their own: only the glass and the kicker do');
});

test('a card zoomed from a shuffled pair comes forward first and the other is never enlarged (4, play-test)', () => {
  const l = src('src/ui/presenter-ladders.js');
  assert.match(l, /sh\.hold\('data'\);\s*await until\(\(\) => !live\.ui \|\| sh\.settled\(\), 900\);/);
  assert.match(l, /if \(focus === 'text'\) return;/);
  assert.match(src('src/ui/presenter-start.js'), /scene: \(\) => \(live\.shuffle\?\.active\(\) \? \[\] : \[text, shade\]\)/);
  assert.match(src('src/ui/card-shuffle.js'), /if \(live\.ui\?\.zoom\?\.on\) return;/, 'the pair holds still while a card is zoomed');
});

test('a screen too short for the pair first gives the cards a wider column, and only then shuffles them (the same words in fewer lines)', () => {
  const l = src('src/ui/presenter-ladders.js');
  assert.match(l, /if \(lock\?\.wide\) live\.ui\.root\.style\.setProperty\('--pz-cw', SHUF\.wide\); else live\.ui\.root\.style\.removeProperty\('--pz-cw'\);/);
  assert.match(l, /setProperty\('--pz-cw', SHUF\.wide\);\s*\n\s*wider = true;/);
  assert.match(l, /live\.textLock = \{ key: lockKey, below, shuf, wide: wider,/, 'a slide keeps its width with the rest of what its words lock');
  assert.ok(l.indexOf("wider = true;") < l.indexOf("shuf = true; below = true; stepDk(1);"), 'wider first, shuffle last');
  assert.match(SHUF.wide, /^min\(\d+px, \d+vw\)$/);
});

// The strip of the card behind never holds a piece of a line (19 Nov 2026, the deck sweep: a half line of the card behind showed on 406 of 412 Shuffle slides at 844 x 390,
// cut across by the strip's edge; Mohammad called it "disgusting stray text"). The words and numbers of a card behind are taken out (their opacity, added to their own), and a handle
// stands in the strip instead, so what shows there is the same on every slide whatever the card's first line is.
import { shufInk, shufHandle } from '../src/ui/card-shuffle.js';

test('the card behind shows no words or numbers; the card in front shows all of them', () => {
  assert.equal(shufInk(0), 0); assert.equal(shufInk(1), 1);
  for (const f of [0, 0.1, 0.25]) assert.equal(shufInk(f), 0, `a card ${f} of the way forward is still a strip`);
  assert.equal(shufInk(0.8), 1, 'whole well before it is in front');
  let last = -1;
  for (let i = 0; i <= 40; i++) { const v = shufInk(i / 40); assert.ok(v >= last - 1e-12, 'only ever more of the words as the card comes forward'); last = v; }
});

test('the handle is whole while the card is behind and gone before it is half forward', () => {
  assert.equal(shufHandle(0), 1); assert.equal(shufHandle(1), 0);
  assert.equal(shufHandle(0.5), 0);
  let last = 2;
  for (let i = 0; i <= 40; i++) { const v = shufHandle(i / 40); assert.ok(v <= last + 1e-12); last = v; }
});

test('every card carries keyframes for its contents (added to their own opacity) and its handle, from behind (offset 0) to in front (offset 1)', () => {
  for (const [card, h] of [['data', 340], ['words', 300]]) {
    const k = shufKeyframes(card, card === 'words' ? 2 : 1);
    for (const list of [k.ink, k.tab]) { assert.equal(list.length, SHUF.steps + 1); assert.equal(list[0].offset, 0); assert.equal(list.at(-1).offset, 1); }
    const behind = card === 'data' ? 0 : 1, front = 1 - behind;   // (the words are behind at p = 1)
    const at = (list, p) => +list[Math.round(p * SHUF.steps)].opacity;
    assert.equal(at(k.ink, behind), -1, `${card}: behind, the contents' opacity is taken to nothing`);
    assert.equal(at(k.ink, front), 0, `${card}: in front, nothing is added: the contents keep their own`);
    assert.equal(at(k.tab, behind), 1); assert.equal(at(k.tab, front), 0);
  }
});

test('the page wires the contents and the handle to the same scrub as the clip, and a handle is drawn for the card behind', () => {
  const js = src('src/ui/card-shuffle.js'), css = src('styles/app-05-presenter-cards.css');
  assert.match(js, /composite: 'add'/);
  assert.match(js, /inks: \[\.\.\.el\.children\]/);
  assert.match(js, /pseudoElement: '::before'/);
  assert.match(js, /for \(const k of a\.inks\) k\.currentTime = t/, 'scrubbed with p, like the clip');
  assert.match(css, /\.pz\.pz-shuf \.pz-data::before, \.pz-shade\.pz-shuf::before \{[^}]*content: ''/);
});
