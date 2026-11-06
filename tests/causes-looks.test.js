// The causes chart's looks in code (chart-looks-in-code plan WP7): the table resolves in every look with no missing token, the cascade's
// winners are as app.css had them, and every piece tool-causes.js builds names a look that exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOKS } from '../src/ui/chart-looks/index.js';
import { makeCtx, withCtx, resolveProps } from '../src/ui/chart-looks/resolve.js';

const ctx = (over = {}) => withCtx(makeCtx({ host: 'causes', layout: 'wide', scale: { sm: 12.5 } }), { theme: 'light', dark: false, palette: 'navy', ...over });
const P = (k, st = {}, c = ctx(), params = { c: 'tr-pv' }) => resolveProps(LOOKS[k], c, st, params);
const KEYS = Object.keys(LOOKS).filter((k) => k.startsWith('causes.'));

test('each causes entry resolves in every look and state with no missing token', () => {
  assert.ok(KEYS.length >= 12);
  for (const theme of ['light', 'soft', 'dark']) for (const palette of ['navy', 'black']) for (const k of KEYS) for (const st of [{}, { off: true, rate: 'mid', now: true, total: true }, { rate: 'hi', other: true }, { rate: 'ok', now: true }]) {
    const p = P(k, st, ctx({ theme, palette, dark: theme === 'dark' }));
    for (const v of Object.values(p)) assert.doesNotMatch(String(v), /255, 0, 255/, `${k} ${theme}/${palette}`);
  }
});
test('the cascade winners: words, bars, numbers, cut-offs', () => {
  assert.equal(P('causes.l').weight, 500);
  assert.equal(P('causes.l', { total: true }).weight, 650);
  assert.notEqual(P('causes.l', { other: true }).fill, P('causes.l').fill, 'Causes together is the softer ink');
  assert.equal(P('causes.bar.total').fill, '#5A5347', 'a total is grey until it has a rating');
  assert.equal(P('causes.bar.total', { rate: 'hi' }).fill, '#C23F2A');
  assert.equal(P('causes.bar.step').fill, '#B01E62', 'a step takes its mechanism\'s colour');
  assert.equal(P('causes.val', { now: true, rate: 'ok' }).fill, '#157A58');
  assert.match(P('causes.val', { now: true, rate: 'mid' }).fill, /^color\(srgb /, 'the Now number is a shade toward the text');
  assert.equal(P('causes.val', { rate: 'hi' }).fill, P('causes.val').fill, 'only the Now row takes the rating');
  assert.deepEqual([P('causes.val').paintStroke, P('causes.val').width, P('causes.val').join], [true, 8, 'round']);
  assert.deepEqual([P('causes.cut.line').dash, P('causes.cut.line').width], [[4, 5], 1.5]);
  assert.equal(P('causes.cut.line', { rate: 'hi' }).stroke, '#C23F2A');
  assert.equal(P('causes.cut', { off: true }).opacity, 0);
  assert.equal(P('causes.cut').opacity, undefined, 'on, the strength is the builder\'s');
  assert.ok(P('causes.cut').ease.opacity.ms > 0, 'a cut-off eases in and out');
  assert.deepEqual(P('causes.link').dash, [2, 3]);
});
test('every piece the builder makes names a look that exists, and the sheet keeps no .pcs rule', () => {
  const src = readFileSync(new URL('../src/ui/tool-causes.js', import.meta.url), 'utf8');
  const names = [...src.matchAll(/'data-look': '([\w.]+)'/g)].map((m) => m[1]);
  assert.ok(names.length >= 12);
  for (const n of names) assert.ok(LOOKS[n], `look ${n}`);
  assert.doesNotMatch(src, /getComputedStyle/, 'tool-causes reads no style');
  assert.doesNotMatch(readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8'), /\.pcs-/, 'no .pcs-* rule is left');
});
