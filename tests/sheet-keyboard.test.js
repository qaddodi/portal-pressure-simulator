// A bottom sheet over the on-screen keyboard (src/ui/sheet-keyboard.js): iOS leaves the layout viewport as tall as it was and draws the keyboard over its
// foot, so a field low in a sheet was under it (From readings, the RA pressure: 15 Nov 2026). Every popover that is a sheet is now lifted onto the keyboard
// and held to the room above it, whatever it holds, and the field the person is in is scrolled into view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><button id="b" aria-label="Menu">Menu</button></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const k of ['Element', 'Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'HTMLElement', 'Event', 'KeyboardEvent']) globalThis[k] ??= dom.window[k];
globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {};
Object.defineProperty(globalThis, 'innerHeight', { value: 844, configurable: true }); globalThis.innerWidth = 390;
// A phone: the sheet's media query matches.
globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, addListener() {}, removeEventListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);
// The visual viewport: a target with the three numbers the fit reads.
const vv = Object.assign(new dom.window.EventTarget(), { scale: 1, offsetTop: 0, height: 844 });
dom.window.visualViewport = vv;
globalThis.visualViewport = vv;
const { popover, closePopover } = await import('../src/ui/util.js');
const { keyboardHeight, isTextField } = await import('../src/ui/sheet-keyboard.js');
const settle = () => new Promise((r) => setTimeout(r, 60));

test('the keyboard is how far the visual viewport ends above the window; a pinched page or a small bar is not one', () => {
  assert.equal(keyboardHeight({ scale: 1, offsetTop: 0, height: 844 }, 844), 0);
  assert.equal(keyboardHeight({ scale: 1, offsetTop: 0, height: 508 }, 844), 336);
  assert.equal(keyboardHeight({ scale: 1, offsetTop: 40, height: 468 }, 844), 336, 'the page panned up to the field: the offset counts');
  assert.equal(keyboardHeight({ scale: 2, offsetTop: 0, height: 400 }, 844), 0, 'pinched in is not a keyboard');
  assert.equal(keyboardHeight({ scale: 1, offsetTop: 0, height: 800 }, 844), 0, 'the browser bar sliding is not a keyboard');
  assert.equal(keyboardHeight(null, 844), 0);
});

test('which fields bring the keyboard up', () => {
  const mk = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild; };
  assert.equal(isTextField(mk('<input type="text">')), true);
  assert.equal(isTextField(mk('<input type="search">')), true);
  assert.equal(isTextField(mk('<textarea></textarea>')), true);
  assert.equal(isTextField(mk('<input type="range">')), false);
  assert.equal(isTextField(mk('<input type="checkbox">')), false);
  assert.equal(isTextField(mk('<button>x</button>')), false);
});

test('a sheet with a field in it rests on the keyboard and is held to the room above it, and lets go when the keyboard goes', async () => {
  const input = document.createElement('input'); input.type = 'text';
  const body = document.createElement('div'); body.append(input);
  const sheet = popover(document.getElementById('b'), body, { cls: 'test-sheet' });
  assert.ok(sheet && sheet.classList.contains('as-sheet'), 'on a phone a popover is a sheet');
  await settle();
  assert.equal(sheet.dataset.kb, undefined, 'no keyboard: the sheet is as it was');
  assert.equal(sheet.style.getPropertyValue('--sheet-kb'), '');
  // The keyboard comes up under the focused field.
  input.focus();
  vv.height = 508; vv.dispatchEvent(new dom.window.Event('resize'));
  await settle();
  assert.equal(sheet.dataset.kb, '1');
  assert.equal(sheet.style.getPropertyValue('--sheet-kb'), '336px', 'it rests on the keyboard');
  assert.equal(sheet.style.getPropertyValue('--sheet-room'), '492px', 'and has the room above it, less a margin');
  // The page pans up to the field (iOS does) and the keyboard stays: the same lift.
  vv.offsetTop = 40; vv.height = 468; vv.dispatchEvent(new dom.window.Event('scroll'));
  await settle();
  assert.equal(sheet.style.getPropertyValue('--sheet-kb'), '336px');
  // The keyboard goes.
  vv.offsetTop = 0; vv.height = 844; vv.dispatchEvent(new dom.window.Event('resize'));
  await settle();
  assert.equal(sheet.dataset.kb, undefined);
  assert.equal(sheet.style.getPropertyValue('--sheet-kb'), '');
  assert.equal(sheet.style.getPropertyValue('--sheet-room'), '');
  closePopover();
});

test('a sheet opened with the keyboard already up is lifted at once, and a closed sheet stops listening', async () => {
  vv.height = 508;
  const body = document.createElement('div'); body.append(document.createElement('input'));
  for (const e of document.querySelectorAll('.menu, .um-scrim')) e.remove();
  const b2 = document.createElement('button'); b2.setAttribute('aria-label', 'Other'); document.body.append(b2);
  const sheet = popover(b2, body, { cls: 'test-sheet' });
  await settle();
  assert.equal(sheet.dataset.kb, '1');
  closePopover();
  vv.height = 844; vv.dispatchEvent(new dom.window.Event('resize'));
  await settle();
  assert.equal(sheet.style.getPropertyValue('--sheet-kb'), '', 'a closed sheet is left clean');
});

test('the stylesheet lifts a sheet with data-kb over the dock rule too, and the From readings sheet keeps a field clear of its foot', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../styles/app-02-controls.css', import.meta.url), 'utf8');
  assert.match(css, /\.menu\.as-sheet\[data-kb\], html\.thumb-ui \.menu\.as-sheet\[data-kb\] \{ bottom: var\(--sheet-kb\); max-height: var\(--sheet-room\)/);
  const fr = readFileSync(new URL('../styles/from-readings.css', import.meta.url), 'utf8');
  assert.match(fr, /scroll-padding-bottom: 96px/);
});
