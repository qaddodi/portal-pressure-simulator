// The plane's looks in code (chart-looks-in-code plan WP9): every look resolves with no missing token, the zone tints and word inks read as the
// --pze-* swatch tokens theme-tokens.js prints for the keys, and the cascade's winners are as app.css 7295-7377 had them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOKS, HOSTS } from '../src/ui/chart-looks/index.js';
import { makeCtx, withCtx, resolveProps } from '../src/ui/chart-looks/resolve.js';
import { tokensFor } from '../src/ui/theme-tokens.js';
import { parseCssColor } from '../src/ui/css-color.js';

const LOOKS5 = [['light', false, 'navy'], ['soft', false, 'navy'], ['dark', true, 'navy'], ['dark', true, 'black']];
const ctx = (theme = 'light', dark = false, palette = 'navy', host = 'plane') => withCtx(makeCtx({ host, layout: 'wide', scale: { cap: 16, chCap: 12 }, svk: 1 }), { theme, dark, palette });
const P = (k, st = {}, c = ctx()) => resolveProps(LOOKS[k], c, st, {});
const keys = Object.keys(LOOKS).filter((k) => k.startsWith('plane.'));
const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const STATIC = { 'ramp-violet': tokens.match(/--ramp-violet: (#[0-9A-Fa-f]{6})/)[1], 'ramp-wine': tokens.match(/--ramp-wine: (#[0-9A-Fa-f]{6})/)[1], black: tokens.match(/--black: (#[0-9A-Fa-f]{6})/)[1] };
// A swatch token as the page computes it: its text with every var() filled in from the look's tokens, read as a colour.
const swatch = (c, name) => {
  const t = { ...tokensFor(c), ...STATIC };
  let s = t[name];
  for (let i = 0; i < 4; i++) s = s.replace(/var\(--([\w-]+)\)/g, (_, n) => t[n]);
  return parseCssColor(s);
};
const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 2e-5);

test('each plane entry resolves in every look and state with no missing token', () => {
  const states = [{}, { axes: true }, ...['ok', 'mid', 'hi', 'ppg', 'hvpg', 'both', 'none'].flatMap((tone) => [{ tone }, { tone, onl: true }, { tone, axes: true }]),
    { site: 'pre' }, { site: 'presin' }, { site: 'sin' }, { site: 'postsin' }, { site: 'post' }, { site: 'cardiac' }, { site: 'none' }, { on: true }, { bxw: true }, { cw: true }];
  for (const [theme, dark, palette] of LOOKS5) for (const k of keys) for (const st of states) {
    for (const [p, v] of Object.entries(P(k, st, ctx(theme, dark, palette)))) assert.doesNotMatch(String(v), /255, 0, 255/, `${k} ${theme}/${palette} ${JSON.stringify(st)} ${p}`);
  }
});

test('the zone tint and the words\' ink are the swatches the keys print, in every look', () => {
  for (const [theme, dark, palette] of LOOKS5) for (const tone of ['ok', 'mid', 'hi', 'ppg', 'hvpg', 'both']) {
    const c = ctx(theme, dark, palette);
    assert.ok(same(parseCssColor(P('plane.zone', { tone }, c).fill), swatch(c, `pze-${tone}`)), `zone ${tone} ${theme}/${palette}`);
    assert.ok(same(parseCssColor(P('plane.zt', { tone }, c).fill), swatch(c, `pze-${tone}-ink`)), `words ${tone} ${theme}/${palette}`);
    assert.ok(same(parseCssColor(P('plane.zt', { tone, onl: true }, c).stroke), swatch(c, `pze-${tone}`)), `halo of words across a line ${tone} ${theme}/${palette}`);
    assert.equal(P('plane.zt', { tone, onl: true }, c).width, 6);
    assert.equal(P('plane.zt', { tone, onl: true }, c).paintStroke, true);
  }
  assert.equal(P('plane.zt', { tone: 'ok' }).paintStroke, undefined, 'words off a line have no halo');
  assert.notEqual(P('plane.zone', {}).fill, P('plane.zone', { tone: 'ok' }).fill, 'a zone without a tone is the quiet panel colour');
});

test('a scatter\'s plot gives its halos and fills the panel\'s own tone; the card\'s plot the card\'s', () => {
  const c = ctx();
  for (const k of ['plane.pt.name', 'plane.sn']) {
    assert.deepEqual(parseCssColor(P(k, {}, c).stroke), parseCssColor(tokensFor(c).surface), k);
    assert.deepEqual(parseCssColor(P(k, { axes: true }, c).stroke), parseCssColor(tokensFor(c)['surface-2']), `${k} in a scatter`);
  }
  assert.equal(P('plane.dt', {}).paintStroke, undefined, 'the diagonal\'s name has a halo only on a scatter');
  assert.equal(P('plane.dt', { axes: true }).width, 4);
  assert.notEqual(P('plane.diag', {}).stroke, P('plane.diag', { axes: true }).stroke, 'the diagonal is a step stronger on a scatter');
  assert.equal(P('plane.halo', { axes: true }).fill, P('plane.zone', {}).fill, 'the dot\'s gap is the panel colour on a scatter');
});

test('the cascade: a cut-off\'s number, a box\'s words, the point\'s site colour, the eases', () => {
  assert.equal(P('plane.t').weight, 600);
  assert.equal(P('plane.t', { on: true }).weight, 700);
  assert.notEqual(P('plane.t', { on: true }).fill, P('plane.t').fill);
  assert.equal(P('plane.zt', { tone: 'ok', bxw: true }).weight, 600, 'a box\'s words stay quiet whatever the tone');
  assert.equal(P('plane.zt', { tone: 'ok', bxw: true }).fill, P('plane.zt', { tone: 'none', bxw: true }).fill);
  const sites = ['pre', 'presin', 'sin', 'postsin', 'post', 'cardiac'].map((site) => P('plane.pt.dot', { site }).fill);
  assert.equal(new Set(sites).size, 6, 'each site has its own colour');
  assert.equal(P('plane.pt.dot', { site: 'none' }).fill, P('plane.path', { site: 'none' }).stroke, 'no site: the quiet grey, in the point and its path');
  assert.deepEqual(Object.keys(P('plane.ring').ease), ['opacity', 'transform']);
  assert.equal(P('plane.ring').ease.opacity.ms, 420);
  assert.equal(P('plane.zt', { cw: true }).ease.opacity.ms, 120, 'a card\'s zone words fade on the small ease');
  assert.equal(P('plane.zt', {}).ease, undefined, 'a summary\'s words have none');
  assert.equal(P('plane.trail').ease.opacity.ms, 420);
});

test('the host sizes: the caption size; in a card\'s cell the chart caption size', () => {
  assert.equal(HOSTS.plane(ctx()), 16);
  assert.equal(HOSTS.planecard({ in: 'cell', scale: { cap: 16, chCap: 12 } }), 12);
  assert.equal(HOSTS.planecard({ in: '', scale: { cap: 16, chCap: 12 } }), 16);
  assert.equal(HOSTS.plane({ scale: {} }), 12);
});

test('every look the plane names exists, and the plane reads no style', () => {
  const src = readFileSync(new URL('../src/ui/visual-plane.js', import.meta.url), 'utf8');
  const named = new Set([...src.matchAll(/'(plane\.[\w.]+)'/g)].map((m) => m[1]));
  assert.ok(named.size >= 20, `read ${named.size} names`);
  for (const k of named) assert.ok(LOOKS[k], `${k} is in the table`);
  assert.doesNotMatch(src, /getComputedStyle/, 'the plane asks the page for no style');
  assert.doesNotMatch(readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8'), /\.pze-(zone|zt|box|cut|diag|grid|axis|dt|ln|t|ax|pt|lead|path|was|ring|halo|dot|trail|walk|stop|sn)\b/, 'the model pieces\' rules are gone from the stylesheet');
});
