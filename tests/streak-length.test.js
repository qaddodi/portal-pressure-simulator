import { stageSource } from './stage-src.js';
// Blood streaks say speed by their length (1 Nov, sprint brief 6): a fast vessel's streaks run long and a slow one's are short dashes,
// so a still frame shows speed too. The composite moves the two noise layers' shares by the vessel's display speed (veins-gl.js bloodAt,
// shimN); nothing in a streak moves for it (no coordinate changes). Source patterns (no GL
// in node), checked on the shader text as the GPU sees it, and the arithmetic worked again here from the numbers in that text.
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
const { displaySpeed } = await import('../src/ui/blood.js');
const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const stage = stageSource();
const lobule = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');

// The shader's own preprocessor, as far as the composite uses it (as blood-shading-fast.test.js).
function resolve(src) {
  const defs = {}, out = [], stack = [];
  for (const line of src.split('\n')) {
    const t = line.trim();
    const live = stack.every((s) => s);
    let m;
    if ((m = t.match(/^#define (\w+) (.+)$/))) { if (live) defs[m[1]] = m[2].trim(); out.push(line); continue; }
    if ((m = t.match(/^#if (\w+)(?: == (\d+))?$/))) { const v = Number(defs[m[1]] ?? 0); stack.push(m[2] == null ? v !== 0 : v === Number(m[2])); continue; }
    if (t === '#else') { stack.push(!stack.pop()); continue; }
    if (t === '#endif') { stack.pop(); continue; }
    if (live) out.push(line);
  }
  return out.join('\n');
}
const builds = { full: COMP_FS(false), plain: COMP_FS(true) };
const R = Object.fromEntries(Object.entries(builds).map(([k, s]) => [k, resolve(s)]));
const body = (src, head) => {
  const i = src.indexOf(head);
  assert.ok(i >= 0, `${head} is in the shader`);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); }
  throw new Error(`${head} never closes`);
};

// The shader's own arithmetic, worked again from the same constants (read out of its text below).
const T = 0.62 * 0.62 + 0.38 * 0.38;
const shares = (kk) => {
  const lu = Math.min(1, Math.max(-1, kk >= 1 ? (kk - 1) / 0.6 : (kk - 1) / 0.4));
  const wf = lu >= 0 ? 0.38 * (1 - lu) : 0.38 - 0.27 * lu, wb = 1 - wf;
  return { wb, wf, gS: Math.sqrt(0.5288 / (wb * wb + wf * wf)) };
};
const factor = (vd, stasis = 0) => { const k = Math.min(1.6, Math.max(0.6, Math.sqrt(Math.abs(vd) / 36))); return k + (1 - k) * stasis; };

test('the figure alone asks for it (the lobule draws as before)', () => {
  assert.match(stage, /originA: 0, streakLen: true, clock: 0,/);
  assert.match(stage, /L\.clock = (?:live\.)?(?:live\.)?(?:live\.)?bloodClock;/);
  assert.match(gl, /uniform int lenOn;/);
  assert.match(gl, /UC\.i1\(U\.lenOn, blood\.streakLen \? 1 : 0\);/);
  // (Changing it draws the picture again: it is in the still-lumen signature with the other blood switches.)
  assert.match(gl, /\n\s+sigNow\[sn\+\+\] = \+\(blood\.streakLen\) \|\| 0; sigNow\[sn\+\+\] = \+\(blood\.bt \|\| 0\) \|\| 0;/);
  // The lobule's own composite never sets it, so it stays at 0 there: the lobule's streaks are as they were.
  assert.doesNotMatch(lobule, /streakLen/);
});

test('with it off, bloodAt hands the noise today\'s 0.62 / 0.38 and an even spread, in every build', () => {
  for (const [k, src] of Object.entries(R)) {
    const b = body(src, 'vec4 bloodAt(');
    const at = b.indexOf('lnWb = 0.62; lnWf = 0.38; lnS = 1.0;');
    assert.ok(at > 0, `${k}: the shares are today's before anything else sets them`);
    assert.ok(at < b.indexOf('if (lenOn == 1) {'), `${k}: and only the switch changes them`);
    // Nothing outside that branch sets them.
    assert.equal((b.match(/\bln(?:Wb|Wf|S) = /g) || []).length, 3 + 3, `${k}: three set to today's, three inside the switch`);
    const s = body(src, 'float shimN(');
    assert.doesNotMatch(s, /0\.62 \*|0\.38 \*/, `${k}: no fixed shares left in shimN`);
    assert.match(s, /lnWb \* vnoise/);
    assert.match(s, /lnWf \* \(fine \?/);
    assert.match(s, /float nm = mix\(na, nb, t\);\n\s*return lnS == 1\.0 \? nm : 0\.5 \+ \(nm - 0\.5\) \* lnS;/);
    // (An even spread leaves the noise's own value untouched: the same bits as before.)
    assert.match(s, /bool fine = fw > 0\.0 && lnWf > 0\.0;/);
  }
});

test('nothing in a streak moves for it: the noise coordinates, the speeds and the chevrons are untouched', () => {
  for (const [k, src] of Object.entries(R)) {
    const s = body(src, 'float shimN(');
    assert.match(s, /vec2 qa = vec2\(\(s - mod\(D \* k0 \/ 8\.0, period\)\) \/ cellA \+ drift, qy\);/, `${k}: the coordinate`);
    assert.match(s, /vec2 qb = vec2\(\(s - mod\(D \* \(k0 \+ 1\.0\) \/ 8\.0, period\)\) \/ cellA \+ drift, qy\);/, `${k}: and the next lane's`);
  }
  // No new table, texture or sampler: the speed is the one the streaks already travel at (flow texel 0, y), eased by blood.js.
  const b = body(R.full, 'vec4 bloodAt(');
  assert.match(b, /sqrt\(abs\(vd\) \/ 36\.0\)/);
  assert.doesNotMatch(body(R.full, 'if (lenOn == 1) {'), /texelFetch|texture\(/);
  assert.match(gl, /export const FLOW_TEXELS = 7;/);
});

test('the factor is the square root of the display speed over the healthy portal trunk\'s, kept to 0.6 … 1.6, and stagnation lets it go', () => {
  const sw = body(R.full, 'if (lenOn == 1) {');
  assert.match(sw, /float kk = mix\(clamp\(sqrt\(abs\(vd\) \/ 36\.0\), 0\.6, 1\.6\), 1\.0, stasis\);/);
  assert.match(sw, /float lu = clamp\(kk >= 1\.0 \? \(kk - 1\.0\) \/ 0\.6 : \(kk - 1\.0\) \/ 0\.4, -1\.0, 1\.0\);/);
  assert.match(sw, /lnWf = lu >= 0\.0 \? 0\.38 \* \(1\.0 - lu\) : 0\.38 - 0\.27 \* lu;/);
  assert.match(sw, /lnWb = 1\.0 - lnWf;/);
  assert.match(sw, /lnS = sqrt\(0\.5288 \/ \(lnWb \* lnWb \+ lnWf \* lnWf\)\);/);
  // 0.5288 is what today's shares add up to (the spread the noise had).
  assert.ok(Math.abs(T - 0.5288) < 1e-9);
  // 36 is the healthy portal trunk's display speed: its mean velocity there is about 14 cm/s (16 mL/s through 12 mm).
  const trunk = displaySpeed(16.06 / (Math.PI * 1.21 * 1.21 / 4));
  assert.ok(Math.abs(trunk - 36) < 1.5, `the healthy trunk runs at ${trunk.toFixed(1)} on the display scale`);
  assert.ok(Math.abs(factor(trunk) - 1) < 0.03, 'so its streaks keep today\'s length (within the brief\'s 10 %)');
  // The extremes, and no further.
  assert.equal(factor(0), 0.6);
  assert.equal(factor(1e6), 1.6);
  assert.equal(factor(-120), 1.6, 'a vessel running backwards is as fast as forwards');
  // A stagnant vein (its blood drawn as smoke) keeps today's streaks whatever its speed.
  for (const v of [0, 12, 120]) assert.equal(factor(v, 1), 1);
  assert.ok(factor(12, 0.5) > factor(12, 0) && factor(12, 0.5) < 1);
});

test('at the healthy speed the shares are today\'s to the bit; faster drops the fine layer to nothing, slower raises it', () => {
  const t = shares(1);
  assert.equal(t.wf, 0.38);
  assert.ok(Math.abs(t.wb - 0.62) < 1e-12 && Math.abs(t.gS - 1) < 1e-12);
  assert.equal(shares(1.6).wf, 0, 'the fastest vessel: the coarse layer alone (the streaks about 1.45 times as long)');
  assert.ok(Math.abs(shares(0.6).wf - 0.65) < 1e-12, 'the slowest: the fine layer at 0.65 (about 0.75 times)');
  // Smooth and in one direction across the whole range (no step, no turn): the fine share falls as the vessel speeds up.
  let last = Infinity;
  for (let kk = 0.6; kk <= 1.6001; kk += 0.01) {
    const w = shares(kk).wf;
    assert.ok(w >= 0 && w <= 0.65 + 1e-12);
    assert.ok(w <= last + 1e-12, `the fine share rises at ${kk.toFixed(2)}`);
    assert.ok(last === Infinity || last - w < 0.03, `no step at ${kk.toFixed(2)}`);
    last = w;
  }
  // The spread is held: the shares' own spread times gS squared is today's, so the streaks' number and brightness hold.
  for (let kk = 0.6; kk <= 1.6001; kk += 0.05) {
    const w = shares(kk);
    assert.ok(Math.abs((w.wb * w.wb + w.wf * w.wf) * w.gS * w.gS - T) < 1e-9, `spread at ${kk.toFixed(2)}`);
    assert.ok(Math.abs(w.wb + w.wf - 1) < 1e-12, 'the shares still add to one, so the mean stays 0.5');
  }
});
