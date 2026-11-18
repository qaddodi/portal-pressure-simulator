// The screen report's figure, label and camera readers (src/ui/screen/read-*.js, screen-report-recs.md section 1 and 5):
//  1. each reader answers what its painter's own function answers (label-place's hits/overlap/within/boxGap/needsLeader, slide-cam's judgeSlideMove,
//     colormap's pressureColor over colour-bin's qP), on the same inputs;
//  2. each reader imports those functions and defines no copy of them (a source check: a reader that worked a second way would describe a screen nobody sees);
//  3. the text and JSON forms are stable: two reads of one state match exactly, and the JSON round-trips.
import './screen-dom.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boxGap, hits, needsLeader, overlap, within } from '../src/ui/label-place.js';
import { LABEL_DIM, readLabels, labelsText, stateOf } from '../src/ui/screen/read-labels.js';
import { readCamera, cameraText } from '../src/ui/screen/read-camera.js';
import { readFigure, figureText, pressureColourFits } from '../src/ui/screen/read-figure.js';
import { judgeSlideMove, planSlide } from '../src/ui/slide-cam.js';
import { viewGeom } from '../src/ui/cam-arc.js';
import { pressureColor } from '../src/ui/colormap.js';
import { qP } from '../src/ui/colour-bin.js';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const rnd = (() => { let s = 7; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();

// ── 1. the readers answer what the painters' functions answer ──
test('labels: under-card share, off-stage distance, overlap and detachment are label-place.js\'s answers on the same boxes', () => {
  const W = 400, H = 300, S = { x0: 0, y0: 0, x1: W, y1: H };
  for (let n = 0; n < 40; n++) {
    const box = (m) => { const x = rnd() * (W + 2 * m) - m, y = rnd() * (H + 2 * m) - m; return [x, y, x + 20 + rnd() * 60, y + 10 + rnd() * 20]; };
    const a = box(40), b = box(0), card = [rnd() * W, rnd() * H, 0, 0]; card[2] = card[0] + 40 + rnd() * 160; card[3] = card[1] + 40 + rnd() * 160;
    const ax = rnd() * W, ay = rnd() * H;
    const p = readLabels({ stage: { w: W, h: H }, laid: [{ key: 'a', text: 'A', box: a, ax, ay, leader: false }, { key: 'b', text: 'B', box: b, ax: b[0], ay: b[1], leader: true }], cards: { '.pz-data': card } });
    const A = p.items.find((i) => i.key === 'a'), Q = (v) => ({ x0: v[0], y0: v[1], x1: v[2], y1: v[3] }), r1 = (v) => Math.round(v * 10) / 10;
    const qa = Q(a.map(r1)), qb = Q(b.map(r1)), qc = Q(card);
    // under the card: overlap area over the label's area, by label-place's overlap
    const share = overlap(qa, qc) / ((qa.x1 - qa.x0) * (qa.y1 - qa.y0));
    if (share > 0) assert.ok(Math.abs(A.under[0].share - Math.round(share * 100) / 100) < 1e-9, `share ${share}`); else assert.equal(A.under.length, 0);
    // off the stage exactly when label-place's `within` says it is not inside
    assert.equal(within(qa, S), A.off === 0);
    // overlap between the two: hits and an area of at least 1
    const over = hits(qa, qb) && overlap(qa, qb) >= 1;
    assert.equal(A.overlaps.includes('b'), over);
    // detached: no leader, and needsLeader on boxGap
    const gap = boxGap(qa, ax, ay);
    assert.equal(A.gap, r1(gap));
    assert.equal(A.detached, needsLeader(false, r1(gap), false));
  }
});

test('labels: state and alpha. The page\'s classes give the dim, the GPU\'s drawn alpha wins when there is one', () => {
  assert.equal(stateOf(1, false), 'shown');
  assert.equal(stateOf(LABEL_DIM, false), 'dim');
  assert.equal(stateOf(0.4, false), 'fading');
  assert.equal(stateOf(0, false), 'hidden');
  assert.equal(stateOf(1, true), 'hidden');
  const laid = [{ key: 'a', text: 'A', box: [0, 0, 10, 10], ax: 0, ay: 0 }, { key: 'b', text: 'B', box: [20, 0, 30, 10], ax: 20, ay: 0 }];
  const page = readLabels({ stage: { w: 100, h: 100 }, laid, classes: { a: ['lb', 'unlit'], b: ['lb'] } });
  assert.deepEqual(page.items.map((i) => [i.key, i.alpha, i.state, i.alphaFrom]), [['a', LABEL_DIM, 'dim', 'page'], ['b', 1, 'shown', 'page']]);
  const gpu = readLabels({ stage: { w: 100, h: 100 }, laid, classes: { a: ['unlit'] }, drawn: [{ key: 'a', a: 0.5, x: 0, y: 0, w: 10, h: 10 }, { key: 'b', a: 1, x: 20, y: 0, w: 10, h: 10, clipped: true }] });
  assert.deepEqual(gpu.items.map((i) => [i.alpha, i.state, i.alphaFrom, i.clipped]), [[0.5, 'fading', 'gpu', false], [1, 'shown', 'gpu', true]]);
  assert.equal(gpu.drawnByGpu, true);
});

test('labels: settled follows the stage\'s own carry record', () => {
  const base = { stage: { w: 10, h: 10 }, laid: [] };
  assert.equal(readLabels(base).settled, null);
  assert.equal(readLabels({ ...base, carry: { riding: false, job: false, laid: true, stale: false } }).settled, true);
  assert.equal(readLabels({ ...base, carry: { riding: true, job: false, laid: true, stale: false } }).settled, false);
  assert.equal(readLabels({ ...base, carry: { riding: false, job: true, laid: false, stale: false } }).settled, false);
});

function traceOf(from, to, { turn = false, vb = { w: 1000, h: 700, cx: 500, cy: 350 } } = {}) {
  const plan = planSlide(from, to, vb.w), frames = [];
  const out = { k: 0, x: 0, y: 0 };
  for (let i = 0, t = 0; t <= plan.ms + 16; i++, t += 16) {
    const u = Math.min(1, t / plan.ms), e = u * u * u * (u * (6 * u - 15) + 10);
    plan.at(e, out);
    frames.push([t, turn && i === 20 ? out.k * 0.8 : out.k, out.x, out.y]);
  }
  const last = frames.at(-1); Object.assign(last, [last[0], plan.to.k, plan.to.x, plan.to.y]);
  return { plan, frames, held: [], blocked: [], t0: 1000, press: 990, end: 'landed', vb, after: null };
}

test('camera: the move\'s failures are judgeSlideMove\'s, on the same trace, and a read leaves the trace as it was', () => {
  const good = traceOf({ k: 1, x: 0, y: 0 }, { k: 2.5, x: -300, y: -120 }), bad = traceOf({ k: 1, x: 0, y: 0 }, { k: 2.5, x: -300, y: -120 }, { turn: true });
  for (const tr of [good, bad]) {
    const want = judgeSlideMove({ ...tr, stalls: [] }, tr.vb);
    const p = readCamera({ view: 'anatomy', state: { k: 2.5, x: -300, y: -120 }, vb: tr.vb, traces: [tr], moves: [], moving: {} });
    assert.deepEqual(p.traces[0].fails, want);
    const again = readCamera({ view: 'anatomy', state: { k: 2.5, x: -300, y: -120 }, vb: tr.vb, traces: [tr], moves: [], moving: {} });
    assert.deepEqual(again, p, 'two reads of one trace match (the judge\'s stalls are not written into it)');
    assert.equal(tr.stalls, undefined, 'the trace itself is not written to');
  }
  assert.deepEqual(readCamera({ view: 'anatomy', state: null, traces: [good], moves: [], moving: {}, vb: good.vb }).traces[0].fails, []);
  assert.ok(readCamera({ view: 'anatomy', state: null, traces: [bad], moves: [], moving: {}, vb: bad.vb }).traces[0].fails.length > 0, 'the bad move fails the judge');
});

test('camera: the framed world is cam-arc.js\'s viewGeom', () => {
  const vb = { w: 1000, h: 700, cx: 500, cy: 350 }, st = { k: 2, x: -300, y: -120 }, g = viewGeom(st, vb);
  const p = readCamera({ view: 'circuit', state: st, vb, traces: [], moves: [], moving: { gliding: true, left: 300, ms: 900 } });
  assert.deepEqual(p.world, { cx: Math.round(g.cx * 10) / 10, cy: Math.round(g.cy * 10) / 10, w: Math.round(g.w * 10) / 10 });
  assert.equal(p.moving.gliding, true);
  assert.match(cameraText(p), /Moving: a glide, 300 of 900 ms left/);
});

test('figure: the colour a vessel should have is colormap\'s pressureColor over colour-bin\'s qP, within the painter\'s hold', () => {
  for (const p of [0, 3.2, 5, 9.9, 12.4, 20, 28]) {
    assert.equal(pressureColourFits(pressureColor(qP(p)), p), true, `p ${p}`);
    assert.equal(pressureColourFits(pressureColor(qP(p) + 0.5), p), true, 'one bin off is the painter\'s hold');
    assert.equal(pressureColourFits(pressureColor(qP(p) + 6), p), false, 'six mmHg off is a stale paint');
  }
  assert.equal(pressureColourFits('rgb(0,0,0)', NaN), null);
  const row = (id, p, col) => ({ id, kind: 'vein', art: false, from: 'PV', to: 'SPL', w: 6, col: [col, col], opa: 1, p: [p, p] });
  const f = readFigure({ lens: 'pressure', morph: 0.25, view: 'anatomy', rows: [row('PV_L', 12, pressureColor(qP(12))), row('SMV_PV', 12, pressureColor(2))], glows: [['PV_L', 1]] });
  assert.deepEqual(f.vessels.map((v) => [v.id, v.colourFits]), [['PV_L', true], ['SMV_PV', false]]);
  assert.match(figureText(f), /Colour does not match its pressure: .*pressure 12 to 12 mmHg/);
});

// ── 2. each reader imports its painter's functions and defines none ──
const COPIES = { 'screen/read-labels.js': ['hits', 'overlap', 'within', 'boxGap', 'needsLeader'], 'screen/read-camera.js': ['viewGeom', 'judgeSlideMove', 'nearView'], 'screen/read-figure.js': ['pressureColor', 'qP'] };
const FROM = { 'screen/read-labels.js': '../label-place.js', 'screen/read-camera.js': ['../cam-arc.js', '../slide-cam.js'], 'screen/read-figure.js': ['../colormap.js', '../colour-bin.js'] };

test('each reader imports its painter\'s functions and defines no copy of them', () => {
  for (const [file, names] of Object.entries(COPIES)) {
    const text = src(file), imports = [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)].map((m) => [m[2], m[1].split(',').map((s) => s.trim())]);
    for (const from of [].concat(FROM[file])) assert.ok(imports.some(([f]) => f === from), `${file} imports from ${from}`);
    for (const n of names) {
      if (n === 'nearView') continue;   // (used through sameLanding; imported all the same)
      assert.ok(imports.some(([, ns]) => ns.includes(n)), `${file} imports ${n}`);
      assert.ok(!new RegExp(`(function\\s+${n}\\b|(const|let|var)\\s+${n}\\s*=)`).test(text), `${file} does not define its own ${n}`);
    }
  }
  assert.ok(imports(src('screen/read-camera.js')).some(([, n]) => n.includes('nearView')));
});
const imports = (text) => [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)].map((m) => [m[2], m[1].split(',').map((s) => s.trim())]);

