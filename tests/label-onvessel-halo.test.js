// The solid halo behind a reading that sits on its vessel (stage.js layoutLabels, onVessel; filter #lb-onv) belongs to the Circuit
// only. In Anatomy it filled the stage's dark colour over the liver: dark boxes with tabs behind "Sinusoids R", "RHV", "LHV" and
// "Lower IVC" on Mohammad's iPhone (16 Oct, 541935a and 804275c). Every rule that applies the filter must sit under .cmap, the
// class the stage sets on its wrap only while the Circuit shows (stage.js: stageWrap.classList.toggle('cmap', t > 0.5)).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('the on-vessel halo is applied only in the Circuit (.cmap), never in Anatomy', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*url\(#lb-onv\)[^{}]*)\}/g)];
  assert.ok(rules.length, 'a rule applies the #lb-onv filter');
  for (const [, sel] of rules) for (const one of sel.split(',')) assert.match(one.trim(), /^\.cmap\s/, `"${one.trim()}" applies the solid halo outside the Circuit`);
});

test('the stage sets .cmap only while the Circuit shows', () => {
  assert.match(stage, /stageWrap\.classList\.toggle\('cmap', t > 0\.5\)/);
  assert.match(stage, /stageWrap = wrap\.closest\('\.stage-wrap'\)/);
});
