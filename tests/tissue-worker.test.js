// The lobule's tissue bitmap painted in a worker (performance review A5a, 31 Oct): painting it on the page held the page for as long
// as it took, up to 3600 px square (the 2.8 s step into the lobule after a new patient, the 60 to 80 ms pinch repaints). The same
// code paints it there (lobule-paint.js), from the same values, and the page lays its tiles a few a frame.
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
const { createTissueWorker } = await import('../src/ui/tissue-worker.js');
const { cssAlpha, cssVar, cssRGB } = await import('../src/ui/util.js');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const lz = read('../src/ui/lobule-zoom.js'), lp = read('../src/ui/lobule-paint.js'), wk = read('../src/ui/tissue-paint-worker.js');
const fn = (head) => { const i = lz.indexOf(head); assert.ok(i >= 0, head); return lz.slice(i, lz.indexOf('\n  }\n', i)); };

// A context that records every call and every property set, so two paintings can be compared call for call.
function recorder() {
  const log = [], props = {}, tr = { a: 2 };
  const c = new Proxy(props, {
    get(_, p) {
      if (p === 'getTransform') return () => tr;
      if (p === 'createRadialGradient' || p === 'createLinearGradient') return (...a) => { log.push([p, ...a]); return { addColorStop: (...s) => log.push(['stop', ...s]) }; };
      if (p in props) return props[p];
      return (...a) => { log.push([p, ...a]); };
    },
    set(_, p, v) { props[p] = v; log.push(['=' + String(p), typeof v === 'object' ? 'gradient' : v]); return true; },
  });
  return { c, log };
}
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

test('the worker paints from a copy of the values (as a message carries them) the very same calls as the page', () => {
  paint.useTokens(paint.tokenReader(Object.fromEntries(paint.TOKENS.map((n, i) => [n, [`#0${i}0${i}0${i}`, [i, 2 * i, 3 * i]]]))));
  for (const m of [HEALTHY, MID, SICK]) for (const dark of [false, true]) for (const zonesOn of [false, true]) {
    const P = input(m, { dark, zonesOn }), a = recorder(), b = recorder();
    paint.paintWorldInto(a.c, 1200, 1.5, 10, 20, P);
    paint.paintWorldInto(b.c, 1200, 1.5, 10, 20, structuredClone(P));
    assert.ok(a.log.length > 100);
    assert.deepEqual(b.log, a.log);
  }
});

