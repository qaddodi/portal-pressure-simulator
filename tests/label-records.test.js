// Labels as records (review L3): what label-gl.js draws a label's dot, leader and picture from is carried on the label's own record, not read
// back from the SVG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from '../scripts/warm/dom.mjs';

installPage();   // (the stage's modules read the page's globals as they load)
const { createLabelLayer } = await import('../src/ui/stage-label-layer.js');

// A label layer with only what paintLeaders touches: the pool of blocks, the layout's frame, no explained label.
function layerFor(keys) {
  const pool = new Map(), live = { laidFrame: 7 };
  for (const k of keys) pool.set(k, { g: null, seen: 7, pos: { want: 0 } });
  const noop = () => {};
  const L = createLabelLayer({ explain: {}, late: noop, dprDots: noop, nextFrame: noop, pool, setA: noop, updateLabels: noop }, live);
  return { L, pool, live };
}

test('a layout\'s dots and leaders are written on each label\'s record as want bits (1 dot, 2 halo, 4 leader)', () => {
  const { L, pool } = layerFor(['n:PV', 'n:SMV', 'r:1']);
  L.paintLeaders([
    { k: 'l:n:PV', tag: 'path', at: { class: 'leader', 'data-k': 'n:PV', d: 'M0 0 L9 9' } },
    { k: 'h:n:PV', tag: 'circle', at: { class: 'leader-dot-halo', 'data-k': 'n:PV', cx: 0, cy: 0, r: '4' } },
    { k: 'd:n:PV', tag: 'circle', at: { class: 'leader-dot', 'data-k': 'n:PV', cx: 0, cy: 0, r: '2.4' } },
    { k: 'd:n:SMV', tag: 'circle', at: { class: 'leader-dot', 'data-k': 'n:SMV', cx: 0, cy: 0, r: '2.4' } },
    { k: 'al:x', tag: 'path', at: { class: 'leader', d: 'M0 0 L1 1' } },   // (a leader of no label's: no bits)
  ]);
  assert.equal(pool.get('n:PV').pos.want, 7);
  assert.equal(pool.get('n:SMV').pos.want, 1);
  assert.equal(pool.get('r:1').pos.want, 0);
});

test('the next layout\'s bits replace the last; a label it did not lay keeps its own, so its dot and leader fade with it', () => {
  const { L, pool, live } = layerFor(['n:PV', 'n:SMV']);
  L.paintLeaders([{ k: 'l:n:PV', tag: 'path', at: { class: 'leader', 'data-k': 'n:PV', d: '' } }, { k: 'd:n:SMV', tag: 'circle', at: { class: 'leader-dot', 'data-k': 'n:SMV' } }]);
  live.laidFrame = 8; pool.get('n:PV').seen = 8;   // (n:SMV is not in this layout: it fades out)
  L.paintLeaders([{ k: 'd:n:PV', tag: 'circle', at: { class: 'leader-dot', 'data-k': 'n:PV' } }]);
  assert.equal(pool.get('n:PV').pos.want, 1, 'its leader dropped, its dot given');
  assert.equal(pool.get('n:SMV').pos.want, 1, 'kept as it was');
});

// Labels of one look: 30 pills of the same pieces and classes, each with its own words and width, read through a getComputedStyle that counts.
const { createLookStyles, describeBlock, lookKey } = await import('../src/ui/label-gl.js');
const NS = 'http://www.w3.org/2000/svg';
const STYLE = { display: 'inline', opacity: '1', filter: 'none', fill: 'rgb(20, 20, 20)', stroke: 'none', strokeWidth: '0px', paintOrder: 'normal', fontStyle: 'normal', fontWeight: '600', fontSize: '12px', fontFamily: 'Inter', letterSpacing: 'normal', fontVariantNumeric: 'normal', strokeLinejoin: 'round', outlineStyle: 'none', outlineWidth: '0px', outlineColor: '', outlineOffset: '0px' };
function pill(i, w, words) {
  const el = (tag) => document.createElementNS(NS, tag);
  const g = el('g'), r = el('rect'), t = el('text'), a = el('tspan'), b = el('tspan');
  g.setAttribute('class', 'lb'); g.setAttribute('data-key', `n:S${i}`);
  r.setAttribute('x', '-4'); r.setAttribute('y', '-2'); r.setAttribute('width', String(w)); r.setAttribute('height', '18'); r.setAttribute('rx', '6');
  t.setAttribute('x', String(w / 2)); t.setAttribute('y', '13'); t.setAttribute('text-anchor', 'middle');
  a.textContent = words[0]; b.textContent = words[1]; b.setAttribute('dx', '3');
  t.append(a, b); g.append(r, t);
  return g;
}
function counting(styleOf = () => STYLE) { const c = (el) => { c.n++; return styleOf(el); }; c.n = 0; return c; }

test('thirty labels of one look read the page\'s styles once, for the first; each is still described with its own words and width', () => {
  const ls = createLookStyles(), cs = counting(), plain = counting();
  const gs = Array.from({ length: 30 }, (_, i) => pill(i, 40 + i, [`  Station ${i} `, ` 1${i} `]));
  const ds = gs.map((g) => ls.describe(g, 1, cs, null));
  assert.equal(cs.n, 5, 'the first label\'s five elements, and no other');
  gs.forEach((g, i) => assert.deepEqual(ds[i], describeBlock(g, plain, null), `label ${i}: as read from the page`));
  assert.equal(ds[3].parts[1].runs[0].t, 'Station 3 ', 'spaces as the SVG sets them');
  assert.equal(ds[3].parts[0].w, 43);
});

test('two looks read twice; new words give a new picture and read nothing', () => {
  const ls = createLookStyles(), bold = { ...STYLE, fontWeight: '700' };
  const cs = counting((el) => (el.closest?.('[data-look="b"]') ? bold : STYLE));
  const gs = Array.from({ length: 30 }, (_, i) => { const g = pill(i, 50, ['PV', '12']); if (i % 2) g.setAttribute('data-look', 'b'); return g; });
  for (const g of gs) ls.describe(g, g.hasAttribute('data-look') ? 2 : 1, cs, null);
  assert.equal(cs.n, 10);
  const before = lookKey(ls.describe(gs[0], 1, cs, null), false, 2);
  gs[0].querySelector('tspan').textContent = 'SMV';
  const after = lookKey(ls.describe(gs[0], 1, cs, null), false, 2);
  assert.notEqual(after, before);
  assert.equal(cs.n, 10, 'no new read');
  assert.equal(ls.describe(gs[1], 2, cs, null).parts[1].runs[0].wt, 700);
});

test('a look read mid-ease is not kept: the next label of it reads the page again', () => {
  const ls = createLookStyles(), cs = counting();
  const spoilt = (el) => { ls.spoil(); return cs(el); };
  ls.describe(pill(0, 40, ['a', 'b']), 1, spoilt, null);
  assert.equal(ls.has(1), false);
  ls.describe(pill(1, 40, ['a', 'b']), 1, cs, null);
  assert.equal(ls.has(1), true);
  assert.equal(cs.n, 10);
});
