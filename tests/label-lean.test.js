// A label label-gl draws holds only its name (review L3 P10): its group keeps one hidden <text> whose aria-label is its words and a clear
// rect over its box for the pointer; label-gl draws it from its record and one sample of its look. Run as the stage runs it (stage-label-layer.js
// renderBlock and blockRest, the late queue, label-gl.js over the warm harness's WebGL): the picture is the one the full SVG build gave, a lost
// context gives the full SVG back in the same event, a label label-gl cannot draw gets its pieces back, and the pointer and keyboard still find it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from '../scripts/warm/dom.mjs';

const P = installPage();
globalThis.AbortController = P.dom.window.AbortController;
globalThis.WebGL2RenderingContext ??= function WebGL2RenderingContext() {};
globalThis.getComputedStyle = (el, p) => P.liveStyle(el, p);
const TEXT = await import('../src/ui/text-gl.js');
await TEXT.loadGlyphs();
const { createLabelGL } = await import('../src/ui/label-gl.js');
const { createLabelLayer } = await import('../src/ui/stage-label-layer.js');
const NS = 'http://www.w3.org/2000/svg';
{
  const st = document.createElement('style');
  st.textContent = `#lbl .lb tspan { fill: rgb(20, 20, 20); font-family: Inter; font-size: 12px; font-weight: 500; }
    #lbl .lb .lb-val { fill: rgb(0, 120, 60); font-weight: 600; }
    #lbl .lb .lb-bg { fill: rgb(250, 250, 250); stroke: rgb(200, 200, 200); stroke-width: 1px; }
    #lbl .lb.node.sel .lb-name { fill: rgb(0, 90, 200); }`;
  document.head.append(st);
}

// (lean: false holds label-gl's leave to build labels with only their name: every label is built in full, as before P10.)
function rig({ lean = true } = {}) {
  const svg = document.createElementNS(NS, 'svg'), leaders = document.createElementNS(NS, 'g'), blocks = document.createElementNS(NS, 'g');
  svg.id = 'lbl'; leaders.setAttribute('class', 'lb-leaders');
  svg.append(leaders, blocks); document.body.append(svg);
  const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 400;
  const host = { canvas, gl: canvas.getContext('webgl2'), active: () => true, ask: () => {}, now: () => {} };
  const lg = createLabelGL(svg, blocks, { host, marks: [leaders], force: true });
  if (!lean) Object.defineProperty(lg, 'canLean', { get: () => false });
  const q = [];
  const run = (op, a, b) => {
    if (op === 'label') { if (!a.isConnected) blocks.append(a); } else if (op === 'kids') { a.replaceChildren(...b); lg.dirty(a); } else if (op === 'fill') { a.style.fill = b; lg.dirty(a); }
  };
  const late = (op, a, b) => q.push([op, a, b]);
  const lateQueue = { now() { for (const [op, a, b] of q.splice(0)) run(op, a, b); } };
  const pool = new Map(), explain = { key: null, state: () => null }, picked = [];
  const live = { labelGL: lg, laidFrame: 1, frameNo: 1, labelK: 1, keyStops: true, morph: 0, morphTarget: 0, resLit: new Map(), CTM: { a: 1, b: 0, e: 0, f: 0 } };
  live.labelGlSync = () => lg.sync([...pool.values()].filter((b) => b.pos).map((b) => b.pos));
  const setA = (el, k, v) => { const c = el._a || (el._a = {}); if (c[k] === v) return false; c[k] = v; el.setAttribute(k, v); return true; };
  const noop = () => {};
  const L = createLabelLayer({ ANCHOR_W: [0, 0], LABEL_GLIDE_MS: 450, LINE_H: () => 16, NO_ANCHOR: /./, dprDots: noop, easeInOut: (t) => t, explain, fontPx: (v) => v ?? 12,
    gLeaders: leaders, late, lateQueue, localToWorldInto: noop, nextFrame: (f) => setTimeout(f, 16), onSelect: (o) => picked.push(o), pinKind: () => 0, pool, setA,
    toneCol: () => 'rgb(200, 0, 0)', unlitKeys: new Set(), updateLabels: noop, wrap: document.createElement('div') }, live);
  const run2 = (t, cls, gap) => ({ t, size: 12, weight: 500, cls, gap });
  const item = (key, node, x, lines, o = {}) => ({ key, node, cls: 'node inline', lines, align: 'start', w: 70, h: 14, padX: 3, padY: 2, x, y: 40, live: true, ...o });
  const items = {
    A: item('n:PV', 'PV', 40, [[run2('Portal', 'lb-name'), run2('12', 'lb-val', 4)]], { bg: true }),
    B: item('n:SMV', 'SMV', 200, [[run2('SMV', 'lb-name')], [run2('9 mmHg', 'lb-val')]], { align: 'middle' }),
    C: item('n:SV', 'SV', 380, [[run2('Splenic', 'lb-name')]], { swatch: 'rgb(10, 20, 30)', align: 'end' }),
  };
  const lay = () => { live.laidFrame = ++live.frameNo; for (const it of Object.values(items)) L.renderBlock(it); live.labelGlSync(); };
  const frames = async (n = 10) => { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 15)); lg.drawInto(); } };
  const shot = () => { const o = {}; for (const it of lg.snapshot().items) o[it.key] = it.pic; return o; };
  const settle = async () => { lg.drawInto(); await R0(); R.lay(); await R.frames(16); R.lay(); await R.frames(16); };
  const R = { lg, L, pool, items, lay, frames, shot, live, canvas, blocks, picked, settle };
  const R0 = () => new Promise((r) => setTimeout(r, 20));
  return R;
}
const kidTags = (g) => [...g.children].map((el) => el.tagName + (el.getAttribute('class') ? '.' + el.getAttribute('class') : ''));

