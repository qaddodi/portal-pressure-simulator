// Premium-feel R12: a lens switch moves the key and the lens name on the figure's clock (D_SURFACE, EASE_MOVE) instead of
// fading the key out and in one after the other: the name crossfades, a bar mixes its colours in OKLab and glides its
// ends, its numbers slide from one place to the next, and the other keys crossfade. Pure parts first, then the move itself
// on a small fake DOM, then the pins on main.js and the stylesheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ── a small fake DOM: what morphKey and crossfadeText read and write ──
class FakeNode {
  constructor(cls = '', text = '') { this.className = cls; this.textContent = text; this.children = []; this.parentElement = null; this.isConnected = true; this.attrs = {}; this.animations = []; this.rect = { left: 0, top: 0, width: 10, height: 10 }; this.hidden = false; this.style = Object.assign(Object.create({ setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } }), {}); this.clientLeft = 0; this.clientTop = 0; this.inert = false; this._lab = null; }
  get firstChild() { return this.children[0] ?? null; }
  get classList() { const n = this; return { contains: (c) => n.className.split(/\s+/).includes(c), add: (c) => { if (!n.className.split(/\s+/).includes(c)) n.className += ` ${c}`; }, remove: (c) => { n.className = n.className.split(/\s+/).filter((x) => x !== c).join(' '); } }; }
  append(...k) { for (const c of k) { c.parentElement?.children.splice(c.parentElement.children.indexOf(c), 1); c.parentElement = this; this.children.push(c); } }
  replaceChildren(...k) { for (const c of this.children) c.parentElement = null; this.children = []; this.append(...k); }
  remove() { const p = this.parentElement; if (p) p.children.splice(p.children.indexOf(this), 1); this.parentElement = null; this.isConnected = false; }
  removeAttribute(k) { delete this.attrs[k]; } setAttribute(k, v) { this.attrs[k] = v; }
  cloneNode(deep) { const c = new FakeNode(this.className, deep ? '' : this.textContent); c.rect = { ...this.rect }; c.attrs = { ...this.attrs }; c._ramp = this._ramp; if (deep) for (const k of this.children) c.append(k.cloneNode(true)); else c.textContent = this.textContent; return c; }
  all(sel) { const cls = sel.slice(1), out = []; const walk = (n) => { for (const c of n.children) { if (c.classList.contains(cls)) out.push(c); walk(c); } }; walk(this); return out; }
  querySelectorAll(sel) { return this.all(sel); }
  querySelector(sel) { return this.all(sel)[0] ?? null; }
  getBoundingClientRect() { const r = this.rect; return { ...r, right: r.left + r.width, bottom: r.top + r.height }; }
  getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; }
  checkVisibility() { return !this.hidden; }
  animate(frames, o) { const a = { frames, o, cancelled: false, finished: new Promise(() => {}), cancel() { this.cancelled = true; } }; this.animations.push(a); return a; }
  getPropertyValue(k) { return this.style[k] ?? ''; }
}
globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= FakeNode;
let reduced = false;
globalThis.matchMedia = () => ({ get matches() { return reduced; }, addEventListener() {}, addListener() {} });
globalThis.document = { documentElement: new FakeNode(), body: new FakeNode(), addEventListener() {}, createElement: () => new FakeNode(), createTextNode: (s) => s, getElementById: () => null };
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.getComputedStyle = (el) => ({ getPropertyValue: (k) => el.style[k] ?? '' });
globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
const M = await import('../src/ui/legend-morph.js');
const { D_SURFACE, EASE_MOVE } = await import('../src/ui/ease.js');

const rgbRamp = (...cols) => `linear-gradient(to right, ${cols.map((c, i) => `rgb(${c.join(',')}) ${(i / (cols.length - 1)) * 100}%`).join(', ')})`;
const BLUE_RED = rgbRamp([20, 40, 200], [200, 40, 20]), GREY_GREEN = rgbRamp([128, 128, 128], [20, 160, 60]);

