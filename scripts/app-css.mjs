// The app's stylesheet is styles/app-NN-name.css, cut from the one file it was (15 Nov 2026) at lines between rules, so the files joined in
// name order are that file and the cascade is the order they load in. index.html, the build and every script and test that judges the
// stylesheet's text take the list from here; tests/app-css-parts.test.js keeps index.html's links to it.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const appCssFiles = (root = ROOT) => readdirSync(join(root, 'styles')).filter((n) => /^app-\d\d-[\w-]+\.css$/.test(n)).sort().map((n) => `styles/${n}`);
export const appCssText = (root = ROOT) => appCssFiles(root).map((f) => readFileSync(join(root, f), 'utf8')).join('');
