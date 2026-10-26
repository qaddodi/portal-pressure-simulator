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

// ── Item 6: the second lumen read only where one is ──
test('the lumen buffer flags a second lumen in its row\'s top bit, and the fast composite reads that target only there', async () => {
  const { LUMEN2 } = await import('../src/ui/veins-gl.js');
  assert.equal(LUMEN2, 0x8000);
  // The vessel shader sets the bit exactly where it writes the second target (fl && gId2 > 0).
  assert.match(glSrc, /outFlow = fl\n\s*\? uvec4\(gId \| \(gId2 > 0u \? \$\{LUMEN2\}u : 0u\), /);
  assert.match(glSrc, /outFlow2 = fl && gId2 > 0u\n/);
  // Rows stay far below the bit (the anatomy's ~250, the lobule's 320).
  assert.match(readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8'), /const MAXT = 320;/);
  for (const k of Object.keys(R)) {
    const main = body(R[k], 'void main()');
    // Masked off before anything reads the row (the discard above it holds with or without the bit).
    const at = main.indexOf('g.x &= 32767u;');
    assert.ok(at > 0 && at < main.indexOf('int id1 = int(g.x) - 1') && at < main.indexOf('float vis = g.x > 0u'));
    assert.match(main, /bool two = \(g\.x & 32768u\) != 0u;/);
  }
  assert.match(body(R.fast, 'void main()'), /uvec4 g2 = two \? texelFetch\(gbuf2, ip, 0\) : uvec4\(0u\);/);
  assert.match(body(R.classic, 'void main()'), /uvec4 g2 = texelFetch\(gbuf2, ip, 0\);/);
});

// ── Item 7: lumens whose vessels did not change are left as drawn in the blood's own pass ──
test('the blood pass leaves a lumen alone only when neither of its vessels\' rows nor any uniform changed', () => {
  const main = body(R.fast, 'void main()');
  assert.match(main, /if \(bloodOnly == 1 && stillOn == 1 && texelFetch\(flow, ivec2\(4, int\(g\.x\) - 1\), 0\)\.x == 0\.0\n\s*&& \(!two \|\| texelFetch\(flow, ivec2\(4, int\(texelFetch\(gbuf2, ip, 0\)\.x\) - 1\), 0\)\.x == 0\.0\)\) discard;/);
  assert.doesNotMatch(R.classic, /stillOn/);
  const comp = glSrc.slice(glSrc.indexOf('    composite(look, blood = {}, full = false, part = 0) {'), glSrc.indexOf('    /** Whether organ outlines can be drawn here'));
  // Never in a whole picture, a bleed (the one uniform left out of the comparison, the clock, moves it), the classic build, or
  // before every row has been seen.
  assert.match(comp, /let still = !CLASSIC && !full && !movedAll && !bl\.length && !!stillSig && sn === stillN && sn < sigNow\.length;/);
  assert.match(comp, /for \(let i = 0; still && i < sn; i\+\+\) if \(sigNow\[i\] !== stillSig\[i\]\) still = false;/);
  // The comparison takes every uniform the composite sets but the clock (and the bleed's, which it refuses), and the textures' version.
  const sig = comp.slice(comp.indexOf('sn = 0;'), comp.indexOf('let still'));
  for (const x of ['m, canvas.width, canvas.height', 'pm', 'plate?.alpha', 'plate?.sat', 'plates[0]?.rect', 'plates[1]?.rect', 'fluidRect', 'fl?.s', 'fl.ink', 'fl?.lv',
    'blood.on', 'blood.chev', 'blood.still', 'blood.alpha', 'blood.streakA', 'blood.chevA', 'blood.originA', 'blood.chevInk', 'blood.chevLight', 'blood.vdpr',
    'blood.origin', 'dyeAny', 'originColOf', 'blood.dyeCol', 'blood.revCol', 'blood.inkLight', 'blood.inkDark', 'ncv', 'nc.length', 'hb', 'hr', 'ho.length',
    'layer', 'glow', 'warm', 'useStack', 'bare', 'texVer']) assert.ok(sig.includes(x), x);
  const uniforms = [...comp.matchAll(/gl\.uniform\w+\(U\.(\w+)/g)].map((m) => m[1]);
  for (const u of uniforms) assert.ok(['world', 'size', 'cell', 'inv', 'H', 'pxW', 'plates', 'plateAlpha', 'plateSat', 'plateRect0', 'plateRect1', 'fluidRect', 'fluidS', 'fluidInk', 'fluidLv',
    'blood', 'chev', 'still', 'flowA', 'blendA', 'chevInk', 'chevLight', 'cssPx', 'look', 'origin', 'dyeOn', 'clock', 'rows', 'originCol', 'dyeCol', 'revCol', 'inkLight', 'inkDark',
    'bleedE', 'bleedB', 'bleedN', 'noChev', 'noChevN', 'chevHole', 'chevHoleR', 'chevHoleN', 'bloodOnly', 'stillOn'].includes(u), `uniform ${u} is accounted for`);
  // The rows and this picture's uniforms are taken as the last picture's only once it is drawn.
  assert.ok(comp.indexOf('moved.fill(0); movedAll = false;') > comp.indexOf('gl.uniform1i(U.bloodOnly, 1);'));
  // Every setter of a vessel's row marks it; a new binning or flow table marks them all; a new texture under the lumens bumps texVer.
  const api = glSrc.slice(glSrc.indexOf('  const api = {'));
  assert.match(api, /setTubes\(data\) \{\n\s*tubesNew = true;\n\s*markRows\(data, tubeNow, ROW_W\);/);
  assert.match(api, /setBend\(row, pts\) \{\n\s*moved\[row\] = 1;/);
  assert.match(api, /radRows\.add\(row\); moved\[row\] = 1;/);
  assert.match(api, /markRows\(data, flowSent, stride\);\n\s*const span = changedRows/);
  assert.match(api, /if \(dyeSent\) markRows\(data, dyeSent, DYE_BINS\);/);
  assert.equal((api.match(/fboOK = false; movedAll = true;/g) || []).length, 2);
  for (const f of ['setOrgans(bitmap, rect) {', 'setFluidSpans(halfWidths, rect) {', 'setFluidLiver(bottoms) {', 'dropPlate(slot) {', 'commit(slot, names) {']) assert.ok(body(api, f).includes('texVer++'), f);
  assert.ok(body(api, 'setPlate(slot, job, rect) {').includes('texVer++'));
});

// ── Item 8: the blood's own pass draws the quarters of its cells a lumen can reach ──
import { binVeins, CELL } from '../src/ui/veins-bin.js';
test('every point a lumen reaches lies in one of the blood quarters, and the quarters lie in the blood cells', () => {
  const N = 64;
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  const tubes = [];
  for (let id = 0; id < 12; id++) {
    const x0 = rnd() * 600, y0 = rnd() * 400, a = rnd() * 6.28, bend = (rnd() - 0.5) * 0.02, core = 3 + rnd() * 20;
    const pts = []; let x = x0, y = y0, d = a;
    for (let i = 0; i < N; i++) { pts.push([x, y]); x += Math.cos(d) * 6; y += Math.sin(d) * 6; d += bend; }
    tubes.push({ id, pts, reach: core + 18, core: id === 11 ? undefined : core });
  }
  const joins = [{ x: tubes[0].pts[10][0], y: tubes[0].pts[10][1], reach: 20, k: 4, members: [0, 1] }];
  const b = binVeins(tubes, joins);
  const Q = new Set(), C = new Set();
  for (let k = 0; k < b.nBloodQ; k++) Q.add(`${b.bloodQ[k * 6]},${b.bloodQ[k * 6 + 1]}`);
  for (let k = 0; k < b.nBlood; k++) C.add(`${b.blood[k * 6]},${b.blood[k * 6 + 1]}`);
  const H = CELL / 2, key = (x, y) => `${Math.floor(x / H) * H},${Math.floor(y / H) * H}`;
  // (The grid starts on a multiple of CELL, so a quarter's cell is its origin floored to CELL, and a point's quarter to CELL / 2.)
  for (const q of Q) { const [x, y] = q.split(',').map(Number); assert.ok(C.has(`${Math.floor(x / CELL) * CELL},${Math.floor(y / CELL) * CELL}`), `quarter ${q} in a blood cell`); }
  // Points within each vessel's core of its centreline, densely along and across it, and round the join.
  for (const t of tubes) {
    const r = t.core ?? t.reach;
    for (let i = 0; i < N - 1; i++) {
      const [ax, ay] = t.pts[i], [bx, by] = t.pts[i + 1];
      for (let u = 0; u <= 1; u += 0.25) for (let v = -1; v <= 1; v += 0.125) {
        const L = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / L, ny = (bx - ax) / L;
        const px = ax + (bx - ax) * u + nx * v * r * 0.999, py = ay + (by - ay) * u + ny * v * r * 0.999;
        assert.ok(Q.has(key(px, py)), `vessel ${t.id} point ${px.toFixed(1)},${py.toFixed(1)} in a blood quarter`);
      }
    }
  }
  assert.ok(b.nBloodQ < b.nBlood * 4, 'tighter than the whole cells');
});
