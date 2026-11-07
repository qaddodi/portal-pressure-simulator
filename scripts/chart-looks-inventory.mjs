// Chart look inventory (chart-looks-in-code plan, WP0). Node only, no browser, no dependencies.
// Lists the rules in styles/app.css that look a chart's model pieces (fill, stroke, opacity, font, transition, ...), by chart,
// with line, at-rule context (@media / @container / @supports), selector and body. Each chart's migration PR deletes its rules,
// and scripts/chart-look-allowance.json holds the count that is left (rules-lint fails if it rises; --tighten lowers it).
//
//   node scripts/chart-looks-inventory.mjs                   per-chart count table
//   node scripts/chart-looks-inventory.mjs --count           one line per chart: name count (for scripts)
//   node scripts/chart-looks-inventory.mjs --chart talk      every rule of that chart (line, context, selector, body)
//   node scripts/chart-looks-inventory.mjs --chart talk --json
//   node scripts/chart-looks-inventory.mjs --file styles/x.css   scan another file (default styles/app.css)
//
// A rule counts when a selector in its list names a class with one of the chart's prefixes AND its body sets a look property.
// Rules for HTML elements that share a prefix (.ab-*, .pze-key, label leaders) are counted too: the migration PR names the ones it keeps.
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// chart → class prefixes its builder writes onto the model (plan §4). Order is the PR order.
export const CHARTS = {
  talk: ['ptk-', 'pz-plotbg', 'pz-talk'],
  'flow-time': ['pft-', 'pz-flowtime'],
  course: ['pco-'],
  curve: ['pcv-', 'pz-curve'],
  profile: ['ppf-'],
  flows: ['pfl-'],
  causes: ['pcs-'],
  criteria: ['pzc-', 'pzz-'],
  plane: ['pze-'],
  fluid: ['gf-', 'gs-'],
  lumen: ['gl-'],
  card: ['c-', 'pzq-', 'pzw-'],
  instruments: ['ab-', 'wall-', 'chart-'],
  small: ['tl-day-gl', 'lz-call-', 'leader', 'leader-dot', 'cl-'],
};
// `gl-words` is the glyph label engine, not the lumen chart.
const NOT_CLASS = new Set(['gl-words', 'gl-on', 'gl-plate']);   // (gl-on and gl-plate are the stage's GPU state classes)

// A declaration that sets how a piece looks. Layout (width, height, margin, display, position ...) is not a look.
const LOOK = /^(?:fill(?:-opacity)?|stroke(?:-[a-z]+)?|opacity|color|font(?:-[a-z-]+)?|letter-spacing|text-transform|text-anchor|dominant-baseline|paint-order|transition(?:-[a-z-]+)?|animation(?:-[a-z-]+)?|transform(?:-[a-z-]+)?|filter|mix-blend-mode|visibility|stop-color|stop-opacity|vector-effect|shape-rendering)$/;

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

// Walks CSS text into leaf rules: { line, ctx: ['@media ...'], selector, body }. At-rules with blocks of rules are entered; @font-face
// and @keyframes are skipped (not looks of a model piece).
export function parseRules(text) {
  const src = stripComments(text), out = [];
  const nl = []; for (let n = src.indexOf('\n'); n >= 0; n = src.indexOf('\n', n + 1)) nl.push(n);
  const lineAt = (pos) => { let lo = 0, hi = nl.length; while (lo < hi) { const m = (lo + hi) >> 1; if (nl[m] < pos) lo = m + 1; else hi = m; } return lo + 1; };
  const block = (from, end, ctx) => {
    let i = from;
    while (i < end) {
      let j = i;
      while (j < end && src[j] !== '{' && src[j] !== ';' && src[j] !== '}') j++;
      if (j >= end) return;
      if (src[j] !== '{') { i = j + 1; continue; }
      const head = src.slice(i, j), first = i + head.search(/\S|$/);
      let depth = 1, k = j + 1;
      while (k < end && depth) { const c = src[k]; if (c === '{') depth++; else if (c === '}') depth--; k++; }
      const bodyText = src.slice(j + 1, k - 1), sel = head.replace(/\s+/g, ' ').trim();
      if (sel.startsWith('@')) {
        if (!/^@(?:font-face|-?[a-z]*-?keyframes|property|page)/.test(sel) && /\{/.test(bodyText)) block(j + 1, k - 1, [...ctx, sel]);
      } else out.push({ line: lineAt(first), ctx, selector: sel, body: bodyText.replace(/\s+/g, ' ').trim() });
      i = k;
    }
  };
  block(0, src.length, []);
  return out;
}

const declsOf = (body) => body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const c = d.indexOf(':'); return c < 0 ? null : [d.slice(0, c).trim().toLowerCase(), d.slice(c + 1).trim()]; }).filter(Boolean);
const classesOf = (sel) => [...sel.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
const nameOf = (c, prefixes) => prefixes.some((p) => !NOT_CLASS.has(c) && (p.endsWith('-') ? c.startsWith(p) : c === p || c.startsWith(p + '-')));

// → { chart: [rule + {chart, props}] }. A rule belongs to the first chart (PR order) whose prefix a selector in its list names.
export function inventory(cssText) {
  const by = Object.fromEntries(Object.keys(CHARTS).map((k) => [k, []]));
  for (const r of parseRules(cssText)) {
    const props = declsOf(r.body).map(([p]) => p).filter((p) => LOOK.test(p) || (p.startsWith('--') && false));
    if (!props.length) continue;
    const parts = r.selector.split(/,(?![^(]*\))/).map((s) => s.trim());
    for (const [chart, prefixes] of Object.entries(CHARTS)) {
      const hit = parts.filter((s) => classesOf(s).some((c) => nameOf(c, prefixes)));
      if (hit.length) { by[chart].push({ ...r, chart, props, names: hit.length }); break; }
    }
  }
  return by;
}

export const countsOf = (inv) => Object.fromEntries(Object.entries(inv).map(([k, v]) => [k, v.length]));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), arg = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
  const file = arg('--file') || 'styles/app.css';
  const inv = inventory(readFileSync(resolve(ROOT, file), 'utf8'));
  const chart = arg('--chart');
  if (chart) {
    if (!inv[chart]) { console.error(`unknown chart '${chart}'. Charts: ${Object.keys(CHARTS).join(', ')}`); process.exit(2); }
    if (args.includes('--json')) console.log(JSON.stringify(inv[chart], null, 1));
    else for (const r of inv[chart]) console.log(`${file}:${r.line}${r.ctx.length ? '  ' + r.ctx.join(' > ') : ''}\n  ${r.selector}\n  { ${r.body} }`);
    console.error(`${inv[chart].length} rule(s) for ${chart}`);
  } else if (args.includes('--count')) for (const [k, v] of Object.entries(inv)) console.log(`${k} ${v.length}`);
  else {
    const total = Object.values(inv).reduce((n, v) => n + v.length, 0);
    for (const [k, v] of Object.entries(inv)) console.log(k.padEnd(12), String(v.length).padStart(4), '  ' + CHARTS[k].join(' '));
    console.log('total'.padEnd(12), String(total).padStart(4));
  }
}
