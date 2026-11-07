// The lobule's tissue picture is recorded as shapes and painted by the GPU (paint-gl.js), not painted on a 2D canvas or in a
// worker (1 Nov, the off-GPU gate). The same painting code (lobule-paint.js) runs against the recorder from the same values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
const TOKEN_VALUES = { '--lz-plate-line': 'rgba(120, 90, 70, 0.35)', '--lz-nutmeg': '#7a2f2a', '--lz-shade': '#3a2a20' };
globalThis.getComputedStyle = () => ({ getPropertyValue: (n) => TOKEN_VALUES[n] || '#102030' });

const paint = await import('../src/ui/lobule-paint.js');
const { PaintRecorder, recordPaint, gpuPicture, isGpuPicture } = await import('../src/ui/paint-gl.js');
const { parseCssColor, cssColor, cssColor8 } = await import('../src/ui/css-color.js');
const { cssAlpha, cssVar } = await import('../src/ui/util.js');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const lz = read('../src/ui/lobule-zoom.js'), lp = read('../src/ui/lobule-paint.js');
const fn = (head) => { const i = lz.indexOf(head); assert.ok(i >= 0, head); return lz.slice(i, lz.indexOf('\n  }\n', i)); };

// A lobule's painting values, as lobule-zoom.js worldInput gives them (a made-up shape, every disease drawn).
function input(m, { dark = false, zonesOn = true } = {}) {
  let q = 5; const r = () => { q = (q * 1664525 + 1013904223) >>> 0; return q / 4294967296; };
  const R = 300, cx = 400, cy = 380, corners = Array.from({ length: 6 }, (_, i) => [cx + R * Math.cos(i * Math.PI / 3), cy + R * Math.sin(i * Math.PI / 3)]);
  const line = (a, b) => Array.from({ length: 64 }, (_, i) => [a[0] + (b[0] - a[0]) * i / 63, a[1] + (b[1] - a[1]) * i / 63]);
  return {
    m, dark, zonesOn,
    G: {
      R, cx, cy, rt: R * 0.1, rs0: 2.5, rcv0: R * 0.07, lobules: [{ x: cx, y: cy, corners }],
      cells: Array.from({ length: 200 }, () => ({ x: cx + (r() - 0.5) * R, y: cy + (r() - 0.5) * R, a: r() * 6, l: 8, w: 5, tone: r(), nu: r() - 0.5, q: r(), drop: r(), jx: r() - 0.5, jy: r() - 0.5, ja: r() - 0.5 })),
      hsc: Array.from({ length: 12 }, () => ({ x: cx + (r() - 0.5) * R, y: cy, a: r() * 6, nx: 0.6, ny: 0.8 })),
      septaPC: [0, 2, 4].map((i) => ({ pts: line(corners[i], [cx, cy]) })),
    },
    rgb: { bg: [0.98, 0.97, 0.95], gap: [0.75, 0.56, 0.5], cell: [0.88, 0.69, 0.63], col: [0.81, 0.7, 0.51], dis: [0.94, 0.89, 0.81] },
    sin: m.fibSin > 0.05 ? [{ pts: line([cx, cy], [cx + 200, cy]), r: 1.9 }, { pts: line([cx, cy], [cx, cy + 200]), r: 2.2 }] : [],
    cvIn: m.fibPost > 0.05 ? 21 : 0,
  };
}
const HEALTHY = { congU: 0, septU: 0, fibSin: 0, act: 0, fibPre: 0, fibPost: 0 };
const SICK = { congU: 0.9, septU: 0.95, fibSin: 1, act: 1, fibPre: 1, fibPost: 1 };
const MID = { congU: 0.3, septU: 0.4, fibSin: 0.5, act: 0.6, fibPre: 0.5, fibPost: 0.4 };
const tokens = () => paint.useTokens(paint.tokenReader(Object.fromEntries(paint.TOKENS.map((n, i) => [n, [`#0${i}0${i}0${i}`, [i, 2 * i, 3 * i]]]))));

