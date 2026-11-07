// Settings > Appearance: five looks (Light, Soft, Dark, Navy, Black) and System. Navy and Black are palettes of the dark theme: the page keeps
// data-theme="dark" and adds data-palette, so every dark rule and every "is it dark" check holds for it, and styles/tokens.css moves
// its ground, surfaces, ink, lines, casing and organ lighting. A further palette is one more entry in LOOKS, one more token block and
// one more tile; these checks keep that contract for each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { TOKENS, CIRCUIT, tokensOfLook } from '../src/ui/theme-tokens.js';
import { LOOKS, knownLook, isDarkLook, currentLook, applyLookAttrs, lastDarkLook } from '../src/ui/looks.js';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => (statSync(join(ROOT, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const tokens = read('styles/tokens.css');
const html = read('index.html');

// A page root with the two attributes and nothing else.
const fakeRoot = () => {
  const a = new Map();
  return { a, setAttribute: (k, v) => a.set(k, String(v)), removeAttribute: (k) => a.delete(k), getAttribute: (k) => (a.has(k) ? a.get(k) : null) };
};

// (The values are read from src/ui/theme-tokens.js, the table styles/tokens.css is printed from. A palette's own entries are the table's
// object for it; the tiles are read from the printed stylesheet.)
const pre = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'from').map(([k, v]) => [`--${k}`, v]));
const PALETTES = LOOKS.filter((l) => l.palette);   // (Navy, and any palette added later: every one is held to the same checks below)
const BY_LOOK = Object.fromEntries(LOOKS.map((l) => [l.id, pre(tokensOfLook(l.id))]));
const { dark, navy } = BY_LOOK;
const tile = Object.fromEntries([...tokens.matchAll(/(--look-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

test('the looks start Light, Soft, Dark, Navy, Black, and every palette is a palette of the dark theme', () => {
  assert.deepEqual(LOOKS.map((l) => l.id), ['light', 'soft', 'dark', 'navy', 'black']);
  assert.deepEqual(LOOKS.map((l) => l.theme), ['light', 'soft', 'dark', 'dark', 'dark']);
  for (const l of PALETTES) { assert.equal(l.theme, 'dark', `${l.id} is a dark palette`); assert.equal(l.palette, l.id); assert.ok(isDarkLook(l.id)); }
  assert.deepEqual(LOOKS.map((l) => isDarkLook(l.id)), [false, false, true, true, true]);
  assert.equal(new Set(LOOKS.map((l) => l.id)).size, LOOKS.length, 'no look twice');
});

test('a saved look is known only when it is one of them (System, nothing or a stray value is none)', () => {
  for (const l of LOOKS) assert.equal(knownLook(l.id), l.id);
  for (const v of [null, undefined, '', 'system', 'nope', 'constructor', '__proto__', 'Navy']) assert.equal(knownLook(v), null, String(v));
});

test('a look sets data-theme and data-palette together, and System sets neither', () => {
  const root = fakeRoot();
  const seen = {};
  for (const l of LOOKS) {
    applyLookAttrs(root, l.id);
    seen[l.id] = [root.getAttribute('data-theme'), root.getAttribute('data-palette')];
    assert.equal(currentLook(root), l.id);
  }
  assert.deepEqual(seen, Object.fromEntries(LOOKS.map((l) => [l.id, [l.theme, l.palette ?? null]])));
  applyLookAttrs(root, 'navy'); applyLookAttrs(root, 'light');
  assert.equal(root.getAttribute('data-palette'), null, 'a palette does not outlive its look');
  applyLookAttrs(root, null);
  assert.deepEqual([root.getAttribute('data-theme'), root.getAttribute('data-palette'), currentLook(root)], [null, null, null]);
});

test('the quick light / dark switch goes back to the dark look last worn', () => {
  const root = fakeRoot();
  applyLookAttrs(root, 'navy'); applyLookAttrs(root, 'light');
  assert.equal(lastDarkLook(), 'navy');
  applyLookAttrs(root, 'dark');
  assert.equal(lastDarkLook(), 'dark');
});

test('a palette moves only tokens Dark has, and keeps Dark\'s accent and status colours', () => {
  const darkOnly = pre(TOKENS.dark);
  for (const l of PALETTES) {
    const own = pre(TOKENS[l.palette]);
    assert.equal(TOKENS[l.palette].from, 'dark', `${l.id} starts from Dark`);
    const strange = Object.keys(own).filter((k) => !(k in darkOnly) && k !== '--on-status');
    assert.deepEqual(strange, [], `${l.id} overrides only tokens that Dark defines`);
    for (const k of ['--accent', '--accent-ink', '--ok', '--caution', '--danger', '--critical', '--flow-normal', '--flow-reversed', '--doppler', '--artery', '--ascites']) assert.ok(!(k in own), `${l.id} keeps Dark's ${k}`);
    assert.ok(CIRCUIT[l.palette], `${l.id} has its circuit map's ground`);
  }
});

test('Navy is the navy Dark was until 31 Oct: its ground, surfaces and ink', () => {
  assert.deepEqual([navy['--bg'], navy['--surface'], navy['--surface-2'], navy['--surface-3'], navy['--text'], navy['--text-2'], navy['--text-3'], navy['--border']],
    ['#0E1422', '#161E30', '#1B2438', '#232D44', '#E9EDF6', '#A9B2C7', '#8F99B3', '#222C46']);
  assert.equal(navy['--organ-lung'], '#5A6E90');
});

test('each Appearance tile draws its look with that look\'s own ground, card, ink and accent', () => {
  for (const [id, t] of Object.entries(BY_LOOK)) {
    assert.deepEqual([tile[`--look-${id}-bg`], tile[`--look-${id}-card`], tile[`--look-${id}-ink`], tile[`--look-${id}-accent`]], [t['--bg'], t['--surface'], t['--text'], t['--accent']], id);
  }
});

test('a saved palette paints its ground before the styles load, and every other value is as it was', () => {
  const code = html.slice(html.indexOf("<script>document.documentElement.setAttribute('data-boot','hold');") + '<script>'.length);
  const src = code.slice(0, code.indexOf('</script>'));
  const boot = (t, systemDark = false) => {
    const attrs = new Map(), style = {};
    const el = { setAttribute: (k, v) => attrs.set(k, v), style };
    const store = new Map(t == null ? [] : [['pps.theme', t]]);
    const localStorage = { get length() { return store.size; }, key: (i) => [...store.keys()][i] ?? null, getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
    vm.runInNewContext(src, { localStorage, document: { documentElement: el }, matchMedia: () => ({ matches: systemDark }) });
    return { theme: attrs.get('data-theme') ?? null, palette: attrs.get('data-palette') ?? null, bg: style.background ?? null };
  };
  for (const l of PALETTES) {
    assert.deepEqual(boot(l.id), { theme: 'dark', palette: l.palette, bg: BY_LOOK[l.id]['--bg'] }, l.id);
    assert.deepEqual(boot(l.id, false), boot(l.id, true), `${l.id}: the device's own setting does not matter once a look is chosen`);
  }
  assert.deepEqual(boot('dark'), { theme: 'dark', palette: null, bg: dark['--bg'] });
  assert.deepEqual(boot('light', true), { theme: 'light', palette: null, bg: null });
  assert.deepEqual(boot('soft', true), { theme: 'soft', palette: null, bg: null });
  assert.deepEqual(boot(null, true), { theme: null, palette: null, bg: dark['--bg'] }, 'System on a dark device: Dark\'s ground');
  assert.deepEqual(boot(null, false), { theme: null, palette: null, bg: null });
  for (const stray of ['constructor', 'forest', 'Navy', 'Black']) assert.deepEqual(boot(stray), { theme: null, palette: null, bg: null }, `a stray saved value (${stray}) is ignored`);
});

test('everything that watches or keys on the theme sees the palette too', () => {
  const missing = [];
  for (const f of walk('src').filter((x) => x.endsWith('.js') && !x.endsWith('looks.js'))) {
    read(f).split('\n').forEach((line, i) => {
      const at = `${f}:${i + 1}`;
      if (/attributeFilter:[^\]]*'data-theme'/.test(line) && !/'data-palette'/.test(line)) missing.push(`${at}: an observer of data-theme must watch data-palette`);
      if (/getAttribute\('data-theme'\)/.test(line) && !/data-palette|currentLook/.test(line) && !/main\.js/.test(f)) missing.push(`${at}: reads data-theme without data-palette`);
      // (sinusoid-view.js only asks "is it dark"; it redraws on any attribute change of the page and reads its colours each frame.)
      if (/dataset\.theme/.test(line) && !/themeKey|d\.theme|dataset\.palette/.test(line) && !f.endsWith('sinusoid-view.js')) missing.push(`${at}: a cache key from dataset.theme alone`);
    });
  }
  assert.deepEqual(missing, []);
});

test('Settings shows the looks through the chooser, and the chooser carries all of them and System', () => {
  const main = read('src/ui/main.js'), chooser = read('src/ui/look-chooser.js'), css = read('styles/app.css');
  assert.match(main, /lookChooser\(cur, /);
  assert.match(chooser, /for \(const l of LOOKS\) grid\.append\(tile\(/);
  assert.match(chooser, /tile\('system', 'System'/);
  for (const l of LOOKS) assert.match(css, new RegExp(`\\.look-half\\[data-look="${l.id}"\\]`), `${l.id} tile colours`);
  assert.match(css, /\.look-name \{[^}]*font-size: var\(--fs-12\)/, 'the names keep the 12 px floor');
});
