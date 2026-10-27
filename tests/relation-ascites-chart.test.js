// The Ascites relation chart as the layout draws it (27 Oct; his "ughhhh" on the HVPG curve, then his pick of J: the ascites day by day after the tap, the
// grades as zones, liters on the numbers). The real createCourse runs on a small stand-in for the browser's DOM (a tree that keeps the attributes,
// classes and text each element is given), on the model's own numbers, at card sizes from a small phone to a big Mac, so what is checked is the layout's own
// output, with no browser. The numbers the slide's line quotes are pinned to the deck's own slides, so the chart and the card cannot part.
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

const { createCourse, courseOf, headSteps, tailSteps, courseSeries, smoothPath, compose } = await import('../src/ui/tool-course.js');
const { segHits } = await import('../src/ui/tool-curve.js');
const { createCore } = await import('../src/worker-core.js');
const { deckStates } = await import('./deck-states.js');
const { ASCITES } = await import('../src/ui/decks/ascites.js');
const { default: model } = await import('../src/ui/ext-model.js');
const { stepExtra } = await import('../src/ui/slide-ext.js');

const cls = (n) => [...n.classSet].join(' ');
const walk = (n, fn, off = [0, 0]) => {
  const m = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(n.attrs?.transform || ''), o = m ? [off[0] + +m[1], off[1] + +m[2]] : off;
  fn(n, o);
  (n.children || []).forEach((c) => c.tag && walk(c, fn, o));
};

const slideIx = ASCITES.slides.findIndex((s) => s.id === 'relation');
const slide = ASCITES.slides[slideIx];
const tool = slide.tool;

// The presenter's run: steps from a fresh model, or from a state a run before left (each step's snapshot and fingerprint).
async function run(steps, base = null) {
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = { snap: m.snap, fp: m.fp }; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, base, reqId: 1 });
  core.dispose();
  return out;
}
let work = null;   // (the model's two runs, once for every size)
const model2 = () => (work ||= (async () => { const head = await run(headSteps(tool)), tail = await run(tailSteps(tool), head.at(-1).snap); return { head, tail, ser: courseSeries(tool, head, tail) }; })());
let states = null;

async function draw(W, H, f, over = {}) {
  states ||= await deckStates(ASCITES);
  const { ser } = await model2();
  const cur = createCourse(), el = cur.el;
  el.clientWidth = W; el.clientHeight = H;
  globalThis.getComputedStyle = () => ({ fontSize: `${f}px` });
  const calls = [];
  cur.configure({ ...tool, ...over }, { deck: over.deck ?? ASCITES, slide, index: slideIx, snap: true, fp: states[slideIx], params: {}, liveParams: () => ({}),
    run: async (steps, base) => { calls.push(steps.length); return steps.length === headSteps(tool).length ? (await model2()).head : (await model2()).tail; }, fpOf: () => null });
  const ready = () => [...el.children].reverse().find((c) => c.dataset?.points && c.dataset.points !== '0');
  for (let k = 0; k < 200 && !ready(); k++) await new Promise((r) => setTimeout(r, 25));
  await new Promise((r) => setTimeout(r, 30));
  const svg = ready();
  assert.ok(svg, 'the course arrived');
  return { ...read(svg, W, H, f), svg, ser, calls };
}
function read(svg, W, H, f) {
  const out = { W, H, f, texts: [], circles: [], lines: [], paths: [], rects: [] };
  walk(svg, (n, off) => {
    const a = n.attrs;
    if (n.tag === 'text') out.texts.push({ cls: cls(n), x: +a.x + off[0], y: +a.y + off[1], anchor: a['text-anchor'] || 'start', txt: n.textContent, tc: a['data-tc'], style: a.style });
    else if (n.tag === 'circle') out.circles.push({ cls: cls(n), cx: +a.cx, cy: +a.cy, r: +a.r, style: a.style });
    else if (n.tag === 'line') out.lines.push({ cls: cls(n), x1: +a.x1 + off[0], y1: +a.y1 + off[1], x2: +a.x2 + off[0], y2: +a.y2 + off[1], style: a.style });
    else if (n.tag === 'path') out.paths.push({ cls: cls(n), d: a.d, style: a.style });
    else if (n.tag === 'rect') out.rects.push({ cls: cls(n), rate: a['data-rate'], deep: a['data-deep'], y: +a.y, height: +a.height });
  });
  return out;
}
// A word's box: its width at 0.55 em a letter (a bold word's average, a little under the layout's own count, so the check is not the layout agreeing with itself), from the baseline up 0.8 em and down 0.25.
const boxOf = (t, f) => { const w = [...t.txt].length * f * 0.55, x0 = t.anchor === 'end' ? t.x - w : t.anchor === 'middle' ? t.x - w / 2 : t.x; return [x0, t.y - 0.8 * f, x0 + w, t.y + 0.25 * f]; };
const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const pathPts = (d) => { const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => +m[0]); const out = []; for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]); return out; };

