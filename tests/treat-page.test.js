// Treat's Changes as a page of its own on a phone (18 Nov 2026, the tester at 390 px: 726 px of words in a room of 654; the coordinator: "its own page, the same slide and back row as the menu pages").
// The page opens over the tabs and the body (which are put out of reach), the sheet is Full while it stands and goes back to its tab's height when the page is put away, and the tabs are interactive again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
const w = dom.window;
globalThis.window = w; globalThis.document = w.document; globalThis.Element = w.Element; globalThis.HTMLElement = w.HTMLElement;
for (const k of ['Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'Event', 'CustomEvent', 'DOMMatrixReadOnly', 'HTMLButtonElement']) globalThis[k] ??= w[k];
globalThis.Event = w.Event; globalThis.CustomEvent = w.CustomEvent;   // (the page's own: Node's has another class, and jsdom's elements take only theirs)
globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} unobserve() {} };
globalThis.IntersectionObserver ??= class { observe() {} disconnect() {} unobserve() {} };
// The frames, by hand: the page's slide is written in the scheduler's frames (script-glide.js), never by element.animate.
let T = 1000, q = [];
globalThis.requestAnimationFrame = (f) => { q.push(f); return q.length; };
globalThis.cancelAnimationFrame = () => {};
performance.now = () => T;
const tick = (ms = 8) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };
const settle = () => { for (let i = 0; i < 60; i++) tick(8); };
w.Element.prototype.animate = function () { throw new Error('the page must move in the frames, not by element.animate'); };

const { changesPage } = await import('../src/ui/treat-page.js');
const { sheetHeight } = await import('../src/ui/dock-sheet.js');
const { glideSheet } = await import('../src/ui/sheet-move.js');

function sheet() {
  const card = document.createElement('section'); card.className = 'treat-card has-plate';
  const tabs = document.createElement('div'); tabs.className = 'instr-tabs treat-tabs';
  const body = document.createElement('div'); body.className = 'tc-body';
  card.append(document.createElement('i'), tabs, body);
  const sec = document.createElement('details'); sec.className = 'section chart-sec';
  const list = document.createElement('div'); list.className = 'chg-list'; list.dataset.n = '2';
  sec.append(document.createElement('summary'), list);
  document.body.append(card);
  return { card, tabs, body, sec, list };
}

test('the row shows how many changes there are, and none when there are none', () => {
  const { card, sec, list } = sheet();
  const p = changesPage(card, sec);
  p.sync();
  assert.equal(p.row.querySelector('.tcp-n').textContent, '2');
  list.dataset.n = '0'; p.sync();
  assert.equal(p.row.querySelector('.tcp-n').textContent, '', 'the badge is empty (hidden by CSS) when nothing is changed');
});

const xOf = (el) => parseFloat(/translateX\((-?[\d.]+)px\)/.exec(el.style.transform || '')?.[1] ?? '0') || 0;
const touch = (el, type, x, y, id = 1) => {
  const e = new w.Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { clientX: x, clientY: y, pointerId: id, isPrimary: true, pointerType: 'touch' });
  el.dispatchEvent(e);
};
function open(hold = false) {
  const k = sheet(); k.hold = hold; k.land = () => k.landed?.();
  k.card.addEventListener('sheet-refit', (e) => { k.landed ??= e.detail?.landed; });
  Object.defineProperty(k.card, 'offsetWidth', { value: 390 });
  const p = changesPage(k.card, k.sec); p.sync();
  p.row.click();
  k.page = k.card.querySelector(':scope > .tc-page');
  k.p = p;
  if (!k.hold) k.land();   // (the sheet has landed at Full: the page slides in)
  return k;
}

test('opening: the page holds the Changes section, open, over the tabs and the body, which are put out of reach; the sheet is asked to refit once and the page waits for it to land, then slides in', () => {
  const { card, tabs, body, sec } = sheet();
  const p = changesPage(card, sec); p.sync();
  Object.defineProperty(card, 'offsetWidth', { value: 390 });
  let refits = 0, landed = null; card.addEventListener('sheet-refit', (e) => { refits++; landed ??= e.detail?.landed; });
  p.row.click();
  const page = card.querySelector(':scope > .tc-page');
  assert.ok(page, 'a page');
  assert.ok(page.contains(sec) && sec.open, 'the section is in it, open');
  assert.equal(page.querySelector('.tcp-back').textContent.trim(), 'Treat', 'the back row names where it goes back to');
  assert.ok(card.hasAttribute('data-page'), 'the sheet knows a page stands');
  assert.equal(tabs.inert && body.inert, true, 'the tabs and the body are out of reach under it');
  assert.equal(refits, 1);
  assert.equal(xOf(page), 390, 'it stands off to the right, written at once (no frame shows it anywhere else)');
  for (let i = 0; i < 10; i++) tick();
  assert.equal(xOf(page), 390, 'and stays there while the sheet is still on the move: a sheet that rises while the page slides carries it up, and it came in from the lower right');
  landed();
  tick(); tick();
  const mid = xOf(page);
  assert.ok(mid < 390 && mid > 0, `it slides in, in the frames, once the sheet has landed (${mid})`);
  assert.ok(xOf(tabs) < 0 && xOf(tabs) === xOf(body), 'the tabs and the body slide back together');
  settle();
  assert.equal(xOf(page), 0, 'it ends exactly home');
  assert.equal(parseFloat(tabs.style.opacity), 0, 'and have faded out');
  p.row.click();
  assert.equal(card.querySelectorAll('.tc-page').length, 1, 'a second tap makes no second page');
});

