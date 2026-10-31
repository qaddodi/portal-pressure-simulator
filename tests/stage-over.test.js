import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The figure's overlays on the GPU (31 Oct, recs A1; ?stageover=gpu, off by default): the lowest run of #stageOver's groups the organs'
// painter can read is painted in the vessel canvas over the picture; the first group it cannot read, and every group above it,
// stays in the SVG, so the order is always the page's.

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const { overUnits, overRun, needsReread, OVER_CLASS } = await import('../src/ui/stage-over.js');
const { strictRefused, readGroup } = await import('../src/ui/organ-paint.js');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the units: the overlays\' world group\'s children, the overlays\' own group taken as its children, in order', () => {
  const gOver = { children: ['caud', 'stents', 'cath'] };
  assert.deepEqual(overUnits({ children: ['focus', 'abd', gOver, 'selO', 'halo', 'nodes', 'guides'] }, gOver),
    ['focus', 'abd', 'caud', 'stents', 'cath', 'selO', 'halo', 'nodes', 'guides']);
});

test('the run: from the bottom up to the first group that cannot be read; hidden groups do not stop it', () => {
  const R = { a: 'A', b: 'hidden', c: 'C', d: null, e: 'E' };
  assert.deepEqual(overRun(['a', 'b', 'c', 'd', 'e'], (u) => R[u]), [['a', 'A'], ['c', 'C']]);
  assert.deepEqual(overRun(['d', 'a'], (u) => R[u]), [], 'the lowest one unread: none on the GPU');
  assert.deepEqual(overRun(['b', 'b'], (u) => R[u]), []);
  assert.deepEqual(overRun(['a', 'c', 'e'], (u) => R[u]).map(([u]) => u), ['a', 'c', 'e']);
  // Every order of three readable, hidden and unreadable groups: a group is painted only if every shown group below it is.
  const kinds = ['A', 'hidden', null];
  for (const x of kinds) for (const y of kinds) for (const z of kinds) {
    const r = overRun([0, 1, 2], (u) => [x, y, z][u]).map(([u]) => u);
    const want = [];
    for (const [i, k] of [x, y, z].entries()) { if (k === null) break; if (k !== 'hidden') want.push(i); }
    assert.deepEqual(r, want);
  }
});

test('a new reading only for what the painter does not read at each paint, and never for the hiding class alone', () => {
  const el = (cls) => ({ getAttribute: () => cls });
  for (const a of ['d', 'transform', 'opacity', 'fill-opacity', 'stroke-opacity']) assert.equal(needsReread({ type: 'attributes', attributeName: a, target: el('') }), false, a);
  for (const a of ['fill', 'stroke', 'style', 'mask', 'stroke-width', 'r', 'cx']) assert.equal(needsReread({ type: 'attributes', attributeName: a, target: el('') }), true, a);
  assert.equal(needsReread({ type: 'childList' }), true);
  assert.equal(needsReread({ type: 'characterData' }), true);
  assert.equal(needsReread({ type: 'attributes', attributeName: 'class', oldValue: 'cath', target: el(`cath ${OVER_CLASS}`) }), false);
  assert.equal(needsReread({ type: 'attributes', attributeName: 'class', oldValue: `on ${OVER_CLASS}`, target: el('on') }), false);
  assert.equal(needsReread({ type: 'attributes', attributeName: 'class', oldValue: 'caud', target: el('caud on') }), true);
});

// A stand-in element with the transform attribute's matrix (matOf reads transform.baseVal).
const elWith = (m) => ({ transform: { baseVal: m ? { numberOfItems: 1, consolidate: () => ({ matrix: { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] } }) } : { numberOfItems: 0 } } });
const cs0 = { animationName: 'none', translate: 'none', rotate: 'none', scale: 'none', transform: 'none', vectorEffect: 'none', markerStart: 'none', markerMid: 'none', markerEnd: 'none', paintOrder: 'normal', shapeRendering: 'auto' };