// Small phone held sideways, phone, big phone, iPad, Mac, big Mac (width × height in px, type size).
const SIZES = [[315, 150, 12], [330, 178, 12], [360, 200, 13], [440, 250, 14], [480, 270, 14], [700, 330, 15], [250, 170, 12]];

test('the slide draws the course kind, on the same patient as its Tense ascites and Large-volume paracentesis slides', () => {
  assert.equal(tool.kind, 'course');
  const tense = ASCITES.slides.find((s) => s.id === 'tense'), lvp = ASCITES.slides.find((s) => s.id === 'lvp'), c = courseOf(tool);
  assert.deepEqual(c.from, { preset: tense.preset, params: tense.params, days: tense.days, ramp: tense.ramp }, 'the case before the tap is the tense belly slide');
  assert.deepEqual(c.event, { params: lvp.params, action: lvp.action }, 'the tap is the paracentesis slide');
  const back = ASCITES.slides.find((s) => s.id === 'back'), diu = ASCITES.slides.find((s) => s.id === 'diuretics');
  assert.equal(c.wait, back.days, 'two weeks with nothing done, as the Two weeks later slide');
  assert.equal(c.after, diu.days, 'four weeks on each treatment, as the Treatment slide');
  assert.deepEqual(c.then.map((b) => b.params), [diu.params, { ...diu.params, tips: { on: true } }]);
  assert.equal(headSteps(tool).length, 2 + c.wait);
  const tails = tailSteps(tool);
  assert.equal(tails.length, 2 * c.after);
  assert.equal(tails[c.after].restart, true, 'the second treatment starts again from the same day');
  assert.ok(!tails[0].restart && tails.slice(1).every((s, i) => (i + 1 === c.after ? true : !s.restart)), 'and nothing else restarts');
});

