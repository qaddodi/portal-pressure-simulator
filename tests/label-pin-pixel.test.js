// A pinned label, its dot and its leader's point end are placed from one rounding of the pin point (5 Nov 2026 review #15): on a slow pan
// they step together, a whole device pixel at a time, and the label never moves half a pixel against its marks. A layer in node (jsdom, the
// do-nothing WebGL2, Inter's outlines), read back with snapshot().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage } from '../scripts/warm/dom.mjs';

const P = installPage();
globalThis.AbortController = P.dom.window.AbortController;
globalThis.WebGL2RenderingContext ??= function WebGL2RenderingContext() {};
{ const cs = P.dom.window.getComputedStyle.bind(P.dom.window); globalThis.getComputedStyle = (el, p) => cs(el, p); }
const TEXT = await import('../src/ui/text-gl.js');
await TEXT.loadGlyphs();
const { createLabelGL } = await import('../src/ui/label-gl.js');
const NS = 'http://www.w3.org/2000/svg';
{ const st = document.createElement('style'); st.textContent = '.lb text { fill: rgb(10, 10, 10); font-size: 12px; font-family: Inter; font-weight: 500; }'; document.head.append(st); }

test('a pinned label and its leader\'s point end step together as the point pans by tenths of a pixel', async () => {
  const svg = document.createElementNS(NS, 'svg'), root = document.createElementNS(NS, 'g'), blocks = document.createElementNS(NS, 'g');
  root.setAttribute('class', 'lb-leaders'); svg.append(root, blocks); document.body.append(svg);
  const g = document.createElementNS(NS, 'g'), t = document.createElementNS(NS, 'text'), sp = document.createElementNS(NS, 'tspan');
  g.setAttribute('class', 'lb'); g.setAttribute('data-key', 'n:PV'); t.setAttribute('y', '10'); sp.textContent = 'PV';
  t.append(sp); g.append(t); blocks.append(g);
  const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
  const lg = createLabelGL(svg, blocks, { host: { canvas, gl: canvas.getContext('webgl2'), active: () => true, ask: () => {}, now: () => {}, scale: () => 2 }, marks: [root], force: true });
  const at = [100.3, 80.3];
  lg.pinTo((id, out) => { out[0] = at[0]; out[1] = at[1]; return true; });
  lg.sync([{ g, x: 130.3, y: 60.3, rot: false, pid: 'PV', pax: 100.3, pay: 80.3, pmid: false, pau: 0.5, pwx: 0, pwy: 0, pwv: null, want: 4 }]);
  const frames = async (n) => { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 20)); lg.drawInto(); } };
  await frames(15);
  let first = null;
  for (let i = 0; i <= 8; i++) {
    at[0] = 100.3 + i / 10; at[1] = 80.3 + i / 10;
    await frames(1);
    const s = lg.snapshot(), label = s.items[0], line = s.marks.find((m) => m.kind === 'line');
    assert.ok(label && line, 'the label and its leader drawn');
    const here = [label.x - line.x0, label.y - line.y0];
    first ??= here;
    assert.ok(Math.abs(here[0] - first[0]) < 1e-9 && Math.abs(here[1] - first[1]) < 1e-9, `at +${i / 10} px the label stands ${here} from its leader's point end, not ${first}`);
  }
  lg.dispose();
});
