// The all-patients chart (Mohammad, 7 Nov 2026, mock E1): the four patients' HVPG over two years on one slide before the summary table (and the relation chart), with a key of the HVPG, the
// stiffness and the platelets at before, 1 year and 2 years. The numbers are the deck's own slides run again day by day; the drawing is the layout's own
// output on a small stand-in for the browser's DOM (a tree that keeps the attributes, classes and text each element is given), at card widths from a small
// phone to a big Mac, so what is checked is the picture's pieces, with no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const Txt = (text) => ({ text, children: [], attributes: [], getAttribute: () => null });
class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.classSet = new Set(); this.dataset = {}; this.style = {}; this.isConnected = true; this.clientWidth = 0; this.clientHeight = 0; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.classSet = new Set(String(v).split(/\s+/).filter(Boolean)); }
  getAttribute(k) { return this.attrs[k]; }
  append(...k) { for (const c of k) this.children.push(typeof c === 'string' ? Txt(c) : c); }
  hasAttribute(k) { return k in this.attrs; }
  get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); }
  get localName() { return this.tag; }
  get textContent() { return this.children.map((c) => c.text ?? c.textContent).join(''); }
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

const { createCore } = await import('../src/worker-core.js');
const { deckStates } = await import('./deck-states.js');
const { CAUSE_TREATED: DECK } = await import('../src/ui/decks/cause-treated.js');
const { cohortOf, cohortSteps, seriesOf, layout, dodge, at, verdictOf, worstFirst, MONTHS, dayOf, PHONE_W } = await import('../src/ui/allpatients-model.js');
const { build } = await import('../src/ui/visual-allpatients.js');
const { LOOKS } = await import('../src/ui/chart-looks/index.js');
const { default: panels } = await import('../src/ui/ext-panels.js');
const { warmOf } = await import('../src/ui/slide-ext.js');

const slide = DECK.slides.find((s) => s.id === 'allpatients');
const idx = (id) => DECK.slides.findIndex((s) => s.id === id);

let work = null;
async function model() {
  return (work ||= (async () => {
    const made = cohortSteps(slide, DECK), out = [];
    const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = { snap: m.snap, fp: m.fp, trail: m.trail }; });
    core.handle({ type: 'run', running: false });
    await core.handle({ type: 'sequence', steps: made.steps, reqId: 1 });
    core.dispose();
    return { made, out, ser: seriesOf(slide, DECK, out) };
  })());
}

test('the slide sits before the summary table, is a visual the package registers, and warms its runs with the deck', () => {
  assert.equal(idx('allpatients'), idx('relation') - 1);
  assert.equal(idx('relation'), idx('summary') - 1);
  assert.equal(slide.visual, 'allpatients');
  assert.equal(panels.visuals.allpatients.length, 2, 'a visual takes the slide and its context');
  assert.equal(typeof panels.visuals.allpatients.warm, 'function');
  assert.equal(warmOf({ id: 'x' }, {}), null, 'a slide with neither has nothing to warm');
  assert.equal(warmOf({ visual: 'plane' }, {}), null);
  assert.deepEqual(cohortOf(slide).map((p) => p.name), ['Hepatitis C', 'Higher start', 'MASLD', 'Alcohol']);
});