test('the model\'s days: the tense belly, the tap, the fluid back by week 2, diuretics down to grade 1, diuretics with a TIPS to none', async () => {
  const { ser, head } = await model2();
  assert.equal(ser.head.length, 15, 'a point on every day to week 2');
  assert.equal(ser.tails[0].pts.length, 29, 'and on every day of the four weeks after');
  states ||= await deckStates(ASCITES);
  const at = (id) => states[ASCITES.slides.findIndex((s) => s.id === id)].asc / 1000;
  near(ser.before, at('tense'), 0.1, 'the dot is the Tense ascites slide\'s own number');
  assert.equal(ser.before.toFixed(1), at('tense').toFixed(1), 'and reads the same');
  assert.equal(ser.head[0][1], 0, 'the tap empties the belly');
  near(ser.head.at(-1)[1], at('back'), 0.1, 'week 2 is the Two weeks later slide\'s number, the one the line quotes');
  assert.equal(ser.head.at(-1)[1].toFixed(1), at('back').toFixed(1), 'and reads the same');
  near(ser.tails[0].pts.at(-1)[1], at('diuretics'), 0.1, 'diuretics at week 6 is the Treatment slide\'s number');
  assert.equal(ser.tails[0].pts.at(-1)[1].toFixed(1), at('diuretics').toFixed(1), 'and reads the same');
  assert.equal(ser.tails[1].pts.at(-1)[1], 0, 'with a TIPS as well it is gone');
  assert.equal(at('tips'), 0, 'as on the TIPS slide');
  // (The shape the words rely on.)
  const v = ser.head.map((p) => p[1]);
  for (let i = 1; i < v.length; i++) assert.ok(v[i] >= v[i - 1] - 1e-9, `the fluid only returns, day ${i}`);
  assert.ok(v.at(-1) > 3 && v.at(-1) < 5 && ser.before > 5, `grade 2 at week 2, grade 3 before the tap: ${v.at(-1)}, ${ser.before}`);
  assert.ok(v[8] > 0.95 * v.at(-1), `the fluid is almost all back by day 8 (${v[8]} of ${v.at(-1)}), so the chart's refill reads as one stretch`);
  const a = ser.tails[0].pts.map((p) => p[1]), b = ser.tails[1].pts.map((p) => p[1]);
  for (let i = 1; i < a.length; i++) assert.ok(a[i] <= a[i - 1] + 1e-9, `diuretics only lower it, day ${i}`);
  for (let i = 0; i < a.length; i++) assert.ok(b[i] <= a[i] + 1e-9, `the TIPS is never above diuretics alone, day ${i}`);
  assert.ok(a.at(-1) > 0.15 && a.at(-1) < 1.5, `diuretics reach grade 1: ${a.at(-1)}`);
  assert.equal(head.length, 16);
});

test('smoothPath runs through every point, never leaves the range of the two it joins, and keeps a flat stretch flat', () => {
  const pts = [[0, 100], [10, 40], [20, 12], [30, 4], [40, 4], [50, 4], [60, 30]];
  const d = smoothPath(pts), q = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => +m[0]);
  assert.ok(d.startsWith('M0 100'));
  const segs = d.split('C').slice(1).map((s) => s.trim().split(/[ ]/).map(Number));
  assert.equal(segs.length, pts.length - 1);
  segs.forEach((s, i) => {
    near(s[4], pts[i + 1][0], 0.06, `ends at point ${i + 1}`); near(s[5], pts[i + 1][1], 0.06, `ends at point ${i + 1}`);
    const lo = Math.min(pts[i][1], pts[i + 1][1]) - 0.06, hi = Math.max(pts[i][1], pts[i + 1][1]) + 0.06;
    assert.ok(s[1] >= lo && s[1] <= hi && s[3] >= lo && s[3] <= hi, `no overshoot between ${i} and ${i + 1}: ${s}`);
  });
  assert.deepEqual(segs[3].filter((_, k) => k % 2), [4, 4, 4], 'the flat stretch is flat');
  assert.ok(q.length > 0);
  assert.equal(smoothPath([[1, 2]], true), 'L1 2');
  assert.equal(smoothPath([]), '');
});

test('before the days are there: the zones, the numbers, the axes and the caption show, and no line, no dot, no name', async () => {
  const cur = createCourse(), el = cur.el;
  el.clientWidth = 330; el.clientHeight = 178;
  globalThis.getComputedStyle = () => ({ fontSize: '12px' });
  let go = null;
  cur.configure(tool, { deck: {}, slide, index: slideIx, snap: true, fp: null, params: {}, liveParams: () => ({}), run: () => new Promise((r) => { go = r; }), fpOf: () => null });
  const r = read(el.children[0], 330, 178, 12);
  assert.equal(el.children[0].dataset.points, '0');
  assert.equal(r.rects.filter((x) => x.cls === 'pco-z').length, 4, 'the four zones');
  assert.equal(r.paths.filter((p) => /ptk-line/.test(p.cls)).length, 0);
  assert.equal(r.circles.length, 0);
  assert.ok(r.texts.some((t) => t.txt === 'Grade 3') && r.texts.some((t) => t.txt === '5 L') && r.texts.some((t) => t.txt === 'Weeks after the tap'));
  assert.ok(!r.texts.some((t) => t.txt === 'Tense belly' || t.txt === 'Diuretics'), 'no name of a line that is not drawn');
  assert.ok(go, 'and the days were asked for');
});

