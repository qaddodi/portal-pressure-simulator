import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zoomPlan, zoomMargin, unionBox, emptyTap, tapTracker, createCardZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_MS, SHUT_MS } from '../src/ui/card-zoom.js';

// The data card zoomed to the middle of the screen (Mohammad, 28 Oct): "can we add a feature on large screens and ipad landscape for data card
// instrument card to display it bigger when clicking on it directly; however it shouldn't like make the text smaller. the camera should like zoom
// on the card to display it centered large in middle of the screen". Code only: the controller is run against stand-in elements.
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const zoomSrc = read('../src/ui/card-zoom.js'), js = read('../src/ui/presenter.js'), css = read('../styles/app.css'), util = read('../src/ui/util.js'), stage = read('../src/ui/stage.js'), html = read('../index.html');

test('the card grows to the screen\'s room and goes to its middle, never past the most, and not at all when it is large already', () => {
  const area = { left: 0, top: 0, width: 1440, height: 900 };
  const m = zoomMargin(area);
  assert.ok(m >= 72 && m <= 110, 'a tenth of the shorter side, between 72 and 110 px');
  // (A 420 x 380 card on a 1440 x 900 screen: the height is what limits it.)
  const p = zoomPlan({ left: 40, top: 300, width: 420, height: 380 }, area);
  assert.ok(Math.abs(p.s - (900 - 2 * m) / 380) < 1e-9);
  assert.ok(p.s > ZOOM_MIN && p.s <= ZOOM_MAX);
  assert.equal(p.dx, 720 - (40 + 210), 'to the middle across');
  assert.equal(p.dy, 450 - (300 + 190), 'and down');
  // (A small card stops at the most.)
  assert.equal(zoomPlan({ left: 0, top: 0, width: 200, height: 150 }, area).s, ZOOM_MAX);
  // (One that fills the screen already is left alone, and so is a box with no size.)
  assert.equal(zoomPlan({ left: 0, top: 0, width: 1300, height: 800 }, area), null);
  assert.equal(zoomPlan({ left: 0, top: 0, width: 0, height: 380 }, area), null);
  // (The area need not start at the screen's corner.)
  const q = zoomPlan({ left: 100, top: 100, width: 300, height: 300 }, { left: 50, top: 20, width: 1000, height: 700 }, 40);
  assert.equal(q.dx, 50 + 500 - 250);
  assert.equal(q.dy, 20 + 350 - 250);
});

// A stand-in element: a parent chain, matches() by a set of selectors, a cursor.
const node = (sel = '', parent = null, cursor = 'auto') => ({ nodeType: 1, parentElement: parent, cursor, matches: (q) => q.split(',').map((x) => x.trim()).some((x) => sel.split(' ').includes(x)) });

test('a tap on an empty part of the card zooms it; a control, a row drawn to be pressed, or the handle keeps its own tap', () => {
  const card = node('card'), empty = node('', card), tile = node('', empty);
  const old = globalThis.getComputedStyle;
  globalThis.getComputedStyle = (n) => ({ cursor: n.cursor });
  try {
    assert.equal(emptyTap(tile, card), true);
    assert.equal(emptyTap(card, card), true, 'the card itself');
    assert.equal(emptyTap(node('button', empty), card), false, 'a button');
    assert.equal(emptyTap(node('', node('button', empty)), card), false, 'inside a button');
    assert.equal(emptyTap(node('input', empty), card), false);
    assert.equal(emptyTap(node('[role="slider"]', empty), card), false);
    assert.equal(emptyTap(node('.range-wrap', empty), card), false, 'a slider');
    assert.equal(emptyTap(node('', empty, 'pointer'), card), false, 'anything with a pointer cursor');
    assert.equal(emptyTap(node('[data-no-zoom]', empty), card), false);
  } finally { globalThis.getComputedStyle = old; }
});

// A stand-in for the card's pointer events.
const listeners = () => { const m = {}; return { m, addEventListener: (t, f) => { m[t] = f; } }; };
const ev = (o) => ({ isPrimary: true, button: 0, pointerId: 1, clientX: 100, clientY: 100, timeStamp: 1000, target: node('', null), ...o });

test('a tap is a quick touch that stays put: a drag, a long press, a second pointer or a cancelled touch is not one', () => {
  const old = globalThis.getComputedStyle; globalThis.getComputedStyle = () => ({ cursor: 'auto' });
  try {
    const card = Object.assign(listeners(), node('card'));
    let taps = 0, ok = true;
    tapTracker(card, { ok: () => ok, onTap: () => { taps++; } });
    const tap = (down, up, move) => { card.m.pointerdown(ev(down)); if (move) card.m.pointermove(ev(move)); card.m.pointerup(ev(up)); };
    tap({}, { timeStamp: 1200 }); assert.equal(taps, 1);
    tap({}, { clientX: 104, clientY: 103, timeStamp: 1100 }); assert.equal(taps, 2, 'a few px of wobble');
    tap({}, { clientX: 140, timeStamp: 1100 }); assert.equal(taps, 2, 'moved to another place');
    tap({}, { timeStamp: 1100 }, { clientX: 150 }); assert.equal(taps, 2, 'dragged out and back');
    tap({}, { timeStamp: 2000 }); assert.equal(taps, 2, 'held');
    tap({ isPrimary: false }, {}); assert.equal(taps, 2, 'a second finger');
    tap({ button: 2 }, {}); assert.equal(taps, 2, 'not the primary button');
    card.m.pointerdown(ev({})); card.m.pointercancel(); card.m.pointerup(ev({})); assert.equal(taps, 2, 'cancelled');
    ok = false; tap({}, {}); assert.equal(taps, 2, 'not while the card may not zoom');
    ok = true; card.m.pointerdown(ev({ target: node('button', card) })); card.m.pointerup(ev({})); assert.equal(taps, 2, 'a control');
  } finally { globalThis.getComputedStyle = old; }
});

