// The Ascites relation chart as the layout draws it (27 Oct; his "what are the dots? it's so busy", "no idea what x axis is", "completely
// illegible"): one line on one scale, the grades as the axis numbers, three visits named on their dots and joined by arrows, the HVPG axis
// written out, the HVPG 10 line named, no ring or live value floating about. The real createCurve runs on a small stand-in for the browser's
// DOM (a tree that keeps the attributes, classes and text each element is given), on the model's own numbers, at card sizes from a small
// phone to a big Mac, so what is checked is the layout's own output, with no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.classSet = new Set(); this.dataset = {}; this.style = {}; this.isConnected = true; this.clientWidth = 0; this.clientHeight = 0; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.classSet = new Set(String(v).split(/\s+/).filter(Boolean)); }
  getAttribute(k) { return this.attrs[k]; }
  append(...k) { for (const c of k) this.children.push(typeof c === 'string' ? { text: c } : c); }
  replaceChildren(...k) { this.children = []; this.append(...k); }
  remove() {}
  get classList() { const s = this; return { add: (c) => s.classSet.add(c), remove: (c) => s.classSet.delete(c), toggle: (c, f) => { if (f === undefined) f = !s.classSet.has(c); f ? s.classSet.add(c) : s.classSet.delete(c); }, contains: (c) => s.classSet.has(c) }; }
  set className(v) { this.classSet = new Set(String(v).split(/\s+/).filter(Boolean)); }
  set textContent(v) { this.children = [{ text: String(v) }]; }
  get textContent() { return this.children.map((c) => c.text ?? c.textContent).join(''); }
  getBoundingClientRect() { return { width: this.clientWidth }; }
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

const { createCurve, curveSteps, segHits } = await import('../src/ui/tool-curve.js');
const { deckStates, runSteps } = await import('./deck-states.js');
const { ASCITES } = await import('../src/ui/decks/ascites.js');

const cls = (n) => [...n.classSet].join(' ');
const walk = (n, fn, off = [0, 0]) => {
  const m = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(n.attrs?.transform || ''), o = m ? [off[0] + +m[1], off[1] + +m[2]] : off;
  fn(n, o);
  (n.children || []).forEach((c) => c.tag && walk(c, fn, o));
};

const slideIx = ASCITES.slides.findIndex((s) => s.id === 'relation');
const slide = ASCITES.slides[slideIx];
let states = null;
const swept = new Map();   // (the model's runs, once for every size)
async function draw(W, H, f) {
  states ||= await deckStates(ASCITES);
  const cur = createCurve(), el = cur.el;
  el.clientWidth = W; el.clientHeight = H;
  globalThis.getComputedStyle = () => ({ fontSize: `${f}px` });
  const run = (steps) => { const k = JSON.stringify(steps); if (!swept.has(k)) swept.set(k, runSteps(steps).then((fps) => fps.map((fp) => ({ fp })))); return swept.get(k); };
  cur.configure(slide.tool, { deck: ASCITES, slide, index: slideIx, snap: true, fp: states[slideIx], params: {}, liveParams: () => ({}), run,
    fpOf: (id) => states[ASCITES.slides.findIndex((s) => s.id === id)] ?? null });
  const ready = () => [...el.children].reverse().find((c) => c.dataset?.points && c.dataset.points !== '0');
  for (let k = 0; k < 900 && !ready(); k++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 300));
  const svg = ready();
  assert.ok(svg, 'the curve arrived');
  const out = { W, H, f, texts: [], circles: [], lines: [], paths: [], svg };
  walk(svg, (n, off) => {
    const a = n.attrs, off1 = /\boff\b/.test(cls(n));
    if (n.tag === 'text') out.texts.push({ cls: cls(n), x: +a.x + off[0], y: +a.y + off[1], anchor: a['text-anchor'] || 'start', txt: n.textContent, off: off1, fs: /pcv-v/.test(cls(n)) ? 1.1 * f : f });
    else if (n.tag === 'circle') out.circles.push({ cls: cls(n), cx: +a.cx, cy: +a.cy, r: +a.r, off: off1 });
    else if (n.tag === 'line') out.lines.push({ cls: cls(n), x1: +a.x1, y1: +a.y1, x2: +a.x2, y2: +a.y2, off: off1 });
    else if (n.tag === 'path') out.paths.push({ cls: cls(n), d: a.d });
  });
  return out;
}
// A text's box: its width at 0.58 em a character (weights 600 and 700 run wider than the average letter), from its baseline up 0.8 em and down 0.25.
const boxOf = (t) => { const w = t.txt.length * t.fs * 0.58, x0 = t.anchor === 'end' ? t.x - w : t.anchor === 'middle' ? t.x - w / 2 : t.x; return [x0, t.y - 0.8 * t.fs, x0 + w, t.y + 0.25 * t.fs]; };
const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const pts = (d) => [...d.matchAll(/[ML]\s*([\d.-]+)[ ,]([\d.-]+)/g)].map((m) => [+m[1], +m[2]]);
const shown = (r) => r.texts.filter((t) => !t.off && t.txt.trim());

