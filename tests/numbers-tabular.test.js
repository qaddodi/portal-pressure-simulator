import { stageSource } from './stage-src.js';
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
  const stage = stageSource();
  assert.match(stage, /const clampTbOpts = \{ anchor: 'start', weight: 600, size: 12, tnum: true, k: 1 \};/);   // (the options, kept and rewritten for each box)
  assert.match(stage, /o\.size = size; o\.k = CTM\?\.sc > 0 \? CTM\.sc : 1;/);
  const { loadGlyphs, textBox } = await import('../src/ui/text-gl.js');
  await loadGlyphs();
  const w = (t) => textBox(t, 0, 0, { weight: 600, size: 12, tnum: true, k: 2 }).width;
  for (const t of ['10', '25', '60', '88', '99']) assert.equal(w(`${t} %`), w('00 %'), `${t} %`);
});

test('the vitals monitor: the unit and the alarm patch stand in one place whatever the number is (99 to 100, any digit)', async () => {
  const mon = readFileSync(new URL('../src/ui/vitals-monitor.js', import.meta.url), 'utf8');
  assert.match(mon, /rw = textWidth\(c\.d \? '88\.8' : '888', 700, big\)/);
  assert.match(mon, /textAt\(nt\+\+, val, 700, big, x \+ rw - nw, by,/, 'the number flush to the right of its box');
  assert.match(mon, /textAt\(nt\+\+, c\.u, 500, 12, x \+ rw \+ 5, by,/, 'the unit after the box, not after the number');
  assert.match(mon, /rectAt\(nr\+\+, x - 5, by - big \* 0\.78 - 4, rw \+ 10,/, 'the alarm patch the box wide');
  const { textWidth } = await import('../src/ui/vitals-gl.js');
  for (const big of [22, 34, 46]) {
    const rw = textWidth('888', 700, big);
    for (const v of ['0', '9', '72', '99', '100', '188', '111']) assert.ok(textWidth(v, 700, big) <= rw + 1e-9, `${v} fits its box at ${big}`);
    const rw1 = textWidth('88.8', 700, big);
    for (const v of ['0.0', '9.9', '12.3', '88.8', '−3.1']) assert.ok(textWidth(v, 700, big) <= rw1 + 1e-9, `${v} fits its box at ${big}`);
  }
});

test('a card or popover settles by its opacity alone: no scale on text as it arrives or leaves (a scaled layer draws its words soft, then sharp)', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /@keyframes scale-settle \{ from \{ opacity: 0; \} \}/);
  assert.match(css, /@keyframes scale-settle-out \{ to \{ opacity: 0; \} \}/);
  assert.doesNotMatch(css, /@keyframes scale-settle[^{]*\{[^}]*scale:/, 'no scale in the settle keyframes');
  // (the hover tip and the tooltip ease in by translation and opacity)
  assert.match(css, /\.hover-tip \{[^}]*transform: translateY\(4px\);/);
  assert.match(css, /--tip-x: -4px; --tip-y: 0px; opacity: 0; transform: translate\(var\(--tip-x\), var\(--tip-y\)\);/);
  const ml = readFileSync(new URL('../src/ui/menu-leave.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ml.replace(/\/\/.*$/gm, ''), /scale:\s*0\.98|0\.98 \+ 0\.02/);
});
