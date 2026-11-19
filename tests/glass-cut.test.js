// What the page paints over the figure (a narrowing's words, the overlays, the readings) is cut away under every card whose glass is drawn in
// the figure's canvas, so nothing shows sharp through a card: 17 Nov 2026, "The narrowed 6mm x2 cm label is seen through the tests card".
import test from 'node:test';
import assert from 'node:assert/strict';
import { cutCards, cutClip, createGlassCut, cardHolesOf, stageCutLayers, CUT_FROM } from '../src/ui/glass-cut.js';

const hole = (x, y, w, h, a = 1, rad = [12, 12, 12, 12]) => ({ x, y, w, h, a, rad, d: null });

test('a card at half its fade or more is cut; a fainter one is not', () => {
  assert.equal(cutCards([hole(0, 0, 100, 100, CUT_FROM - 0.01)]).length, 0);
  assert.equal(cutCards([hole(0, 0, 100, 100, CUT_FROM)]).length, 1);
  assert.equal(cutCards([hole(0, 0, 0, 100)]).length, 0);
});

test('overlapping cards become one cut (an even-odd clip would show their overlap again)', () => {
  const c = cutCards([hole(0, 0, 100, 100), hole(80, 50, 100, 100), hole(400, 0, 50, 50)]);
  assert.equal(c.length, 2);
  assert.deepEqual([c[0].x, c[0].y, c[0].w, c[0].h], [0, 0, 180, 150]);
});

test('the clip is the layer\'s frame less each card, in the layer\'s own px, through a page zoom', () => {
  assert.equal(cutClip([], 0, 0), '');
  const v = cutClip(cutCards([hole(110, 220, 50, 40, 1, [0, 0, 0, 0])]), 10, 20);
  assert.match(v, /^path\(evenodd, "M-9999 -9999H19999V19999H-9999ZM100 200H150V240H100V200Z"\)$/);
  // (a layer scaled by 2 about its corner: the card at client 110 is 50 px into the layer)
  const z = cutClip(cutCards([hole(110, 220, 50, 40, 1, [0, 0, 0, 0])]), 10, 20, { s: 2, dx: -10, dy: -20 });
  assert.match(z, /M50 100H75V120H50V100Z/);
});

test('the stage\'s card holes leave the callouts\' glass out, and each layer is written once per change', () => {
  const sets = new Map([[{}, [hole(0, 0, 10, 10)]], ['callouts', [hole(50, 50, 10, 10)]]]);
  assert.equal(cardHolesOf(sets).length, 1);
  const el = { style: { clipPath: '' } };
  let writes = 0;
  const st = el.style; Object.defineProperty(el, 'style', { value: new Proxy(st, { set(t, k, v) { if (k === 'clipPath') writes++; t[k] = v; return true; } }) });
  const cut = createGlassCut({ layers: () => [[el, 0, 0]] });
  cut.set([hole(0, 0, 10, 10)]); cut.set([hole(0, 0, 10, 10)]);
  assert.equal(writes, 1);
  assert.match(el.style.clipPath, /^path\(evenodd/);
  cut.set([]);
  assert.equal(el.style.clipPath, '');
});

test('every page layer over the figure\'s canvas is cut: the overlays, the labels\' SVG, the catheter\'s and the sites\' readings', () => {
  const els = { '#stageOver': 'over', '#labels': 'labels' };
  const wrap = { querySelector: (q) => els[q] };
  const L = stageCutLayers({ left: 5, top: 7, sx: 12, sy: 0 }, wrap, { labels: 'cath' }, { el: 'sites' });
  assert.deepEqual(L.map((l) => l[0]), ['over', 'labels', 'cath', 'sites']);
  assert.deepEqual(L[0].slice(1), [17, 7]);
});
