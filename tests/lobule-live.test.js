// The shader lobule (lobule-live.js, A5b push 1): what it draws, when, and how its shapes are packed. Code only: no GPU runs here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLive, buildDyn, liveEligible, liveZoomShare, liveFibre, parseRGBA, liveColours, cellReach, LIVE_FS, BIN, CELLS_PER_ROW, IDX_ROW, PAN_TOL, panShift, panPlan } from '../src/ui/lobule-live.js';
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

// ── The lobule is drawn live wherever it can be: no setting (Mohammad, 31 Oct: "Lobule always live no switch needed") ──
const uiSrc = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

test('the lobule is drawn live with no setting: nothing reads a switch for it, the goal is live whenever the state allows it and the shader is ready', async () => {
  const f = await import(`../src/ui/frame.js?t=live${Math.random()}`);
  assert.ok(!('tissueLive' in f.FIG_LAB), 'no Figure performance setting');
  for (const file of ['frame.js', 'main.js', 'lobule-zoom.js', 'tissue-gl.js', 'stage.js']) assert.ok(!/tissueLive/.test(uiSrc(file)), `${file}: no switch`);
  assert.ok(!uiSrc('main.js').includes('Lobule drawn live'), 'and no Settings row');
  const lz = uiSrc('lobule-zoom.js');
  assert.match(lz, /const liveGoal = \(\) => \(model && liveEligible\(model\) && liveOK\(\) \? 1 : 0\);/, 'the one place the goal is set');
  assert.ok(!/onFigLab/.test(lz), 'and nothing listens for a setting');
  assert.match(lz, /function liveArgs\(dark, cs\) \{\n\s+if \(!\(liveShare > 0\)\) return null;/, 'no share: no shapes built, nothing sent');
  assert.match(lz, /live: liveArgs\(dark, cs\),/);
  // The two pictures are never mixed unless the share is above 0 and the live program is there (tissue-gl.js): the bitmap path is the one it was.
  assert.match(gl, /const isLive = !!\(live && live\.share > 0 && liveP\), U = isLive \? liveP\.U : U0;/);
  assert.match(gl, /gl\.useProgram\(isLive \? liveP\.prog : prog\);/);
  assert.match(gl, /if \(uLive > 0\.0\) \{ vec4 ls = liveTissue\(w\) \* e;/);
});

test('the live program starts compiling as soon as the tissue\'s GPU drawing is made; when it arrives, or fails, while the lobule shows, the share eases over 400 ms and the loop wakes; unseen, it starts at the goal', () => {
  const lz = uiSrc('lobule-zoom.js');
  assert.match(lz, /tissueGL = createTissueGL\(tissueG, \{ onLive: liveCompiled \}\); if \(!tissueGL\) tissueG\.remove\(\); else tissueGL\.liveReady\(\);/, 'asked at once, ahead of the first look');
  assert.match(lz, /function liveChanged\(\) \{ if \(unseen\(\)\) liveE = -1; else \{ liveAt = performance\.now\(\); wake\(\); \} \}/);
  assert.match(lz, /function liveCompiled\(\) \{ liveChanged\(\); \}/);
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

// ── The live shader is a program of its own, started by liveReady() ──
test('the program without the live lobule is the one with it, less its additions', () => {
  const on = tissueFS(true), off = tissueFS(false);
  assert.ok(on.includes(LIVE_FS), 'the live functions are in the live program');
  assert.ok(!off.includes('liveTissue') && !off.includes('uLive'));
  const stripped = on.replace('\n' + LIVE_FS, '').replace('\n  vec3 c0 = c;', '').replace(/\n {4}\/\/ The lobule drawn live[^\n]*\n[^\n]*\n {4}if \(uLive > 0\.0\)[^\n]*/, '');
  assert.equal(stripped, off, 'nothing else differs: the same samplers, the same lookups, the same fade into the page');
});

// A stand-in for the GL context that records what it is asked: the programs made (with their shaders' sources), the one in use and
// every uniform set on it. No GPU runs.
function stubGL({ failLive = false, badFbo = false, shortBuffer = false } = {}) {
  const programs = [], calls = [];
  let current = null, nfb = 0;
  const bound = { read: null, draw: null, scissor: false, rect: null };
  const canvas = { width: 0, height: 0, getContext: () => gl, addEventListener() {} };
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
    createTexture: () => ({}), createBuffer: () => ({}), createFramebuffer: () => ({ fb: ++nfb }),
    // (The kept picture, tissue-gl.js: the targets made and given back, what is bound where, the copies and the draws, and under which scissor.)
    deleteFramebuffer: (f) => calls.push(['deleteFramebuffer', f.fb]),
    checkFramebufferStatus: () => (badFbo ? 'FRAMEBUFFER_INCOMPLETE_ATTACHMENT' : 'FRAMEBUFFER_COMPLETE'),
    bindFramebuffer: (target, f) => {
      if (target !== 'DRAW_FRAMEBUFFER') bound.read = f;
      if (target !== 'READ_FRAMEBUFFER') bound.draw = f;
    },
    blitFramebuffer: (...a) => calls.push(['blit', bound.read ? bound.read.fb : 0, bound.draw ? bound.draw.fb : 0, bound.scissor, a.slice(0, 8), a[9]]),
    enable: (c) => { if (c === 'SCISSOR_TEST') bound.scissor = true; },
    disable: (c) => { if (c === 'SCISSOR_TEST') bound.scissor = false; },
    scissor: (...a) => { bound.rect = a; },
    drawArrays: () => calls.push(['draw', bound.draw ? bound.draw.fb : 0, bound.scissor ? bound.rect : null]),
  };
  Object.defineProperty(own, 'drawingBufferWidth', { get: () => canvas.width - (shortBuffer ? 1 : 0) });
  Object.defineProperty(own, 'drawingBufferHeight', { get: () => canvas.height });
  const gl = new Proxy(own, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return k;
      if (/^uniform/.test(k)) return (loc, ...a) => { calls.push(['set', current?.id, loc?.name, ...a]); };
      return () => {};
    },
  });
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

test('until the live program is asked for the tissue is one program with nothing of the live lobule in it, and drawing the bitmap asks for no other', async () => {
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
  assert.equal(g.set('uLive').length, 0, 'no live uniform is set');
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

// ── The kept picture: a pan of whole device px is the last frame moved, with only the strips it uncovers drawn ──
test('panShift: a whole number of px both ways, the centre and the bitmap corner moving together; anything else is null', () => {
  const ref = [40.25, 30.5, 3.75, -2.5];
  const to = (dx, dy, cx = dx, cy = dy) => [ref[0] + dx, ref[1] + dy, ref[2] + cx, ref[3] + cy];
  assert.deepEqual(panShift(ref, to(0, 0)), [0, 0]);
  assert.deepEqual(panShift(ref, to(7, -3)), [7, -3]);
  assert.deepEqual(panShift(ref, to(-250, 90)), [-250, 90]);
  assert.deepEqual(panShift(ref, to(3 + 2e-13, -1 - 3e-13)), [3, -1], 'the rounding of the sums that make a drag of whole CSS px');
  for (const [dx, dy] of [[0.5, 0], [0, 0.5], [3.25, 1], [3, 1.001], [2.9995, 0], [1e-3, 0]]) assert.equal(panShift(ref, to(dx, dy)), null, `${dx}, ${dy}`);
  assert.equal(panShift(ref, to(4, 4, 5, 4)), null, 'the bitmap moved more than the centre');
  assert.equal(panShift(ref, to(4, 4, 4, 3)), null, 'and less');
  assert.equal(panShift(ref, to(4, 4, 4 + 5 * PAN_TOL, 4)), null, 'by more than the tolerance');
  assert.deepEqual(panShift(ref, to(4, 4, 4 + 0.5 * PAN_TOL, 4)), [4, 4], 'by less');
  assert.equal(panShift(ref, [NaN, 30.5, 3.75, -2.5]), null);
  assert.equal(panShift(ref, [Infinity, 30.5, Infinity, -2.5]), null);
  assert.ok(PAN_TOL <= 1e-4, 'under what the shader\'s float32 can tell apart at a thousand px');
});

test('panPlan: the copied overlap and the strips tile the canvas exactly, once each, for every whole-pixel pan', () => {
  const W = 13, H = 9;
  for (let dx = -14; dx <= 14; dx++) for (let dy = -10; dy <= 10; dy++) {
    const plan = panPlan(W, H, dx, dy);
    if (Math.abs(dx) >= W || Math.abs(dy) >= H) { assert.equal(plan, null, `${dx}, ${dy}: no overlap, drawn whole`); continue; }
    const cover = Array.from({ length: H }, () => new Array(W).fill(0));
    const mark = ([x, y, w, h]) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { assert.ok(i >= 0 && i < W && j >= 0 && j < H, `${dx}, ${dy}: inside the canvas`); cover[j][i]++; } };
    mark(plan.dst); plan.strips.forEach(mark);
    assert.ok(cover.every((r) => r.every((n) => n === 1)), `${dx}, ${dy}: every pixel once`);
    assert.deepEqual(plan.src.slice(2), plan.dst.slice(2), 'the copy is not scaled');
    // GL rows count from the bottom, the shader's p.y from the top: a pan down by dy is a copy up by -dy rows, and the other way round.
    assert.equal(plan.dst[0] - plan.src[0], dx); assert.equal(plan.dst[1] - plan.src[1] + 0, -dy + 0);
    assert.ok(plan.src[0] >= 0 && plan.src[1] >= 0 && plan.src[0] + plan.src[2] <= W && plan.src[1] + plan.src[3] <= H, 'read from inside the kept picture');
  }
  // One worked case: right 3, up 2 (dy -2): the picture moves 3 columns right and 2 GL rows up; the new strips are the left 3 columns and the bottom 2 rows.
  assert.deepEqual(panPlan(100, 80, 3, -2), { src: [0, 0, 97, 78], dst: [3, 2, 97, 78], strips: [[0, 0, 3, 80], [3, 0, 97, 2]] });
  assert.deepEqual(panPlan(100, 80, -4, 5), { src: [4, 5, 96, 75], dst: [0, 0, 96, 75], strips: [[96, 0, 4, 80], [0, 75, 96, 5]] });
  assert.deepEqual(panPlan(100, 80, 0, 0).strips, []);
});

// A stand-in for the shader: what a pixel shows is a function of where it lies against the lobule's centre (pos[0], pos[1]) and the
// bitmap's corner (pos[2], pos[3]), in the shader's own coordinates (p.y down from the top, pixel centres at +0.5; GL rows from the bottom).
const shadeAt = (W, H, x, yg, pos) => {
  const px = x + 0.5, py = H - (yg + 0.5), a = px - pos[0], b = py - pos[1], c = px - pos[2], d = py - pos[3];
  return Math.sin(a * 0.37) + Math.cos(b * 0.91) * c * 0.01 + Math.sin(d * 1.3 + a * 0.1) + Math.hypot(a, b) * 0.003;
};
const direct = (W, H, pos) => Array.from({ length: H }, (_, yg) => Array.from({ length: W }, (_, x) => shadeAt(W, H, x, yg, pos)));
// What drawLive does: the overlap copied across, the strips drawn with the current position.
function moved(W, H, img, d, pos) {
  const plan = panPlan(W, H, d[0], d[1]);
  if (!plan) return null;
  const out = Array.from({ length: H }, () => new Array(W).fill(NaN));
  const [sx, sy, sw, sh] = plan.src, [tx, ty] = plan.dst;
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) out[ty + j][tx + i] = img[sy + j][sx + i];
  for (const [x, y, w, h] of plan.strips) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) out[j][i] = shadeAt(W, H, i, j, pos);
  return out;
}
const worst = (a, b) => Math.max(...a.map((row, j) => Math.max(...row.map((v, i) => Math.abs(v - b[j][i])))));

test('the last frame moved by a whole-pixel pan, with the uncovered strips drawn, is the frame drawn from scratch', () => {
  const W = 37, H = 29, ref = [17.25, 11.5, 4.75, -3.5], img = direct(W, H, ref);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [3, -2], [-5, 4], [36, 28], [-36, -28], [20, 0], [0, -27], [35, 1]]) {
    const pos = [ref[0] + dx, ref[1] + dy, ref[2] + dx, ref[3] + dy];
    const got = moved(W, H, img, panShift(ref, pos), pos);
    assert.ok(got.every((r) => r.every((v) => v === v)), `${dx}, ${dy}: every pixel is set`);
    assert.ok(worst(got, direct(W, H, pos)) < 1e-9, `${dx}, ${dy}: the same picture`);
  }
  // Wrong the other way round (a flipped y) would show here: the same pan with the sign of dy turned.
  const pos = [ref[0] + 3, ref[1] - 2, ref[2] + 3, ref[3] - 2], flipped = moved(W, H, img, [3, 2], pos);
  assert.ok(worst(flipped, direct(W, H, pos)) > 0.01, 'the check can tell');
});

