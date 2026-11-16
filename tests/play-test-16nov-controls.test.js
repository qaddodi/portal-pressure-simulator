// Play-test findings of 16 Nov 2026 (menus, search and controls). Each test names the root cause it guards, not the one case reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const css = ['01-chrome', '02-controls', '03-layouts', '07-floating', '08-cards', '10-thumb-dock'].map((n) => read(`styles/app-${n}.css`)).join('\n');

test('search: a take-down is offered only for what is in place, and an empty field offers a few of each thing', () => {
  const src = read('src/ui/palette.js');
  assert.match(src, /\{ kw = '', num = null, hint = '', when = true \} = \{\}\) => \{ if \(when\) cmds\.push/);
  for (const w of ['Remove TIPS', 'Remove DIPS']) assert.match(src, new RegExp(`'${w}'[^\\n]*when: !!P\\.(tips|dips)\\?\\.on`));
  assert.match(src, /take down \$\{SURGICAL_BY_ID\[id\]\.kw\}`, when: SURGICAL_BY_ID\[id\]\.key === 'portocaval' \? !!P\.portocaval : SURGICAL_BY_ID\[id\]\.on\(P\)/);
  assert.match(src, /const left = \{ Treat: 3, 'Go to': 2, Patient: 2, Time: 2, Present: 1 \}/, 'an empty field is not only Treat items');
  assert.doesNotMatch(src, /treatmer|'Search vessels, patients, treatments'/);
  assert.match(css, /\.pal-input \{ flex: 1; min-width: 0; text-overflow: ellipsis;/, 'a placeholder that is still too long ends in an ellipsis, never mid-letter');
});

test('the credit keeps clear of a toast (the first-run hint among them), and the layout watch sees toasts come and go', async () => {
  const { OBSTACLES } = await import('../src/ui/credit.js');
  const { PLACED } = await import('../src/ui/idle-keys.js');
  assert.match(OBSTACLES, /\.toast-wrap\.foot \.toast:not\(\.leaving\)/);
  assert.ok(PLACED.split(',').map((x) => x.trim()).includes('.toast-wrap.foot'));
});

test('Treat: the spleen is two named orders, and the tabs wear the pill on every screen', () => {
  const src = read('src/ui/chart.js');
  assert.doesNotMatch(src, /proc\('occlude', 'Spleen',/, 'one button called Spleen that cycled three states had its meaning only in a tooltip');
  assert.match(src, /'Splenic embolization', 'partial splenic artery embolization'/);
  assert.match(src, /'Splenectomy', 'spleen removed'/);
  assert.match(src, /p\.splenicRx = on \? 0 : v/, 'pressing the one in place takes it down; the other replaces it');
  assert.match(css, /\.treat-tabs \{ margin: 2px 12px 10px; gap: 2px; padding: 3px; border-radius: 10px; background: var\(--surface-2\); \}/);
  assert.match(css, /\.treat-tabs\.seg-glide::before \{ display: block; \}/, 'the desktop row hid the glide plate; the Treat row shows it');
});

test('History lists: a row is keyed by its entry, never its time, and every live list slides the rows under a new one', () => {
  const tl = read('src/ui/timeline.js');
  assert.match(tl, /'data-row': `e\$\{e\.id\}`/, 'a change snapshot lands after its row and moves e.t: a time in the key made one row go and another come, over each other');
  assert.match(tl, /'data-sig': `\$\{e\.kind\}\|\$\{e\.label\}\|\$\{e\.kind === 'start' \? '' : fmtClock\(e\.t, e\.day\)\}/);
  assert.match(tl, /function historyList\(\)/);
  assert.match(tl, /popover\(anchor, historyList\(\)/, 'the phone sheet is kept current too');
  assert.match(read('src/ui/main.js'), /menuPush\('Settings', 'History', timeline\.historyList\(\)\)/);
  const util = read('src/ui/util.js');
  assert.match(util, /const slide = fresh\.size \? D_SMALL : D_FLIP, hold = fresh\.size && was \? D_FLIP : 0;/);
  assert.match(util, /delay: Math\.max\(going\.length \? 80 : 0, hold\)/, 'a new row fades in only as the rows it pushes get out of its way');
});

test('popovers and sheets: one focus-in and one focus-back, and never two menus in the page', async () => {
  const util = read('src/ui/util.js');
  assert.match(util, /import \{ focusIn, focusBack \} from '\.\/focus-flow\.js'/);
  assert.match(util, /focusIn\(el, \{ keyboard: byKey \}\)/);
  assert.match(util, /focusBack\(el, openMenu\.anchor\)/);
  assert.match(util, /sheetLayer\(\)\.querySelectorAll\(':scope > \.menu\.leaving, :scope > \.um-scrim\.out'\)/, 'a menu still fading from a quick close is taken out as the next opens (C8b)');
  assert.match(read('src/ui/main.js'), /function giveFocusBack\(card, to\) \{[^}]*focusBack\(card, to\)/);
});

test('focus-flow: focus goes in by the way it was opened, and comes back to the opener, the figure, never the page', async () => {
  const made = [];
  const el = (id, over = {}) => { const e = { id, isConnected: true, hasAttribute: () => !!e.tabIndexSet, tabIndexSet: false, contains: (n) => n === e || (e.kids || []).includes(n), closest: () => null, querySelector: () => e.first || null, focus() { document.activeElement = e; }, ...over }; Object.defineProperty(e, 'tabIndex', { set() { e.tabIndexSet = true; }, get() { return e.tabIndexSet ? -1 : 0; } }); made.push(e); return e; };
  const body = el('body'), stage = el('stage');
  globalThis.document = { activeElement: body, body, documentElement: el('html'), getElementById: (i) => (i === 'stage' ? stage : null) };
  const { focusIn, focusBack } = await import('../src/ui/focus-flow.js');
  const first = el('first'), menu = el('menu', { first });
  focusIn(menu, { keyboard: true }); assert.equal(document.activeElement, first, 'the keyboard goes to the first control');
  document.activeElement = body; focusIn(menu, { keyboard: false }); assert.equal(document.activeElement, menu, 'a mouse or a finger goes to the menu itself');
  const opener = el('opener');
  menu.kids = [first]; document.activeElement = first;
  assert.equal(focusBack(menu, opener), true); assert.equal(document.activeElement, opener);
  document.activeElement = body; opener.isConnected = false;
  assert.equal(focusBack(menu, opener), true); assert.equal(document.activeElement, stage, 'no opener (a click on the figure opened the card): the figure, not the page');
  const other = el('other'); document.activeElement = other;
  assert.equal(focusBack(menu, opener), false); assert.equal(document.activeElement, other, 'focus the person moved elsewhere stays');
  delete globalThis.document;
});

test('the bottom bar: no control moves when a sibling\'s text changes', () => {
  assert.match(css, /\.tl-left \.tl-split \.tl-speed, \.vdock \.tl-left \.tl-split \.tl-speed, \.tl-left \.tl-split \.tl-speed\.lapse, \.vdock \.tl-left \.tl-split \.tl-speed\.lapse \{ width: 44px; min-width: 44px;/);
  assert.doesNotMatch(css, /\.tl-split \.tl-speed\.lapse \{ width: auto/, 'the chip was as wide as its words in a time-lapse');
  assert.match(css, /\.tl-pin > span \{ min-width: 8ch; text-align: center; \}/, 'Compare and Stop are one width');
});

test('a phone\'s controls take 44 px to touch without changing how they look', () => {
  assert.match(css, /\.nb-views #viewSeg button::after \{ content: ""; position: absolute; inset: -7px 0; \}/, '30 px pill + 7 + 7');
  const m = css.match(/html\.thumb-ui :is\(([^)]*)\)::after \{([^}]*)\}/);
  assert.ok(m, 'one rule');
  for (const c of ['.tl-split .ib.play', '.tl-ff', '.lens-btn', '.card-close', '.pal-x', '.sheet-head .ib', '.um-link']) assert.ok(m[1].includes(c), c);
  assert.match(m[2], /width: max\(100%, 44px\); height: max\(100%, 44px\)/);
  assert.match(css, /html\.thumb-ui #labels \.lb-pick \{ stroke: transparent; stroke-width: 24px;/);
});

test('toasts never stand over the deck: during a talk they come down from the top bars (B20)', () => {
  assert.match(css + read('styles/app-11-deck-visuals.css'), /html:has\(\.app\.presenting\) \.toast-wrap\.foot \{ top: max\(var\(--toast-top, 64px\), calc\(env\(safe-area-inset-top, 0px\) \+ 12px\)\); bottom: auto; \}/);
  assert.match(read('src/ui/main.js'), /--toast-top', toastTop/);
  assert.match(read('src/ui/util.js'), /kind !== 'bad' && !actions\?\.length && !present && document\.getElementById\('app'\)\?\.classList\.contains\('presenting'\)\) return NOOP_CLOSE/, 'only errors, cards with buttons and what the presenter asked for get through a talk');
});

test('a phone\'s table cell with a blood pressure breaks at its space instead of running into the next column', () => {
  assert.match(read('src/ui/presenter-question.js'), /k === 'map' \? 'num ref bp' : 'num ref'/);
  assert.match(read('src/ui/presenter-question.js'), /\(k === 'map' \? ' bp' : ''\)/);
  assert.match(read('styles/app-04-presenter.css'), /\.pz-table td\.num\.bp \{ white-space: normal; text-wrap: balance;/);
});
