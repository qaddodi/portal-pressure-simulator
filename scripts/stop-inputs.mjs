// What the gradient stops' colours are made from, as text: the stop rules of the page's styles and every custom property they reach
// (var() chains followed), each with the selector (and @media) it is declared under. src/ui/stop-tokens.js is generated from the page
// computed over exactly these, and holds this text's hash: tests/stop-tokens.test.js fails when a rule or token they read changes, until
// `npm run gen:stops` makes the table again.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** A style sheet's rules as { ctx, sel, decls: [[prop, value]] } (@media and @supports are kept as the context of the rules inside). */
export function cssRules(text) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const ctx = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const open = src.indexOf('{', i), close = src.indexOf('}', i);
    if (close !== -1 && (open === -1 || close < open)) { ctx.pop(); i = close + 1; continue; }
    if (open === -1) break;
    const head = src.slice(i, open).trim().replace(/\s+/g, ' ');
    if (head.startsWith('@media') || head.startsWith('@supports') || head.startsWith('@layer')) { ctx.push(head); i = open + 1; continue; }
    let depth = 1, j = open + 1;
    while (j < n && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
    if (head.startsWith('@')) { i = j; continue; }
    const body = src.slice(open + 1, j - 1);
    const decls = [];
    for (const d of body.split(';')) {
      const k = d.indexOf(':');
      if (k > 0) decls.push([d.slice(0, k).trim(), d.slice(k + 1).trim().replace(/\s+/g, ' ')]);
    }
    out.push({ ctx: ctx.join(' '), sel: head, decls });
    i = j;
  }
  return out;
}

const VARS = /var\(\s*(--[\w-]+)/g;
const varsOf = (v) => [...v.matchAll(VARS)].map((m) => m[1]);

/** The text the stops' colours come from: `sigs` are the stops' signatures (class|style|stop-color|stop-opacity). */
export function stopInputs(cssTexts, sigs) {
  const rules = cssTexts.flatMap(cssRules);
  const want = new Set();
  for (const s of sigs) for (const v of varsOf(s)) want.add(v);
  const isStop = (p) => p === 'stop-color' || p === 'stop-opacity';
  for (const r of rules) for (const [p, v] of r.decls) if (isStop(p)) for (const x of varsOf(v)) want.add(x);
  for (let grew = true; grew;) {
    grew = false;
    for (const r of rules) for (const [p, v] of r.decls) if (want.has(p)) for (const x of varsOf(v)) if (!want.has(x)) { want.add(x); grew = true; }
  }
  const lines = [];
  for (const r of rules) {
    const ds = r.decls.filter(([p]) => isStop(p) || want.has(p));
    if (ds.length) lines.push(`${r.ctx} ${r.sel} { ${ds.map(([p, v]) => `${p}: ${v}`).join('; ')} }`);
  }
  return lines.join('\n');
}

export const STYLE_FILES = ['styles/tokens.css', 'styles/app.css'];
export function stopHash(root, sigs) {
  const texts = STYLE_FILES.map((f) => readFileSync(new URL(f, root), 'utf8'));
  return createHash('sha1').update(stopInputs(texts, sigs)).digest('hex').slice(0, 12);
}