test('CSS colours are read as the browser reads them, without a canvas', () => {
  const near = (a, b) => { assert.equal(a.length, b.length); a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 2e-3, `${a} vs ${b}`)); };
  near(parseCssColor('#f80'), [1, 0x88 / 255, 0, 1]);
  near(parseCssColor('#11223380'), [0x11 / 255, 0x22 / 255, 0x33 / 255, 0x80 / 255]);
  near(parseCssColor('rgba(120, 90, 70, 0.35)'), [120 / 255, 90 / 255, 70 / 255, 0.35]);
  near(parseCssColor('rgb(10 20 30 / 50%)'), [10 / 255, 20 / 255, 30 / 255, 0.5]);
  near(parseCssColor('hsl(120 100% 25%)'), [0, 0.5, 0, 1]);
  near(parseCssColor('rebeccapurple'), [0x66 / 255, 0x33 / 255, 0x99 / 255, 1]);
  near(parseCssColor('transparent'), [0, 0, 0, 0]);
  near(parseCssColor('color-mix(in srgb, #f00 25%, #00f)'), [0.25, 0, 0.75, 1]);
  near(parseCssColor('color-mix(in oklab, red, white)'), [1, 0.6314, 0.5695, 1]);
  near(parseCssColor('oklch(62.8% 0.2577 29.23)'), [1, 0, 0, 1]);
  assert.equal(parseCssColor('not a colour'), null);
  assert.deepEqual(cssColor('nonsense'), [0, 0, 0, 1], 'what a canvas keeps for a colour it cannot read: black');
  assert.ok(cssColor8('#7a2f2a').every((v) => Math.abs(v * 255 - Math.round(v * 255)) < 1e-9), 'whole 8-bit steps, as getImageData gave them');
});

test('the recorder keeps shapes in device px: plain fills batched, the rest stencilled, clips with them', () => {
  const rec = recordPaint(100, 50, (c) => {
    c.scale(2, 2); c.fillStyle = '#ff0000'; c.fillRect(1, 2, 3, 4);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(10, 0); c.lineTo(0, 10); c.lineTo(10, 10); c.closePath(); c.fill('evenodd');
    c.save(); c.beginPath(); c.rect(0, 0, 5, 5); c.clip(); c.strokeStyle = 'rgba(0,0,255,0.5)'; c.lineWidth = 0.25; c.beginPath(); c.moveTo(0, 0); c.lineTo(9, 9); c.stroke(); c.restore();
  });
  assert.equal(rec.width, 100); assert.equal(rec.height, 50);
  assert.deepEqual(rec.ops.map((o) => o.k), ['direct', 'fill', 'stroke']);
  assert.deepEqual([...rec.cv.slice(0, 6)], [2, 4, 1, 0, 0, 1], 'the rect\'s first corner, scaled, in red');
  assert.equal(rec.ops[1].rule, 'evenodd');
  assert.equal(rec.ops[2].clip.length, 1, 'the stroke is cut to its clip');
  assert.equal(rec.ops[2].paint.rgba[3].toFixed(3), (0.5 * 0.5).toFixed(3), 'a hairline: 1 px wide at alpha × width');
  assert.throws(() => new PaintRecorder(1, 1).drawImage(), /not recorded/, 'no pixel copies');
  const pic = gpuPicture(rec, 7);
  assert.ok(isGpuPicture(pic)); assert.equal(pic.ver, 7); assert.equal(pic.width, 100);
  assert.ok(!isGpuPicture({ width: 1, height: 1 }));
});

test('the lobule\'s world records the very same picture from a copy of its values, every disease, light and dark', () => {
  tokens();
  for (const m of [HEALTHY, MID, SICK]) for (const dark of [false, true]) for (const zonesOn of [false, true]) {
    const P = input(m, { dark, zonesOn });
    const a = recordPaint(1200, 1200, (c) => paint.paintWorldInto(c, 1200, 1.5, 10, 20, P));
    const b = recordPaint(1200, 1200, (c) => paint.paintWorldInto(c, 1200, 1.5, 10, 20, structuredClone(P)));
    assert.ok(a.ops.length >= 3 && a.cv.length + a.pv.length > 6000, `${a.ops.length} ops, ${a.cv.length + a.pv.length} numbers`);
    assert.deepEqual(b.ops, a.ops);
    assert.deepEqual(b.cv, a.cv); assert.deepEqual(b.pv, a.pv);
    assert.ok(a.cv.every(Number.isFinite) && a.pv.every(Number.isFinite), 'no NaN reaches the GPU');
  }
});

