// An iPad held sideways sets Details, Tests and Treat or History side by side. Where they would leave a vessel card (300 px and its
// margins) less than 316 px, the other right-hand cards give way, one at a time, easing out (31 Oct, phone and iPad layout).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');

test('every way a right-hand card opens asks the others to give way when the vessel card would have no strip', () => {
  const main = read('src/ui/main.js');
  const short = main.slice(main.indexOf('function rightShort(opening)'), main.indexOf('function openPanel('));
  assert.match(short, /matchMedia\('\(pointer: coarse\)'\)\.matches\) return false/, 'a mouse screen is untouched');
  assert.match(short, /isPhone\(\) \|\|/, 'a phone has its own rules');
  assert.match(short, /w\.length > 1 && innerWidth - w\.reduce\(\(a, b\) => a \+ b, 0\) - \(w\.length \+ 1\) \* 12 < 316/);
  assert.match(short, /for \(const k of \['treat', 'dock', 'panel'\]\)/, 'Treat or History first, then Tests, then Details');
  assert.match(main, /else giveWay\('panel'\);/, 'Details');
  assert.match(main, /if \(instr && !was\) giveWay\('dock'\);/, 'Tests');
  assert.equal((main.match(/giveWay\('treat'\)/g) || []).length, 2, 'Treat and History');
});

test('Tests is 380 px wide on a touch screen below 1200 wide, which the give-way arithmetic assumes', () => {
  assert.match(read('src/ui/dock.js'), /coarseMQ\.matches && W < 1200 \? 380 : Math\.max\(440, W \* 0\.38\)/);
});
