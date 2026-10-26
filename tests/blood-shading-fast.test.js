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
  const chev = body(main, 'if (chev == 1 && f1.z > 0.0) {');
  const gate = body(chev, 'if (c.x + c.y > 0.0) {');
  assert.ok(gate.includes('noChev[i]') && gate.includes('chevHole[i]'), 'both cut-outs inside the test');
  // ...and the drawing still waits on the head surviving them.
  const after = chev.slice(chev.indexOf(gate) + gate.length);
  assert.ok(body(after, 'if (c.x + c.y > 0.0) {').includes('chevInk'));
  // The classic build tests them on every lumen pixel.
  const cc = body(body(R.classic, 'void main()'), 'if (chev == 1 && f1.z > 0.0) {');
  assert.ok(cc.indexOf('noChev[i]') < cc.indexOf('if (c.x + c.y > 0.0) {'));
});

// ── Item 5: the zoom's numbers once per vertex, and the vessel's own values read once for the streaks and the arrowheads ──
const glSrc = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const zoomVS = glSrc.slice(glSrc.indexOf('const ZOOM_VS = `'), glSrc.indexOf('}`;', glSrc.indexOf('const ZOOM_VS = `')));

test('the vertex shaders work out the zoom\'s numbers with the very expressions the classic composite uses per pixel', () => {
  const cls = R.classic;
  for (const e of [
    'max(2.6, 5.0 * pxW)',
    'clamp(log2(max(pxW, 1e-4) * 8.0 / SLOT), -1.0, 3.0)',
    'smoothstep(-0.2, 0.2, lx) + smoothstep(0.8, 1.2, lx)',
    'min(floor(li), 1.0), lf = li - lb',
    'SLOT * exp2(lb), sB = SLOT * exp2(lb + 1.0)',
  ]) { assert.ok(zoomVS.includes(e), `vertex: ${e}`); assert.ok(cls.includes(e), `classic: ${e}`); }
  // The fine octave's fade, per scale, as shimN works it out (cellA = 5.12 × the scale).
  assert.ok(cls.includes('cellA = 5.12 * sx') && cls.includes('fw = smoothstep(1.2 * pxW, 2.0 * pxW, cellA * 0.5);'));
  assert.ok(zoomVS.includes('cellA = 5.12 * sA, cellB = 5.12 * sB'));
  assert.ok(zoomVS.includes('smoothstep(1.2 * pxW, 2.0 * pxW, cellA * 0.5), smoothstep(1.2 * pxW, 2.0 * pxW, cellB * 0.5), mix(sA, sB, lf)'));
  // Both vertex shaders hand them on; the fast composite takes them flat and works none of them out again.
  assert.equal((glSrc.match(/\$\{ZOOM_VS\}/g) || []).length, 2);
  assert.equal((glSrc.match(/zoomOut\(\);/g) || []).length, 2);
  for (const k of ['fast', 'fastPlain']) {
    assert.match(R[k], /flat in vec4 zoomA;/);
    assert.doesNotMatch(body(R[k], 'vec4 bloodAt('), /log2\(|exp2\(|max\(2\.6, 5\.0 \* pxW\)/);
    assert.doesNotMatch(body(R[k], 'float shimN('), /smoothstep\(1\.2 \* pxW/);
  }
});

test('the streaks and the arrowheads share one read of the vessel\'s flow, length, caliber and colour', () => {
  for (const k of Object.keys(R)) {
    const main = body(R[k], 'void main()');
    assert.equal((main.match(/texelFetch\(flow, ivec2\(0, id1\), 0\)/g) || []).length, 1, `${k}: flow texel 0 once`);
    assert.equal((main.match(/texelFetch\(flow, ivec2\(1, id1\), 0\)/g) || []).length, 1, `${k}: flow texel 1 once`);
    assert.match(main, /if \(blood == 1 && f1\.z > 0\.0\) \{/);
    assert.match(main, /if \(chev == 1 && f1\.z > 0\.0\) \{/);
    const bl = body(R[k], 'vec4 bloodAt('), ch = body(R[k], 'vec2 chevAt(');
    for (const f of [bl, ch]) {
      assert.doesNotMatch(f, /texelFetch\(flow, ivec2\([01], id\)/);
      assert.doesNotMatch(f, /texelFetch\(tube, ivec2\(5, id\)/);
    }
    assert.doesNotMatch(bl, /texelFetch\(tube, ivec2\(0, id\)/);
    // (bloodAt's caliber was radAt's expression written out: the one function now serves both.)
    assert.doesNotMatch(bl, /texelFetch\(rad,/);
  }
});

// ── Item 1: the noise lattice looked up instead of hashed ──
import { hsh, corner, seedOf, noiseBlock, blockAt, tableSize, OCTAVES, NOISE_W, NOISE_H, NOISE_PER_ROW } from '../src/ui/blood-noise.js';

// The shader's hash, read from its own text and done in exact integers (BigInt), so the table is held to the GLSL, not to itself.
const hshText = glSrc.match(/uint hsh\(uint x\) \{ (.*?) return x; \}/)[1];
const consts = [...hshText.matchAll(/0x([0-9a-f]+)u/g)].map((m) => BigInt('0x' + m[1]));
const shifts = [...hshText.matchAll(/x >> (\d+)/g)].map((m) => BigInt(m[1]));
const M32 = 0xffffffffn;
const hshRef = (x) => { x = BigInt(x); x ^= x >> shifts[0]; x = (x * consts[0]) & M32; x ^= x >> shifts[1]; x = (x * consts[1]) & M32; x ^= x >> shifts[2]; return Number(x); };
const vn = R.classic.match(/float vnoise\(vec2 q, uint seed, int period\) \{[\s\S]*?\n\}/)[0];
const [mx, my] = [...vn.matchAll(/\* (\d+)u\)/g)].slice(0, 2).map((m) => BigInt(m[1]));
const cornerRef = (seed, x, y) => (hshRef((BigInt(seed) ^ ((BigInt(x) * mx) & M32) ^ ((BigInt(y) * my) & M32)) & M32) & 0xffffff) / 16777216;

test('the JS hash is the shader\'s, bit for bit', () => {
  assert.equal(shifts.length, 3); assert.equal(consts.length, 2);
  assert.match(vn, /uint y0 = uint\(int\(i\.y\) \+ 4096\)/);
  let x = 0x9e3779b9;
  for (let i = 0; i < 20000; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; assert.equal(hsh(x), hshRef(x)); }
  for (const v of [0, 1, 0x7fffffff, 0x80000000, 0xffffffff]) assert.equal(hsh(v), hshRef(v));
});

test('the seeds and periods are the shader\'s', () => {
  const sh = body(R.classic, 'float shimN(');
  assert.match(sh, /uint sd0 = uint\(id\) \* 31u, sd1 = uint\(id\) \* 57u \+ 11u;/);
  assert.match(sh, /int per = 50;/);
  assert.match(sh, /vnoise\(qa, sd0, per\)/);
  assert.match(sh, /vnoise\(qa \* vec2\(2\.0, 1\.7\) \+ vec2\(0\.0, 7\.3\), sd1, per \* 2\)/);
  assert.deepEqual(OCTAVES.map((o) => [o.mul, o.add, o.period]), [[31, 0, 50], [57, 11, 100]]);
  // The fast build reads the same octaves from the table, with the same seeds and periods.
  const fs = body(R.fast, 'float shimN(');
  assert.match(fs, new RegExp(`vnoiseT\\(qa, sd0, per, o0, ${OCTAVES[0].yo}, ${OCTAVES[0].rows}\\)`));
  assert.match(fs, new RegExp(`vnoiseT\\(qa \\* vec2\\(2\\.0, 1\\.7\\) \\+ vec2\\(0\\.0, 7\\.3\\), sd1, per \\* 2, o1, ${OCTAVES[1].yo}, ${OCTAVES[1].rows}\\)`));
  assert.match(fs, new RegExp(`ivec2 o0 = ivec2\\(\\(id % ${NOISE_PER_ROW}\\) \\* ${NOISE_W} \\+ ${OCTAVES[0].x}, \\(id / ${NOISE_PER_ROW}\\) \\* ${NOISE_H}\\), o1 = o0 \\+ ivec2\\(${OCTAVES[1].x}, 0\\);`));
});

test('every vessel\'s block holds each cell\'s four corners exactly as the shader hashes them', () => {
  // Rows the app has (the anatomy's ~250, the lobule's 320) and a few far beyond, every texel of each.
  for (const id of [0, 1, 2, 12, 13, 14, 77, 245, 319, 1000, 65535]) {
    const b = noiseBlock(id);
    for (const o of OCTAVES) {
      const seed = Number((BigInt(id) * BigInt(o.mul) + BigInt(o.add)) & M32);
      assert.equal(seedOf(id, o), seed);
      for (let cy = 0; cy < o.rows; cy++) for (let x0 = 0; x0 < o.period; x0++) {
        const q = (cy * NOISE_W + o.x + x0) * 4, x1 = (x0 + 1) % o.period, y0 = cy - o.yo + 4096;
        const want = [cornerRef(seed, x0, y0), cornerRef(seed, x1, y0), cornerRef(seed, x0, y0 + 1), cornerRef(seed, x1, y0 + 1)];
        for (let j = 0; j < 4; j++) assert.equal(b[q + j], want[j], `row ${id}, ${o.period}, cell ${x0},${cy}, corner ${j}`);
      }
    }
  }
  assert.equal(corner(1, 2, 3), cornerRef(1, 2, 3));
});

test('the blocks tile the table without overlapping, within WebGL2\'s smallest texture size', () => {
  const seen = new Set();
  for (const n of [246, 320]) {
    const [W, H] = tableSize(n);
    assert.ok(W <= 2048 && H <= 2048, `${W} × ${H}`);
    for (let id = 0; id < n; id++) {
      const [x, y] = blockAt(id);
      assert.ok(x + NOISE_W <= W && y + NOISE_H <= H);
      const k = `${n}:${x},${y}`; assert.ok(!seen.has(k)); seen.add(k);
    }
  }
  // Each octave fits its block.
  for (const o of OCTAVES) assert.ok(o.x + o.period <= NOISE_W && o.rows <= NOISE_H);
  assert.ok(OCTAVES[0].x + OCTAVES[0].period <= OCTAVES[1].x);
});

// The across-coordinate the streaks read the noise at (bloodAt): qy = y R / max(0.88 R / clamp(1.7 R / Lg, 1, 7), 3.2 pxW), with
// y the lumen's across (−1 … 1 + 1/65535 from its 16-bit store), R ≥ 0.3, Lg ≥ 2.6. Its largest size is 7 / 0.88 of |y|: the
// table's rows cover every lattice row that reaches, for both octaves, so the hashed fallback is never taken in the app.
test('the table covers every lattice row the streaks can read', () => {
  assert.match(R.classic, /float qy = y \* R \/ max\(0\.55 \* 1\.6 \* R \/ clamp\(1\.7 \* R \/ Lg, 1\.0, 7\.0\), 3\.2 \* pxW\);/);
  const yMax = 65535 / 32767.5 - 1, qMax = (yMax * 7) / (0.55 * 1.6);
  const rows = (lo, hi) => [Math.floor(lo), Math.floor(hi)];
  const [c0, c1] = rows(-qMax, qMax), [f0, f1] = rows(-qMax * 1.7 + 7.3, qMax * 1.7 + 7.3);
  assert.ok(c0 + OCTAVES[0].yo >= 0 && c1 + OCTAVES[0].yo < OCTAVES[0].rows, `coarse ${c0}…${c1}`);
  assert.ok(f0 + OCTAVES[1].yo >= 0 && f1 + OCTAVES[1].yo < OCTAVES[1].rows, `fine ${f0}…${f1}`);
});

// vnoise and vnoiseT on float32 arithmetic (the GPU's highp), side by side: the same value for any point, inside the table or not.
const f32 = Math.fround;
function vnoiseJS(qx, qy, seed, period, read) {
  const ix = Math.floor(qx), iy = Math.floor(qy);
  let fx = f32(qx - ix), fy = f32(qy - iy);
  fx = f32(f32(fx * fx) * f32(3 - f32(2 * fx))); fy = f32(f32(fy * fy) * f32(3 - f32(2 * fy)));
  let x0 = ix % period; if (x0 < 0) x0 += period;
  const [a, b, c, d] = read(x0, iy);
  const mix = (u, v, t) => f32(u + f32(f32(v - u) * t));
  return mix(mix(a, b, fx), mix(c, d, fx), fy);
}
test('reading the corners from the block gives vnoise\'s value at every point', () => {
  for (const id of [3, 90, 300]) {
    const blk = noiseBlock(id);
    for (const o of OCTAVES) {
      const seed = seedOf(id, o);
      const hashRead = (x0, iy) => { const x1 = (x0 + 1) % o.period, y0 = iy + 4096; return [corner(seed, x0, y0), corner(seed, x1, y0), corner(seed, x0, y0 + 1), corner(seed, x1, y0 + 1)]; };
      const tableRead = (x0, iy) => {
        const cy = iy + o.yo;
        if (cy < 0 || cy >= o.rows) return hashRead(x0, iy);
        const q = (cy * NOISE_W + o.x + x0) * 4;
        return [blk[q], blk[q + 1], blk[q + 2], blk[q + 3]];
      };
      let s = id * 7 + o.period;
      for (let i = 0; i < 3000; i++) {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        const qx = f32((s / 4294967296 - 0.5) * 900), qy = f32(((s * 7) % 1000) / 1000 * 40 - 15);
        assert.equal(vnoiseJS(qx, qy, seed, o.period, tableRead), vnoiseJS(qx, qy, seed, o.period, hashRead));
      }
    }
  }
});
