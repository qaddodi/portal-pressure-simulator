// The blood's speed-ups of 26 Oct (review/blood-shading-ideas): the composite's `fast` build draws the same picture as the
// classic one (?blood=classic) with less work a lumen pixel. Source patterns (no GL in node), checked on the shader text as
// the GPU sees it: the #if blocks resolved for each build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const { COMP_FS } = await import('../src/ui/veins-gl.js');

// The shader's own preprocessor, as far as the composite uses it: #define NAME value, #if NAME, #if NAME == n, #else, #endif.
function resolve(src) {
  const defs = {}, out = [], stack = [];
  for (const line of src.split('\n')) {
    const t = line.trim();
    const live = stack.every((s) => s);
    let m;
    if ((m = t.match(/^#define (\w+) (.+)$/))) { if (live) defs[m[1]] = m[2].trim(); out.push(line); continue; }
    if ((m = t.match(/^#if (\w+)(?: == (\d+))?$/))) {
      const v = Number(defs[m[1]] ?? 0);
      stack.push(m[2] == null ? v !== 0 : v === Number(m[2]));
      continue;
    }
    if (t === '#else') { stack.push(!stack.pop()); continue; }
    if (t === '#endif') { stack.pop(); continue; }
    if (live) out.push(line);
  }
  assert.equal(stack.length, 0, 'every #if is closed');
  return out.join('\n');
}
const builds = { fast: COMP_FS(false, true), fastPlain: COMP_FS(true, true), classic: COMP_FS(false, false), classicPlain: COMP_FS(true, false) };
const R = Object.fromEntries(Object.entries(builds).map(([k, s]) => [k, resolve(s)]));
const body = (src, head) => {
  const i = src.indexOf(head);
  assert.ok(i >= 0, `${head} is in the shader`);
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); }
  throw new Error(`${head} never closes`);
};

test('every build of the composite has balanced brackets once its #if blocks are resolved', () => {
  for (const [k, s] of Object.entries(R)) {
    for (const [o, c] of [['{', '}'], ['(', ')'], ['[', ']']]) {
      let d = 0;
      for (const ch of s) { if (ch === o) d++; else if (ch === c) d--; assert.ok(d >= 0, `${k}: a ${c} before its ${o}`); }
      assert.equal(d, 0, `${k}: ${o}${c} balance`);
    }
  }
});

test('the classic build is the composite as it was: the bead look, every layer under a lumen, every cut-out tested', () => {
  for (const k of ['classic', 'classicPlain']) {
    assert.match(R[k], /uniform int look;/);
    assert.match(R[k], /if \(look == 0\) \{/);
    assert.match(R[k], /const bool under = true;/);
  }
});

test('the fast build draws the shimmer alone: the bead look is compiled out', () => {
  for (const k of ['fast', 'fastPlain']) {
    assert.match(R[k], /const int look = 1;/);
    assert.doesNotMatch(R[k], /uniform int look;/);
    assert.doesNotMatch(R[k], /look == 0/);
    // (the bead's stagnant-blood noise went with it)
    assert.doesNotMatch(R[k], /1 << 20/);
  }
  // The app never asks for the beads (main.js forces the shimmer; the lobule defaults to it).
  assert.match(readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8'), /blood\.look = 'shimmer';/);
  assert.match(readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8'), /look: b\.look \|\| 'shimmer'/);
});

test('the fast build skips the layers under an opaque vessel pixel, and only those', () => {
  for (const k of ['fast', 'fastPlain']) {
    const main = body(R[k], 'void main()');
    assert.match(main, /bool under = v\.a < 1\.0;/);
    // The vessel layer is read before anything under it is.
    assert.ok(main.indexOf('texelFetch(base, ip, 0)') < main.indexOf('texelFetch(stackL'));
    const blk = body(main, 'if (under) {');
    for (const x of ['texelFetch(stackL', 'texture(plate1', 'texture(plate0', 'plateSat', 'texelFetch(glowL', 'texelFetch(warmL']) assert.ok(blk.includes(x), `${x} is skipped under an opaque pixel`);
    // The pool and stream (under the vessels) stop too; the jets (over them), the fluid and the outlines never do.
    assert.match(main, /if \(i >= bleedN \|\| !under\) break;/);
    assert.ok(!blk.includes('fluidInk') && !blk.includes('lineL'));
    assert.match(main, /vec4 o = over\(fluidC, over\(v, over\(inner, pl\)\)\);/);
  }
});

test('the fast build tests the arrowheads\' cut-outs only where a head is', () => {
  const main = body(R.fast, 'void main()');
  const chev = body(main, 'if (chev == 1) {');
  const gate = body(chev, 'if (c.x + c.y > 0.0) {');
  assert.ok(gate.includes('noChev[i]') && gate.includes('chevHole[i]'), 'both cut-outs inside the test');
  // ...and the drawing still waits on the head surviving them.
  const after = chev.slice(chev.indexOf(gate) + gate.length);
  assert.ok(body(after, 'if (c.x + c.y > 0.0) {').includes('chevInk'));
  // The classic build tests them on every lumen pixel.
  const cc = body(body(R.classic, 'void main()'), 'if (chev == 1) {');
  assert.ok(cc.indexOf('noChev[i]') < cc.indexOf('if (c.x + c.y > 0.0) {'));
});