test('the steps are the deck\'s own, slide by slide, each patient from a fresh model, with a reading on each day that moves', () => {
  const { steps, spans } = cohortSteps(slide, DECK);
  assert.deepEqual(spans, [[0, 3], [3, 5], [5, 7], [7, 9]]);
  const sl = (id) => DECK.slides[idx(id)];
  assert.deepEqual([steps[0].preset, steps[0].trail], ['csph', undefined], 'the first visit is the preset alone');
  assert.deepEqual(steps[1].ramp, sl('year1').ramp);
  assert.deepEqual(steps[2].ramp, sl('year2').ramp);
  assert.ok(steps[1].trail && steps[2].trail && steps[1].fine);
  assert.deepEqual([steps[3].params, steps[3].days, steps[3].trail, steps[3].restart], [sl('high').params, 365, undefined, true], 'her settled year is her state before, restarted');
  assert.deepEqual(steps[4].ramp, sl('high2').ramp);
  for (const [i, id] of [[5, 'masld'], [7, 'alcohol']]) {
    const s = sl(id);
    assert.deepEqual([steps[i].preset, steps[i].params, steps[i].relax, steps[i].days, steps[i].ramp, steps[i].restart], [s.preset, s.params, s.relax, s.days, s.ramp, true]);
    const [k, [a, b]] = Object.entries(s.ramp)[0];
    assert.deepEqual(steps[i + 1].ramp, { [k]: [b, b + (b - a)] }, `${id}: the year the model adds goes on at the slide's pace`);
    assert.ok(!steps[i + 1].restart && steps[i + 1].trail);
  }
  assert.equal(cohortSteps({ cohort: [{ name: 'X', slides: ['nope'] }] }, DECK), null, 'a slide the deck lacks is no chart');
  assert.equal(cohortSteps({ cohort: [{ name: 'X', slides: ['before'], pace: true }] }, DECK), null, 'and a year to add needs a ramp to go on from');
});

test('the model\'s numbers: the 1 and 2 year values are the slides\' own, and the three readings come out in the units the tiles print', async () => {
  const { ser } = await model();
  const fps = await deckStates(DECK);
  const fp = (id) => fps[idx(id)];
  assert.equal(ser.length, 4);
  const [hcv, high, masld, alc] = ser;
  assert.deepEqual(hcv.pts.map((p) => p.m), MONTHS, 'a point every three months, to two years');
  assert.deepEqual(masld.pts.map((p) => p.m), MONTHS, 'the year the model adds makes a second year');
  const same = (a, b, msg) => assert.equal(a.toFixed(1), b.toFixed(1), msg);
  same(at(hcv, 0, 'hvpg'), fp('before').hvpg, 'hepatitis C before'); same(at(hcv, 12, 'hvpg'), fp('year1').hvpg, 'a year after cure'); same(at(hcv, 24, 'hvpg'), fp('year2').hvpg, 'two years after cure');
  same(at(hcv, 12, 'lsm'), fp('year1').lsm, 'and the stiffness'); same(at(hcv, 24, 'plt'), fp('year2').plt, 'and the platelets');
  same(at(high, 0, 'hvpg'), fp('high').hvpg, 'the higher start before'); same(at(high, 24, 'hvpg'), fp('high2').hvpg, 'and two years on'); same(at(high, 24, 'lsm'), fp('high2').lsm, 'its stiffness');
  same(at(masld, 12, 'hvpg'), fp('masld').hvpg, 'MASLD a year on'); same(at(masld, 12, 'lsm'), fp('masld').lsm, 'and her stiffness'); same(at(alc, 12, 'hvpg'), fp('alcohol').hvpg, 'Alcohol a year sober'); same(at(alc, 12, 'plt'), fp('alcohol').plt, 'and its platelets');
  assert.ok(at(hcv, 24, 'hvpg') < 10 && at(masld, 24, 'hvpg') < 10 && at(alc, 24, 'hvpg') < 10, 'three are under the CSPH line at two years');
  assert.ok(at(high, 24, 'hvpg') >= 10, 'the higher start is not');
  assert.deepEqual(ser.map((p) => verdictOf(p).ok), [true, false, true, true]);
  assert.equal(verdictOf(masld).text, 'Ruled out');
  assert.deepEqual(worstFirst(ser).map((p) => p.name), ['Higher start', 'Alcohol', 'Hepatitis C', 'MASLD']);
  for (const p of ser) for (const q of p.pts) assert.ok(q.plt > 20 && q.plt < 400 && q.lsm > 2 && q.lsm < 40 && q.hvpg > 0 && q.hvpg < 25, `${p.name} month ${q.m} is a believable reading`);
  assert.equal(dayOf(12), 365);
  assert.equal(dayOf(24), 730);
});

