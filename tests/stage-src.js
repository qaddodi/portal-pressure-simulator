// The text of the stage: stage.js plus every stage-*.js part (src/ui/stage-split plan). Tests that judge stage source read it through here so a move
// into a part file keeps them meaningful. stageFn(name) returns one function's text wherever it now lives.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const UI = fileURLToPath(new URL('../src/ui/', import.meta.url));
export const stageFiles = () => ['stage.js', ...readdirSync(UI).filter((f) => /^stage-.+\.js$/.test(f)).sort()];
// (A forwarding stub the move tool leaves in stage.js, `function f(...a) { return f$(...a); }   // <stage-split stub>`, is left out: the real function is the one in its part.)
const STUB = /^[ \t]*function\*? \w+\(\.\.\.a\) \{ return (?:yield\* )?\w+\$\(\.\.\.a\); \}[ \t]*\/\/ <stage-split stub>\n?/gm;
export const stageSource = () => stageFiles().map((f) => readFileSync(join(UI, f), 'utf8').replace(STUB, '')).join('\n');

// Text of `function name(...) {...}` / `async function` / `function*` (brace matched; strings and comments are not special-cased, as the
// regex tests it replaces were not either).
export function stageFn(name) {
  const src = stageSource();
  const m = new RegExp(`(?:async\\s+)?function\\s*\\*?\\s*${name}\\s*\\(`).exec(src);
  if (!m) throw new Error(`stageFn: no function ${name}`);
  let i = src.indexOf('{', src.indexOf(')', m.index)), d = 0;
  for (let j = i; j < src.length; j++) { const c = src[j]; if (c === '{') d++; else if (c === '}' && --d === 0) return src.slice(m.index, j + 1); }
  throw new Error(`stageFn: unbalanced ${name}`);
}
