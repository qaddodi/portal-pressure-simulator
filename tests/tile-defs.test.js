// One definition per reading (unification audit, finding 6; 13 Nov 2026): the bottom bar's tiles (dock.js TILES) take their unit, decimals and long
// description from table-marks.js TILE, which every deck and handout reads; the bar keeps only what it adds (its group, names, scale, words, "why").
// And one tile builder (tile-el.js) for the bar and Tests › Readouts.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { TILE } = await import('../src/ui/table-marks.js');
const { TILES } = await import('../src/ui/dock.js');

// (The bar's ids that name a TILE reading another way. The bar's varix is the wall stress, % of rupture, a reading of its own: TILE.varix is the diameter.)
const AS = { pvflow: 'pvFlow', ascites: 'asc' }, OWN = new Set(['varix']);

test('every bar tile is a TILE reading, with its unit, decimals and long description', () => {
  for (const t of TILES) {
    if (OWN.has(t.id)) continue;
    const T = TILE[AS[t.id] || t.id];
    assert.ok(T, `${t.id} is defined in TILE`);
    assert.equal(t.u, T.u, `${t.id} unit`);
    assert.equal(t.d, T.d ?? 1, `${t.id} decimals`);
    assert.ok(T.long && t.title === T.long, `${t.id}: the long description is TILE's`);
  }
  const own = TILES.find((t) => t.id === 'varix');
  assert.equal(own.u, '%');
  assert.notEqual(TILE.varix.u, own.u, 'the varix tile on the bar is the wall stress, not the diameter');
});

test('the long descriptions stay in the clinical register: no em dash, no ellipsis', () => {
  for (const [k, T] of Object.entries(TILE)) if (T.long) { assert.doesNotMatch(T.long, /—|…/, k); assert.ok(T.long.length > 20, k); }
});

test('the bar and Tests › Readouts build one tile: the same markup, the bar\'s with its short name, kept width and inert readouts', async () => {
  // (A few lines of a DOM, enough for h(): an element keeps its class, attributes, style and children; the tree is printed as markup.)
  const el = (tag) => ({ nodeType: 1, tag, className: '', attrs: {}, style: { setProperty(k, v) { this[k] = v; } }, kids: [], title: '',
    setAttribute(k, v) { this.attrs[k] = String(v); }, append(c) { this.kids.push(c); }, addEventListener() {} });
  const print = (n) => (n.nodeType === 3 ? n.text : `<${n.tag}${n.className ? ` class="${n.className}"` : ''}${Object.entries(n.attrs).map(([k, v]) => ` ${k}="${v}"`).join('')}${n.style['--vr'] ? ` vr="${n.style['--vr']}"` : ''}${n.style.left ? ` left="${n.style.left}"` : ''}>${n.kids.map(print).join('')}</${n.tag}>`);
  const was = globalThis.document;
  globalThis.document = { ...was, createElement: el, createTextNode: (t) => ({ nodeType: 3, text: String(t) }) };
  try {
    const { tileEl } = await import('../src/ui/tile-el.js');
    const pv = TILES.find((x) => x.id === 'pv'), hv = TILES.find((x) => x.id === 'hvpg');
    const bar = tileEl(pv, { width: true }), pane = tileEl(pv, { names: false, type: 'button' }), inert = tileEl(hv, { inert: true, primary: true, unit: false, width: true });
    for (const x of [bar, pane, inert]) for (const k of ['el', 'val', 'tr', 'st', 'cmp', 'fill']) assert.ok(x[k], k);
    assert.equal(print(bar.el), '<button class="metric" data-id="pv"><span class="k"><span class="k-l">Portal pressure</span><span class="k-s">Portal P</span></span><span class="v"><span class="val" vr="round(up, calc(3ch + 0.26em), 1px)"></span><span class="unit">mmHg</span><span class="tr" aria-hidden="true"></span></span><span class="rb" aria-hidden="true"><i class="rb-fill"></i><i class="rb-tick" left="28.57142857142857%"></i><i class="rb-tick" left="42.857142857142854%"></i></span><span class="s"><span class="status"></span><span class="cmp"></span></span></button>');
    assert.equal(print(pane.el), '<button class="metric" data-id="pv" type="button"><span class="k">Portal pressure</span><span class="v"><span class="val"></span><span class="unit">mmHg</span><span class="tr" aria-hidden="true"></span></span><span class="rb" aria-hidden="true"><i class="rb-fill"></i><i class="rb-tick" left="28.57142857142857%"></i><i class="rb-tick" left="42.857142857142854%"></i></span><span class="s"><span class="status"></span><span class="cmp"></span></span></button>');
    assert.match(print(inert.el), /^<div class="metric inert primary" data-id="hvpg" role="group"><span class="k">HVPG<\/span><span class="v"><span class="val" vr="[^"]+"><\/span><span class="tr"/);
    assert.equal(bar.el.title, `${pv.title}\nClick for what is driving it.`);
    assert.equal(inert.el.title, hv.title, 'a readout-only tile does not ask to be clicked');
  } finally { globalThis.document = was; }
});