test('a long drag keeps the picture it started from: the reference moves in whole steps, so nothing builds up, and a glide that drifts is drawn whole', () => {
  const W = 41, H = 31, start = [20.3, 15.7, 2.1, 1.9];
  let ref = start.slice(), img = direct(W, H, ref), x = 0, y = 0, steps = 0;
  seed = 11;
  for (let k = 0; k < 400; k++) {
    x += Math.round((rnd() - 0.5) * 8); y += Math.round((rnd() - 0.5) * 8);
    const e = () => (rnd() - 0.5) * 8e-5;   // (the rounding noise of a position: well under the tolerance)
    const pos = [start[0] + x + e(), start[1] + y + e(), start[2] + x + e(), start[3] + y + e()];
    const d = panShift(ref, pos);
    assert.ok(d, `step ${k}: still a whole-pixel pan from the reference`);
    if (!panPlan(W, H, d[0], d[1])) { img = direct(W, H, pos); ref = pos.slice(); continue; }
    img = moved(W, H, img, d, pos);
    ref = [ref[0] + d[0], ref[1] + d[1], ref[2] + d[0], ref[3] + d[1]];
    steps++;
    assert.ok(worst(img, direct(W, H, pos)) < 1e-3, `step ${k}: as drawn from scratch`);
  }
  assert.ok(steps > 300, 'and most of the steps used the kept picture');
  // A glide of 1.00004 px a frame: the error against the reference grows 0.00004 a frame, so the third frame is drawn whole and the reference restarts there.
  let r = [0, 0, 0, 0]; const whole = [];
  for (let k = 1; k <= 8; k++) {
    const pos = [k * 1.00004, 0, k * 1.00004, 0], d = panShift(r, pos);
    if (!d) { whole.push(k); r = pos; } else r = [r[0] + d[0], r[1] + d[1], r[2] + d[0], r[3] + d[1]];
  }
  assert.deepEqual(whole, [3, 6], 'the kept picture is never used while it would be off by more than the tolerance');
});