test('the platelets do not dip in the first three months: the MASLD and alcohol patients open on a state settled to their scar', async () => {
  const { ser } = await model();
  for (const name of ['MASLD', 'Alcohol']) {
    const p = ser.find((x) => x.name === name), plt = p.pts.map((q) => q.plt);
    for (let i = 1; i < plt.length; i++) assert.ok(plt[i] >= plt[i - 1] - 0.5, `${name}: the platelets only rise as the scar eases (month ${p.pts[i].m}: ${plt[i - 1].toFixed(1)} to ${plt[i].toFixed(1)})`);
    assert.ok(p.pts.every((q, i) => !i || q.hvpg <= p.pts[i - 1].hvpg + 1e-6 && q.lsm <= p.pts[i - 1].lsm + 1e-6), `${name}: and the HVPG and the stiffness only fall`);
  }
  // (The slide's own opening is that state too, not the preset's: its words quote the stiffness in the gray zone and the platelets under 150.)
  const masld = ser.find((x) => x.name === 'MASLD');
  assert.ok(at(masld, 0, 'lsm') > 14 && at(masld, 0, 'lsm') < 16, 'MASLD opens in the gray zone, near the 15 kPa of her vignette');
  assert.ok(at(masld, 0, 'plt') < 150, 'with platelets under 150');
  // The table's before rows are the same settled states.
  const masld0 = DECK.slides.find((s) => s.visual === 'table').of.find((o) => o.key === 'masld0');
  assert.equal(masld0.relax, DECK.slides[idx('masld')].relax);
  const alc0 = DECK.slides.find((s) => s.visual === 'table').of.find((o) => o.key === 'alc0');
  assert.equal(alc0.relax, DECK.slides[idx('alcohol')].relax);
});

test('relax: days lived at the slide\'s state before its ramp settle the slow organs, and a patient without it is where the preset left her', async () => {
  const run = async (steps) => { const out = []; const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = m.fp; }); core.handle({ type: 'run', running: false }); await core.handle({ type: 'sequence', steps, reqId: 1 }); core.dispose(); return out; };
  const [plain, relaxed, longer] = await Promise.all([run([{ preset: 'csph', params: { cirrhosis: 0.7 } }]), run([{ preset: 'csph', params: { cirrhosis: 0.7 }, relax: 365 }]), run([{ preset: 'csph', params: { cirrhosis: 0.7 }, relax: 730 }])]);
  assert.ok(relaxed[0].plt < plain[0].plt - 5, 'a worse scar than the preset\'s has shrunk the platelets once the spleen has grown to it');
  assert.ok(Math.abs(longer[0].plt - relaxed[0].plt) < 1, 'and a year is enough: two years change them by less than 1');
  const none = await run([{ preset: 'csph', params: { cirrhosis: 0.7 }, relax: 0 }]);
  assert.equal(none[0].plt, plain[0].plt, 'relax: 0 is no relax');
});

test('labels are moved apart and kept in their range', () => {
  const r = dodge([{ y: 100 }, { y: 101 }, { y: 103 }, { y: 200 }], 15, 80, 300).map((x) => x.ly).sort((a, b) => a - b);
  for (let i = 1; i < r.length; i++) assert.ok(r[i] - r[i - 1] >= 15 - 1e-6);
  assert.ok(r[0] >= 80 && r.at(-1) <= 300);
  const squeezed = dodge([{ y: 0 }, { y: 1 }], 50, 0, 40).map((x) => x.ly);
  assert.ok(squeezed[0] >= 0 && squeezed[1] <= 40, 'a column too short for its gap stays in the range');
});

