// The small drawings' looks in code (chart-looks-in-code plan WP11c): the timeline's jump-day count and the lobule view's pointer and leaders.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOKS } from '../src/ui/chart-looks/index.js';
import { makeCtx, withCtx, resolveProps } from '../src/ui/chart-looks/resolve.js';
import { tokensOfLook } from '../src/ui/theme-tokens.js';

const ctx = (over = {}) => withCtx(makeCtx({ host: 'lobule' }), { theme: 'light', dark: false, palette: 'navy', view: 'anatomic', ...over });
const P = (k, st = {}, c = ctx()) => resolveProps(LOOKS[k], c, st, {});
const KEYS = Object.keys(LOOKS).filter((k) => k.startsWith('small.'));
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const T = tokensOfLook('light');

test('each entry resolves in every look and state with no missing token', () => {
  assert.ok(KEYS.length >= 5);
  for (const theme of ['light', 'soft', 'dark']) for (const palette of ['navy', 'black']) for (const view of ['anatomic', 'circuit']) for (const k of KEYS)
    for (const st of [{}, { on: true, kind: 'treat', hid: true, gone: true, dim: true, cap: true, hl: true, focus: true, scan: true }, { kind: 'note' }]) {
      const p = P(k, st, ctx({ theme, palette, view, dark: theme === 'dark' }));
      for (const v of Object.values(p)) assert.doesNotMatch(String(v), /255, 0, 255/, `${k} ${theme}/${palette}/${view}`);
    }
});
test('the pointer: out until `on`, in the call\'s kind, eased in and out', () => {
  assert.equal(P('small.call').opacity, 0);
  assert.equal(P('small.call', { on: true }).opacity, 1);
  assert.equal(P('small.call').stroke, T.danger);
  assert.equal(P('small.call', { kind: 'treat' }).stroke, T.accent);
  assert.equal(P('small.call', { kind: 'note' }).stroke, T['text-2']);
  assert.equal(P('small.call').width, 4);
  assert.ok(P('small.call').ease.opacity.ms > 0);
});
test('the leaders: the cascade winners as app.css had them', () => {
  assert.deepEqual([P('small.lead.line').stroke, P('small.lead.line').width], [T.leader, 1]);
  assert.deepEqual([P('small.lead.line', { hl: true }).stroke, P('small.lead.line', { hl: true }).width], [T.accent, 1.4]);
  assert.deepEqual(P('small.lead.line', { focus: true }).dash, [3, 3]);
  assert.equal(P('small.lead.line', { scan: true }).stroke, T.fibroscan);
  assert.equal(P('small.lead.line', { hid: true }).opacity, 0);
  assert.equal(P('small.lead.line', { hid: true }).ease.opacity, null, 'a hidden leader goes at once');
  assert.equal(P('small.lead.line', { hid: true, dim: true }).opacity, 0.35, 'a lit slide\'s dim rule is the more specific one');
  assert.equal(P('small.lead.line', { dim: true, cap: true }).opacity, 0, 'label-gl draws them: this layer\'s are not drawn (the !important rule)');
  assert.equal(P('small.lead.dot', { gone: true }).opacity, 0);
  assert.deepEqual([P('small.lead.dot').fill, P('small.lead.dot').stroke, P('small.lead.dot').width], [T['stage-bg'], T['text-2'], 1.3]);
  assert.equal(P('small.lead.dot', { scan: true }).width, 1.6);
});
test('the clock\'s day count takes the clock\'s ink, and the Circuit view\'s tokens in a dark look', () => {
  assert.equal(P('small.day').fill, T['text-2']);
  const d = (view) => P('small.day', {}, ctx({ theme: 'dark', dark: true, view }));
  assert.ok(d('anatomic').fill && d('circuit').fill);
});
test('every piece the builders make names a look that exists, and the sheet keeps their model rules out', () => {
  for (const f of ['src/ui/timeline.js', 'src/ui/lobule-zoom.js']) {
    const src = read(f);
    const names = [...src.matchAll(/'data-look': '(small\.[\w.]+)'/g)].map((m) => m[1]);
    assert.ok(names.length >= 2, f);
    for (const n of names) assert.ok(LOOKS[n], `look ${n}`);
  }
  const css = read('styles/app.css');
  assert.doesNotMatch(css, /\.tl-day-gl|\.lz-call-[lr]|\.lz-leaders[^{]*\.(leader|ld-gone)/, 'their model rules are gone');
});
