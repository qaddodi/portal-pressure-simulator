// The chart rules, the number-agreement rule and the pressure rules of the self-check (src/ui/selfcheck/, plan screen-report-recs.md step 2b). Each rule has a case
// that must fire and one that must not, on plain records; the reader and the rules are then run over a real plane drawn in node (jsdom, the GL stand-in).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneNamesWithLegend, axesFitData, judgeCharts } from '../src/ui/selfcheck/chart-rules.js';
import { pressureColour, pressureWords, leadNumber, NAMED_CUTS } from '../src/ui/selfcheck/pressure-rules.js';
import { numbersAgree } from '../src/ui/selfcheck/number-rules.js';
import { roleOf, ownerOf } from '../src/ui/selfcheck/chart-roles.js';
import { HVPG_CUTS, PPG_CUTS } from '../src/engine/pressure-cuts.js';

const chart = (o = {}) => ({ id: 'plane#0', host: 'plane', aria: '', viewBox: [0, 0, 400, 200], size: null, fit: false, axes: false, keys: null, texts: [], lines: [], rects: [], dots: [], legend: { entries: [], where: 'none' }, ...o });
const text = (t, o = {}) => ({ role: 'other', look: 'plane.zt', text: t, x: 10, y: 10, anchor: 'start', size: 13, op: 1, fill: 'rgba(0, 0, 0, 1)', ...o });

// ── roles ──
test('a look key has a role, and an unlisted one is other', () => {
  assert.equal(roleOf('plane.zt'), 'zone-name');
  assert.equal(roleOf('plane.t'), 'tick');
  assert.equal(roleOf('nope.x'), 'other');
  assert.equal(ownerOf('plane.zt'), 'src/ui/visual-plane.js');
});

// ── chart-zone-names-with-legend ──
const KEY = { where: 'html', entries: ['Both normal', 'PPG only', 'HVPG only', 'Both raised'] };
test('zone names on a plot whose legend names its zones: one finding for each', () => {
  const f = zoneNamesWithLegend(chart({ legend: KEY, texts: [text('Both raised', { role: 'zone-name' }), text('PPG only', { role: 'other', look: 'x.y' }), text('12', { role: 'tick', look: 'plane.t' })] }));
  assert.deepEqual(f.map((x) => x.what), ['Zone name "Both raised"', 'Zone name "PPG only"']);
  assert.equal(f[0].rule, 'chart-zone-names-with-legend');
  assert.equal(f[0].owner, 'src/ui/visual-plane.js');
});
test('a plot with no legend keeps its zone names, and a legend with no zone words on the plot is clean', () => {
  assert.deepEqual(zoneNamesWithLegend(chart({ texts: [text('CSPH', { role: 'zone-name' })] })), []);
  assert.deepEqual(zoneNamesWithLegend(chart({ legend: KEY, texts: [text('HVPG (WHVP − FHVP), mmHg', { role: 'axis-name' }), text('10', { role: 'tick' })] })), []);
  // (the words a chart's own key draws are its legend, not zone names)
  assert.deepEqual(zoneNamesWithLegend(chart({ legend: { where: 'chart', entries: ['Both raised'] }, texts: [text('Both raised', { role: 'legend', look: 'time.key.text' })] })), []);
});

// ── chart-axes-fit-data ──
const frame = { role: 'frame', look: 'plane.zone', x: 0, y: 0, w: 400, h: 200, fill: 'x', op: 1 };
const dot = (x, y) => ({ role: 'point', look: 'plane.pt.dot', x, y, r: 6, fill: 'x', op: 1 });
test('a fitted plane whose points fill its plot is clean, and a plane that is not fitted is never judged', () => {
  assert.deepEqual(axesFitData(chart({ fit: true, rects: [frame], dots: [dot(330, 40), dot(120, 150)] })), []);
  assert.deepEqual(axesFitData(chart({ fit: false, rects: [frame], dots: [dot(40, 190)] })), []);
});
test('a fitted plane left half empty to the right or above its points fires, unless a cut-off line stands in the room', () => {
  const lone = chart({ fit: true, rects: [frame], dots: [dot(100, 150), dot(120, 160)] });
  const f = axesFitData(lone);
  assert.deepEqual(f.map((x) => x.what), ['The across axis', 'The up axis']);
  const cuts = [{ role: 'cut', look: 'plane.cut', x1: 300, y1: 0, x2: 300, y2: 200, stroke: 'x', op: 1 }, { role: 'cut', look: 'plane.cut', x1: 0, y1: 60, x2: 400, y2: 60, stroke: 'x', op: 1 }];
  assert.deepEqual(axesFitData({ ...lone, lines: cuts }), []);
});
test('a point outside the plot fires', () => {
  const f = axesFitData(chart({ fit: true, rects: [frame], dots: [dot(330, 40), dot(420, 100)] }));
  assert.equal(f.length, 1);
  assert.match(f[0].what, /420, 100/);
});
test('judgeCharts runs every chart rule over every chart', () => {
  const bad = chart({ legend: KEY, texts: [text('Both raised', { role: 'zone-name' })] });
  assert.equal(judgeCharts({ charts: [bad, chart()] }).length, 1);
});

