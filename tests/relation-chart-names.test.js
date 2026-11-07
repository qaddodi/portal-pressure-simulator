// The lines' names on a relation chart (29 Oct, his "this card too crowded, can't understand it this way, the legend names suck" on Varix by HVPG
// of Gastric varices): short names, each standing at the end of its own line on the drawing, no stacked key over the plot, the cut-offs held as
// coloured numbers on the axis (no dashed lines with names to run into the lines), and the plot keeping the card's height. A key of the lines
// stands in, tidy and in rows from the left, only on a card too small to hold the names. The real createCurve runs on a small stand-in for the
// browser's DOM, on the model's own numbers, at card sizes from a sideways phone to a Mac, so what is checked is the layout's own output
// (code only: nobody has looked on screen).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// (a word in a chart: what the GPU picture's look reader needs of it, svg-gl.js)
const Txt = (text) => ({ text, children: [], attributes: [], getAttribute: () => null });
class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.classSet = new Set(); this.dataset = {}; this.style = {}; this.isConnected = true; this.clientWidth = 0; this.clientHeight = 0; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.classSet = new Set(String(v).split(/\s+/).filter(Boolean)); }
  getAttribute(k) { return this.attrs[k]; }
  append(...k) { for (const c of k) this.children.push(typeof c === 'string' ? Txt(c) : c); }
  prepend(...k) { this.children.unshift(...k); }
  hasAttribute(k) { return k in this.attrs; }
  get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
  get localName() { return this.tag; }
  replaceChildren(...k) { this.children = []; this.append(...k); }
  remove() {}
  get classList() { const s = this; return { add: (c) => s.classSet.add(c), remove: (c) => s.classSet.delete(c), toggle: (c, f) => { if (f === undefined) f = !s.classSet.has(c); f ? s.classSet.add(c) : s.classSet.delete(c); }, contains: (c) => s.classSet.has(c) }; }
  set className(v) { this.classSet = new Set(String(v).split(/\s+/).filter(Boolean)); }
  set textContent(v) { this.children = [Txt(String(v))]; }
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

const { createCurve, curveSteps, patientOf, segHits, drawnLines, stylesOf } = await import('../src/ui/tool-curve.js');
const { createCore } = await import('../src/worker-core.js');
const { DECKS } = await import('../src/ui/decks.js');
const { deckStates, changes } = await import('./deck-states.js');

const slideOf = (deck) => { const d = DECKS.find((x) => x.id === deck), i = d.slides.findIndex((s) => s.id === 'relation'); return { d, i, s: d.slides[i] }; };
async function seq(steps, base = null) {
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, base, reqId: 1 });
  core.dispose();
  return out;
}
const stepOf = (s) => ({ preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days });
const worked = new Map();   // (each deck's curve, worked out once for every size)
function workOut(deck) {
  if (!worked.has(deck)) worked.set(deck, (async () => {
    const { d, i, s } = slideOf(deck);
    let from = i;
    while (from > 0 && !d.slides[from].preset) from--;
    const st = (await seq(d.slides.slice(from, i + 1).filter((x, k) => k === 0 || changes(x)).map(stepOf))).at(-1);
    return { states: await seq(curveSteps(s.tool), patientOf(s.tool) ? null : st.snap), fp: (await deckStates(d))[i] };
  })());
  return worked.get(deck);
}