test('the grades are the plot\'s zones, named at the left, with liters on the numbers: 0, 1.5 L, 5 L', async () => {
  const r = await draw(330, 178, 12);
  assert.deepEqual(r.rects.filter((x) => x.cls === 'pco-z').map((x) => [x.rate, x.deep || null]), [['ok', null], ['mid', null], ['hi', null], ['hi', '1']], 'none, grade 1, grade 2, grade 3 (the deepest)');
  const zones = r.rects.filter((x) => x.cls === 'pco-z');
  for (let i = 1; i < zones.length; i++) near(zones[i].y + zones[i].height, zones[i - 1].y, 0.2, 'the zones stack with no gap');
  const tk = r.texts.filter((t) => /pcv-tc/.test(t.cls));
  assert.deepEqual(tk.filter((t) => t.x < 110 && /L$/.test(t.txt)).map((t) => t.txt).sort(), ['1.5 L', '5 L'], 'the cut-offs say liters');
  assert.ok(r.texts.some((t) => t.txt === '0' && t.anchor === 'end'), 'the baseline is 0');
  assert.deepEqual(tk.filter((t) => /^Grade/.test(t.txt)).map((t) => t.txt), ['Grade 1', 'Grade 2', 'Grade 3']);
  assert.deepEqual(tk.filter((t) => /^Grade/.test(t.txt)).map((t) => t.tc), ['mid', 'hi', 'hi'], 'in their rating\'s colour');
  assert.equal(tk.find((t) => t.txt === '1.5 L').tc, 'hi');
  // (Each name stands on its own zone, each number level with its cut-off.)
  const y = (t) => t.y - 0.35 * 12, name = (n) => tk.find((t) => t.txt === n);
  assert.ok(y(name('Grade 1')) < zones[1].y + zones[1].height && y(name('Grade 1')) > zones[1].y);
  assert.ok(y(name('Grade 2')) < zones[2].y + zones[2].height && y(name('Grade 2')) > zones[2].y);
  assert.ok(y(name('Grade 3')) < zones[3].y + zones[3].height && y(name('Grade 3')) > zones[3].y);
  near(y(tk.find((t) => t.txt === '1.5 L')), zones[2].y + zones[2].height, 0.2, 'the 1.5 L is level with the grade 2 line');
  near(y(tk.find((t) => t.txt === '5 L')), zones[3].y + zones[3].height, 0.2, 'the 5 L is level with the grade 3 line');
  assert.equal(r.svg.dataset.points, '72', 'the points the browser checks count: the dot, 15 days to week 2, 28 on each treatment');
});

test('the x axis is in weeks, the tap named at 0, and says what it is; the caption says liters', async () => {
  for (const [W, H, f] of SIZES) {
    const r = await draw(W, H, f), ticks = r.texts.filter((x) => /pft-tk/.test(x.cls)), ax = r.texts.find((x) => /pcv-ax/.test(x.cls));
    assert.deepEqual(ticks.map((x) => x.txt), ['Tap', '2', '4', '6'], `${W} px`);
    assert.equal(ax.txt, 'Weeks after the tap');
    assert.ok(ax.y > Math.max(...ticks.map((x) => x.y)) + f, `${W} px: the name is under the numbers, not among them`);
    assert.ok(r.texts.some((x) => x.txt === 'Ascites, liters' && x.y < 1.6 * f), `${W} px: Ascites, liters at the top`);
    // (The ticks are the weeks: day 14, 28 and 42 sit at 2, 4 and 6.)
    const step = (ticks[3].x - ticks[1].x) / 2;
    near(ticks[2].x - ticks[1].x, step, 0.5, `${W} px: the weeks are evenly spaced`);
  }
});

