// Settings › Figure performance (30 Oct, Round 3 of the resolution review): one switch per idea, each off by default, and off
// changes nothing: every path a switch adds is behind its own check, and the code it leaves runs as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const main = src('main.js');
const settings = main.slice(main.indexOf('function openSettings('), main.indexOf('function presenterSettings('));

async function freshFrame(store = new Map()) {
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const f = await import(`../src/ui/frame.js?t=lab${Math.random()}`);
  return { f, store };
}

test('every switch is off by default, stored only when on, heard by its own listeners and not by the resolution', async () => {
  const { f, store } = await freshFrame();
  for (const [k, v] of Object.entries(f.FIG_LAB)) assert.equal(f.figLab(k), v[0], `${k} off by default`);
  let lab = 0, res = 0;
  f.onFigLab(() => lab++);
  f.onRenderScale(() => res++);
  for (const [k, v] of Object.entries(f.FIG_LAB)) f.setFigLab(k, v[1]);
  f.setFigLab('motion60', false); f.setFigLab('nope', true); f.setFigLab('glassCache', 2);   // (no change, or not a choice: not heard)
  assert.equal(lab, Object.keys(f.FIG_LAB).length);
  assert.equal(res, 0, 'no switch reallocates the canvas or redraws for a resolution');
  for (const k of Object.keys(f.FIG_LAB)) assert.ok(store.has(`pps.fig.${k}`));
  for (const [k, v] of Object.entries(f.FIG_LAB)) f.setFigLab(k, v[0]);
  for (const k of Object.keys(f.FIG_LAB)) assert.ok(!store.has(`pps.fig.${k}`), `${k} off stores nothing`);
  delete globalThis.localStorage;
});

test('a stored value is read back; a stored value that is not a choice is ignored', async () => {
  const { f } = await freshFrame(new Map([['pps.fig.motion60', 'false'], ['pps.fig.glassCache', '7']]));
  assert.equal(f.figLab('motion60'), false);
  assert.equal(f.figLab('glassCache'), false);
  delete globalThis.localStorage;
});

