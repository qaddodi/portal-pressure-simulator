// The source shapes of the external production-readiness review's fixes (15 Nov 2026), moved out of their tests (PR-02: a test judges behaviour; a rule about the
// text lives here with its reason). What each does when it runs is judged by tests/view-writers.test.js, build-css-warnings.test.js, ppg-model-lines.test.js and
// a11y-caption-vocabulary.test.js.
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const srcFiles = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.js')).map((f) => relative(ROOT, f).split('\\').join('/'));

const rules = [];

// R08: the three view fields (view, lobule, sinusoid) are written only by the store's setViewKey, in one legal set.
for (const file of srcFiles.filter((f) => f !== 'src/ui/store.js')) {
  rules.push({ file, uncomment: true, forbid: [/\b(?:store|st|state)\.(?:set|setSoon)\(\s*\{[^}]*?\b(?:view|lobule|sinusoid)\s*:/, "write the view with setViewKey('anatomy' | 'circuit' | 'lobule' | 'sinusoid'): a field-by-field write lets a listener hear an illegal view (R08)"] });
  rules.push({ file, uncomment: true, forbid: [/\bstore\.set1\(\s*'(?:view|lobule|sinusoid)'/, 'write the view with setViewKey (R08)'] });
}
for (const f of ['eus-ppg', 'ir-ppg', 'hvpg-proc']) {
  rules.push({ file: `src/ui/${f}.js`, need: [/if \(st\.lobule \|\| st\.view !== 'anatomic'\) setViewKey\('anatomy'\)/, 'a procedure that needs the anatomy asks for it once, however the view was left (the lobule, the sinusoid, the circuit) (R08)'] });
}

// R05: the selected instrument tab's forced-colors rule is whole (a stray ")" once made the browser drop it), and the build refuses a CSS syntax error.
const DV = 'styles/app-11-deck-visuals.css';
rules.push({ file: DV, need: [/:is\(\.ib\[aria-pressed="true"\], \.seg button\[aria-pressed="true"\], \.seg button\[aria-selected="true"\], \.instr-tab\[aria-selected="true"\]\) \{ forced-color-adjust: none; background: Highlight; color: HighlightText; \}/, 'the selected instrument tab has a forced-colors rule for the tab (R05)'] });
rules.push({ file: DV, need: [/\.instr-tab\[aria-selected="true"\] :is\(\.ic, \.ic \*\) \{ background-color: HighlightText; \}/, "and for its icon (R05)"] });
rules.push({ file: DV, forbid: [/\[aria-selected="true"\]\) :is\(\.ic/, 'the stray ")" after the tab selector is gone (R05)'] });
rules.push({ file: 'scripts/build.mjs', need: [/from '\.\/build-warnings\.mjs'/, 'the build takes its fatal-warning list from build-warnings.mjs (R05)'] });
rules.push({ file: 'scripts/build.mjs', need: [/fatalWarnings\(r\.warnings\)/, 'and refuses to finish with one (R05)'] });

// §6.2: the PPG's and EUS-PPG's lines are the model's reference lines, said where they are read.
rules.push({ file: 'src/ui/table-marks.js', need: [/ppg: \{ t: 'PPG'[^\n]*not guideline cut-offs/, "the PPG tile's description says its lines are not guideline cut-offs (§6.2)"] });
rules.push({ file: 'src/ui/table-marks.js', need: [/ppg: '↑ ≥6, ↑↑ ≥12 mmHg \(the model/, "the PPG column heading says they are the model's lines (§6.2)"] });
rules.push({ file: 'src/ui/table-marks.js', need: [/eus: '↑ >5, ↑↑ ≥10 mmHg \(the HVPG/, "the EUS-PPG column heading says it is read on the HVPG's lines as a model reference (§6.2)"] });
rules.push({ file: 'src/ui/eus-ppg.js', need: [/title: TECHNIQUE/, "the EUS-PPG button's tooltip is the technique's card text (§6.2)"] });
rules.push({ file: 'src/ui/eus-ppg.js', need: [/\$\{EUS_LINE_NOTE\}/, 'which ends with the shared limitation sentence (§6.2)'] });
rules.push({ file: 'src/ui/eus-ppg.js', need: [/a model reference\)\. EUS-PPG = LPV − LHV/, "the result line names the sites and says the lines are a model reference (§6.2)"] });

// R09: the screen-reader caption keeps no cut-off of its own.
rules.push({ file: 'src/ui/a11y.js', uncomment: true, forbid: [/pvS|\(raised\)|\(high\)/, 'the caption reads the shared band words (pressure-cuts.js), not its own thresholds (R09)'] });

export default rules;
