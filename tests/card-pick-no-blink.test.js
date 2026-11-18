// A pick while a card is open is one move whatever the new card's size or shape (17 Nov 2026, Mohammad: opening, closing and choosing still felt glitchy). The old words
// fade out where they stood (a ghost that keeps its own height), the new ones come in a beat later, and a different height is the card's own glide (card-glide.js, from the
// plate's old height); the card never re-enters from its edge, and its old words are never taken away in one frame. Run in jsdom with a stand-in for Web Animations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><div class="app"><div class="view"></div></div></body>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
for (const k of ['Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'HTMLElement', 'CustomEvent', 'Event']) globalThis[k] ??= dom.window[k];
globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {}; globalThis.dispatchEvent ??= () => true;
globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
const observers = [];
globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; observers.push(this); } observe() {} unobserve() {} disconnect() {} };
globalThis.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* already there */ }

document.documentElement.style.setProperty('--ramp-pressure', '#3b4cc0 0, #dddddd 0.5, #b40426 1');   // (the bar's colours)
globalThis.DOMMatrixReadOnly = class { constructor() { this.m41 = 0; this.m42 = 0; } };
const made = [];
const proto = window.Element.prototype;
proto.animate = function (kf, o) { let res; const a = { el: this, kf, o, finished: new Promise((r) => { res = r; }), cancel() { a.cancelled = true; }, finish() { res(); } }; made.push(a); return a; };
// (jsdom lays nothing out: the heights the card reads are what these say)
let HEIGHT = 292, BODY = 280;
Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return this.classList?.contains('action-card') ? HEIGHT : this.classList?.contains('ac-body') ? BODY : 0; } });

const { store } = await import('../src/ui/store.js');
const { createCard } = await import('../src/ui/card.js');

const view = document.querySelector('.view');
const stage = { cardsMoved() {}, reveal() {}, unreveal() {}, relayout() {} };
const ctx = { action() {}, showPane() {}, probe() {}, startShunt() {}, canShunt: () => false, select() {}, zoomLobule() {}, paneApi: {}, openIr() {} };
const card = createCard({ view, stage, ctx, onWhy() {} });
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const pick = async (id) => { store.set({ selection: { type: 'edge', id } }); await wait(); };

test('a pick of a card of another shape while one is open is the old words fading out and the new ones in: no re-entry, no removal in one frame', async () => {
  await pick('PVH_R_2');
  await wait(800);   // (its build, held up to PREP_MAX_MS for its widgets and two frames, then its entrance over)
  assert.ok(!card.el.classList.contains('ac-in'), 'the first card has come in');
  made.length = 0;
  const first = card.el.querySelector(':scope > .ac-body');
  await pick('REX');   // (another shape: Meso-Rex bypass)
  assert.ok(!card.el.classList.contains('ac-in'), 'the card does not come in from its edge again');
  const ghost = card.el.querySelector(':scope > .ac-ghost');
  assert.equal(ghost, first, 'the old words stay, as a ghost, until they have faded');
  assert.ok(made.some((a) => a.el === ghost), 'the ghost fades');
  assert.ok(made.some((a) => a.el === card.el.querySelector(':scope > .ac-body')), 'the new words fade in');
  // (The words cross one for one: out and in on one clock, so the two opacities always make 1; the tester, 17 Nov 2026: the words dipped to half for 100 ms on every pick.)
  const out = made.find((a) => a.el === ghost), inn = made.find((a) => a.el === card.el.querySelector(':scope > .ac-body'));
  assert.equal(out.o.duration, inn.o.duration, 'the same length');
  assert.ok(!inn.o.delay, 'the new words start with the old ones go');
  assert.equal(out.o.easing, 'linear'); assert.equal(inn.o.easing, 'linear');
  assert.equal(ghost.style.bottom, 'auto', 'the ghost keeps its own height rather than filling the new box');
  assert.equal(ghost.style.height, `${BODY}px`);
});

test('a pick that changes the card\'s height glides the card\'s plate from the height it had', async () => {
  HEIGHT = 292; BODY = 280;
  await pick('PVH_R_2'); await wait(400);
  for (const o of observers) o.cb([], o);   // (the card's observer reports the height it stands at)
  made.length = 0;
  const prev = card.el.dataset.shape;
  HEIGHT = 196; BODY = 184;   // (the new card is shorter: the observer reports it after the change)
  await pick('REX');
  assert.notEqual(card.el.dataset.shape, prev, 'a different shape');
  for (const o of observers) o.cb([], o);
  const plate = card.el.querySelector(':scope > .sheet-plate');
  const g = made.filter((a) => a.el === plate);
  assert.equal(g.length, 1, 'the plate glides');
  assert.equal(g[0].kf[0].transform, `scaleY(${(292 / 196).toFixed(4)})`, 'from the old height');
  assert.equal(g[0].kf[1].transform, 'none');
});

test('a pick while the card is still on its way out takes it from where it is: the old words finish going out from the opacity they had reached, the glass comes back from there', async () => {
  HEIGHT = 292; BODY = 280;
  await pick('PVH_R_2'); await wait(400);
  const ga = proto.getAnimations;
  proto.getAnimations = () => [{ finished: new Promise(() => {}) }];   // (a leave that has not ended)
  store.set({ selection: null }); await wait();
  assert.ok(card.el.classList.contains('ac-leaving'), 'it is going out');
  const words = card.el.querySelector(':scope > .ac-body'), plate = card.el.querySelector(':scope > .sheet-plate');
  words.style.opacity = '0.6';   // (where its leave had got to, as the browser would answer)
  plate.style.opacity = '0';     // (the glass holds its own opacity: the words are what is read)
  made.length = 0;
  await pick('REX');
  assert.ok(!card.el.classList.contains('ac-leaving'));
  const ghost = card.el.querySelector(':scope > .ac-ghost');
  assert.equal(ghost, words, 'the old words stay as a ghost, not taken away in one frame');
  const a = made.find((x) => x.el === ghost);
  assert.ok(a, 'the ghost fades');
  assert.equal(a.kf[0].opacity, 0.6, 'from the opacity it had reached');
  assert.equal(a.kf[1].opacity, 0);
  assert.equal(plate.style.getPropertyValue('--edge-o'), '0.6', 'the glass comes back from there, not from nothing');
  proto.getAnimations = ga;
});