test('parseRamp reads the gradients colormap.js builds: rgb stops with positions, var tokens, stops with none', () => {
  const s = M.parseRamp('linear-gradient(to right, rgb(10,20,30) 0%, rgb(100,110,120) 8.333333333333332%, rgb(250,251,252) 100%)');
  assert.deepEqual(s.map((x) => +x.u.toFixed(4)), [0, 0.0833, 1]);
  const t = M.parseRamp('linear-gradient(to right, var(--delta-low), var(--delta-mid), var(--delta-high))', (n) => ({ '--delta-low': [0, 0, 255], '--delta-mid': [128, 128, 128], '--delta-high': [255, 0, 0] })[n]);
  assert.deepEqual(t.map((x) => x.u), [0, 0.5, 1], 'the stops with no position stand evenly between their neighbours');
  assert.equal(M.parseRamp('red'), null);
  assert.equal(M.parseRamp('linear-gradient(to right, hotpink, rgb(1,2,3))'), null, 'a colour it does not know is not guessed at');
});

test('sampleRamp walks a ramp end to end in OKLab and mixLabs is the straight line between two samples', () => {
  const stops = M.parseRamp(BLUE_RED), a = M.sampleRamp(stops), b = M.sampleRamp(M.parseRamp(GREY_GREEN));
  assert.equal(a.length, M.MORPH_STOPS);
  assert.deepEqual(a[0].map((v) => +v.toFixed(5)), stops[0].lab.map((v) => +v.toFixed(5)));
  assert.deepEqual(a.at(-1).map((v) => +v.toFixed(5)), stops[1].lab.map((v) => +v.toFixed(5)));
  const mid = M.mixLabs(a, b, 0.5);
  assert.deepEqual(mid[3].map((v) => +v.toFixed(6)), a[3].map((v, j) => +((v + b[3][j]) / 2).toFixed(6)));
  const same = (x, y) => x.every((c, i) => c.every((v, j) => Math.abs(v - y[i][j]) < 1e-12));
  assert.ok(same(M.mixLabs(a, b, 0), a));
  assert.ok(same(M.mixLabs(a, b, 1), b));
});

