// The guideline path card (F1, 7 Nov 2026): the two Baveno VIII algorithms, the path lit for a patient, the chart's and the map's geometry,
// the looks of the connectors, and the card's wiring (tool kind, stylesheet, the slides that carry it). Numbers are those of guidelines/.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIRST_VISIT, BLEED, WORST, PATHS, ALGOS, mapWordsOf, OUTCOMES, litFirst, litBleed, litOf, outcomeOf, readingFor, chipsOf, patientFor, cpClass } from '../src/ui/path-data.js';
import { slots, flat, edgesOf, ortho, treeBoxes, treePlace, mapPlace, wideFor, mapFor, mapType, shownOf, flow, nodeParas, readParas, ROLE, COL_MIN, NODE_MAX, NODE_MAX_E3, E3_LEAVES } from '../src/ui/tool-path.js';
import { loadMetrics, textCovers } from '../src/ui/text-gl.js';
import { LOOKS, HOSTS } from '../src/ui/chart-looks/index.js';
import { makeCtx, withCtx, resolveProps } from '../src/ui/chart-looks/resolve.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const ids = (t) => flat(t).map((x) => x.n.id);

test('every node of both trees has an id, a tone and (but the root) a name on the small map or a verdict', () => {
  for (const T of [FIRST_VISIT, BLEED]) {
    assert.equal(new Set(ids(T)).size, ids(T).length, 'ids are unique');
    for (const { n } of flat(T)) { assert.ok(['n', 'ok', 'warn', 'bad'].includes(n.tone), n.id); if (n.id !== 'root') assert.ok(mapWordsOf(T === FIRST_VISIT ? 'first-visit' : 'bleed', n.id), `${n.id} has map words`); }
  }
  assert.equal(PATHS['first-visit'].tree, FIRST_VISIT);
  assert.equal(PATHS.bleed.tree, BLEED);
});

test('first visit: the lit path follows Baveno VIII 1.3, 1.15, 1.16 and 1.17', () => {
  const lit = (p) => outcomeOf('first-visit', litFirst({ plt: 200, ...p }));
  assert.equal(lit({ lsm: 8 }), 'a1', 'LSM <10 rules cACLD out');
  assert.equal(lit({ lsm: 12, plt: 160 }), 'a2', 'LSM ≤15 and PLT ≥150 rules CSPH out');
  assert.equal(lit({ lsm: 15, plt: 150 }), 'a2', 'both limits are inclusive');
  assert.equal(lit({ lsm: 12, plt: 149 }), 'a4', 'PLT <150 is the indeterminate zone');
  assert.equal(lit({ lsm: 20 }), 'a4', '15–25 is the indeterminate zone');
  assert.equal(lit({ lsm: 20, ant: true }), 'a3', 'ANTICIPATE ≥75% rules CSPH in');
  assert.equal(lit({ lsm: 20, ssm: true }), 'a3', 'SSM >55 rules CSPH in');
  assert.equal(lit({ lsm: 25 }), 'a6', 'LSM ≥25 rules CSPH in');
  assert.equal(lit({ lsm: 30, bmi: true }), 'a4', 'at a BMI ≥30 the 25 kPa rule does not hold: the indeterminate zone');
  assert.equal(lit({ lsm: 30, bmi: true, ant: true }), 'a3');
  assert.deepEqual([...litFirst({ lsm: 20, plt: 200, ant: true })].sort(), ['a3', 'b3', 'g1', 'root']);
  assert.deepEqual([...litFirst({})], ['root'], 'no reading: only the start is lit');
});