// Small phone, phone, big phone, iPad, Mac, big Mac (width × height in px, type size).
const SIZES = [[315, 170, 12], [330, 178, 12], [360, 200, 12], [380, 230, 13], [440, 260, 12.5], [700, 330, 15]];

test('the chart is one line on one scale: the ascites, no second axis, no ring, no live value', async () => {
  const r = await draw(330, 178, 12);
  assert.equal(r.paths.filter((p) => /pcv-line/.test(p.cls)).length, 1, 'one data line');
  assert.ok(r.circles.filter((c) => /pcv-ring/.test(c.cls)).every((c) => c.off), 'no ring is showing');
  assert.equal(r.svg.dataset.ring, '', 'and none is read');
  const t = shown(r).map((x) => x.txt);
  assert.ok(!t.some((x) => /blood volume/i.test(x)) && !t.some((x) => /^5\.\d+/.test(x)), 'no blood volume key or second axis');
  assert.ok(t.includes('Ascites L'), 'the key names the line and its unit, with no value standing in it');
});

test('the y axis numbers are the grades: 0, then 1.5 (grade 2) and 5 (grade 3), each named where it stands', async () => {
  const r = await draw(440, 260, 12.5), t = shown(r);
  assert.deepEqual(t.filter((x) => x.anchor === 'end' && x.x < 40 && /^[\d.]+$/.test(x.txt)).map((x) => x.txt).sort(), ['0', '1.5', '5'], 'the numbers up the side');
  assert.ok(r.texts.some((x) => /pcv-tc/.test(x.cls) && x.txt === '1.5'), 'the 1.5 is a cut-off number');
  assert.ok(t.some((x) => x.txt === 'Grade 2') && t.some((x) => x.txt === 'Grade 3'), 'the grades are named');
  assert.equal(r.lines.filter((l) => /^pcv-stub/.test(l.cls)).length, 2, 'a stub for each');
});

test('the x axis says what it is on a row of its own under the numbers, and the HVPG 10 line says CSPH', async () => {
  for (const [W, H, f] of SIZES) {
    const r = await draw(W, H, f), ax = r.texts.find((x) => /pcv-ax/.test(x.cls)), ticks = r.texts.filter((x) => /pft-tk/.test(x.cls));
    assert.equal(ax.txt, 'HVPG (wedged − free), mmHg', `${W} px`);
    assert.ok(ax.y > Math.max(...ticks.map((x) => x.y)) + f, `${W} px: under the numbers, not among them`);
    assert.ok(shown(r).some((x) => x.txt === 'CSPH ≥10'), `${W} px: the 10 line is named`);
    assert.ok(!shown(r).some((x) => x.txt === '10 mmHg'));
  }
});

