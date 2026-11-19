// About and References say what is true now (bible review 19 Nov 2026, ENG-8): no "check still pending" beside the full text in the repo, no
// rule-in criteria called an indeterminate zone, no "gradients only" sentence over a table that colors the portal vein pressure, and a reference
// for every guideline the decks cite (guidelines/README.md lists them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
const about = main.slice(main.indexOf('function openAbout('), main.indexOf('function openPrivacy('));

test('About does not call the check against the full Baveno VIII text pending, nor the CSPH rule-in criteria an indeterminate zone', () => {
  assert.ok(about.length > 2000, 'found the About page');
  assert.ok(!/line-by-line check[^.]*pending|published summaries/.test(about));
  assert.ok(!/indeterminate zone for stiffness/.test(about));
  assert.ok(!/Thresholds belong to gradients, not to the color of a vessel/.test(about));
  assert.ok(!/Every readout’s bar and status word follow a clinical cut-off/.test(about), 'the PPG lines are the model\'s own');
});

test('every guideline a deck cites has a reference, and every reference has a year and a source', () => {
  const refs = about.slice(about.indexOf("data-sec': 'refs'"), about.indexOf("h('h3', {}, 'Licenses')"));
  for (const [what, re] of [['Baveno VIII', /Baveno VIII/], ['AASLD 2024', /AASLD Practice Guidance on risk stratification[^']*2024/], ['EASL 2025', /EASL Clinical Practice Guidelines on vascular diseases of the liver/],
    ['AASLD 2021', /AASLD\.? Hepatology 2021;74/], ['AASLD 2020', /2020 practice guidance by the AASLD\. Hepatology 2021;73/]]) assert.ok(re.test(refs), `References lacks ${what}`);
  assert.ok(!/Hepatology \/ Semin Liver Dis\./.test(refs), 'the HVPG reference names its journal, year and pages');
  assert.ok(/Semin Liver Dis 2006;26:348/.test(refs));
});