test('the three lines and their dots: the tense belly in grey, diuretics and diuretics with a TIPS in their colours, through the model\'s own days', async () => {
  const r = await draw(440, 250, 14), lines = r.paths.filter((p) => /ptk-line/.test(p.cls));
  assert.deepEqual(lines.map((p) => p.style), ['stroke: var(--text-2)', 'stroke: var(--tr-pv)', 'stroke: var(--tr-hv)']);
  assert.deepEqual(r.circles.map((c) => c.style), ['fill: var(--text-2)', 'fill: var(--tr-pv)', 'fill: var(--tr-hv)']);
  // (Each line ends on its dot, and the two treatments start where the grey one stops.)
  const end = (p) => pathPts(p.d).at(-1), start = (p) => pathPts(p.d)[0];
  near(end(lines[1])[0], r.circles[1].cx, 0.2, 'diuretics ends on its dot'); near(end(lines[1])[1], r.circles[1].cy, 0.2, 'diuretics ends on its dot');
  near(end(lines[2])[0], r.circles[2].cx, 0.2, 'the TIPS ends on its dot'); near(end(lines[2])[1], r.circles[2].cy, 0.2, 'the TIPS ends on its dot');
  near(start(lines[0])[0], r.circles[0].cx, 0.2, 'the grey line starts on the tense belly dot'); near(start(lines[0])[1], r.circles[0].cy, 0.2, 'the grey line starts on the tense belly dot');
  near(end(lines[0])[0], start(lines[1])[0], 0.2, 'diuretics starts where the grey line stops'); near(end(lines[0])[1], start(lines[1])[1], 0.2, 'diuretics starts where the grey line stops');
  near(start(lines[2])[0], start(lines[1])[0], 0.01, 'and so does the TIPS'); near(start(lines[2])[1], start(lines[1])[1], 0.01, 'and so does the TIPS');
  assert.ok(r.circles[2].cy > r.circles[1].cy + 10, 'the TIPS ends under diuretics');
  // (The tap is a straight drop, then the line curves up through the daily points: no corner pokes out of the range of the model's days.)
  assert.ok(/L[\d.]+ [\d.]+L[\d.]+ [\d.]+C/.test(lines[0].d), 'a lead, the drop, then the smooth line');
});

test('the lines are named at their ends and the first dot on its own, the upright line says where treatment starts', async () => {
  const r = await draw(440, 250, 14), say = (c) => r.texts.filter((t) => c.test(t.cls)).map((t) => t.txt).sort();
  assert.deepEqual(say(/pcv-name/), ['Diuretics', 'Diuretics + TIPS']);
  assert.deepEqual(say(/pcv-dname/), ['Refills', 'Tense belly', 'Treatment starts']);
  assert.equal(r.lines.filter((l) => /pcv-at/.test(l.cls)).length, 1, 'one upright line');
  const up = r.lines.find((l) => /pcv-at/.test(l.cls)), ticks = r.texts.filter((x) => /pft-tk/.test(x.cls));
  near(up.x1, ticks[1].x, 0.5, 'standing on the 2 weeks');
  assert.ok(r.texts.find((t) => t.txt === 'Treatment starts').x > up.x1, 'its name to the right of it');
});

