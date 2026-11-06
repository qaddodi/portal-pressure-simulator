// The talk chart's looks in code (chart-looks-in-code plan WP4): the table resolves in every look with no missing token, and the cascade's
// winners are as app.css had them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOKS } from '../src/ui/chart-looks/index.js';
import { makeCtx, withCtx, resolveProps } from '../src/ui/chart-looks/resolve.js';

const ctx = (over = {}) => withCtx(makeCtx({ host: 'talk', layout: 'wide', scale: { sm: 12.5 }, svk: 1.2 }), { theme: 'light', dark: false, palette: 'navy', ...over });
const P = (k, st = {}, c = ctx(), params = { rx: 's3', c: 'tr-pv' }) => resolveProps(LOOKS[k], c, st, params);

test('each entry resolves in every look and state with no missing token', () => {
  for (const theme of ['light', 'soft', 'dark']) for (const palette of ['navy', 'black']) for (const k of Object.keys(LOOKS)) for (const st of [{}, { cut: true, rate: 'mid', now: true }, { cut: false, rate: 'hi' }]) {
    const p = P(k, st, ctx({ theme, palette, dark: theme === 'dark' }));
    for (const v of Object.values(p)) assert.doesNotMatch(String(v), /255, 0, 255/, `${k} ${theme}/${palette}`);
  }
});
test('the cascade winners: gridlines, the HVPG lane, the band, the value, the axis name', () => {
  assert.deepEqual([P('plot.grid.line', { cut: true }).dash, P('plot.grid.line', { cut: true }).width], [[4, 5], 1.5]);
  assert.equal(P('plot.grid.line', { cut: true, rate: 'hi' }).stroke, '#C23F2A', 'a rating beats the plain tint');
  assert.match(P('plot.grid.line', { cut: false }).stroke, /^color\(srgb /, 'a plain gridline in the talk is the strong border at 70 %');
  assert.equal(P('plot.grid.line', { cut: true }, ctx({ in: 'cell' })).width, 1, 'in a row card\'s cell the width is max(1 px, .075 em), over the cut-off\'s 1.5');
  assert.equal(P('plot.grid.line', { cut: true }, ctx({ in: 'cell', layout: 'stack' })).width, 1.5, 'a stacked card keeps it');
  assert.equal(P('talk.value').size, 18.75, '1.5 em of the host');
  assert.equal(P('talk.band.rect').opacity, 0.12);
  assert.equal(P('talk.band.rect', {}, ctx({ theme: 'dark', dark: true })).opacity, 0.24);
  const ax = P('plot.ax');
  assert.equal([ax.size, ax.upper, ax.weight].join(), '12.5,true,600');
  assert.ok(Math.abs(ax.letterSpacing - 0.5) < 1e-9, '.04 em of 12.5');
  assert.equal(P('talk.mark.text', { now: true }).weight, 700);
  assert.equal(P('talk.pt', { rate: 'mid' }).fill, P('talk.pt', { rate: 'mid' }).stroke);
});
