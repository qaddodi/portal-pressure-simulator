// Numbers hold still (2 Nov 2026: "make sure the text everywhere and the numbers everywhere aren't jiggly and changing sizes
// constantly"). The body sets font-variant-numeric: tabular-nums and every element inherits it, but the `font` shorthand resets it to
// normal: a rule written `font: 600 14px …` with no font-variant-numeric of its own drew proportional digits, a different width at each
// digit, so a live number in it (the lymph's 7.5 in the Circulation deck, the Doppler stats, an endoscopy grade …) moved its neighbours.
// A sweep of the Circulation deck found four such text nodes on one deck; about 150 rules use the shorthand.
// tests/e2e/numbers-tabular.mjs checks the computed value of those rules in a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim().replace(/\s+/g, ' '), body: m[2] }));

test('one rule sets tabular figures on every element, !important, so the font shorthand cannot set them back', () => {
  const all = rules.filter((r) => r.sel === '*, *::before, *::after' && /font-variant-numeric:\s*tabular-nums lining-nums\s*!important;\s*font-feature-settings:\s*'cv11', 'ss01'\s*!important/.test(r.body));
  assert.equal(all.length, 1, 'exactly one universal rule');
});

test('no rule asks for proportional, old-style or default digits, and nothing !important after the universal rule undoes it', () => {
  for (const r of rules) {
    for (const m of r.body.matchAll(/font-variant-numeric:\s*([^;}]+)/g)) {
      assert.match(m[1].trim(), /^(tabular-nums|lining-nums|tabular-nums lining-nums)( !important)?$/, `${r.sel}: font-variant-numeric ${m[1].trim()}`);
    }
    assert.doesNotMatch(r.body, /font-feature-settings:[^;]*['"]pnum['"]/, `${r.sel} sets proportional figures`);
  }
  const at = rules.findIndex((r) => r.sel === '*, *::before, *::after' && /tabular-nums lining-nums\s*!important/.test(r.body));
  for (const r of rules.slice(at + 1)) assert.doesNotMatch(r.body, /font-variant-numeric/, `${r.sel} after the universal rule`);
});

test('the pages JS writes (inline styles, SVG attributes) never set the figures to anything else', () => {
  // (!important beats an inline style, so one that set them would be dead code: none is allowed to look as if it worked.)
  for (const f of ['stage.js', 'presenter.js', 'util.js', 'charts.js', 'instruments.js', 'label-gl.js', 'gl-words.js']) {
    const t = readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(t, /style\.fontVariantNumeric\s*=|setProperty\('font-variant-numeric'/, f);
  }
});

test('a stenosis\'s "60 %" is measured in the tabular figures it is drawn in, so its box is one width whatever its digits are', async () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /weight: 600, size, tnum: true, k: CTM\?\.sc > 0 \? CTM\.sc : 1 \}\);/);
  const { loadGlyphs, textBox } = await import('../src/ui/text-gl.js');
  await loadGlyphs();
  const w = (t) => textBox(t, 0, 0, { weight: 600, size: 12, tnum: true, k: 2 }).width;
  for (const t of ['10', '25', '60', '88', '99']) assert.equal(w(`${t} %`), w('00 %'), `${t} %`);
});
