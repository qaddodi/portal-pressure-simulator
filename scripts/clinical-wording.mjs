// Clinical wording lint (Mohammad, 13 Nov 2026: "X less Y is a stupid way of putting this minus that"; docs/ai-humanizer.md section 6).
// Learner text is written for US physicians: subtraction is "minus" (or − in an equation), never "less"; no lay words a clinician
// would correct (belly, kidney pressure, renal perfusion pressure for MAP − IAP, a tap for paracentesis, water pill, "takes back"); American spelling; no em-dash.
//
// check(text) returns the rules a string breaks. The CLI walks every string and template literal in src/ (comments are not
// tokens, so they are never judged) plus index.html's text, and fails `npm run lint` on any hit.
//   node scripts/clinical-wording.mjs          check
//   node scripts/clinical-wording.mjs --list   print every hit with its file and line, and exit 0
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The rules and `check(text)` (the rules a string breaks) are src/ui/wording.js's: one list for this lint, the Words dump, the tests and the registry's wording rules.
import { RULES, check } from '../src/ui/wording.js';
export { RULES, check };

/** Every string inside a value (a deck, a slide, an array of rows), with its path. */
export function* strings(v, path = '') {
  if (typeof v === 'string') yield [path, v];
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* strings(v[i], `${path}[${i}]`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) yield* strings(x, path ? `${path}.${k}` : k);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Shader sources, generated art and glyph tables hold no learner text.
const SKIP = /(?:-glsl|organ-art|glyph-data|stop-tokens|lobule-live|blood-heads)\b[^/]*\.js$/;
// Developer-only text (the ?perf readout, GPU probe names, colour parsing errors and the CSS colour table) is not learner text.
const DEV = /(?:perf-readout|stage-vessels|css-color|colormap|chart-looks\/resolve)\.js$|\/ui\/(?:gallery|selfcheck|screen)\//;   // (the debug tools' own findings, rule messages and bench labels: preview-only developer text, never a card or a slide)
// Words: two or more, with a space between (a class list or an id can hold none of the phrases the rules look for).
// (A shader or a style sheet in a template literal: its pieces between ${…} are code on several lines.)
const isCode = (s) => /\b(?:[iu]?vec[234]|uniform|precision|gl_\w+|void main|sampler2D|texelFetch|#version)\b/.test(s) || (/\n/.test(s) && /[;{}]|\/\//.test(s));
const isWords = (s) => !isCode(s) && /\s/.test(s) && (s.match(/[A-Za-z]{2,}/g) || []).length >= 2;

async function main() {
  const { tokenize } = await import('espree');
  const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : [p]);
  const files = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.js') && !SKIP.test(f) && !DEV.test(f.split('\\').join('/')));
  const hits = [];
  for (const f of files) {
    const rel = relative(ROOT, f).split('\\').join('/');
    let toks, src;
    try { src = readFileSync(f, 'utf8').split('\n'); toks = tokenize(src.join('\n'), { ecmaVersion: 'latest', sourceType: 'module', loc: true }); } catch { continue; }
    for (const t of toks) {
      if (t.type !== 'String' && t.type !== 'Template') continue;
      const v = t.type === 'String' ? t.value.slice(1, -1) : t.value.replace(/^[`}]/, '').replace(/(?:\$\{|`)$/, '');
      if (/\bgpuProbe\.|\bperfLog\(/.test(src[t.loc.start.line - 1])) continue;   // (the ?perf probe's own readout, a developer view)
      if (!isWords(v) || /\bcolor colour\b/.test(v) || /\w\|\w/.test(v)) continue;   // (a search entry's spelling aliases; a term pill's alternatives)
      for (const h of check(v)) hits.push(`${rel}:${t.loc.start.line}  ${h.rule}: "${h.match}" → ${h.fix}`);
    }
  }
  // index.html: the text between tags and the words in title/aria-label/placeholder/alt attributes.
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  html.split('\n').forEach((line, i) => {
    const bits = [...line.matchAll(/>([^<>]+)</g)].map((m) => m[1]).concat([...line.matchAll(/\b(?:title|aria-label|placeholder|alt|content)="([^"]+)"/g)].map((m) => m[1]));
    for (const b of bits) for (const h of check(b)) hits.push(`index.html:${i + 1}  ${h.rule}: "${h.match}" → ${h.fix}`);
  });
  if (process.argv.includes('--list') || hits.length) console.log(hits.join('\n'));
  console.log(`clinical wording: ${hits.length} hit${hits.length === 1 ? '' : 's'} (docs/ai-humanizer.md section 6)`);
  if (hits.length && !process.argv.includes('--list')) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
