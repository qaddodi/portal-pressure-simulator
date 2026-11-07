// Prints the theme blocks of styles/tokens.css from src/ui/theme-tokens.js (the source), between the BEGIN and END markers.
//   node scripts/gen-theme-css.mjs           rewrite the region
//   node scripts/gen-theme-css.mjs --check   fail when styles/tokens.css differs from what the table prints (npm run lint)
// The output is a static stylesheet: nothing is written onto :root at run time, so the first paint already has its colours.
// Selectors and their order are the ones tokens.css has always had: Light on :root, the system dark theme, Dark, Soft, the Circuit map's
// blocks, then the palettes (one more step of specificity, so they win over Dark's attribute and media blocks), then the Appearance tiles.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, 'styles/tokens.css');
const { TOKENS, CIRCUIT, LOOK_IDS, tokensOfLook } = await import(pathToFileURL(resolve(ROOT, 'src/ui/theme-tokens.js')).href);

export const BEGIN = '/* BEGIN generated: theme-tokens.js (do not edit between the markers: edit src/ui/theme-tokens.js, then npm run gen:theme) */';
export const END = '/* END generated: theme-tokens.js */';

const SYS = ':root:not([data-theme="light"]):not([data-theme="soft"])';
const decl = (name, value) => `${name === 'color-scheme' ? name : `--${name}`}: ${value};`;
const own = (t) => Object.entries(t).filter(([k]) => k !== 'from');
const rule = (sel, t, pad = '') => `${pad}${sel} {\n${own(t).map(([k, v]) => `${pad}  ${decl(k, v)}`).join('\n')}\n${pad}}`;
const media = (sel, t) => `@media (prefers-color-scheme: dark) {\n${rule(sel, t, '  ')}\n}`;

export function printed() {
  const out = [];
  out.push(rule(':root', TOKENS.light));
  out.push(media(SYS, TOKENS.dark));
  out.push(rule(':root[data-theme="dark"]', TOKENS.dark));
  out.push(`/* Soft light: warm, low-glare paper with frosted cards and softer ink. */\n${rule(':root[data-theme="soft"]', TOKENS.soft)}`);
  out.push(`/* Circuit view: follows the page theme (the map's own ground in the dark looks). */\n${rule('.stage-wrap.cmap', CIRCUIT.light)}`);
  out.push(rule(':root[data-theme="dark"] .stage-wrap.cmap', CIRCUIT.dark));
  out.push(media(`${SYS} .stage-wrap.cmap`, CIRCUIT.dark));
  out.push(`/* Two more dark looks: palettes of Dark (data-theme="dark" plus data-palette). They come last, one step more specific than Dark's blocks. */\n${rule(':root[data-theme="dark"][data-palette="navy"]', TOKENS.navy)}`);
  out.push(rule(':root[data-theme="dark"][data-palette="navy"] .stage-wrap.cmap', CIRCUIT.navy));
  out.push(rule(':root[data-theme="dark"][data-palette="black"]', TOKENS.black));
  out.push(rule(':root[data-theme="dark"][data-palette="black"] .stage-wrap.cmap', CIRCUIT.black));
  // The Appearance chooser's tiles: each look's ground, card, ink and accent, so a tile can show a look the page is not wearing.
  const tiles = LOOK_IDS.map((id) => { const t = tokensOfLook(id); return `  ${[['bg', 'bg'], ['card', 'surface'], ['ink', 'text'], ['accent', 'accent']].map(([a, b]) => `--look-${id}-${a}: ${t[b]};`).join(' ')}`; });
  out.push(`/* The Appearance chooser's tiles (src/ui/look-chooser.js, .look-tile). */\n:root {\n${tiles.join('\n')}\n}`);
  return `${BEGIN}\n${out.join('\n')}\n${END}`;
}

export function rewrite(css) {
  const a = css.indexOf(BEGIN), b = css.indexOf(END);
  if (a < 0 || b < a) throw new Error('styles/tokens.css has no BEGIN/END generated markers');
  return css.slice(0, a) + printed() + css.slice(b + END.length);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cur = readFileSync(FILE, 'utf8'), next = rewrite(cur);
  if (process.argv.includes('--check')) {
    if (cur !== next) { console.error('styles/tokens.css is out of date with src/ui/theme-tokens.js: run `npm run gen:theme`'); process.exit(1); }
    console.log('theme tokens: styles/tokens.css matches src/ui/theme-tokens.js');
  } else { writeFileSync(FILE, next); console.log(`theme tokens: wrote ${next.split('\n').length} lines to styles/tokens.css`); }
}
