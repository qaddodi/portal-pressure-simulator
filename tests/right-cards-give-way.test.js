// An iPad held sideways sets Details, Tests and Treat or History side by side. Where they would leave a vessel card (300 px and its
// margins) less than 316 px, the other right-hand cards give way, one at a time, easing out (31 Oct, phone and iPad layout).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unsnap } from './unsnap.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => unsnap(readFileSync(join(root, f), 'utf8'));

test('every way a right-hand card opens asks the others to give way when the vessel card would have no strip', () => {
  const main = read('src/ui/main.js');
  const short = main.slice(main.indexOf('function rightShort(opening)'), main.indexOf('function openPanel('));
  assert.match(short, /isPhone\(\) \|\| app\.classList\.contains\('instrument-focus'\)\) return false/, 'a phone has its own rules, and a maximised Tests card has no figure and no vessel card');
  assert.doesNotMatch(short, /pointer: coarse/, 'a Mac too (13 Nov 2026: one rule for every wide screen)');
  assert.match(short, /n > 1 && innerWidth - sum - \(n \+ 1\) \* 12 < 316/);
  assert.match(short, /const GIVE_ORDER = \['treat', 'dock', 'panel'\];/, 'Treat or History first, then Tests, then Details');
  assert.match(short, /for \(const k of GIVE_ORDER\)/);
  assert.match(main, /else giveWay\('panel'\);/, 'Details');
  assert.match(main, /if \(instr && !was\) giveWay\('dock'\);/, 'Tests');
  assert.equal((main.match(/giveWay\('treat'\)/g) || []).length, 2, 'Treat and History');
});

test('Tests has one fixed width on a Mac and an iPad held sideways (500 px, no divider), which the give-way arithmetic assumes', () => {
  const dock = read('src/ui/dock.js');
  assert.match(dock, /const SIDE_W = 500;/);
  assert.match(dock, /: Math\.min\(SIDE_W, Math\.max\(360, W \* 0\.62\)\)\)/, 'no remembered width off a sideways phone');
  assert.match(dock, /divider\.hidden = state !== 'open' \|\| fixedSide\(\);/);
  assert.match(read('src/ui/main.js'), /\|\| Math\.min\(500, Math\.max\(360, innerWidth \* 0\.62\)\)/);
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
  assert.equal((u.match(/removeProperty\('--modal-top'\)/g) || []).length, 1, 'cleared in modalKbEnd, which the keyboard going and the dialog gone both run');
  assert.match(u, /modalKbEnd\(back\); modalBand = \[0, 0\]/);
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

// (A tap on the figure puts Treat away on a phone: the vessel card used to open behind it. Only the figure's own tap does it: Treat's own buttons
// (Spleen, TIPS, Band) select a vessel too, and Treat stays.)
test('a figure tap closes Treat on a phone; Treat\'s own selecting buttons do not', () => {
  const main = read('src/ui/main.js');
  assert.match(main, /onSelect: \(sel, opts\) => \{ if \(sel && isPhone\(\) && treatOpen\(\)\) closeTreat\(\); select\(sel\);/);
  assert.doesNotMatch(main, /store\.on\('selection', \(sel\) => \{ if \(sel && isPhone\(\) && treatOpen\(\)\) closeTreat\(\); \}\)/, 'no store-wide subscriber: it closed Treat from its own procedure buttons');
});

// (It was phone only, so that a laptop working with Tests open was not held back; the outside review of 1 Nov found the card standing over the
// top of Tests on a Mac and an iPad. It waits on every screen now: no surface is open on a fresh load (the Tests dock starts shut), so it
// comes as soon as the person has put the surface away.)
test('the feedback ask waits for every open working surface on every screen (Tests on a laptop too), menus and sheets included', () => {
  const main = read('src/ui/main.js');
  assert.match(main, /\|\| down \|\| presenter\.active\(\) \|\| projector \|\| app\.classList\.contains\('dock-open'\) \|\| panelShown\(\) \|\| treatOpen\(\) \|\| historyOpen\(\) \|\| popoverOpen\(\) \|\|/);
});

test('the Compare strip centres in the room the right-hand cards leave, and eases as they come and go', () => {
  const css = read('styles/app.css');
  const rule = css.match(/^\.sb-center\.float-ui \{([^}]*)\}/m)?.[1] ?? '';
  // (since the off-GPU gate: the room's centre is reached by translate, half the cards' width, not by easing right)
  assert.match(rule, /right: calc\(env\(safe-area-inset-right\) \+ var\(--gap\)\);/);
  assert.match(rule, /left: calc\(env\(safe-area-inset-left\) \+ var\(--gap\)\)/);
  assert.match(rule, /translate: calc\(-\.5 \* var\(--right-occ, 0px\)\) 0; transition: translate var\(--d-small\) var\(--ease\)/);
  assert.doesNotMatch(rule, /translateX\(-50%\)/, 'no longer centred on the whole window');
  assert.match(css, /^\.sb-center\.float-ui > \* \{ pointer-events: auto; margin-inline: auto; max-width: calc\(100% - var\(--right-occ, 0px\)\); \}/m);
});