// ── pressure-colour ──
const tile = (key, text, rate) => ({ where: 'tile', key, text, rate });
test('the HVPG is amber from over 5 and red from 10 on the number as shown, the PPG from 6 and 12', () => {
  const ok = [tile('hvpg', '5.0', 'ok'), tile('hvpg', '5.1', 'mid'), tile('hvpg', '9.9', 'mid'), tile('hvpg', '10.0', 'hi'), tile('ppg', '5.9', 'ok'), tile('ppg', '6.0', 'mid'), tile('ppg', '11.9', 'mid'), tile('ppg', '12.0', 'hi'), tile('pv', '10.0', 'ok'), tile('pv', '15', 'hi'), tile('hvpg', '—', 'ok'), tile('hvpg', '7', 'plain'), tile('lsm', '40', 'ok')];
  assert.deepEqual(pressureColour(ok), []);
});
test('a pressure whose colour is not its cut-offs fires and names the number and both ratings', () => {
  const f = pressureColour([tile('hvpg', '10.0', 'mid'), tile('ppg', '6.0', 'ok'), { where: 'header', key: 'eus', text: '5.1', rate: 'ok' }]);
  assert.equal(f.length, 3);
  assert.match(f[0].where, /rated mid, the cut-offs rate it hi/);
  assert.equal(f[0].rule, 'pressure-colour');
  assert.equal(f[2].owner, 'src/ui/presenter-cards.js');
});
test('a severity word is read as its rating', () => {
  assert.equal(pressureColour([tile('ppg', '13', 'caution')]).length, 1);
  assert.equal(pressureColour([tile('ppg', '13', 'danger')]).length, 0);
});

// ── pressure-words ──
test('words that name the app\'s own cut-offs are clean, any other cut-off for the HVPG or PPG fires', () => {
  const t = (text) => [{ where: 'the card', text }];
  assert.deepEqual(pressureWords(t(`HVPG ≥${HVPG_CUTS.red} mmHg, HVPG >${HVPG_CUTS.amber}, HVPG <12, PPG ≥${PPG_CUTS.red}, PPG <${PPG_CUTS.amber}, HVPG <20`)), []);
  const f = pressureWords(t('PPG >5 mmHg is portal hypertension; HVPG ≥ 8 is not'));
  assert.deepEqual(f.map((x) => x.what), ['"PPG >5" in the card', '"HVPG ≥ 8" in the card']);
  assert.ok(NAMED_CUTS.hvpg.has(5) && NAMED_CUTS.ppg.has(6) && !NAMED_CUTS.ppg.has(5));
});
test('leadNumber reads the first number, a minus sign and thousands, and nothing from a dash', () => {
  assert.equal(leadNumber('−3.5 mmHg'), -3.5);
  assert.equal(leadNumber('1,250 mL'), 1250);
  assert.equal(leadNumber('—'), null);
});

// ── number-agree ──
const FMT = { tile: (k, fp) => String(fp[k].toFixed(1)), word: (k, fp) => [fp[k].toFixed(1), String(Math.round(fp[k]))], value: (k, fp) => +fp[k].toFixed(1) };
test('every place a reading is written is the model\'s number as the tile table prints it', () => {
  const fp = { hvpg: 14.23, ppg: 9.04 };
  const shown = [{ where: 'tile', key: 'hvpg', text: '14.2' }, { where: 'header', key: 'ppg', text: '9.0' }, { where: 'words', key: 'hvpg', text: '14.2 mmHg' }, { where: 'words', key: 'hvpg', text: '14 mmHg' },
    { where: 'chart', key: 'hvpg', text: '14.2' }, { where: 'chart', key: 'ppg', text: '9', placed: true }];
  assert.deepEqual(numbersAgree(shown, fp, FMT), []);
});
test('a number that is not the model\'s fires, wherever it is written, and says which place and file', () => {
  const fp = { hvpg: 14.23, ppg: 9.04 };
  const f = numbersAgree([{ where: 'tile', key: 'hvpg', text: '14.3', owner: 'a.js' }, { where: 'words', key: 'ppg', text: '12 mmHg', owner: 'b.js' }, { where: 'chart', key: 'ppg', text: '8.0', placed: true, chart: 'plane#0', owner: 'c.js' }, { where: 'tile', key: 'nope', text: '1' }], fp, FMT);
  assert.equal(f.length, 3);
  assert.deepEqual(f.map((x) => x.owner), ['a.js', 'b.js', 'c.js']);
  assert.match(f[0].why, /14\.2/);
});
