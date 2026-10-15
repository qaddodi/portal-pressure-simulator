// Review #18 and #24 (main.js needs a DOM to import, so it is read as text).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
const palette = readFileSync(new URL('../src/ui/palette.js', import.meta.url), 'utf8');
const escChain = main.slice(main.indexOf("if (e.key === 'Escape') {\n      //"), main.indexOf("if (e.key === '/')"));

test('#18 the default patient records what it came with, so Treat > Changes lists no change nobody made', () => {
  assert.match(main, /if \(!shared && !store\.get\(\)\.presetParams\) store\.set\(\{ presetParams: \{ id: store\.get\(\)\.presetId, params: structuredClone\(store\.get\(\)\.params\) \} \}\)/);
});

test('#24 one Esc closes only an open menu', () => {
  assert.match(escChain, /^if \(e\.key === 'Escape'\) \{\s*\/\/[^\n]*\n\s*if \(popoverOpen\(\)\) \{ closePopover\(\); return; \}/);
});

test('#24 Esc closes Tests', () => {
  assert.match(escChain, /else if \(app\.classList\.contains\('dock-open'\) && dock\) dock\.close\(\);/);
});

test('#24 closing Treat, History, Details or Search hands focus back, not to the page', () => {
  for (const [fn, btn] of [['closeTreat', '#btnTreat'], ['closeHistory', '#btnHistory']]) {
    const body = main.slice(main.indexOf(`function ${fn}(`), main.indexOf('leave(el);', main.indexOf(`function ${fn}(`)));
    assert.ok(body.includes(`giveFocusBack(el, $('${btn}'))`), fn);
    assert.match(escChain, new RegExp(`${fn}\\(\\{ focus: true \\}\\)`));
  }
  assert.match(main, /function closePanel\(\{ focus = false \} = \{\}\) \{\s*if \(focus\) giveFocusBack\(\$\('#panel'\), panelOpener\);/);
  assert.match(escChain, /closePanel\(\{ focus: true \}\)/);
  assert.match(palette, /ret = document\.activeElement && document\.activeElement !== document\.body \? document\.activeElement : document\.getElementById\('btnPalette'\)/);
});
