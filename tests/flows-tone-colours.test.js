// The Blood into the liver card's Portal vein bar drew bright magenta (Mohammad, 5 Nov: "portal vein color is wrong i think"). Its
// tone, --vein-portal, is written in theme-tokens.js as var(--tour-portal); the chart-looks resolver handed that string to the colour
// parser, which cannot read a var(), so the bar fell to the missing-colour MAGENTA. Tokens are now read through their own map first.
// This checks every part of both flows bars gets its theme colour, never MAGENTA, in each look.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { resolveProps, withVarsResolved, withCtx, makeCtx } from '../src/ui/chart-looks/resolve.js';
import { LOOKS } from '../src/ui/chart-looks/index.js';
import { tokensFor } from '../src/ui/theme-tokens.js';
import { ROUTES, LIVER, OTHER, INFLOW } from '../src/ui/tool-flows.js';

const MAGENTA = /^color\(srgb 1 0 1 /;
const tones = [...ROUTES, LIVER, OTHER, ...INFLOW].map((r) => r[2].replace(/^--/, ''));

test('a token written as var(--other) reads as that token', () => {
  const m = withVarsResolved({ a: '#123456', b: 'var(--a)', c: 'color-mix(in srgb, var(--b) 50%, var(--z, #fff))', d: 'var(--d)' });
  assert.equal(m.b, '#123456');
  assert.equal(m.c, 'color-mix(in srgb, #123456 50%, #fff)');
  assert.equal(m.d, 'var(--d)');
});

for (const theme of ['light', 'dark', 'soft']) {
  test(`every flows bar part has its theme colour (${theme})`, () => {
    const ctx = withCtx(makeCtx({ host: 'flows' }), { theme, dark: theme === 'dark' });
    for (const tone of tones) {
      const P = resolveProps(LOOKS['flows.seg'], ctx, {}, { tone });
      const fill = JSON.stringify(P);
      assert.ok(!MAGENTA.test(Object.values(P).find((v) => typeof v === 'string' && v.startsWith('color(')) || ''), `${tone} is magenta in ${theme}: ${fill}`);
    }
    const portal = withVarsResolved(tokensFor(ctx))['vein-portal'];
    assert.match(portal, /^#[0-9A-F]{6}$/i, `vein-portal reads as a colour in ${theme}`);
  });
}
