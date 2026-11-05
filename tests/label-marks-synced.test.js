// label-gl.js draws the leaders and dots of unpinned labels from their geometry as of the last layout it was handed (sync), as it draws their
// labels: never from a newer geometry the page already holds (5 Nov 2026 review #5: a layout run mid-ride moved its leaders twice while their
// labels stood). A layer in node: the page's DOM (jsdom), the do-nothing WebGL2, and what the GPU last drew read back with snapshot().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from '../scripts/warm/dom.mjs';

const P = installPage();
globalThis.AbortController = P.dom.window.AbortController;   // (the layer's listeners take its signal: jsdom's own)
globalThis.WebGL2RenderingContext ??= function WebGL2RenderingContext() {};
const { createLabelGL } = await import('../src/ui/label-gl.js');
const NS = 'http://www.w3.org/2000/svg';
{ const st = document.createElement('style'); st.textContent = '.leader { stroke: rgb(40, 40, 40); stroke-width: 1px; fill: none; } .leader-dot { fill: rgb(40, 40, 40); stroke: none; }'; document.head.append(st); }

function marksLayer() {
  const svg = document.createElementNS(NS, 'svg'), root = document.createElementNS(NS, 'g'), blocks = document.createElementNS(NS, 'g');
  root.setAttribute('class', 'lb-leaders');
  svg.append(root, blocks); document.body.append(svg);
  const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 300;
  const host = { canvas, gl: canvas.getContext('webgl2'), active: () => true, ask: () => {}, now: () => {} };
  const lg = createLabelGL(svg, blocks, { host, marks: [root], force: true });
  // (A few frames, with the tasks between them that read the marks' looks and publish the programs.)
  const frames = async (n = 12) => { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 20)); lg.drawInto(); } };
  const lines = () => lg.snapshot().marks.filter((m) => m.kind === 'line').map((m) => [m.x0, m.y0, m.x1, m.y1]);
  return { svg, root, lg, frames, lines };
}

test('a leader the page moves after the layout stays where that layout put it until the next sync', async () => {
  const { root, lg, frames, lines } = marksLayer();
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('class', 'leader'); p.setAttribute('d', 'M10 10 L50 10'); root.append(p);
  lg.sync([]);
  await frames();
  assert.deepEqual(lines(), [[10, 10, 50, 10]]);
  p.setAttribute('d', 'M10 10 L90 40');   // (a newer layout's leader, written while the GPU still shows the last one)
  await frames(4);
  assert.deepEqual(lines(), [[10, 10, 50, 10]], 'drawn as synced');
  lg.sync([]);
  await frames(4);
  assert.deepEqual(lines(), [[10, 10, 90, 40]], 'the next sync takes it');
  lg.dispose();
});