test('the tokens the worker is sent are every token the painting reads, as the same strings as the page reads them', () => {
  // Every branch painted with a reader that knows only TOKENS: a token read but not sent would throw.
  const T = Object.fromEntries(paint.TOKENS.map((n) => [n, [cssVar(n), [1, 2, 3]]]));
  paint.useTokens(paint.tokenReader(T));
  for (const m of [HEALTHY, MID, SICK]) for (const zonesOn of [false, true]) paint.paintLobule(recorder().c, input(m, { zonesOn }));
  // And by name in the code (a token read through a template, the zones, counted by its prefix).
  const named = new Set([...lp.matchAll(/tk\('(--[a-z0-9-]+)'/g)].map((x) => x[1]));
  for (const n of named) assert.ok(paint.TOKENS.includes(n), n);
  assert.match(lp, /tk\(`--lz-zone-\$\{i \+ 1\}`/);
  for (const i of [1, 2, 3]) assert.ok(paint.TOKENS.includes(`--lz-zone-${i}`));
  // The reader's strings are util.js's, from the values the page sends (tissue-worker.js): the plain value, or rgba(r,g,b,a) with
  // the alpha as given.
  const rd = paint.tokenReader(Object.fromEntries(paint.TOKENS.map((n) => [n, [cssVar(n), cssRGB(n)]])));
  for (const n of paint.TOKENS) {
    assert.equal(rd(n), cssVar(n));
    for (const al of [0.45, '0.320', 0]) assert.equal(rd(n, al), cssAlpha(n, al), `${n} ${al}`);
  }
  assert.match(read('../src/ui/tissue-worker.js'), /const tokens = Object\.fromEntries\(TOKENS\.map\(\(k\) => \[k, \[cssVar\(k\), cssRGB\(k\)\]\]\)\);/);
  assert.throws(() => paint.tokenReader({})('--lz-shade', 0.3), /not sent/);
});

test('the view hands the painting every model value it reads, and the lobule\'s shape as plain numbers', () => {
  const wi = fn('function worldInput(');
  for (const k of new Set([...lp.matchAll(/\bm\.([a-zA-Z]+)/g)].map((x) => x[1]))) assert.match(wi, new RegExp(`\\b${k}: m\\.${k}\\b`), `m.${k}`);
  const shape = fn('function worldShape(G) {');
  for (const k of new Set([...lp.slice(lp.indexOf('export function paintLobule(')).matchAll(/\bk\.([a-z]+)/g)].map((x) => x[1]))) assert.match(shape, new RegExp(`\\b${k}: k\\.${k}\\b`), `cell or stellate cell .${k}`);
  for (const k of ['R', 'cx', 'cy', 'rt', 'rs0', 'rcv0']) assert.match(shape, new RegExp(`\\b${k}: G\\.${k}\\b`), `G.${k}`);
  assert.match(wi, /sin: m\.fibSin > 0\.05 \? G\.tubes\.filter\(\(t\) => t\.kind\[0\] === 's'\)\.map\(\(t\) => \(\{ pts: t\.pts, r: radiusAt\(t, N >> 1\) \}\)\) : \[\]/, 'the sinusoids\' calibers as the painting read them');
  assert.match(wi, /cvIn: m\.fibPost > 0\.05 \? radiusAt\(G\.cv, 0\) : 0/);
  assert.match(fn('function paintWorld('), /paintWorldInto\(cv\.getContext\('2d'\), n, sc, bx, by, worldInput\(m, G, dark, cs\)\);/, 'the page paints with the same values');
});

test('the worker cuts the bitmap into 512 px tiles, sent as premultiplied ImageBitmaps it gives away', async () => {
  const posted = [];
  const was = { self: globalThis.self, OffscreenCanvas: globalThis.OffscreenCanvas, createImageBitmap: globalThis.createImageBitmap, OC2D: globalThis.OffscreenCanvasRenderingContext2D };
  globalThis.self = { postMessage: (m, t) => posted.push([m, t]) };
  globalThis.OffscreenCanvasRenderingContext2D = class { roundRect() {} ellipse() {} };
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return recorder().c; } };
  globalThis.createImageBitmap = async (cv, x, y, w, h, o) => ({ x, y, width: w, height: h, o, close() {} });
  try {
    await import(`../src/ui/tissue-paint-worker.js?t=${Date.now()}`);
    self.onmessage({ data: { type: 'hello' } });
    assert.deepEqual(posted.shift()[0], { type: 'hello', feats: { roundRect: true, ellipse: true } });
    const P = input(MID), { G, ...rest } = P;
    self.onmessage({ data: { type: 'shape', id: 3, shape: G } });
    await self.onmessage({ data: { type: 'paint', id: 7, shape: 3, n: 1100, sc: 1.4, bx: 0, by: 0, P: rest, tokens: Object.fromEntries(paint.TOKENS.map((n) => [n, ['#000', [0, 0, 0]]])) } });
    const [m, transfer] = posted.shift();
    assert.equal(m.id, 7);
    assert.equal(m.tiles.length, 9, '3 × 3 tiles for 1100 px');
    assert.deepEqual(m.tiles.map((t) => [t.x, t.y, t.bmp.width, t.bmp.height]).slice(0, 3), [[0, 0, 512, 512], [512, 0, 512, 512], [1024, 0, 76, 512]]);
    assert.ok(m.tiles.every((t) => t.bmp.o.premultiplyAlpha === 'premultiply'));
    assert.deepEqual(transfer, m.tiles.map((t) => t.bmp), 'moved, not copied');
    // A job for a shape it does not hold paints nothing and says so.
    await self.onmessage({ data: { type: 'paint', id: 8, shape: 4, n: 100, sc: 1, bx: 0, by: 0, P: rest, tokens: {} } });
    assert.deepEqual(posted.shift()[0], { type: 'paint', id: 8, tiles: null });
  } finally { Object.assign(globalThis, { self: was.self, OffscreenCanvas: was.OffscreenCanvas, createImageBitmap: was.createImageBitmap, OffscreenCanvasRenderingContext2D: was.OC2D }); }
  assert.match(wk, /import \{ paintWorldInto, useTokens, tokenReader \} from '\.\/lobule-paint\.js/, 'the same painting as the page');
});

// A fake worker, answering as the real one does.
function fakeWorker({ feats = { roundRect: true, ellipse: true }, answer = 'tiles' } = {}) {
  const sent = [];
  const w = {
    sent, terminated: false,
    postMessage(m) {
      sent.push(m);
      queueMicrotask(() => {
        if (m.type === 'hello') w.onmessage({ data: { type: 'hello', feats } });
        if (m.type === 'paint' && answer !== 'none') w.onmessage({ data: { type: 'paint', id: m.id, tiles: answer === 'tiles' ? [{ x: 0, y: 0, bmp: { close() {} } }] : null } });
      });
    },
    terminate() { w.terminated = true; },
  };
  return w;
}
const withCanvasGlobals = async (f) => {
  const was = { Worker: globalThis.Worker, OffscreenCanvas: globalThis.OffscreenCanvas, createImageBitmap: globalThis.createImageBitmap, C2D: globalThis.CanvasRenderingContext2D };
  Object.assign(globalThis, { Worker: class {}, OffscreenCanvas: class {}, createImageBitmap: () => {}, CanvasRenderingContext2D: class { roundRect() {} ellipse() {} } });
  try { await f(); } finally { Object.assign(globalThis, { Worker: was.Worker, OffscreenCanvas: was.OffscreenCanvas, createImageBitmap: was.createImageBitmap, CanvasRenderingContext2D: was.C2D }); }
};
const tick = () => new Promise((r) => setTimeout(r, 0));

test('the page uses the worker only once it answers that it can paint the same picture', async () => {
  await withCanvasGlobals(async () => {
    const w = fakeWorker(), t = createTissueWorker({ make: () => w });
    assert.equal(t.ready, false, 'not before it answers: the page paints');
    await tick();
    assert.equal(t.ready, true);
    const shape = { R: 1 };
    const a = await t.paint({ shape, n: 10, sc: 1, bx: 0, by: 0, P: { m: {} } });
    assert.equal(a.length, 1);
    await t.paint({ shape, n: 10, sc: 1, bx: 0, by: 0, P: { m: {} } });
    assert.equal(w.sent.filter((m) => m.type === 'shape').length, 1, 'the shape is sent once while it stays the same');
    const job = w.sent.find((m) => m.type === 'paint');
    assert.deepEqual(Object.keys(job.tokens), paint.TOKENS, 'with the tokens the painting reads');
    // A canvas call the page has and the worker lacks: never used.
    const v = fakeWorker({ feats: { roundRect: false, ellipse: true } }), u = createTissueWorker({ make: () => v });
    void u.ready; await tick();
    assert.equal(u.ready, false); assert.ok(v.terminated);
  });
});

test('a worker that cannot paint a job is turned off for good, and every job waiting on it gets nothing', async () => {
  await withCanvasGlobals(async () => {
    const w = fakeWorker({ answer: 'null' }), t = createTissueWorker({ make: () => w });
    void t.ready; await tick();
    assert.equal(await t.paint({ shape: {}, n: 1, sc: 1, bx: 0, by: 0, P: {} }), null);
    assert.equal(t.ready, false); assert.ok(w.terminated);
    assert.equal(await t.paint({ shape: {}, n: 1, sc: 1, bx: 0, by: 0, P: {} }), null, 'nothing is asked of it again');
    // A worker that fails to start, or where the browser has no OffscreenCanvas: off from the start.
    const bad = createTissueWorker({ make: () => { throw new Error('refused'); } });
    assert.equal(bad.ready, false);
  });
  assert.equal(createTissueWorker({ make: () => fakeWorker() }).ready, false, 'no OffscreenCanvas in this runtime: the page paints');
});

test('in the view: the worker paints only on the GPU with a bitmap to show meanwhile; anything else paints on the page as before', () => {
  const pt = fn('function paintTissue(');
  assert.match(pt, /if \(wk !== worldKey && gpu && worldGeo === G && worldCv\.width && offPage\(\)\) \{\n[^\n]*\n[^\n]*\n\s+if \(askPaint\('world', sc, ws, wk, m, G, dark, cs\)/);
  assert.match(pt, /\} else if \(wk !== worldKey\) \{/);
  assert.match(pt, /worldSc = sc; worldGeo = G; worldDraws\+\+; worldSeq\+\+;[^\n]*\n\s+paintWorld\(worldCv, sc, m, G, dark, cs\);/, 'a bitmap painted on the page drops any the worker was asked for before it');
  assert.match(pt, /worldSc = spare\.sc; worldKey = worldSc\.toFixed\(3\) \+ '\|' \+ ws; spare = null; worldSeq\+\+;/, 'so does the spare taking over');
  assert.match(lz, /const offPage = \(\) => !!tissueGLOn\(\) && painter\.ready;/, 'never without the GPU (the headless checks paint on the page)');
  // One job at a time; one that comes back stale is dropped.
  assert.match(lz, /const jobLive = \(j\) => j\.gen === jobGen && j\.G === geo && \(j\.kind === 'spare' \? !bitmapUnseen\(\) : j\.seq === worldSeq\);/, 'a spare is live unless the shader has the whole picture');
  assert.match(fn('function release() {'), /jobGen\+\+; if \(laying\) \{ closeTiles\(laying\.tiles, laying\.i\); free\(laying\.cv\); laying = null; \}/);
});

test('in the view: a bitmap from the worker takes over as one painted on the page does', () => {
  const ad = fn('function adopt(j, cv) {');
  assert.match(ad, /if \(worldState && j\.ws !== worldState && !unseen\(\) && !\(tissueOnGL && liveShare >= 1\) && worldGeo === j\.G && worldCv\.width && !\(xfT0 && now - xfT0 < XF_MS\)\) \{ free\(worldOld\); worldOld = worldCv; worldOldSc = worldSc; xfT0 = now; \}\n\s+else free\(worldCv\);\n\s+worldCv = cv;/, 'the same crossfade, from the picture shown (unless the shader has the whole picture)');
  assert.match(ad, /worldKey = j\.wk; worldState = j\.ws; worldSc = j\.sc; worldGeo = j\.G; worldDraws\+\+; worldSeq\+\+;/);
  assert.match(ad, /free\(spareCv\); spareCv = cv; spare = \{ sc: j\.sc, ws: j\.ws, G: j\.G \};/);
  assert.match(ad, /tissueGL\?\.sweep\(\);\n\s+wake\(\);/, 'the replaced picture\'s texture goes, and the lobule draws again');
  // Laid a few tiles a frame, on the 2D canvas and on the GPU; the GPU texture's mipmaps once the last is in, then it takes over.
  const lt = fn('function layTiles() {');
  assert.match(lt, /while \(L\.i < L\.tiles\.length && bytes < TILE_BYTES\) \{/);
  assert.match(lt, /L\.c\.drawImage\(bmp, x, y\);\n\s+g\?\.put\(L\.cv, x, y, bmp\);/);
  assert.match(lt, /laying = null;\n\s+g\?\.done\(L\.cv, L\.cv\.ver\);\n\s+adopt\(L\.j, L\.cv\);/);
  assert.match(fn('function landed(j, tiles) {'), /cv\.ver = \+\+texVer;\n\s+tissueGLOn\(\)\?\.begin\(cv\);/);
  // The spare painted ahead, and the idle preparation before a dive, in the worker too.
  assert.match(fn('function spareMake() {'), /if \(offPage\(\)\) \{ if \(worldKey !== wantWk \|\| !askPaint\('spare', sc, ws, '', m, G, dark, cs\)\) spareSoon\(\); \}/, 'the bitmap the screen wants goes first');
  assert.match(lz, /const wait = \(\) => \{ if \(\(job \|\| laying\?\.j\)\?\.wk === wk\) q\.unshift\(wait\); \};\n\s+q\.unshift\(wait\);/);
});

test('the build bundles the tissue worker and points the page at it', () => {
  const b = read('../scripts/build.mjs');
  assert.match(b, /entryPoints: \[join\(ROOT, 'src\/ui\/tissue-paint-worker\.js'\)\], outdir: ASSETS, entryNames: 'tissue-worker-\[hash\]'/);
  assert.match(b, /throw new Error\('build: the tissue worker\\'s URL was not found in tissue-worker\.js'\)/);
  assert.match(read('../src/ui/tissue-worker.js'), /new Worker\(new URL\('\.\/tissue-paint-worker\.js\?v=[0-9a-f]+', import\.meta\.url\), \{ type: 'module' \}\)/);
});

test('on the GPU, a bitmap laid tile by tile is that canvas\'s texture once done, and is never sent again whole', async () => {
  const { createTissueGL } = await import('../src/ui/tissue-gl.js');
  const calls = [];
  let id = 0;
  const gl = new Proxy({}, { get(_, p) {
    if (typeof p !== 'string') return undefined;
    if (/^[A-Z0-9_]+$/.test(p)) return p;   // (constants as their names)
    if (p === 'getShaderParameter' || p === 'getProgramParameter') return () => true;
    if (p === 'isContextLost') return () => false;
    if (p === 'getExtension' || p === 'getParameter') return () => null;
    return (...a) => { calls.push([p, ...a.map((x) => x?.tag ?? x)]); return { tag: `${p}#${++id}` }; };
  } });
  const g = createTissueGL({ width: 0, height: 0, getContext: () => gl, addEventListener() {} });
  const cv = { width: 1100, height: 1100, ver: 5 }, tile = { tag: 'bmp', width: 512, height: 512 };
  g.put(cv, 0, 0, tile);
  assert.equal(calls.filter((c) => c[0] === 'texSubImage2D').length, 0, 'nothing laid before the texture is made');
  g.begin(cv);
  const made = calls.filter((c) => c[0] === 'texImage2D').at(-1);
  assert.deepEqual(made.slice(1), ['TEXTURE_2D', 0, 'RGBA8', 1100, 1100, 0, 'RGBA', 'UNSIGNED_BYTE', null], 'at the canvas\'s size, empty');
  g.put(cv, 512, 0, tile);
  assert.deepEqual(calls.filter((c) => c[0] === 'texSubImage2D').at(-1).slice(1), ['TEXTURE_2D', 0, 512, 0, 'RGBA', 'UNSIGNED_BYTE', 'bmp']);
  g.done(cv, 5);
  assert.equal(calls.at(-1)[0], 'generateMipmap');
  // Drawn: the canvas's texture is bound as it is, not sent again (a texImage2D of the canvas would be the page's long upload).
  const n = calls.length, q = { width: 4, height: 4 };
  assert.equal(g.draw({ W: 100, H: 100, qa: q, qb: null, mix: 0, w: cv, wVer: 5, rect: [0, 0, 100], ox: 50, oy: 50, rd: 40, fade: [44, 128], mid: 0.5, bg: [1, 1, 1] }), true);
  const sends = calls.slice(n).filter((c) => c[0] === 'texImage2D' && c.at(-1) !== null);   // (not the first draw's 1 px warm-up, gl-compile.js)
  assert.equal(sends.length, 1, 'only the quiet tile, sent for the first time');
  assert.equal(sends[0].at(-1), q);
  // A texture begun but not done is not taken as the canvas's own: a draw would send the canvas whole.
  const cv2 = { width: 64, height: 64, ver: 9 };
  g.begin(cv2);
  const m = calls.length;
  g.draw({ W: 100, H: 100, qa: q, qb: null, mix: 0, w: cv2, wVer: 9, rect: [0, 0, 100], ox: 50, oy: 50, rd: 40, fade: [44, 128], mid: 0.5, bg: [1, 1, 1] });
  assert.equal(calls.slice(m).filter((c) => c[0] === 'texImage2D' && c.at(-1) === cv2).length, 1);
});
