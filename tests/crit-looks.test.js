// The criteria card's zones graph looks in code (chart-looks-in-code plan WP8): every look resolves with no missing token, and the
// cascade's winners are as app.css 7594-7600 had them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOKS, HOSTS } from '../src/ui/chart-looks/index.js';
import { makeCtx, withCtx, resolveProps } from '../src/ui/chart-looks/resolve.js';

const ctx = (over = {}) => withCtx(makeCtx({ host: 'crit', layout: 'wide', scale: { sm: 13 }, svk: 1 }), { theme: 'light', dark: false, palette: 'navy', ...over });
const P = (k, st = {}, c = ctx()) => resolveProps(LOOKS[k], c, st, {});

test('each crit entry resolves in every look and state with no missing token', () => {
  for (const theme of ['light', 'soft', 'dark']) for (const palette of ['navy', 'black']) for (const k of Object.keys(LOOKS).filter((x) => x.startsWith('crit.'))) for (const st of [{}, { rate: 'ok' }, { rate: 'mid' }, { rate: 'hi' }, { q: true }]) {
    const p = P(k, st, ctx({ theme, palette, dark: theme === 'dark' }));
    for (const v of Object.values(p)) assert.doesNotMatch(String(v), /255, 0, 255/, `${k} ${theme}/${palette}`);
  }
});
test('the zone tint follows its rating; the words are quieter on an axis name', () => {
  const fills = ['ok', 'mid', 'hi', undefined].map((rate) => P('crit.zone', rate ? { rate } : {}).fill);
  assert.equal(new Set(fills).size, 4, 'each rating and the plain zone have their own tint');
  assert.equal(P('crit.word').weight, 600);
  assert.equal(P('crit.word', { q: true }).weight, 500);
  assert.notEqual(P('crit.word', { q: true }).fill, P('crit.word').fill);
  assert.equal(P('crit.word').halo?.width ?? 3, 3);
});
test('the host size is the card\'s small size, 12 at least', () => {
  assert.equal(HOSTS.crit(ctx()), 13);
  assert.equal(HOSTS.crit({ scale: {} }), 14);
  assert.equal(HOSTS.crit({ scale: { sm: 10 } }), 12);
});
