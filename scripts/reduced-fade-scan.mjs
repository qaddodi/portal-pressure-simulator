// Counts, per file under src/ui, the places that answer "at once" under Reduce Motion: a duration of 0 or a step of 1 picked by the Reduce
// Motion read (`reduce.matches ? 0 : ms`, `reduceMotion.matches ? 1 : dt / ms`), or Reduce Motion handed on as an "instant" flag
// (`recs.drop(key, now, reduceMotion.matches)`). Owner, 15 Nov 2026: nothing pops in or out; a fade is not motion, so under Reduce Motion
// it keeps its length (motion.js fadeMs / fadeStep). Some of these are movement, which Reduce Motion rightly skips (a glide's length, the
// blood's speed): those stay in the allowance. tests/reduced-fade.test.js fails a file over its allowance, or under it (lower the number).
// `node scripts/reduced-fade-scan.mjs --write` rewrites scripts/reduced-fade-allowance.json from the code (only ever to lower a number).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const READ = String.raw`(?:reduce(?:Motion|MotionMQ|_MQ)?\.matches|REDUCED_MQ\.matches|still\.matches|reduced\(\)|quietFx\(\)|live\.quietFx\(\))`;
export const PATTERNS = [
  new RegExp(`${READ}\\s*\\?\\s*(?:0|1)(?![\\d.e])(?!\\s*[/*])`, 'g'),   // (not `? 1 / RUSH_SPEED`: a speed, not an instant)
  new RegExp(`\\b(?:put|drop|show|want|step|stepBleedFade)\\([^()]*(?:\\([^()]*\\))?[^()]*,\\s*${READ}\\)`, 'g'),
];
export function countIn(src) {
  const code = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  let n = 0;
  for (const re of PATTERNS) n += (code.match(re) || []).length;
  return n;
}
export function scan(root = 'src/ui') {
  const out = {};
  const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) { const n = countIn(readFileSync(p, 'utf8')); if (n) out[p] = n; } } };
  walk(root);
  return Object.fromEntries(Object.entries(out).sort());
}
if (process.argv[1]?.endsWith('reduced-fade-scan.mjs')) {
  const now = scan();
  if (process.argv.includes('--write')) writeFileSync('scripts/reduced-fade-allowance.json', `${JSON.stringify(now, null, 2)}\n`);
  else console.log(now, Object.values(now).reduce((a, b) => a + b, 0));
}
