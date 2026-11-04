// Old → new look table for one chart's migration PR (chart-looks-in-code plan §7 step 4). SKELETON (WP0): prints the OLD side only.
// A review aid, never shipped. Later packages fill in the two marked parts:
//   TODO(WP1/WP2) old value per look: substitute var() from tokens.css for each look and evaluate color-mix with css-color.js.
//   TODO(WP2)     new value per look: import chart-looks/index.js and run the resolver in node with the same ctx; mark a differing cell ≠.
//
//   node scripts/look-diff.mjs --chart talk          markdown table, one row per rule
//   node scripts/look-diff.mjs --chart talk --json
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory, CHARTS } from './chart-looks-inventory.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Specificity (a,b,c) of one selector: ids, classes/attributes/pseudo-classes, types/pseudo-elements. :is/:not/:has take their most specific
// argument; :where counts 0.
export function specificity(sel) {
  let a = 0, b = 0, c = 0;
  const add = (v) => { a += v[0]; b += v[1]; c += v[2]; };
  let s = sel.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '');
  s = s.replace(/:(?:is|not|has|matches)\(((?:[^()]|\([^()]*\))*)\)/g, (_, inner) => {
    const best = inner.split(',').map((p) => specificity(p.trim())).sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]).pop() || [0, 0, 0];
    add(best); return ' ';
  });
  s = s.replace(/\[[^\]]*\]/g, () => { b++; return ' '; });
  s = s.replace(/::[\w-]+/g, () => { c++; return ' '; });
  s = s.replace(/:[\w-]+(?:\([^)]*\))?/g, () => { b++; return ' '; });
  s = s.replace(/#[\w-]+/g, () => { a++; return ' '; });
  s = s.replace(/\.[\w-]+/g, () => { b++; return ' '; });
  s = s.replace(/(^|[\s>+~])([a-zA-Z][\w-]*)/g, () => { c++; return ' '; });
  return [a, b, c];
}
const spec = (selector) => selector.split(/,(?![^(]*\))/).map((p) => specificity(p.trim())).sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]).pop();

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), i = args.indexOf('--chart'), chart = i < 0 ? null : args[i + 1];
  if (!chart || !CHARTS[chart]) { console.error(`usage: look-diff.mjs --chart <${Object.keys(CHARTS).join('|')}> [--json]`); process.exit(2); }
  const rows = inventory(readFileSync(resolve(ROOT, 'styles/app.css'), 'utf8'))[chart].map((r) => ({ line: r.line, ctx: r.ctx.join(' > '), selector: r.selector, specificity: spec(r.selector), old: r.body, new: null }));
  if (args.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else {
    console.log('| app.css | selector (specificity) | context | old | new key / row | new | |\n|---|---|---|---|---|---|---|');
    for (const r of rows) console.log(`| ${r.line} | \`${r.selector.replace(/\|/g, '\\|')}\` (${r.specificity.join(',')}) | ${r.ctx || ''} | ${r.old.replace(/\|/g, '\\|')} | (WP2) | (WP2) | |`);
  }
}
