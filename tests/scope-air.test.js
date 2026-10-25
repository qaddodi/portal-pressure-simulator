// The scope's options for the insufflation lesson (deck rebuild plan B1): air (mmHg in the lumen: the varix is drawn and measured as it is seen at
// that pressure, from the model's table), red (the red wale marks shown or hidden), readings (three pressures), and the two presenter additions
// that move them: a what-if slider with tool in place of param, and compare buttons with tool. The table itself is tests/varix-air.test.js.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { endoGrow, airRatio, airFlat } from '../src/ui/endo-size.js';
import { abChoice } from '../src/ui/presenter.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const instruments = read('../src/ui/instruments.js'), presenter = read('../src/ui/presenter.js'), tools = read('../src/ui/presenter-tools.js'), css = read('../styles/app.css');
const run = (g) => { let n; do { n = g.next(); } while (!n.done); };
const table = (() => { const e = new Engine(); run(e.loadPresetSteps('cirr-decomp', {})); e.settle(); return computeMetrics(e).varix.air; })();

test('airRatio: the share of its size a varix is seen at, from the model\'s table, read between the steps', () => {
  assert.equal(airRatio(table, 0), 1);
  assert.ok(Math.abs(airRatio(table, 10) * table[0] - 6.2) < 0.15, `6.2 mm at 10 mmHg (${(airRatio(table, 10) * table[0]).toFixed(2)})`);
  assert.ok(Math.abs(airRatio(table, 18) * table[0] - 2.7) < 0.15, '2.7 mm at 18 mmHg');
  const mid = airRatio(table, 16.5);
  assert.ok(mid < airRatio(table, 16) && mid > airRatio(table, 17), 'between the steps it lies between them');
  assert.equal(airRatio(table, 40), airRatio(table, 20), 'the table ends at 20 mmHg');
  for (const bad of [null, undefined, [], [0, 0], 'x']) assert.equal(airRatio(bad, 10), 1, 'no table, no change');
  assert.equal(airRatio(table, -3), 1);
  assert.equal(airRatio(table, NaN), 1);
});

test('airFlat: the drawing flattens smoothly with the size seen and is untouched without air', () => {
  assert.equal(airFlat(7.2, 1), 1);
  assert.equal(airFlat(7.2, 1.2), 1);
  assert.equal(airFlat(7.2, 2 / 7.2), 0, 'flat at the resting vein');
  assert.equal(airFlat(7.2, 0.1), 0);
  assert.equal(airFlat(2, 0.5), 1, 'nothing to flatten on a vein that is not a varix');
  let prev = endoGrow(table[0]), worst = 0;
  for (let a = 0; a <= 20; a += 0.05) {
    const g = endoGrow(table[0]) * airFlat(table[0], airRatio(table, a));
    assert.ok(g <= prev + 1e-9, `air never makes the drawing fuller (${a} mmHg)`);
    worst = Math.max(worst, prev - g); prev = g;
  }
  // (A step of 0.05 mmHg may move the drawing by little: it never jumps, even where the size crosses 5 mm and Large becomes Small to the eye.)
  assert.ok(worst < 0.02, `no jump while the air rises (largest step ${worst.toFixed(4)})`);
  assert.ok(prev < 0.05, 'a varix at 20 mmHg is drawn flat');
});