// The same on the real tissue-gl.js against the stub context: what it asks of the GPU.
async function liveGL(opts) {
  const g = stubGL(opts);
  const tg = createTissueGL(g.canvas, { onLive: () => {} });
  await tick(); tg.liveReady(); await tick();
  assert.equal(tg.liveReady(), true);
  return { g, tg, L: liveArgs(0.5) };
}
const at = (L, dx = 0, dy = 0, extra = {}) => ({ ...frame(L), ox: 50 + dx, oy: 40 + dy, rect: [dx, dy, 100], ...extra });
// What the last draw did, in order: copies [from, to, rect], draws [target, scissor], deleted targets. (Target 0 is the canvas.)
const took = (g) => { const c = g.calls.filter(([k]) => k === 'blit' || k === 'draw' || k === 'deleteFramebuffer'); g.calls.length = 0; return c; };
const FULL = [0, 0, 100, 80, 0, 0, 100, 80];

test('the first live frame is drawn whole into a target of its own, then copied to the canvas', async () => {
  const { g, tg, L } = await liveGL();
  g.calls.length = 0;
  assert.equal(tg.draw(at(L)), true);
  const c = took(g), A = c[0][1];
  assert.notEqual(A, 0, 'not straight to the canvas');
  assert.deepEqual(c, [['draw', A, null], ['blit', A, 0, false, FULL, 'NEAREST']], 'drawn without a scissor, copied pixel for pixel (no filtering) over the whole canvas');
  assert.deepEqual(tg.kept, { full: 1, shifted: 0, still: 0 });
});

