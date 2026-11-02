// The gliding selection (sprint 1 Nov, brief 1): src/ui/seg-glide.js measures the chosen button of every .seg, .instr-tabs and
// .um-tabs and hands its box to the stylesheet, which draws ONE piece (the control's ::before) that travels between choices.
// Here: the measuring (against a small stand-in for the page), that a button's
// pressed / selected state is only ever read, and that the stylesheet keeps every piece rule behind .seg-glide, so without the class
// the CSS in effect is today's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// --- a stand-in for the page: elements with children, attributes, a box, a class list and style properties ---------------------
const made = [];
function el(name, { cls = [], attrs = {}, box = { left: 0, top: 0, width: 0, height: 0 }, hidden = false } = {}) {
  const e = {
    localName: name, nodeType: 1, hidden, children: [], parentElement: null, isConnected: true, _attrs: { ...attrs }, _cls: new Set(cls), _style: new Map(), _box: box, writes: [],
    classList: { add: (...c) => c.forEach((x) => e._cls.add(x)), remove: (...c) => c.forEach((x) => e._cls.delete(x)), contains: (c) => e._cls.has(c) },
    style: { setProperty: (k, v) => e._style.set(k, v), removeProperty: (k) => e._style.delete(k) },
    getAttribute: (k) => e._attrs[k] ?? null,
    setAttribute: (k, v) => { e.writes.push(k); e._attrs[k] = String(v); },
    matches: (s) => s.split(',').map((x) => x.trim()).some((x) => {
      const m = /^\[(aria-[a-z]+)="true"\]$/.exec(x);
      return m ? e._attrs[m[1]] === 'true' : x.startsWith('.') ? e._cls.has(x.slice(1)) : false;
    }),
    closest: (s) => { for (let n = e; n; n = n.parentElement) if (n.matches(s)) return n; return null; },
    getBoundingClientRect: () => ({ ...e._box, right: e._box.left + e._box.width, bottom: e._box.top + e._box.height }),
    querySelectorAll: () => [],
    _on: {}, addEventListener(t, f) { (e._on[t] ||= new Set()).add(f); }, removeEventListener(t, f) { e._on[t]?.delete(f); },
    offsetWidth: box.width, clientLeft: 0, clientTop: 0,
  };
  made.push(e);
  return e;
}
const control = (cls, picks, widths = [60, 60, 60]) => {
  const ctl = el('div', { cls: [cls], box: { left: 100, top: 20, width: widths.reduce((a, b) => a + b, 0) + 4, height: 30 } });
  let x = 102;
  widths.forEach((w, i) => {
    const b = el('button', { attrs: { 'aria-pressed': String(i === picks) }, box: { left: 100 + (x - 100), top: 22, width: w, height: 26 } });
    b.parentElement = ctl; ctl.children.push(b); x += w;
  });
  return ctl;
};

let observer = null, reduced = false;
globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; observer = this; } observe() {} disconnect() {} takeRecords() { return []; } };
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.matchMedia = () => ({ get matches() { return reduced; } });
globalThis.getComputedStyle = () => ({ left: '0px' });
globalThis.performance ??= { now: () => Date.now() };
const root = (kids) => ({ nodeType: 1, matches: () => false, querySelectorAll: () => kids });
const G = await import('../src/ui/seg-glide.js');
const rest = () => new Promise((r) => setTimeout(r, 5));   // (the observers place the piece in a rest pass, between frames)

test('on: the chosen button\'s box is put on the control, in the control\'s own pixels, and the class turns the piece on', () => {
  const ctl = control('seg', 1, [50, 70, 60]);
  const h = G.startSegGlide(root([ctl]));
  assert.ok(h, 'started');
  assert.ok(ctl._cls.has('seg-glide'));
  assert.equal(ctl._style.get('--gx'), '52px', 'left of the second button, from the control\'s padding edge (2 px in)');
  assert.equal(ctl._style.get('--gy'), '2px');
  assert.equal(ctl._style.get('--gw'), '70px');
  assert.equal(ctl._style.get('--gh'), '26px');
  assert.ok(!ctl._cls.has('glide-still'), 'the still step is only held for a moment');
  h.stop();
  assert.ok(!ctl._cls.has('seg-glide'), 'stop() gives the control back');
});

