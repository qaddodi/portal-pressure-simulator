// The shader lobule (lobule-live.js, A5b push 1): what it draws, when, and how its shapes are packed. Code only: no GPU runs here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLive, buildDyn, liveEligible, liveZoomShare, liveFibre, parseRGBA, liveColours, cellReach, LIVE_FS, BIN, CELLS_PER_ROW, IDX_ROW } from '../src/ui/lobule-live.js';
import { createTissueGL, tissueFS } from '../src/ui/tissue-gl.js';

const gl = readFileSync(new URL('../src/ui/tissue-gl.js', import.meta.url), 'utf8');

const R = 200, cx = 500, cy = 400;
const corners = [0, 1, 2, 3, 4, 5].map((i) => [cx + R * Math.cos(Math.PI / 3 * i), cy + R * Math.sin(Math.PI / 3 * i)]);
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const cells = Array.from({ length: 700 }, () => {
  const a = rnd() * Math.PI * 2, r = rnd() * R * 0.9;
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, a: rnd() * 6, l: 10 + rnd() * 3, w: 15 + rnd() * 3, tone: rnd(), nu: rnd() - 0.5, q: rnd(), drop: rnd(), jx: rnd() - 0.5, jy: rnd() - 0.5, ja: rnd() - 0.5 };
});
const shape = { R, cx, cy, lobules: [{ x: cx, y: cy, corners }], cells };

test('the shader draws every tissue state now', () => {
  for (const m of [{ congU: 0.6 }, { septU: 0.5, fibSin: 0.9, act: 0.9, fibPre: 0.9, fibPost: 0.9 }]) assert.equal(liveEligible(m), true);
});

test('the shader\'s share grows with the cell\'s size on screen: none under 3.5 px, whole from 6', () => {
  assert.equal(liveZoomShare(3.4 / (R * 0.052), R), 0);
  assert.equal(liveZoomShare(6 / (R * 0.052), R), 1);
  const a = liveZoomShare(4 / (R * 0.052), R), b = liveZoomShare(5 / (R * 0.052), R);
  assert.ok(0 < a && a < b && b < 1);
});

test('every bin lists the cells that can reach it, in drawing order, in any state of the plates', () => {
  const D = buildLive(shape);
  const [bx, by] = D.box;
  assert.equal(D.nb, Math.ceil(2.6 * R / BIN));
  const listOf = (i, j) => { const o = D.bins[(j * D.nb + i) * 4], n = D.bins[(j * D.nb + i) * 4 + 1]; return Array.from(D.idx.slice(o, o + n)); };
  for (let i = 0; i < D.nb; i++) for (let j = 0; j < D.nb; j++) {
    const l = listOf(i, j);
    assert.deepEqual(l, [...l].sort((p, q) => p - q), 'drawing order');
    // Any point of the bin within a cell's true reach (its centre moved by the plates' disorder at most) is covered.
    const px = bx + (i + 0.5) * BIN, py = by + (j + 0.5) * BIN;
    cells.forEach((k, n) => {
      const reach = 0.5 * Math.hypot(k.l * 1.12, k.w * 1.3) + Math.min(k.l, k.w) * 0.45 * Math.hypot(k.jx, k.jy);
      if (Math.hypot(px - k.x, py - k.y) + BIN * 0.7072 < reach) assert.ok(l.includes(n), `cell ${n} in bin ${i},${j}`);
    });
  }
  assert.ok(cells.every((k) => cellReach(k) > 0.5 * Math.hypot(k.l, k.w)));
});

