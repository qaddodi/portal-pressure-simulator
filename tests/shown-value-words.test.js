// Review 15 Oct, #12, #13, #15, #16, #45: a word beside a number judges the number as it is printed, a narrowed stent is
// judged where it is sampled, "Why?" shows each gradient's own formula, and the Doppler strip's words never run into the scale's unit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RATE, rateOf, rateShown, tileShown } from '../src/ui/table-marks.js';
import { varixGrade, ascitesGrade } from '../src/engine/metrics.js';
import { Engine } from '../src/engine/engine.js';
import { explain } from '../src/engine/explain.js';
import { stentSegments } from '../src/engine/topology.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('#12: a portal flow that reads 0.0 L/min is "No flow", not "Hepatopetal"', () => {
  for (const v of [0, 0.03, -0.04, 0.049]) assert.deepEqual(rateShown('pvFlow', { pvFlow: v }), ['hi', 'No flow'], `${v}`);
  assert.equal(rateShown('pvFlow', { pvFlow: 0.06 })[1], 'Hepatopetal');
  assert.equal(rateShown('pvFlow', { pvFlow: -0.06 })[1], 'Hepatofugal');
  assert.equal(RATE.pvFlow(0)[1], 'No flow');
});

test('#13: a tile word judges the value it prints', () => {
  assert.equal(rateOf('asc', { asc: 4980 })[1], 'Grade 2');            // (the old way: unrounded)
  assert.equal(rateShown('asc', { asc: 4980 })[1], 'Grade 3');          // "5.0 L"
  assert.equal(rateShown('varix', { varix: 2.49 })[1], 'Small');        // "2.5 mm"
  assert.equal(rateShown('varix', { varix: 4.97 })[1], 'Large');        // "5.0 mm"
  assert.equal(rateShown('hvpg', { hvpg: 9.96 })[1], 'CSPH');           // "10.0 mmHg"
  assert.equal(rateShown('shunt', { shunt: 0.296 })[1], 'Large');      // "30%"
  assert.equal(rateShown('liver', { liver: 75.4 })[1], 'Low');          // "75%"
  assert.equal(tileShown('asc', 4980), 5000);
  // Every tile at every cut-off: just under a cut-off that prints as the cut-off reads as the cut-off itself.
  for (const k of ['hvpg', 'ppg', 'pv', 'sin', 'varix', 'gv', 'lsm', 'hb', 'spleen']) {
    for (const c of [5, 6, 9, 10, 12, 15, 25, 2.5, 7, 13, 16]) {
      const near = c - 0.004;
      assert.deepEqual(rateShown(k, { [k]: near }), rateOf(k, { [k]: c }), `${k} at ${near}`);
    }
  }
});

test('#13: the engine grades judge the printed diameter and volume (Endoscopy, Ascites tab, Patients readouts)', () => {
  assert.equal(varixGrade(2.46).label, 'Small');
  assert.equal(varixGrade(4.96).code, 'F2');
  assert.equal(varixGrade(2.44).label, 'None');
  assert.equal(ascitesGrade(4960).grade, 3);
  assert.equal(ascitesGrade(4940).grade, 2);
  assert.equal(ascitesGrade(1440).grade, 1);
  assert.equal(ascitesGrade(1460).grade, 2);   // "1.5 L"
  // (util.js needs a DOM, so its helper is read as text and run here.)
  const def = read('../src/ui/util.js').match(/export const shownOf = (\([^\n]*);/)[1];
  const shownOf = (0, eval)(def);
  assert.ok(Object.is(shownOf(-0.04, 1), 0));
  assert.equal(shownOf(9.96, 1), 10);
  assert.equal(shownOf(74.6, 0), 75);
  // The Patients readouts pass the printed value to their words (and import the helper that gives it).
  for (const f of ['dock.js', 'readouts-pane.js']) assert.match(read(`../src/ui/${f}`), /^import \{[^}]*\bshownOf\b[^}]*\} from '\.\/util\.js/m, f);
  assert.match(read('../src/ui/dock.js'), /vs = shownOf\(v, t\.d\)[^\n]*\n[^\n]*\(vs, \.\.\.a\);\n\s*sev = t\.st\(vs, \.\.\.a\);/);
  assert.match(read('../src/ui/readouts-pane.js'), /t\.s\(vs, m\);\n\s*sev = t\.st\(vs, m\);/);
  assert.match(read('../src/ui/presenter.js'), /ratedShown\(p\.k, f\)/);
});