const cls = (n) => [...n.classSet].join(' ');
const walk = (n, fn, off = [0, 0], hidden = false) => {
  const m = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(n.attrs?.transform || ''), o = m ? [off[0] + +m[1], off[1] + +m[2]] : off;
  fn(n, o, hidden);
  (n.children || []).forEach((c) => c.tag && walk(c, fn, o, hidden || c.classSet.has('off')));
};
/** The chart drawn at W × H px in f px type: what shows (a text under a hidden group is left out), the same as the browser's CSS would hide it. */
async function draw(deck, W, H, f) {
  const { s, i } = slideOf(deck), { states, fp } = await workOut(deck);
  const cur = createCurve(), el = cur.el;
  el.clientWidth = W; el.clientHeight = H;
  globalThis.getComputedStyle = () => ({ fontSize: `${f}px` });   // (the svg root and the groups are still read from the page; every piece of the chart names its look)
  el._svgGL.setCtx({ scale: { sm: f } });   // (the card's small type, handed to the chart's looks: the chart asks no style)
  cur.configure(s.tool, { deck: { id: `names-${Math.random()}` }, slide: s, index: i, snap: true, fp, params: s.params || {}, liveParams: () => s.params || {}, run: async () => states, fpOf: () => null });
  const ready = () => [...el.children].reverse().find((c) => c.dataset?.points && c.dataset.points !== '0');
  for (let k = 0; k < 200 && !ready(); k++) await new Promise((r) => setTimeout(r, 25));
  await new Promise((r) => setTimeout(r, 60));
  const svg = ready();
  assert.ok(svg, 'the chart arrived');
  const out = { W, H, f, texts: [], lines: [], paths: [], alt: null };
  walk(svg, (n, off, hidden) => {
    const a = n.attrs;
    if (cls(n).includes('pcv-alt')) out.alt = { hidden };
    if (hidden) return;
    if (n.tag === 'text' && a.x != null && a.y != null) out.texts.push({ cls: cls(n), x: +a.x + off[0], y: +a.y + off[1], anchor: a['text-anchor'] || 'start', txt: n._t ?? n.textContent, off: n.classSet.has('off') });
    else if (n.tag === 'line') out.lines.push({ cls: cls(n), x1: +a.x1 + off[0], y1: +a.y1 + off[1], x2: +a.x2 + off[0], y2: +a.y2 + off[1] });
    else if (n.tag === 'path') out.paths.push({ cls: cls(n), d: a.d });
  });
  cur.dispose();
  return out;
}
// A word's box: 0.55 em a letter (a bold word's average, under the layout's own count, so the check is not the layout agreeing with itself).
const boxOf = (t, f) => { const w = [...t.txt].length * f * 0.55, x0 = t.anchor === 'end' ? t.x - w : t.anchor === 'middle' ? t.x - w / 2 : t.x; return [x0, t.y - 0.8 * f, x0 + w, t.y + 0.25 * f]; };
const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const pathPts = (d) => { const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => +m[0]); const out = []; for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]); return out; };

// (His 29 Oct follow-up, "shunt open? what shunt dude?" and "too many words": colour names the varix, fundal pink and esophageal green, the dashes
// the gastrorenal shunt (GRS) closed, and the key row says so once: "GRS open", "GRS closed".)
const NAMES = ['Fundal', 'Fundal', 'Esophageal'];
// A small phone held sideways, phone, big phone, iPad, Mac, big Mac (width × height px, type size).
const ROOMY = [[352, 195, 13.8], [330, 178, 12], [440, 250, 14], [480, 270, 14], [700, 330, 15]];

test('the three lines are named in one word each: colour says which varix, dashes say the GRS is closed', () => {
  const { s } = slideOf('gastric-varices'), ls = drawnLines(s.tool);
  assert.deepEqual(ls.map((l) => l.name), NAMES);
  assert.deepEqual(ls.map((l) => !!l.dash), [false, true, true], 'solid with the GRS open, dashed with it closed');
  assert.equal(ls[0].c, ls[1].c, 'both fundal lines in one colour');
  assert.notEqual(ls[2].c, ls[0].c, 'the esophageal line in its own');
  assert.deepEqual(stylesOf(s.tool), ['GRS open', 'GRS closed']);
});

test('Gastric varices, Varix by HVPG: each name stands on the drawing beside its own line, and no key of the lines stands over the plot', async () => {
  for (const [W, H, f] of ROOMY) {
    const r = await draw('gastric-varices', W, H, f), say = (c) => r.texts.filter((t) => c.test(t.cls)).map((t) => t.txt);
    assert.deepEqual(say(/pcv-name/), NAMES, `${W} × ${H}: the names on the lines`);
    assert.deepEqual(say(/pcv-sty/), ['GRS open', 'GRS closed'], `${W} × ${H}: the key row names the solid and the dashed lines`);
    assert.equal(r.alt.hidden, true, `${W} × ${H}: the key of the lines is not shown`);
    assert.equal(r.texts.filter((t) => /^Varix\b/.test(t.txt)).map((t) => t.txt.trim()).join(), 'Varix mm', `${W} × ${H}: the key row is only the reading and its unit`);
    // (Pink, over the green, then blue: the names stand in the same order as their lines, top to bottom, and the first two at the right of the chart.)
    const [yOpen, yClosed, yEso] = r.texts.filter((t) => /pcv-name/.test(t.cls)).map((t) => t.y);
    assert.ok(yOpen < yEso && yEso < yClosed, `${W} × ${H}: solid pink over dashed green over dashed pink`);
    assert.equal(r.paths.filter((p) => /pcv-dash/.test(p.cls)).length, 2, `${W} × ${H}: two dashed lines`);
  }
});