test('bleed: the lit path follows Baveno VIII Fig. 3 and 5.31, 5.35, 5.39 to 5.41', () => {
  const lit = (p) => outcomeOf('bleed', litBleed({ src: 'ov', cp: 8, active: false, ctrl: true, fit: true, hvpg: null, ...p }));
  assert.equal(lit({ cp: 10 }), 'ptips', 'Child–Pugh C 10 meets pTIPS');
  assert.equal(lit({ cp: 13 }), 'ptips');
  assert.equal(lit({ cp: 14 }), 'nopt', 'Child–Pugh C 14–15 is out of range');
  assert.equal(lit({ cp: 8 }), 'nopt', 'B 8 with no active bleeding');
  assert.equal(lit({ cp: 8, active: true }), 'ptips', 'B 8–9 with active bleeding');
  assert.equal(lit({ cp: 9, active: true }), 'ptips');
  assert.equal(lit({ cp: 7, active: true }), 'nopt', 'B 7 is not in B 8–9');
  assert.equal(lit({ cp: 6, hvpg: 20 }), 'ptips', 'HVPG ≥20');
  assert.equal(lit({ cp: 6, hvpg: 19.9 }), 'nopt');
  assert.equal(lit({ cp: 10, fit: false }), 'nopt', 'not fit for TIPS: age ≥75, creatinine ≥3 or heart failure');
  assert.equal(lit({ cp: 10, ctrl: false }), 'fail', 'not controlled: a covered stent, then salvage TIPS');
  // (the gastric half of Fig. 3 is its own chart since E3: path-algos/gastric.js, tests/path-algos-a.test.js)
  assert.deepEqual([...ALGOS.gastric.lit({ src: 'gv', cp: 10, fit: true })].sort(), ['acute', 'root', 'tipsg']);
  assert.equal(litOf('bleed', { src: 'ov', cp: 10, ctrl: true, fit: true }).has('ptips'), true);
});

test('every outcome has a reading in words, and the Child–Pugh class is the points\' class', () => {
  const p1 = { lsm: 31, plt: 120, ant: true, ssm: false, bmi: false }, p2 = { src: 'ov', cp: 10, active: false, hvpg: null, ctrl: true, fit: true };
  for (const [of, p] of [['first-visit', p1], ['bleed', p2]]) for (const k of OUTCOMES[of]) {
    const r = readingFor(of, k, p);
    assert.ok(r.head && r.why && r.next && r.stmt && ['n', 'ok', 'warn', 'bad'].includes(r.tone), `${of}/${k}`);
    assert.doesNotMatch(`${r.why} ${r.next}`, /undefined|NaN|null/, `${of}/${k}`);
  }
  assert.deepEqual(['A5', 'A6', 'B7', 'B9', 'C10', 'C15'].map((s) => cpClass(+s.slice(1)) + s.slice(1)), ['A5', 'A6', 'B7', 'B9', 'C10', 'C15']);
  assert.match(readingFor('bleed', 'ptips', p2).why, /Child–Pugh C10 is C 10–13/);
  assert.match(readingFor('bleed', 'ptips', { ...p2, cp: 8, active: true }).why, /B8 with active bleeding/);
  assert.match(readingFor('bleed', 'ptips', { ...p2, cp: 6, hvpg: 22 }).why, /HVPG 22 is ≥20/);
  assert.match(readingFor('first-visit', 'a3', { ...p1, bmi: true }).why, /ANTICIPATE-NASH/);
  assert.deepEqual(chipsOf('first-visit', p1), ['LSM 31 kPa', 'Platelets 120', 'ANTICIPATE ≥75%']);
  assert.ok(!chipsOf('bleed', p2).some((c) => /HVPG/.test(c)), 'a slide that gives no HVPG shows none');
  assert.ok(chipsOf('bleed', { ...p2, hvpg: 16 }).includes('HVPG 16'));
});

test('the patient is the slide\'s own facts with the model\'s readings over them, as the tiles print them', () => {
  const shown = (k, v) => shownOf(k, v);
  const t = { of: 'first-visit', patient: { ant: true } };
  assert.deepEqual(patientFor(t, { lsm: 20.76, plt: 160.4, ssm: 35.2 }, shown), { lsm: shown('lsm', 20.76), plt: shown('plt', 160.4), bmi: false, ant: true, ssm: false });
  assert.equal(patientFor(t, { lsm: 20, plt: 160, ssm: 55.04 }, shown).ssm, false, '55.0 as the tile prints it is not over 55');
  assert.equal(patientFor(t, { lsm: 20, plt: 160, ssm: 55.6 }, shown).ssm, true);
  assert.equal(patientFor(t, null, shown).lsm, 12, 'no reading: a default, never NaN');
  const b = patientFor({ of: 'bleed', patient: { cp: 10, hvpg: null } }, { hvpg: 16.5 }, shown);
  assert.equal(b.hvpg, null, 'hvpg: null keeps the model\'s HVPG out');
  assert.equal(patientFor({ of: 'bleed', patient: { cp: 10 } }, { hvpg: 16.54 }, shown).hvpg, shown('hvpg', 16.54));
});

