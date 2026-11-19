// LOOK-8 (bible review, 19 Nov 2026): one axis role for every chart (chart-looks/common.js AXIS: the third ink, 1.25 px). It was drawn seven ways, one of them
// (--axis) at 1.5:1 on the card, under the 3:1 a line a reader needs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOKS } from '../src/ui/chart-looks/index.js';
import { AXIS } from '../src/ui/chart-looks/common.js';
import { resolveProps, makeCtx, withCtx, withVarsResolved } from '../src/ui/chart-looks/resolve.js';
import { tokensOfLook, LOOK_IDS } from '../src/ui/theme-tokens.js';
import { parseCssColor } from '../src/ui/css-color.js';

const AXES = Object.keys(LOOKS).filter((k) => /\.axis(\.line|\.mark)?$/.test(k));
const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('every chart axis entry is the shared axis: the third ink, 1.25 px (the profile chart\'s own-size cell may scale it up)', () => {
  assert.ok(AXES.length >= 8, AXES.join(', '));
  const ctx = withCtx(makeCtx({ host: '' }), { theme: 'light', dark: false, palette: '' });
  for (const k of AXES) {
    const p = resolveProps(LOOKS[k], ctx, {}, {});
    assert.equal(p.stroke, withVarsResolved(tokensOfLook('light'))['text-3'], `${k} stroke`);
    assert.equal(p.width, AXIS.width, `${k} width`);
  }
});

test('the axis reads 3:1 on the card in every look', () => {
  for (const id of LOOK_IDS) {
    const t = withVarsResolved(tokensOfLook(id));
    for (const g of ['surface', 'surface-2']) assert.ok(ratio(Array.from(parseCssColor(t['text-3'])), Array.from(parseCssColor(t[g]))) >= 3, `${id} on ${g}`);
  }
});

test('no chart entry takes the --axis token (it is 1.5:1)', () => {
  for (const [k, e] of Object.entries(LOOKS)) assert.doesNotMatch(JSON.stringify(e), /"k":"tok","n":"axis"/, k);
});