test('the plot keeps the card\'s height: with no key rows over it the plot is most of the card, not a strip', async () => {
  for (const [W, H, f] of ROOMY) {
    const r = await draw('gastric-varices', W, H, f), axis = r.lines.find((l) => /pft-x/.test(l.cls)), top = Math.min(...r.lines.filter((l) => /^$/.test(l.cls) && l.y1 === l.y2 && l.y1 < axis.y1).map((l) => l.y1));
    assert.ok(axis.y1 - top >= 0.45 * H, `${W} × ${H}: the plot is ${(axis.y1 - top).toFixed(0)} px of ${H}`);
  }
});

test('the cut-offs 2.5 and 5 are numbers on the axis, with no dashed line and no "Varix 2.5" name left to run into a line', async () => {
  for (const [W, H, f] of ROOMY) {
    const r = await draw('gastric-varices', W, H, f);
    assert.deepEqual(r.texts.filter((t) => /pcv-tc/.test(t.cls)).map((t) => t.txt).sort(), ['2.5', '5'], `${W} × ${H}: the two cut-offs on the axis`);
    assert.ok(!r.texts.some((t) => /^Varix \d/.test(t.txt)), `${W} × ${H}: no cut-off named over the plot`);
    assert.ok(!r.texts.some((t) => /pcv-cut/.test(t.cls)), `${W} × ${H}: no cut-off name over the plot`);
  }
});

test('no word touches another word or a line, at any size that holds the names', async () => {
  for (const [W, H, f] of ROOMY) {
    const r = await draw('gastric-varices', W, H, f), words = r.texts.map((t) => ({ t, b: boxOf(t, f) })), bad = [];
    for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) if (hit(words[i].b, words[j].b)) bad.push(`"${words[i].t.txt}" on "${words[j].t.txt}"`);
    const segs = [];
    r.paths.filter((p) => /ptk-line/.test(p.cls)).forEach((p) => { const q = pathPts(p.d); for (let i = 1; i < q.length; i++) segs.push([...q[i - 1], ...q[i]]); });
    for (const { t, b } of words) if (/pcv-name/.test(t.cls) && segs.some((sg) => segHits(sg, b))) bad.push(`"${t.txt}" on a line`);
    for (const { t, b } of words) if (b[0] < 0 || b[2] > W || b[1] < 0 || b[3] > H) bad.push(`"${t.txt}" outside`);
    assert.deepEqual(bad, [], `${W} × ${H}`);
  }
});

test('a card too small for the names keeps a key of the lines instead, in rows from the left, in the order of the lines, never run off the edge', async () => {
  const r = await draw('gastric-varices', 315, 150, 12);
  assert.equal(r.alt.hidden, false, 'the key shows');
  assert.deepEqual(r.texts.filter((t) => /pcv-name/.test(t.cls)), [], 'and no name over the lines');
  const keys = r.texts.filter((t) => t.cls === '' && NAMES.includes(t.txt));
  assert.deepEqual(keys.map((k) => k.txt), NAMES, 'every line named in it');
  const sty = r.texts.filter((t) => /pcv-sty/.test(t.cls));
  assert.deepEqual(sty.map((t) => t.txt), ['GRS open', 'GRS closed'], 'the solid and dashed lines still named');
  for (const a of [...keys, ...sty]) for (const b of [...keys, ...sty]) if (a !== b) assert.ok(!hit(boxOf(a, 12), boxOf(b, 12)), `"${a.txt}" clear of "${b.txt}"`);
  assert.ok(keys[0].y <= keys[1].y && keys[1].y <= keys[2].y, 'top to bottom in the lines\' order');
  const rows = [...new Set(keys.map((k) => k.y))].map((y) => keys.filter((k) => k.y === y));
  assert.equal(new Set(rows.map((row) => row[0].x)).size, 1, 'each row starts at the same left edge (the swatch column), not ragged');
  for (const row of rows) assert.ok(row.every((k, j) => !j || k.x > row[j - 1].x), 'left to right in a row');
  for (const k of [...keys, ...sty]) assert.ok(boxOf(k, 12)[2] <= 315 && boxOf(k, 12)[0] >= 0, `${k.txt} stays on the card`);
});