test('the chart: a column per leaf, no two nodes of a row overlap, every connector joins a parent to its child', () => {
  for (const T of [FIRST_VISIT, BLEED]) {
    const { n } = slots(T);
    for (const W of [n * COL_MIN, 700, 804, 960]) {
      assert.ok(wideFor(T, W));
      const boxes = treeBoxes(T, W), byRow = new Map();
      for (const [id, b] of boxes) {
        assert.ok(b.left >= 0 && b.left + b.w <= W + 1e-6, `${id} inside the card at ${W}`);
        assert.ok(b.w <= (id === 'root' ? 330 : n <= E3_LEAVES ? NODE_MAX_E3 : NODE_MAX) + 1e-6);
        (byRow.get(b.d) || byRow.set(b.d, []).get(b.d)).push(b);
      }
      for (const row of byRow.values()) { row.sort((a, c) => a.left - c.left); for (let i = 1; i < row.length; i++) assert.ok(row[i].left >= row[i - 1].left + row[i - 1].w + 4, `row ${row[0].d} at ${W}`); }
      const heights = new Map(flat(T).map(({ n: x }) => [x.id, x.id === 'root' ? 60 : 78]));
      const pl = treePlace(T, boxes, heights);
      assert.equal(pl.paths.size, edgesOf(T).length);
      assert.ok(pl.H > 0);
      for (const e of edgesOf(T)) {
        assert.ok(pl.tops.get(e.to) > pl.tops.get(e.from) + 78 - 1, 'a child stands below its parent');
        assert.match(pl.paths.get(e.to), /^M[\d.]+,[\d.]+V/);
      }
    }
    assert.ok(!wideFor(T, n * COL_MIN - 1), 'a narrower card draws the small map');
  }
  assert.equal(slots(FIRST_VISIT).n, 5);
  assert.equal(slots(BLEED).n, 3, 'the oesophageal / GOV1 chart has three leaves (E3)');
  assert.equal(ortho(10, 0, 10, 40), 'M10,0V40');
  assert.match(ortho(10, 0, 50, 40), /^M10,0V12Q10,20 18,20H42Q50,20 50,28V40$/);
});

test('the small map: every node is on it, words and dots stay inside the card, and the leaves are spaced for their words', () => {
  for (const T of [FIRST_VISIT, BLEED]) for (const W of [300, 346, 390]) {
    const m = mapPlace(T, W, 1, 0, (id) => mapWordsOf(T === FIRST_VISIT ? 'first-visit' : 'bleed', id));
    assert.equal(m.nodes.size, flat(T).length);
    assert.equal(m.paths.size, edgesOf(T).length);
    for (const [id, p] of m.nodes) { assert.ok(p.x >= 20 && p.x <= W - 20, `${id} at ${W}`); assert.ok(p.y + (p.words ? 19 + p.words.length * 12.5 : 0) <= m.H, `${id} words inside the height`); }
    const row = new Map();
    for (const p of m.nodes.values()) if (p.words) (row.get(p.y) || row.set(p.y, []).get(p.y)).push([p.x, Math.max(...p.words.map((w) => w.length)) * 6.3]);
    for (const r of row.values()) { r.sort((a, b) => a[0] - b[0]); if (W >= 346) for (let i = 1; i < r.length; i++) assert.ok(r[i][0] - r[i - 1][0] >= (r[i][1] + r[i - 1][1]) / 2 - 2, `words of a row clear each other at ${W}`); }
  }
});

