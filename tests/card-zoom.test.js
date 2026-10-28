import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zoomPlan, zoomMargin, emptyTap, tapTracker, createCardZoom, ZOOM_MAX, ZOOM_MIN, PUSH } from '../src/ui/card-zoom.js';

// The data card zoomed to the middle of the screen (Mohammad, 28 Oct): "can we add a feature on large screens and ipad landscape for data card
// instrument card to display it bigger when clicking on it directly; however it shouldn't like make the text smaller. the camera should like zoom
// on the card to display it centered large in middle of the screen". Code only: the controller is run against stand-in elements.
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const js = read('../src/ui/presenter.js'), css = read('../styles/app.css'), util = read('../src/ui/util.js'), stage = read('../src/ui/stage.js'), html = read('../index.html');

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
  const view = new El({ left: 0, top: 0, width: 1440, height: 900 }), scrim = new El({ left: 0, top: 0, width: 1440, height: 900 }), app = new El({ left: 0, top: 0, width: 1440, height: 900 });
  const log = [];
  const z = createCardZoom({ card, along: [lip], view, scrim, app, area: () => ({ left: 0, top: 0, width: 1440, height: 900 }), scale: () => 1, reduce: () => z.reduceNow,
    boost: (k) => log.push(['boost', +k.toFixed(2)]), hold: (on) => log.push(['hold', on]), settled: () => log.push(['settled']) });
  z.reduceNow = false;
  return { card, lip, view, scrim, app, log, z };
};
const stands = (el, prop) => { const old = globalThis.getComputedStyle; globalThis.getComputedStyle = (e) => e.style; return () => { globalThis.getComputedStyle = old; }; };

test('zoom: the card and its handle glide together about the card\'s middle, the figure comes in, the veil comes up, and the card reports where it rests', () => {
  const { card, lip, view, scrim, app, log, z } = world(); const back = stands();
  try {
    assert.equal(z.open(), true);
    assert.equal(z.on, true); assert.equal(z.up, true);
    // (One transform on each piece, the same: about the card's middle, so the handle stays on the card's edge.)
    const t = card.anims[0], tl = lip.anims[0];
    assert.equal(t.prop, 'transform'); assert.equal(tl.prop, 'transform');
    assert.equal(t.frames[1].transform, tl.frames[1].transform);
    const p = zoomPlan({ left: 40, top: 300, width: 420, height: 380 }, { left: 0, top: 0, width: 1440, height: 900 });
    assert.equal(t.frames[1].transform, `translate(${p.dx.toFixed(2)}px, ${p.dy.toFixed(2)}px) scale(${p.s.toFixed(4)})`);
    assert.equal(card.style.transformOrigin, '210.00px 190.00px');
    assert.equal(lip.style.transformOrigin, '210.00px 214.00px', 'the card\'s middle, seen from the handle');
    assert.equal(t.o.fill, 'forwards'); assert.equal(t.o.easing, 'cubic-bezier(.2, .8, .2, 1)');
    // (The figure behind pushes in by PUSH about the card's place.)
    const v = view.anims[0];
    assert.equal(v.prop, 'scale'); assert.equal(v.frames[1].scale, String(1 + PUSH));
    assert.equal(view.style.transformOrigin, '250.00px 490.00px');
    assert.ok(PUSH >= 0.05 && PUSH <= 0.08, 'about 5 to 8 per cent');
    assert.ok(scrim.classList.contains('on')); assert.ok(app.classList.contains('pz-zoomed')); assert.equal('zoomed' in card.dataset, true);
    assert.deepEqual(log, [['hold', true], ['boost', +p.s.toFixed(2)]]);
    // (Everyone who asks the card or its handle where they are hears where they rest, however far the glide has come.)
    assert.deepEqual([card.getBoundingClientRect().left, card.getBoundingClientRect().width, card.getBoundingClientRect().bottom], [40, 420, 680]);
    assert.equal(lip.getBoundingClientRect().top, 276);
    // (A second open while it is up does nothing.)
    assert.equal(z.open(), false);
  } finally { back(); }
});

