// A menu from the thumb dock's tab row (Settings on an upright iPad) sits on the tab row's top edge, 8 px clear of it,
// over the play bar, like the cards and the phone's sheets (Mohammad, 17 Oct, "Glitchy settings on iPad": it had floated
// above the whole dock, with a gap over the faded play bar and the cut-off ghost of its shadow in that gap).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A small fake DOM: just what util.js popover() reads to place a menu.
class FakeEl {
  constructor(tag) { this.tagName = tag; this.className = ''; this.children = []; this.style = { setProperty(k, v) { this[k] = v; } }; this.attrs = {}; this.isConnected = true; this.dataset = {}; }
  get classList() { const el = this; return { contains: (c) => el.className.split(/\s+/).includes(c), toggle() {}, add(c) { el.className += ' ' + c; }, remove() {} }; }
  append(...k) { this.children.push(...k); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  remove() { this.isConnected = false; }
  contains() { return false; }
  closest(sel) { let e = this; while (e) { if (sel === '.thumb-bar' ? e.className.includes('thumb-bar') : sel === '.vdock' ? e.className.includes('vdock') : false) return e; e = e.parent; } return null; }
  get nodeType() { return 1; }
}
globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= FakeEl;
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
const body = new FakeEl('body');
globalThis.document = { documentElement: new FakeEl('html'), body, addEventListener() {}, createElement: (t) => new FakeEl(t), createTextNode: (s) => s, getElementById: () => null };
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.innerWidth = 820; globalThis.innerHeight = 1180;   // an upright iPad Air
globalThis.getComputedStyle = (el) => ({ overflowY: el.className.includes('app-menu') ? 'auto' : 'visible', paddingBottom: '8px' });
const { popover, closePopover } = await import('../src/ui/util.js');

// The dock: play bar 1060–1110, tab row 1110–1170 (y). The menu lays out 280 × 600.
function dock() {
  const vdock = new FakeEl('div'); vdock.className = 'vdock'; vdock.getBoundingClientRect = () => ({ top: 1060, bottom: 1170, left: 8, right: 812, width: 804, height: 110 });
  const bar = new FakeEl('nav'); bar.className = 'thumb-bar'; bar.parent = vdock; bar.getBoundingClientRect = () => ({ top: 1110, bottom: 1170, left: 8, right: 812, width: 804, height: 60 });
  const btn = new FakeEl('button'); btn.parent = bar; btn.getBoundingClientRect = () => ({ top: 1114, bottom: 1166, left: 650, right: 806, width: 156, height: 52 });
  return btn;
}
const sized = (el) => { Object.assign(el, { offsetWidth: 280, offsetHeight: 600, scrollHeight: 600, clientHeight: 600, scrollTop: 0 }); return el; };
const open = (anchor, opts) => { const orig = document.createElement; document.createElement = (t) => sized(new FakeEl(t)); try { return popover(anchor, [], opts); } finally { document.createElement = orig; } };

test("Settings from the tab row sits 8 px above the tab row's top edge, over the play bar", () => {
  const el = open(dock(), { place: 'above', align: 'end', cls: 'app-menu' });
  assert.equal(parseFloat(el.style.top) + 600, 1110 - 8, 'foot 8 px above the tab row, not above the whole dock');
  assert.equal(el.style.maxHeight, 1110 - 16 + 'px', 'never taller than the room above the tab row');
  closePopover();
});

test('a dock menu opened with the default placement lands on the tab row too, never off the bottom', () => {
  const el = open(dock(), { cls: 'blood-pop' });
  assert.equal(parseFloat(el.style.top) + 600, 1110 - 8);
  assert.equal(el.style.maxHeight, undefined, "a menu that doesn't scroll keeps its own height");
  closePopover();
});

test("a dock menu's cut runs across its whole shadow on the tab row's top line, so nothing of it is drawn lower", () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /html\.thumb-ui \.menu\.from-dock \{ clip-path: inset\(-64px -64px calc\(var\(--sink, 0px\) - 8px\) -64px\); \}/);
  // (The cards keep their polygon, open at the sides: the dock is drawn over their shadow.)
  assert.doesNotMatch(css, /html\.thumb-ui \.menu\.from-dock \{ clip-path: polygon/);
});
