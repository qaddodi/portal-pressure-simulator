// A reading that sits on its vessel (stage.js layoutLabels, onVessel; class .on-vessel) is knocked out of the vessel by a wide
// text halo in the stage's colour, in the Circuit only. It was an SVG filter (#lb-onv, the glyphs grown 8 px): on Mohammad's
// iPhone it drew dark boxes behind the readings, over the liver in Anatomy (16 Oct, 541935a and 804275c) and over the zone
// bands in the Circuit (ab51a04: MHV, RHV, L. gastric v., IMV, Lower IVC), and it was redrawn on every frame (Circuit lag).
// So no label may carry an SVG filter, and the .on-vessel rule is a text stroke under .cmap, the class the stage sets on its
// wrap only while the Circuit shows (stage.js: stageWrap.classList.toggle('cmap', t > 0.5)).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim(), body }));

test('no label carries an SVG filter (url(#…)): it drew boxes on iPhone and redrew every frame', () => {
  for (const { sel, body } of rules) if (/#labels/.test(sel)) assert.doesNotMatch(body, /filter:\s*url\(/, `"${sel}" puts an SVG filter on a label`);
  assert.doesNotMatch(stage, /id: 'lb-onv'|feMorphology/, 'stage.js still builds the grown-glyph label filter');
});

test('a reading on its vessel takes a 7 px stage-coloured text halo, in the Circuit (.cmap) only', () => {
  const on = rules.filter(({ sel }) => /\.on-vessel/.test(sel));
  assert.ok(on.length, 'a rule styles .on-vessel');
  for (const { sel, body } of on) {
    for (const one of sel.split(',')) assert.match(one.trim(), /^\.cmap\s/, `"${one.trim()}" applies the on-vessel halo outside the Circuit`);
    assert.match(body, /stroke:\s*var\(--stage-bg\)/);
    assert.match(body, /stroke-width:\s*7px/);
  }
});

test('the stage sets .cmap only while the Circuit shows', () => {
  assert.match(stage, /stageWrap\.classList\.toggle\('cmap', t > 0\.5\)/);
  assert.match(stage, /stageWrap = wrap\.closest\('\.stage-wrap'\)/);
});