test('a pan of whole device px copies the last frame across and draws only the strips it uncovers, scissored', async () => {
  const { g, tg, L } = await liveGL();
  tg.draw(at(L)); g.calls.length = 0;
  assert.equal(tg.draw(at(L, 3, -2)), true);
  let c = took(g);
  const A = c[0][1], B = c[0][2];
  assert.ok(A !== 0 && B !== 0 && A !== B, 'from one target into the other');
  assert.deepEqual(c, [
    ['blit', A, B, false, [0, 0, 97, 78, 3, 2, 100, 80], 'NEAREST'],
    ['draw', B, [0, 0, 3, 80]], ['draw', B, [3, 0, 97, 2]],
    ['blit', B, 0, false, FULL, 'NEAREST'],
  ], 'the overlap, the two strips under a scissor, the whole to the canvas (scissor off for the copy)');
  assert.deepEqual(tg.kept, { full: 1, shifted: 1, still: 0 });
  // The next pan starts from that one, back into the first target; the reference moved by the whole step, not to the new position.
  assert.equal(tg.draw(at(L, 7, -3)), true);
  c = took(g);
  assert.deepEqual(c, [
    ['blit', B, A, false, [0, 0, 96, 79, 4, 1, 100, 80], 'NEAREST'],
    ['draw', A, [0, 0, 4, 80]], ['draw', A, [4, 0, 96, 1]],
    ['blit', A, 0, false, FULL, 'NEAREST'],
  ]);
  // And back across the start (a pan left and down): still whole steps from the same reference.
  assert.equal(tg.draw(at(L, -6, 9)), true);
  c = took(g);
  assert.deepEqual(c.map((e) => e[0]), ['blit', 'draw', 'draw', 'blit']);
  assert.ok(c.filter((e) => e[0] === 'draw').every((e) => e[2]), 'only scissored draws');
  assert.deepEqual(tg.kept, { full: 1, shifted: 3, still: 0 });
});