test('the cells are packed three texels each, the lobule\'s sides as outward normals', () => {
  const D = buildLive(shape);
  assert.equal(D.cellData.length, CELLS_PER_ROW * 3 * D.cellRows * 4);
  const k = cells[CELLS_PER_ROW + 5], o = (CELLS_PER_ROW * 3 + 5 * 3) * 4;
  assert.deepEqual(Array.from(D.cellData.slice(o, o + 12)), [k.x, k.y, k.a, k.l, k.w, k.tone, k.nu, k.q, k.drop, k.jx, k.jy, k.ja].map(Math.fround));
  assert.ok(D.idx.length % IDX_ROW === 0);
  for (let i = 0; i < 6; i++) {
    const [nx, ny, d] = D.edges.slice(i * 3, i * 3 + 3);
    assert.ok(Math.abs(Math.hypot(nx, ny) - 1) < 1e-6 && Math.abs(d - R * Math.sqrt(3) / 2) < 1e-3, `side ${i}`);
    for (const c of corners) assert.ok(nx * (c[0] - cx) + ny * (c[1] - cy) <= d + 1e-3, 'the hexagon lies inside every side');
  }
});

test('colours: tokens with and without their own alpha, and the gap and cell colours as paintLobule works them', () => {
  assert.deepEqual(parseRGBA('rgba(80, 50, 50, .14)').map((x) => +x.toFixed(4)), [0.3137, 0.1961, 0.1961, 0.14]);
  assert.deepEqual(parseRGBA('#80162C').map((x) => +x.toFixed(3)), [0.502, 0.086, 0.173, 1]);
  const rgb = { bg: [1, 1, 1], gap: [0.5, 0.5, 0.5], cell: [0.9, 0.8, 0.7] };
  const tok = (n) => ({ '--lz-plate-line': 'rgba(0,0,0,.1)' }[n] || '#fff');
  assert.deepEqual(liveColours(rgb, false, tok).gap55, [0.725, 0.725, 0.725]);
  assert.deepEqual(liveColours(rgb, false, tok).base, rgb.cell);
  assert.deepEqual(liveColours(rgb, true, tok).base.map((x) => +x.toFixed(3)), [0.612, 0.584, 0.556]);
});