test('drawn by label-gl, a label holds one hidden text named with its words and a clear rect over its box, no tspans', async () => {
  const R = rig();
  await R.settle();
  for (const [k, words] of [['n:PV', 'Portal 12'], ['n:SMV', 'SMV 9 mmHg'], ['n:SV', 'Splenic']]) {
    const g = R.pool.get(k).g;
    assert.deepEqual(kidTags(g), ['rect.lb-pick', 'text.lb-ax'], `${k}: ${kidTags(g)}`);
    assert.equal(g.querySelectorAll('text').length, 1);
    assert.equal(g.querySelectorAll('tspan, path, circle').length, 0, 'no runs, no halo, no leader or dot of its own');
    assert.equal(g.querySelector('text').getAttribute('aria-label'), words);
    assert.equal(g.querySelector('text').textContent, '', 'its name only, nothing drawn');
  }
  const pick = R.pool.get('n:PV').pick;
  assert.deepEqual(['x', 'y', 'width', 'height'].map((k) => +pick.getAttribute(k)), [-3, -2, 76, 18], 'the pointer\'s rect is its laid-out box with its padding');
  const sh = R.shot();
  assert.ok(sh['n:PV'] && sh['n:SMV'] && sh['n:SV'], `all three drawn: ${JSON.stringify(Object.keys(sh))}`);
  // (Its look's sample: one hidden group per look, with the pieces and no words.)
  const samples = R.blocks.querySelector('.lb-samples');
  assert.ok(samples && samples.getAttribute('display') === 'none');
  assert.equal(samples.children.length, 3, 'three looks, three samples');
  R.lg.dispose();
});

test('each label\'s GPU picture is the one the full SVG build gave, words and pieces alike', async () => {
  const A = rig({ lean: false }), B = rig();
  await A.settle(); await B.settle();
  assert.ok(A.pool.get('n:PV').g.querySelector('tspan'), 'the full build');
  assert.ok(!B.pool.get('n:PV').g.querySelector('tspan'), 'its name only');
  const a = A.shot(), b = B.shot();
  assert.equal(Object.keys(a).length, 3);
  assert.deepEqual(b, a);
  // (New words: both take the same new picture; and the selected look.)
  for (const R of [A, B]) { R.items.A.lines = [[{ t: 'Portal v.', size: 12, weight: 500, cls: 'lb-name' }, { t: '14', size: 12, weight: 500, cls: 'lb-val', gap: 4 }]]; R.items.B.sel = true; }
  await A.settle(); await B.settle();
  const a2 = A.shot(), b2 = B.shot();
  assert.notEqual(a2['n:PV'], a['n:PV']);
  assert.deepEqual(b2, a2);
  assert.equal(B.pool.get('n:PV').g.querySelector('text').getAttribute('aria-label'), 'Portal v. 14');
  A.lg.dispose(); B.lg.dispose();
});

