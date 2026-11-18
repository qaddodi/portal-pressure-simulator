// The Looks table bench (src/ui/gallery/benches/looks-table.js): the pure parts, in node. Colours parse, the WCAG ratio matches known pairs, the matrix
// marks the tokens that differ between looks, text pairs under 4.5:1 are warned of, and the chart looks resolve for each of the five looks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import bench, { AA, parseColor, contrastRatio, looksMatrix, contrastWarnings, allLookTokens, isColourText, lookContext, chartLookRows, resolveChartLook, chartGroups, formatValue, matrixToText, warningsToText, CONTRAST_PAIRS, LOOK_NAMES } from '../src/ui/gallery/benches/looks-table.js';
import { BENCHES } from '../src/ui/gallery/benches/index.js';
import { LOOK_IDS, lookIdOf } from '../src/ui/theme-tokens.js';
import { LOOKS } from '../src/ui/looks.js';
import { LOOKS as CHART_LOOKS } from '../src/ui/chart-looks/index.js';

test('the bench is the one the list names', () => {
  const entry = BENCHES.find((b) => b.id === 'looks-table');
  assert.equal(bench.id, entry.id);
  assert.equal(bench.title, entry.title);
  assert.equal(typeof bench.mount, 'function');
});

test('the five looks are the app\'s five looks, each with a name', () => {
  assert.deepEqual(LOOK_IDS, LOOKS.map((l) => l.id));
  for (const l of LOOKS) assert.equal(LOOK_NAMES[l.id], l.name);
});

test('parseColor reads hex, rgb, rgba and color-mix, and refuses what is not a colour', () => {
  assert.deepEqual(parseColor('#FFFFFF'), [1, 1, 1, 1]);
  assert.deepEqual(parseColor('#000'), [0, 0, 0, 1]);
  const half = parseColor('rgba(255, 0, 0, .5)');
  assert.deepEqual([half[0], half[1], half[2], half[3]], [1, 0, 0, 0.5]);
  assert.ok(Math.abs(parseColor('color-mix(in srgb, #fff 50%, #000)')[0] - 0.5) < 0.01);
  assert.equal(parseColor('83%'), null);
  assert.equal(parseColor('0 0 0 1px red'), null);
  assert.equal(parseColor(''), null);
  assert.equal(parseColor(null), null);
  assert.deepEqual(parseColor([0.1, 0.2, 0.3]), [0.1, 0.2, 0.3, 1]);
  assert.equal(isColourText('#F1EBE0'), true);
  assert.equal(isColourText('83%'), false);
  assert.equal(isColourText('dark'), false);
});

test('contrastRatio matches WCAG on known pairs', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF').toFixed(2), '21.00');
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF').toFixed(2), '1.00');
  assert.equal(contrastRatio('#767676', '#FFFFFF').toFixed(2), '4.54');
  assert.equal(contrastRatio('#777777', '#FFFFFF').toFixed(2), '4.48');
  assert.equal(contrastRatio('#FFFFFF', '#767676').toFixed(2), '4.54');   // (order does not matter)
  assert.equal(contrastRatio('nope', '#FFF'), null);
  // an ink with an alpha is laid over its ground first: half black on white is a mid grey, 3.98:1
  assert.equal(contrastRatio('rgba(0, 0, 0, .5)', '#FFFFFF').toFixed(2), '3.98');
});

test('looksMatrix marks the rows that differ and keeps the first-seen order', () => {
  const rows = looksMatrix({ light: { a: '1', b: '#fff', c: 'x' }, dark: { a: '1', b: '#000', d: 'y' } });
  assert.deepEqual(rows.map((r) => r.name), ['a', 'b', 'c', 'd']);
  assert.deepEqual(rows.map((r) => r.differs), [false, true, true, true]);   // (c and d are in one look only)
  assert.deepEqual(rows.map((r) => r.colour), [false, true, false, false]);
  assert.deepEqual(rows[1].values, { light: '#fff', dark: '#000' });
});

test('the real tokens: every look has the ink and ground tokens, and most grounds differ', () => {
  const t = allLookTokens();
  assert.deepEqual(Object.keys(t), LOOK_IDS);
  for (const id of LOOK_IDS) for (const n of ['bg', 'surface', 'text', 'text-2', 'text-3', 'accent', 'ok', 'caution', 'danger']) assert.ok(t[id][n], `${id} ${n}`);
  const m = looksMatrix(t);
  const by = Object.fromEntries(m.map((r) => [r.name, r]));
  assert.equal(by.bg.differs, true);
  assert.equal(by.text.differs, true);
  assert.ok(m.length > 100);
  // (a var() token is read through the table: no value is left as var(--x) where the token exists)
  for (const id of LOOK_IDS) assert.ok(!/var\(--vein-portal\)/.test(t[id]['vein-portal']));
});