// Stand-ins for the card, its handle, the figure's holder, the veil and the app.
const classes = () => { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), has: (c) => s.has(c) }; };
class El {
  constructor(rect, props = {}) { this.rect = rect; this.style = { transformOrigin: '', transform: 'none', scale: 'none' }; this.dataset = {}; this.classList = classes(); this.anims = []; Object.assign(this, props); }
  getBoundingClientRect() { return { ...this.rect, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height }; }
  animate(frames, o) {
    const [prop] = Object.keys(frames[1]);
    const a = { el: this, prop, frames, o, cancelled: false, done: null, cancel() { this.cancelled = true; }, finished: null };
    a.finished = new Promise((r) => { a.done = r; });
    this.anims.push(a);
    return a;
  }
}
const world = () => {
  const card = new El({ left: 40, top: 300, width: 420, height: 380 }), lip = new El({ left: 40, top: 276, width: 420, height: 24 });
  const scrim = new El({ left: 0, top: 0, width: 1440, height: 900 }), app = new El({ left: 0, top: 0, width: 1440, height: 900 });
  const log = [];
  const z = createCardZoom({ card, along: [lip], scrim, app, area: () => ({ left: 0, top: 0, width: 1440, height: 900 }), scale: () => 1, reduce: () => z.reduceNow,
    boost: (k) => log.push(['boost', +k.toFixed(2)]), hold: (on) => log.push(['hold', on]), settled: () => log.push(['settled']) });
  z.reduceNow = false;
  return { card, lip, scrim, app, log, z };
};
const stands = (el, prop) => { const old = globalThis.getComputedStyle; globalThis.getComputedStyle = (e) => e.style; return () => { globalThis.getComputedStyle = old; }; };

