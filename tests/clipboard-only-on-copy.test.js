// The app writes to the system clipboard only when the user asks to copy (a Copy button, "Copy link to this view", the search card's "Copy share link").
// Play-test, 16 Nov 2026: a tester saw the clipboard written after picking a patient. Every write in src/ is listed here with the control that asks for it;
// a new write anywhere else fails this test until it is added with its control, so nothing can copy by itself (on a pick, a load, a frame or a timer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => (statSync(join(ROOT, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// file -> [how many writes, the user's control that runs each]
const ALLOWED = {
  'src/ui/frame-hud.js': [1, 'the HUD\'s Copy button (copyB.onclick)'],
  'src/ui/presenter-library.js': [1, 'a deck or script row\'s Copy link button'],
  'src/ui/main.js': [1, 'share(): the menu\'s "Copy link to this view" and the search card\'s "Copy share link"'],
  'src/ui/perf-readout.js': [2, '?perf Copy button (writeText, then its select-and-copy fallback)'],
  'src/ui/lap.js': [2, '?lap Copy button (writeText, then its select-and-copy fallback)'],
};

test('every clipboard write in the app is behind a control the user taps', () => {
  const found = {};
  for (const f of walk('src').filter((p) => p.endsWith('.js'))) {
    const n = (code(readFileSync(join(ROOT, f), 'utf8')).match(/clipboard\??\.write(Text)?\(|execCommand\(\s*['"](copy|cut)['"]/g) || []).length;
    if (n) found[f.replaceAll('\\', '/')] = n;
  }
  for (const [f, n] of Object.entries(found)) assert.ok(ALLOWED[f], `${f} writes to the clipboard (${n}): add it to this list with the control the user taps, or remove the write`);
  for (const [f, [n]] of Object.entries(ALLOWED)) assert.equal(found[f] ?? 0, n, `${f}: ${n} writes expected`);
});

test('share() runs only from the menu\'s link and the search card\'s command', () => {
  const main = code(readFileSync(join(ROOT, 'src/ui/main.js'), 'utf8')), menu = code(readFileSync(join(ROOT, 'src/ui/menu.js'), 'utf8')), pal = code(readFileSync(join(ROOT, 'src/ui/palette.js'), 'utf8'));
  assert.equal((menu.match(/share\(\)/g) || []).length, 1);
  assert.match(menu, /onclick: \(\) => \{ close\(\); share\(\); \}/);
  assert.equal((pal.match(/ctx\.share\(\)/g) || []).length, 1);
  assert.ok(!/[^.\w]share\(\)/.test(main.replace(/async function share\(\)/, '')), 'main.js calls share() nowhere itself');
});