test('a pan that is not whole device px, or moves the centre and the bitmap apart, is drawn whole; the next whole pan then starts from it', async () => {
  const { g, tg, L } = await liveGL();
  tg.draw(at(L)); g.calls.length = 0;
  for (const frameAt of [at(L, 0.5, 0), at(L, 3, 0.25), at(L, 5, 0, { rect: [4, 0, 100] }), at(L, 5, 2, { rect: [5, 3, 100] })]) {
    tg.draw(at(L, 40, 40)); g.calls.length = 0;   // (a far-off reference each time)
    tg.draw(frameAt);
    const c = took(g);
    assert.equal(c.filter((e) => e[0] === 'draw').length, 1, 'one draw');
    assert.equal(c.find((e) => e[0] === 'draw')[2], null, 'no scissor: the whole frame');
  }
  tg.draw(at(L, 0.5, 0)); g.calls.length = 0;
  tg.draw(at(L, 2.5, 0));
  assert.deepEqual(took(g).map((e) => e[0]), ['blit', 'draw', 'blit'], 'two whole px from the fractional frame');
});

test('nothing moved: the kept frame is copied again with no draw; anything else changed: drawn whole', async () => {
  const { g, tg, L } = await liveGL();
  tg.draw(at(L)); g.calls.length = 0;
  tg.draw(at(L));
  const c = took(g), A = c[0][1];
  assert.deepEqual(c, [['blit', A, 0, false, FULL, 'NEAREST']]);
  assert.deepEqual(tg.kept, { full: 1, shifted: 0, still: 1 });
  const changes = {
    'the share': { live: { ...L, share: 0.6 } }, 'the colour grade': { grey: [0.5, 0.8] }, 'the page colour': { bg: [0.9, 1, 1] }, 'the fade': { fade: [33, 90] },
    'the radius': { rd: 31 }, 'the bitmap': { wVer: 2 }, 'the mid': { mid: 0.6 }, 'the blend': { qb: tile, mix: 0.4 }, 'the bitmap\'s box': { rect: [0, 0, 101] },
    'the lobule\'s colours': { live: { ...L, col: liveColours({ bg: [1, 1, 1], gap: [0.4, 0.5, 0.5], cell: [0.9, 0.8, 0.7] }, false, () => '#fff') } },
    'the state of the tissue': { live: { ...L, cu: 0.3 } }, 'the shapes': { live: { ...L, dyn: { ...L.dyn } } },
  };
  for (const [what, extra] of Object.entries(changes)) {
    tg.draw(at(L)); g.calls.length = 0;
    tg.draw(at(L, 0, 0, extra));
    const c2 = took(g);
    assert.equal(c2.filter((e) => e[0] === 'draw').length, 1, `${what}: drawn`);
    assert.equal(c2.find((e) => e[0] === 'draw')[2], null, `${what}: whole`);
  }
});

