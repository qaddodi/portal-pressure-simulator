// Every class styles/app.css styles is one the app can put on an element: its name appears in the source (index.html,
// src/, scripts/). Classes the code builds from a prefix ('organ-' + id, `sv-region-${key}`, 'lz-zone z' + n …) are
// allowed by that prefix. A rule left behind by a removed feature fails here, so it is deleted with the feature.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = (d) => readdirSync(join(root, d)).flatMap((f) => { const p = join(d, f); return statSync(join(root, p)).isDirectory() ? walk(p) : [p]; });
const source = ['index.html', ...walk('src').filter((f) => f.endsWith('.js')), ...walk('scripts').filter((f) => /\.m?js$/.test(f))]
  .map((f) => readFileSync(join(root, f), 'utf8')).join('\n');

// Built from a prefix in the code: stage.js (organ-, tone-, od-), sinusoid-view.js (sv-region-, sv-lead-), lobule-zoom.js
// (z1–z3), main.js (tool-), stage.js labels (k-), presenter.js (pzs-).
const BUILT = [/^organ-/, /^tone-/, /^od-/, /^sv-region-/, /^sv-lead-/, /^z\d$/, /^tool-/, /^k-/];
// Named by the browser checks and kept with them (none now: .hv-main, .pz-deck and .pzb-go went with nothing left using them).
const KEPT = new Set([]);

test('every class app.css styles is used by the app', () => {
  const css = readFileSync(join(root, 'styles/app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // Selectors only: drop the declaration blocks (the innermost braces), so values such as 1.5em or url(x.svg) are not read
  // as classes; the rules inside @media and @container keep their selectors.
  const sel = css.replace(/\{[^{}]*\}/g, ';');
  const classes = new Set([...sel.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map((m) => m[1]));
  const unused = [...classes].filter((c) => !BUILT.some((r) => r.test(c)) && !KEPT.has(c)
    && !new RegExp(`(?<![\\w-])${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(source)).sort();
  assert.deepEqual(unused, [], `app.css styles classes nothing in the app uses: ${unused.join(', ')}`);
});
