// The text of sources that live in several files, for the tests that judge source text. A move out of a big file into a part leaves
// these tests meaningful: they read the family, never one file of it. (The stage's is tests/stage-src.js.)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { appCssText } from '../scripts/app-css.mjs';
import { familyFiles } from '../scripts/stage-split/hosts.mjs';

const UI = fileURLToPath(new URL('../src/ui/', import.meta.url));
// (A forwarding stub the move tool leaves in its host, `function f(...a) { return f$(...a); }   // <stage-split stub>`, is left out: the real function is the one in its part.)
const STUB = /^[ \t]*function\*? \w+\(\.\.\.a\) \{ return (?:yield\* )?\w+\$\(\.\.\.a\); \}[ \t]*\/\/ <stage-split stub>\n?/gm;
const family = (host) => familyFiles(host).map((f) => readFileSync(join(UI, f), 'utf8').replace(STUB, '')).join('\n');


/** The app's stylesheet: styles/app-NN-*.css joined in order (it was one file, styles/app.css, until 15 Nov 2026). */
export const appCss = () => appCssText();

/** The presenter: src/ui/presenter.js and the modules and parts moved out of it (scripts/stage-split/hosts.mjs lists them). */
export const presenterSource = () => family('presenter');
/** The lobule view: src/ui/lobule-zoom.js and the parts moved out of it. */
export const lobuleSource = () => family('lobule');