test('the layout at card widths from a small phone to a big Mac: the key and every word stay inside the card and clear of each other', async () => {
  const { ser } = await model();
  for (const W of [320, 343, 358, 390, 430, 559, 560, 640, 760, 860, 1000, 1200]) {
    const G = layout(W, ser, slide.chartFoot);
    assert.equal(G.phone, W < PHONE_W, `${W}: the phone layout under ${PHONE_W} px`);
    assert.ok(G.f >= 12, `${W}: no word under 12 px`);
    assert.ok(G.H > 0 && Number.isInteger(G.H));
    // the key: four blocks, none off the card, none on another
    assert.equal(G.key.blocks.length, 4);
    const boxes = G.key.blocks.map((b) => [b.x, b.y, b.x + b.w, b.y + G.blockH]);
    for (const [i, b] of boxes.entries()) {
      assert.ok(b[0] >= -0.01 && b[2] <= W + 0.01 && b[1] >= -0.01 && b[3] <= G.H + 0.01, `${W}: block ${i} is inside the card (${b.map(Math.round)} in ${W}x${G.H})`);
      for (let j = i + 1; j < boxes.length; j++) { const c = boxes[j]; assert.ok(b[2] <= c[0] + 0.01 || c[2] <= b[0] + 0.01 || b[3] <= c[1] + 0.01 || c[3] <= b[1] + 0.01, `${W}: blocks ${i} and ${j} do not overlap`); }
    }
    // the chart: the plot stays left of the key on a wide card and above it on a phone
    if (G.phone) { assert.equal(G.plotW, W); assert.ok(G.key.blocks.every((b) => b.y >= G.chartH), `${W}: the key is under the chart`); assert.deepEqual(G.key.blocks.map((b) => b.x > 0), [false, true, false, true], `${W}: a grid of two`); }
    else assert.ok(G.key.blocks.every((b) => b.x >= G.plotW), `${W}: the key is beside the chart`);
    // the small print: whole lines inside the card, under the chart (a phone: under the key), not under the key on a wide card
    assert.ok(G.note.lines.length >= 2 && G.note.lines.every((l) => l.length * G.f * 0.5 < (G.phone ? W : G.plotW)), `${W}: the footnote's lines fit their column`);
    assert.ok(G.note.y + G.note.lines.length * G.note.lh <= G.H + 0.01, `${W}: and end inside the card`);
    if (!G.phone) assert.ok(G.note.y >= G.B + G.foot - 0.01, `${W}: under the plot`);
    else assert.ok(G.note.y >= G.key.blocks.at(-1).y + G.blockH, `${W}: under the key`);
    // worst first: the first block is the highest HVPG at two years
    assert.equal(G.key.blocks[0].p.name, 'Higher start');
    assert.equal(G.key.blocks.at(-1).p.name, 'MASLD');
    // the words on the chart: each column apart by a line, inside the plot
    for (const col of Object.values(G.words)) {
      const ys = col.map((w) => w.y).sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 1.2 * G.f - 0.01, `${W}: labels ${i} are a line apart`);
      for (const w of col) assert.ok(w.y >= G.T && w.y <= G.B && w.x < G.R, `${W}: a label is inside the plot`);
    }
    // the scale takes in every reading, and the CSPH line is on it
    for (const p of ser) for (const q of p.pts) assert.ok(G.Y(q.hvpg) >= G.T && G.Y(q.hvpg) <= G.B, `${W}: ${p.name} month ${q.m} is on the plot`);
    assert.ok(G.Y(10) > G.T && G.Y(10) < G.B);
    // months run left to right with room at the end for the 2 year labels
    assert.ok(G.X(24) < G.R - 2.5 * G.f && G.X(0) > G.L);
  }
  // before the numbers are in the frame alone has the same size and scales
  const a = layout(640, null, slide.chartFoot), b = layout(640, ser, slide.chartFoot);
  assert.deepEqual([a.W, a.H, a.f, a.lo, a.hi, a.X(12)], [b.W, b.H, b.f, b.lo, b.hi, b.X(12)]);
  assert.equal(a.key, undefined);
});

const walk = (n, fn) => { fn(n); (n.children || []).forEach((c) => c.tag && walk(c, fn)); };
const cls = (n) => [...n.classSet].join(' ');
function pieces(W, ser) {
  const { svg, H, G } = build(W, ser, slide.chartFoot), out = { texts: [], circles: [], paths: [], lines: [], looks: new Set(), svg, H, G };
  walk(svg, (n) => {
    const a = n.attrs || {};
    if (a['data-look']) out.looks.add(a['data-look']);
    if (n.tag === 'text') out.texts.push({ txt: n.textContent, x: +a.x, y: +a.y, anchor: a['text-anchor'] || 'start', look: a['data-look'], c: a['data-p-c'] });
    if (n.tag === 'circle') out.circles.push({ cx: +a.cx, cy: +a.cy, r: +a.r, c: a['data-p-c'], look: a['data-look'] });
    if (n.tag === 'path') out.paths.push({ d: a.d, c: a['data-p-c'], look: a['data-look'] });
    if (n.tag === 'line') out.lines.push({ look: a['data-look'], cls: cls(n) });
  });
  return out;
}
const box = (t, f) => { const w = [...t.txt].length * f * 0.52, x0 = t.anchor === 'end' ? t.x - w : t.anchor === 'middle' ? t.x - w / 2 : t.x; return [x0, t.y - 0.8 * f, x0 + w, t.y + 0.25 * f]; };
const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

