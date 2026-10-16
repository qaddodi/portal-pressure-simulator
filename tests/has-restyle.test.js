import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A :has() rule followed by more selector parts must end in a part that names something (a class, an id, a tag or an
// attribute). When its last part names nothing (`> :not(.x)`, `*`), the browser restyles everything under the :has()
// element whenever a node is added anywhere inside it: one such rule on #app restyled all 3,500 elements of the page
// on every model tick, 30–60% of the CPU while a slide sat still.
function rules(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') { const pre = css.slice(start, i).trim(); if (!pre.startsWith('@')) out.push(pre); depth++; start = i + 1; }
    else if (c === '}') { depth--; start = i + 1; }
    else if (c === ';' && depth >= 0) start = i + 1;
  }
  return out;
}
// Splits at top-level commas or combinators (spaces, >, +, ~), outside parentheses and brackets.
function split(sel, at) {
  const parts = [];
  let d = 0, cur = '';
  for (const c of sel) {
    if (c === '(' || c === '[') d++;
    if (c === ')' || c === ']') d--;
    if (d === 0 && at.test(c)) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}
// What a compound names outside :not()/:has()/:where() (which give the browser nothing to look for).
const names = (compound) => /^[a-z]|[.#[]|^:is\(/i.test(compound.replace(/:(not|has|where)\((?:[^()]|\([^()]*\))*\)/g, '').replace(/::?[\w-]+(\([^)]*\))?/g, (m) => (m.startsWith(':is(') ? m : '')));

test('no :has() rule restyles a whole subtree for want of a name in its last part', () => {
  const bad = [];
  for (const file of ['../styles/app.css', '../styles/tokens.css']) {
    const css = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const r of rules(css)) for (const sel of split(r, /,/)) {
      if (!sel.includes(':has(')) continue;
      const parts = split(sel, /[\s>+~]/);
      const hasAt = parts.findLastIndex((p) => p.includes(':has('));
      if (hasAt === parts.length - 1) continue;   // the :has() element is the one styled: only it is restyled
      if (!names(parts.at(-1))) bad.push(sel);
    }
  }
  assert.deepEqual(bad, [], 'name the last part of these selectors (for example :is(.a, .b) for :not(.c))');
});

test('the check above catches the rule that restyled the whole app', () => {
  const sel = '.app.thumb:has(#treatCard:not([hidden])) .vdock:not(.mini) > :not(.thumb-bar)';
  assert.equal(names(split(sel, /[\s>+~]/).at(-1)), false);
  assert.equal(names(':is(.stage-bar, .readouts)'), true);
  assert.equal(names('.vdock:not(.mini)::before'), true);
});
