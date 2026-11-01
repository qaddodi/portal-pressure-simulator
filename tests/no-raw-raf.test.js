// P5: the GPU is the only per-frame painter, and src/ui/frame.js is the only scheduler. A surface asks for its next frame through
// frameFor() (frame.js), which runs every callback of a frame together, in order, and asks the browser for nothing when none is wanted.
// A raw requestAnimationFrame call anywhere else would run on its own beat, outside the frame's order (late, final) and its counts.
// The calls below were there before the rule (one-off layout settles, a ResizeObserver's refit, the two measuring tools that must not
// share the scheduler they measure); none may grow, and none may be added. AGENTS.md ("Per-frame work") has the whole rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => (statSync(join(ROOT, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

// (Every one of them moved to frameFor / finalFrameFor on 1 Nov 2026 (the off-GPU gate's rawRaf rows): none is allowed now. ?perf's
// readout and the debug overlay run last in each frame (finalFrameFor), so what they time still includes every other surface's work.)
const ALLOWED = {};

test('no new requestAnimationFrame outside src/ui/frame.js', () => {
  const found = {};
  for (const f of walk('src').filter((x) => x.endsWith('.js') && x !== join('src', 'ui', 'frame.js'))) {
    const n = readFileSync(join(ROOT, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').match(/(?<![\w.])requestAnimationFrame\s*\(/g)?.length || 0;
    if (n) found[f] = n;
  }
  const bad = Object.entries(found).filter(([f, n]) => n > (ALLOWED[f] || 0)).map(([f, n]) => `${f}: ${n} calls, ${ALLOWED[f] || 0} allowed`);
  assert.deepEqual(bad, [], 'ask for the frame with frameFor(tag) from src/ui/frame.js, or finish the move of an old call and lower its allowance here');
  for (const [f, n] of Object.entries(ALLOWED)) assert.ok((found[f] || 0) >= n, `${f} has fewer calls than allowed (${found[f] || 0} of ${n}): lower the allowance`);
});
