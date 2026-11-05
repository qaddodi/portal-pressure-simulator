// No observer of the labels (review L3 P5): label-gl.js reads a label's look again only when its writer says so. The stage's label layer
// (stage-label-layer.js renderBlock and blockRest, run here as the stage runs them) and the other writers (the explained label's class,
// stage-hover.js; the page's words landing, util.js putText) tell it, and each change reaches the label's GPU picture: its picture's key
// (snapshot pic) or, for a state the page shows as an opacity, its drawn opacity. Every other label keeps its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from '../scripts/warm/dom.mjs';

const P = installPage();
globalThis.AbortController = P.dom.window.AbortController;
globalThis.WebGL2RenderingContext ??= function WebGL2RenderingContext() {};
globalThis.getComputedStyle = (el, p) => P.liveStyle(el, p);   // (the page as it is now: the harness's own keeps the first answer per element)
const TEXT = await import('../src/ui/text-gl.js');
await TEXT.loadGlyphs();
const { createLabelGL } = await import('../src/ui/label-gl.js');
const { createLabelLayer } = await import('../src/ui/stage-label-layer.js');
const { store } = await import('../src/ui/store.js');
const NS = 'http://www.w3.org/2000/svg';
{
  const st = document.createElement('style');
  st.textContent = `#lbt .lb tspan { fill: rgb(20, 20, 20); font-family: Inter; font-size: 12px; font-weight: 500; }
    #lbt .lb.node.sel .lb-name { fill: rgb(0, 90, 200); }
    #lbt .lb.term .lb-name { fill: rgb(200, 0, 0); font-weight: 700; }
    #lbt .lb.unlit, #lbt .lb.spot-dim { opacity: 0.35; }`;
  document.head.append(st);
}

function rig() {
  const svg = document.createElementNS(NS, 'svg'), leaders = document.createElementNS(NS, 'g'), blocks = document.createElementNS(NS, 'g');
  svg.id = 'lbt'; leaders.setAttribute('class', 'lb-leaders');
  svg.append(leaders, blocks); document.body.append(svg);
  const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 400;
  const host = { canvas, gl: canvas.getContext('webgl2'), active: () => true, ask: () => {}, now: () => {} };
  const lg = createLabelGL(svg, blocks, { host, marks: [leaders], force: true });
  // (The stage's late queue as stage.js lateRun runs it: a new label into the layer, a label's pieces, a reading's colour, each told.)
  const q = [];
  const run = (op, a, b) => {
    if (op === 'label') { if (!a.isConnected) blocks.append(a); } else if (op === 'kids') { a.replaceChildren(...b); lg.dirty(a); } else if (op === 'fill') { a.style.fill = b; lg.dirty(a); }
  };
  const late = (op, a, b) => q.push([op, a, b]);
  const lateQueue = { now() { for (const [op, a, b] of q.splice(0)) run(op, a, b); } };
  const pool = new Map(), explain = { key: null, state: () => null };
  const live = { labelGL: lg, laidFrame: 1, frameNo: 1, labelK: 1, keyStops: true, morph: 0, morphTarget: 0, resLit: new Map(), CTM: { a: 1, b: 0, e: 0, f: 0 } };
  live.labelGlSync = () => lg.sync([...pool.values()].filter((b) => b.pos).map((b) => b.pos));
  const setA = (el, k, v) => { const c = el._a || (el._a = {}); if (c[k] === v) return false; c[k] = v; el.setAttribute(k, v); return true; };
  const noop = () => {};
  const L = createLabelLayer({ ANCHOR_W: [0, 0], LABEL_GLIDE_MS: 450, LINE_H: () => 16, NO_ANCHOR: /./, dprDots: noop, easeInOut: (t) => t, explain, fontPx: (v) => v ?? 12,
    gLeaders: leaders, late, lateQueue, localToWorldInto: noop, nextFrame: (f) => setTimeout(f, 16), onSelect: noop, pinKind: () => 0, pool, setA,
    toneCol: () => 'rgb(200, 0, 0)', unlitKeys: new Set(), updateLabels: noop, wrap: document.createElement('div') }, live);
  const item = (key, node, x, words, o = {}) => ({ key, node, cls: 'node inline', lines: [[{ t: words, size: 12, weight: 500, cls: 'lb-name' }]], align: 'start', w: 60, h: 14, padX: 2, padY: 2, x, y: 40, live: true, ...o });
  const items = { A: item('n:PV', 'PV', 40, 'Portal'), B: item('n:SMV', 'SMV', 200, 'SMV') };
  // (A layout: every label rendered, then synced, as the solve and labelTail do; its frames drawn, with the tasks between them.)
  const lay = () => { live.laidFrame = ++live.frameNo; for (const it of Object.values(items)) L.renderBlock(it); live.labelGlSync(); };
  const frames = async (n = 10) => { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 15)); lg.drawInto(); } };
  const shot = () => { const o = {}; for (const it of lg.snapshot().items) o[it.key] = { pic: it.pic, a: it.a }; return o; };
  return { lg, L, pool, items, lay, frames, shot, explain };
}

