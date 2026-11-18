// The chart and number rules as the registry runs them over a screen report (src/ui/selfcheck/rules-charts.js), each with a case that must fire and one that must not
// (tests/selfcheck-helpers.js fires(), quiet()), and the charts reader's one rule: it takes the painter's functions and the page's formatters, it copies none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fires, quiet } from './selfcheck-helpers.js';
import { ruleIds, RULES } from '../src/ui/selfcheck/rules.js';
import '../src/ui/selfcheck/plugins.js';

const src = (p) => readFileSync(new URL(`../src/ui/${p}`, import.meta.url), 'utf8');
const chart = (o = {}) => ({ id: 'plane#0', host: 'plane', viewBox: [0, 0, 400, 200], size: null, fit: false, axes: false, keys: null, texts: [], lines: [], rects: [], dots: [], legend: { entries: [], where: 'none' }, ...o });
const word = (text, o = {}) => ({ role: 'other', look: 'plane.zt', text, x: 10, y: 10, anchor: 'start', size: 13, op: 1, fill: 'x', ...o });
const report = (charts = [], numbers = [], cards = []) => ({ v: 1, charts: { charts, numbers }, cards: { cards } });
const KEY = { where: 'html', zones: true, entries: ['Both raised', 'PPG only'] };
const FRAME = { role: 'frame', look: 'plane.zone', x: 0, y: 0, w: 400, h: 200, fill: 'x', op: 1 };
const dot = (x, y) => ({ role: 'point', look: 'plane.pt.dot', x, y, r: 6, fill: 'x', op: 1 });

test('the five chart and number rules are registered, each with its owner and its reason', () => {
  for (const id of ['chart-zone-names-with-legend', 'chart-axes-fit-data', 'number-agree', 'pressure-colour', 'pressure-words']) {
    const r = RULES.find((x) => x.id === id);
    assert.ok(r, id);
    assert.ok(r.owner && r.why && r.kind === 'state', id);
  }
  assert.ok(ruleIds().length >= 5);
});

test('chart-zone-names-with-legend', () => {
  fires('chart-zone-names-with-legend', report([chart({ legend: KEY, texts: [word('Both raised', { role: 'zone-name' })] })]), /Both raised/);
  quiet('chart-zone-names-with-legend', report([chart({ texts: [word('Both raised', { role: 'zone-name' })] })]));   // no legend: the plot names its own zones
  quiet('chart-zone-names-with-legend', report([chart({ legend: KEY, texts: [word('10', { role: 'tick' })] })]));
  quiet('chart-zone-names-with-legend', {});   // (a screen with no charts)
});
test('chart-axes-fit-data', () => {
  const lone = chart({ fit: true, rects: [FRAME], dots: [dot(100, 150)] });
  fires('chart-axes-fit-data', report([lone]), /across axis/);
  quiet('chart-axes-fit-data', report([{ ...lone, fit: false }]));   // axes the chart declared are not judged
  quiet('chart-axes-fit-data', report([chart({ fit: true, rects: [FRAME], dots: [dot(330, 40)] })]));
});
test('number-agree', () => {
  fires('number-agree', report([], [{ where: 'tile', key: 'hvpg', text: '14.2', owner: 'p.js' }, { where: 'header', key: 'hvpg', text: '14.3', owner: 'p.js' }]), /HVPG reads "14.3" in the header/);
  fires('number-agree', report([], [{ where: 'tile', key: 'ppg', text: '9.0', want: ['9.1'], owner: 'p.js' }]), /PPG/);
  quiet('number-agree', report([], [{ where: 'tile', key: 'hvpg', text: '14.2', want: ['14.2'] }, { where: 'header', key: 'hvpg', text: '14.2' }]));
  quiet('number-agree', report());
});
test('pressure-colour', () => {
  fires('pressure-colour', report([], [{ where: 'tile', key: 'hvpg', text: '10.0', rate: 'mid', owner: 'p.js' }]), /HVPG reads 10.0/);
  quiet('pressure-colour', report([], [{ where: 'tile', key: 'hvpg', text: '10.0', rate: 'hi' }, { where: 'tile', key: 'hvpg', text: '5.0', rate: 'ok' }, { where: 'tile', key: 'ppg', text: '5.9', rate: 'ok' }]));
});
test('pressure-words reads the cards\' lines and the charts\' words', () => {
  const card = (text) => [{ kind: 'teaching card', lines: [[text, 16]] }];
  fires('pressure-words', report([], [], card('A PPG >5 mmHg is portal hypertension')), /PPG >5/);
  fires('pressure-words', report([chart({ texts: [word('HVPG ≥ 8')] })]), /HVPG ≥ 8/);
  quiet('pressure-words', report([chart({ texts: [word('PPG ≥12')] })], [], card('HVPG ≥10 mmHg is CSPH; PPG <6 is normal')));
});

test('the charts reader takes the painter\'s functions and the page\'s formatters and copies none of them', () => {
  const deps = src('screen/chart-deps.js');
  for (const fn of ['lookOfPiece', 'wordsOf', 'geoOf', 'transformOf', 'moveAt']) assert.match(deps, new RegExp(`import \\{[^}]*\\b${fn}\\b[^}]*\\} from '../svg-gl.js'`), `${fn} comes from svg-gl.js`);
  assert.match(deps, /tileVal.*from '\.\.\/presenter-cards\.js'/);
  assert.match(deps, /valueText.*from '\.\.\/callout-math\.js'/);
  const reader = src('selfcheck/chart-reader.js');
  for (const fn of ['transformOf', 'moveAt', 'wordsOf', 'viewMap', 'flattenPath']) assert.doesNotMatch(reader, new RegExp(`(function|const)\\s+${fn}\\b`), `${fn} is not copied`);
  // (the pressure cut-offs are read from pressure-cuts.js, never written again here)
  for (const f of ['selfcheck/pressure-rules.js', 'selfcheck/chart-rules.js', 'selfcheck/number-rules.js']) assert.doesNotMatch(src(f), /\b(amber|red)\s*:\s*\d/, `${f} writes no cut-off`);
});