// (31 Oct, premium-feel R14: the Figure performance heading and its switches are no longer in Settings; each stays, off, in the code.
// tests/settings-product.test.js pins that they are gone and that what a build stored for them is cleared at start.)
test('no Figure performance heading or switch in Settings', () => {
  assert.equal(settings.split("'Figure performance'").length - 1, 0);
  assert.doesNotMatch(main, /function figLabRows\(|setFigLab\(/);
  const { FIG_LAB } = { FIG_LAB: Object.fromEntries([...src('frame.js').match(/export const FIG_LAB = \{([^}]+)\}/)[1].matchAll(/(\w+): \[/g)].map((m) => [m[1], 1])) };
  for (const k of Object.keys(FIG_LAB)) assert.doesNotMatch(settings, new RegExp(`'${k}'`), `${k} has no row`);
});

test('Motion at 60 (on by default since 4 Nov 2026): paceMs is 10 ms (every other frame at 120 Hz, every frame at 60 or 90 Hz); off, 0', async () => {
  const { f } = await freshFrame();
  assert.equal(f.paceMs(), f.MOTION60_MS, 'on by default');
  // (The readers skip a frame when now − last drawn < paceMs(), and set last drawn to now.)
  const drawn = (gap) => { let last = 0, n = 0; for (let t = gap; t < 1000; t += gap) if (t - last >= f.paceMs()) { last = t; n++; } return n; };
  assert.ok(Math.abs(drawn(1000 / 120) - 60) <= 1, '120 Hz: about 60 a second');
  assert.ok(Math.abs(drawn(1000 / 60) - 60) <= 1, '60 Hz: all of them');
  assert.ok(Math.abs(drawn(1000 / 90) - 90) <= 1, '90 Hz: all of them');
  f.setSaver(true);
  assert.equal(f.paceMs(), f.SAVER_MS, 'Battery saver still wins');
  f.setSaver(false); f.setFigLab('motion60', false);
  assert.equal(f.paceMs(), 0, 'off: every frame');
  delete globalThis.localStorage;
});

test('Motion at 60 in the figure loop: off, the interval and the gate are as before; on, no phase is carried; view moves never wait', () => {
  const stage = src('stage.js');
  const fn = stage.slice(stage.indexOf('function animate(now)'), stage.indexOf('const dt = Math.min(0.1, (now - lastT) / 1000);', stage.indexOf('function animate(now)')));
  assert.match(fn, /const m60 = !paceOf\(quality\) && figLab\('motion60'\);/);
  assert.match(fn, /const interval = m60 \? MOTION60_MS : paceOf\(quality\);/);
  assert.match(fn, /if \(interval && !viewMoved && !forceDraw && now - flowGate < interval\) \{ askAnimate\(\); return; \}/);
  assert.match(fn, /flowGate = interval && !m60 \? now - \(\(now - flowGate\) % interval\) : now;/);
  // (Off: m60 false, so interval = paceOf(quality) and the gate is `interval ? … : now`, the old lines exactly.)
  const gate = (m60, interval, now, flowGate) => (interval && !m60 ? now - ((now - flowGate) % interval) : now);
  const old = (interval, now, flowGate) => (interval ? now - ((now - flowGate) % interval) : now);
  for (const [i, n, g] of [[0, 100, 90], [1000 / 15, 200, 120], [1000 / 8, 500, 300]]) assert.equal(gate(false, i, n, g), old(i, n, g));
  // (On, at 120 Hz: drawn every other frame, never two in a row.)
  let flowGate = 0, drawn = 0, prev = -1, twice = false;
  for (let k = 1; k <= 120; k++) {
    const now = (k * 1000) / 120;
    if (now - flowGate < 10) continue;
    flowGate = gate(true, 10, now, flowGate); drawn++;
    if (prev === k - 1) twice = true;
    prev = k;
  }
  assert.equal(drawn, 60); assert.ok(!twice);
});

test('Credit check in talks: off, Present looks every second as before; on, only on the same signs as outside a talk', () => {
  const credit = src('credit.js');
  // (The lobule and the sinusoid no longer look every second since 1 Nov 2026: their view and gliding names are in the key.)
  assert.match(credit, /if \(watch\.due\(\) \|\| k !== polled \|\| \(app\?\.classList\.contains\('presenting'\) && !figLab\('creditLean'\)\)\) soon\(\);/);
  assert.match(src('stage.js'), /labelStamp: \(\) => `\$\{stats\.layouts\}\|\$\{vt\.k\},\$\{vt\.x\},\$\{vt\.y\}\|\$\{morph\}\|\$\{rotU\}\|\$\{lz\?\.isOpen\?\.\(\) \? lz\.viewKey\(\) : ''\}\|\$\{lz\?\.sinusoidMoving\?\.\(\) \? performance\.now\(\) : ''\}`,/);
});

test('Callout glass kept (always, since 1 Nov 2026): no frame reads the page; it is read once outside frames, the motion put back each frame', () => {
  const g = src('glass-gl.js');
  const draw = g.slice(g.indexOf('  function draw() {'), g.indexOf('  // The glasses drawn over the blurred copy'));
  assert.match(draw, /const N = nowGeo\(list\);\n\s*if \(!N\) return true;/, 'the copy path draws from the kept page');
  assert.doesNotMatch(draw, /getBoundingClientRect|getComputedStyle|readPanes\(/, 'no read in the frame');
  assert.match(draw, /return paint\(panes, cr, N\.bgs, N\.bg, N\.bgVar\);/);
  const now = g.slice(g.indexOf('  function nowGeo(list) {'), g.indexOf('  // While a callout shows, every frame'));
  assert.doesNotMatch(now, /getBoundingClientRect|getComputedStyle|offset(Width|Height|Left|Top)|client(Width|Height)/, 'nowGeo reads nothing');
  assert.match(now, /if \(flag\.bad \|\| flag\.ended\) measureSoon\(\);/, 'what it cannot follow is read just after the frame');
  assert.match(now, /if \(due\?\.\(\)\) measureSoon\(\);/, 'the layout watch likewise');
  // Every way a glass can change reads the page again, outside the frame: a write that is more than a glide or a fade (in the frame or
  // after it), the page's own signals, a callout's transition ending, a parent's style or class, a size change, a scroll.
  assert.match(g, /const loop = \(\) => \{ raf = 0; if \(changed\(mo\.takeRecords\(\)\)\) measureSoon\(\); settle\(draw\(\)\); \};/);
  assert.match(g, /const mo = new MutationObserver\(\(recs\) => \{ if \(!recs\?\.length \|\| changed\(recs\)\) measureEarly\(\); quiet = 0; ask\(\); \}\);/);
  assert.match(g, /const again = \(\) => measureEarly\(\);/);
  assert.match(g, /if \(\/\(end\|cancel\)\$\/\.test\(e\?\.type \|\| ''\)\) \{ measureEarly\(\); return; \}/);
  // (2 Nov 2026: an observer's or an event's read waits for the next frame's read phase, never in the frame's writes.)
  assert.match(g, /function measureEarly\(\) \{\n\s+if \(!earlyAsk\) earlyAsk = readFrame\(measureEarlyNow\);\n\s+\}/);
  assert.match(g, /if \(framePhase\(\) === 'read'\) \{ track\(e\); return; \}\n\s+trackQ\.add\(e\);/);
  assert.doesNotMatch(g, /glassearly|glassobs|GEO_EARLY|OBS_LATER|measureAtOnce/, 'the switches are gone: the default path only');
  assert.match(g, /parentsMo\.observe\(e, \{ attributes: true, attributeFilter: \['style', 'class', 'hidden'\] \}\)/);
  assert.match(g, /for \(const e of \[canvas, source, wrap\]\) if \(e\) watchRo\?\.observe\(e\);/);
  assert.match(g, /document\.addEventListener\?\.\('scroll', onScroll, true\);/);
  const stage = src('stage.js');
  assert.equal(stage.split("keep: () => figLab('glassCache'), due: () => watch.due(), copy: false").length - 1, 2, 'the callouts and the liver pane (the Present cards take no copy: they are drawn in the figure\'s canvas or are the browser\'s)');
});

test('Callout glass kept: the page is read in one place, with each moving part taken out, and the copy taken from those reads', () => {
  const g = src('glass-gl.js');
  const m = g.slice(g.indexOf('  function measureGeo() {'), g.indexOf('  /** The page read again just after this frame'));
  assert.match(m, /const cr = tgt \? tgt\.getBoundingClientRect\(\)/);
  assert.match(m, /const panes = readPanes\(list, true\)/);
  assert.doesNotMatch(g, /glassmotion|\bMOTION\b/, 'the switch is gone: the default path only');
  assert.match(m, /const ws = getComputedStyle\(wrap\), bgs = ws\.backgroundColor;\n\s+resolveColour\(bgs\);\n\s+const bg = colour\(bgs, 'transparent'\);/);
  assert.match(m, /const r0 = rest\(shift\(p\.r, back\)\), er0 = rest\(shift\(p\.er, back\)\);/, 'the boxes kept without their glide (a zoomed card taken back to where it rests)');
  assert.match(m, /return \{ \.\.\.p, chain, r0, er0, aS, morph, zoomed: !!za, rad0: za && p\.rad \? p\.rad\.map\(\(v\) => v \/ za\.s\) : p\.rad \};/);
  assert.match(m, /sr: tgt === source \? cr : source\.getBoundingClientRect\(\)/, 'the figure\'s canvas is both the glass\'s and the copy\'s: one read');
  assert.match(m, /viewSize\(\)/, 'the window\'s size is the snapshot\'s, not read');
  assert.doesNotMatch(m, /clientWidth|innerWidth/);
  const d = g.slice(g.indexOf('  function draw() {'));
  assert.match(d, /take\(\{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 \}, cr, N\.sr\);/, 'the figure copy from the kept boxes');
  assert.match(g, /function take\(reg, cr, sr\) \{/, 'take reads nothing itself');
});

test('Lymph drawn by the GPU each frame it moves: the drops stepped once a frame, their rings as wide as the 2D drawing stroked them', () => {
  // (1 Nov, the off-GPU gate: the 2D overlay (paintFx) and its partial redraw are gone; the overlay is the GPU's, fx-gl.js.)
  const lz = src('lobule-zoom.js');
  const fx = lz.slice(lz.indexOf('  function fxOnGPU(W, H, dpr, dark, dt, can) {'), lz.indexOf('\n  }\n', lz.indexOf('  function fxOnGPU(W, H, dpr, dark, dt, can) {')));
  assert.equal(fx.split('lyDrops(G, m, dt, W, H, dpr)').length - 1, 1, 'the drops stepped once a frame');
  assert.equal(lz.split('lyDrops(G, m, dt, W, H, dpr)').length - 1, 2, 'and nowhere else (the other is its own definition)');
  assert.match(fx, /lymph\.ringHalf = Math\.max\(0\.5 \/ V\.k, minR \* 0\.22\) \/ 2;/, 'the ring as the drawing stroked it');
  assert.match(fx, /if \(moving\) fxGLKey = '';/, 'a moving overlay is drawn every frame, a still one only when it changes');
  assert.doesNotMatch(lz, /function paintFx\(|lyTiles|lyKey|fxBoxes/);
});

test('Pinch frame reuse: off, the one-pass frame is as before; on, only while a hand zooms, and the stop is shaded whole', () => {
  const v = src('veins-gl.js'), stage = src('stage.js');
  const fn = v.slice(v.indexOf('    draw(m, look, blood, rows = null) {'), v.indexOf('    drawRows(m, look, blood, rows, full = false) {'));
  assert.match(fn, /if \(reuseEvery && reuseOn && stale && reuseN % reuseEvery !== 0 && reuseDraw\(m\)\) \{/, 'nothing reused unless switched on and zooming');
  assert.match(fn, /setBase\(m\); fboOK = false; reused = true;\n\s+return;/, 'a reused frame leaves the layer to be drawn whole');
  assert.match(fn, /this\.composite\(look, blood, true\);\n\s+if \(reuseEvery && reuseOn\) \{ reuseKeep\(m\); reuseN = 1; \} else rz\.m = null;\n\s+return;/);
  assert.match(fn, /\n\s+rz\.m = null;\n\s+\/\/ \(For the \?perf readout/, 'any other picture: nothing kept to reuse');
  // Off, the one-pass branch's own lines are unchanged.
  assert.match(fn, /if \(!stale\) \{ gl\.bindFramebuffer\(gl\.FRAMEBUFFER, fbo\); gl\.viewport\(0, 0, fboW, fboH\); gl\.disable\(gl\.SCISSOR_TEST\); clearLayer\(\); stale = true; \}\n\s+wrapNone\(\);[^\n]*\n\s+setBase\(m\); keepLook\(\); tubesNew = false; clearMarks\(\); drawnNow\(\);\n\s+fboOK = false;\n\s+gl\.bindFramebuffer\(gl\.FRAMEBUFFER, null\);\n\s+fusing = true;/);
  const rd = v.slice(v.indexOf('  function reuseDraw(m) {'), v.indexOf('  // The composite\'s textures, each on its unit'));
  assert.match(rd, /if \(!rz\.m \|\| rz\.w !== PW\(\) \|\| rz\.h !== PH\(\)\) return false;/);
  assert.match(rd, /if \(!reuseCovers\(k, rz\.w, rz\.h\)\) return false;/);
  assert.match(rd, /if \(own\) present\(\);\n\s+pictured\(\);/, 'the glass and the own buffer hear of it');
  assert.match(stage, /const reuse = figLab\('pinchReuse'\);\n\s+veins\.setReuse\?\.\(reuse, !!reuse && gestureOn\(\)\);\n[^\n]*\n\s+const low = figLab\('pinchLow'\);\n(?:\s+\/\/[^\n]*\n)*\s+const tk = TIERS_ON \? tierK\(\) : 0;\n\s+veins\.setLow\?\.\(tk \|\| \(low \? PINCH_LOW_K : 0\), tk \? true : low && gestureOn\(\), TIERS_ON \? TIER_TOP : 0\);\n\s+veins\.draw\(T, vLook, bloodLook\(\), rows\);\n\s+if \(veins\.reused \|\| veins\.soft\) veinsDirty = true;/);
  // (The kept picture is the canvas's, through the own buffer when there is one; freed when the switch goes off.)
  assert.match(v, /gl\.bindFramebuffer\(gl\.READ_FRAMEBUFFER, own \? own\.fbo : null\);\n\s+gl\.bindFramebuffer\(gl\.DRAW_FRAMEBUFFER, rz\.fbo\);/);
  assert.match(v, /if \(!every && rz\.w && !lost\) \{ rz\.w = rz\.h = 0;/);
});

// (31 Oct, laptop heat H7: the credit's lean look is the default. In Present the credit's look measures every card and label, and it ran every
// second whatever had happened. A stored "false" is read back too, so a choice made before it stays; no screen offers the switch.)
test('H7: the credit looks again in a talk only when the layout may have changed, by default', async () => {
  const { f } = await freshFrame();
  assert.equal(f.figLab('creditLean'), true);
  assert.equal(f.FIG_LAB.creditLean[0], true);
  f.setFigLab('creditLean', false);
  assert.equal(f.figLab('creditLean'), false);
  const again = await freshFrame(new Map([['pps.fig.creditLean', 'false']]));
  assert.equal(again.f.figLab('creditLean'), false, 'a stored off is read back');
  delete globalThis.localStorage;
});

test('the lymph keeps its typed arrays (R13): drops, beads and their GPU buffers grow only when outgrown', () => {
  const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  const fx = readFileSync(new URL('../src/ui/fx-gl.js', import.meta.url), 'utf8');
  assert.doesNotMatch(lz, /LY_KEEP|lykeep/);
  assert.match(lz, /const dI = fxDI\[fxFlip\]\.subarray\(0, nd \* 6\), bI = fxBI\[fxFlip\]\.subarray\(0, nd \* beads \* 6\);/);
  assert.match(fx, /if \(data\.byteLength <= B\.cap\) gl\.bufferSubData\(gl\.ARRAY_BUFFER, 0, data\);/);
});
