// The blood's speed-ups of 26 Oct (review/blood-shading-ideas): the composite draws the same picture as before them with less
// work a lumen pixel, and is the only composite (the classic one and its ?blood=classic went, 2 Nov). Source patterns (no GL in
// node), checked on the shader text as the GPU sees it: the #if blocks resolved for each build.
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

const mod = await import('../src/ui/veins-gl.js');
const { COMP_FS } = mod;

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
const builds = { full: COMP_FS(false), plain: COMP_FS(true) };
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

test('there is no classic build: no switch to it, and no build lays every layer under a lumen', () => {
  for (const k of Object.keys(R)) assert.doesNotMatch(R[k], /const bool under = true;|\bFAST\b/);
  assert.doesNotMatch(glSrc, /blood=classic|CLASSIC/);
  assert.equal(COMP_FS.length, 0, 'the build takes no switch (plain is its only, defaulted, argument)');
});

test('every build draws the streaks alone, at every zoom: no bead look anywhere, not even as a setting (Mohammad, 31 Oct)', () => {
  for (const k of Object.keys(R)) {
    assert.doesNotMatch(R[k], /\blook\b/);
    assert.doesNotMatch(R[k], /beadField|\bbw\b|chevZoom/);
    // (the bead's stagnant-blood noise went with it)
    assert.doesNotMatch(R[k], /1 << 20/);
  }
  assert.equal(mod.lookOf, undefined);
  // The app asks for the streaks (main.js forces them; the lobule defaults to them).
  assert.match(readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8'), /blood\.look = 'shimmer';/);
  assert.match(readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8'), /blood\.look = b\.look \|\| 'shimmer'/);
});

test('the composite tests the arrowheads\' cut-outs only where a head is', () => {
  const main = body(R.full, 'void main()');
  const chev = body(main, 'if (chev == 1 && chevQuad == 0 && f1.z > 0.0) {');
  const gate = body(chev, 'if (c.x + c.y > 0.0) {');
  assert.ok(gate.includes('noChev[i]') && gate.includes('chevHole[i]'), 'both cut-outs inside the test');
  // ...and the drawing still waits on the head surviving them.
  const after = chev.slice(chev.indexOf(gate) + gate.length);
  assert.ok(body(after, 'if (c.x + c.y > 0.0) {').includes('chevInk'));
});

// ── Item 5: the zoom's numbers once per vertex, and the vessel's own values read once for the streaks and the arrowheads ──
const glSrc = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const zoomVS = glSrc.slice(glSrc.indexOf('const ZOOM_VS = `'), glSrc.indexOf('}`;', glSrc.indexOf('const ZOOM_VS = `')));

test('the vertex shaders work out the zoom\'s numbers (once per vertex, none per pixel)', () => {
  for (const e of [
    'max(2.6, 5.0 * pxW)',
    'clamp(log2(max(pxW, 1e-4) * 8.0 / SLOT), -1.0, 3.0)',
    'smoothstep(-0.2, 0.2, lx) + smoothstep(0.8, 1.2, lx)',
    'min(floor(li), 1.0), lf = li - lb',
    'SLOT * exp2(lb), sB = SLOT * exp2(lb + 1.0)',
  ]) assert.ok(zoomVS.includes(e), `vertex: ${e}`);
  assert.ok(zoomVS.includes('cellA = 5.12 * sA, cellB = 5.12 * sB'));
  assert.ok(zoomVS.includes('smoothstep(1.2 * pxW, 2.0 * pxW, cellA * 0.5), smoothstep(1.2 * pxW, 2.0 * pxW, cellB * 0.5), mix(sA, sB, lf)'));
  // Both vertex shaders hand them on; the composite takes them flat and works none of them out again.
  assert.equal((glSrc.match(/\$\{ZOOM_VS\}/g) || []).length, 2);
  assert.equal((glSrc.match(/zoomOut\(\);/g) || []).length, 2);
  for (const k of Object.keys(R)) {
    assert.match(R[k], /flat in vec4 zoomA;/);
    assert.doesNotMatch(body(R[k], 'vec4 bloodAt('), /log2\(|exp2\(|max\(2\.6, 5\.0 \* pxW\)/);
  }
});

test('the streaks and the arrowheads share one read of the vessel\'s flow, length, caliber and colour', () => {
  for (const k of Object.keys(R)) {
    const main = body(R[k], 'void main()');
    assert.equal((main.match(/texelFetch\(flow, ivec2\(0, id1\), 0\)/g) || []).length, 1, `${k}: flow texel 0 once`);
    assert.equal((main.match(/texelFetch\(flow, ivec2\(1, id1\), 0\)/g) || []).length, 1, `${k}: flow texel 1 once`);
    assert.match(main, /if \(blood == 1 && f1\.z > 0\.0\) \{/);
    assert.match(main, /if \(chev == 1 && chevQuad == 0 && f1\.z > 0\.0\) \{/);   // (chevQuad: the heads drawn by their own quads, blood-heads.js)
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
  for (const k of Object.keys(R)) assert.match(body(R[k], 'void main()'), /uvec4 g2 = two \? \(inL \? texelFetch\(gbuf2, lp, 0\) : uvec4\(0u\)\) : uvec4\(0u\);/);
});

// ── Item 7: lumens whose vessels did not change are left as drawn in the blood's own pass ──
test('the blood pass leaves a lumen alone only when neither of its vessels\' rows nor any uniform changed', () => {
  const main = body(R.full, 'void main()');
  assert.match(main, /if \(bloodOnly == 1 && stillOn == 1 && texelFetch\(flow, ivec2\(7, int\(g\.x\) - 1\), 0\)\.x == 0\.0\n\s*&& \(!two \|\| texelFetch\(flow, ivec2\(7, int\(\(inL \? texelFetch\(gbuf2, lp, 0\) : uvec4\(0u\)\)\.x & 2047u\) - 1\), 0\)\.x == 0\.0\)\) discard;/);
  const comp = glSrc.slice(glSrc.indexOf('    composite(look, blood = NOBLOOD, full = false, part = 0) {'), glSrc.indexOf('    /** Whether organ outlines can be drawn here'));
  // Never in a whole picture, a bleed (the one uniform left out of the comparison, the clock, moves it), or before every row has
  // been seen.
  assert.match(comp, /let same = !!stillSig && sn === stillN && sn < sigNow\.length;/);
  assert.match(comp, /for \(let i = 0; same && i < sn; i\+\+\) if \(sigNow\[i\] !== stillSig\[i\]\) same = false;/);
  assert.match(comp, /const still = !full && !movedAll && !bl\.length && same;/);
  // The comparison takes every uniform the composite sets but the clock (and the bleed's, which it refuses), and the textures' version.
  const sig = comp.slice(comp.indexOf('sn = 0;'), comp.indexOf('let same'));
  for (const x of ['sg(m)', 'pm', 'plate?.alpha', 'plate?.sat', 'plates[0]?.rect', 'plates[1]?.rect', 'fluidRect', 'fl?.s', 'fl.ink', 'fl?.lv',
    'blood.on', 'blood.chev', 'blood.still', 'blood.alpha', 'blood.streakA', 'blood.chevA', 'blood.originA', 'blood.chevInk', 'blood.chevLight', 'blood.vdpr',
    'blood.origin', 'dyeAny', 'originColOf', 'blood.dyeCol', 'blood.revCol', 'blood.inkLight', 'blood.inkDark', 'ncv', 'ncN', 'hb', 'hr', 'hoN',
    'blood.streakLen', 'blood.bt', 'layer', 'glow', 'warm', 'useStack', 'bare', 'texVer', 'halfOn', 'quads', 'map.a', 'map.dot', 'map.zone', 'map.fx', 'map.alt', 'map.fxX', 'map.rot']) assert.ok(sig.includes(x), x);
  const uniforms = [...comp.matchAll(/UC\.\w+\(U\.(\w+)/g)].map((m) => m[1]);
  for (const u of uniforms) assert.ok(['world', 'size', 'cell', 'inv', 'H', 'pxW', 'plates', 'plateAlpha', 'plateSat', 'plateRect0', 'plateRect1', 'fluidRect', 'fluidS', 'fluidInk', 'fluidLv',
    'blood', 'chev', 'chevQuad', 'still', 'flowA', 'blendA', 'chevInk', 'chevLight', 'cssPx', 'origin', 'dyeOn', 'clock', 'bT', 'rows', 'originCol', 'dyeCol', 'revCol', 'inkLight', 'inkDark',
    'bleedE', 'bleedB', 'bleedN', 'noChev', 'noChevN', 'chevHole', 'chevHoleR', 'chevHoleN', 'lenOn', 'bloodOnly', 'stillOn', 'halfOn', 'halfR', 'mapA', 'mapDot', 'mapZone', 'mapFx', 'mapAlt', 'mapFxX', 'mapRot'].includes(u), `uniform ${u} is accounted for`);
  // The rows and this picture's uniforms are taken as the last picture's only once it is drawn.
  assert.ok(comp.indexOf('moved.fill(0); movedAll = false;') > comp.indexOf('UC.i1(U.bloodOnly, 1);'));
  // Every setter of a vessel's row marks it; a new binning or flow table marks them all; a new texture under the lumens bumps texVer.
  const api = glSrc.slice(glSrc.indexOf('  const api = {'));
  assert.match(api, /setTubes\(data\) \{\n\s*figVer\+\+;\n\s*tubesNew = true;\n\s*markRows\(data, tubeNow, ROW_W\);/);
  assert.match(api, /setBend\(row, pts\) \{[\s\S]*?if \(same\) return;[\s\S]*?figVer\+\+;\n\s*moved\[row\] = 1;\n\s*gl\.bindTexture\(gl\.TEXTURE_2D, bendTex\);/);
  assert.match(api, /radRows\.add\(row\); moved\[row\] = 1;/);
  assert.match(api, /markRows\(data, flowSent, stride\);\n\s*const span = changedRows/);
  assert.match(api, /if \(dyeSent\) \{\n\s*markRows\(data, dyeSent, DYE_BINS\);/);
  // (setGeometry, patchGeometry and setMorphFrame: a frame of the change between the views writes every vessel's points, stage.js morphFrame.)
  assert.equal((api.match(/fboOK = false; movedAll = true;/g) || []).length, 3);
  assert.ok(body(api, 'setMorphFrame(data) {').includes('fboOK = false; movedAll = true;'));
  for (const f of ['paintOrgans(shapes, rect, k) {', 'setFluidSpans(halfWidths, rect) {', 'setFluidLiver(bottoms) {', 'dropPlate(slot) {', 'commit(slot, names) {']) assert.ok(body(api, f).includes('texVer++'), f);
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
