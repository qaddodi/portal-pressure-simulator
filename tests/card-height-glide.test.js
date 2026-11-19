// A card's height glides when its content asks (17 Nov 2026: option A's tray opened and the vessel card's foot jumped; Mohammad: nothing pops).
// card-glide.js scales the card's plate (its GPU glass) from the old height to the new about the edge that stays, and on a phone's card, which stands on its
// foot, the words ride from where they were. The stent editor asks before each change of height its tray makes.
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
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* already there */ }
const { glideCard, glideFrames, GLIDE_EVENT } = await import('../src/ui/card-glide.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stub = () => {
  const made = [];
  const proto = window.Element.prototype, old = proto.animate;
  proto.animate = function (kf, o) { let res; const a = { el: this, kf, o, finished: new Promise((r) => { res = r; }), cancel() { a.cancelled = true; }, finish() { res(); } }; made.push(a); return a; };
  return { made, undo: () => { proto.animate = old; } };
};
const card = () => {
  const el = document.createElement('section'); el.className = 'action-card';
  const plate = document.createElement('div'); plate.className = 'sheet-plate';
  const body = document.createElement('div'); body.className = 'ac-body';
  el.append(plate, body); document.body.append(el);
  return { el, plate, body };
};

test('the shelf\'s card: its plate grows from the old height about its top, and its words stay where they are', () => {
  const s = stub();
  try {
    const { el, plate } = card();
    const a = glideCard(el, 300, 420);
    assert.equal(a.length, 1, 'the plate only');
    assert.equal(a[0].el, plate); assert.equal(plate.style.transformOrigin, '50% 0');
    assert.equal(a[0].kf[0].transform, `scaleY(${(300 / 420).toFixed(4)})`); assert.equal(a[0].kf[1].transform, 'none');
    assert.ok(a.every((x) => x.kf.every((f) => Object.keys(f).every((k) => k === 'transform'))), 'a transform alone');
  } finally { s.undo(); }
});

test('a phone\'s card stands on its foot: the plate grows about its foot and the words ride down from where they stood', () => {
  const s = stub();
  try {
    const { el, plate, body } = card();
    const a = glideCard(el, 400, 300, { foot: true });
    assert.equal(plate.style.transformOrigin, '50% 100%');
    const w = a.find((x) => x.el === body);
    assert.equal(w.kf[0].transform, 'translateY(-100.0px)', 'its top moved down 100 px: the words start where they were');
    assert.deepEqual(glideFrames(300, 400, true).words[0], { transform: 'translateY(100.0px)' });
  } finally { s.undo(); }
});

test('no glide for no change, and a new glide replaces the one under way', () => {
  const s = stub();
  try {
    const { el } = card();
    assert.deepEqual(glideCard(el, 300, 300.4), []);
    const first = glideCard(el, 300, 400);
    glideCard(el, 400, 350, { prior: first });
    assert.ok(first.every((a) => a.cancelled));
  } finally { s.undo(); }
});

test('the stent editor asks its card to glide before each change of height its tray makes: open, another tile, and the close\'s end', async () => {
  const s = stub();
  try {
    const { store } = await import('../src/ui/store.js');
    const { createStentEditor } = await import('../src/ui/stent-editor.js');
    const p = store.get().params; store.set({ params: { ...p, tips: { ...(p.tips || {}), on: true, d: 10 } } });
    const host = document.createElement('div'); document.body.append(host);
    let asks = 0; host.addEventListener(GLIDE_EVENT, () => { asks++; });
    // (jsdom lays nothing out: a tray 120 px tall, so the tray's roll runs as on a device)
    const R0 = window.Element.prototype.getBoundingClientRect;
    window.Element.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, right: 300, bottom: 120, width: 300, height: 120, x: 0, y: 0 }; };
    s.undoBox = () => { window.Element.prototype.getBoundingClientRect = R0; };
    const ed = createStentEditor({ id: 'TIPS' });
    host.append(ed.el);
    const tile = (id) => ed.el.querySelector(`.se-row[data-row="${id}"]`);
    let seen = '';
    host.addEventListener(GLIDE_EVENT, () => { seen = ed.panel.dataset.open; });
    tile('waist').click();
    assert.equal(asks, 1); assert.equal(seen, '', 'asked before the tray is laid out');
    tile('dia').click();
    assert.equal(asks, 2); assert.equal(seen, 'waist', 'asked before the tray takes the next tile\'s height');
    ed.close();
    assert.equal(asks, 2, 'not while it rolls up: the card keeps its height until the tray has gone');
    for (const a of s.made) a.finish();
    await wait(0);
    assert.equal(asks, 3); assert.equal(seen, 'dia', 'asked as the rolled-up tray leaves the flow');
    assert.equal(ed.panel.dataset.open, '');
    ed.destroy();
  } finally { s.undo(); s.undoBox?.(); }
});

test('the glass reads the scaled plate again in every frame of the glide: its keyframes are not a translation it could follow by itself (glass-motion.js)', async () => {
  const { compileKeyframes, motionAt } = await import('../src/ui/glass-motion.js');
  const f = glideFrames(300, 420, false);
  const T = compileKeyframes(f.plate.map((k, i) => ({ ...k, offset: i, computedOffset: i, easing: 'linear' })));
  const out = { at: 0.5 };
  assert.equal(motionAt(T, out), false, 'so glass-gl.js asks for a read in every frame while it runs (motionLive)');
  const W = compileKeyframes(glideFrames(400, 300, true).words.map((k, i) => ({ ...k, offset: i, computedOffset: i, easing: 'linear' })));
  assert.equal(motionAt(W, { at: 0 }), true, 'the words\' ride is a plain translation');
});

test('a waist length is printed on the slider\'s 0.5 cm step, a glide\'s too: the figures\' labels never count 3.1, 3.2, 3.3 (Mohammad, 17 Nov: "Waist cm in 0.5 increments")', async () => {
  const { WAIST_STEP, waistShown } = await import('../src/engine/portal/stent-geom.js');
  const { stentControls } = await import('../src/ui/actions.js');
  const { stentFacts } = await import('../src/ui/stent-waist.js');
  const { EDGES } = await import('../src/engine/portal/topology.js');
  assert.equal(WAIST_STEP, 0.5);
  assert.equal(stentControls('TIPS').find((c) => c.id === 'waist').step, WAIST_STEP, 'the slider steps by it');
  assert.deepEqual([3, 3.1, 3.24, 3.26, 3.4, 3.5].map(waistShown), [3, 3, 3, 3.5, 3.5, 3.5]);
  // the anatomy figure's label reads stentFacts from the params as they ease: a waist halfway through a glide prints on the step
  const tips = EDGES.find((e) => e.id === 'TIPS');
  for (const cm of [3.1, 3.3, 3.37, 1.25]) {
    const f = stentFacts(tips, { tips: { on: true, d: 8 }, stentGeom: { TIPS: { len: 8, waist: cm, trans: 0, red: 0.25 } } });
    assert.equal(f.wLen * 2, Math.round(f.wLen * 2), `${cm} cm mid-glide prints ${f.wLen}`);
  }
});