test('sel, a slide\'s term tone and its unlit, the words and the explained label\'s class each reach that label\'s GPU picture, and no other', async () => {
  const R = rig();
  R.lay(); await R.frames(); R.lay(); await R.frames();
  const s0 = R.shot();
  assert.ok(s0['n:PV']?.pic && s0['n:SMV']?.pic, `both labels drawn: ${JSON.stringify(Object.keys(s0))}`);

  // sel (blockRest's class): only that label's picture.
  R.items.A.sel = true; R.lay(); await R.frames();
  const s1 = R.shot();
  assert.notEqual(s1['n:PV'].pic, s0['n:PV'].pic, 'sel: a new picture');
  assert.equal(s1['n:SMV'].pic, s0['n:SMV'].pic, 'the other label keeps its own');

  // A slide that lights the portal vein (presentTerms): its label takes the term's tone, the other is unlit (an opacity, app.css).
  store.set({ presenting: true, presentTerms: { PV: 'sys' } });
  R.lay(); await R.frames();
  const s2 = R.shot();
  assert.ok(R.pool.get('n:PV').g.classList.contains('term') && R.pool.get('n:SMV').g.classList.contains('unlit'));
  assert.notEqual(s2['n:PV'].pic, s1['n:PV'].pic, 'term tone: a new picture');
  assert.equal(s2['n:SMV'].pic, s1['n:SMV'].pic, 'unlit is no new picture');
  assert.ok(Math.abs(s2['n:SMV'].a - 0.35) < 1e-6, `unlit: drawn at 35 %, ${s2['n:SMV'].a}`);
  store.set({ presenting: false, presentTerms: null });
  R.lay(); await R.frames();
  const s3 = R.shot();
  assert.equal(s3['n:PV'].pic, s1['n:PV'].pic, 'the tone gone: its picture as before');
  assert.equal(s3['n:SMV'].a, 1, 'and the other lit again');

  // Its words (putText, landing between frames): only that label.
  R.items.A.lines = [[{ t: 'Portal v.', size: 12, weight: 500, cls: 'lb-name' }]];
  R.lay(); await R.frames(16);
  const s4 = R.shot();
  assert.equal(R.pool.get('n:PV').g.textContent, 'Portal v.');
  assert.notEqual(s4['n:PV'].pic, s3['n:PV'].pic, 'new words: a new picture');
  assert.equal(s4['n:SMV'].pic, s3['n:SMV'].pic);

  // The explained label's class (stage-hover.js explainApply): the other label steps back, told as it is written.
  const g = R.pool.get('n:SMV').g;
  g.classList.add('spot-dim'); R.lg.dirty(g);
  await R.frames();
  const s5 = R.shot();
  assert.ok(Math.abs(s5['n:SMV'].a - 0.35) < 1e-6, `spot-dim: drawn at 35 %, ${s5['n:SMV'].a}`);
  assert.equal(s5['n:PV'].a, 1);
  assert.equal(s5['n:PV'].pic, s4['n:PV'].pic, 'nothing else changed');
  R.lg.dispose();
});

test('a write no writer tells is not read: there is no observer of the labels', async () => {
  const R = rig();
  R.lay(); await R.frames(); R.lay(); await R.frames();
  const g = R.pool.get('n:SMV').g, a0 = R.shot()['n:SMV'].a;
  g.classList.add('spot-dim');   // (written, not told)
  await R.frames();
  assert.equal(R.shot()['n:SMV'].a, a0, 'its picture stands until a writer says so');
  R.lg.dirty(g);
  await R.frames();
  assert.ok(Math.abs(R.shot()['n:SMV'].a - 0.35) < 1e-6);
  R.lg.dispose();
});
