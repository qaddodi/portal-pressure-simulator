// The deck diagrams' looks in code (chart-looks-in-code plan WP11a): the still column, the SAAG map and the two walls. The table resolves in
// every look with no missing token, the cascade's winners are as app.css had them, and every piece presenter.js builds names a look that exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOKS } from '../src/ui/chart-looks/index.js';
import { makeCtx, withCtx, resolveProps } from '../src/ui/chart-looks/resolve.js';

const ctx = (over = {}) => withCtx(makeCtx({ host: 'col', layout: 'wide', scale: { cap: 14 } }), { theme: 'light', dark: false, palette: 'navy', ...over });
const P = (k, st = {}, c = ctx()) => resolveProps(LOOKS[k], c, st, {});
const KEYS = Object.keys(LOOKS).filter((k) => k.startsWith('card.'));
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('each card entry resolves in every look and state with no missing token', () => {
  assert.ok(KEYS.length >= 30);
  for (const theme of ['light', 'soft', 'dark']) for (const palette of ['navy', 'black']) for (const k of KEYS) for (const st of [{}, { on: true, q: '3', site: 'sin', i: '5', big: true }, { motion: 'reduce' }]) {
    const p = P(k, st, ctx({ theme, palette, dark: theme === 'dark' }));
    for (const v of Object.values(p)) assert.doesNotMatch(String(v), /255, 0, 255/, `${k} ${theme}/${palette}`);
  }
});
test('the column comes in with the card: a strength 0 until `in`, after the sheet\'s delays; reduced motion drops every ease', () => {
  for (const [k, ms] of [['card.col.top', 1900], ['card.col.brk', 1900], ['card.col.blk', 1800], ['card.col.lead', 1800], ['card.col.blkt', 1800], ['card.col.lane.f', 500], ['card.col.link.f', 1100]]) {
    assert.equal(P(k).opacity, 0, k);
    assert.equal(P(k, { on: true }).opacity, 1, k);
    assert.equal(P(k).ease.opacity.delay, ms, k);
    assert.equal(P(k, {}, ctx({ motion: 'reduce' })).ease.opacity, null, k);
  }
  const f = P('card.col.fill').ease.transform;
  assert.deepEqual([f.ms, f.delay], [1600, 500], 'the lumen slides in over 1.6 s after .5 s');
  assert.equal(P('card.col.fill', {}, ctx({ motion: 'reduce' })).ease.transform, null);
  assert.equal(P('card.col.text').letterSpacing, '0.02em');
  assert.equal(P('card.col.link.b').width, 2.6);
  assert.equal(P('card.col.link.f').cap, 'butt');
});
test('the SAAG map: quadrant tints, the cut-off tick, the points come in one after the other, a site\'s colour', () => {
  assert.notEqual(P('card.quad.rect', { q: '1' }).fill, P('card.quad.rect').fill);
  assert.notEqual(P('card.quad.rect', { q: '2' }).fill, P('card.quad.rect', { q: '4' }).fill);
  assert.deepEqual([P('card.quad.t').weight, P('card.quad.t', { on: true }).weight], [500, 700]);
  assert.deepEqual(P('card.quad.cut').dash, [10, 8]);
  for (const i of [0, 1, 7]) assert.equal(P('card.quad.pt', { i: String(i) }).ease.opacity.delay, 300 + 180 * i, `point ${i}`);
  assert.equal(P('card.quad.pt', { i: '2' }).ease.transform.delay, 660);
  assert.equal(P('card.quad.pt').opacity, 0);
  assert.equal(P('card.quad.pt', { on: true }).opacity, 1);
  assert.notEqual(P('card.quad.dot', { site: 'pre' }).fill, P('card.quad.dot', { site: 'post' }).fill);
  assert.equal(P('card.quad.dot').width, 5);
});
test('the walls: the flow is thicker in the sinusoid, albumin crossing a pore starts at nothing', () => {
  assert.deepEqual([P('card.walls.flow').width, P('card.walls.flow', { big: true }).width], [4, 7]);
  assert.equal(P('card.walls.cross').opacity, 0);
  assert.equal(P('card.walls.bm').opacity, 0.75);
  assert.equal(P('card.walls.alb').fill, P('card.walls.cross').fill);
});
test('every piece presenter.js builds for these diagrams names a look that exists, and the sheet keeps no model rule', () => {
  const src = read('src/ui/presenter.js') + read('src/ui/presenter-visuals.js');
  const names = [...src.matchAll(/'data-look': '(card\.[\w.]+)'/g)].map((m) => m[1]);
  assert.ok(names.length >= 30);
  for (const n of names) assert.ok(LOOKS[n], `look ${n}`);
  const css = read('styles/app.css');
  assert.doesNotMatch(css, /\.c-(top|pv|flow|lane|link-b|edge|fill|bal|cath|tip|brk|blk|lead|blkt)\b|\.pzq-(q|n|cut|axis|t|ax|pt)\b|\.pzw-(l|lumen|wall|bm|tissue|hep|disse|alb|flow|head|dots|cross)\b/, 'the diagrams\' model rules are gone');
});
