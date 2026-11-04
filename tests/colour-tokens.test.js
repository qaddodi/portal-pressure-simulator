// The colour system: every colour lives once, as a named token: the look-dependent ones in src/ui/theme-tokens.js (styles/tokens.css is
// printed from it), the rest in styles/tokens.css. These checks keep it that way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOKENS } from '../src/ui/theme-tokens.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => (statSync(join(ROOT, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const tokens = read('styles/tokens.css');
const LITERAL = /#[0-9a-f]{3,8}\b|rgba?\(\s*[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+|hsla?\(/i;

test('no colour is written outside styles/tokens.css and src/ui/theme-tokens.js', () => {
  // (theme-tokens.js is where the look-dependent colours are written; tokens.css carries its printed copy.)
  const files = [...walk('src').filter((f) => f.endsWith('.js') && !f.endsWith('src/ui/theme-tokens.js')), 'styles/app.css'];
  const stray = [];
  for (const f of files) {
    read(f).split('\n').forEach((line, i) => {
      // Exempt: masks (white shows, black hides), canvas resets and erasers, marked "colour-exempt".
      if (LITERAL.test(line) && !/colour-exempt|mask|Fade/.test(line)) stray.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(stray, [], 'use a token from styles/tokens.css instead');
});

test('the two dark-theme blocks in tokens.css stay identical', () => {
  const media = tokens.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\):not\(\[data-theme="soft"\]\) \{([^}]*)\}/)[1];
  const attr = tokens.match(/\n:root\[data-theme="dark"\] \{([^}]*)\}/)[1];
  const norm = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
  assert.equal(norm(media), norm(attr), 'change a dark colour in both blocks');
});

test('every token the scripts read is defined', () => {
  const defined = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const missing = new Set();
  for (const f of walk('src').filter((x) => x.endsWith('.js'))) {
    for (const m of read(f).matchAll(/\b(?:cssVar|cssRGB01|cssRGB|cssAlpha|cssRamp|tk|G01|G|v|cv|t|g)\('(--[\w-]+)'[,)]/g)) if (!defined.has(m[1])) missing.add(`${m[1]} (${f})`);
  }
  assert.deepEqual([...missing], []);
});

test('the page colours painted before the styles load match the tokens', () => {
  const html = read('index.html');
  const light = TOKENS.light.bg, dark = TOKENS.dark.bg;
  assert.match(light, /^#[0-9A-F]{6}$/i);
  assert.match(dark, /^#[0-9A-F]{6}$/i);
  assert.match(tokens, new RegExp(`:root \\{[^}]*?--bg: ${light};`, 'i'), 'the printed stylesheet carries Light\'s ground');
  assert.match(html, new RegExp(`theme-color" content="${light}" media="\\(prefers-color-scheme: light\\)`, 'i'));
  assert.match(html, new RegExp(`theme-color" content="${dark}" media="\\(prefers-color-scheme: dark\\)`, 'i'));
  assert.match(html, new RegExp(`style\\.background=pb\\|\\|'${dark}'`, 'i'));   // (Dark's; each palette's is tested in tests/appearance.test.js)
});
