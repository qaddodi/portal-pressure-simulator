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
  assert.match(short, /!matchMedia\('\(pointer: coarse\)'\)\.matches \|\| app\.classList\.contains\('instrument-focus'\)\) return false/, 'a mouse screen is untouched, and so is a maximised Tests card (no figure, no vessel card)');
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

test('a card that gives way hands focus on to the opening card\'s button; a dialog is not fitted to a pinched-in page and follows iOS\'s pan', () => {
  const main = read('src/ui/main.js');
  const gw = main.slice(main.indexOf('function giveWay(opening)'), main.indexOf('function openPanel('));
  assert.match(gw, /held = !!a && a !== document\.body && !!a\.closest\(k === 'treat' \? '#treatCard, #historyCard' : k === 'dock' \? '#dock' : '#panel'\)/);
  assert.match(gw, /opening === 'treat' \? \$\('#btnTreat'\) : opening === 'dock' \? \$\('#tabInstruments'\) : panelOpener/);
  assert.ok(gw.indexOf('closePanel()') < gw.indexOf('to.focus('), 'after the card is closed');
  const u = read('src/ui/util.js');
  assert.match(u, /modalVV && modalVV\.scale <= 1\.05 \? Math\.round\(innerHeight - modalVV\.offsetTop - modalVV\.height\) : 0/);
  assert.match(u, /back\.style\.setProperty\('--modal-top', `\$\{Math\.max\(0, Math\.round\(modalVV\.offsetTop\)\)\}px`\)/);
  assert.equal((u.match(/removeProperty\('--modal-top'\)/g) || []).length, 2, 'cleared with the keyboard and when the dialog has gone');
  const css = read('styles/app.css');
  assert.match(css, /\.modal-back \{ position: fixed; inset: var\(--modal-top, 0px\) 0 var\(--modal-kb, 0px\) 0;/);
  assert.match(css, /calc\(100dvh - var\(--modal-kb, 0px\) - var\(--modal-top, 0px\) - 32px/);
});

test('a page crossfade that the next one skips leaves no unhandled rejection', () => {
  const main = read('src/ui/main.js');
  const fn = main.slice(main.indexOf('function crossfade(fn)'), main.indexOf("addEventListener('pointerdown', (e) => {\n  const vt = pageFade;"));
  assert.match(fn, /vt\.ready\.catch\(\(\) => \{\}\); vt\.updateCallbackDone\.catch\(\(\) => \{\}\);/);
  assert.match(fn, /vt\.finished\.catch\(\(\) => \{\}\)\.finally\(/);
  assert.match(main, /vt\.finished\.catch\(\(\) => \{\}\)\.finally\(\(\) => document\.elementFromPoint/);
  assert.equal((main.match(/startViewTransition\(/g) || []).length, 1, 'every crossfade goes through crossfade()');
});