test('a change of choice moves the piece to the new button; a press on the chosen one does nothing', async () => {
  const ctl = control('seg', 0, [50, 70, 60]);
  const h = G.startSegGlide(root([ctl]));
  assert.equal(ctl._style.get('--gx'), '2px');
  const [a, b] = ctl.children;
  // a press on the chosen button: the app sets the same state again
  a._attrs['aria-pressed'] = 'true';
  observer.cb([{ type: 'attributes', target: a, attributeName: 'aria-pressed' }]); await rest();
  assert.equal(ctl._style.get('--gx'), '2px', 'unchanged');
  // the choice moves
  a._attrs['aria-pressed'] = 'false'; b._attrs['aria-pressed'] = 'true';
  const classes = [];
  const add = ctl.classList.add; ctl.classList.add = (...c) => { classes.push(...c); add(...c); };
  observer.cb([{ type: 'attributes', target: a, attributeName: 'aria-pressed' }, { type: 'attributes', target: b, attributeName: 'aria-pressed' }]); await rest();
  assert.equal(ctl._style.get('--gx'), '52px');
  assert.equal(ctl._style.get('--gw'), '70px');
  assert.ok(ctl._cls.has('glide-gpu') && !ctl._cls.has('glide-still'), 'the move ends on the compositor rule with its transition on');
  h.stop();
});

test('the selected button keeps its aria state: the file only reads it', async () => {
  const ctl = control('instr-tabs', 2);
  const h = G.startSegGlide(root([ctl]));
  const [a, b, c] = ctl.children;
  a._attrs['aria-pressed'] = 'false'; c._attrs['aria-pressed'] = 'false'; b._attrs['aria-pressed'] = 'true';
  observer.cb([{ type: 'attributes', target: b, attributeName: 'aria-pressed' }]); await rest();
  for (const x of ctl.children) assert.deepEqual(x.writes, [], 'no attribute written on a button');
  assert.equal(b.getAttribute('aria-pressed'), 'true');
  h.stop();
});

test('a control with no choice, or two, keeps today\'s look (no class)', () => {
  const none = control('seg', -1), two = control('seg', 0);
  two.children[1]._attrs['aria-pressed'] = 'true';
  const h = G.startSegGlide(root([none, two]));
  assert.ok(!none._cls.has('seg-glide'));
  assert.ok(!two._cls.has('seg-glide'));
  h.stop();
});

test('Reduce Motion: the piece is faded out first (--go 0), not travelled', async () => {
  reduced = true;
  try {
    const ctl = control('seg', 0);
    const h = G.startSegGlide(root([ctl]));
    const [a, b] = ctl.children;
    a._attrs['aria-pressed'] = 'false'; b._attrs['aria-pressed'] = 'true';
    observer.cb([{ type: 'attributes', target: b, attributeName: 'aria-pressed' }]); await rest();
    assert.equal(ctl._style.get('--go'), '0');
    assert.equal(ctl._style.get('--gx'), '2px', 'still at the old place while it fades');
    // (No timer: the piece is placed when its fade-out transition ends.)
    for (const f of [...ctl._on.transitionend]) f({ target: ctl, pseudoElement: '::before', propertyName: 'opacity' });
    await Promise.resolve();
    assert.equal(ctl._style.get('--go'), '1', 'faded back in once placed');
    assert.equal(ctl._style.get('--gx'), '62px', 'placed at the new button');
    h.stop();
  } finally { reduced = false; }
});

test('the stylesheet: every piece rule sits behind .seg-glide, the chosen button\'s own fill is only turned off under it, and high contrast keeps Highlight', () => {
  const css = read('styles/app.css');
  const pieces = css.match(/[^{}\n]*::before\s*\{[^}]*var\(--gx\)[^}]*\}/g) || [];
  assert.ok(pieces.length >= 4, 'the piece is drawn for segments, tabs, the menu\'s underline and the desktop underline');
  for (const p of pieces) assert.match(p, /\.seg-glide/, `a piece rule without the class: ${p.slice(0, 80)}`);
  assert.match(css, /@media \(forced-colors: none\) \{\s*\.seg\.seg-glide button\[aria-pressed="true"\]/);
  assert.match(css, /@media \(forced-colors\) \{ \.seg-glide::before \{ display: none; \} \}/);
  assert.match(css, /\.seg-glide\.glide-still::before \{ transition: none; \}/);
  // the originals are untouched: the plain selected rules still carry their fill
  assert.match(css, /\.seg button\[aria-pressed="true"\], \.seg button\[aria-selected="true"\] \{ background: var\(--surface\); color: var\(--text\); box-shadow: var\(--shadow-1\); \}/);
  assert.match(css, /\.instr-tab\[aria-selected="true"\] \{ background: var\(--surface\); color: var\(--text\); box-shadow: 0 1px 2px/);
  assert.match(css, /\.um-tab\[aria-selected="true"\]::after \{ opacity: 1; transform: none; \}/);
});