test('the other charts that name their lines keep their names too: on the lines where they fit, the key above only where they do not', async () => {
  for (const [deck, names] of [['two-inflows', ['With the buffer', 'No buffer']], ['treatment', ['No change', 'Carvedilol', 'Propranolol']], ['circuit', ['Cirrhosis', 'Healthy liver']]]) {
    for (const [W, H, f] of [[352, 195, 13.8], [440, 250, 14]]) {
      const r = await draw(deck, W, H, f), shown = r.texts.filter((t) => names.includes(t.txt));
      assert.deepEqual([...new Set(shown.map((t) => t.txt))].sort(), [...names].sort(), `${deck} ${W} × ${H}: every line is named once`);
      assert.equal(shown.length, names.length, `${deck} ${W} × ${H}: and only once (on the drawing, or in the key, not both)`);
    }
  }
});

// (A phone's Treatment relation chart, HVPG after each drug against the HVPG before it: its key of three lines took a row for the reading and
// two more for the names, and left the plot about 40 px; the names now run on from the reading on its own row, as far as they fit.)
test('a key of three lines starts on the reading\'s own row, so the plot keeps the row the key no longer takes', async () => {
  const W = 346, H = 160, f = 13.5, r = await draw('treatment', W, H, f);
  assert.equal(r.alt.hidden, false, 'the key of the lines shows');
  const read = r.texts.find((t) => /^HVPG mmHg/.test(t.txt)), names = ['No change', 'Carvedilol', 'Propranolol'].map((n) => r.texts.find((t) => t.txt === n));
  assert.ok(read && names.every(Boolean), 'the reading and the three lines are named');
  assert.ok(Math.abs(names[0].y - read.y) < 0.1, 'the first name on the reading\'s row');
  assert.ok(Math.abs(names[1].y - read.y) < 0.1, 'the second too: it fits before the card\'s edge');
  assert.ok(names[2].y > read.y, 'the third, which does not fit, on the row under');
  const words = [read, ...names].map((t) => ({ t, b: boxOf(t, f) }));
  words.forEach(({ t, b }) => assert.ok(b[0] >= 0 && b[2] <= W, `"${t.txt}" inside the card`));
  for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) assert.ok(!hit(words[i].b, words[j].b), `"${words[i].t.txt}" clear of "${words[j].t.txt}"`);
  const y0 = r.texts.find((t) => t.txt === '0' && t.x < 40).y, y40 = r.texts.find((t) => t.txt === '40').y;
  assert.ok(y0 - y40 >= 50, `the plot's 0 to 40 is ${(y0 - y40).toFixed(0)} px, not a strip`);
});

// (A phone's relation charts whose cut-offs stand a line or two apart: "Liver flow 55" over "Liver flow 75" on Two inflows, "HVPG 5" on "HVPG 10" on
// Stiffness, "HVPG 10" on "Cirrhosis" on Outflow were printed over each other. A word on a word now loses to a spot that crosses a line, and a
// cut-off with no clear spot for its name stands as its number.)
test('phone relation charts: no word is printed over another, cut-off names included', async () => {
  for (const deck of ['two-inflows', 'stiffness', 'outflow', 'treatment', 'circuit', 'gastric-varices']) {
    for (const [W, H, f] of [[346, 170, 13.5], [346, 190, 12], [330, 150, 12], [282, 175, 12], [300, 175, 12], [320, 175, 12]]) {
      const r = await draw(deck, W, H, f), words = r.texts.map((t) => ({ t, b: boxOf(t, f) })), bad = [];
      for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) if (hit(words[i].b, words[j].b)) bad.push(`"${words[i].t.txt}" on "${words[j].t.txt}"`);
      assert.deepEqual(bad, [], `${deck} ${W} × ${H}`);
    }
  }
});

test('a cut-off whose name has no clear spot stands as its number (Two inflows, 55 and 75 a line\'s width apart), clear of the other', async () => {
  const r = await draw('two-inflows', 346, 170, 13.5), cuts = r.texts.filter((t) => /pcv-cut/.test(t.cls));
  assert.deepEqual(cuts.map((t) => t.txt).sort(), ['55', '75'], 'the two cut-offs, as numbers');
  assert.ok(!hit(boxOf(cuts[0], 13.5), boxOf(cuts[1], 13.5)), 'clear of each other');
});
