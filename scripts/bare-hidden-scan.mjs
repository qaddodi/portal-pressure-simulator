// Counts, per file under src/ui, the places that show or hide a piece of the page in one frame: a write of `.hidden`, of `style.display`, or a
// toggle of the hidden attribute. Owner, 15 Nov 2026: nothing pops in or out. A piece on screen is shown or hidden through util.js fadeShown
// (a fade), fold() / foldHidden() (a fade with its height gliding) or swapFade / swapText (new content for old). Many of the writes counted are
// fine (a piece hidden only after its own fade, one off screen, a measuring trick): they stay in the allowance, which only goes down.
// A line that ends in a comment holding `off-screen:` is not counted (say why: nobody sees it change). Run by scripts/rules-lint.mjs;
// `node scripts/bare-hidden-scan.mjs --write` rewrites scripts/bare-hidden-allowance.json from the code (only ever to lower a number).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WRITES = [/\.hidden\s*=(?!=)/g, /\.style\.display\s*=(?!=)/g, /toggleAttribute\(\s*['"]hidden['"]/g];
export function countIn(src) {
  let n = 0;
  for (const line of src.split('\n')) {
    if (/^\s*(\/\/|\*|\/\*)/.test(line) || /\/\/.*off-screen:/.test(line)) continue;
    for (const re of WRITES) n += (line.match(re) || []).length;
  }
  return n;
}
// (src/ui/gallery/ is the preview-only debug catalog (?gallery, ?check, Sweep): developer panels the owner opens to test, never a teaching surface, so a panel showing at once there is not
// a pop in front of an audience. It is the one directory left out, 19 Nov 2026; the teaching app's own files are all counted.)
export function scan(root = 'src/ui') {
  const out = {};
  const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) { if (e.name !== 'gallery') walk(p); } else if (p.endsWith('.js')) { const n = countIn(readFileSync(p, 'utf8')); if (n) out[p] = n; } } };
  walk(root);
  return Object.fromEntries(Object.entries(out).sort());
}
if (process.argv[1]?.endsWith('bare-hidden-scan.mjs')) {
  const now = scan();
  if (process.argv.includes('--write')) writeFileSync('scripts/bare-hidden-allowance.json', `${JSON.stringify(now, null, 2)}\n`);
  else console.log(now, Object.values(now).reduce((a, b) => a + b, 0));
}
