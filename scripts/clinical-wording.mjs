// Clinical wording lint (Mohammad, 13 Nov 2026: "X less Y is a stupid way of putting this minus that"; docs/ai-humanizer.md section 6).
// Learner text is written for US physicians: subtraction is "minus" (or − in an equation), never "less"; no lay words a clinician
// would correct (belly, kidney pressure, a tap for paracentesis, water pill, "takes back"); American spelling; no em-dash.
//
// check(text) returns the rules a string breaks. The CLI walks every string and template literal in src/ (comments are not
// tokens, so they are never judged) plus index.html's text, and fails `npm run lint` on any hit.
//   node scripts/clinical-wording.mjs          check
//   node scripts/clinical-wording.mjs --list   print every hit with its file and line, and exit 0
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Each rule: a name, a pattern on the learner text, what to write instead and, for a word with a second meaning, the context it is judged in.
export const RULES = [
  // "MAP less the IAP", "the WHVP less the FHVP", "the pressure inside less the air's", "18 less 10". A comparative "less" is followed by
  // a noun with no article ("less portal blood", "less ascites") or by than/likely/often, and never by the/its/his/her/their/a number.
  ['less-as-minus', /\bless\s+(?:(?:the|its|his|her|their|that|this|what)\b|[0-9])/i, 'write "minus" (or − in an equation)'],
  ['less-as-minus', /\b(?:MAP|WHVP|FHVP|IVC|RAP|IAP|HVPG|PPG|pressure|pressures|reading|readings|mmHg)\s+less\b(?!\s+(?:than|likely|often|so|well|room|time|common|reliable|blood|flow|portal|of|and|or|in|to|on|at))/i, 'write "minus"'],
  ['belly', /\bbell(?:y|ies)\b/i, 'abdomen, peritoneal cavity, intra-abdominal pressure (IAP)'],
  ['takes-back', /\b(?:takes?|took|taken|taking)\s+back\b/i, 'peritoneal reabsorption (mL/day)'],
  ['kidney-pressure', /\bkidney (?:pressure|P)\b/i, 'renal perfusion pressure (RPP)'],
  ['tap', /\b(?:a|the|one|each|every|another|first|second|after|before|big|large|repeat(?:ed)?)\s+taps?\b|\btapp(?:ed|ing)\b|\btaps\b/i, 'paracentesis, large-volume paracentesis (LVP)', /ascit|paracent|albumin|abdom|\bliters?\b|\bL\b|drain|SBP|diuretic|fluid/i],
  ['water-pill', /\bwater (?:pills?|tablets?)\b/i, 'diuretic'],
  ['tummy', /\btumm(?:y|ies)\b/i, 'abdomen'],
  ['gut', /\b(?:gut|bowel)(?:[’']s)?\s+(?:arter\w*|arteriol\w*|veins?|blood|inflow)\b|\bthe gut[’']s\b/i, 'splanchnic arteries, mesenteric veins, splanchnic inflow'],
  ['scarring', /\bscarr(?:ing|ed)\b/i, 'fibrosis, fibrotic'],
  ['clotted', /\bclotted\b/i, 'thrombosed'],
  ['lymph-made', /\blymph (?:made|it makes)\b/i, 'lymph formation'],
  ['lay-anatomy', /\b(?:tricuspid|valve) leak\b|\bvein of the (?:left|right) kidney\b|\bwater in the (?:chest|lungs)\b|\bfluid in the (?:belly|lungs)\b/i, 'tricuspid regurgitation, left renal vein, hydrothorax, pulmonary edema'],
  ['british-idiom', /\bin brackets\b|\bcommonest\b|\bbooked for\b|\bcarr(?:y|ies) on\b|\bwhilst\b|\bper cent\b|\bat weekends\b|\bstraight away\b/i, 'American idiom (in parentheses, most common, scheduled for, continue)'],
  ['word-by-pill', /\b(?:above|below|under|over|more than|less than|at least)\s+(?:the\s+)?\{[<>≥≤]/i, 'no comparison word beside a cut-off pill (authoring guide rule 6)'],
  ['lay-measure', /\bpressure across (?:its|the) (?:varix )?wall\b|\b(?:esophageal )?air pressure\b|\bthe air (?:presses|pushes|in the esophagus)\b|\bvomit(?:s|ed|ing)? blood\b|\bsalt limit\b|\bsober\b|\bthe free reading\b|\bswollen legs\b|\btakes? away\b|\bportosystemic vascular disorder\b/i, 'transmural pressure, insufflation pressure, hematemesis, sodium restriction, abstinent'],
  ['possessive', /\b(?:the )?(?:liver|spleen|abdomen|gut|kidney)[’']s (?:flow|blood|portal|own blood|pressure|size)\b/i, 'hepatic blood flow, splenic venous outflow, intra-abdominal pressure, spleen size'],
  ['the-scope', /\b(?:the|a|at|before|after|no) scope\b/i, 'endoscopy, the endoscope, EGD'],
  ['the-room', /\b(?:the|this) room\b/i, 'write to the learner'],
  ['british', /\b(?:colour\w*|grey(?:er|ish|s)?|haemorrhag\w*|oesophag\w*|oedema\w*|anaemi\w*|haemat\w*|haemo\w*|whilst|per cent|centre(?:d|s)?|litre(?:s)?|millilitre\w*|behaviour\w*|favour\w*|tumour\w*|fibre\w*|labour\w*|ischaemi\w*|paediatric\w*|foetal|foetus|oestrogen\w*|leukaemi\w*|diarrhoea|organis(?:e|ed|es|ing|ation)|recognis(?:e|ed|es|ing)|minimis(?:e|ed|es|ing)|stabilis(?:e|ed|es|ing)|haemodynamic\w*|modell(?:ed|ing)|tunnell\w*|recanalis\w*|embolis(?:e|ed|es|ing|ation)\b|afterwards|favour\w*|aetiolog\w*|pre-emptive|non-selective|catheteris\w*|anaesthe\w*)\b/i, 'American spelling'],
  ['em-dash', /[A-Za-z0-9,.)]\s*—\s*[A-Za-z0-9(]/, 'a full stop or a comma (no em-dash in learner text)'],
];

/** The rules `text` breaks, as [{ rule, match, fix }]. */
export function check(text) {
  const out = [];
  for (const [rule, re, fix, when] of RULES) {
    if (when && !when.test(text)) continue;   // (a tap on a screen is not a paracentesis)
    const m = String(text).match(re);
    if (m) out.push({ rule, match: m[0], fix });
  }
  return out;
}

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
const DEV = /(?:perf-readout|stage-vessels|css-color|colormap|chart-looks\/resolve)\.js$/;
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
