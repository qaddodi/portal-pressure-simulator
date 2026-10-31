// A phone's home framing shows its Key labels as names alone (31 Oct, round2-recs § 6.3, his yes to the combined plan): the readings
// come with a tap on a name (the selected station keeps its reading) or a zoom past 1.3×; a slide's labels and the All level always
// carry their readings, and nothing changes off a phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const decl = stage.match(/const labelNamesOnly = \(\) => (\{[^\n]*\});/);

// The predicate, run on its own source with the stage's state stubbed in.
const run = ({ presenting = false, width = 390, level, zoomed = false } = {}) => {
  const fn = new Function('store', 'stageBox', 'zoomedIn', `return () => ${decl[1]};`);
  return fn({ get: () => ({ presenting, labelLevel: level }) }, () => ({ width }), () => zoomed)();
};

test('names only: Explore, Key level, a stage narrower than 700 px, not zoomed in', () => {
  assert.ok(decl, 'labelNamesOnly is declared');
  assert.equal(run(), true);
  assert.equal(run({ level: 'key' }), true);
  assert.equal(run({ width: 699 }), true);
});

test('everything else keeps its readings: wider stages, zoomed in, the All and None levels, a presenting slide', () => {
  assert.equal(run({ width: 700 }), false, 'an iPad or a laptop');
  assert.equal(run({ width: 1280 }), false);
  assert.equal(run({ zoomed: true }), false, 'past 1.3× the stations carry their readings');
  assert.equal(run({ level: 'all' }), false);
  assert.equal(run({ level: 'none' }), false);
  assert.equal(run({ presenting: true }), false, "a slide's labels are what it teaches with");
});

test('a label of names only is the name (and a reversed flow\'s ⟲), never the reading; the selected station keeps its reading', () => {
  const item = stage.match(/function nodeItem\(id, f, mode, compact, namesOnly = false\) \{[\s\S]*?\n {2}\}\n/)[0];
  assert.match(item, /const names = namesOnly && !sel && one;/);
  assert.match(item, /if \(names\) \{ if \(rev\) lines\[0\]\.push\(\{ t: '⟲', size: 12, weight: 650, cls: 'lb-rev', gap: 5 \}\); \}/);
  // (With no names-only the readings go in exactly as they did.)
  assert.match(item, /else \{\n\s+if \(rev\) pr\.push\(\{ t: '⟲', size: 12, weight: 650, cls: 'lb-rev', gap: 5 \}\);\n\s+if \(pr && one\) lines\[0\]\.push\(\.\.\.pr\.map\(\(r, i\) => \(i \? r : \{ \.\.\.r, gap: 4 \}\)\)\);\n\s+else if \(pr\) lines\.push\(pr\);\n\s+\}/);
  // (The reading is still worked out for the screen reader, and the name can still take its abbreviation where it is crowded.)
  assert.match(item, /label: `\$\{NODES\[NI\[id\]\]\.label\}\$\{lr \? /);
  assert.match(item, /canShort: \(names \|\| !!pr\) && mode !== 'atlas'/);
  assert.match(item, /src: \['node', id, mode, compact, namesOnly\]/);
});

test('the live refresh and the layout pass the same flag, and a change of it lays the labels out again', () => {
  assert.match(stage, /const \[kind, id, mode, compact, names\] = it\.src;/);
  assert.match(stage, /nodeItem\(id, f, mode, compact, names\)/);
  assert.match(stage, /const lvl = st\.labelLevel \|\| 'key', zoomed = zoomedIn\(\), namesOnly = labelNamesOnly\(\);/);
  assert.match(stage, /nodeItem\(id, f, atlas \? 'atlas' : 'inline', compact, namesOnly\)/);
  assert.match(stage, /nodeItem\(id, f, 'inline', compact, namesOnly\);\n\s+it\.ax = ax; it\.ay = ay; it\.vw = mid \? vw \* CTM\.sc : 0; it\.pri = ANAT_PRI\[id\] \|\| 4;/, 'the stations a zoom adds');
  assert.match(stage, /vt\.k > 1\.35, labelNamesOnly\(\), st\.labelLevel,/, 'in the layout signature');
});

test('a reading that arrives on a label of names only fades in from part of its opacity; reduced motion and a first drawing skip it', () => {
  assert.match(stage, /const vals = !!it\.node && it\.lines\.some\(\(line\) => line\.some\(\(r\) => r\.cls === 'lb-val'\)\);/);
  assert.match(stage, /if \(b\.vals === false && vals && b\.g\.style\.display !== 'none' && !reduceMotion\.matches\) \{ b\.g\.animate\?\.\(\[\{ opacity: 0\.35 \}, \{ opacity: 1 \}\], \{ duration: 300, easing: 'ease-out' \}\); labelGL\?\.hold\(b\.g, 300\); \}\n\s+b\.vals = vals;/);
});
