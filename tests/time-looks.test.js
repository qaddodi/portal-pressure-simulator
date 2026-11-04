// The over-time charts' looks in code (chart-looks-in-code plan WP5): the flow-time chart, the curve and the course. Every look a builder names is in
// the table, every token it names exists in every look, the table resolves with no missing token, the cascade's winners are as app.css had them,
// and the stylesheet's rules for these pieces are gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOKS } from '../src/ui/chart-looks/index.js';
import { makeCtx, withCtx, resolveProps } from '../src/ui/chart-looks/resolve.js';
import { tokensFor } from '../src/ui/theme-tokens.js';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const SRC = { 'flow-time': read('../src/ui/flow-time.js'), 'tool-curve': read('../src/ui/tool-curve.js'), 'tool-course': read('../src/ui/tool-course.js') };
const css = read('../styles/app.css');
const ctx = (over = {}, host = 'curve') => withCtx(makeCtx({ host, layout: 'wide', scale: { sm: 12.5 }, svk: 1.2, px: 14 }), { theme: 'light', dark: false, palette: 'navy', ...over });
const P = (k, st = {}, c = ctx(), params = { c: 'tr-pv', rx: 's3' }) => resolveProps(LOOKS[k], c, st, params);

test('every look the three builders name is in the table, and they read no style and write no colour', () => {
  for (const [name, src] of Object.entries(SRC)) {
    const keys = new Set([...src.matchAll(/'data-look': '([\w.]+)'/g)].map((m) => m[1]));
    assert.ok(keys.size >= 8, name);
    for (const k of keys) assert.ok(LOOKS[k], `${name}: look ${k}`);
    assert.equal((src.match(/getComputedStyle/g) || []).length, 0, `${name} asks the page for no style`);
    assert.equal((src.match(/style: [`'][^`']*var\(/g) || []).length, 0, `${name} writes no colour into a style`);
  }
});
test('every colour token a builder names exists in every look', () => {
  const names = new Set();
  for (const src of Object.values(SRC)) for (const m of src.matchAll(/'(--(?:tr|s|text|ok|caution|danger|accent|border|surface|ascites|fibroscan)[\w-]*)'/g)) names.add(m[1].slice(2));
  for (const m of SRC['flow-time'].matchAll(/'(--[\w-]+)'/g)) names.add(m[1].slice(2));
  for (const m of SRC['tool-curve'].matchAll(/c: '(--[\w-]+)'/g)) names.add(m[1].slice(2));
  names.delete('band-room');   // (a size, not a colour)
  assert.ok(names.size >= 4);
  for (const theme of ['light', 'soft', 'dark']) for (const palette of ['navy', 'black']) {
    const t = tokensFor(ctx({ theme, palette, dark: theme === 'dark' }));
    for (const n of names) assert.ok(t[n] != null, `token ${n} in ${theme}/${palette}`);
  }
});
test('each entry resolves in every look and state with no missing token', () => {
  const keys = Object.keys(LOOKS).filter((k) => /^(time|ft|cv|co)\./.test(k));
  assert.ok(keys.length >= 35);
  for (const host of ['flowtime', 'curve']) for (const theme of ['light', 'soft', 'dark']) for (const palette of ['navy', 'black']) for (const k of keys) {
    for (const st of [{}, { off: true, on: true, now: true, meal: true, ref: true, dash: true, atx: true, num: true, rate: 'hi', tc: 'mid', deep: '1' }, { rate: 'mid', tc: 'hi' }]) {
      const p = P(k, st, ctx({ theme, palette, dark: theme === 'dark' }, host));
      for (const v of Object.values(p)) assert.doesNotMatch(String(v), /255, 0, 255/, `${k} ${theme}/${palette}`);
    }
  }
});
test('the cascade winners: sizes follow the fitted type, the gridline, the cut-offs, the dashes, the off states', () => {
  assert.equal(P('time.tk').size, 14, '1 em is the size the chart is drawn in (px)');
  assert.ok(Math.abs(P('ft.v').size - 15.4) < 1e-9, '1.1 em');
  assert.equal(P('ft.v', { off: true }).opacity, 0);
  assert.ok(P('ft.v').ease.opacity && P('ft.v').ease.opacity.ms === 240, 'the value eases on the small step');
  assert.equal(P('ft.t', { meal: true }).weight, 700);
  assert.match(P('plot.grid.line', { cut: false }, ctx({}, 'flowtime')).stroke, /^color\(srgb /, 'a plain gridline is the strong border at 70 % in both charts');
  assert.equal(P('plot.grid.line', { cut: true, rate: 'mid' }, ctx({}, 'curve')).stroke.startsWith('color(srgb'), true, 'the curve\'s amber cut-off a little darker');
  assert.equal(P('plot.grid.line', { cut: true, rate: 'mid' }, ctx({}, 'flowtime')).stroke, P('plot.grid.line', { cut: true, rate: 'mid' }, ctx({}, 'talk')).stroke, 'the others keep the shared amber');
  assert.equal(P('plot.ax', {}, ctx({}, 'flowtime')).size, 14);
  assert.ok(Math.abs(P('plot.ax', {}, ctx({}, 'flowtime')).letterSpacing - 0.56) < 1e-9, '.04 em');
  assert.deepEqual([P('cv.line', { ref: true }).width, P('cv.line', { ref: true }).dash], [1.5, [3, 4]]);
  assert.deepEqual(P('cv.line', { dash: true }).dash, [5, 7]);
  assert.deepEqual([P('time.key.line', { dash: true }).dash, P('time.key.line', { dash: true }).width], [[3, 9], 4]);
  assert.deepEqual([P('cv.at', { atx: true }).dash, P('cv.at', { atx: true }).width], [[], 2.5]);
  assert.equal(P('cv.v', { on: true }).width, 8, 'on its own line the halo is wider');
  assert.equal(P('cv.cut', { rate: 'hi' }).fill === P('cv.cut', { rate: 'mid' }).fill, false);
  assert.equal(P('cv.dname', { num: true }).weight, 700);
  assert.equal(P('cv.tc', { tc: 'hi' }).weight, 700);
  assert.equal(P('cv.stub', { tc: 'hi' }).stroke, '#D2452F', 'a stub is in its rating\'s colour');
  assert.notEqual(P('cv.stub', { tc: 'mid' }).stroke, P('cv.stub', { tc: 'ok' }).stroke);
  assert.equal(P('co.z', { rate: 'hi', deep: '1' }).fill, P('co.z', { deep: '1' }).fill, 'the deepest zone beats its rating');
  assert.notEqual(P('co.z', { rate: 'hi' }).fill, P('co.z', { rate: 'mid' }).fill);
  assert.equal(P('ft.band.bar', {}, ctx({ theme: 'dark', dark: true })).opacity, 0.8);
  assert.equal(P('ft.band.bar').opacity, undefined);
});
test('the rules for these pieces are gone from the stylesheet; the host and the root fade stay', () => {
  assert.doesNotMatch(css, /\.pft-(key|x|t|tk|meal|start|dot|v0?|band|band-n|u)\b[^{\n]*\{/, 'no .pft-* rule');
  assert.doesNotMatch(css, /\.pcv-[\w-]+[^{\n]*\{/, 'no .pcv-* rule');
  assert.doesNotMatch(css, /\.pco-[\w-]+[^{\n]*\{/, 'no .pco-* rule');
  assert.doesNotMatch(css, /:is\(\.pz-curve, \.pz-flowtime\)/, 'the panel-tone override of --surface is the table\'s');
  assert.match(css, /\.pz-flowtime \{ font-size: var\(--pz-sm/, 'the host\'s own box (its height is em-based) stays');
  assert.match(css, /\.pz-flowtime svg\.in \{ opacity: 0; \}/);
});