test('the stage\'s colour bin is the one in colour-bin.js (the painter and the reader share it)', () => {
  const stage = src('stage.js');
  assert.ok(imports(stage).some(([f, n]) => f === './colour-bin.js' && n.includes('qP')), 'stage.js imports qP from colour-bin.js');
  assert.ok(!/const qP = /.test(stage), 'stage.js keeps no qP of its own');
  assert.equal(qP(5.24), 5); assert.equal(qP(5.26), 5.5); assert.equal(qP(-0.2), -0);
});

test('the readers use no layout read and no requestAnimationFrame (screen reports are asked for, never run in a frame)', () => {
  for (const f of ['screen/read-labels.js', 'screen/read-camera.js', 'screen/read-figure.js', 'selfcheck/rules-labels.js', 'selfcheck/rules-camera.js', 'selfcheck/rules-figure.js']) {
    const t = src(f).replace(/\/\/.*$/gm, '');
    assert.ok(!/getBoundingClientRect|getComputedStyle|offsetWidth|offsetHeight|requestAnimationFrame|getClientRects/.test(t), `${f} reads no layout and asks for no frame`);
  }
});

// ── 3. forms ──
test('JSON is stable and round-trips; text names what is odd', () => {
  const input = { stage: { w: 300, h: 200 }, laid: [{ key: 'n:PV', text: 'Portal vein', box: [10, 10, 80, 26], ax: 5, ay: 5, leader: false }, { key: 'n:SV', text: 'Splenic vein', box: [250, 10, 330, 26], ax: 300, ay: 18, leader: true }], cards: { '.pz-data': [0, 0, 60, 100] }, carry: { riding: false, job: false, laid: true, stale: false } };
  const a = readLabels(input), b = readLabels(JSON.parse(JSON.stringify(input)));
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  const t = labelsText(a);
  assert.match(t, /^Labels: 2 on the figure/);
  assert.match(t, /Label "Portal vein" at 10,10 \(70×16\), 100%.*under the data card/);
  assert.match(t, /Label "Splenic vein".*30 px off the stage/);
});