test('a strict reading refuses what the painter would paint otherwise than the browser', () => {
  assert.equal(strictRefused(elWith(null), cs0), '');
  assert.equal(strictRefused(elWith(null), { ...cs0, animationName: 'haloRing' }), 'animation');
  for (const k of ['translate', 'rotate', 'scale']) assert.equal(strictRefused(elWith(null), { ...cs0, [k]: '2' }), k);
  // The transform attribute, as the page computes it: the same matrix is read; a CSS transform (no attribute, or another matrix) is not.
  assert.equal(strictRefused(elWith([1, 0, 0, 1, 10, 20]), { ...cs0, transform: 'matrix(1, 0, 0, 1, 10, 20)' }), '');
  assert.equal(strictRefused(elWith([2, 0, 0, 2, 0, 0]), { ...cs0, transform: 'matrix(2, 0, 0, 2, 0, 0)' }), '');
  assert.equal(strictRefused(elWith(null), { ...cs0, transform: 'matrix(1.1, 0, 0, 1.1, 0, 0)' }), 'transform');
  assert.equal(strictRefused(elWith([1, 0, 0, 1, 10, 20]), { ...cs0, transform: 'matrix(1, 0, 0, 1, 10, 21)' }), 'transform');
  assert.equal(strictRefused(elWith([1, 0, 0, 1, 10, 20]), { ...cs0, transform: 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 0, 1)' }), 'transform');
  assert.equal(strictRefused(elWith([1, 0, 0, 1, 10, 20]), cs0), 'transform', 'an attribute the page does not report: not trusted');
  assert.equal(strictRefused(elWith(null), { ...cs0, vectorEffect: 'non-scaling-stroke' }), 'vector-effect');
  for (const k of ['markerStart', 'markerMid', 'markerEnd']) assert.equal(strictRefused(elWith(null), { ...cs0, [k]: 'url("#arrow")' }), 'marker');
  assert.equal(strictRefused(elWith(null), { ...cs0, paintOrder: 'stroke' }), 'paint-order');
  assert.equal(strictRefused(elWith(null), { ...cs0, shapeRendering: 'crispEdges' }), 'shape-rendering');
  assert.equal(strictRefused(elWith(null), { ...cs0, shapeRendering: 'geometricPrecision' }), '');
});

// A stand-in SVG tree for readGroup: elements with their computed styles.
function tree(spec) {
  const styles = new Map();
  const mk = (name, attrs = {}, cs = {}, kids = []) => {
    const el = {
      localName: name, children: kids, style: {}, nodeType: 1,
      getAttribute: (a) => (a in attrs ? attrs[a] : null),
      transform: { baseVal: { numberOfItems: 0 } },
    };
    styles.set(el, { ...cs0, display: 'inline', visibility: 'visible', opacity: '1', fill: 'rgb(255, 0, 0)', stroke: 'none', fillOpacity: '1', strokeOpacity: '1', strokeWidth: '1', strokeLinecap: 'butt', strokeLinejoin: 'miter', strokeDasharray: 'none', fillRule: 'nonzero', filter: 'none', mixBlendMode: 'normal', mask: 'none', clipPath: 'none', ...cs });
    return el;
  };
  const root = spec(mk);
  const doc = { getElementById: () => null };
  const walk = (e) => { e.ownerDocument = doc; e.children.forEach(walk); };
  walk(root);
  return { root, cs: (el) => styles.get(el) };
}

test('a strict reading takes visibility as the page computes it, and refuses a mitred outline with corners', () => {
  const was = globalThis.getComputedStyle;
  try {
    const t = tree((mk) => mk('g', {}, {}, [
      mk('path', { d: 'M0 0 C 1 1 2 2 3 3' }, {}),
      mk('path', { d: 'M0 0 C 1 1 2 2 3 3' }, { visibility: 'hidden' }),   // (hidden by a class: the old reading took only its own setting)
    ]));
    globalThis.getComputedStyle = t.cs;
    assert.equal(readGroup(t.root, { strict: true }).ops.length, 1);
    assert.equal(readGroup(t.root).ops.length, 2, 'not strict: as before');
    const z = tree((mk) => mk('g', {}, {}, [mk('path', { d: 'M0 0 L 5 5 L 10 0' }, { stroke: 'rgb(0, 0, 0)', fill: 'none' })]));
    globalThis.getComputedStyle = z.cs;
    assert.equal(readGroup(z.root, { strict: true }), null, 'mitred corners: stays in the SVG');
    assert.ok(readGroup(z.root), 'not strict: as before');
    const r = tree((mk) => mk('g', {}, {}, [mk('path', { d: 'M0 0 L 5 5 L 10 0' }, { stroke: 'rgb(0, 0, 0)', fill: 'none', strokeLinejoin: 'round' })]));
    globalThis.getComputedStyle = r.cs;
    assert.equal(readGroup(r.root, { strict: true }).ops.length, 1, 'round joins: as the painter draws them');
    const c = tree((mk) => mk('g', {}, {}, [mk('path', { d: 'M0 0 C 1 1 2 2 3 3' }, { stroke: 'rgb(0, 0, 0)', fill: 'none' })]));
    globalThis.getComputedStyle = c.cs;
    assert.equal(readGroup(c.root, { strict: true }).ops.length, 1, 'a curve with no corner: its joins never show');
    const a = tree((mk) => mk('g', {}, {}, [mk('circle', { r: '3' }, { animationName: 'haloRing' })]));
    globalThis.getComputedStyle = a.cs;
    assert.equal(readGroup(a.root, { strict: true }), null);
  } finally { globalThis.getComputedStyle = was; }
});

test('the stage: off unless asked for; the painted groups\' SVG hidden by an empty clip; read again on a change, and while a CSS ease runs', () => {
  const st = read('../src/ui/stage.js'), css = read('../styles/app.css');
  assert.match(st, /const OVER_GPU = typeof location !== 'undefined' && \/\[\?&\]stageover=gpu\\b\/\.test\(location\.search\);/);
  assert.match(st, /const OVER_ON = OVER_GPU && !!veins\?\.overlay;/);
  assert.match(css, /\.stage-view svg#stageOver \.gpu-over \{ clip-path: inset\(50%\) !important; \}/);
  assert.match(st, /const spec = readGroup\(u, \{ nest: true, strict: true \}\);/);
  assert.match(st, /if \(easing\.some\(\(el\) => u\.contains\(el\)\)\) return null;/);
  assert.match(st, /svgOver\.addEventListener\('transitionrun', ran\);\n\s+svgOver\.addEventListener\('transitionend', ended\);\n\s+svgOver\.addEventListener\('transitioncancel', ended\);/);
  assert.match(st, /watch\.observe\(svgOver, \{ subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true \}\);/);
  // (Each painted group's frame as it is at each paint, under the overlays' own group where it is one of its children.)
  assert.match(st, /groups\.set\(n, \[\{ spec, get m\(\) \{ const own = matOfEl\(u\); return up \? mul\(matOfEl\(up\), own\) : own; \} \}\]\);/);
  assert.match(st, /for \(const u of overPainted\) if \(!now2\.has\(u\)\) u\.classList\.remove\(OVER_CLASS\);\n\s+for \(const u of now2\) u\.classList\.add\(OVER_CLASS\);/);
  // (Read each frame before the figure decides to sleep, and laid again alone when only they changed.)
  assert.match(st, /syncOver\(\);\n\s+\/\/ [^\n]*\n\s+if \(OVER_ON && veins\?\.overlay\?\.stale && !veins\.lost\) veins\.present\(\);\n\s+const rowsWait/);
});