test('the tokens the painting reads are every token named, read as util.js reads them', () => {
  const T = Object.fromEntries(paint.TOKENS.map((n) => [n, [cssVar(n), [1, 2, 3]]]));
  paint.useTokens(paint.tokenReader(T));
  for (const m of [HEALTHY, MID, SICK]) for (const zonesOn of [false, true]) paint.paintLobule(new PaintRecorder(800, 800), input(m, { zonesOn }));
  const named = new Set([...lp.matchAll(/tk\('(--[a-z0-9-]+)'/g)].map((x) => x[1]));
  for (const n of named) assert.ok(paint.TOKENS.includes(n), n);
  assert.match(lp, /ZONE_TOK = \['--lz-zone-1', '--lz-zone-2', '--lz-zone-3'\]/);
  for (const i of [1, 2, 3]) assert.ok(paint.TOKENS.includes(`--lz-zone-${i}`));
  const rd = paint.tokenReader(Object.fromEntries(paint.TOKENS.map((n) => [n, [cssVar(n), [0.1, 0.2, 0.3]]])));
  for (const n of paint.TOKENS) assert.equal(rd(n), cssVar(n));
  assert.throws(() => paint.tokenReader({})('--lz-shade', 0.3), /not sent/);
  void cssAlpha;
});

test('the view hands the painting every model value it reads, and records it for the GPU (no 2D canvas, no worker)', () => {
  const wi = fn('function worldInput(');
  for (const k of new Set([...lp.matchAll(/\bm\.([a-zA-Z]+)/g)].map((x) => x[1]))) assert.match(wi, new RegExp(`\\b${k}: m\\.${k}\\b`), `m.${k}`);
  const shape = fn('function worldShape(G) {');
  for (const k of new Set([...lp.slice(lp.indexOf('export function paintLobule(')).matchAll(/\bk\.([a-z]+)/g)].map((x) => x[1]))) assert.match(shape, new RegExp(`\\b${k}: k\\.${k}\\b`), `cell or stellate cell .${k}`);
  for (const k of ['R', 'cx', 'cy', 'rt', 'rs0', 'rcv0']) assert.match(shape, new RegExp(`\\b${k}: G\\.${k}\\b`), `G.${k}`);
  assert.match(lz, /const pwPicture = \(\) => gpuPicture\(recordPaint\(pwN, pwN, pwRecord\), \+\+texVer\);/);
  assert.match(lz, /const pwRecord = \(w\) => paintWorldInto\(w, pwN, pwSc, pwBx, pwBy, pwP\);/);
  for (const f of ['function paintWorld(', 'function paintTissue(', 'function spareMake(', 'function resSwap(', 'function paintAhead(']) assert.doesNotMatch(fn(f), /getContext|drawImage|getImageData/, `${f} paints on no 2D canvas`);
  assert.doesNotMatch(lz, /tissue-worker|createTissueWorker/);
  assert.match(read('../src/ui/tissue-gl.js'), /if \(isGpuPicture\(cv\)\) \{[\s\S]{0,200}paintGL\(gl\)\.paint\(cv\.rec\)/, 'the shader paints the record into its texture');
});

test('a fill or stroke colour set as numbers (setFillRGBA, setStrokeRGBA) records the colour its rgba() text names, with no text made', () => {
  let q = 9; const r = () => { q = (q * 1664525 + 1013904223) >>> 0; return q / 4294967296; };
  for (let i = 0; i < 300; i++) {
    const R = Math.floor(r() * 256), G = Math.floor(r() * 256), B = Math.floor(r() * 256), A = i % 5 ? r() : 1;
    for (const [num, text] of [['setFillRGBA', 'fillStyle'], ['setStrokeRGBA', 'strokeStyle']]) {
      const a = new PaintRecorder(100, 100), b = new PaintRecorder(100, 100);
      a[text] = `rgba(${R},${G},${B},${A})`; b[num](R, G, B, A);
      const paint = text === 'fillStyle' ? (c) => { c.beginPath(); c.rect(10, 10, 30, 30); c.fill(); } : (c) => { c.lineWidth = 3; c.beginPath(); c.moveTo(10, 10); c.lineTo(60, 40); c.stroke(); };
      paint(a); paint(b);
      assert.equal(a.cvn, b.cvn);   // (the recorder keeps its numbers in a pooled buffer, the first cvn of them)
      for (let k = 0; k < a.cvn; k++) assert.ok(Math.abs(a.cvb[k] - b.cvb[k]) <= 1e-12 * Math.abs(a.cvb[k]) + 1e-300, `${num} ${R},${G},${B},${A} at ${k}`);
    }
  }
  const c = new PaintRecorder(10, 10); c.setFillRGBA(255, 0, 0, 1); c.save(); c.setFillRGBA(0, 0, 255, 1); c.restore(); c.beginPath(); c.rect(0, 0, 5, 5); c.fill();
  assert.ok(c.cvb[2] === 1 && c.cvb[4] === 0, 'a restore brings back the colour set before the save');
});