test('a phone and an iPad held upright draw the small map; a wide card on a Mac or a sideways iPad draws the chart', () => {
  assert.equal(mapFor(FIRST_VISIT, 700, true), true, 'iPad upright: a 700 px card is still the map');
  assert.equal(mapFor(BLEED, 800, false), false, 'sideways iPad / Mac');
  assert.equal(mapFor(BLEED, 300, false), true, 'a card too narrow for three columns');
  assert.equal(mapType(340), 12);
  assert.equal(mapType(700), 14);
  const m = mapPlace(BLEED, 700, 14 / 12, 0, (id) => mapWordsOf('bleed', id));
  for (const [id, p] of m.nodes) assert.ok(p.y + (p.words ? (19 + p.words.length * 12.5) * 14 / 12 : 0) <= m.H, id);
  assert.match(read('src/ui/tool-path.js'), /PHONE_MQ/, 'the phone layout query decides');
  assert.match(read('src/ui/util.js'), /PHONE_MQ = `\(max-width: 767px\), \$\{SIDEWAYS_MQ\}, \$\{UPRIGHT_MQ\}`/, 'upright covers portrait iPads up to 1100 px');
});

test('the connectors\' looks resolve in every look, lit or not, with the node\'s colour on the path', () => {
  const ctx = (o = {}) => withCtx(makeCtx({ host: 'path', layout: 'wide', scale: { sm: 12 }, svk: 1 }), { theme: 'light', dark: false, palette: 'navy', ...o });
  for (const theme of ['light', 'soft', 'dark']) for (const k of Object.keys(LOOKS).filter((x) => x.startsWith('path.'))) for (const lit of [false, true]) for (const tone of ['text', 'ok', 'caution', 'danger']) {
    const p = resolveProps(LOOKS[k], ctx({ theme, dark: theme === 'dark' }), { lit }, { tone });
    for (const v of Object.values(p)) assert.doesNotMatch(String(v), /255, 0, 255/, `${k} ${theme} ${tone}`);
  }
  const edge = (lit, tone) => resolveProps(LOOKS['path.edge'], ctx(), { lit }, { tone });
  assert.ok(edge(true, 'danger').width > edge(false, 'danger').width, 'the path is the thicker line');
  assert.notEqual(edge(true, 'danger').stroke, edge(true, 'ok').stroke);
  assert.equal(edge(false, 'danger').stroke, edge(false, 'ok').stroke, 'unlit connectors are all the same grey');
  assert.equal(HOSTS.path(ctx()), 12);
});