test('the drawing: every look it names is in the table, its words are inside the card and none sits on another, at each card width', async () => {
  const { ser } = await model();
  for (const W of [343, 390, 560, 760, 860, 1100]) {
    const P = pieces(W, ser), { G } = P, f = G.f;
    for (const k of P.looks) assert.ok(LOOKS[k], `${W}: look ${k}`);
    assert.equal(P.svg.attrs.viewBox, `0 0 ${W} ${P.H}`);
    assert.equal(P.svg.dataset.points, String(36));
    assert.match(P.svg.attrs['aria-label'], /Hepatitis C 11\.6, 7\.7, 4\.8; Higher start 14\.7, 12\.8, 10\.8; MASLD 7\.5, 5\.4, 3\.9; Alcohol 13\.7, 10\.3, 6\.4 mmHg/);
    // four lines, two of them with a dotted second year
    assert.equal(P.paths.filter((p) => p.look === 'cv.line').length, 4);
    assert.equal(P.paths.filter((p) => p.look === 'ap.model').length, 2);
    assert.deepEqual(P.paths.filter((p) => p.look === 'ap.model').map((p) => p.c).sort(), ['s3', 's7']);
    // every word inside the card
    for (const t of P.texts) { const b = box(t, f); assert.ok(b[0] >= -1 && b[2] <= W + 1 && b[1] >= -1 && b[3] <= P.H + 1, `${W}: "${t.txt}" is inside the card (${b.map(Math.round)} in ${W}x${P.H})`); }
    // the words of the key and the words on the chart do not sit on one another (the scale's numbers, the axis and the zone words are checked with them)
    const texts = P.texts.filter((t) => t.txt);
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) assert.ok(!hit(box(texts[i], f), box(texts[j], f)), `${W}: "${texts[i].txt}" and "${texts[j].txt}" are apart`);
    // the key says the values in the order before, 1 year, 2 years
    const all = P.texts.map((t) => t.txt);
    for (const v of ['11.6', '7.7', '4.8', '23.7', '15.1', '9.1', '90', '127', '187', '14.7', '12.8', '10.8', '27.0', '25.4', '22.1', '69', '79', '94', '3.9', '7.0', '216', '6.4', '12.5', '149', 'Resolved', 'Persists', 'Ruled out', 'MASLD*', 'Alcohol*', 'Hepatitis C', 'Higher start', 'CSPH', 'No CSPH', '1 year'.replace('1 year', W < PHONE_W ? '1 yr' : '1 year')]) assert.ok(all.includes(v), `${W}: "${v}" is drawn`);
    const small = P.texts.filter((t) => t.look === 'time.tk' && t.x === +G.note.x.toFixed(1)).map((t) => t.txt).join(' ');
    assert.equal(small, slide.chartFoot.join(' '), `${W}: the small print is drawn whole`);
    assert.ok(!all.includes('Hepatitis C*') && !all.includes('Higher start*'), `${W}: only the two the model carries on are starred`);
  }
});

test('without the numbers only the frame is drawn: the scale, the CSPH line and its words', () => {
  const P = pieces(640, null);
  assert.ok(P.G.note.lines.length >= 2);
  assert.equal(P.svg.dataset.points, '0');
  assert.ok(P.paths.length === 0 && P.circles.length === 0);
  const all = P.texts.map((t) => t.txt);
  for (const v of ['4', '6', '8', '10', '12', '14', '16', 'CSPH', 'No CSPH', 'Before', '1 year', '2 years']) assert.ok(all.includes(v), v);
  assert.ok(!all.includes('Hepatitis C'));
});