test('the view pill: a glide whose row moved in its centred home (Sinusoid to Lobule) starts where the piece was drawn on the screen, not a tab or two off', async () => {
  const ctl = control('seg', 1, [60, 60, 60]);
  const home = el('div', { cls: ['nb-views'], box: { left: 0, top: 10, width: 384, height: 42 } });
  ctl.parentElement = home; home.children.push(ctl);
  const saved = globalThis.getComputedStyle;
  const h = G.startSegGlide(root([ctl]), '');
  const px = (k, d) => ctl._style.get(k) ?? d;
  globalThis.getComputedStyle = (e, pseudo) => pseudo !== '::before' ? { left: '0px' } : ({ left: '0px', top: '0px', get width() { return px('--gw', '0px'); }, get height() { return px('--gh', '0px'); },
    get translate() { return `${px('--gx', '0px')} ${px('--gy', '0px')}`; }, get scale() { return `${px('--gsx', '1')} ${px('--gsy', '1')}`; } });
  const seen = [];
  const set = ctl.style.setProperty; ctl.style.setProperty = (k, v) => { seen.push([k, v, ctl._cls.has('glide-still')]); set(k, v); };
  try {
    assert.equal(ctl._style.get('--gx'), '62px', 'on the second button (drawn at 162 px on the screen)');
    // The row lays out 60 px further left in the same home (it grew about its centre), and the third button, now chosen, sits where the second was.
    ctl._box = { ...ctl._box, left: 40 };
    for (const b of ctl.children) b._box = { ...b._box, left: b._box.left - 60 };
    const [, b, c] = ctl.children;
    b._attrs['aria-pressed'] = 'false'; c._attrs['aria-pressed'] = 'true';
    observer.cb([{ type: 'attributes', target: c, attributeName: 'aria-pressed' }]);
    h.now(ctl);
    const still = seen.filter((x) => x[2]), moving = seen.filter((x) => !x[2]);
    assert.equal(still.filter((x) => x[0] === '--gx').at(-1)?.[1], '122px', 'starts at 162 px on the screen, in the moved row\'s own px');
    assert.equal(moving.filter((x) => x[0] === '--gx').at(-1)?.[1], '122px', 'and ends on the new button: no detour');
    seen.length = 0; await rest();
    assert.equal(seen.length, 0, 'placed in the caller\'s task: the rest pass after finds nothing to do');
  } finally { globalThis.getComputedStyle = saved; ctl.style.setProperty = set; h.stop(); }
});

test('main.js loads the file once', () => {
  assert.equal((read('src/ui/main.js').match(/import (?:\{ glideNow \} from )?'\.\/seg-glide\.js/g) || []).length, 1);
});

test('on the compositor (the default): a change of choice sets the new size at once, starts the piece where it was drawn by its translate and scale, then lets both glide to the new box', async () => {
  const ctl = control('seg', 0, [50, 70, 60]);
  const saved = globalThis.getComputedStyle;
  const h = G.startSegGlide(root([ctl]));
  assert.ok(ctl._cls.has('glide-gpu'), 'the compositor rules are on');
  // The piece as the stylesheet draws it: left/top 0, its size the variables', its translate and scale the variables' too.
  const px = (k, d) => ctl._style.get(k) ?? d;
  globalThis.getComputedStyle = (e, pseudo) => pseudo !== '::before' ? { left: '0px' } : ({ left: '0px', top: '0px', get width() { return px('--gw', '0px'); }, get height() { return px('--gh', '0px'); },
    get translate() { return `${px('--gx', '0px')} ${px('--gy', '0px')}`; }, get scale() { return `${px('--gsx', '1')} ${px('--gsy', '1')}`; } });
  const seen = [];
  const set = ctl.style.setProperty; ctl.style.setProperty = (k, v) => { seen.push([k, v, ctl._cls.has('glide-still')]); set(k, v); };
  try {
    const [a, b] = ctl.children;
    a._attrs['aria-pressed'] = 'false'; b._attrs['aria-pressed'] = 'true';
    observer.cb([{ type: 'attributes', target: b, attributeName: 'aria-pressed' }]); await rest();
    const still = seen.filter((x) => x[2]), moving = seen.filter((x) => !x[2]);
    const lastStill = (k) => still.filter((x) => x[0] === k).at(-1)?.[1];
    assert.equal(lastStill('--gw'), '70px', 'the new size, at once');
    assert.equal(lastStill('--gx'), '2px', 'drawn where it was (its old left)');
    assert.equal(Number(lastStill('--gsx')), 50 / 70, 'at its old width, by its scale');
    assert.deepEqual(Object.fromEntries(moving.map((x) => [x[0], x[1]])), { '--gx': '52px', '--gy': '2px', '--gsx': '1', '--gsy': '1' }, 'then translate and scale glide to the new box');
    assert.ok(!ctl._cls.has('glide-still'), 'the transition is on for the glide');
  } finally { globalThis.getComputedStyle = saved; ctl.style.setProperty = set; h.stop(); }
  assert.ok(!ctl._cls.has('glide-gpu'), 'stop() gives the control back');
});
