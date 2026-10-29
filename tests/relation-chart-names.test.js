// The lines' names on a relation chart (29 Oct, his "this card too crowded, can't understand it this way, the legend names suck" on Varix by HVPG
// of Gastric varices): short names, each standing at the end of its own line on the drawing, no stacked key over the plot, the cut-offs held as
// coloured numbers on the axis (no dashed lines with names to run into the lines), and the plot keeping the card's height. A key of the lines
// stands in, tidy and in rows from the left, only on a card too small to hold the names. The real createCurve runs on a small stand-in for the
// browser's DOM, on the model's own numbers, at card sizes from a sideways phone to a Mac, so what is checked is the layout's own output
// (code only: nobody has looked on screen).
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

const { createCurve, curveSteps, patientOf, segHits, drawnLines } = await import('../src/ui/tool-curve.js');
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
  globalThis.getComputedStyle = () => ({ fontSize: `${f}px` });
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
    if (n.tag === 'text' && a.x != null && a.y != null) out.texts.push({ cls: cls(n), x: +a.x + off[0], y: +a.y + off[1], anchor: a['text-anchor'] || 'start', txt: n.textContent, off: n.classSet.has('off') });
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

const NAMES = ['Fundal, shunt open', 'Fundal, shunt closed', 'Esophageal'];
// A small phone held sideways, phone, big phone, iPad, Mac, big Mac (width × height px, type size).
const ROOMY = [[352, 195, 13.8], [330, 178, 12], [440, 250, 14], [480, 270, 14], [700, 330, 15]];

test('the three lines are named in a few words: the fundal varix with the shunt open and closed, and the esophageal varix', () => {
  const { s } = slideOf('gastric-varices');
  assert.deepEqual(drawnLines(s.tool).map((l) => l.name), NAMES);
  assert.ok(NAMES.every((n) => n.split(' ').length <= 3), 'three words at the most');
});

test('Gastric varices, Varix by HVPG: each name stands on the drawing beside its own line, and no key of the lines stands over the plot', async () => {
  for (const [W, H, f] of ROOMY) {
    const r = await draw('gastric-varices', W, H, f), say = (c) => r.texts.filter((t) => c.test(t.cls)).map((t) => t.txt);
    assert.deepEqual(say(/pcv-name/), NAMES, `${W} × ${H}: the names on the lines`);
    assert.equal(r.alt.hidden, true, `${W} × ${H}: the key of the lines is not shown`);
    assert.equal(r.texts.filter((t) => /^Varix\b/.test(t.txt)).map((t) => t.txt.trim()).join(), 'Varix mm', `${W} × ${H}: the key row is only the reading and its unit`);
    // (Pink, over the green, then blue: the names stand in the same order as their lines, top to bottom, and the first two at the right of the chart.)
    const y = (n) => r.texts.find((t) => t.txt === n).y;
    assert.ok(y(NAMES[0]) < y(NAMES[2]) && y(NAMES[2]) < y(NAMES[1]), `${W} × ${H}: pink over green over blue`);
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
  const keys = NAMES.map((n) => r.texts.find((t) => t.txt === n));
  assert.ok(keys.every(Boolean), 'every line named in it');
  assert.ok(keys[0].y <= keys[1].y && keys[1].y <= keys[2].y, 'top to bottom in the lines\' order');
  assert.equal(new Set(keys.map((k) => k.x)).size <= 2, true, 'each row starts at the same left edge (the swatch column), not ragged');
  for (const k of keys) assert.ok(boxOf(k, 12)[2] <= 315, `${k.txt} stays on the card`);
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
