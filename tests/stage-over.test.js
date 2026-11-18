import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appCss } from './split-src.js';

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

const { overUnits, overRun, needsReread, netChanges, styleKey, OVER_CLASS, OVER_ALL } = await import('../src/ui/stage-over.js');
const { strictRefused, readGroup, cssLocal, elMat, liveOf } = await import('../src/ui/organ-paint.js');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the units: the overlays\' world group\'s children, the overlays\' own group taken as its children, in order', () => {
  const gOver = { children: ['caud', 'stents', 'cath'] };
  assert.deepEqual(overUnits({ children: ['focus', 'abd', gOver, 'selO', 'halo', 'nodes', 'guides'] }, gOver),
    ['focus', 'abd', 'caud', 'stents', 'cath', 'selO', 'halo', 'nodes', 'guides']);
});

test('the run: from the bottom up to the first group that cannot be read; hidden groups do not stop it', () => {
  const R = { a: 'A', b: 'hidden', c: 'C', d: null, e: 'E' };
  assert.deepEqual([...overRun(['a', 'b', 'c', 'd', 'e'], (u) => R[u])], [['a', 'A'], ['c', 'C']]);
  assert.equal(overRun(['a', 'b', 'c', 'd', 'e'], (u) => R[u]).whole, false, 'stopped: the SVG still shows some');
  assert.equal(overRun(['a', 'b', 'c', 'e'], (u) => R[u]).whole, true, 'everything shown painted');
  assert.equal(overRun(['b'], (u) => R[u]).whole, true, 'nothing shown');
  assert.deepEqual([...overRun(['d', 'a'], (u) => R[u])], [], 'the lowest one unread: none on the GPU');
  assert.deepEqual([...overRun(['b', 'b'], (u) => R[u])], []);
  assert.deepEqual(overRun(['a', 'c', 'e'], (u) => R[u]).map(([u]) => u), ['a', 'c', 'e']);
  // Every order of three readable, hidden and unreadable groups: a group is painted only if every shown group below it is.
  const kinds = ['A', 'hidden', null];
  for (const x of kinds) for (const y of kinds) for (const z of kinds) {
    const r = overRun([0, 1, 2], (u) => [x, y, z][u]).map(([u]) => u);
    const want = [];
    for (const [i, k] of [x, y, z].entries()) { if (k === null) break; if (k !== 'hidden') want.push(i); }
    assert.deepEqual(r, want);
    assert.equal(overRun([0, 1, 2], (u) => [x, y, z][u]).whole, ![x, y, z].includes(null));
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
  assert.equal(needsReread({ type: 'attributes', attributeName: 'class', oldValue: 'circuit', target: el(`circuit ${OVER_ALL}`) }), false);
});

test('a frame of the camera or of a change between the views asks for no new reading of the overlays', () => {
  // The root's view box moves on every such frame: no reading holds it. A nested svg's own view box is a group's frame.
  assert.equal(needsReread({ type: 'attributes', attributeName: 'viewBox', oldValue: '300.0 0.0 820.0 920.0', target: { ownerSVGElement: null, getAttribute: () => '300.0 0.0 820.1 920.0' } }), false);
  assert.equal(needsReread({ type: 'attributes', attributeName: 'viewBox', oldValue: '0 0 1 1', target: { ownerSVGElement: {}, getAttribute: () => '0 0 2 2' } }), true);
  const st = (old, now) => needsReread({ type: 'attributes', attributeName: 'style', oldValue: old, target: { getAttribute: () => now } });
  assert.equal(st('opacity: 0.99998;', 'opacity: 0.99984;'), false, 'a fade of the calipers: the painter reads the opacity at each paint');
  assert.equal(st('opacity: 0.5; fill-opacity: 1;', 'fill-opacity: 0.4; opacity: 0.2;'), false);
  assert.equal(st('', 'opacity: 0.5;'), true, 'an opacity set where there was none: the painter takes it from another place now');
  assert.equal(st('opacity: 0.5;', ''), true, 'and one taken off');
  assert.equal(st('opacity: 1; fill: red;', 'opacity: 0.5; fill: blue;'), true, 'anything else in the style is read again');
  assert.equal(st('--shade: 1.150;', '--shade: 1.149;'), true, 'a custom property a style rule reads');
  assert.equal(st('--halo-k: 1.150;', '--halo-k: 1.149;'), false, 'except the camera\'s three sizes on screen, which no painted group reads (the test below)');
  assert.equal(styleKey('Opacity : 1 ;stroke-width:2px;;'), 'opacity;stroke-width:2px');
});

test('a batch of changes that came to nothing (the marks\' data-gl taken off and put back) asks for no new reading', () => {
  const el = (attrs) => ({ getAttribute: (a) => (a in attrs ? attrs[a] : null) });
  const a = el({ 'data-gl': '', fill: 'red' }), b = el({ fill: 'blue' });
  const rec = (target, attributeName, oldValue) => ({ type: 'attributes', target, attributeName, oldValue });
  const kids = { type: 'childList' };
  const out = netChanges([rec(a, 'data-gl', ''), rec(a, 'data-gl', null), rec(a, 'fill', 'red'), rec(b, 'fill', 'red'), rec(b, 'fill', 'green'), kids]);
  assert.deepEqual(out.map((r) => [r.target === a ? 'a' : r.target === b ? 'b' : '-', r.attributeName, r.oldValue ?? null]), [['-', undefined, null], ['b', 'fill', 'red']]);
  const st = stageSource();
  assert.match(st, /const watch = new MutationObserver\(\(rs\) => \{\n\s+for \(const r of netChanges\(rs\)\) \{/);
});

// A stand-in element with the transform attribute's matrix (matOf reads transform.baseVal).
const elWith = (m) => ({ transform: { baseVal: m ? { numberOfItems: 1, getItem: () => ({ matrix: { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] } }) } : { numberOfItems: 0 } } });
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
  assert.equal(strictRefused(elWith(null), { ...cs0, vectorEffect: 'non-scaling-stroke' }), '', 'painted at its page px (organ-paint cssPx)');
  assert.equal(strictRefused(elWith(null), { ...cs0, vectorEffect: 'non-scaling-size' }), 'vector-effect');
  for (const k of ['markerStart', 'markerMid', 'markerEnd']) assert.equal(strictRefused(elWith(null), { ...cs0, [k]: 'url("#arrow")' }), 'marker');
  assert.equal(strictRefused(elWith(null), { ...cs0, paintOrder: 'stroke' }), 'paint-order');
  assert.equal(strictRefused(elWith(null), { ...cs0, shapeRendering: 'crispEdges' }), 'shape-rendering');
  assert.equal(strictRefused(elWith(null), { ...cs0, shapeRendering: 'geometricPrecision' }), '');
});

test('a CSS transform: not refused when asked, the other refusals still made; the browser\'s own frame undone by its parent\'s', () => {
  const scaled = { ...cs0, transform: 'matrix(1.2, 0, 0, 1.1, -4, -2)' };
  assert.equal(strictRefused(elWith(null), scaled), 'transform');
  assert.equal(strictRefused(elWith(null), scaled, { cssTransforms: true }), '');
  assert.equal(strictRefused(elWith(null), { ...cs0, scale: '1.2' }, { cssTransforms: true }), '');
  assert.equal(strictRefused(elWith(null), { ...scaled, markerEnd: 'url(#a)' }, { cssTransforms: true }), 'marker');
  assert.equal(strictRefused(elWith(null), { ...scaled, animationName: 'x' }, { cssTransforms: true }), 'animation');
  const ctm = (m) => () => ({ a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] });
  // The parent at 2x, moved; the element's own: a scale of 1.5 about (10, 20) = [1.5, 0, 0, 1.5, -5, -10].
  const P = [2, 0, 0, 2, 30, 40], own = [1.5, 0, 0, 1.5, -5, -10];
  const el = { getCTM: ctm([P[0] * own[0], 0, 0, P[3] * own[3], P[0] * own[4] + P[4], P[3] * own[5] + P[5]]), parentNode: { getCTM: ctm(P) } };
  cssLocal(el).forEach((v, i) => assert.ok(Math.abs(v - own[i]) < 1e-9, `${i}: ${v}`));
  assert.equal(cssLocal({ getCTM: () => null, parentNode: { getCTM: ctm(P) } }), null);
  assert.equal(cssLocal({ getCTM: ctm(P), parentNode: {} }), null);
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
    // (A lone straight piece has no join: the TIPS stent's ring across its mesh, which kept the stents and every overlay above them in the SVG,
    // drawn over the cards' glass. Mohammad, 11 Nov 2026: "Tips stent (or maybe others too) appears on top of cards and glass".)
    const one = tree((mk) => mk('g', {}, {}, [mk('path', { d: 'M12.0 3.5 L14.2 9.8' }, { stroke: 'rgb(0, 0, 0)', fill: 'none', strokeLinecap: 'round' }), mk('path', { d: 'M0-5L0 5 M3 0 L4 4' }, { stroke: 'rgb(0, 0, 0)', fill: 'none' })]));
    globalThis.getComputedStyle = one.cs;
    assert.equal(readGroup(one.root, { strict: true })?.ops.length, 2, 'single straight pieces: no corner to mitre');
    for (const d of ['M0 0 L1 1 Z', 'M0 0 L1 1 2 0', 'M0 0 H4 V4', 'M0 0 L1 1 C1 2 3 4 5 6']) {
      const m = tree((mk) => mk('g', {}, {}, [mk('path', { d }, { stroke: 'rgb(0, 0, 0)', fill: 'none' })]));
      globalThis.getComputedStyle = m.cs;
      assert.equal(readGroup(m.root, { strict: true }), null, `${d}: a corner, stays in the SVG`);
    }
    const c = tree((mk) => mk('g', {}, {}, [mk('path', { d: 'M0 0 C 1 1 2 2 3 3' }, { stroke: 'rgb(0, 0, 0)', fill: 'none' })]));
    globalThis.getComputedStyle = c.cs;
    assert.equal(readGroup(c.root, { strict: true }).ops.length, 1, 'a curve with no corner: its joins never show');
    // A CSS scale (the caudate's growth): painted in the frame the browser lays, read with the group and kept; none known: refused.
    const sc = tree((mk) => mk('g', {}, {}, [mk('g', {}, { transform: 'matrix(1.5, 0, 0, 1.5, -5, -10)' }, [mk('circle', { r: '3' }, {})])]));
    const g1 = sc.root.children[0];
    globalThis.getComputedStyle = sc.cs;
    assert.equal(readGroup(sc.root, { strict: true }), null, 'no frames from the browser: stays in the SVG');
    g1.getCTM = () => ({ a: 1.5, b: 0, c: 0, d: 1.5, e: -5, f: -10 });
    g1.parentNode = { getCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) };
    const rs = readGroup(sc.root, { strict: true });
    assert.deepEqual(rs.ops[0].m, [1.5, 0, 0, 1.5, -5, -10]);
    assert.deepEqual(liveOf(rs.ops[0]).m, [1.5, 0, 0, 1.5, -5, -10], 'and at each paint');
    assert.deepEqual(elMat(g1), [1.5, 0, 0, 1.5, -5, -10]);
    sc.cs(g1).transform = 'none';
    readGroup(sc.root, { strict: true });
    assert.deepEqual(elMat(g1), [1, 0, 0, 1, 0, 0], 'the CSS transform gone: its frame forgotten at the next reading');
    // A non-scaling stroke (a slide's calipers): marked so, strictly only.
    const n = tree((mk) => mk('g', {}, {}, [mk('path', { d: 'M0 0 C 1 1 2 2 3 3' }, { stroke: 'rgb(0, 0, 0)', fill: 'none', vectorEffect: 'non-scaling-stroke' })]));
    globalThis.getComputedStyle = n.cs;
    assert.equal(readGroup(n.root, { strict: true }).ops[0].nss, true);
    assert.equal(readGroup(n.root).ops[0].nss, undefined);
    const a = tree((mk) => mk('g', {}, {}, [mk('circle', { r: '3' }, { animationName: 'haloRing' })]));
    globalThis.getComputedStyle = a.cs;
    assert.equal(readGroup(a.root, { strict: true }), null);
  } finally { globalThis.getComputedStyle = was; }
});

