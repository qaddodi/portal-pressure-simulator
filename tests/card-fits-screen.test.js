// A card of any height fits the screen or scrolls (17 Nov 2026, Mohammad's iPhone: the TIPS card's last row, Ends, was cut off behind the view switch).
// The phone's card had one fixed height for each size (224, 300, 400 px), so a card with more rows than its size held showed only what fitted; the Mac's
// shelf took 500 px or the window's height, whichever was less, and cut the rest the same way. Now a card is as tall as its words (its size is the least),
// no taller than the room between the case pill and what is under it, and its body scrolls past that. The rules are in CSS, so this reads the CSS and the
// source (no layout in node), and works out from the model that the stent's card is taller than its old size by the same row count the card shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const css = read('styles/app-03-layouts.css'), thumb = read('styles/app-10-thumb-dock.css'), card = read('src/ui/card.js');
const rule = (src, sel) => { const m = src.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm')); return m ? m[1] : null; };

test('the phone\'s docked card has no fixed height: its size is the least it is, and the room is the most', () => {
  const docked = css.match(/^\.action-card\.docked \{([^}]*)\}/m)[1];
  assert.match(docked, /height: auto;/);
  assert.match(docked, /min-height: min\(224px, var\(--ac-max\)\)/);
  assert.match(docked, /max-height: var\(--ac-max\)/);
  assert.doesNotMatch(docked, /[^-]height: \d+px/, 'no fixed height');
  for (const k of ['l', 'x']) assert.doesNotMatch(rule(css, `.action-card.docked[data-size=${k}]`) || '', /[^-]height: \d+px/, `size ${k} is a least, not a height`);
  assert.match(rule(css, '.action-card.docked[data-size=l]'), /min-height: min\(300px, var\(--ac-max\)\)/);
});

test('the room is what is left between the case pill and the card\'s own foot, in each place the card stands', () => {
  // the card's foot: the safe area and 6 px; above the Tests card the dock's top; above the view switch its own distance
  assert.match(css, /--ac-max: calc\(100% - env\(safe-area-inset-bottom\) - 6px - var\(--top-safe, 56px\) - 56px\);/);
  assert.match(css, /\.app\.dock-open:not\(\.instrument-focus\) \.action-card\.docked \{ bottom: var\(--bot-occ, 0px\); --ac-max: calc\(100% - var\(--bot-occ, 0px\) - var\(--top-safe, 56px\) - 56px\); \}/);
  assert.match(thumb, /\.app\.thumb:not\(\.dock-open\) \.action-card\.docked \{ --ac-max: calc\(100% - var\(--nb-occ, calc\(var\(--vdock-h\) \+ 14px\)\) - 50px - var\(--top-safe, 56px\) - 56px\); \}/);
  // and the bottom it stands at is the one the room takes off
  assert.match(thumb, /\.app\.thumb:not\(\.dock-open\) \.action-card\.docked \{\n {4}bottom: calc\(var\(--nb-occ, calc\(var\(--vdock-h\) \+ 14px\)\) \+ 50px\);/);
});

test('the body is in the card\'s flow and scrolls past the room, on the phone and on the shelf', () => {
  assert.match(css, /\.action-card\.docked:not\(\[hidden\]\) \{ display: flex; flex-direction: column; \}/);
  assert.match(css, /\.action-card\.docked > \.ac-body \{ position: relative; inset: auto; flex: 0 1 auto; min-height: 0; min-width: 0; overflow-x: hidden; overflow-y: auto;/, 'down, never sideways (F38)');
  assert.match(css, /\.action-card:not\(\.docked\) \{ max-height: min\(500px, calc\(100% - var\(--top-safe, 56px\) - 24px\)\); \}/);
  assert.match(css, /\.action-card:not\(\.docked\):not\(\[hidden\]\) \{ display: flex; flex-direction: column; \}/);
  assert.match(css, /\.action-card:not\(\.docked\) > \.ac-body \{ flex: 0 1 auto; min-height: 0; min-width: 0; overflow-x: hidden; overflow-y: auto;/, 'down, never sideways (F38)');
});

test('a card too tall for its room takes the vertical touch for scrolling, one that fits keeps the pull that puts it away', () => {
  assert.match(css, /\.action-card\.docked\.ac-scroll > \.ac-body \{ touch-action: pan-y; \}/);
  assert.match(css, /\.action-card\.docked :is\(\.ac-body, \.ac-ghost(?:, \.ac-details)?\) \{[^}]*touch-action: none;/, 'a card that fits keeps touch-action: none');
  // card.js: the flag follows the body's own scroll height, read through layout-snap between frames (revealNow), and changes only when it flips
  assert.match(card, /readMetric\(body, 'scrollHeight'\) > readMetric\(body, 'clientHeight'\) \+ 1/);
  assert.match(card, /if \(tall !== cardTall\) \{ cardTall = tall; el\.classList\.toggle\('ac-scroll', tall\); \}/);
  const frameCalls = card.split('\n').filter((l) => /scrollHeight/.test(l) && !/readMetric/.test(l) && !/^\s*\/\//.test(l));
  assert.deepEqual(frameCalls, [], 'no direct layout read in card.js');
});

test('the stent\'s card holds more rows than its size\'s old height: Waist length and Ends (why it was cut off)', () => {
  const actions = read('src/ui/actions.js');
  for (const id of ["id: 'waist'", "id: 'ends'"]) assert.ok(actions.includes(id), `the stent's card has ${id}`);
});

test('a stent\'s vessel card holds its editor\'s rows, the TIPS view\'s, so the phone\'s card leaves the stent in sight (play-test finding 9, 17 Nov 2026)', () => {
  const actions = read('src/ui/actions.js'), card = read('src/ui/card.js');
  assert.match(actions, /const STENT_PANEL = \(id\) => \(\{ type: 'panel', id: 'stent', label: 'Edit stent', make: \(\) => createStentEditor\(\{ id, onOpen: /);
  assert.equal((actions.match(/verbs\.push\(STENT_PANEL\(id\)\);/g) || []).length, 1, 'a drawn stent');
  assert.equal((actions.match(/verbs\.push\(TIPS_PANEL\(id\)\);/g) || []).length, 1, 'the TIPS and DIPS: the stent, its numbers and the rows (tips-vessel.js)');
  assert.doesNotMatch(actions, /stentControls\(id\)\.slice\(1\)/, 'no stack of slider rows on the card');
  assert.match(card, /const x = v\.make\(\);\n\s*panels\.push\(x\);/, 'a panel is kept to be destroyed');
  assert.equal((card.match(/dropPanels\(\);/g) || []).length, 2, 'on a rebuild and on close: no editor keeps following the params after its card');
});
