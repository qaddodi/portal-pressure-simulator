// The shader lobule (lobule-live.js, A5b push 1): what it draws, when, and how its shapes are packed. Code only: no GPU runs here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLive, liveEligible, liveZoomShare, parseRGBA, liveColours, cellReach, BIN, CELLS_PER_ROW, IDX_ROW } from '../src/ui/lobule-live.js';

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
  assert.match(gl, /vec3 c0 = c;\n\s+if \(w\.x >= 0\.0/, 'the surround before the bitmap');
  assert.match(gl, /\} else gl\.uniform1f\(U\.uLive, 0\);/, 'no share, no live lookups: the picture as before');
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
