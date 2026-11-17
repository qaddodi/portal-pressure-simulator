// The Treat card's height glides like a vessel card's (17 Nov 2026, Mohammad's play-test: a tab that changed the card's height snapped it 217 px in one frame and
// cut the leaving list in half, and Changes opening or closing snapped it 82 px). One glide for every sheet with a plate (card-glide.js): the plate scales, what
// stands below the change rides from where it stood (`ride`), and what is cut at the foot opens or closes with the plate (`cut`, a clip-path).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
for (const k of ['Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'HTMLElement', 'CustomEvent']) globalThis[k] ??= dom.window[k];
globalThis.addEventListener ??= () => {};
globalThis.innerWidth ??= 1024; globalThis.innerHeight ??= 768;
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* already there */ }
const { glideCard, cutFrames, rideFrames } = await import('../src/ui/card-glide.js');

const stub = () => {
  const made = [], proto = window.Element.prototype, old = proto.animate;
  proto.animate = function (kf, o) { let res; const a = { el: this, kf, o, playState: 'running', finished: new Promise((r) => { res = r; }), cancel() { a.cancelled = true; a.playState = 'idle'; }, finish() { a.playState = 'finished'; res(); } }; made.push(a); return a; };
  return { made, undo: () => { proto.animate = old; } };
};
const sheet = () => {
  const el = document.createElement('section'); el.className = 'treat-card has-plate';
  const plate = document.createElement('div'); plate.className = 'sheet-plate';
  const body = document.createElement('div'); body.className = 'tc-body';
  const pane = document.createElement('div'); pane.className = 'treat-pane';
  const changes = document.createElement('details'); changes.className = 'section';
  body.append(pane, changes); el.append(plate, body); document.body.append(el);
  return { el, plate, body, pane, changes };
};

test('a sheet that gets shorter: the plate shrinks about its top, the row below rides up from where it stood, and the list\'s foot is uncut for the glide', () => {
  const s = stub();
  try {
    const { el, plate, body, pane, changes } = sheet();
    const a = glideCard(el, 516, 299, { ride: [changes], cut: [pane, body], free: [body] });
    assert.equal(plate.style.transformOrigin, '50% 0');
    assert.equal(a.find((x) => x.el === plate).kf[0].transform, `scaleY(${(516 / 299).toFixed(4)})`);
    assert.deepEqual(a.find((x) => x.el === changes).kf, rideFrames(516, 299));
    assert.equal(rideFrames(516, 299)[0].transform, 'translateY(217.0px)', 'it starts 217 px lower: where the taller card had it');
    assert.deepEqual(a.find((x) => x.el === pane).kf, cutFrames(516, 299));
    assert.equal(cutFrames(516, 299)[0].clipPath, 'inset(-6px -6px -223.0px -6px)', 'the pane\'s box is the new, short one: its cut starts 217 px (and the margin) below it');
    assert.equal(cutFrames(516, 299)[1].clipPath, 'inset(-6px)', 'and ends as the box\'s own cut');
    assert.ok(body.classList.contains('glide-free'), 'the scroller lets it show');
    for (const x of a) x.finish();
    return Promise.resolve().then(() => Promise.resolve()).then(() => assert.ok(!body.classList.contains('glide-free'), 'and holds it no longer than the glide'));
  } finally { s.undo(); }
});

test('a sheet that gets taller: the row below rides down from where it stood, and the new part is uncovered downward from the old foot', () => {
  const s = stub();
  try {
    const { el, changes, pane } = sheet();
    const a = glideCard(el, 299, 516, { ride: [changes], cut: [pane] });
    assert.equal(rideFrames(299, 516)[0].transform, 'translateY(-217.0px)');
    assert.equal(cutFrames(299, 516)[0].clipPath, 'inset(-6px -6px 211.0px -6px)', 'the new height\'s lower 217 px (less the margin) are cut until the plate reaches them');
    assert.equal(a.filter((x) => x.kf[0].clipPath).length, 1);
  } finally { s.undo(); }
});

test('a newer glide keeps the scroller free until its own end: the one it cancelled does not shut it', async () => {
  const s = stub();
  try {
    const { el, body } = sheet();
    const first = glideCard(el, 300, 400, { free: [body] });
    const second = glideCard(el, 400, 350, { prior: first, free: [body] });
    await Promise.resolve(); await Promise.resolve();
    assert.ok(body.classList.contains('glide-free'), 'the second glide is still running');
    for (const x of second) x.finish();
    await Promise.resolve(); await Promise.resolve();
    assert.ok(!body.classList.contains('glide-free'));
  } finally { s.undo(); }
});