test('no text token pair the page claims (text on its grounds) is under 4.5:1 in any look', () => {
  assert.deepEqual(contrastWarnings(allLookTokens()), []);
  assert.equal(AA, 4.5);
  assert.ok(CONTRAST_PAIRS.length >= 15);
});

test('contrastWarnings names a failing pair, worst first', () => {
  const ws = contrastWarnings({
    light: { text: '#767676', surface: '#FFFFFF', 'text-2': '#999999' },
    dark: { text: '#FFFFFF', surface: '#000000' },
  }, [['text', 'surface'], ['text-2', 'surface'], ['nothing', 'surface']]);
  assert.equal(ws.length, 1);   // (#767676 on white is 4.54, passes; #999 fails; the pair with a missing token is skipped)
  assert.equal(ws[0].look, 'light');
  assert.equal(ws[0].fg, 'text-2');
  assert.ok(ws[0].ratio < AA);
  assert.match(warningsToText(ws), /Light: --text-2 #999999 on --surface #FFFFFF is 2\.85:1/);
  assert.match(warningsToText([]), /No text token pair/);
});

test('lookContext gives each look the context theme-tokens maps back to that look', () => {
  for (const id of LOOK_IDS) assert.equal(lookIdOf(lookContext(id)), id);
  assert.equal(lookContext('navy').dark, true);
  assert.equal(lookContext('soft').dark, false);
  assert.throws(() => lookContext('sepia'), RangeError);
  assert.equal(lookContext('light', 'curve').host, 'curve');
});

test('chart looks resolve for every look, with differing colours and shared sizes', () => {
  const per = resolveChartLook('plot.bg');
  assert.deepEqual(Object.keys(per), LOOK_IDS);
  assert.notEqual(per.light.fill, per.dark.fill);
  const grid = resolveChartLook('plot.grid.text');
  assert.equal(grid.light.size, grid.black.size);
  assert.deepEqual(resolveChartLook('no.such.look'), {});
});

test('a colour the builder gives each piece reads as "(per piece)" and the resolver\'s warning is not left muted', () => {
  const was = console.warn;
  const per = resolveChartLook('plot.line');
  assert.equal(per.light.stroke, '(per piece)');
  assert.equal(console.warn, was);
});

test('chartLookRows covers every chart look key, and rows say which differ', () => {
  const rows = chartLookRows();
  const keys = new Set(rows.map((r) => r.key));
  // (every key whose entry sets anything resolves to at least one row)
  for (const k of Object.keys(CHART_LOOKS)) if (Object.keys(CHART_LOOKS[k].base || {}).length) assert.ok(keys.has(k), k);
  const bg = rows.find((r) => r.key === 'plot.bg' && r.prop === 'fill');
  assert.equal(bg.differs, true);
  assert.deepEqual(Object.keys(bg.values), LOOK_IDS);
  assert.equal(rows.find((r) => r.key === 'plot.grid.line' && r.prop === 'width').differs, false);
  assert.ok(rows.some((r) => r.differs) && rows.some((r) => !r.differs));
  assert.ok(chartGroups().includes('plot'));
  assert.deepEqual(chartLookRows(LOOK_IDS, '', ['plot.bg']).map((r) => r.prop), ['fill']);
});

test('a host adds its own rows and type size', () => {
  const none = resolveChartLook('plot.grid.text', ['light'], '');
  const talk = resolveChartLook('plot.grid.text', ['light'], 'talk');
  assert.notDeepEqual(none.light, talk.light);
});

test('formatValue and matrixToText', () => {
  assert.equal(formatValue(undefined), '');
  assert.equal(formatValue(3.14159265), '3.1416');
  assert.equal(formatValue([4, 5]), '[4,5]');
  assert.equal(formatValue('rgb(255, 0, 255)'), '(per piece)');
  const text = matrixToText([{ name: 'bg', values: { light: '#fff', dark: '#000' } }], ['light', 'dark'], (r) => `--${r.name}`);
  assert.equal(text, 'name\tLight\tDark\n--bg\t#fff\t#000');
});