test('labsCss and morphGradient: the plain ramp, and the one a CSS variable mixes between two ramps in OKLab', () => {
  const a = M.sampleRamp(M.parseRamp(BLUE_RED)), b = M.sampleRamp(M.parseRamp(GREY_GREEN));
  const plain = M.labsCss(a);
  assert.match(plain, /^linear-gradient\(to right, rgb\(\d+, \d+, \d+\) 0\.00%, /);
  assert.equal(plain.match(/rgb\(/g).length, M.MORPH_STOPS);
  const back = M.parseRamp(plain).map((s) => s.lab);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < 3; j++) assert.ok(Math.abs(back[i][j] - a[i][j]) < 0.01, 'rounded to whole rgb steps, no more');
  const g = M.morphGradient(a, b);
  assert.equal(g.match(/color-mix\(in oklab, /g).length, M.MORPH_STOPS);
  assert.equal(g.match(/var\(--lg-k\)/g).length, M.MORPH_STOPS);
  assert.match(g, /100\.00%\)$/);
});

test('pairItems: the i-th number of one scale becomes the i-th of the next; the surplus fade', () => {
  const o = (x, text) => ({ x, y: 15, text }), n = (x, text) => ({ x, y: 15, text });
  const p = M.pairItems([o(0, '0'), o(55, '10'), o(110, '20'), o(165, '30')], [n(0, '0'), n(80, '0.5'), n(160, '5')]);
  assert.deepEqual(p.slides.map((s) => [s.i, s.dx, s.same]), [[0, 0, true], [1, -25, false], [2, -50, false]]);
  assert.deepEqual(p.fadeOut, [3]);
  assert.deepEqual(p.fadeIn, []);
  assert.deepEqual(M.pairItems([o(0, 'a')], [n(0, 'a'), n(9, 'b')]).fadeIn, [1]);
  assert.deepEqual(M.pairItems([], []), { slides: [], fadeIn: [], fadeOut: [] });
});

// ── the move ──
function legend(ramp, nums, { ticks = [], titleW = 100, scaleX = 120 } = {}) {
  const btn = new FakeNode('lens-btn'); btn.rect = { left: 300, top: 20, width: 300, height: 42 }; btn.clientLeft = 1; btn.clientTop = 1;
  const el = new FakeNode('legend'); el.rect = { left: 310, top: 22, width: 4 + titleW + 12 + 168 + 4, height: 38 };
  btn.append(el);
  const kids = build(ramp, nums, ticks, titleW, scaleX);
  el.append(...kids);
  return { btn, el };
}
function build(ramp, nums, ticks, titleW, scaleX, label = 'Title') {
  const title = new FakeNode('lg-title', label); title.rect = { left: 314, top: 24, width: titleW, height: 28 };
  const scale = new FakeNode('lg-scale'); scale.rect = { left: scaleX, top: 24, width: 168, height: 30 };
  const bar = new FakeNode('lg-bar'); bar._ramp = ramp; bar.rect = { left: scaleX, top: 28, width: 168, height: 8 };
  scale.append(bar);
  for (const x of ticks) { const t = new FakeNode('lg-tick'); t.rect = { left: scaleX + x, top: 26, width: 1, height: 12 }; scale.append(t); }
  for (const [x, text] of nums) { const n = new FakeNode('lg-num', text); n.rect = { left: scaleX + x, top: 39, width: 14, height: 14 }; scale.append(n); }
  return [title, scale];
}

test('a bar that meets a bar: the old key stands as a ghost, the numbers slide, the bar mixes its colours, and it all lands together', () => {
  const { btn, el } = legend(BLUE_RED, [[0, '0'], [56, '10'], [112, '20'], [168, '30']], { ticks: [56, 112] });
  const bar0 = el.querySelector('.lg-bar');
  M.morphKey(el, build(GREY_GREEN, [[0, '0'], [60, '0.5'], [150, '5']], [], 80, 130, 'Flow'));
  const ghost = btn.children.find((c) => c !== el);
  assert.ok(ghost, 'the old key stays where it was, over the new, while it leaves');
  assert.equal(ghost.attrs['aria-hidden'], 'true');
  assert.equal(ghost.querySelector('.lg-bar'), null, 'the bar is not ghosted: it is the same bar, changing colour');
  assert.equal(ghost.style.position, 'absolute');
  assert.equal(ghost.style.left, '9px', 'in the button\'s own frame: the key stood at 310, the button\'s padding box at 301');
  // The new bar
  const bar = el.querySelector('.lg-bar');
  assert.notEqual(bar, bar0);
  // (its colour: two ramps painted once, the old fading out over the new by opacity, nothing repainted per frame)
  assert.equal(bar.style.background, undefined, 'the new bar wears its own ramp, as built');
  assert.ok(!String(bar.className).includes('morphing'));
  const was = bar.children.find((c) => String(c.className).includes('lg-bar-was'));
  assert.ok(was, 'the old ramp lies over the new bar');
  assert.match(was.style.background, /^linear-gradient\(to right, rgb\(/);
  assert.deepEqual(was.animations[0].frames.map((f) => f.opacity), [1, 0]);
  assert.equal(was.animations[0].o.duration, D_SURFACE);
  const move = bar.animations[0];
  assert.deepEqual(move.o.duration, D_SURFACE);
  assert.equal(move.o.easing, EASE_MOVE);
  assert.match(move.frames[0].translate, /^-?[\d.]+px 0px$/, 'the ends glide to their new places');
  // The numbers: item i slides to item i; the changed text crossfades; the surplus old leaves where it stood
  const nums = el.querySelectorAll('.lg-num');
  assert.deepEqual(nums.map((n) => n.animations.length), [1, 1, 1]);
  const ten = nums[1].animations[0];
  assert.equal(ten.frames[0].opacity, 0, '10 becomes 0.5: it fades in as it slides');
  assert.equal(ten.frames[0].translate, '-14px 0px', 'from where the 10 stood (176) to where the 0.5 stands (190): 14 px to the left of its place');
  const gNums = ghost.querySelectorAll('.lg-num');
  assert.equal(gNums.length, 3, 'the 0 stays one number (it reads the same: only the new one slides); the three that change or leave are ghosted');
  assert.ok(gNums.every((n) => n.animations.length === 1));
  // Both keys' titles
  assert.deepEqual(el.children[0].animations.map((a) => a.frames[0].opacity), [0], 'the new title fades in');
  assert.deepEqual(ghost.children[0].animations.map((a) => a.frames[1].opacity), [0], 'and the old one out');
  M.morphKey(el, build(BLUE_RED, [[0, '0']], [], 100, 120, 'Pressure'), { instant: true });   // (finishes the move)
  assert.equal(btn.children.length, 1, 'the ghost is gone');
});

test('a switch before the last has landed: the bar carries its colour on from where it had got to', () => {
  const { btn, el } = legend(BLUE_RED, [[0, '0'], [168, '30']]);
  M.morphKey(el, build(GREY_GREEN, [[0, '0'], [168, '5']], [], 100, 120));
  const mid = el.querySelector('.lg-bar');
  mid.children.find((c) => String(c.className).includes('lg-bar-was')).style.opacity = '0.6';   // (what getComputedStyle would read part way)
  M.morphKey(el, build(BLUE_RED, [[0, '0'], [168, '30']], [], 100, 120));
  assert.equal(btn.children.filter((c) => c !== el).length, 1, 'one ghost, the first finished');
  const bar = el.querySelector('.lg-bar');
  const was = bar.children.find((c) => String(c.className).includes('lg-bar-was'));
  assert.ok(was, 'the new switch fades out from the colour the last had reached');
  assert.match(was.style.background, /^linear-gradient\(to right, rgb\(/);
  M.morphKey(el, build(BLUE_RED, [], [], 100, 120), { instant: true });
  assert.equal(btn.children.length, 1);
});

test('a key with no bar on either side crossfades whole; the same key again, or the first one, is put in at once', () => {
  const { btn, el } = legend(BLUE_RED, [[0, '0']]);
  const cats = (txt) => { const c = new FakeNode('lg-cats', txt); c.rect = { left: 314, top: 24, width: 150, height: 20 }; return c; };
  M.morphKey(el, [cats('SMV')]);                                   // bar to categories
  assert.equal(btn.children.length, 2);
  assert.deepEqual(el.children[0].animations.map((a) => a.frames[0].opacity), [0]);
  assert.ok(!el.querySelector('.lg-bar'));
  M.morphKey(el, [cats('IMV')], { instant: true });                // the same key built again
  assert.equal(btn.children.length, 1, 'no ghost left');
  const fresh = new FakeNode('legend'); fresh.rect = { left: 0, top: 0, width: 10, height: 10 };
  const kid = cats('x'); M.morphKey(fresh, [kid]);
  assert.equal(fresh.children[0], kid, 'an empty key is just filled');
});

test('the lens name crossfades where it stood; a name that is the same does nothing', () => {
  const btn = new FakeNode('lens-btn'); btn.rect = { left: 300, top: 20, width: 300, height: 42 }; btn.clientLeft = 1; btn.clientTop = 1;
  const lab = new FakeNode('lens-name', 'Pressure'); lab.rect = { left: 320, top: 30, width: 60, height: 18 }; lab.attrs.id = 'colorModeLabel';
  btn.append(lab);
  M.crossfadeText(lab, 'Pressure');
  assert.equal(btn.children.length, 1);
  M.crossfadeText(lab, 'Congestion');
  const ghost = btn.children[1];
  assert.equal(lab.textContent, 'Congestion', 'the real label holds the new word at once (for readers)');
  assert.equal(ghost.textContent, 'Pressure');
  assert.equal(ghost.attrs.id, undefined);
  assert.equal(ghost.style.left, '19px');
  assert.deepEqual(ghost.animations[0].frames, [{ opacity: 1 }, { opacity: 0 }]);
  assert.deepEqual(lab.animations[0].frames, [{ opacity: 0 }, { opacity: 1 }]);
  assert.equal(lab.animations[0].o.duration, D_SURFACE);
  M.crossfadeText(lab, 'Flow volume', { instant: true });
  assert.equal(btn.children.length, 1, 'finished at once');
  assert.equal(lab.textContent, 'Flow volume');
});

test('a key or a name the bar does not draw (the phone hides the lens name) makes no ghost at the top left', () => {
  const btn = new FakeNode('lens-btn'); btn.rect = { left: 300, top: 20, width: 300, height: 42 };
  const lab = new FakeNode('lens-name', 'Flow direction'); lab.rect = { left: 0, top: 0, width: 0, height: 0 }; lab.hidden = true;   // (display: none: no rects)
  btn.append(lab);
  M.crossfadeText(lab, 'Congestion');
  assert.equal(lab.textContent, 'Congestion');
  assert.equal(btn.children.length, 1, 'no ghost');
  const zero = new FakeNode('lens-name', 'Flow direction'); zero.rect = { left: 0, top: 0, width: 0, height: 0 };   // (drawn, but no size)
  const btn2 = new FakeNode('lens-btn'); btn2.rect = { left: 300, top: 20, width: 300, height: 42 }; btn2.append(zero);
  M.crossfadeText(zero, 'Congestion');
  assert.equal(zero.textContent, 'Congestion');
  assert.equal(btn2.children.length, 1, 'no ghost from a box of no size');
  const key = new FakeNode('legend', ''); key.rect = { left: 0, top: 0, width: 0, height: 0 }; key.hidden = true; key.append(new FakeNode('lg-title', 'old'));
  const btn3 = new FakeNode('lens-btn'); btn3.append(key);
  M.morphKey(key, [new FakeNode('lg-title', 'new')]);
  assert.equal(btn3.children.length, 1, 'no ghost of a key that is not drawn');
  assert.equal(key.children[0].textContent, 'new');
});

test('hasBox, the guard every fade and ghost helper shares, asks that the element is drawn, not only in the page', () => {
  const util = readFileSync(new URL('../src/ui/util.js', import.meta.url), 'utf8');
  assert.match(util, /export const hasBox = \(el\) => el\.isConnected && !el\.closest\?\.\('\[hidden\]'\) && isDrawn\(el\);/);
});

test('Reduce Motion keeps the plain fade out and in: no ghost, no slide, no mixing', () => {
  reduced = true;
  try {
    const { btn, el } = legend(BLUE_RED, [[0, '0']]);
    M.morphKey(el, build(GREY_GREEN, [[0, '0']], [], 100, 120));
    assert.equal(btn.children.length, 1);
    assert.ok(!el.querySelector('.lg-bar')?.className.includes('morphing'));
  } finally { reduced = false; }
});

test('the sources: main.js hands the key and the name to legend-morph.js, the bars carry their ramp, and the stylesheet gives --lg-k its clock', () => {
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8'), css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(main, /import \{ morphKey, crossfadeText \} from '\.\/legend-morph\.js/);
  assert.match(main, /const LG_BAR_STYLE = \{ background: '' \}, LG_BAR = \{ class: 'lg-bar', style: LG_BAR_STYLE \};/);
  assert.match(main, /LG_BAR_STYLE\.background = grad;\s+const bar = h\('div', LG_BAR\);\s+bar\._ramp = grad;/);
  assert.doesNotMatch(css, /transition: --lg-k/, 'no ramp is mixed by an eased variable (a repaint every frame)');
  assert.match(css, /\.lg-bar-was \{[^}]*will-change: opacity;/, 'the old ramp fades by opacity on its own layer');
  assert.match(css, /\.lens-btn \{ position: relative;/, 'the ghost is placed in the button');
});