test('zoom: closing glides back from where it stands, then puts everything as it was and says it is back', async () => {
  const { card, lip, view, scrim, app, log, z } = world(); const back = stands();
  try {
    z.open(); log.length = 0;
    card.style.transform = 'matrix(1.9, 0, 0, 1.9, 300, 80)'; view.style.scale = '1.03';   // (caught half way)
    const shut = z.close();
    assert.equal(z.up, false, 'on its way back');
    assert.equal(z.on, true, 'but still held: nothing is laid out yet');
    assert.ok(!scrim.classList.contains('on'));
    const [a0, a1] = [card.anims[0], card.anims[1]];
    assert.equal(a0.cancelled, true, 'the open glide is let go');
    assert.deepEqual([a1.frames[0].transform, a1.frames[1].transform], ['matrix(1.9, 0, 0, 1.9, 300, 80)', 'none'], 'from where it stands to where it rests');
    assert.deepEqual([view.anims[1].frames[0].scale, view.anims[1].frames[1].scale], ['1.03', 'none']);
    assert.equal(z.close(), shut, 'closing twice is one close');
    assert.equal(z.open(), false, 'and it cannot open meanwhile');
    for (const x of [...card.anims, ...lip.anims, ...view.anims]) x.done();
    await shut;
    assert.equal(z.on, false);
    assert.equal(Object.hasOwn(card, 'getBoundingClientRect'), false, 'the card answers for itself again');
    assert.equal(card.getBoundingClientRect().width, 420);
    assert.equal(card.style.transformOrigin, ''); assert.equal(lip.style.transformOrigin, ''); assert.equal(view.style.transformOrigin, '');
    assert.equal('zoomed' in card.dataset, false); assert.ok(!app.classList.contains('pz-zoomed'));
    assert.ok(a1.cancelled, 'the glide\'s last frame is no longer held');
    assert.deepEqual(log, [['boost', 1], ['hold', false], ['settled']]);
  } finally { back(); }
});

test('zoom: Reduce Motion moves it at once, with no push of the figure', () => {
  { const { card, view, z, log, scrim } = world(); const back = stands();
    try {
      z.reduceNow = true;
      z.open();
      assert.equal(card.anims[0].o.duration, 0); assert.equal(view.anims.length, 0, 'the figure stays');
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
  // (Any move that did not come by go, a new text size, puts it back at once.)
  assert.match(js, /async function transition\(to\) \{\n {4}if \(zoomOn\(\)\) \{ ui\.zoom\.reset\(\); paintZoom\(\); zoomMissed = false; \}/);
  // (Esc first glides the card back; the talk ends on the next one.)
  assert.match(js, /else if \(k === 'Escape'\) \{ if \(black\) toggleBlack\(false\); else if \(zoomOn\(\)\) ui\.zoom\.close\(\)\.then\(paintZoom\); else stop\(\); \}/);
  assert.match(js, /if \(e\?\.type === 'resize' && zoomOn\(\)\) \{ ui\.zoom\.reset\(\); paintZoom\(\); \}/);
  assert.match(js, /pillW = 0; ui\?\.zoom\.reset\(\); ui\?\.tools\.dispose\(\);/);
  // (The readings stay as they are under it: no pull, no arrow key, no wheel, no tap on a fold; the handle puts the card back and then brings them out.)
  assert.match(js, /if \(zoomOn\(\)\) return true; {3}\/\/ \(a zoomed card keeps its readings as they are\)/);
  assert.match(js, /const setFold = \(open\) => \{\n {6}if \(zoomOn\(\)\) return;/);
  assert.match(js, /dock\.lvl > 0 \|\| btn\.contains\(e\.target\) \|\| zoomOn\(\)\) return;/);
  assert.match(js, /if \(!deck \|\| !d \|\| zoomOn\(\) \|\| e\.touches\.length !== 1/);
  assert.match(js, /if \(zoomOn\(\)\) \{ zoom\.close\(\)\.then\(\(\) => \{ paintZoom\(\); if \(ui && wideSheet\(data\) && !data\.classList\.contains\('tool-open'\)\) setFold\(true\); \}\); return; \}/);
});

test('the card zooms on a wide screen for an instrument that stands whole, by a tap on an empty part, the corner icon or nothing else', () => {
  assert.match(js, /const zoomReady = \(\) => !!ui && !!deck && !!shown && shown\.i === want && !busy && !leaving && !black && !caseStands\(\) && ui\.jump\.hidden && !isModalOpen\(\)\n\s+&& ui\.root\.classList\.contains\('pz-wide'\) && ui\.data\.classList\.contains\('has-tool'\) && dataStands\(\)/);
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
