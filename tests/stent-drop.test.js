// The stent's pressure staircase (src/ui/stent-drop-pic.js, 17 Nov 2026; "I don't understand that chart", Mohammad): it hangs under the side view on its x, the line of pressure left
// falls from the PPG to 0 and is drawn in each part's colour where that part takes it, and a key of five columns prints each part. These tests keep to what jsdom can know: the layout never
// collides or clips at any size of words (9 to 14 units, a phone to a Mac), the staircase starts at the PPG and ends at the IVC on the stent's own x, the printed parts add up to the PPG,
// and every number is the engine's (the tiles').
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { fingerprintOf } from '../src/engine/fingerprint.js';
import { deepMerge, sanitizeParams } from '../src/engine/scenario.js';
import { DROP, COLS, DROP_NAMES, keyCols } from '../src/ui/stent-drop-pic.js';
import { stentSpan, dropTop, BAR, SIDE, VW } from '../src/ui/tool-stent.js';

const tipsAt = (patch = {}) => {
  const e = new Engine(); e.loadPreset('cirr-decomp');
  e.setParams(sanitizeParams(deepMerge(e.params, { tips: { on: true, d: 10 }, stenosis: { TIPS: 0.5 }, pulsatile: false, respiration: false, ...patch })));
  e.settle(3);
  const m = computeMetrics(e);
  return { e, m, fp: fingerprintOf(m, { params: e.params }) };
};

async function made() {
  const { JSDOM } = await import('jsdom');
  const w = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true }).window;
  Object.assign(globalThis, { window: w, document: w.document, Element: w.Element, MutationObserver: w.MutationObserver, getComputedStyle: w.getComputedStyle.bind(w),
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame: (f) => setTimeout(f, 16), ResizeObserver: class { observe() {} disconnect() {} }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }) });
  w.document.documentElement.style.setProperty('--ramp-pressure', '#B8D5ED 0, #85B6E9 5, #6787E8 10, #925CDD 12, #A4216E 20, #680C2F 30');
  w.document.documentElement.style.setProperty('--ramp-velocity', '#C9973F 0, #E2CF9A .2, #5DB4A4 .5, #9A7ED6 .8, #4A2A8C 1');
  const { createStent } = await import('../src/ui/tool-stent.js');
  const { store } = await import('../src/ui/store.js');
  return { card: createStent(), store, doc: w.document };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const look = (card, k) => [...card.el.querySelectorAll(`[data-look="${k}"]`)];

test('the key never collides or clips: five columns inside the picture, each as wide as its words, at every size of words from a Mac to a phone', () => {
  const lefts = new Float64Array(COLS.length + 1);
  for (let fs = 9; fs <= 14.01; fs += 0.25) {
    const kf = keyCols(fs, lefts);
    assert.ok(kf <= fs + 1e-9 && kf >= 8, `the key's words are ${kf.toFixed(2)} units at ${fs}`);
    assert.ok(lefts[0] >= DROP.gutter - 1e-9 && lefts[COLS.length] <= VW - DROP.gutter + 1e-9, `inside the picture at ${fs}: ${lefts[0]} to ${lefts[COLS.length]}`);
    for (let c = 0; c < COLS.length; c++) {
      const room = lefts[c + 1] - lefts[c], words = Math.max(DROP_NAMES[COLS[c]].length, 4) * 0.62 * kf + 2 * DROP.dotR + 3;
      assert.ok(room >= words - 1e-9, `column ${COLS[c]} has ${room.toFixed(1)} units for ${words.toFixed(1)} at ${fs}`);
    }
  }
});

test('the rows fit the picture\'s height for words up to 14 units, and nothing overlaps vertically', () => {
  const half = 0.62 * 14 / 1.2;   // (half a line of the biggest words)
  assert.equal(BAR.h, DROP.h);
  assert.ok(DROP.yT - 0.8 * 14 - half >= 0, 'the PPG word above the plateau, even at the top of the plot, is inside the picture');
  assert.ok(DROP.yB + 3 < DROP.baseY - half, 'the portal vein, stent and IVC words are under the baseline');
  assert.ok(DROP.baseY + half < DROP.nameY - half, 'and the key under them');
  assert.ok(DROP.nameY + half < DROP.valY - half, 'its numbers under its names');
  assert.ok(DROP.valY + half < DROP.totY - half, 'the stent\'s own drop under them');
  assert.ok(DROP.totY + half <= DROP.h, 'nothing is cut at the bottom');
  assert.ok(DROP.h <= 170, 'no taller than it needs');
});

