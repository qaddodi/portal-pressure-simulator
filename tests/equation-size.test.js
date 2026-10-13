import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// An equation on a teaching card stays in proportion to the words beside it, on phones and upright iPad (the stack layout).
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim(), body }));
const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const px = (name, vmin) => {   // --t-<name>: clamp(lo, calc(lo + (100vmin - 390px) * k), hi) at a given short side
  const [, lo, k, hi] = tokens.match(new RegExp(`--t-${name}:\\s*clamp\\((\\d+)px,\\s*calc\\(\\d+px \\+ \\(100vmin - 390px\\) \\* ([\\d.]+)\\),\\s*(\\d+)px\\)`));
  return Math.min(+hi, Math.max(+lo, +lo + (vmin - 390) * +k));
};

test('on the stacked layout the equation is at most 1.35 times the slide line', () => {
  const eq = rules.find((r) => r.sel === '.pz.stack .pz-eq math');
  const line = rules.find((r) => r.sel === '.pz.stack .pz-line');
  assert.ok(eq && line, 'stack equation and line rules exist');
  assert.match(line.body, /font-size:\s*var\(--s-lab\)/);
  const m = eq.body.match(/font-size:\s*calc\(var\(--s-lab\)\s*\*\s*([\d.]+)\)/);
  assert.ok(m, `equation is sized from the line's own token, got: ${eq.body}`);
  assert.ok(+m[1] <= 1.35 && +m[1] >= 1, `ratio ${m[1]}`);
  for (const vmin of [360, 390, 430, 768, 834]) assert.ok(px('lab', vmin) * +m[1] < px('val', vmin), `equation stays below the heading at ${vmin}`);
});