test('a lost context gives every label its full SVG pieces in the same event, and its look as the full build has it', async () => {
  const A = rig({ lean: false }), R = rig();
  await A.settle(); await R.settle();
  const g = R.pool.get('n:PV').g;
  assert.equal(g.querySelectorAll('tspan').length, 0);
  R.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  assert.ok(R.lg.lost);
  for (const k of ['n:PV', 'n:SMV', 'n:SV']) {
    const full = A.pool.get(k).g, got = R.pool.get(k).g;
    assert.deepEqual(kidTags(got), kidTags(full), `${k}: its pieces, as the full build`);
    assert.equal(got.innerHTML, full.innerHTML, `${k}: every attribute and word`);
  }
  assert.equal(g.querySelector('.lb-val').textContent, '12');
  // (Laid out again while lost: still the full build.)
  R.lay();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(R.pool.get('n:SMV').g.querySelectorAll('tspan').length, 2);
  // (The context given back: label-gl draws them again, and they go back to their name only, with the same pictures.)
  R.canvas.dispatchEvent(new Event('webglcontextrestored'));
  for (let i = 0; i < 40 && R.lg.lost; i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(!R.lg.lost, 'restored');
  await R.settle();
  assert.deepEqual(kidTags(R.pool.get('n:PV').g), ['rect.lb-pick', 'text.lb-ax']);
  assert.deepEqual(R.shot(), A.shot());
  A.lg.dispose(); R.lg.dispose();
});

test('a label label-gl cannot draw (a glyph Inter lacks) gets its full pieces back, and the SVG shows it', async () => {
  const R = rig();
  R.items.C.lines = [[{ t: 'Splenic 漢', size: 12, weight: 500, cls: 'lb-name' }]];
  await R.settle();
  await R.frames(8);
  const g = R.pool.get('n:SV').g;
  assert.equal(g.querySelector('tspan')?.textContent, 'Splenic 漢', `the SVG's own words: ${kidTags(g)}`);
  assert.ok(!g.hasAttribute('data-gl'), 'shown by the SVG');
  assert.ok(!R.pool.get('n:PV').g.querySelector('tspan'), 'the others keep only their name');
  // (Its words drawable again: its pieces go, and label-gl draws it.)
  R.items.C.lines = [[{ t: 'Splenic', size: 12, weight: 500, cls: 'lb-name' }]];
  await R.settle();
  assert.deepEqual(kidTags(R.pool.get('n:SV').g), ['rect.lb-pick', 'text.lb-ax']);
  assert.ok(R.shot()['n:SV']);
  R.lg.dispose();
});

test('the pointer and the keyboard still find a label that holds only its name', async () => {
  const R = rig();
  await R.settle();
  const b = R.pool.get('n:PV');
  b.pick.dispatchEvent(new P.dom.window.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(R.picked, [{ type: 'node', id: 'PV' }], 'a click on its rect selects it');
  assert.equal(b.g.getAttribute('tabindex'), '0');
  assert.equal(b.g.getAttribute('role'), 'button');
  b.g.focus();
  assert.equal(document.activeElement, b.g, 'it takes keyboard focus');
  b.g.dispatchEvent(new P.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(R.picked.length, 2, 'and Enter selects it');
  R.lg.dispose();
});

test('its transform is written when a layout lands at rest, not on each frame of a pan', async () => {
  const R = rig();
  await R.settle();
  const g = R.pool.get('n:PV').g, t0 = g.getAttribute('transform');
  assert.equal(t0, 'translate(40.0 40.0)');
  R.live.gestureOn = () => true;
  R.items.A.x = 55; R.lay();
  assert.equal(g.getAttribute('transform'), t0, 'moving: the GPU has its place, the page is not written');
  assert.equal(R.pool.get('n:PV').pos.x, 55, 'its record has it');
  R.live.gestureOn = () => false;
  R.lay();
  assert.equal(g.getAttribute('transform'), 'translate(55.0 40.0)');
  R.lg.dispose();
});