test('the three words under the baseline do not touch, for any stent length, at the biggest words', () => {
  const w = (t, fs) => t.length * 0.62 * fs;
  for (const fs of [9, 12, 14]) for (const len of [4, 6, 8, 10]) {
    const [a, b] = stentSpan(len), mid = (a + b) / 2;
    assert.ok(4 + w('Portal vein', fs) < mid - w('Stent', fs) / 2, `Portal vein and Stent at ${fs}, ${len} cm`);
    assert.ok(mid + w('Stent', fs) / 2 < VW - 4 - w('IVC', fs), `Stent and IVC at ${fs}, ${len} cm`);
  }
});

test('the staircase stands on the side view\'s x: the guides are the stent\'s two ends, the veins the stubs either side', async () => {
  const { card, store, doc } = await made();
  doc.body.append(card.el);
  const { e, fp } = tipsAt();
  store.set({ params: e.params });
  card.configure({ vessel: 'TIPS', show: ['lumen', 'loss'], to: 'ppg' });
  card.pin(fp);
  await wait(1500);
  const g = look(card, 'stent.drop.guide').slice(1);   // (the first is the PPG's level)
  assert.equal(g.length, 2);
  const lum = look(card, 'stent.lumen')[0]._pts.buf, ends = [lum[0], lum[2 * 96]];
  const [x0, x1] = stentSpan(e.params.stentGeom?.TIPS?.len ?? 8);
  assert.ok(Math.abs(g[0]._pts.buf[0] - ends[0]) < 1e-6, `the portal end: ${g[0]._pts.buf[0]} and the lumen's ${ends[0]}`);
  assert.ok(Math.abs(g[1]._pts.buf[0] - ends[1]) < 1e-6, `the hepatic end: ${g[1]._pts.buf[0]} and the lumen's ${ends[1]}`);
  assert.ok(Math.abs(g[0]._pts.buf[0] - x0) < 1e-6 && Math.abs(g[1]._pts.buf[0] - x1) < 1e-6);
  const line = look(card, 'stent.drop.line')[0]._pts;
  assert.equal(line.n, 161);
  assert.ok(Math.abs(line.buf[0]) < 1e-6 && Math.abs(line.buf[2 * 160] - VW) < 1e-6, 'from the left edge of the portal vein\'s stub to the right edge of the hepatic vein\'s');
  card.dispose();
});