test('a sheet that never lands does not hold the page for ever: it slides in after a moment', () => {
  const k = open(true);
  for (let i = 0; i < 30; i++) tick();   // (240 ms)
  assert.equal(xOf(k.page), 390);
  for (let i = 0; i < 60; i++) tick();   // (past 600 ms)
  assert.ok(xOf(k.page) < 390, 'it has begun');
  settle();
  assert.equal(xOf(k.page), 0);
});

test('going back: what it covered is interactive at once, the page slides out and only then is the sheet asked to refit and the page taken away', () => {
  const { card, tabs, body, sec, page } = open();
  settle();
  let refits = 0; card.addEventListener('sheet-refit', () => refits++);
  card.querySelector('.tcp-back').click();
  assert.equal(tabs.inert || body.inert, false);
  assert.equal(card.hasAttribute('data-page'), true, 'the sheet stays Full while the page slides out (it never moves with the page)');
  assert.equal(refits, 0);
  tick(); tick();
  assert.ok(xOf(page) > 0 && xOf(page) < 390, 'the page slides out in the frames');
  assert.equal(refits, 0);
  settle();
  assert.equal(card.hasAttribute('data-page'), false, 'then the sheet goes back to its tab\'s height');
  assert.equal(refits, 1);
  assert.equal(card.querySelector('.tc-page'), null, 'and the page is taken away');
  assert.equal(tabs.style.transform + tabs.style.opacity + body.style.transform + body.style.opacity, '', 'what it covered is left as it was, nothing inline');
  assert.ok(sec.open, 'the section is whole and open, ready for the page to hold it again');
});

test('a swipe right follows the finger: the page stands where the finger has it, and what it covers goes with it (the tester: it stayed at x=0 through a 320 px drag)', () => {
  const { card, tabs, page } = open();
  settle();
  touch(page, 'pointerdown', 40, 300);
  touch(page, 'pointermove', 60, 302);
  const seen = [];
  for (const dx of [20, 80, 160, 240, 320]) { T += 16; touch(page, 'pointermove', 40 + dx, 304); seen.push([dx, xOf(page)]); }
  // (the page takes the finger where the drag was claimed, at 20 px: from there it moves one for one)
  for (const [dx, px] of seen.slice(1)) assert.ok(Math.abs(px - (dx - 20)) < 1, `at ${dx} px of drag the page is at ${px}`);
  assert.ok(Math.abs(xOf(page) - 300) < 1);
  assert.ok(xOf(tabs) > -0.3 * 390 && xOf(tabs) < 0, 'the tabs have slid back most of the way, not all');
  assert.ok(card.hasAttribute('data-page'), 'the sheet still has its page until the finger lets go');
  assert.equal(card.querySelector('.tc-page'), page);
});

test('a short, slow pull comes home; a long one, or a flick, goes back', () => {
  let k = open(); settle();
  touch(k.page, 'pointerdown', 40, 300); touch(k.page, 'pointermove', 60, 300);
  T += 400; touch(k.page, 'pointermove', 100, 300);   // 60 px, slowly
  T += 200; touch(k.page, 'pointerup', 100, 300);     // (held for 200 ms before lifting: no flick)
  assert.ok(k.tabs.inert, 'a short pull does not close');
  settle();
  assert.equal(xOf(k.page), 0, 'it comes home exactly');
  assert.equal(k.tabs.inert, true, 'what it covers is still out of reach');

  k = open(); settle();
  touch(k.page, 'pointerdown', 40, 300); touch(k.page, 'pointermove', 60, 300);
  T += 300; touch(k.page, 'pointermove', 240, 300);   // 200 px, slowly
  T += 20; touch(k.page, 'pointerup', 240, 300);
  assert.equal(k.tabs.inert, false, 'a long pull closes at once');
  assert.equal(k.tabs.inert, false);
  settle();
  assert.equal(k.card.querySelector('.tc-page'), null, 'and the page is taken away when it has gone');

  k = open(); settle();
  touch(k.page, 'pointerdown', 40, 300); touch(k.page, 'pointermove', 60, 300);
  for (let i = 1; i <= 4; i++) { T += 16; touch(k.page, 'pointermove', 60 + i * 30, 300); }   // 1.9 px/ms
  touch(k.page, 'pointerup', 180, 300);
  assert.equal(k.tabs.inert, false, 'a quick flick of 120 px closes');
  const at = xOf(k.page);
  tick(16);
  assert.ok(xOf(k.page) > at, 'and carries on from where the finger left it, never from a jump');
  settle();
  assert.equal(k.card.querySelector('.tc-page'), null);
});

