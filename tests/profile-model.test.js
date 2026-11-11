// The pressure profile card is a model that stays (2 Nov 2026, zero-allocation pass): its pieces are made once for a size, and a frame of a
// glide writes numbers into them (setGeo, setPts) with the words of a reading from a table. The real card runs on a small stand-in for the
// browser's DOM: what is checked is that the model draws the shown state (the readings, the line's points, the blocks, the brackets, the
// pills), glides to a new state and arrives, and that a frame of the glide makes no new piece (code only: nobody has looked on screen).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const Txt = (text) => ({ text, nodeType: 3, data: text, children: [], attributes: [], getAttribute: () => null });
class El {
  constructor(tag) { this.tag = tag; this.localName = tag; this.nodeType = 1; this.attrs = {}; this.children = []; this.classSet = new Set(); this.dataset = {}; this.style = {}; this.isConnected = true; this.clientWidth = 0; this.clientHeight = 0; this.parentNode = null; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.classSet = new Set(String(v).split(/\s+/).filter(Boolean)); }
  getAttribute(k) { return this.attrs[k]; }
  removeAttribute(k) { delete this.attrs[k]; }
  append(...k) { for (const c of k) { const n = typeof c === 'string' ? Txt(c) : c; if (n.tag) n.parentNode = this; this.children.push(n); } }
  prepend(...k) { this.children.unshift(...k); }
  hasAttribute(k) { return k in this.attrs; }
  get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
  get childNodes() { return this.children; }
  replaceChildren(...k) { this.children = []; this.append(...k); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; }
  get classList() { const s = this; return { add: (c) => s.classSet.add(c), remove: (c) => s.classSet.delete(c), toggle: (c, f) => { if (f === undefined) f = !s.classSet.has(c); f ? s.classSet.add(c) : s.classSet.delete(c); }, contains: (c) => s.classSet.has(c) }; }
  set className(v) { this.classSet = new Set(String(v).split(/\s+/).filter(Boolean)); }
  set textContent(v) { this.children = [Txt(String(v))]; }
  get textContent() { return this.children.map((c) => c.text ?? c.textContent).join(''); }
  getBoundingClientRect() { return { width: this.clientWidth }; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
globalThis.document = { createElementNS: (ns, tag) => new El(tag), createElement: (tag) => new El(tag), documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {} };
globalThis.window = globalThis;
globalThis.Element = class {};
globalThis.ResizeObserver = class { observe() {} };
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.getComputedStyle = () => ({ fontSize: '14px', getPropertyValue: (k) => (k === '--ramp-pressure' ? '#B8D5ED 0, #85B6E9 5, #6787E8 10, #925CDD 12, #A4216E 20, #680C2F 30' : '') });

const { createProfileTool, STATIONS } = await import('../src/ui/tool-profile.js');
const { geoOf } = await import('../src/ui/svg-gl.js');
const { NODES } = await import('../src/engine/topology.js');
const { cssVar } = await import('../src/ui/util.js');   // (the one the page's modules share)
cssVar('--ramp-pressure');   // (asks for the token; the page's styles are read between frames)
await new Promise((r) => setTimeout(r, 60));

// (the pre-sinusoidal station has no tile of its own: its node's pressure)
const fpOf = (v, hvpg, ppg) => { const P = NODES.map(() => 0); P[NODES.findIndex((n) => n.id === 'RPV')] = v[2]; return { int: v[0], pv: v[1], whvp: v[3], cv: v[4], fhvp: v[5], ivc: v[6], ra: v[7], hvpg, ppg, at: { P } }; };
// (eight stations: gut, portal vein, pre, intra, post, hepatic vein, IVC, right atrium)
const HEALTHY = fpOf([8, 7, 6, 5, 4, 3, 3, 2], 2, 4);
const CIRR = fpOf([22, 20, 19, 17, 6, 4, 4, 3], 13, 16);
const BETTER = fpOf([14, 12, 11, 9, 5, 4, 4, 3], 5, 8);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const all = (n, out = []) => { out.push(n); (n.children || []).forEach((c) => c.tag && all(c, out)); return out; };
const cls = (n) => [...n.classSet].join(' ');

async function open(fp) {
  const tool = createProfileTool(), el = tool.el;
  el.clientWidth = 520; el.clientHeight = 280;
  tool.configure({ kind: 'profile', from: true }, { fp, healthy: () => HEALTHY, fpOf: () => null, index: 0, slides: [] });
  await wait(30);
  if (process.env.DBG) console.log('children', el.children.map((c) => c.tag + ':' + [...c.classSet]), tool.el === el);
  const svg = [...el.children].find((c) => c.tag === 'svg');
  return { tool, el, svg };
}

test('the card draws its first state at once, as a model: readings, line, fill and brackets', async () => {
  const { tool, svg } = await open(CIRR);
  assert.ok(svg, 'the chart is on the page');
  const nodes = all(svg), values = nodes.filter((n) => /\bppf-v\b/.test(cls(n)));
  assert.equal(values.length, STATIONS.length);
  assert.deepEqual(values.map((n) => n._t ?? n.textContent), ['22', '20', '19', '17', '6', '4', '4', '3'], 'each reading, whole');
  const line = nodes.find((n) => /\bppf-line\b/.test(cls(n))), fill = nodes.find((n) => /\bppf-fill\b/.test(cls(n)));
  assert.ok(line._pts && line._pts.n > 40, 'the line is held as points');
  assert.ok(Number.isFinite(line._pts.buf[0]) && Number.isFinite(line._pts.buf[2 * (line._pts.n - 1) + 1]), 'finite points');
  assert.equal(fill._pts.n, line._pts.n + 2, 'the fill is the line closed down to the zero line');
  assert.equal(fill._pts.closed, true);
  // (the healthy line is drawn twice, whole and clipped to the blocks)
  assert.equal(nodes.filter((n) => /\bppf-hl\b/.test(cls(n)) && geoOf(n, 'opacity') === 1).length, 2);
  // (the HVPG bracket shows in its rating's piece only)
  const shownBr = nodes.filter((n) => /\bppf-br\b/.test(cls(n)) && geoOf(n, 'opacity') > 0);
  assert.ok(shownBr.length >= 1 && shownBr.every((n) => n.attrs['data-rate'] === 'hi' || n.attrs['data-rate'] === 'mid' || n.attrs['data-rate'] === 'ok'));
  assert.equal(new Set(shownBr.map((n) => n.attrs['data-k'])).size, shownBr.length, 'one piece of each bracket');
  tool.dispose();
});

test('a new state glides there: the readings, the line and the blocks change by frames and arrive; no piece is made on the way', async () => {
  const { tool, svg } = await open(CIRR);
  const before = all(svg).length, valuesOf = () => all(svg).filter((n) => /\bppf-v\b/.test(cls(n))).map((n) => n._t ?? n.textContent);
  const lineOf = () => all(svg).find((n) => /\bppf-line\b/.test(cls(n)))._pts;
  const p0 = Array.from(lineOf().buf.slice(0, 8));
  tool.pin(BETTER);
  await wait(120);
  const mid = valuesOf();
  assert.notDeepEqual(mid, ['22', '20', '19', '17', '6', '4', '4', '3'], 'on its way');
  assert.notDeepEqual(Array.from(lineOf().buf.slice(0, 8)), p0, 'the line moved');
  assert.equal(all(svg).length, before, 'no piece made in a frame');
  await wait(4500);
  assert.deepEqual(valuesOf(), ['14', '12', '11', '9', '5', '4', '4', '3'], 'arrived');
  const bracket = all(svg).filter((n) => /\bppf-br\b/.test(cls(n)) && geoOf(n, 'opacity') > 0.99);
  assert.ok(bracket.length >= 1, 'the brackets stand at full strength once it has arrived');
  assert.equal(bracket.find((n) => n.attrs['data-k'] === 'hvpg')?.attrs['data-rate'], 'mid', 'HVPG 5 is rated mid now');
  tool.dispose();
});

test('every number a frame writes is finite, at every moment of the glide', async () => {
  const { tool, svg } = await open(HEALTHY);
  tool.pin(CIRR);
  for (let k = 0; k < 20; k++) {
    await wait(40);
    for (const n of all(svg)) {
      for (const key of ['x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'opacity']) {
        const v = n._g?.[key];
        if (v !== undefined) assert.ok(Number.isFinite(v), `${n.tag}.${key} = ${v}`);
      }
      if (n._pts) for (let i = 0; i < n._pts.n; i++) { const x = n._pts.buf[2 * i], y = n._pts.buf[2 * i + 1]; assert.ok(Number.isNaN(x) || (Number.isFinite(x) && Number.isFinite(y)), 'a point'); }
    }
  }
  tool.dispose();
});