test('the three visits are named on their dots (no numbers, no key) and joined by two arrows, at every card size', async () => {
  for (const [W, H, f] of SIZES) {
    const r = await draw(W, H, f), names = shown(r).filter((x) => /pcv-dname/.test(x.cls)).map((x) => x.txt);
    assert.deepEqual(names.sort(), ['Diuretics', 'TIPS', 'Tense belly'], `${W} × ${H}: the names stand on the chart`);
    assert.ok(!r.texts.some((x) => /pcv-sk/.test(x.cls)), `${W} × ${H}: no key of numbers under the chart`);
    const arrows = r.paths.filter((p) => /pcv-arrow/.test(p.cls));
    assert.equal(arrows.length, 2, `${W} × ${H}: one arrowhead on each step`);
    // (Each head points along its step: from the tense belly down to diuretics, then left to the TIPS.)
    const dots = r.circles.filter((c) => /pcv-dot/.test(c.cls) && !c.off).map((c) => [c.cx, c.cy]), [d1, d2, d3] = dots;
    const tip = (a) => { const q = pts(a.d); return q[0]; }, mid = (a) => { const q = pts(a.d); return [(q[0][0] + q[1][0] + q[2][0]) / 3, (q[0][1] + q[1][1] + q[2][1]) / 3]; };
    assert.ok(tip(arrows[0])[1] > mid(arrows[0])[1] && Math.abs(d1[0] - d2[0]) < 0.2 * W, `${W} × ${H}: the first points down`);
    assert.ok(tip(arrows[1])[0] < mid(arrows[1])[0] && d3[0] < d2[0], `${W} × ${H}: the second points left, to the TIPS`);
  }
});

test('no word touches another word, a line, a dot or an arrow, or leaves the chart, at any card size', async () => {
  for (const [W, H, f] of SIZES) {
    const r = await draw(W, H, f), words = shown(r).map((t) => ({ t, b: boxOf(t) })), bad = [];
    for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) if (hit(words[i].b, words[j].b)) bad.push(`"${words[i].t.txt}" on "${words[j].t.txt}"`);
    const segs = [];
    r.paths.filter((p) => /pcv-line|pcv-walk/.test(p.cls)).forEach((p) => { const q = pts(p.d); for (let i = 1; i < q.length; i++) segs.push([...q[i - 1], ...q[i]]); });
    const heads = r.paths.filter((p) => /pcv-arrow/.test(p.cls)).map((p) => { const q = pts(p.d.replace('Z', '')); return [Math.min(...q.map((a) => a[0])), Math.min(...q.map((a) => a[1])), Math.max(...q.map((a) => a[0])), Math.max(...q.map((a) => a[1]))]; });
    for (const { t, b } of words) {
      if (/pft-tk/.test(t.cls)) continue;
      if (segs.some((sg) => segHits(sg, b))) bad.push(`"${t.txt}" on a line`);
      if (r.circles.some((c) => !c.off && hit(b, [c.cx - c.r, c.cy - c.r, c.cx + c.r, c.cy + c.r]))) bad.push(`"${t.txt}" on a dot`);
      if (heads.some((h) => hit(b, h))) bad.push(`"${t.txt}" on an arrow`);
      if (b[0] < 0 || b[2] > W || b[1] < 0 || b[3] > H) bad.push(`"${t.txt}" outside`);
    }
    assert.deepEqual(bad, [], `${W} × ${H}`);
  }
});

test('the slide asks for all of it: one line, no ring, the grades as numbers, the axis run on for the names, and says so in its comments', () => {
  const t = slide.tool;
  assert.deepEqual(t.lines, ['asc']);
  assert.equal(t.ring, false);
  assert.equal(t.cutTicks, true);
  assert.deepEqual(t.cutNames, { 1.5: 'Grade 2', 5: 'Grade 3' });
  assert.equal(t.xTo, 22, 'the names of the dots at 16.8 have room on their right');
  assert.ok(curveSteps(t).length >= 9, 'the sweep itself is unchanged');
});
