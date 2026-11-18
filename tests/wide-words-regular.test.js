// The words keep their Regular size on a laptop and an iPad too (Mohammad, 17 Nov 2026: "Fix this issue everywhere"). The stacked layout used to step the
// words down to Compact (title 0.8, words 0.88) whenever the data card made the pair too tall, then trim the title and drop the CAUSES line. Now the data
// card's blocks step smaller, its instrument folds behind Show and its own fit does the rest; only a phone on its side, with no room left, still steps the words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WIDE, SIDEWAYS_MAX_H } from '../src/ui/card-type.js';

const src = readFileSync(new URL('../src/ui/presenter-ladders.js', import.meta.url), 'utf8');
const a = src.indexOf('let below = false, gap = 0'), b = src.indexOf('fitCards(live.ui.data, live.ui.panel);', a);
const wide = src.slice(a, b);

test('off a phone on its side every step of the stacked layout puts the words at Regular', () => {
  assert.ok(a > 0 && b > a);
  assert.match(wide, /const sw = H <= SIDEWAYS_MAX_H \* k;/);
  // (17 Nov 2026, later: the title may step down before the data card is squeezed, to WIDE.title then WIDE.tight, the words (--pz-bk) never: Mohammad, the TIPS deck's data card clipped.)
  assert.match(wide, /const steps = \(\) => \{\s+if \(put\(tk0, 1\)\) return true;[\s\S]*?titleFloorK\([\s\S]*?put\(f, 1\)\);\s+\};/);   // (the words' bk is always 1 here)
  assert.match(wide, /const step = \(\) => \(sw \? put\(WIDE\.title, WIDE\.words\) : steps\(\)\);/);
  assert.match(wide, /const title = \(\) => \(sw \? put\(1, 1\) \|\| put\(WIDE\.title, WIDE\.words\) : steps\(\)\);/);
  // Every call that sets Compact is behind the sideways test: the title/ladder/squeeze steps go through step() or title() and the final fallback too.
  const calls = [...wide.matchAll(/put\(WIDE\.title, WIDE\.words\)/g)].map((m) => wide.slice(Math.max(0, m.index - 60), m.index));
  for (const c of calls) assert.match(c, /sw \? |sw && |sidewaysWords/, `a Compact step outside the sideways test: …${c}`);
  assert.match(wide, /if \(!below && sw\) squeeze\(\);/, 'the trimmed title and the CAUSES line gone: sideways only');
  assert.match(wide, /if \(!below\) \{ step\(\); below = true; \}/);
  assert.ok(SIDEWAYS_MAX_H <= 500 && WIDE.words < 1, 'Compact exists for the sideways phone');
});

test('the data card gives way instead: its blocks step down, its instrument folds', () => {
  assert.match(wide, /for \(const s of DK\) \{ if \(below\) break; stepDk\(s\); below = step\(\); \}/);
  assert.match(wide, /if \(!below && canFold && !held\) \{ setFolds\(true\);/);
});