test('a pan past the canvas, or a canvas of another size, is drawn whole into fresh targets', async () => {
  const { g, tg, L } = await liveGL();
  tg.draw(at(L)); g.calls.length = 0;
  tg.draw(at(L, 100, 0));
  let c = took(g);
  assert.deepEqual(c.map((e) => e[0]), ['draw', 'blit'], 'nothing left to copy');
  assert.equal(c[0][2], null);
  tg.draw(at(L, 0, -80)); took(g);
  tg.draw({ ...at(L), W: 120 });
  c = took(g);
  assert.ok(c.some((e) => e[0] === 'deleteFramebuffer'), 'the targets of the old size given back');
  const d = c.find((e) => e[0] === 'draw');
  assert.equal(d[2], null); assert.notEqual(d[1], 0);
  assert.deepEqual(c.at(-1), ['blit', d[1], 0, false, [0, 0, 120, 80, 0, 0, 120, 80], 'NEAREST']);
});

test('a frame of the bitmap program gives the kept targets back and draws straight to the canvas, as ever', async () => {
  const { g, tg, L } = await liveGL();
  tg.draw(at(L)); tg.draw(at(L, 2, 0)); g.calls.length = 0;
  tg.draw(frame(null));
  const c = took(g);
  assert.equal(c.filter((e) => e[0] === 'deleteFramebuffer').length, 2, 'both targets');
  assert.deepEqual(c.filter((e) => e[0] !== 'deleteFramebuffer'), [['draw', 0, null]]);
  tg.draw(at(L, 1, 0));
  assert.equal(took(g).find((e) => e[0] === 'draw')[2], null, 'a live frame after it starts again, whole');
  assert.deepEqual(tg.kept, { full: 2, shifted: 1, still: 0 });
});

test('the targets are given back with the canvas, and kept for it otherwise', async () => {
  const { g, tg, L } = await liveGL();
  tg.draw(at(L)); tg.draw(at(L, 1, 0)); g.calls.length = 0;
  tg.sweep();
  assert.equal(took(g).filter((e) => e[0] === 'deleteFramebuffer').length, 0, 'the canvas is in use');
  g.canvas.width = 0;
  tg.sweep();
  assert.equal(took(g).filter((e) => e[0] === 'deleteFramebuffer').length, 2);
  g.canvas.width = 100;
  tg.draw(at(L, 1, 0));
  assert.equal(took(g).find((e) => e[0] === 'draw')[2], null, 'drawn whole afterwards');
});

test('no kept picture where it cannot be exact: ?tissuekeep=0, a drawing buffer of another size, a target the GPU cannot complete', async () => {
  const straight = (c) => c.length && c.every((e) => e[0] === 'draw' && e[1] === 0 && e[2] === null);
  const had = Object.getOwnPropertyDescriptor(globalThis, 'location');
  globalThis.location = { search: '?x=1&tissuekeep=0' };
  let off;
  try { off = await liveGL(); } finally { if (had) Object.defineProperty(globalThis, 'location', had); else delete globalThis.location; }
  off.g.calls.length = 0;
  off.tg.draw(at(off.L)); off.tg.draw(at(off.L, 3, 0)); off.tg.draw(at(off.L, 3, 0));
  assert.ok(straight(took(off.g)) && took(off.g).length === 0, 'every frame straight to the canvas');
  assert.deepEqual(off.tg.kept, { full: 0, shifted: 0, still: 0 });
  assert.ok(!off.g.calls.some((e) => e[0] === 'blit'));
  for (const opts of [{ shortBuffer: true }, { badFbo: true }]) {
    const { g, tg, L } = await liveGL(opts);
    g.calls.length = 0;
    tg.draw(at(L)); const first = took(g);
    tg.draw(at(L, 3, 0)); tg.draw(at(L, 3, 0)); const rest = took(g);
    assert.ok(straight(first.filter((e) => e[0] !== 'deleteFramebuffer')), `${JSON.stringify(opts)}: straight to the canvas`);
    assert.ok(straight(rest) && rest.length === 2, `${JSON.stringify(opts)}: and it does not try again`);
    assert.deepEqual(tg.kept, { full: 0, shifted: 0, still: 0 });
  }
});