test('the line starts at the PPG, ends at the IVC, and only falls; each part\'s colour is on the line where it is taken, and the numbers add up to the PPG', async () => {
  const { card, store, doc } = await made();
  doc.body.append(card.el);
  for (const patch of [{}, { stenosis: { TIPS: 0.8 } }, { stenosis: { TIPS: 0 } }, { tips: { on: true, d: 8 }, stenosis: { TIPS: 0.3 }, stentGeom: { TIPS: { len: 10, waist: 3, trans: 1 } } }]) {
    const { e, m, fp } = tipsAt(patch);
    store.set({ params: { ...e.params } });
    card.configure({ vessel: 'TIPS', show: ['lumen', 'loss'], to: 'ppg' });
    card.pin(fp);
    await wait(1500);
    const L = look(card, 'stent.drop.line')[0]._pts.buf;
    const top = (DROP.yB - DROP.yT);
    assert.ok(Math.abs(L[2 * 160 + 1] - DROP.yB) < 0.01, 'the line ends on the IVC\'s baseline');
    const ppg = m.ppg, pHi = dropTop(ppg), yStart = DROP.yB - (ppg / pHi) * top;
    assert.ok(Math.abs(L[1] - yStart) < 0.15, `it starts at the PPG ${ppg.toFixed(1)} of ${pHi}: y ${L[1].toFixed(2)} for ${yStart.toFixed(2)}`);
    for (let i = 1; i <= 160; i++) assert.ok(L[2 * i + 1] >= L[2 * i - 1] - 1e-9, `the pressure only falls (sample ${i})`);
    for (let i = 0; i <= 160; i++) { assert.ok(L[2 * i] >= -1e-6 && L[2 * i] <= VW + 1e-6); assert.ok(L[2 * i + 1] >= DROP.yT - 1e-6 && L[2 * i + 1] <= DROP.yB + 1e-6); }
    // the strokes: fixed length, the pen lifted where a part takes nothing, and on the line (the same points) where it does
    for (const k of COLS) {
      const s = look(card, `stent.drop.s.${k}`)[0]._pts;
      assert.equal(s.n, 161);
      for (let i = 0; i <= 160; i++) if (!Number.isNaN(s.buf[2 * i])) assert.ok(s.buf[2 * i] === L[2 * i] && s.buf[2 * i + 1] === L[2 * i + 1], `${k} sits on the line at ${i}`);
    }
    const steps = (k) => { const b = look(card, `stent.drop.s.${k}`)[0]._pts.buf; let n = 0; for (let i = 0; i <= 160; i++) if (!Number.isNaN(b[2 * i])) n++; return n; };
    assert.ok(steps('out') > 40, 'the veins outside take their share along both stubs');
    assert.ok(steps('wall') > 20 && steps('wall') < 110, 'the friction is along the stent');
    assert.ok(steps('tract') >= 2 && steps('tract') < 12 && steps('ends') >= 2 && steps('ends') < 12, 'the tract and the way in and out are a step at each end');
    // the key's numbers: the printed parts add up to the PPG the card prints
    const vals = look(card, 'stent.lab').map((p) => +p._t), ppgWord = look(card, 'stent.mark.text').map((p) => p._t).find((t) => /^PPG /.test(t));
    assert.equal(vals.length, 5);
    const sum = vals.reduce((a, b) => a + b, 0), printed = parseFloat(ppgWord.slice(4));
    assert.ok(Math.abs(sum - printed) < 0.051, `${vals.join(' + ')} = ${sum.toFixed(1)} against ${ppgWord}`);
    const dpWord = look(card, 'stent.mark.text').map((p) => p._t).find((t) => /^Across the stent /.test(t));
    assert.equal(parseFloat(dpWord.slice(17)), Math.round(fp.tipsDp * 10) / 10, 'the stent\'s own drop is the tile\'s');
    assert.ok(Math.abs(vals.slice(1).reduce((a, b) => a + b, 0) - parseFloat(dpWord.slice(17))) < 0.051, 'and the four parts of the stent add up to it');
  }
  card.dispose();
});

test('"to: stent" starts the staircase at the stent\'s own drop and takes the outside out, and the pieces stay the same', async () => {
  const { card, store, doc } = await made();
  doc.body.append(card.el);
  const { e, fp } = tipsAt();
  store.set({ params: e.params });
  card.configure({ vessel: 'TIPS', show: ['loss'], to: 'ppg' });
  card.pin(fp);
  await wait(1500);
  const n = look(card, 'stent.drop.line')[0]._pts.n, count = card.el.querySelectorAll('[data-look]').length;
  const outVal = () => +look(card, 'stent.lab')[0]._t, ppgOp = () => look(card, 'stent.mark.text').find((p) => /^PPG /.test(p._t))._g.opacity;
  assert.ok(outVal() > 0.3 && ppgOp() === 1);
  card.configure({ vessel: 'TIPS', show: ['loss'], to: 'stent' });
  await wait(1500);
  assert.equal(outVal(), 0, 'nothing outside');
  assert.equal(ppgOp(), 0, 'the PPG word fades');
  assert.equal(look(card, 'stent.drop.s.out')[0]._g.opacity, 0);
  assert.equal(look(card, 'stent.drop.line')[0]._pts.n, n); assert.equal(card.el.querySelectorAll('[data-look]').length, count);
  const L = look(card, 'stent.drop.line')[0]._pts.buf, dp = fp.tipsDp, pHi = dropTop(dp);
  assert.ok(Math.abs(L[1] - (DROP.yB - (dp / pHi) * (DROP.yB - DROP.yT))) < 0.15, 'it starts at the stent\'s own drop');
  card.dispose();
});

