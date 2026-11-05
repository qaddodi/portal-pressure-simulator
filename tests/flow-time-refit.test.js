// A chart in a card draws its type at 12 px on the screen: set larger by as much as the card's zoom shrinks it (flow-time.js size). The card's
// fit tries the card at half size on its way, and a chart drawn then kept its 24 px type for good once the card was back at full size, its box
// the same size, which the size observer cannot see (Varices 3 on an iPad: "11.6 mmHg" printed under "15.9 mmHg", the 20 on the 11.6).
// The card tells the chart when it has fitted (refit), and the chart draws again at the type its zoom now asks for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// (a word in a chart: what the GPU picture's look reader needs of it, svg-gl.js)
const Txt = (text) => ({ text, children: [], attributes: [], getAttribute: () => null });
class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.classSet = new Set(); this.dataset = {}; this.style = { setProperty() {} }; this.isConnected = true; this.clientWidth = 0; this.clientHeight = 0; this.zoom = 1; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.classSet = new Set(String(v).split(/\s+/).filter(Boolean)); }
  getAttribute(k) { return this.attrs[k]; }
  append(...k) { for (const c of k) this.children.push(typeof c === 'string' ? Txt(c) : c); }
  prepend(...k) { this.children.unshift(...k); }
  hasAttribute(k) { return k in this.attrs; }
  get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
  get localName() { return this.tag; }
  replaceWith(n) { this.replaced = n; }
  remove() {}
  get classList() { const s = this; return { add: (c) => s.classSet.add(c), remove: (c) => s.classSet.delete(c), toggle: (c, f) => { if (f === undefined) f = !s.classSet.has(c); f ? s.classSet.add(c) : s.classSet.delete(c); }, contains: (c) => s.classSet.has(c) }; }
  set className(v) { this.classSet = new Set(String(v).split(/\s+/).filter(Boolean)); }
  set textContent(v) { this.children = [Txt(String(v))]; }
  get textContent() { return this.children.map((c) => c.text ?? c.textContent).join(''); }
  getBoundingClientRect() { return { width: this.clientWidth * this.zoom }; }
}
globalThis.document = { createElementNS: (ns, tag) => new El(tag), createElement: (tag) => new El(tag), documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {} };
globalThis.window = globalThis; globalThis.Element = class {};
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, addListener() {} });
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
const { createFlowTime } = await import('../src/ui/flow-time.js');

const trail = Array.from({ length: 181 }, (_, d) => [d, 11.6 + 4.3 * d / 180, 3.8 + 3.1 * d / 180]);
const latest = (el) => { let n = el.children.at(-1); while (n.replaced) n = n.replaced; return n; };   // (the stand-in's replaceWith leaves the old one in place, naming the new)
const typeOf = (el) => +/font-size: ([\d.]+)px/.exec(latest(el).attrs.style)[1];

test('a chart is drawn at 12 px whatever the card zoom, and a refit with the same box leaves the drawing alone', () => {
  const ft = createFlowTime();
  ft.el.clientWidth = 390; ft.el.clientHeight = 234;
  globalThis.getComputedStyle = () => ({ fontSize: '12px' });
  ft.el.zoom = 0.5;   // (the fit tries the card at half size)
  ft.set(trail, 1, { clock: 'days', lines: ['hvpg', 'varix'] });
  assert.equal(typeOf(ft.el), 12, 'no boost by the zoom: a chart is drawn at the size it reads on the screen');
  ft.el.zoom = 1;     // (the fit is done: the card at full size, the chart box 390 x 234 still)
  ft.refit();
  assert.equal(typeOf(ft.el), 12, 'redrawn at 12 px');
  const svg = latest(ft.el);
  ft.refit();
  assert.equal(latest(ft.el), svg, 'and a fit that changes nothing leaves the drawing alone');
});

test('the card tells every chart it has fitted: after a fit pass of the data card, the tools refit', () => {
  const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  const tools = readFileSync(new URL('../src/ui/presenter-tools.js', import.meta.url), 'utf8');
  assert.match(pres, /if \(el === ui\.data\) refit = true;/);
  assert.match(pres, /if \(refit\) ui\.tools\?\.refit\(\);/);
  assert.match(tools, /refit\(\) \{ cur\?\.refit\?\.\(\); \}/);
  for (const f of ['flow-time', 'tool-curve']) assert.match(readFileSync(new URL(`../src/ui/${f}.js`, import.meta.url), 'utf8'), /refit: remake/, `${f} redraws on refit`);
  assert.match(readFileSync(new URL('../src/ui/tool-profile.js', import.meta.url), 'utf8'), /refit\(\) \{ const sz = shown && el\.isConnected \? measure0\(\) : null;/);
});