test('a vertical drag is a scroll, not a swipe, and a slider keeps its own gesture', () => {
  const { page } = open(); settle();
  touch(page, 'pointerdown', 200, 300); touch(page, 'pointermove', 206, 340); touch(page, 'pointermove', 230, 400);
  assert.equal(xOf(page), 0, 'a drag mostly down leaves the page where it is');
  const r = document.createElement('input'); r.type = 'range'; page.append(r);
  const e = new w.Event('pointerdown', { bubbles: true }); Object.assign(e, { clientX: 20, clientY: 20, pointerId: 2, isPrimary: true, pointerType: 'touch' });
  r.dispatchEvent(e); touch(page, 'pointermove', 120, 22, 2);
  assert.equal(xOf(page), 0, 'a drag that began on a slider is the slider\'s');
});

test('caught mid-slide, the finger takes the page from where it stands, and going back mid-slide turns from there', () => {
  const { card, page } = open();
  tick(); tick(); tick();
  const here = xOf(page);
  assert.ok(here > 0 && here < 390);
  touch(page, 'pointerdown', 100, 300); touch(page, 'pointermove', 110, 300);
  touch(page, 'pointermove', 130, 300);
  assert.ok(Math.abs(xOf(page) - (here + 20)) < 1, `the finger carries it on from ${here}: ${xOf(page)}`);
  touch(page, 'pointerup', 130, 300);
  settle();
  card.querySelector('.tcp-back')?.click();
  const mid = xOf(page);
  tick(); tick();
  assert.ok(xOf(page) >= mid, 'going back moves toward gone');
  settle();
  assert.equal(card.querySelector('.tc-page'), null);
});

test('the page only ever slides sideways: its translate (the sheet\'s own vertical ride) is never written by the slide, and its transform never has a vertical part (the tester: it rose from 528 px below)', () => {
  const { card, tabs, body, page } = open();
  const seen = new Set();
  const look = () => { for (const e of [page, tabs, body]) { seen.add(e.style.transform); assert.ok(!/translate\(|translateY|translate3d|,/.test(e.style.transform), `a vertical part in ${e.style.transform}`); assert.equal(e.style.translate, '', 'the slide does not use translate'); } };
  look();
  for (let i = 0; i < 40; i++) { tick(8); look(); }
  assert.ok(seen.size > 5, 'it moved through many places');
  card.querySelector('.tcp-back').click();
  for (let i = 0; i < 40; i++) { tick(8); look(); }
});

test('while the sheet refits (glideSheet moves every child of it, the page too, by translate), the page keeps its sideways slide and is left at its place when the refit lands', () => {
  const { card, page, tabs } = open();
  glideSheet(card, 120);   // (the refit the page\'s own opening asks for, a sheet 120 px lower as it begins)
  for (let i = 0; i < 6; i++) tick(8);
  assert.ok(page.style.translate.includes('px'), 'the page rides the sheet vertically, as its other parts do');
  assert.ok(/translateX\(/.test(page.style.transform) && xOf(page) < 390, 'and slides sideways at the same time');
  settle();
  assert.equal(xOf(page), 0, 'the slide lands exactly home');
  assert.equal(parseFloat(tabs.style.opacity), 0);
  assert.equal(page.style.translate, '0px 120px', 'the sheet\'s own ride ends where the sheet is, the slide untouched by it');
});

test('the page has its backing from the first frame, whole while it covers the words fading under it, gone as it lands', () => {
  const { page } = open();
  const plate = page.querySelector(':scope > .pp-plate');
  assert.ok(plate, 'a backing in the page');
  assert.equal(page.firstElementChild, plate, 'under the page\'s own words');
  assert.equal(parseFloat(plate.style.opacity), 1, 'whole on the first frame, before the page has moved');
  tick(); tick(); tick();
  assert.ok(xOf(page) > 40, 'the page is partway over what it covers');
  assert.equal(parseFloat(plate.style.opacity), 1, 'and the backing is whole');
  settle();
  assert.equal(parseFloat(plate.style.opacity), 0, 'once home the glass shows through it again');
});

test('the sheet is Full while a page stands and goes back to its tab\'s height after it (the phone at 390 x 844: room 654)', () => {
  const stops = [0.62, 1], room = 654, area = 654, half = 0;
  const tab = sheetHeight({ size: 0, half, stops, room, area, need: 520, page: false });
  assert.equal(tab, '520px', 'the tab\'s words, taller than Half (405 px), up to Full');
  assert.equal(sheetHeight({ size: 0, half, stops, room, area, need: Infinity, page: true }), '654px', 'Full while the page stands');
  assert.equal(sheetHeight({ size: 0, half, stops, room, area, need: 520, page: false }), tab, 'and the same height as before once it is away');
  assert.equal(sheetHeight({ size: 0, half, stops, room, area, need: 300, page: false }), '300px', 'a short tab is as tall as its words');
  assert.equal(sheetHeight({ size: 0, half, stops, room, area, need: 900, page: false }), '654px', 'words taller than the room: Full, and only then scrolls');
  assert.equal(sheetHeight({ size: 1, half, stops, room, area, need: Infinity, page: false }), '654px', 'the Full stop itself');
});