test('a stent with no narrowing has no jet to draw, a tight one does, and the card says no HVPG anywhere', async () => {
  const { card, store, doc } = await made();
  doc.body.append(card.el);
  for (const [s, jet] of [[0, false], [0.7, true]]) {
    const { e, fp } = tipsAt({ stenosis: { TIPS: s } });
    store.set({ params: { ...e.params } });
    card.configure({ vessel: 'TIPS', show: ['loss'], to: 'ppg' });
    card.pin(fp);
    await wait(1500);
    const op = look(card, 'stent.drop.s.jet')[0]._g.opacity;
    assert.equal(op > 0.5, jet, `the jet's stroke at ${s}: ${op}`);
  }
  const words = [...card.el.querySelectorAll('[data-look]')].filter((p) => p._t != null).map((p) => p._t).join(' | ');
  assert.doesNotMatch(words, /HVPG|wedge/i);
  assert.doesNotMatch(words, /Along the length|Local/);
  card.dispose();
});

test('at every card width from 280 to 520 px no word clips or touches another: the key, the baseline words and the PPG and total lines', () => {
  const lefts = new Float64Array(COLS.length + 1);
  for (const px of [280, 288, 296, 304, 312, 320, 328, 336, 340, 344, 352, 360, 375, 390, 400, 412, 420, 440, 460, 480, 500, 520]) {   // (375: an iPhone's 340 px card)
    const fs = Math.min(14, Math.max(9, 12 / (px / VW))), kf = keyCols(fs, lefts), cw = 0.62;   // (the card's own rule: 12 px of words on screen, held to 9 to 14 units)
    // the key: each column holds its longest word, the columns do not overlap, inside the gutters
    for (let c = 0; c < COLS.length; c++) {
      const used = Math.max(DROP_NAMES[COLS[c]].length, 4) * cw * kf + 2 * DROP.dotR + 3;
      assert.ok(lefts[c] + used <= lefts[c + 1] + 1e-9, `${COLS[c]} fits its column at ${px} px (${used.toFixed(1)} of ${(lefts[c + 1] - lefts[c]).toFixed(1)})`);
    }
    assert.ok(lefts[0] >= DROP.gutter - 1e-9 && lefts[COLS.length] <= VW - DROP.gutter + 1e-9, `inside the picture at ${px} px`);
    // the words on screen stay readable: at least 9 px
    assert.ok(kf * (px / VW) >= 9, `${(kf * (px / VW)).toFixed(1)} px words at ${px} px`);
    // the total line and the PPG line fit the width
    assert.ok('Across the stent 99.9 mmHg'.length * cw * Math.min(fs, (VW - 2 * DROP.gutter) / (30 * 0.6)) <= VW - 2 * DROP.gutter, `the stent's own drop fits at ${px} px`);
    // the baseline words, for the shortest and the longest stent
    for (const len of [4, 10]) {
      const [a, b] = stentSpan(len), mid = (a + b) / 2, w = (t) => t.length * cw * fs;
      assert.ok(4 + w('Portal vein') < mid - w('Stent') / 2 && mid + w('Stent') / 2 < VW - 4 - w('IVC'), `the three words at ${px} px, ${len} cm`);
    }
    // the rows are inside the picture and apart
    const half = (cw * fs) / 1.2;
    assert.ok(DROP.yT - 0.8 * fs - half >= 0 && DROP.totY + half <= DROP.h && DROP.valY + half < DROP.totY - half && DROP.nameY + half < DROP.valY - half, `the rows at ${px} px`);
  }
});

test('the staircase takes the card\'s width, never a width of its own: its box is a shape (an aspect ratio), so the Tests card\'s width-first rule (app-06-plate.css) fills it at 375 px and 520 px alike', async () => {
  const { card, doc } = await made();
  doc.body.append(card.el);
  card.configure({ vessel: 'TIPS', show: ['lumen', 'loss'], to: 'ppg' });
  const stage = [...card.el.querySelectorAll('.sc-stage')].find((s) => s.querySelector('[data-look="stent.drop.line"]'));
  assert.ok(stage, 'the staircase has its own stage');
  assert.equal(stage.style.aspectRatio.replace(/\s/g, ''), `${VW}/${BAR.h}`);
  assert.equal(stage.style.width, '', 'no width written on it');
  assert.ok(card.ratio() > 0.9 && card.ratio() < 1.6, `the card's ratio ${card.ratio().toFixed(2)} (width over height of its pictures together)`);
  card.dispose();
});