test('the stage: off unless asked for; the painted groups\' SVG hidden by an empty clip; read again on a change, and while a CSS ease runs', () => {
  const st = stageSource(), css = appCss();
  assert.match(st, /const OVER_ASK = typeof location !== 'undefined' && \/\[\?&\]stageover=gpu\\b\/\.test\(location\.search\);/);
  assert.doesNotMatch(st, /OVER_GPU|stageover=svg/);
  assert.match(st, /let OVER_ON = !!(?:live\.)?veins\?\.overlay && \(!(?:live\.)?SOFTWARE \|\| OVER_ASK\);/);
  assert.match(css, /\.stage-view svg#stageOver \.gpu-over \{ clip-path: inset\(50%\) !important; \}/);
  // (All they show painted: the overlays' SVG composited at nothing; with no picture to paint in, every copy shown again.)
  assert.match(css, /\.stage-view svg#stageOver\.gpu-all \{ opacity: 0 !important; \}/);
  assert.match(st, /svgOver\.classList\.toggle\(OVER_ALL, run\.whole\);/);
  // (A non-scaling stroke's px: the canvas's own over its box's, given to the painter before each change check and paint.)
  assert.match(st, /(?:live\.)?veins\.overlay\.cssPx = (?:live\.)?boxW > 0 \? vCanvas\.width \/ (?:live\.)?boxW : 1;/);
  const vg = read('../src/ui/veins-gl.js');
  assert.match(vg, /stack\.painter\.cssPx = overCss \* PW\(\) \/ canvas\.width;\n\s+return over\.stale\(overView\(\), PW\(\), PH\(\)\);/);
  assert.match(vg, /const om = overSnap \? whole\(overM, WO\) : overM;[\s\S]*?for \(let i = 0; i < 6; i\+\+\) OV_M\[i\] = om\[i\];/);
  assert.match(vg, /stack\.painter\.cssPx = overCss \* PW\(\) \/ canvas\.width;\n\s+if \(over\.stale\(m, PW\(\), PH\(\)\)\) over\.render/);
  // (Below Full the canvas is moved by the vessels' sub-pixel rest: the overlays go at whole pixels with the vessels, in the check and the paint.)
  assert.match(st, /if \((?:live\.)?(?:live\.)?veins\?\.overlay\) (?:live\.)?(?:live\.)?veins\.overlay\.snap = !!(?:live\.)?(?:live\.)?picNow \|\| (?:live\.)?(?:live\.)?vdpr < (?:live\.)?(?:live\.)?vBase - 1e-9;/);
  assert.equal((vg.match(/overSnap \? whole\(overM, WO\) : overM/g) || []).length, 1, 'one view for the check and the paint');
  assert.equal((vg.match(/overView\(\)/g) || []).length, 3);
  assert.match(vg, /set snap\(v\) \{ overSnap = !!v; \}/);
  // (Read again when a class outside the overlays changes how they show: the app's, the page's, the stage's.)
  // (A version stepped when a part differs from the last ask's: the app's classes without a gesture's own, the page's, the stage's,
  // the overlays' without OVER_ALL, the theme and palette, reduced motion.)
  assert.match(st, /if \(a !== okAppRaw\) \{ okAppRaw = a; const f = overClsFree\(a\); if \(f !== okApp\) \{ okApp = f; changed = true; \} \}/);
  assert.match(st, /const a = appEl\?\.className \|\| '', d = document\.documentElement\.className, w = wrapCls\(\)/);
  assert.match(st, /\.filter\(\(c\) => c !== OVER_ALL\)\.join\(' '\)/);
  assert.match(st, /if \(dk !== okDoc \|\| w !== okWrap \|\| th !== okTheme \|\| pal !== okPal \|\| rm !== okRM\)/);
  assert.match(st, /if \(!(?:live\.)?veins\?\.overlay \|\| (?:live\.)?veins\.lost \|\| !wrap\.classList\.contains\('gl-on'\)\) \{ if \(overPainted\.length \|\| svgOver\?\.classList\.contains\(OVER_ALL\)\) overClear\(\); return; \}/);
  assert.match(st, /vCanvas\.addEventListener\('webglcontextlost', \(\) => \{\n\s+wrap\.classList\.remove\('gl-on'\);\n\s+overClear\(\);/);
  assert.match(st, /function overClear\(\) \{\n\s+for \(const u of overPainted\) u\.classList\.remove\(OVER_CLASS\);\n\s+overPainted = \[\];\n\s+svgOver\?\.classList\.remove\(OVER_ALL\);/);
  assert.match(st, /const spec = readGroup\(u, \{ nest: true, strict: true \}\);/);
  assert.match(st, /if \(easing\.some\(\(el\) => u\.contains\(el\)\)\) \{ why = \['easing', [^\n]*\]; return null; \}/);
  assert.match(st, /svgOver\.addEventListener\('transitionrun', ran\);\n\s+svgOver\.addEventListener\('transitionend', ended\);\n\s+svgOver\.addEventListener\('transitioncancel', ended\);/);
  assert.match(st, /watch\.observe\(svgOver, \{ subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true \}\);/);
  // (Each painted group's frame as it is at each paint, under the overlays' own group where it is one of its children.)
  assert.match(st, /groups\.set\(n, \[\{ spec, get m\(\) \{ const own = elMat\(u\); return up \? mulTo\(sc, elMat\(up\), own\) : own; \} \}\]\);/);
  assert.match(st, /for \(const u of overPainted\) if \(!now2\.has\(u\)\) u\.classList\.remove\(OVER_CLASS\);\n\s+for \(const u of now2\) u\.classList\.add\(OVER_CLASS\);/);
  // (Read each frame before the figure decides to sleep, and laid again alone, after the frame's draw, when only they changed: perf A3.)
  assert.match(st, /syncOver\(\);\n(?:\s+\/\/ [^\n]*\n)+\s+const overAt = OVER_ON && (?:live\.)?veins\?\.top \? (?:live\.)?veins\.top\.presents : -1;\n\s+const rowsWait/);
  assert.match(st, /function overAlone\(at\) \{ if \(at >= 0 && (?:live\.)?veins\?\.overlay\?\.stale && !(?:live\.)?veins\.lost && (?:live\.)?veins\.top\.presents === at\) (?:live\.)?veins\.present\(\); \}/);
});

test('the camera\'s three sizes on screen (a zoom writes them every step) drop no group\'s reading, and nothing the painter reads uses them', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const el = (style) => ({ getAttribute: (a) => (a === 'style' ? style : null) });
  assert.equal(needsReread({ type: 'attributes', attributeName: 'style', oldValue: '--clamp-sw: 14.67px; --clamp-fs: 25.15px;', target: el('--clamp-sw: 14.38px; --clamp-fs: 24.65px;') }), false);
  assert.equal(needsReread({ type: 'attributes', attributeName: 'style', oldValue: '--halo-k: 2.096;', target: el('--halo-k: 2.054;') }), false);
  assert.equal(needsReread({ type: 'attributes', attributeName: 'style', oldValue: '--halo-k: 2.096;', target: el('--halo-k: 2.054; stroke-width: 3px') }), true, 'another declaration is still a change');
  // Their readers in the stylesheets: text (never painted by the overlays) and the SVG halos' css scale; a new reader needs this list, and the rule above, looked at.
  const dir = new URL('../styles/', import.meta.url), found = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.css'))) {
    for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(/([^{}]+)\{[^{}]*var\(--(clamp-sw|clamp-fs|halo-k)\b[^{}]*\}/g)) found.push(m[1].trim().replace(/\s+/g, ' ').replace(/^\/\*.*?\*\/\s*/, ''));
  }
  const ok = [/^\.clamp-label, \.clamp-label-out$/, /^\.guide-label$/, /^\.halo-in$/];
  for (const sel of found) assert.ok(ok.some((r) => r.test(sel)), `a reader of the camera's sizes the overlays do not know: ${sel}`);
  assert.ok(found.length >= 3, `found ${found.length}`);
});

test('the classes of an open card or sheet change no overlay look: no rule on them reaches the figure', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { OVER_CARD_CLASSES, OVER_CARD_RE } = await import('../src/ui/stage-over.js');
  assert.equal('app dock-open panel-open stage-view'.replace(OVER_CARD_RE, ''), 'app stage-view');
  assert.equal('vessel-card'.replace(OVER_CARD_RE, ''), '');
  assert.equal('app not-dock-open dock-opened'.replace(OVER_CARD_RE, ''), 'app not-dock-open dock-opened', 'whole class names only');
  const dir = new URL('../styles/', import.meta.url), chrome = /\.(panel|panel-scrim|action-card|dock|vdock|instrument-workspace|stage-credit|treat-card|nb-views|readouts|topbar|toolbar|stage-bar|zoom-pill|projector-exit|big-overlay|cmp-badge|stage-clock|hover-tip|cath-label|lz|lz-lab|lz-zone|lb-alert|pz-shade|pz|pz-[a-z-]+|toast-wrap)\b|\[data-lit[*~]?="lobule:|#(dock|treatCard|zoomPill|toolHint|stageCenter|labels)\b/, bad = [];
  // (Rules on the stage's own box that set no look a group's reading holds: the box's layer, its touch action and its fade (the HTML overlay div is not the SVG overlays), and the
  // slide's dimming of the stage's children, an opacity on the SVG's root, which no group's reading holds.)
  const boxRule = /^\.app\.presenting #stageView(\.pz-out:not\(\.unframed\) > :not\(#veins\)| > #overlay)?$|^\.app\.presenting \.stage-view$/;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.css'))) {
    const css = readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{/g)) {
      for (const part of m[1].split(',')) {
        if (!OVER_CARD_CLASSES.some((c) => new RegExp(`\\.${c}\\b(?![-\\w])`).test(part))) continue;
        // (what the rule sets: the part after the last class of a card or sheet state; it must be chrome, or the state's own :has() test of it)
        if (!chrome.test(part) && !boxRule.test(part.trim().replace(/\s+/g, ' '))) bad.push(`${f}: ${part.trim().slice(0, 140)}`);
      }
    }
  }
  assert.deepEqual(bad, [], 'a rule on a card or sheet being open that reaches something other than the cards and the chrome: take its class off OVER_CARD_CLASSES (stage-over.js)');
});
