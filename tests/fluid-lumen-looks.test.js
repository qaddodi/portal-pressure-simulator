// The fluid balance's and the vessel cross-section's looks in code (chart-looks-in-code plan WP10): every look resolves in every look
// (theme, palette) with no missing token, and the cascade's winners are as app.css 7431-7507 had them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOKS, HOSTS } from '../src/ui/chart-looks/index.js';
import { makeCtx, withCtx, resolveProps, colourOf } from '../src/ui/chart-looks/resolve.js';

const ctx = (over = {}) => withCtx(makeCtx({ host: 'fluid', layout: 'wide', scale: { fs12: 12.5 } }), { theme: 'light', dark: false, palette: 'navy', ...over });
const P = (k, st = {}, c = ctx()) => resolveProps(LOOKS[k], c, st, {});
const mine = Object.keys(LOOKS).filter((k) => /^(fluid|lumen)\./.test(k));
const LOOKSET = [['light', false], ['soft', false], ['dark', true]];

test('each fluid and lumen entry resolves in every look and state with no missing token', () => {
  assert.ok(mine.length >= 25);
  for (const [theme, dark] of LOOKSET) for (const palette of ['navy', 'black']) for (const k of mine) for (const st of [{}, { vessel: 'systemic' }, { vessel: 'artery' }]) {
    const p = P(k, st, ctx({ theme, dark, palette }));
    for (const v of Object.values(p)) assert.doesNotMatch(String(v), /255, 0, 255/, `${k} ${theme}/${palette}`);
  }
});
test('the host size is the card\'s 12 px text, held at 12 on the screen after the card\'s zoom', () => {
  assert.equal(HOSTS.fluid(ctx()), 12.5);
  assert.equal(HOSTS.fluid({ scale: {}, fit: 1, dk: 1 }), 12);
  assert.equal(HOSTS.fluid({ scale: { fs12: 12 }, fit: 0.8, dk: 1 }), 15, '12 / 0.8: the zoom shrank it');
  assert.equal(HOSTS.fluid({ scale: { fs12: 12 }, fit: 0.8, dk: 0.5 }), 30, 'and the block step too');
  assert.equal(P('fluid.in').size, 12.5, 'a word in a part is 1em of it');
});
test('the strip\'s lymph is the lymph green, 55 % of it in a dark look; the carried part and the spare room follow it', () => {
  const light = P('fluid.seg.car'), dark = P('fluid.seg.car', {}, ctx({ theme: 'dark', dark: true }));
  assert.notEqual(light.fill, dark.fill);
  assert.deepEqual(colourOf(light.fill).slice(0, 3).map((x) => Math.round(x * 255)), [0xD1, 0xE3, 0xBD], 'the plain --sv-gl-lymph-hi');
  assert.notEqual(P('fluid.seg.ghost').stroke, P('fluid.seg.ghost', {}, ctx({ theme: 'dark', dark: true })).stroke);
  assert.deepEqual(P('fluid.seg.ghost').dash, [3, 2.5]);
});
test('the flow bands are as strong as .55 and ease their strength; the build-up node is edged', () => {
  for (const k of ['carried', 'back', 'build']) { const p = P(`fluid.band.${k}`); assert.equal(p.opacity, 0.55); assert.equal(p.ease.opacity.ms, 240); }
  assert.equal(P('fluid.node.build').width, 1);
  assert.notEqual(P('fluid.node.build').stroke, P('fluid.node.build').fill);
  assert.equal(P('fluid.node.liver').stroke, undefined);
  assert.equal(P('fluid.flow.t').size, 13); assert.equal(P('fluid.flow.tv').weight, 650);
});
test('a vessel is drawn in its own colour: portal, systemic, artery', () => {
  const fills = ['portal', 'systemic', 'artery'].map((vessel) => P('lumen.open', { vessel }).fill);
  assert.equal(new Set(fills).size, 3);
  const walls = ['portal', 'systemic', 'artery'].map((vessel) => P('lumen.wall', { vessel }).stroke);
  assert.equal(new Set(walls).size, 3);
  assert.equal(P('lumen.open').ease.opacity.ms, 240); assert.equal(P('lumen.stent').ease.opacity.ms, 420);
});
test('the number is white with a dark outline 1.9 wide; the words are lighter with 1.3, and their size is the builder\'s', () => {
  const n = P('lumen.in'), w = P('lumen.word');
  assert.equal(n.size, 22); assert.equal(n.weight, 650); assert.equal(n.width, 1.9); assert.equal(n.paintStroke, true);
  assert.equal(w.size, undefined); assert.equal(w.weight, 600); assert.equal(w.width, 1.3);
  assert.equal(n.fill, w.fill);
});
test('the builders name every piece and read no style', () => {
  for (const f of ['tool-fluid', 'tool-lumen']) {
    const src = readFileSync(new URL(`../src/ui/${f}.js`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /getComputedStyle/, f);
    for (const m of src.matchAll(/'data-look': [`']([a-z.${}]+)[`']/g)) {
      const k = m[1];
      if (k.includes('${')) { const [pre] = k.split('${'); assert.ok(mine.some((x) => x.startsWith(pre)), `${k}`); } else assert.ok(LOOKS[k], `${k} is in the table`);
    }
  }
});