test('zoom: the card and its handle glide together about their common middle, the figure stays still, the veil comes up, and the card reports where it rests', () => {
  const { card, lip, scrim, app, log, z } = world(); const back = stands();
  try {
    assert.equal(z.open(), true);
    assert.equal(z.on, true); assert.equal(z.up, true);
    // (One transform on each piece, the same: about the card's middle, so the handle stays on the card's edge.)
    const t = card.anims[0], tl = lip.anims[0];
    assert.equal(t.prop, 'transform'); assert.equal(tl.prop, 'transform');
    assert.equal(t.frames[1].transform, tl.frames[1].transform);
    // (The handle stands 24 px over the card's top edge: the plan is for the two together, 404 px tall from the handle's top.)
    const p = zoomPlan({ left: 40, top: 276, width: 420, height: 404 }, { left: 0, top: 0, width: 1440, height: 900 });
    assert.equal(t.frames[1].transform, `translate(${p.dx.toFixed(2)}px, ${p.dy.toFixed(2)}px) scale(${p.s.toFixed(4)})`);
    assert.equal(card.style.transformOrigin, '210.00px 178.00px');
    assert.equal(lip.style.transformOrigin, '210.00px 202.00px', 'their middle, seen from the handle');
    assert.equal(t.o.fill, 'forwards'); assert.equal(t.o.easing, 'cubic-bezier(.2, .8, .2, 1)');
    // (The figure behind does not move, Mohammad's "don't move anything": the controller is not given it, and the only thing it glides is a transform.)
    assert.equal(zoomSrc.includes('PUSH'), false); assert.equal(/glide\([^)]*'scale'/.test(zoomSrc), false); assert.equal(/\bview\b/.test(zoomSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), false);
    assert.deepEqual([...zoomSrc.matchAll(/glide\(\w+(?:\.\w+)?, '(\w+)'/g)].map((m) => m[1]), ['transform', 'transform']);
    assert.ok(scrim.classList.contains('on')); assert.ok(app.classList.contains('pz-zoomed')); assert.equal('zoomed' in card.dataset, true);
    assert.deepEqual(log, [['hold', true], ['boost', +p.s.toFixed(2)]]);
    // (Everyone who asks the card or its handle where they are hears where they rest, however far the glide has come.)
    assert.deepEqual([card.getBoundingClientRect().left, card.getBoundingClientRect().width, card.getBoundingClientRect().bottom], [40, 420, 680]);
    assert.equal(lip.getBoundingClientRect().top, 276);
    // (A second open while it is up does nothing.)
    assert.equal(z.open(), false);
  } finally { back(); }
});

test('zoom: a stacked card sits whole in the middle: the handle on its top edge is part of what is centred and fitted', () => {
  const area = { left: 0, top: 0, width: 1440, height: 900 }, m = zoomMargin(area);
  assert.deepEqual(unionBox([{ left: 40, top: 300, width: 420, height: 380 }, { left: 40, top: 276, width: 420, height: 24 }]), { left: 40, top: 276, width: 420, height: 404 });
  assert.deepEqual(unionBox([]), { left: 0, top: 0, width: 0, height: 0 });
  { const { z, card, lip } = world(); const back = stands();
    try {
      const p = z.plan();
      assert.ok(Math.abs(p.s - (900 - 2 * m) / 404) < 1e-9, 'fitted by the height of the two');
      assert.equal(p.dy, 450 - (276 + 202), 'their middle goes to the screen\'s, not the card\'s');
      assert.equal(p.dx, 720 - (40 + 210));
      // (Once up, the whole stands where the plan put it: scaled about its middle, then moved.)
      z.open();
      const at = (y) => 478 + (y - 478) * p.s + p.dy, top = (r) => at(r.top), bottom = (r) => at(r.top + r.height);
      assert.ok(Math.abs((top(lip.rect) + bottom(card.rect)) / 2 - 450) < 1e-9, 'centred on the screen');
      assert.ok(top(lip.rect) >= m - 1e-9 && bottom(card.rect) <= 900 - m + 1e-9, 'whole, inside the margin top and bottom');
    } finally { back(); } }
  // (A handle that is not there leaves the card's own box: a card with nothing to tuck behind it.)
  { const { z, lip } = world(); const back = stands();
    try {
      lip.hidden = true;
      const p = z.plan();
      assert.equal(p.dy, 450 - (300 + 190)); assert.equal(p.s, zoomPlan({ left: 40, top: 300, width: 420, height: 380 }, area).s);
    } finally { back(); } }
});

test('zoom: closing glides back from where it stands, then puts everything as it was and says it is back', async () => {
  const { card, lip, scrim, app, log, z } = world(); const back = stands();
  try {
    z.open(); log.length = 0;
    card.style.transform = 'matrix(1.9, 0, 0, 1.9, 300, 80)';   // (caught half way)
    const shut = z.close();
    assert.equal(z.up, false, 'on its way back');
    assert.equal(z.on, true, 'but still held: nothing is laid out yet');
    assert.ok(!scrim.classList.contains('on'));
    const [a0, a1] = [card.anims[0], card.anims[1]];
    assert.equal(a0.cancelled, true, 'the open glide is let go');
    assert.deepEqual([a1.frames[0].transform, a1.frames[1].transform], ['matrix(1.9, 0, 0, 1.9, 300, 80)', 'none'], 'from where it stands to where it rests');
    assert.equal(z.close(), shut, 'closing twice is one close');
    assert.equal(z.open(), false, 'and it cannot open meanwhile');
    for (const x of [...card.anims, ...lip.anims]) x.done();
    await shut;
    assert.equal(z.on, false);
    assert.equal(Object.hasOwn(card, 'getBoundingClientRect'), false, 'the card answers for itself again');
    assert.equal(card.getBoundingClientRect().width, 420);
    assert.equal(card.style.transformOrigin, ''); assert.equal(lip.style.transformOrigin, '');
    assert.equal('zoomed' in card.dataset, false); assert.ok(!app.classList.contains('pz-zoomed'));
    assert.ok(a1.cancelled, 'the glide\'s last frame is no longer held');
    assert.deepEqual(log, [['boost', 1], ['hold', false], ['settled']]);
  } finally { back(); }
});

test('zoom: Reduce Motion moves it at once', () => {
  { const { card, z, log, scrim } = world(); const back = stands();
    try {
      z.reduceNow = true;
      z.open();
      assert.equal(card.anims[0].o.duration, 0);
      assert.ok(scrim.classList.contains('on'), 'the veil still fades');
      log.length = 0;
      return z.close().then(() => { assert.equal(z.on, false); assert.deepEqual(log, [['boost', 1], ['hold', false], ['settled']]); });
    } finally { back(); } }
});

test('zoom: reset and a card that is large already', () => {
  const { card, z, app, log } = world(); const back = stands();
  try {
    z.open(); z.reset();
    assert.equal(z.on, false); assert.ok(!app.classList.contains('pz-zoomed')); assert.equal(Object.hasOwn(card, 'getBoundingClientRect'), false);
    assert.deepEqual(log.at(-1), ['settled']);
    card.rect = { left: 0, top: 0, width: 1400, height: 880 };
    log.length = 0;
    assert.equal(z.open(), false, 'nothing to grow into'); assert.deepEqual(log, [], 'and nothing was touched');
  } finally { back(); }
});

test('the presenter lays nothing out while the card is up, and puts it back before a slide, a resize, Esc or the end of the talk', () => {
  // (Held: the card's watchers, its layout and its refits wait; one pass runs once it is back.)
  assert.match(js, /const cardMoving = \(\) => !!ui && \(ui\.data\.classList\.contains\('pz-sliding'\) \|\| 'folding' in ui\.data\.dataset \|\| zoomHeld\(\)\);/);
  assert.match(js, /const zoomHeld = \(\) => \{ if \(!ui\?\.zoom\.on\) return false; zoomMissed = true; return true; \};/);
  assert.match(js, /function layout\(\) \{\n {4}if \(!ui\) return;\n {4}if \(zoomHeld\(\)\) return;/);
  assert.match(js, /const reFit = \(\) => \{ if \(zoomHeld\(\)\) return; fitted\.forEach\(fitNow\); \};/);
  assert.match(js, /const zoomSettled = \(\) => nextFrame\(\(\) => \{ if \(!ui \|\| !zoomMissed \|\| ui\.zoom\.on\) return; zoomMissed = false; fitDone\.delete\(ui\.data\); onResize\(\); \}\);/);
  // (A slide: the card glides back, and only then does the slide run.)
  assert.match(js, /if \(zoomOn\(\)\) \{ ui\.zoom\.close\(\)\.then\(\(\) => \{ paintZoom\(\); zoomMissed = false; if \(deck && !busy\) run\(\); \}\); return; \}[^\n]*\n {4}if \(!busy\) run\(\);/);
  // (Any move that did not come by go, a slide asked for while a time-lapse plays, a new text size: the card glides back first, it never snaps.)
  assert.match(js, /async function transition\(to\) \{\n(?: {4}\/\/[^\n]*\n)+ {4}if \(zoomOn\(\)\) \{ await ui\.zoom\.close\(\); paintZoom\(\); zoomMissed = false; if \(!deck \|\| !ui\) return; \}/);
  // (Esc first glides the card back; the talk ends on the next one.)
  assert.match(js, /else if \(k === 'Escape'\) \{ if \(black\) toggleBlack\(false\); else if \(zoomOn\(\)\) ui\.zoom\.close\(\)\.then\(paintZoom\); else stop\(\); \}/);
  assert.match(js, /if \(e\?\.type === 'resize' && zoomOn\(\)\) \{ ui\.zoom\.reset\(\); paintZoom\(\); \}/);
  assert.match(js, /pillW = 0; ui\?\.zoom\.reset\(\); ui\?\.tools\.dispose\(\);/);
  // (The readings come out and tuck away under it once its glide in has ended, and not on its way in or back: the handle, a pull, the wheel, the
  // arrow keys, a swipe anywhere; the zoom is fitted to the stack as they go, zoomFollow.)
  assert.match(js, /if \(zoomOn\(\) && !zoomFolds\(\)\) return true;/);
  assert.match(js, /const setFold = \(open\) => \{\n {6}if \(zoomOn\(\) && !zoomFolds\(\)\) return;/);
  assert.match(js, /dock\.lvl > 0 \|\| btn\.contains\(e\.target\) \|\| \(zoomOn\(\) && !zoomFolds\(\)\)\) return;/);
  assert.match(js, /if \(!deck \|\| !d \|\| \(zoomOn\(\) && !zoomFolds\(\)\) \|\| e\.touches\.length !== 1/);
  assert.match(js, /if \(zoomOn\(\)\) \{ if \(zoomFolds\(\) && wideSheet\(data\)\) setFold\(!data\.classList\.contains\('tool-open'\)\); return; \}/);
});

test('the card zooms on a wide screen for an instrument that stands whole, by a tap on an empty part, the corner icon or nothing else', () => {
  assert.match(js, /const zoomReady = \(\) => !!ui && !!deck && !!shown && shown\.i === want && shown\.gen === gen && \(!busy \|\| playing\) && !leaving && !black && !caseStands\(\) && ui\.jump\.hidden && !isModalOpen\(\)\n\s+&& ui\.root\.classList\.contains\('pz-wide'\) && ui\.data\.classList\.contains\('has-tool'\) && dataStands\(\)/);
  assert.match(js, /tapTracker\(data, \{ ok: \(\) => zoomReady\(\) \|\| zoom\.up, onTap: \(\) => zoomToggle\(\) \}\);/);
  assert.match(js, /h\('div', \{ class: 'pz-dh' \}, dhT, fold, zbtn\)/);
  assert.match(js, /ui\.data\.classList\.toggle\('pz-zoomable', wide && !ui\.data\.hidden && ui\.data\.classList\.contains\('has-tool'\) && !!ui\.zoom\.plan\(\)\);/);
  // (The readings come out as it zooms only if this is turned on: Mohammad may ask for it.)
  assert.match(js, /const ZOOM_OPENS_READINGS = false;/);
  // (The veil sits over the words and the figure and under the card, its handle and the controls; a tap on it puts the card back.)
  assert.match(js, /fk, text, zscrim, data, lip, panel, vcase, prog, scl, bar,/);
  assert.match(js, /onclick: \(\) => zoom\.close\(\)\.then\(paintZoom\) \}\);/);
  // (The corner credit sits out the glide as it does a slide change.)
  assert.match(js, /hold: zoomCredit, settled: zoomSettled/);
  // (Pictures drawn on canvases are drawn for the size they are seen at.)
  assert.match(js, /boost: setCanvasBoost/);
  assert.match(util, /let canvasBoost = 1;\nexport const setCanvasBoost = \(k\) => \{ canvasBoost = Math\.max\(1, \+k \|\| 1\); \};/);
  assert.match(util, /const dpr = Math\.min\(saver\(\) \? 2 : 3, \(window\.devicePixelRatio \|\| 1\) \* canvasBoost\);/);
  // (The camera and the labels read the card where it rests: no entrance to take off, and the stage's box holds while the figure is pushed in.)
  assert.match(util, /if \(el\.dataset\?\.zoomed != null\) return q;/);
  assert.match(stage, /if \(boxKept && document\.getElementById\('app'\)\?\.classList\.contains\('pz-zoomed'\)\) \{ box = boxKept; return; \}/);
});

test('the icon is quiet and the app\'s own: the text\'s grey, corner brackets, a soft tint under the pointer, shown only where the card can grow; no stripe, glow or gradient', () => {
  const rule = (sel) => css.split('\n').find((l) => l.startsWith(sel)) || '';
  assert.match(rule('.pz-zbtn { display: none; }'), /display: none/);
  const shown = rule('.pz.pz-wide .pz-data.pz-zoomable > .pz-dh > .pz-zbtn');
  assert.match(shown, /color: var\(--text-3\)/); assert.match(shown, /background: none/); assert.match(shown, /border: 0/);
  assert.match(shown, /width: calc\(24px \/ var\(--pz-z, 1\)\)/, 'the header\'s zoom does not change its size');
  assert.doesNotMatch(shown, /gradient|box-shadow|glow/);
  assert.match(css, /@media \(hover: hover\) \{ \.pz-zbtn:hover \{ color: var\(--text\); background: var\(--hairline\); \} \}/);
  assert.match(rule('.pz-zscrim {'), /background: color-mix\(in srgb, var\(--stage-bg\) 58%, transparent\)/);
  assert.match(rule('.pz-zscrim.on'), /pointer-events: auto/);
  assert.match(html, /<symbol id="i-shrink" viewBox="0 0 24 24">/);
  assert.match(html, /<symbol id="i-fullscreen" viewBox="0 0 24 24">/);
});

test('a stacked card zoomed is never measured: the card answers for where it rests, so the readings\' travel would read none and their room open above the header', () => {
  // (measureUnder reads the card's height with the readings in and out; a zoomed card reports one height for both, --pz-d came out 0, the tucked
  // readings' room stood empty above the header and the card ran off the bottom. Mohammad, 28 Oct, a stacked Doppler card.)
  assert.match(js, /function measureUnder\(d\) \{\n(?: {4}\/\/[^\n]*\n)+ {4}if \(zoomOn\(\)\) return;\n {4}const parts = /);
  // (The card's own style change as it zooms, the transform origin, told its watcher, which placed the handle and measured: the guard is what stops it.)
  assert.match(js, /lipMO\.observe\(data, \{ attributes: true, attributeFilter: \['class', 'hidden', 'style'\] \}\);/);
  assert.match(js, /if \(split && !sliding && dock\.lvl === dock\.to\) measureUnder\(d\);/);
  assert.match(zoomSrc, /r\.el\.style\.transformOrigin = /);
  assert.match(zoomSrc, /r\.el\.getBoundingClientRect = \(\) => \(\{ x: left, y: top, left, top, width, height,/);
  // (Nothing else reads the readings' travel from a box while the card is up: layout is held, and the fold does nothing.)
  assert.deepEqual([...js.matchAll(/measureUnder\(/g)].length, 4, 'its definition and three callers: the handle, the layout, the fold');
});

test('the card zooms while a time-lapse plays or its answer eases in: the slide has landed, only the figure is moving', () => {
  // (The whole slide's move, run(), is busy until the days have played; the days run after the slide has landed (shown is set), so the card
  // that stands whole may zoom: a tap on it, the corner icon. Mohammad, 28 Oct: "it doesn't want to zoom while a timeline is going".)
  assert.match(js, /busy = false, playing = false, gen = 0/);
  assert.match(js, /playing = true;\n {4}try \{\n {6}if \(lap\) await playLapse\(s, to, cut\);\n {6}else if \(holdQ\) await answerPlay\(s, to, cut\);\n[^\n]*\n {4}\} finally \{ playing = false; \}/);
  // (It is set only after the slide is shown, never during the move to it.)
  assert.ok(js.indexOf('shown = { i: to, gen: g }; lastAt = to;') < js.indexOf('playing = true;'));
  assert.equal([...js.matchAll(/playing = true/g)].length, 1);
  // (Skipping the days forward, Next, keeps the card where it is; the next slide puts it back first.)
  assert.match(js, /if \(lapseOn && lapseLeft > 0 && shown\?\.i === want\) skipLapse\(\);/);
  assert.match(js, /if \(zoomOn\(\)\) \{ ui\.zoom\.close\(\)\.then\(\(\) => \{ paintZoom\(\); zoomMissed = false; if \(deck && !busy\) run\(\); \}\); return; \}/);
});

// (The zoom's transform as written: translate(x, y) scale(s), in the card's own px.)
const parseT = (t) => { const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(t); return { dx: +m[1], dy: +m[2], s: +m[3] }; };
const last = (el) => el.anims.at(-1);
const settle = async (w) => { for (const x of [...w.card.anims, ...w.lip.anims]) x.done(); await new Promise((r) => setTimeout(r, 0)); };

test('zoom: the readings come out above the zoomed card and the zoom is fitted again to the whole stack, in the middle and inside the margin', async () => {
  const w = world(), { z, card, lip, log } = w; const back = stands();
  try {
    const area = { left: 0, top: 0, width: 1440, height: 900 }, m = zoomMargin(area);
    assert.equal(z.follow(126, 150), false, 'not on its way in');
    z.open();
    assert.equal(z.steady, false);
    await settle(w);
    assert.equal(z.steady, true, 'once the glide in has ended');
    const open = parseT(card.anims[0].frames[1].transform);
    // (Out: the handle's edge stands 150 px over the card, the top of the whole 126 px higher than with them tucked; their rise, 150 px, is not scaled by the zoom.)
    assert.equal(z.follow(126, 150), true);
    const t = parseT(last(card).frames[1].transform), tl = parseT(last(lip).frames[1].transform);
    assert.deepEqual(t, tl, 'the card and its handle move as one');
    assert.ok(Math.abs(t.s - (900 - 2 * m) / 530) < 1e-3, 'smaller: the stack is taller (fitted by its height)');
    assert.ok(t.s < open.s);
    // (Where the stack's top and foot land: the zoom, then the rise on top as the page lays it, which is not scaled.)
    const lift = 150, where = (y) => 478 - lift + t.s * (y + lift - 478) + t.dy;
    assert.ok(Math.abs(where(150) - m) < 0.01, 'its top is one margin from the screen\'s');
    assert.ok(Math.abs(where(680) - (900 - m)) < 0.01, 'its foot one margin from the foot');
    assert.ok(Math.abs(t.dx - (720 - 250)) < 0.01, 'and in the middle across');
    assert.equal(last(card).o.fill, 'forwards'); assert.equal(card.anims.at(-2).cancelled, true, 'each frame replaces the last');
    // (Tucked again: back to the plan it came in with.)
    z.follow(0, 0);
    const back0 = parseT(last(card).frames[1].transform);
    assert.ok(Math.abs(back0.s - open.s) < 1e-3 && Math.abs(back0.dx - open.dx) < 0.01 && Math.abs(back0.dy - open.dy) < 0.01);
    // (Halfway out the zoom is halfway between, in size and place: one frame never jumps from the last.)
    z.follow(63, 75);
    const mid = parseT(last(card).frames[1].transform);
    assert.ok(mid.s < open.s && mid.s > t.s);
    // (Never larger than the most, never smaller than the card's own size.)
    assert.ok(mid.s <= ZOOM_MAX && t.s >= 1);
    // (The pictures are drawn for no less than the size they are seen at.)
    log.length = 0; z.follow(0, 0); assert.deepEqual(log, [], 'no larger than the first plan');
  } finally { back(); }
});

test('zoom: the stack that is out as the card zooms is fitted as it tucks, larger as it shortens, and its pictures are drawn for that', async () => {
  const w = world(); const back = stands();
  try {
    const { z, card, lip, log } = w;
    // (Out at the start: the whole is 150 px over the card's top edge, 530 px tall.)
    lip.rect = { left: 40, top: 150, width: 420, height: 24 }; card.rect = { left: 40, top: 150, width: 420, height: 530 };
    z.open(); await settle(w); log.length = 0;
    const out = parseT(card.anims[0].frames[1].transform);
    z.follow(-126, -150);   // (tucked: the top of the whole 126 px lower, the readings' rise 150 px less)
    const t = parseT(last(card).frames[1].transform);
    assert.ok(t.s > out.s, 'larger as it shortens');
    assert.deepEqual(log, [['boost', +t.s.toFixed(2)]]);
  } finally { back(); }
});

test('zoom: the readings move only once the glide in has ended, and not on its way back', async () => {
  const w = world(), { z, card } = w; const back = stands();
  try {
    z.open(); assert.equal(z.follow(10, 10), false);
    await settle(w); assert.equal(z.follow(10, 10), true);
    const shut = z.close();
    assert.equal(z.steady, false); assert.equal(z.follow(10, 10), false, 'not while it glides back');
    for (const x of [...card.anims, ...w.lip.anims]) x.done();
    await shut;
  } finally { back(); }
  // (Reduce Motion: it is up at once.)
  { const x = world(), restore = stands(); try { x.z.reduceNow = true; x.z.open(); assert.equal(x.z.steady, true); assert.equal(x.z.scale > 1, true); } finally { restore(); } }
});

test('the readings come out and tuck away under a zoomed card, the zoom fitted again on every frame of it', () => {
  // (liftTo runs on every frame of the readings' slide, a finger's pull included; the zoom hears the change since the card zoomed.)
  assert.match(js, /words\.u = f; words\.trav = trav; setWords\(wordsAt\(\)\); zoomFollow\(f, trav\); \};/);
  assert.match(js, /const zoomFolds = \(\) => zoomSteady\(\) && slip\.lift - slip\.base > 0\.5;/);
  assert.match(js, /ui\.zoom\.follow\(\(f - zoomU0\) \* \(trav - LIP\), \(f - zoomU0\) \* trav\);/);
  assert.match(js, /zoomU0 = underU\(ui\.data\);\n {4}if \(z\.open\(\)\) paintZoom\(\);/);
  // (A pull on a zoomed card follows the finger over the readings' travel as it is seen: the card is larger, so the finger moves less of it.)
  assert.match(js, /g\.zk = zoomOn\(\) \? ui\.zoom\.scale : 1;/);
  assert.match(js, /follow\(g, dy \* g\.dir \/ \(g\.zk \|\| 1\)\);/);
  // (The rise is the cards' own CSS translate, which a zoom's transform does not scale: card-zoom.js makes up for it.)
  assert.match(css, /\.pz\.pz-wide \.pz-data\.col, \.pz\.pz-wide \.pz-lip \{ translate: 0 calc\(-1 \* var\(--pz-lift, 0px\)\); \}/);
  assert.match(zoomSrc, /lift \* k \* \(1 - sc\)/);
});

// The words' card behind a zoomed card (Mohammad, 28 Oct: "when the stacked cards are zoomed in (in focus) and i open untuck the stacked card, the
// TEACHING card in the background is reacting still by going up; it shouldn't in fact, if the stack is unstacked, and i zoom into it, the teaching
// card should go back to original location").
test('zoom: the card tells what stands behind it as it glides in and back, and at once when it is put back at once', async () => {
  const mk = () => {
    const card = new El({ left: 40, top: 300, width: 420, height: 380 }), lip = new El({ left: 40, top: 276, width: 420, height: 24 });
    const scrim = new El({ left: 0, top: 0, width: 1440, height: 900 }), app = new El({ left: 0, top: 0, width: 1440, height: 900 });
    const log = [];
    const z = createCardZoom({ card, along: [lip], scrim, app, area: () => ({ left: 0, top: 0, width: 1440, height: 900 }), reduce: () => z.reduceNow, behind: (up, ms) => log.push([up, ms]) });
    z.reduceNow = false;
    return { card, lip, log, z };
  };
  const back = stands();
  try {
    { const { z, card, lip, log } = mk();
      z.open(); assert.deepEqual(log, [[true, ZOOM_MS]], 'in: for as long as the glide');
      for (const x of [...card.anims, ...lip.anims]) x.done();
      await new Promise((r) => setTimeout(r, 0)); log.length = 0;
      const shut = z.close(); assert.deepEqual(log, [[false, SHUT_MS]], 'back: for as long as the glide back');
      z.close(); assert.equal(log.length, 1, 'closing twice tells once');
      for (const x of [...card.anims, ...lip.anims]) x.done();
      await shut; assert.equal(log.length, 1, 'the card landing has nothing more to tell'); }
    { const { z, log } = mk();
      z.reduceNow = true; z.open(); assert.deepEqual(log, [[true, 0]], 'Reduce Motion: at once'); log.length = 0;
      z.close(); assert.deepEqual(log, [[false, 0]]); }
    { const { z, log } = mk();
      z.open(); log.length = 0; z.close({ instant: true }); assert.deepEqual(log, [[false, 0]], 'put back at once'); }
    { const { z, log } = mk();
      z.open(); log.length = 0; z.reset(); assert.deepEqual(log, [[false, 0]], 'a slide, a resize or the end of the talk'); z.reset(); assert.equal(log.length, 1, 'nothing up: nothing to tell'); }
    { const { z, card, log } = mk();
      card.rect = { left: 0, top: 0, width: 1400, height: 880 };
      assert.equal(z.open(), false); assert.deepEqual(log, [], 'a card that cannot grow tells no one'); }
  } finally { back(); }
});

// The presenter's half, run on stand-ins: the words' rise as the zoom holds it, and the glide that carries it.
const wordsWorld = ({ base = 0, d = 126 } = {}) => {
  const src = js.match(/const riseOn = [\s\S]*?\n\s*const liftTo = [^\n]*/)?.[0];
  assert.ok(src, 'the words\' rise is in presenter.js');
  const LIP = 24, slip = { lift: d + base, base }, events = [], ticks = [];
  const card = () => {
    const props = new Map();
    return { props, anims: [], style: { getPropertyValue: (n) => props.get(n) ?? '', setProperty: (n, v) => props.set(n, v), removeProperty: (n) => props.delete(n) },
      // (Where the card is seen: under a glide still running, its frame; else the style's.)
      shown() { const a = this.anims.findLast((x) => !x.cancelled && !x.over); return a ? a.at : `0px ${-(parseFloat(props.get('--pz-rise')) || 0)}px`; },
      animate(frames, o) { const a = { frames, o, cancelled: false, over: false, onfinish: null, at: frames[0].translate, cancel() { this.cancelled = true; } }; this.anims.push(a); return a; } };
  };
  const ui = { data: card(), lip: card(), text: card(), shade: card() };
  const gcs = (el) => ({ translate: el.shown() });
  const api = new Function('ui', 'slip', 'LIP', 'zoomFollow', 'slideTell', 'getComputedStyle', 'dispatchEvent', 'Event', `${src}; return { liftTo, words, wordsGlide, wordsAt };`)(
    ui, slip, LIP, () => {}, () => ticks.push('slide'), gcs, (e) => events.push(e.type), class { constructor(t) { this.type = t; } });
  return { ...api, ui, slip, events, ticks, rise: () => parseFloat(ui.text.props.get('--pz-rise')) || 0, lift: () => parseFloat(ui.data.props.get('--pz-lift')) || 0, LIP };
};

test('the words\' card stays at its tucked place while a card is zoomed, however the readings move under it', () => {
  const w = wordsWorld({ d: 126 });
  w.liftTo(0);
  assert.equal(w.rise(), 0);
  w.words.held = true;   // (the card zooms: zoomBehind)
  for (const u of [0, 0.3, 0.7, 1, 0.5, 0]) {
    w.liftTo(u);
    assert.equal(w.rise(), 0, `readings ${u} of the way out: the words stay`);
    assert.equal(w.ui.shade.props.get('--pz-rise') ?? '', '', 'and so does their glass');
    assert.ok(Math.abs(w.lift() - u * 126) < 0.06 || u === 0, 'the readings\' card and its handle still rise');
  }
  // (Released: the rise owed to where the readings stand.)
  w.liftTo(1); w.words.held = false; w.liftTo(1);
  assert.ok(Math.abs(w.rise() - (126 - w.LIP)) < 0.06, 'out: the words rise by the travel less the handle\'s edge');
});

test('the words\' card eases back to its tucked place as the card zooms in, and to where the readings need it as the card comes back', () => {
  const w = wordsWorld({ d: 126 });
  w.liftTo(1);   // (the readings were out as the card zoomed)
  const out = 126 - w.LIP;
  assert.equal(w.rise(), out);
  // In: the rise is written where it ends (the tucked place) and the card's translate glides there from where it stands.
  w.words.held = true; w.wordsGlide(520);
  assert.equal(w.rise(), 0);
  assert.deepEqual(w.ticks, ['slide'], 'the probe is told the cards are moving');
  for (const el of [w.ui.text, w.ui.shade]) {
    assert.equal(el.anims.length, 1);
    assert.deepEqual(el.anims[0].frames, [{ translate: `0px ${-out}px` }, { translate: '0px 0px' }], 'from its raised place to its original one');
    assert.equal(el.anims[0].o.duration, 520); assert.equal(el.anims[0].o.easing, 'cubic-bezier(.2, .8, .2, 1)', 'the zoom\'s own ease');
    assert.notEqual(el.anims[0].o.fill, 'forwards', 'it lets go at its end: the style already says where it ends');
  }
  // (Done: the cards announce their place once.)
  w.ui.text.anims[0].over = true; w.ui.text.anims[0].onfinish(); assert.deepEqual(w.events, [], 'not until both have landed');
  w.ui.shade.anims[0].over = true; w.ui.shade.anims[0].onfinish(); assert.deepEqual(w.events, ['pps:occ']);
  // (The readings come out and tuck away under the zoom: the words do not stir, nothing is glided.)
  w.liftTo(0.5); w.liftTo(1); w.liftTo(0);
  assert.equal(w.rise(), 0); assert.equal(w.ui.text.anims.length, 1);
  // Back with the readings out: the rise they need, glided from the tucked place.
  w.liftTo(1); w.words.held = false; w.wordsGlide(440);
  assert.equal(w.rise(), out);
  const a = w.ui.text.anims.at(-1);
  assert.deepEqual(a.frames, [{ translate: '0px 0px' }, { translate: `0px ${-out}px` }]);
  assert.equal(a.o.duration, 440);
  // Back with the readings tucked: the original place, nothing to glide.
  { const t = wordsWorld({ d: 126 });
    t.liftTo(0); t.words.held = true; t.wordsGlide(520);
    t.words.held = false; t.wordsGlide(440);
    assert.equal(t.rise(), 0); assert.equal(t.ui.text.anims.length, 0, 'it never left its place: no motion'); assert.deepEqual(t.ticks, []); }
});

test('the words\' card at once for Reduce Motion, a slide or a resize; a glide caught by a pull or a slide is let go; a Gut to heart chart\'s rise stays', () => {
  { const w = wordsWorld({ d: 126 });
    w.liftTo(1); w.words.held = true; w.wordsGlide(0);
    assert.equal(w.rise(), 0); assert.equal(w.ui.text.anims.length, 0); assert.deepEqual(w.ticks, []); }
  // (A glide caught half way is taken up from where the card stands.)
  { const w = wordsWorld({ d: 126 });
    w.liftTo(1); w.words.held = true; w.wordsGlide(520);
    const first = w.ui.text.anims[0]; first.at = '0px -40px';   // (half way)
    w.words.held = false; w.wordsGlide(440);
    assert.equal(first.cancelled, true);
    assert.equal(w.ui.text.anims.at(-1).frames[0].translate, '0px -40px'); }
  // (A pull or a slide that writes another place takes the glide's place: the card follows the finger.)
  { const w = wordsWorld({ d: 126 });
    w.liftTo(1); w.words.held = true; w.wordsGlide(520); w.words.held = false;
    const a = w.ui.text.anims[0];
    w.liftTo(0.2);
    assert.equal(a.cancelled, true); assert.equal(w.ui.text.shown(), `0px ${-w.rise()}px`, 'the card is where the style says');
    assert.ok(Math.abs(w.rise() - 0.2 * (126 - w.LIP)) < 0.06); }
  // (A Gut to heart chart's own rise, slip.base, is the tucked place: the words never go below it.)
  { const w = wordsWorld({ base: 70, d: 126 });
    w.liftTo(1);
    assert.ok(Math.abs(w.rise() - (70 + 126 - w.LIP)) < 0.06);
    w.words.held = true; w.wordsGlide(520);
    assert.equal(w.rise(), 70, 'the card goes back to where it stands tucked, which is raised by the chart already');
    assert.equal(w.wordsAt(), 70); }
});

test('the presenter hands the card\'s cue to the words\' card and lets the slide take over once the card is back', () => {
  assert.match(js, /behind: zoomBehind \}\);/);
  assert.match(js, /const zoomBehind = \(up, ms\) => \{ words\.held = up; wordsGlide\(ms\); \};/);
  // (Written once, where it ends: the layout that follows the zoom reads the rise back from the style, wide-stack.test.js.)
  assert.match(js, /words\.now = to; setRise\('--pz-rise', to\);/);
  // (The words' card is not under the zoom's transform: only its own translate moves, never the stage or its figure.)
  assert.equal(/el\.animate\?\.\(\[\{ translate: from\[i\] \}, \{ translate: getComputedStyle\(el\)\.translate \}\]/.test(js), true);
});