test('the card is wired: a tool kind, a stylesheet in the page and the build, the model-riding list, and the slides that carry it', async () => {
  const ext = (await import('../src/ui/ext-teaching.js')).default;
  assert.equal(typeof ext.tools.path.make, 'function');
  assert.equal(ext.tools.path.title({ of: 'bleed' }), 'Acute variceal bleeding');
  assert.equal(ext.tools.path.title({}), 'First visit with cACLD');
  assert.equal(ext.tools.path.title({ title: 'Mine' }), 'Mine');
  assert.match(read('index.html'), /styles\/path\.css/);
  assert.match(read('scripts/build.mjs'), /'styles\/app\.css', 'styles\/path\.css'/);
  assert.match(read('src/ui/presenter.js'), /RIDES_MODEL = new Set\(\[[^\]]*'path'/);
  const { STIFFNESS } = await import('../src/ui/decks/stiffness.js');
  const { BLEED: BLEED_DECK } = await import('../src/ui/decks/variceal-bleed.js');
  const { DECKS } = await import('../src/ui/decks.js');
  const first = STIFFNESS.slides.filter((s) => s.tool?.kind === 'path' && s.tool.of === 'first-visit'), bleed = BLEED_DECK.slides.filter((s) => s.tool?.kind === 'path');
  assert.deepEqual(first.map((s) => s.tool.of), ['first-visit']);
  assert.deepEqual(bleed.map((s) => s.tool.of), ['bleed', 'bleed']);
  assert.ok(STIFFNESS.slides.indexOf(first[0]) === STIFFNESS.slides.findIndex((s) => s.id === 'rules') + 1, 'right after the rules chart');
  assert.deepEqual(bleed.map((s) => outcomeOf('bleed', litBleed({ src: 'ov', ...s.tool.patient }))), ['ptips', 'fail']);
  // every slide in every deck that carries the card names an algorithm of the registry, and has its words
  const all = DECKS.flatMap((d) => d.slides.filter((s) => s.tool?.kind === 'path').map((s) => ({ d, s })));
  assert.ok(all.length >= 3);
  for (const { d, s } of all) {
    assert.ok(ALGOS[s.tool.of], `${d.id}/${s.id}: an algorithm of the registry`);
    assert.ok(s.notes && s.ask && s.line && s.title, `${d.id}/${s.id}`);
    assert.ok(Object.keys(s.tool).every((k) => ['kind', 'of', 'short', 'patient', 'title'].includes(k)), `${d.id}/${s.id}: only the tool's own fields`);
  }
});

test('every word of the card is drawn from Inter\'s outlines and laid out in columns that hold it', async () => {
  await loadMetrics();
  const words = new Set();
  for (const T of [FIRST_VISIT, BLEED]) for (const { n } of flat(T)) for (const s of [n.t, n.r, n.s, n.stmt]) if (s) words.add(s);
  for (const a of Object.values(ALGOS)) for (const w of Object.values(a.mapWords || {})) for (const s of w) words.add(s);
  for (const p of Object.values(PATHS)) { words.add(p.kick); words.add(p.foot); }
  for (const s of words) assert.ok(textCovers(s), `the outlines have every character of "${s}"`);
  for (const T of [FIRST_VISIT, BLEED]) {
    const boxes = treeBoxes(T, T === BLEED ? 804 - 32 : 716 - 32);
    for (const { n } of flat(T)) {
      const b = boxes.get(n.id), f = flow(nodeParas(n, n.id === 'root'), b.w, { align: 'center', gap: 2 });
      assert.ok(f.h >= 16 && f.h < 160, `${n.id}: ${f.h}`);
      for (const i of f.items) assert.ok(i.x >= -0.5, `${n.id}: a line starts inside its column`);
      const ys = [...new Set(f.items.map((i) => Math.round(i.y)))];
      assert.ok(ys.length >= 1 && Math.max(...ys) <= f.h, `${n.id}: every baseline is inside its box`);
    }
  }
  const one = flow([[{ text: 'LSM 15–25 kPa, or platelets <150', face: 't' }]], 128, { align: 'center' });
  assert.equal(new Set(one.items.map((i) => i.y)).size, 2, 'a condition wider than its column wraps');
  assert.equal(one.h, 2 * ROLE.t.lh);
  assert.ok(flow(readParas({ head: 'Rules CSPH in', stmt: '1.16b', why: 'LSM 31 kPa is ≥25.', next: 'Start a beta-blocker, carvedilol preferred.' }), 340, { gap: 4 }).h > ROLE.rh.lh);
  for (const [of, p] of Object.entries(WORST)) assert.ok(litOf(of, p).size >= 2, `${of}: the widest patient is a patient`);
});

test('the card draws only on the GPU: one model, no page text, no layout read', () => {
  const src = read('src/ui/tool-path.js'), css = read('styles/path.css');
  assert.doesNotMatch(src, /requestAnimationFrame|getBoundingClientRect|getComputedStyle|createElementNS|getContext|clientWidth|offsetWidth|offsetHeight|readMetric|readBox|textContent/, 'no raw frame, no layout read, no canvas 2D, no SVG, no page words');
  assert.match(src, /layoutParagraph/);
  assert.match(src, /gl\.show\(/);
  assert.doesNotMatch(css, /font|color|backdrop-filter|filter:|@keyframes|animation:|transition|text-stroke/, 'the stylesheet places a box and nothing else');
  assert.match(read('src/ui/ext-teaching.js'), /warm: \(\) => loadMetrics\(\)/, 'the metrics are fetched before the slide shows');
  for (const k of ['kick', 'pill', 'chips', 'foot', 't', 'r', 's', 'st', 'rh', 'rs', 'rp']) assert.ok(LOOKS[`path.${k}`], `a look for ${k}`);
  assert.ok(LOOKS['path.rule']);
});
