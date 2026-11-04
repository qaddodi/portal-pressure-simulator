// The pressure ladder's and the portal-blood bar's looks in code (chart-looks-in-code plan WP6): the table resolves in every look with no missing
// token, and the cascade's winners are as app.css had them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOKS } from '../src/ui/chart-looks/index.js';
import { makeCtx, withCtx, resolveProps, hostSizeFor } from '../src/ui/chart-looks/resolve.js';

const base = (over = {}, local = {}) => withCtx(makeCtx({ host: 'prof', layout: 'wide', scale: { sm: 12.5, chCap: 12, lab: 13, cap: 14 }, ...local }), { theme: 'light', dark: false, palette: 'navy', ...over });
const ctx = (over = {}, local = {}) => base({ hostPx: 16, ...over }, local);
const P = (k, st = {}, c = ctx(), params = { tone: 'tr-var' }) => resolveProps(LOOKS[k], c, st, params);
const mine = Object.keys(LOOKS).filter((k) => /^(prof|flows)\./.test(k));

test('each entry resolves in every look and state with no missing token', () => {
  assert.ok(mine.length > 25);
  for (const theme of ['light', 'soft', 'dark']) for (const palette of ['navy', 'black']) for (const k of mine) for (const st of [{}, { rate: 'mid' }, { rate: 'hi' }]) {
    const p = P(k, st, ctx({ theme, palette, dark: theme === 'dark' }), { tone: 's1' });
    for (const v of Object.values(p)) assert.doesNotMatch(String(v), /255, 0, 255/, `${k} ${theme}/${palette}`);
  }
});
test('a part of the ladder in a wide screen\'s cell: lines grow with the type, never thinner than at 12 px', () => {
  const cell = ctx({ layout: 'wide', in: 'cell' });
  assert.equal(P('prof.line', {}, cell).width, 3.2, 'max(3px, .2em) of 16');
  assert.equal(P('prof.line', {}, ctx()).width, 3, 'outside a cell 3 px');
  assert.equal(P('prof.hl', {}, cell).width, 2.24);
  assert.deepEqual(P('prof.hl', {}, cell).dash, [5.28, 6.72], 'max(4px, .33em) max(5px, .42em)');
  assert.deepEqual(P('prof.bf', {}, cell).dash, [2, 6], 'max(1.5px, .125em) max(4.5px, .375em)');
  assert.equal(P('prof.br.path', {}, cell).width, 1.76);
  assert.equal(P('prof.brace.path', {}, cell).width, 1.76);
  assert.equal(P('prof.axis', {}, cell).width, 1.2);
  assert.equal(P('plot.grid.line', {}, withCtx(cell, { host: 'prof' })).width, 1.2);
  assert.equal(P('prof.line', {}, ctx({ layout: 'stack', in: 'cell' })).width, 3, 'a stacked card keeps the plain one');
  assert.equal(P('prof.hl').dash.join(), '4,5');
  assert.equal(P('prof.bf').dash.join(), '1.5,4.5');
  const twelve = ctx({ layout: 'wide', in: 'cell', hostPx: 12 });
  assert.equal(P('prof.line', {}, twelve).width, 3);
  assert.equal(P('prof.hl', {}, twelve).width, 1.75);
});
test('readings, blocks and brackets: the outline, the ring and the rating\'s colour', () => {
  assert.equal(P('prof.v').weight, 700);
  assert.equal(P('prof.v').width, 4, 'the halo behind a reading stays 4 px');
  assert.equal(P('prof.v').paintStroke, true);
  assert.notEqual(P('prof.strip.v').stroke, P('prof.v').stroke, 'the strip\'s outline is the cell\'s colour (surface-2)');
  assert.equal(P('prof.blk').width, 1.2);
  assert.equal(P('prof.blk').strokeOpacity, 0.7);
  assert.equal(P('prof.fill').opacity, 0.16);
  assert.equal(P('prof.br.path', { rate: 'mid' }).stroke, P('prof.br.path', { rate: 'mid' }).stroke);
  assert.notEqual(P('prof.br.path', { rate: 'mid' }).stroke, P('prof.br.path', { rate: 'hi' }).stroke);
  assert.notEqual(P('prof.br.path', { rate: 'mid' }).stroke, P('prof.br.path').stroke);
  assert.equal(P('prof.br.text', { rate: 'hi' }).fill, P('prof.br.path', { rate: 'hi' }).stroke, 'a bracket\'s words and bar share the rating\'s colour');
  assert.notEqual(P('prof.br.k', { rate: 'hi' }).fill, P('prof.br.text', { rate: 'hi' }).fill, 'the key keeps its own ink');
  assert.equal(P('prof.br.k').weight, 600);
});
test('the zones\' tints and the pills\' tones', () => {
  assert.equal(P('prof.zone.liver').fill, 'rgba(176, 96, 84, 0.09)');
  assert.equal(P('prof.zone.pre').fill, 'rgba(92, 128, 186, 0.1)');
  assert.equal(P('prof.zone.post').fill, 'rgba(84, 164, 142, 0.1)');
  assert.equal(P('prof.zone.text').weight, 600);
  assert.equal(P('prof.zone.text').size, undefined, 'the zone name\'s size is the piece\'s own');
  const ok = P('prof.pill.rect'), mid = P('prof.pill.rect', { rate: 'mid' }), hi = P('prof.pill.rect', { rate: 'hi' });
  assert.equal(new Set([ok.fill, mid.fill, hi.fill]).size, 3);
  assert.equal(ok.width, 1);
  assert.notEqual(P('prof.pill.text', { rate: 'hi' }).fill, P('prof.pill.text').fill);
  assert.equal(P('prof.pill.k').weight, 600);
});
test('the bar: a part\'s colour is its token, the pill keeps the text colour', () => {
  const f = ctx({}, { host: 'flows' });
  const a = P('flows.seg', {}, f, { tone: 'tr-var' }), b = P('flows.seg', {}, f, { tone: 's1' });
  assert.notEqual(a.fill, b.fill);
  assert.match(a.fill, /^color\(srgb /);
  assert.equal(P('flows.pill.text', {}, f).fill, P('flows.lab.n', {}, f).fill, 'the words stay in the text colour');
  assert.equal(P('flows.lab.n').weight, 500);
  assert.equal(P('flows.lab.v').weight, 700);
  assert.equal(P('flows.lab.n').width, 3, 'a halo of 3 px');
  assert.deepEqual(P('flows.mk.line').dash, [4, 5]);
  assert.equal(P('flows.mk.line').width, 1.75);
  assert.equal(P('flows.lead').width, 1);
});
test('the plot pieces take the ladder\'s type: 1 em of the chart', () => {
  assert.equal(P('plot.grid.text').size, 16);
  assert.equal(P('plot.unit').size, 16);
  assert.equal(P('plot.grid.text', {}, withCtx(ctx(), { host: 'talk' })).size, 16);
});
test('each host\'s base size follows the card: the instrument, the cell\'s scaled type, the strips', () => {
  const sc = { sm: 12.5, chCap: 11.6, lab: 13, cap: 14 };
  const h = (host, over = {}, local = {}) => makeCtx({ host, scale: sc, ...over, ...local });
  assert.equal(hostSizeFor(h('prof')), 12.5);
  assert.equal(hostSizeFor(h('flows')), 12.5);
  assert.ok(Math.abs(hostSizeFor(h('prof', { in: 'cell', lad: 1.2 })) - 13.92) < 1e-9, '--lad-f times --lad-s in a cell');
  assert.equal(hostSizeFor(h('pstrip')), 13);
  assert.equal(hostSizeFor(h('pstriph')), 14);
  assert.equal(hostSizeFor(h('prof', {}, { px: 15 })), 15, 'the size the chart was drawn at, where it grew its type for a zoom');
});
