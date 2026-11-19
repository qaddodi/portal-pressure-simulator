// Regenerates the tables of docs/debug.md (the unified debug doc) from the code: the rules of the registry, the owner's standing numbers (selfcheck/limits.js) and the address flags (flags.js).
// `node scripts/debug-doc.mjs` rewrites them; `--check` fails when the committed file is not what the code says (tests/debug-doc.test.js runs it), so the doc cannot drift from the rules.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, 'docs/debug.md');

/** The groups the owner thinks in, and the registry families each is made of. */
export const GROUPS = [
  ['Cards fit the screen and its edges', ['fit', 'edge']],
  ['Nothing pops, flashes or sticks', ['flash', 'stuck', 'card', 'glass']],
  ['Labels stay clear and fade in place', ['label']],
  ['The camera goes straight', ['camera']],
  ['Numbers, charts and pressure colours agree', ['number', 'chart', 'pressure', 'figure']],
  ['Words follow US and Baveno VIII usage', ['wording']],
];

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

export async function tables() {
  await import('../src/ui/selfcheck/plugins.js');
  const { ruleList } = await import('../src/ui/selfcheck/rules.js');
  const { LIMITS } = await import('../src/ui/selfcheck/limits.js');
  const { knownFlags } = await import('../src/ui/flags.js');
  const rules = ruleList(), used = new Set();
  const out = [];
  for (const [title, fams] of GROUPS) {
    const list = rules.filter((r) => fams.includes(r.family));
    list.forEach((r) => used.add(r.id));
    if (!list.length) continue;
    out.push(`**${title}** (${list.length})`, '', '| Rule | Looks at | Why | Owner file |', '|---|---|---|---|', ...list.map((r) => `| \`${r.id}\` | ${r.kind === 'series' ? 'the last seconds of motion' : 'the screen now'} | ${cell(r.why)} | \`${r.owner}\` |`), '');
  }
  const rest = rules.filter((r) => !used.has(r.id));
  if (rest.length) out.push('**Other**', '', '| Rule | Looks at | Why | Owner file |', '|---|---|---|---|', ...rest.map((r) => `| \`${r.id}\` | ${r.kind === 'series' ? 'the last seconds of motion' : 'the screen now'} | ${cell(r.why)} | \`${r.owner}\` |`), '');
  const limits = ['| Standing number | Value | Since | What it holds | Exceptions |', '|---|---|---|---|---|', ...LIMITS.map((l) => `| \`${l.id}\` | ${l.value} ${l.unit} | ${l.since} | ${cell(l.rule)} | ${cell(l.exceptions)} |`)];
  const gate = { live: 'everywhere', preview: 'preview only', local: 'preview and local run' };
  const flags = ['| Flag | Where | Group | What it does |', '|---|---|---|---|', ...knownFlags().map((f) => `| \`?${f.id}\` | ${gate[f.gate] || f.gate} | ${f.group || ''} | ${cell(f.meaning)}${f.alias ? ` (old spelling of ?${f.alias})` : ''} |`)];
  return { rules: out.join('\n').trimEnd(), limits: limits.join('\n'), flags: flags.join('\n') };
}

export function fill(text, t) {
  let s = text;
  for (const k of Object.keys(t)) {
    const re = new RegExp(`(<!-- generated:${k} -->)[\\s\\S]*?(<!-- /generated -->)`);
    if (!re.test(s)) throw new Error(`docs/debug.md has no "generated:${k}" block`);
    s = s.replace(re, (_, a, b) => `${a}\n${t[k]}\n${b}`);
  }
  return s;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const now = readFileSync(FILE, 'utf8'), next = fill(now, await tables());
  if (process.argv.includes('--check')) {
    if (now !== next) { console.error('docs/debug.md is out of step with the rules, limits or flags: run `npm run debug -- doc`'); process.exit(1); }
    console.log('docs/debug.md matches the code.');
  } else { writeFileSync(FILE, next); console.log(`Wrote ${FILE}`); }
}