test('#15: a stent sampled at a 90% narrowing reads its jet, judged there, not "No flow"', () => {
  const open = 0.19, g = stentSegments(1, 0.9, 'distal')[2];
  assert.ok(open < 2 && open * g > 2, `gate factor ${g}`);
  const src = read('../src/ui/doppler.js');
  assert.match(src, /function interpret\(r0, g = 1\)/);
  assert.match(src, /const it = interpret\(r, gateFactor\(\)\);/);
  assert.match(src, /mean: r0\.mean \* g, vmax: r0\.vmax \* g, vmin: r0\.vmin \* g, vmaxMean: r0\.vmaxMean \* g, vminMean: r0\.vminMean \* g/);
});

test('#16: "Why?" for PPG and HVPG shows its own formula, adding up to the number above it', () => {
  const e = new Engine(); e.loadPreset('csph');
  for (let i = 0; i < 4; i++) e.settleQuick();
  for (const [id, re] of [['ppg', /^PPG = portal vein − IVC = ([\d.]+) − ([\d.]+) = ([\d.]+) mmHg/], ['hvpg', /^HVPG = WHVP − FHVP = ([\d.]+) − ([\d.]+) = ([\d.]+) mmHg/]]) {
    const r = explain(e, id), m = r.formula.match(re);
    assert.ok(m, `${id}: ${r.formula}`);
    assert.equal((+m[1] - +m[2]).toFixed(1), m[3], r.formula);
    assert.ok(r.sentence.includes(` is ${m[3]} mmHg`), `${r.sentence} / ${r.formula}`);
  }
  assert.match(explain(e, 'pv').formula, /^ΔP\(portal → hepatic vein\)/);
});

test('#45: on a slide the scale unit leaves the top strip, and the strip fits by fixed steps without cutting or dropping a word', () => {
  const src = read('../src/ui/doppler.js'), css = read('../styles/app.css');
  assert.match(src, /ctx\.fillText\('cm\/s', w - 6, ovOn \? yLab : 13\)/);
  // (the pattern, "High velocity" on a narrowed stent, is never hidden: its last step is a line of its own under the reading)
  assert.doesNotMatch(src, /patternEl\.hidden = true/);
  // (one line before two, Mohammad 20 Oct: the direction's short form, "PV → HV", on one line before the pattern takes a line of its own)
  assert.match(src, /const STEPS = \[\[1, false, false\], \[0\.9, false, false\], \[0\.8, false, false\], \[0\.9, true, false\], \[0\.8, true, false\], \[1, false, true\], \[0\.9, false, true\], \[0\.8, false, true\], \[0\.9, true, true\], \[0\.8, true, true\]\];/);
  assert.match(src, /'Portal → hepatic vein': 'PV → HV'/);
  // (the strip's right side is free once "cm/s" moved to the bottom strip)
  assert.match(css, /\.pz-tool\[data-kind="doppler"\] \.dop-report \{ grid-area: 1 \/ 1 \/ 2 \/ -1;[^}]*padding: 8px 12px 0 12px;/);
  // (the pattern sits inside .dop-velrow, so the wrap rules use a descendant selector: a child one never matched)
  assert.match(css, /\.dop-report\.dop-wrap \.dop-pattern \{ flex: 0 0 100%; \}/);
  assert.match(css, /#app \.instrument-workspace \.instrument-view\.dop \.dop-report\.dop-wrap \.dop-pattern \{ grid-row: 2; grid-column: 1 \/ -1;/);
});