// ── The bitmaps the shader covers (31 Oct, his proxy: "drop the painted bitmaps wherever the live path covers them") ──
test('the bitmap is out of the GPU\'s picture exactly when the share is 1: the share is 1 only with the shader fully eased in and the zoom whole, and the shader then mixes the bitmap out', async () => {
  const { liveShareOf, liveZoomShare } = await import('../src/ui/lobule-live.js');
  for (const e of [0, 0.2, 0.5, 0.999, 1]) for (const z of [0, 0.3, 0.999, 1]) {
    const s = liveShareOf(e, z);
    assert.equal(s >= 1, e >= 1 && z >= 1, `eased ${e}, zoom ${z}: share ${s}`);
  }
  assert.equal(liveZoomShare(6 / (R * 0.052), R), 1, 'whole from a cell of 6 px');
  assert.match(gl, /c = mix\(c, ls\.rgb \+ c0 \* \(1\.0 - ls\.a\), uLive\);/, 'at 1 the bitmap\'s part of the picture is multiplied by 0');
});

test('with the shader covering the picture the bitmap is not painted ahead, not repainted at each step of a gesture, and does not crossfade; everything else about it is as it was', () => {
  const lz = uiSrc('lobule-zoom.js');
  assert.match(lz, /const bitmapUnseen = \(\) => liveShare >= 1 && tissueOnGL && offPage\(\);/, 'the share is 1, the last frame was the GPU\'s, and the worker can paint');
  // The painted-ahead copy: none, and one made earlier is given back; a job for one that lands later is dropped.
  const sm = lz.slice(lz.indexOf('function spareMake() {'), lz.indexOf('\n  }\n', lz.indexOf('function spareMake() {')));
  assert.match(sm, /if \(bitmapUnseen\(\)\) \{\n[^\n]*\n\s+if \(spare \|\| spareCv\.width\) \{ free\(spareCv\); spare = null; \}\n\s+\} else if \(sc > worldSc \* 1\.01 && /);
  assert.match(sm, /const tone = shadeOf\(stageBg\(cs, dark\), dark\), \{ a, b \} = fieldBlend\(/, 'the surround\'s tiles for that zoom are still prepared: they are seen');
  assert.match(lz, /const jobLive = \(j\) => j\.gen === jobGen && j\.G === geo && \(j\.kind === 'spare' \? !bitmapUnseen\(\) : j\.seq === worldSeq\);/);
  // A gesture's zoom holds the bitmap at the sharpness it has; the GPU's frame needs no sharper. Once the hand lets go it is painted at the zoom's own.
  assert.match(lz, /if \(held && kept && \(!gpu \|\| sc <= worldSc \|\| bitmapUnseen\(\)\)\) \{ if \(hand && sc !== worldSc\) holdSoon\(\); sc = worldSc; \}/);
  // No crossfade into a bitmap nobody sees, in the page's paint and in the worker's landing; the 2D canvas (gpu false) keeps its crossfade.
  assert.match(lz, /!unseen\(\) && !\(gpu && liveShare >= 1\) && worldGeo === G && worldCv\.width && !\(xfT0 && now - xfT0 < XF_MS\)\) \{ \[worldOld, worldCv\]/);
  assert.match(lz, /!unseen\(\) && !\(tissueOnGL && liveShare >= 1\) && worldGeo === j\.G && worldCv\.width && !\(xfT0 && now - xfT0 < XF_MS\)\) \{ free\(worldOld\);/);
  // What stays, and why: the 2D canvas path asks for the bitmap at the zoom's own sharpness whatever the shader does, because the dive's and the rise's
  // copies (paint2D, and buildWide's tiles) are made from it, and a bitmap that is not there is painted on the page, which is what the worker took off it.
  const pt = lz.slice(lz.indexOf('function paintTissue('), lz.indexOf('\n  }\n', lz.indexOf('function paintTissue(')));
  assert.match(pt, /let sc = Math\.min\(2 \*\* \(Math\.ceil\(Math\.log2\(Math\.max\(0\.05, dpr \* V\.k\)\) \* 2\) \/ 2\), worldCap\(G, dpr\)\);/, 'the scale is the zoom\'s own, shader or not');
  assert.match(lz, /paintTissue\(W, H, Math\.min\(saver\(\) \? 1 : 2, devicePixelRatio \|\| 1\) \* lzScale\(\), isDark\(\), styles\(\), !g, null\);/, 'paint2D: gpu false');
  assert.match(lz, /tissueKey = ''; paintTissue\(w, hh, dpr, dark, cs, flat\);/, 'buildWide: tiles painted through the 2D path');
});
