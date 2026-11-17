// The labels never ask the figure for a present from inside their own draw (17 Nov 2026, Mohammad's iPhone after a card closed and on
// slide changes: black boxes behind the labels, and now and then a black liver). host.ask lays the figure's present at once when the frame's
// end has passed; asked from inside the label pass (which is itself part of a present), it laid a whole second present in the middle of the
// first: the kept picture copied over what the labels had drawn so far, the glass drawn, its program, buffers and blend state left behind,
// and the rest of the labels (their papers' shadows, their pictures) drawn with blending off, cutting dark boxes through the organs. A label
// fading out under a card (roomFade, F50) asked so on every frame of its fade. Every ask from inside a draw goes through ask(): the next frame.
// Run as label-lean.test.js runs it (stage-label-layer.js over the warm harness's WebGL), with a card's box over the labels coming and going.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  st.textContent = `#lbn .lb tspan { fill: rgb(20, 20, 20); font-family: Inter; font-size: 12px; font-weight: 500; }
    #lbn .lb .lb-bg { fill: rgb(250, 250, 250); stroke: rgb(200, 200, 200); stroke-width: 1px; }`;
  document.head.append(st);
}

function rig() {
  const svg = document.createElementNS(NS, 'svg'), leaders = document.createElementNS(NS, 'g'), blocks = document.createElementNS(NS, 'g');
  svg.id = 'lbn'; leaders.setAttribute('class', 'lb-leaders');
  svg.append(leaders, blocks); document.body.append(svg);
  const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 400;
  const S = { drawing: 0, nested: 0, asks: 0, room: [] };
  // (The host as stage.js gives it: room() the cards' boxes; ask() would lay the figure's present at once, so one asked while the labels draw
  // is a present inside a present.)
  const host = { canvas, gl: canvas.getContext('webgl2'), active: () => true, ask: () => { S.asks++; if (S.drawing) S.nested++; }, now: () => {}, room: () => S.room };
  const lg = createLabelGL(svg, blocks, { host, marks: [leaders], force: true });
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
  const run2 = (t, cls, gap) => ({ t, size: 12, weight: 500, cls, gap });
  const item = (key, node, x, lines, o = {}) => ({ key, node, cls: 'node inline', lines, align: 'start', w: 70, h: 14, padX: 3, padY: 2, x, y: 40, live: true, ...o });
  const items = [item('n:PV', 'PV', 40, [[run2('Portal', 'lb-name')]], { bg: true }), item('n:SV', 'SV', 300, [[run2('Splenic', 'lb-name')]])];
  const lay = () => { live.laidFrame = ++live.frameNo; for (const it of items) L.renderBlock(it); live.labelGlSync(); };
  // (A frame of the figure's present: the label pass draws, as veins-gl's runTops runs it.)
  const draw = () => { S.drawing++; try { lg.drawInto(); } finally { S.drawing--; } };
  const frames = async (n) => { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 17)); draw(); } };
  return { lg, S, lay, frames, draw };
}

test('a label fading out under a card and back asks for its next picture after its draw, never from inside it', async () => {
  const R = rig();
  R.draw(); R.lay(); await R.frames(16); R.lay(); await R.frames(16);
  const drawnA = () => R.lg.snapshot().items.map((it) => it.drawn);
  assert.ok(drawnA().length >= 2 && drawnA().every((a) => a > 0.9), `both labels drawn whole before the card: ${drawnA()}`);
  // (A card comes over both labels: they fade out whole (ROOM_MS), and every frame of the fade wants the next.)
  R.S.room = [{ x0: 0, y0: 0, x1: 600, y1: 400 }];
  const asks0 = R.S.asks;
  await R.frames(20);
  assert.equal(R.S.nested, 0, 'no present asked for from inside the labels\' draw');
  assert.ok(R.S.asks > asks0, 'the fade still asks for its next picture (the next frame)');
  // (The card goes: they fade back in, the same way.)
  R.S.room = [];
  await R.frames(20);
  assert.equal(R.S.nested, 0, 'no present asked for from inside the labels\' draw as they come back');
  assert.ok(drawnA().every((a) => a > 0.9), `both labels whole again once the card has gone: ${drawnA()}`);
});

test('label-gl calls host.ask in one place only, the next-frame tick (ask()), so no draw of its own can lay a present inside a present', () => {
  const src = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l));
  const calls = src.filter((l) => /host\??\.ask\??\.?\(/.test(l.replace(/\/\/.*$/, '').replace(/\([^()]*host\.ask[^()]*\)/g, '')));
  assert.equal(calls.length, 1, `host.ask outside againTick:\n${calls.join('\n')}`);
  assert.match(calls[0], /const againTick = /);
});