test('no word touches another word, a line, a dot, or leaves the chart, at any card size; a name with no clear spot goes into a key, never over a line', async () => {
  for (const [W, H, f] of SIZES) {
    const r = await draw(W, H, f), words = r.texts.map((t) => ({ t, b: boxOf(t, f) })), bad = [];
    for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) if (hit(words[i].b, words[j].b)) bad.push(`"${words[i].t.txt}" on "${words[j].t.txt}"`);
    const segs = [];
    r.paths.filter((p) => /ptk-line/.test(p.cls)).forEach((p) => { const q = pathPts(p.d); for (let i = 1; i < q.length; i++) segs.push([...q[i - 1], ...q[i]]); });
    const up = r.lines.find((l) => /pcv-at/.test(l.cls));
    if (up) segs.push([up.x1, up.y1, up.x2, up.y2]);
    for (const { t, b } of words) {
      if (/pft-tk|pcv-ax/.test(t.cls)) { if (b[0] < 0 || b[2] > W || b[3] > H) bad.push(`"${t.txt}" outside`); continue; }
      const strip = /pcv-tc/.test(t.cls) || t.txt === '0';
      if (!strip && segs.some((sg) => segHits(sg, b))) bad.push(`"${t.txt}" on a line`);
      if (r.circles.some((c) => hit(b, [c.cx - c.r, c.cy - c.r, c.cx + c.r, c.cy + c.r]))) bad.push(`"${t.txt}" on a dot`);
      if (b[0] < 0 || b[2] > W || b[1] < 0 || b[3] > H) bad.push(`"${t.txt}" outside`);
    }
    assert.deepEqual(bad, [], `${W} × ${H}`);
    // (Every size names both treatments, by their ends or in a key.)
    const names = r.texts.filter((t) => /pcv-name|pft-key/.test(t.cls) || ['Diuretics', 'Diuretics + TIPS'].includes(t.txt)).map((t) => t.txt);
    assert.ok(names.includes('Diuretics') && names.includes('Diuretics + TIPS'), `${W} × ${H}: both treatments are named`);
    assert.ok(r.texts.some((t) => t.txt === 'Tense belly'), `${W} × ${H}: the first dot is named`);
  }
});

test('the zones\' names go when the plot would be left narrower than thirteen lines of type; the numbers stay, and so does everything else', async () => {
  const wide = await draw(330, 178, 12), narrow = await draw(250, 170, 12);
  assert.ok(wide.texts.some((t) => t.txt === 'Grade 2'));
  assert.ok(!narrow.texts.some((t) => /^Grade/.test(t.txt)), 'no grade names at 250 px');
  assert.ok(narrow.texts.some((t) => t.txt === '5 L') && narrow.texts.some((t) => t.txt === '1.5 L'));
  const c = courseOf(tool), ser = (await model2()).ser;
  for (const [W, H, f] of SIZES) {
    const { G } = compose(W, H, f, c, ser);
    if (G.names) assert.ok(G.R - G.L >= 13 * f - 1, `${W}: names on, the plot ${G.R - G.L} px keeps thirteen lines`);
    else assert.ok(W - 10 - (G.L + G.Nw + 6) < 13 * f, `${W}: names off only where they would leave the plot under thirteen lines`);
    assert.ok(G.B - G.T >= 4 * f, `${W} × ${H}: the plot keeps its height`);
  }
});

test('the days are worked out once for a deck, on the presenter\'s worker, and kept: a second chart for the same slide asks for nothing', async () => {
  const deck = { id: 'once' }, a = await draw(330, 178, 12, { deck }), b = await draw(440, 250, 14, { deck });
  assert.deepEqual(a.calls, [2 + courseOf(tool).wait, 2 * courseOf(tool).after].sort((x, y) => y - x).reverse(), 'the head, then the two treatments from its last state');
  assert.deepEqual(b.calls, [], 'kept');
});

test('the course is registered with its words, and asks the worker for nothing extra', () => {
  const k = model.tools.course;
  assert.equal(typeof k.make, 'function'); assert.equal(typeof k.warm, 'function');
  assert.equal(k.title(tool), 'Ascites after the tap');
  assert.equal(k.short(tool), 'After the tap');
  assert.equal(stepExtra({ tool }), null);
});

test('the slide\'s words quote the chart: the week-2 and week-6 numbers, no speed for the TIPS, grades in symbols', () => {
  assert.ok(/\{asc@back\}/.test(slide.line) && /\{asc@diuretics\}/.test(slide.line), 'the line takes its numbers from the slides the chart agrees with');
  assert.ok(!/\bin (two|2) days\b|\bwithin a week\b|\bin a week\b/i.test(`${slide.line} ${slide.notes}`), 'no speed is claimed for what the model does in days');
  assert.ok(/≥0\.15 L/.test(slide.notes) && /≥1\.5 L/.test(slide.notes) && /≥5 L/.test(slide.notes), 'the grades in symbols');
  assert.ok(slide.line.split(/\s+/).length <= 30);
});
