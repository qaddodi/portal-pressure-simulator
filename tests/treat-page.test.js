// Treat's Changes as a page of its own on a phone (18 Nov 2026, the tester at 390 px: 726 px of words in a room of 654; the coordinator: "its own page, the same slide and back row as the menu pages").
// The page opens over the tabs and the body (which are put out of reach), the sheet is Full while it stands and goes back to its tab's height when the page is put away, and the tabs are interactive again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
const w = dom.window;
globalThis.window = w; globalThis.document = w.document; globalThis.Element = w.Element; globalThis.HTMLElement = w.HTMLElement;
for (const k of ['Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'Event', 'CustomEvent', 'DOMMatrixReadOnly', 'HTMLButtonElement']) globalThis[k] ??= w[k];
globalThis.Event = w.Event;   // (the page's own: Node's has another class, and jsdom's elements take only theirs)
globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} unobserve() {} };
globalThis.IntersectionObserver ??= class { observe() {} disconnect() {} unobserve() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);
// (jsdom has no Web Animations: an animation is an object that has finished.)
const played = [];
w.Element.prototype.animate = function (kf, o) { const a = { kf, o, el: this, cancel() { a.cancelled = true; }, finished: Promise.resolve() }; played.push(a); return a; };

const { changesPage } = await import('../src/ui/treat-page.js');
const { sheetHeight } = await import('../src/ui/dock-sheet.js');

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

test('opening: the page holds the Changes section, open, over the tabs and the body, which are put out of reach and slide away; the sheet is asked to refit once', () => {
  const { card, tabs, body, sec } = sheet();
  const p = changesPage(card, sec); p.sync();
  let refits = 0; card.addEventListener('sheet-refit', () => refits++);
  played.length = 0;
  p.row.click();
  const page = card.querySelector(':scope > .tc-page');
  assert.ok(page, 'a page');
  assert.ok(page.contains(sec) && sec.open, 'the section is in it, open');
  assert.equal(page.querySelector('.tcp-back').textContent.trim(), 'Treat', 'the back row names where it goes back to');
  assert.ok(card.hasAttribute('data-page'), 'the sheet knows a page stands');
  assert.equal(tabs.inert && body.inert, true, 'the tabs and the body are out of reach under it');
  assert.equal(refits, 1);
  const moves = played.map((a) => JSON.stringify(a.kf));
  assert.ok(moves.some((m) => m.includes('translateX(100%)')), 'the page slides in from the right');
  assert.ok(moves.filter((m) => m.includes('translateX(-30%)')).length === 2, 'the tabs and the body slide back and fade');
  assert.ok(played.every((a) => a.o.fill === 'both' && a.kf.every((f) => Object.keys(f).every((k) => ['transform', 'opacity'].includes(k)))), 'transform and opacity alone');
  p.row.click();
  assert.equal(card.querySelectorAll('.tc-page').length, 1, 'a second tap makes no second page');
});

test('going back: the sheet is asked to refit, the tabs and the body are interactive again, the page slides out and is taken away', async () => {
  const { card, tabs, body, sec } = sheet();
  const p = changesPage(card, sec);
  p.row.click();
  let refits = 0; card.addEventListener('sheet-refit', () => refits++);
  played.length = 0;
  card.querySelector('.tcp-back').click();
  assert.equal(card.hasAttribute('data-page'), false);
  assert.equal(tabs.inert || body.inert, false);
  assert.equal(refits, 1);
  assert.ok(played.some((a) => JSON.stringify(a.kf).includes('translateX(100%)')), 'the page slides out');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(card.querySelector('.tc-page'), null, 'taken away once it has gone');
  assert.ok(sec.open, 'the section is whole and open, ready for the page to hold it again');
  p.row.click();
  assert.ok(card.querySelector('.tc-page'), 'it opens again');
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