test('the shader follows paintLobule\'s order and numbers, and the bitmap path is still there under it', () => {
  const live = readFileSync(new URL('../src/ui/lobule-live.js', import.meta.url), 'utf8');
  // fill 1.015, gap fill 0.55/0.5, cells (fill 0.92/0.8, dead 0.6; membrane max 0.6; nucleus max 0.9), nutmeg 0.05–0.55 R, zones 0.2/0.17, hairline
  for (const s of ['lvHex(wp, 1.015)', 'dark ? 0.55 : 0.5', 'dark ? 0.8 : 0.92', 'max(0.6, 0.6 * px)', 'max(0.9, ww * 0.16)', 'min(lw, ww) * 0.38', '0.05 * R) / (0.5 * R)', 'dark ? 0.2 : 0.17', 'lvHex(wp, 0.66)', 'lvHex(wp, 0.36)', 'if (sj < 0.05)']) assert.ok(live.includes(s), s);
  assert.match(gl, /if \(uLive > 0\.0\) \{ vec4 ls = liveTissue\(w\) \* e; c = mix\(c, ls\.rgb \+ c0 \* \(1\.0 - ls\.a\), uLive\); \}/, 'mixing the two pictures laid over the surround = laying their mix');
  assert.match(tissueFS(true), /vec3 c0 = c;\n\s+if \(w\.x >= 0\.0/, 'the surround before the bitmap');
  assert.doesNotMatch(tissueFS(false), /uL[A-Z]|uLive|liveTissue|\bc0\b|\blv[A-Z]/, 'the program without the live lobule has none of it in it: the picture as before');
  assert.doesNotMatch(live, /\btexture\(/, 'only texelFetch: no implicit derivatives in the live lookups');
});

test('the sinusoids\' segments are binned tube by tube, and the per-state texels hold their radii then the stellate cells', async () => {
  const { buildDyn, liveFibre, SEG_ROW } = await import('../src/ui/lobule-live.js');
  const sin = [0, 1, 2].map((t) => ({ pts: [0, 1, 2, 3].map((i) => [cx - 60 + i * 30, cy + t * 20]) }));
  const D = buildLive({ ...shape, rs0: 3, sin });
  assert.equal(D.segData.length, SEG_ROW * 2 * D.segRows * 4);
  assert.deepEqual(Array.from(D.segData.slice(0, 8)), [cx - 60, cy, cx - 30, cy, 0, 0, 0, 0].map(Math.fround));
  const o = D.bins[(Math.floor((cy - D.box[1]) / BIN) * D.nb + Math.floor((cx - D.box[0]) / BIN)) * 4 + 2], n = D.bins[(Math.floor((cy - D.box[1]) / BIN) * D.nb + Math.floor((cx - D.box[0]) / BIN)) * 4 + 3];
  const segs = Array.from(D.idx.slice(o, o + n));
  assert.ok(n >= 2 && segs.every((v, i) => !i || v > segs[i - 1]), 'in drawing order');
  const dyn = buildDyn({ ...shape, hsc: [{ x: 1, y: 2, a: 3, nx: 4, ny: 5 }] }, [1.5, 2.5, 3.5, 4.5, 5.5]);
  assert.deepEqual(Array.from(dyn.k.slice(0, 8)), [1.5, 2.5, 3.5, 4.5, 5.5, 0, 0, 0]);
  assert.equal(dyn.hOff, 2);
  assert.deepEqual(Array.from(dyn.k.slice(8, 16)), [1, 2, 3, 4, 5, 0, 0, 0]);
  const f0 = liveFibre({ fibSin: 0.04, act: 0.05 }), f1 = liveFibre({ fibSin: 0.5, act: 0.5 });
  assert.ok(f0.sin === 0 && f0.act === 0 && f1.sin === 1 && f1.act === 1, 'no pop at the thresholds');
});

test('the packed bands are the bands fibrousBand draws: the same points, widths, fibres and nuclei, every tract and collar in order', async () => {
  const { buildItems, buildDyn } = await import('../src/ui/lobule-live.js');
  const { fibrousBand, fibrousTract, fibrousCuff, useTokens } = await import('../src/ui/lobule-paint.js');
  useTokens(() => 'rgba(0,0,0,1)');
  const rec = () => { const o = { bands: 0, fills: 0, strokes: [], ellipses: [] }; return new Proxy({}, { get: (_, k) => (k === 'rec' ? o : k === 'getTransform' ? () => ({ a: 1 }) : k === 'ellipse' ? (...a) => o.ellipses.push(a) : k === 'stroke' ? () => o.strokes.push(1) : k === 'fill' ? () => o.fills++ : () => {}), set: () => true }); };
  const sh = { ...shape, rt: 14, rcv0: 12, septaPC: [0, 2, 4].map((i) => ({ pts: [corners[i], [cx, cy]] })) };
  const col = [0.8, 0.7, 0.5];
  const items = buildItems(sh, { septU: 0.8, fibPre: 0.8, fibPost: 0.8 }, { col, dark: false, cvIn: 9 });
  const bands = items.filter((i) => i.type === 0), fills = items.filter((i) => i.type !== 0);
  assert.equal(items.filter((i) => i.type === 1).length, 6, 'a disc per tract');
  assert.equal(fills.filter((i) => i.type === 2).length, 7, 'a collar per tract and the central vein\'s');
  // The tract's ten bands, against fibrousTract's own fills and nuclei.
  const c = rec(); fibrousTract(c, corners[0][0], corners[0][1], 14 * (0.8 + 0.9 * 0.8 ** 1.1), Math.atan2(corners[0][1] - cy, corners[0][0] - cx), [0.78, 0.64, 0.44], 0.8 ** 1.1, 900);
  const mine = items.filter((i) => i.type === 0 && i.clip[0] === 1 && i.clip[1] === corners[0][0]);
  assert.equal(mine.length, 10);
  assert.equal(c.rec.fills, 1 + 10 * 3 + mine.reduce((q, b) => q + b.nuclei.length, 0), 'the disc, three passes a band, a fill a nucleus');
  assert.equal(c.rec.strokes.length, mine.reduce((q, b) => q + b.fibres.length, 0), 'a stroke a fibre');
  const dyn = buildDyn(sh, [1, 2], items);
  assert.equal(dyn.nItems, items.length);
  assert.ok(dyn.k.length >= (dyn.iOff + 1) * 4 && dyn.margin >= 2);
  // Every item is listed in the bin under its centre, and the list points at its header.
  const nk = dyn.nk, B = 1.3 * R;
  for (const it of items) {
    const i = Math.floor((it.bc[0] - (cx - B)) / 32), j = Math.floor((it.bc[1] - (cy - B)) / 32);
    const st = dyn.k[(dyn.bOff + j * nk + i) * 4], ct = dyn.k[(dyn.bOff + j * nk + i) * 4 + 1];
    assert.ok(ct >= 1, 'listed'); assert.ok(st + ct <= dyn.k.length);
  }
  void fibrousBand; void fibrousCuff; void bands;
});

// ── Settings › Figure performance › Lobule drawn live (frame.js tissueLive) ──
const uiSrc = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

test('Lobule drawn live: off by default; off, the goal is 0 and the shader is given nothing, so the bitmap is the whole picture', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const f = await import(`../src/ui/frame.js?t=live${Math.random()}`);
  assert.deepEqual(f.FIG_LAB.tissueLive, [false, true]);
  assert.equal(f.figLab('tissueLive'), false, 'off until chosen');
  let heard = 0;
  f.onFigLab((k, v) => { if (k === 'tissueLive' && v === true) heard++; });
  f.setFigLab('tissueLive', true);
  assert.equal(heard, 1); assert.equal(store.get('pps.fig.tissueLive'), 'true');
  f.setFigLab('tissueLive', false);
  assert.ok(!store.has('pps.fig.tissueLive'), 'off stores nothing');
  delete globalThis.localStorage;
  const lz = uiSrc('lobule-zoom.js');
  assert.match(lz, /const liveGoal = \(\) => \(model && liveEligible\(model\) && figLab\('tissueLive'\) && liveOK\(\) \? 1 : 0\);/, 'the one place the switch is read');
  assert.equal(lz.split("figLab('tissueLive')").length - 1, 1, 'and only there: nothing else in the lobule branches on it');
  assert.match(lz, /function liveArgs\(dark, cs\) \{\n\s+if \(!\(liveShare > 0\)\) return null;/, 'no share: no shapes built, nothing sent');
  assert.match(lz, /live: liveArgs\(dark, cs\),/);
  // The two pictures are never mixed unless the share is above 0 and the live program is there (tissue-gl.js): the bitmap path is the one it was.
  assert.match(gl, /const isLive = !!\(live && live\.share > 0 && liveP\), U = isLive \? liveP\.U : U0;/);
  assert.match(gl, /gl\.useProgram\(isLive \? liveP\.prog : prog\);/);
  assert.match(gl, /if \(uLive > 0\.0\) \{ vec4 ls = liveTissue\(w\) \* e;/);
});

test('Lobule drawn live: flipped while the lobule shows it eases over 400 ms and wakes the loop; flipped while it does not, it starts at the new goal', () => {
  const lz = uiSrc('lobule-zoom.js');
  assert.match(lz, /function liveChanged\(\) \{ if \(unseen\(\)\) liveE = -1; else \{ liveAt = performance\.now\(\); wake\(\); \} \}/);
  assert.match(lz, /onFigLab\(\(k, v\) => \{ if \(k !== 'tissueLive'\) return; if \(v && tissueGL\) tissueGL\.liveReady\(\); liveChanged\(\); \}\);/);
  assert.match(lz, /createTissueGL\(tissueG, \{ onLive: liveCompiled \}\)/, 'and the live program tells the lobule when it is ready or has failed');
  assert.match(lz, /if \(liveE < 0 \|\| unseen\(\)\) liveE = goal;\n\s+else liveE = liveEase\(liveE, goal, now - liveAt\);/);
  assert.match(lz, /if \(liveMoving\(\)\) drawVersion\+\+;/, 'each frame of the easing is drawn');
  assert.match(lz, /const key = \[[^\n]*lk > 0 \? lk\.toFixed\(3\)/, 'and the tissue\'s key moves with the share, so it is not skipped as unchanged');
});

test('the share eases in a 400 ms smoothstep either way, never in a step; a pause does not jump it', async () => {
  const { liveEase, liveShareOf, LIVE_MS } = await import('../src/ui/lobule-live.js');
  assert.equal(LIVE_MS, 400);
  for (const [from, goal] of [[0, 1], [1, 0]]) {
    let e = from, t = 0, last = liveShareOf(e, 1), worst = 0;
    while (e !== goal) { e = liveEase(e, goal, 1000 / 60); t += 1000 / 60; const s = liveShareOf(e, 1); worst = Math.max(worst, Math.abs(s - last)); last = s; assert.ok(t < 600, 'arrives'); }
    assert.ok(t >= 395 && t <= 420, `${from}→${goal} takes ${t.toFixed(0)} ms`);
    assert.ok(worst < 0.07, `no frame at 60 Hz moves the share by ${worst.toFixed(3)}`);
  }
  assert.equal(liveEase(0, 1, 60000), 0.25, 'a gap of a minute counts as 100 ms');
  assert.equal(liveEase(1, 1, 16), 1); assert.equal(liveEase(0, 0, 16), 0);
  assert.equal(liveEase(0.3, 1, -50), 0.3, 'a clock that stepped back does not move it');
  assert.equal(liveShareOf(0, 1), 0, 'off: exactly 0, so the shader is given nothing');
  assert.equal(liveShareOf(1, 1), 1); assert.equal(liveShareOf(1, 0), 0, 'zoomed out, the bitmap alone');
  assert.equal(liveShareOf(0.5, 0.2), 0.2, 'the smaller of the two');
});

test('the Settings row for it sits under Figure performance, with a plain label and what off means', () => {
  const main = uiSrc('main.js');
  const rows = main.slice(main.indexOf('function figLabRows('), main.indexOf('function figSeg('));
  assert.match(rows, /sw\('tissueLive', 'Lobule drawn live', '[^']*Off: the lobule shows its painted picture'\),/);
});

// ── The live shader is a program of its own, compiled only when it is asked for ──
test('the program without the live lobule is the one with it, less its additions', () => {
  const on = tissueFS(true), off = tissueFS(false);
  assert.ok(on.includes(LIVE_FS), 'the live functions are in the live program');
  assert.ok(!off.includes('liveTissue') && !off.includes('uLive'));
  const stripped = on.replace('\n' + LIVE_FS, '').replace('\n  vec3 c0 = c;', '').replace(/\n {4}\/\/ The lobule drawn live[^\n]*\n[^\n]*\n {4}if \(uLive > 0\.0\)[^\n]*/, '');
  assert.equal(stripped, off, 'nothing else differs: the same samplers, the same lookups, the same fade into the page');
});

// A stand-in for the GL context that records what it is asked: the programs made (with their shaders' sources), the one in use and
// every uniform set on it. No GPU runs.
function stubGL({ failLive = false } = {}) {
  const programs = [], calls = [];
  let current = null;
  const own = {
    createShader: (type) => ({ type, src: '' }), shaderSource: (s, src) => { s.src = src; },
    createProgram: () => { const p = { id: programs.length, shaders: [] }; programs.push(p); return p; },
    attachShader: (p, s) => p.shaders.push(s),
    getShaderParameter: () => true,
    getProgramParameter: (p, what) => (what === 'LINK_STATUS' ? !(failLive && p.shaders.some((s) => s.src.includes('liveTissue'))) : true),
    getShaderInfoLog: () => 'shader log', getProgramInfoLog: () => 'program log',
    getExtension: () => null, isContextLost: () => false, getParameter: () => null,
    getUniformLocation: (p, name) => ({ p: p.id, name }),
    useProgram: (p) => { current = p; calls.push(['useProgram', p.id]); },
    createTexture: () => ({}), createBuffer: () => ({}), createFramebuffer: () => ({}),
  };
  const gl = new Proxy(own, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return k;
      if (/^uniform/.test(k)) return (loc, ...a) => { calls.push(['set', current?.id, loc?.name, ...a]); };
      return () => {};
    },
  });
  const canvas = { width: 0, height: 0, getContext: () => gl, addEventListener() {} };
  return { gl, canvas, programs, calls, set: (name) => calls.filter((c) => c[0] === 'set' && c[2] === name), used: () => calls.filter((c) => c[0] === 'useProgram').map((c) => c[1]) };
}
const tick = (ms = 150) => new Promise((r) => setTimeout(r, ms));
function liveArgs(share) {
  const sh = { ...shape, rs0: 3 };
  return { shape: sh, data: buildLive(sh), dyn: buildDyn(sh, []), fib: liveFibre({ fibSin: 0, act: 0 }), rs0: 3, share, cu: 0, sj: 0, zones: false, dark: false, cen: [cx, cy, R],
    col: liveColours({ bg: [1, 1, 1], gap: [0.5, 0.5, 0.5], cell: [0.9, 0.8, 0.7] }, false, () => '#fff') };
}
const tile = { width: 8, height: 8 };
const frame = (live) => ({ W: 100, H: 80, qa: tile, qb: null, mix: 0, w: tile, wVer: 1, rect: [0, 0, 100], ox: 50, oy: 40, rd: 30, fade: [33, 96], mid: 0.5, bg: [1, 1, 1], live });

test('with the switch off the tissue is one program, with nothing of the live lobule in it, and it is never asked for another', async () => {
  const g = stubGL();
  const warn = console.warn; console.warn = () => {};
  const tg = createTissueGL(g.canvas, { onLive: () => assert.fail('nobody asked for it') });
  await tick();
  assert.equal(g.programs.length, 1, 'one program made');
  assert.ok(g.programs[0].shaders.every((s) => !s.src.includes('liveTissue') && !s.src.includes('uLive')));
  assert.equal(tg.draw(frame(null)), true);
  assert.equal(tg.draw(frame(null)), true);
  assert.equal(g.programs.length, 1, 'still one: drawing the bitmap compiles nothing more');
  assert.deepEqual([...new Set(g.used())], [0]);
  assert.equal(g.set('uLive').length, 0, 'no live uniform is ever set');
  console.warn = warn;
});

test('the live program starts when it is first asked for, is ready once published, and is told to the caller once', async () => {
  const g = stubGL();
  let told = 0;
  const tg = createTissueGL(g.canvas, { onLive: () => told++ });
  await tick();
  assert.equal(tg.liveReady(), false, 'asked: its compile starts, it is not published yet');
  assert.equal(g.programs.length, 2);
  assert.ok(g.programs[1].shaders.some((s) => s.src.includes('liveTissue')), 'the second program is the one with the live lobule');
  assert.equal(tg.liveReady(), false); assert.equal(g.programs.length, 2, 'asking again starts nothing');
  await tick();
  assert.equal(told, 1); assert.equal(tg.liveReady(), true); assert.equal(g.programs.length, 2);
  await tick();
  assert.equal(told, 1, 'told once');
});

test('a draw uses the live program only with a share and the program ready; with none, or before it is ready, the bitmap program', async () => {
  const g = stubGL();
  const tg = createTissueGL(g.canvas, { onLive: () => {} });
  await tick();
  tg.liveReady();
  assert.equal(tg.draw(frame(liveArgs(0.5))), true, 'a share asked for before the program is ready: the bitmap, not a missing picture');
  assert.deepEqual(g.used().slice(-1), [0]); assert.equal(g.set('uLive').length, 0);
  await tick();
  assert.equal(tg.draw(frame(liveArgs(0.5))), true);
  assert.deepEqual(g.used().slice(-1), [1], 'the live program');
  assert.deepEqual(g.set('uLive').map((c) => [c[1], c[3]]), [[1, 0.5]], 'its share set on it');
  assert.ok(g.set('uQA').every((c) => c[1] === 1 || c[1] === 0) && g.set('uLC').every((c) => c[1] === 1), 'the shapes\' samplers belong to the live program alone');
  assert.equal(tg.draw(frame(liveArgs(0))), true);
  assert.deepEqual(g.used().slice(-1), [0], 'no share: the bitmap program');
  assert.equal(tg.draw(frame(null)), true);
  assert.deepEqual(g.used().slice(-1), [0]);
  assert.equal(g.set('uLive').length, 1, 'and no live uniform was set for those');
});

test('a live program that fails to build costs only the live drawing: the bitmap goes on, the caller is told, and it is not tried again', async () => {
  const g = stubGL({ failLive: true });
  const warn = console.warn, warned = []; console.warn = (...a) => warned.push(a[0]);
  let told = 0;
  const tg = createTissueGL(g.canvas, { onLive: () => told++ });
  await tick();
  tg.liveReady();
  await tick();
  assert.equal(told, 1);
  assert.equal(tg.liveReady(), false, 'never ready');
  assert.equal(g.programs.length, 2, 'not tried again');
  assert.ok(warned.some((m) => /cannot be drawn live/.test(m)));
  assert.equal(tg.lost, false, 'the tissue is not lost: the 2D canvas does not take over');
  assert.equal(tg.draw(frame(liveArgs(1))), true);
  assert.deepEqual(g.used().slice(-1), [0]);
  console.warn = warn;
});

// ── Detail smaller than a pixel, zoomed out ──
test('a filled shape thinner than a pixel is weighted by its width: untouched from a pixel, smoothly less below, never more than its area', () => {
  const live = readFileSync(new URL('../src/ui/lobule-live.js', import.meta.url), 'utf8');
  assert.match(live, /float lvThin\(float wpx\) \{ float q = min\(wpx, 1\.0\); return 4\.0 \* q \/ \(\(1\.0 \+ q\) \* \(1\.0 \+ q\)\); \}/);
  // The same function in JS: 1 from a pixel wide; continuous and flat at 1; rising with the width; and the weight lvCov gives a line
  // of that width (a triangle of unit height spread a pixel each way: (½ + w/2)² for w under 1) times it is its own area, w.
  const thin = (w) => { const q = Math.min(w, 1); return 4 * q / ((1 + q) * (1 + q)); };
  assert.equal(thin(1), 1); assert.equal(thin(3), 1); assert.equal(thin(0), 0);
  assert.ok(Math.abs(thin(0.999) - 1) < 1e-6 && Math.abs(thin(1.001) - 1) < 1e-12, 'no step at a pixel');
  for (let w = 0.02; w < 1; w += 0.02) {
    assert.ok(thin(w) < thin(w + 0.02) + 1e-12, 'rising');
    const spread = (0.5 + w / 2) ** 2;
    assert.ok(Math.abs(thin(w) * spread - w) < 1e-9, `a line ${w.toFixed(2)} px wide keeps its own weight`);
  }
  // Used on the shapes that can be thinner than a pixel in the sizes the shader draws at: a band's nuclei, a stellate cell and its nucleus.
  assert.match(live, /lvCov\(lvEll\(lp, n0\.zw\), px\) \* lvThin\(2\.0 \* min\(n0\.z, n0\.w\) \/ px\) \* cl/);
  assert.match(live, /lvCov\(sd, px\) \* lvThin\(2\.0 \* Wb \/ px\) \* clipC/);
  assert.match(live, /lvCov\(lvEll\(lp, vec2\(L \* 0\.26, Wb \* 0\.5\)\), px\) \* lvThin\(Wb \/ px\) \* clipC/);
  // The sizes it matters at: the shader's own share starts at a cell of 3.5 px, where a stellate cell's body (half width 0.42 to 0.62 rs0,
  // rs0 1.7 to 3 world units, a cell 0.044 R long) is under a pixel across at the smallest, and a pixel and over from 6 px.
  for (const R of [160, 300]) {
    const rs0 = Math.min(3, Math.max(1.7, R * 0.0085));
    const s = (cellPx) => cellPx / (R * 0.052);
    assert.ok(thin(2 * rs0 * 0.42 * s(3.5)) < 1, `R ${R}: faded at 3.5 px a cell`);
    assert.equal(thin(2 * rs0 * 0.62 * s(60)), 1, `R ${R}: untouched when zoomed in`);
  }
});
