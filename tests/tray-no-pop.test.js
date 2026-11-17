// Nothing in a card pops when its tray opens, switches or closes (17 Nov 2026, Mohammad's play-test of the TIPS card: the Doppler / Dye / IR / Remove row vanished
// the moment a tile opened, and the controls of the tile that closed were swapped for the next tile's at once, leaving a blank beat while the new ones were
// still at nothing). The row is taken out of the flow but fades where it stood; the old tile's controls and its foot line fade out in a remnant laid over
// the same place while the new tile's fade in.
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

test('the stent editor holds the action row\'s place on the tap that opens a tray, and fades the old tile\'s words out on the next tap', async () => {
  const anims = [];
  const proto = window.Element.prototype, old = proto.animate;
  proto.animate = function (kf, o) { let res; const a = { el: this, kf, o, finished: new Promise((r) => { res = r; }), cancel() {}, finish() { res(); } }; anims.push(a); return a; };
  const R0 = proto.getBoundingClientRect;
  proto.getBoundingClientRect = function () { return { left: 0, top: 0, right: 300, bottom: 120, width: 300, height: 120, x: 0, y: 0 }; };
  try {
    const { store } = await import('../src/ui/store.js');
    const { createStentEditor } = await import('../src/ui/stent-editor.js');
    const p = store.get().params; store.set({ params: { ...p, tips: { ...(p.tips || {}), on: true, d: 10 } } });
    // the vessel card's shape: the panel (holding the tiles) and, right after it, the actions
    const panelEl = document.createElement('div'); panelEl.className = 'ac-panel';
    const tv = document.createElement('div'); tv.className = 'tv'; panelEl.append(tv);
    const strip = document.createElement('div'); strip.className = 'ac-as';
    const bodyEl = document.createElement('div'); bodyEl.className = 'ac-body'; bodyEl.append(panelEl, strip); document.body.append(bodyEl);
    const ed = createStentEditor({ id: 'TIPS' });
    tv.append(ed.el);
    const tile = (id) => ed.el.querySelector(`.se-row[data-row="${id}"]`);
    tile('waist').click();
    assert.ok(strip.style.getPropertyValue('--as-top') !== '', 'the row\'s place is written before the tray takes its room');
    assert.ok(strip.style.getPropertyValue('--as-w') !== '');
    strip.style.removeProperty('--as-top');
    const body = ed.panel.querySelector('.se-pb'), foot = ed.panel.querySelector('.se-foot');
    const was = [...body.children];
    assert.ok(was.length, 'the waist tile\'s controls are showing');
    tile('dia').click();
    assert.equal(strip.style.getPropertyValue('--as-top'), '', 'another tile does not move the row: it is already gone');
    const ghost = ed.panel.querySelector('.se-tin > .se-pb.se-leave');
    assert.ok(ghost, 'the controls that were showing are kept, fading, where they stood');
    assert.deepEqual([...ghost.children], was, 'the very controls, not copies (their GPU pictures stay with them)');
    assert.ok(ghost.inert && ghost.getAttribute('aria-hidden') === 'true');
    assert.ok(!was.some((c) => body.contains(c)), 'and the new tile\'s are in the tray\'s own body');
    assert.ok(foot.querySelector('.se-fl.se-leave'), 'the foot\'s line (the choice or the range) fades too');
    const fade = anims.find((a) => a.el === ghost);
    assert.ok(fade && fade.kf[0].opacity === 1 && fade.kf[1].opacity === 0, 'it fades by opacity alone');
    assert.ok(anims.some((a) => a.el === body && a.kf[0].opacity === 0), 'while the new controls fade in');
    assert.ok(anims.some((a) => a.el.className === 'se-fl' && a.kf[0].opacity === 0), 'and the new foot line');
    fade.finish(); await new Promise((r) => setTimeout(r, 0));
    assert.ok(!ghost.isConnected, 'the remnant goes when it has faded');
    ed.destroy();
  } finally { proto.animate = old; proto.getBoundingClientRect = R0; }
});

test('the editor\'s fold (the Tests view\'s editor shows, so the card\'s rows become one line) glides the card, writes the swap in the tap and fades the rows out where they stood', async () => {
  const anims = [];
  const proto = window.Element.prototype, old = proto.animate;
  proto.animate = function (kf, o) { let res; const a = { el: this, kf, o, finished: new Promise((r) => { res = r; }), cancel() {}, finish() { res(); } }; anims.push(a); return a; };
  const R0 = proto.getBoundingClientRect;
  proto.getBoundingClientRect = function () { return { left: 0, top: 0, right: 300, bottom: 64, width: 300, height: 64, x: 0, y: 0 }; };
  try {
    const { store } = await import('../src/ui/store.js');
    const { createStentEditor } = await import('../src/ui/stent-editor.js');
    const { GLIDE_EVENT } = await import('../src/ui/card-glide.js');
    const p = store.get().params; store.set({ params: { ...p, tips: { ...(p.tips || {}), on: true, d: 10 } } });
    const host = document.createElement('div'); document.body.append(host);
    let asks = 0; host.addEventListener(GLIDE_EVENT, () => { asks++; });
    const cardEd = createStentEditor({ id: 'TIPS' });
    host.append(cardEd.el);
    const lead = createStentEditor({ id: 'TIPS', lead: true });
    const rows = cardEd.el.querySelector('.se-rows'), line = cardEd.el.querySelector('.se-summary');
    assert.ok(rows && line && cardEd.el.dataset.fold !== 'true');
    lead.setShown(true);   // (the Tests view's editor is on screen: the card's folds to its line)
    assert.equal(asks, 1, 'the card is asked to glide first');
    assert.equal(cardEd.el.dataset.fold, 'true', 'the swap is written in the tap, so no frame is drawn between the lift and the swap');
    const ghost = cardEd.el.querySelector(':scope > .lf-ghost');
    assert.ok(ghost && ghost.contains(rows), 'the rows go out in their ghost, where they stood');
    assert.ok(anims.some((a) => a.el === ghost && a.kf[1].opacity === 0), 'fading by opacity');
    anims.length = 0;
    lead.setShown(false);   // (and back: the line goes out the same way, the rows rise from nothing)
    assert.equal(asks, 2); assert.equal(cardEd.el.dataset.fold, 'false');
    assert.ok(anims.some((a) => a.el === rows && a.kf[0].opacity === 0 && a.kf[1].opacity === 1), 'the rows fade in');
    assert.ok(cardEd.el.querySelector(':scope > .lf-ghost')?.contains(line), 'the line fades out where it stood');
    lead.destroy(); cardEd.destroy();
  } finally { proto.animate = old; proto.getBoundingClientRect = R0; }
});
