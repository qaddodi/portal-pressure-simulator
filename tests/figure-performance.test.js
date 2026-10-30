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
  f.setFigLab('motion60', true); f.setFigLab('nope', true); f.setFigLab('glassCache', 2);   // (no change, or not a choice: not heard)
  assert.equal(lab, Object.keys(f.FIG_LAB).length);
  assert.equal(res, 0, 'no switch reallocates the canvas or redraws for a resolution');
  for (const k of Object.keys(f.FIG_LAB)) assert.ok(store.has(`pps.fig.${k}`));
  for (const [k, v] of Object.entries(f.FIG_LAB)) f.setFigLab(k, v[0]);
  for (const k of Object.keys(f.FIG_LAB)) assert.ok(!store.has(`pps.fig.${k}`), `${k} off stores nothing`);
  delete globalThis.localStorage;
});

test('a stored value is read back; a stored value that is not a choice is ignored', async () => {
  const { f } = await freshFrame(new Map([['pps.fig.motion60', 'true'], ['pps.fig.glassCache', '7']]));
  assert.equal(f.figLab('motion60'), true);
  assert.equal(f.figLab('glassCache'), false);
  delete globalThis.localStorage;
});

test('one Figure performance heading with a switch for each, shown in the app and in a talk', () => {
  assert.equal(settings.split("'Figure performance'").length - 1, 1);
  assert.ok(settings.indexOf("'Figure performance'") < settings.indexOf('...(talk ? [] : ['), 'a talk shows it too');
  const rows = main.slice(main.indexOf('function figLabRows('), main.indexOf('function figSeg('));
  const { FIG_LAB } = { FIG_LAB: Object.fromEntries([...src('frame.js').match(/export const FIG_LAB = \{([^}]+)\}/)[1].matchAll(/(\w+): \[/g)].map((m) => [m[1], 1])) };
  for (const k of Object.keys(FIG_LAB)) assert.match(rows, new RegExp(`'${k}'`), `${k} has its row`);
});

test('Motion at 60: off, paceMs is 0 as before; on, 10 ms (every other frame at 120 Hz, every frame at 60 or 90 Hz)', async () => {
  const { f } = await freshFrame();
  assert.equal(f.paceMs(), 0, 'off: every frame, as before');
  f.setFigLab('motion60', true);
  assert.equal(f.paceMs(), f.MOTION60_MS);
  // (The readers skip a frame when now − last drawn < paceMs(), and set last drawn to now.)
  const drawn = (gap) => { let last = 0, n = 0; for (let t = gap; t < 1000; t += gap) if (t - last >= f.paceMs()) { last = t; n++; } return n; };
  assert.ok(Math.abs(drawn(1000 / 120) - 60) <= 1, '120 Hz: about 60 a second');
  assert.ok(Math.abs(drawn(1000 / 60) - 60) <= 1, '60 Hz: all of them');
  assert.ok(Math.abs(drawn(1000 / 90) - 90) <= 1, '90 Hz: all of them');
  f.setSaver(true);
  assert.equal(f.paceMs(), f.SAVER_MS, 'Battery saver still wins');
  f.setSaver(false); f.setFigLab('motion60', false);
  assert.equal(f.paceMs(), 0);
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
  assert.match(credit, /if \(watch\.due\(\) \|\| k !== polled \|\| st\?\.lobule \|\| st\?\.sinusoid \|\| \(app\?\.classList\.contains\('presenting'\) && !figLab\('creditLean'\)\)\) soon\(\);/);
});

test('Callout glass kept: off, draw() reads the page as before; on, it reads it only once something may have changed', () => {
  const g = src('glass-gl.js');
  const draw = g.slice(g.indexOf('  function draw() {'), g.indexOf('  // The glasses drawn over the blurred copy'));
  assert.match(draw, /if \(keep\?\.\(\)\) return drawKept\(list\);\n\s*kept = null;\n\s*const cr = canvas\.getBoundingClientRect\(\)/, 'off: straight on to the old reads');
  assert.match(draw, /const panes = readPanes\(list\);/);
  assert.match(draw, /return paint\(panes, cr, bgs, bg, bgVar\);/);
  const kept = g.slice(g.indexOf('  function drawKept(list) {'), g.indexOf('  function draw() {') > g.indexOf('  function drawKept(list) {') ? g.indexOf('  function draw() {') : g.length);
  assert.match(kept, /keepWatch\(\);/);
  assert.match(kept, /if \(!kept \|\| keptStale \|\| !sameList\(kept\.list, list\) \|\| kept\.k !== k0 \|\| kept\.anim \|\| performance\.now\(\) < liveUntil \|\| due\?\.\(\)\) \{/);
  // Every way a glass can change marks the boxes stale: a write in the layers (in the frame or after it), the page's own signals,
  // a callout's transition or pointer, a parent's style or class, a size change, a scroll.
  assert.match(g, /const loop = \(\) => \{ raf = 0; if \(mo\.takeRecords\(\)\.length\) keptStale = true; settle\(draw\(\)\); \};/);
  assert.match(g, /batched = true;\n\s*keptStale = true;/);
  assert.match(g, /const again = \(\) => \{ keptStale = true; wake\(\); \};/);
  assert.match(g, /const held = \(\) => \{ liveUntil = performance\.now\(\) \+ 800; keptStale = true; wake\(\); \};/);
  assert.match(g, /keptMo\.observe\(e, \{ attributes: true, attributeFilter: \['style', 'class', 'hidden'\] \}\)/);
  assert.match(g, /for \(const e of \[canvas, source, wrap\]\) keptRo\?\.observe\(e\);/);
  assert.match(g, /document\.addEventListener\('scroll', stale, true\);/);
  // (The watchers exist only once the switch has been on: off, none of them is made.)
  assert.ok(g.indexOf('keepWatch();') > g.indexOf('function drawKept('), 'made from drawKept only');
  assert.match(g, /if \(keptMo\) \{ keptMo\.disconnect\(\); keptRo\?\.disconnect\(\); document\.removeEventListener\('scroll', stale, true\); \}/, 'and let go with the glass');
  const stage = src('stage.js');
  assert.equal(stage.split("keep: () => figLab('glassCache'), due: () => watch.due()").length - 1, 2, 'the callouts and the liver pane both');
});

test('Callout glass kept: the kept path draws from the same reads, through the same paint', () => {
  const g = src('glass-gl.js');
  const m = g.slice(g.indexOf('  function measure(list) {'), g.indexOf('  function drawKept(list) {'));
  assert.match(m, /const cr = canvas\.getBoundingClientRect\(\), k = window\.devicePixelRatio \|\| 1;/);
  assert.match(m, /const panes = readPanes\(list\);/);
  assert.match(m, /const ws = getComputedStyle\(wrap\), bgs = ws\.backgroundColor, bg = colour\(bgs, 'transparent'\);/);
  assert.match(m, /sr: source\.getBoundingClientRect\(\), anim: animating\(\)/);
  const k = g.slice(g.indexOf('  function drawKept(list) {'));
  assert.match(k, /take\(\{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 \}, cr, sr\);/, 'the figure copy from the kept boxes');
  assert.match(k, /return paint\(panes, cr, bgs, bg, bgVar\);/);
  assert.match(g, /function take\(reg, cr, srKept = null\) \{\n\s*const sr = srKept \|\| source\.getBoundingClientRect\(\);/, 'off: take reads the figure’s box as before');
});