test('the scope takes its options from the slide, eases them in and keeps the grade at rest', () => {
  assert.match(instruments, /const opt = \{ air: 0, red: null, readings: false \};/);
  assert.match(instruments, /function configure\(t\) \{[\s\S]*?clamp\(\+t\?\.air \|\| 0, 0, 20\)[\s\S]*?typeof t\?\.red === 'boolean'[\s\S]*?!!t\?\.readings/);
  assert.match(instruments, /return \{ id: 'endoscopy', label: 'Endoscopy', el, update, configure, pin,/);
  // The grade is read at rest, never from the air; the red marks follow the switch when there is one, the model's rule when there is not.
  assert.match(instruments, /set\(gradeLabel, vx\.grade\.label\);/);
  assert.match(instruments, /const tr = opt\.red == null \? peakRed : \+opt\.red;/);
  assert.match(instruments, /\(opt\.red \?\? vx\.redWale\) \? 'Red wale, cherry spots' : 'None'/);
  // The drawing and the size seen share one air ratio, from the beat-averaged table.
  assert.match(instruments, /const kAir = airRatio\(mv\.air, opt\.air\), gAir = gNow \* airFlat\(mv\.d, kAir\);/);
  assert.match(instruments, /set\(diam, `\$\{fmt\(rest \* airRatio\(mv\?\.air \?\? vx\.air, opt\.air\), 1\)\} mm`\)/);
  // The pressures: in the varix, in the lumen, and across the wall, the difference of the two as printed.
  assert.match(instruments, /set\(pIn, `\$\{fmt\(inV, 1\)\} mmHg`\); set\(pLum, `\$\{fmt\(opt\.air, 1\)\} mmHg`\); set\(pAcross, `\$\{fmt\(inV - opt\.air, 1\)\} mmHg`\)/);
  const names = [...instruments.matchAll(/h\('dt', \{\}, '(In the varix|Lumen|Across the wall)'\)/g)].map((m) => m[1]);
  assert.deepEqual(names, ['In the varix', 'Lumen', 'Across the wall']);
  // Without the option the Tests card's scope is what it was: the rows are not in its list.
  assert.match(instruments, /if \(readings\) \{ if \(pRows\[0\]\.parentNode !== stats\) stats\.lastElementChild\.before\(\.\.\.pRows\); \} else for \(const r of pRows\) r\.remove\(\);/);
  assert.match(css, /\.pz-tool\[data-kind="scope"\] \.pz-inst\[data-readings\] \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/, 'the presenter\'s card lays the pressures out in three columns');
  assert.match(css, /\.pz-tool\[data-kind="scope"\] \.endo-read > \.endo-pr \{ display: flex; flex-direction: column;/, 'and shows them, which its compact row hides for the other tiles');
  assert.match(instruments, /el\.toggleAttribute\('data-readings', readings\)/);
});

test('compare buttons can change the slide\'s instrument options, and the slide\'s own button puts them back', () => {
  const row = [{ label: 'No red signs', tool: { red: false } }, { label: 'Red signs', own: true }];
  assert.deepEqual(abChoice(row, 0), { kind: 'tool', tool: { red: false } });
  assert.deepEqual(abChoice(row, 1), { kind: 'tool', tool: null }, 'the slide\'s own options');
  // (the other rows are as they were)
  assert.deepEqual(abChoice([{ label: 'A', preset: 'csph' }, { label: 'B', own: true }], 1), { kind: 'state' });
  assert.deepEqual(abChoice([{ label: 'A', lens: 'flow' }, { label: 'B', lens: 'pressure', own: true }], 1), { kind: 'lens', lens: 'pressure' });
  assert.match(presenter, /if \(c\.kind === 'tool'\) \{ ui\.tools\.option\(c\.tool\); return; \}/, 'a tool button leaves the model alone');
  assert.match(tools, /option\(patch\) \{ if \(cur && lastTool\) cur\.configure\?\.\(patch \? \{ \.\.\.lastTool, \.\.\.patch \} : lastTool, lastCtx\); \}/);
  assert.match(tools, /inst\.configure\?\.\(t, ctx\);[^\n]*\n\s*lastTool = t; lastCtx = ctx;/, 'every slide sets its own options again, a kept card too');
});

test('a what-if slider can move an instrument option: no model change, no worker message, and it starts at the slide\'s own value', () => {
  const fn = presenter.slice(presenter.indexOf('function whatIfEl'), presenter.indexOf('function stopLapse'));
  assert.match(fn, /const v0 = \+\(w\.tool \? s\.tool\?\.\[w\.tool\] \?\? w\.min :/);
  assert.match(fn, /if \(w\.tool\) \{ ui\?\.tools\.option\(\{ \[w\.tool\]: \+input\.value \}\); return; \}/);
  assert.match(fn, /liveSet\(s, i, patchOf\(\+input\.value\)\)/, 'a model slider goes through the worker as before');
  assert.ok(!/host\.send/.test(fn), 'the slider itself sends nothing to the model');
});
