// Settings › Blur effect (Mohammad, 12 Nov 2026, after trying Off, Blur, M1 and F4 on every glass: "No more real blur or mesh. Field or Off.
// default to field. Call it “Blur” still. And make it on off toggle default to on."). On, every glass the GPU draws is the field (his F4: a cubic
// B-spline over the figure averaged in 72 px cells) under the one glass's tint and saturation (11 Nov: "Tint and blur of glass should be the same
// EVERYWHERE"); off, none. A node replay through the real glass-gl.js, glass-mode.js and frame.js (the page and the WebGL context faked, every
// uniform the glass sets and every shader it compiles recorded).
import { test } from 'node:test';
import assert from 'node:assert/strict';
const rafs = [];
let clock = 1000;
globalThis.requestAnimationFrame = (cb) => { rafs.push(cb); return rafs.length; };
globalThis.cancelAnimationFrame = () => {};
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });
const timers = new Map(); let tid = 0;
globalThis.setTimeout = (f, ms = 0) => { timers.set(++tid, { f, at: clock + (ms || 0) }); return tid; };
globalThis.clearTimeout = (id) => { timers.delete(id); };
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
const runTimers = (upTo = clock) => { for (;;) { let best = null; for (const [id, t] of timers) if (t.at <= upTo && (!best || t.at < best[1].at)) best = [id, t]; if (!best) return; timers.delete(best[0]); best[1].f(); } };
globalThis.MutationObserver = class { constructor() {} observe() {} disconnect() {} takeRecords() { return []; } };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.window = globalThis; globalThis.devicePixelRatio = 2; globalThis.innerWidth = 1200; globalThis.innerHeight = 800;
globalThis.CSS = { supports: () => true }; globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.WebGL2RenderingContext = class {}; globalThis.Path2D = class {};
globalThis.createImageBitmap = () => Promise.resolve({ close() {} });
const rootAttrs = new Map();
const root = { hasAttribute: (k) => rootAttrs.has(k), getAttribute: (k) => (rootAttrs.has(k) ? rootAttrs.get(k) : null), setAttribute: (k, v = '') => { rootAttrs.set(k, String(v)); }, removeAttribute: (k) => { rootAttrs.delete(k); } };
globalThis.document = { documentElement: root, addEventListener() {}, removeEventListener() {}, timeline: { get currentTime() { return clock; } }, hidden: false, createElement: () => ({ width: 0, height: 0, getContext: () => null }) };

// The figure's context: every uniform the glass's programs are given, by name, and every shader's source.
const sources = [], set = [];
let bound = null;
const draws = [];
const fig = new Proxy({}, { get(_, k) {
  if (typeof k !== 'string') return undefined;
  if (/^[A-Z0-9_]+$/.test(k)) return k;
  if (k === 'isContextLost') return () => false;
  if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
  if (k === 'createProgram') return () => ({});
  if (k === 'shaderSource') return (_s, src) => { sources.push(src); };
  if (k === 'getUniformLocation') return (_p, name) => ({ name });
  if (k === 'bindTexture') return (_t, tex) => { bound = tex; };
  if (k === 'drawArrays') return () => { draws.push(bound); };
  if (k.startsWith('uniform')) return (loc, ...v) => { if (loc?.name) set.push({ name: loc.name, v: v.length === 1 && typeof v[0] === 'number' ? v[0] : [...v] }); };
  return () => (k.startsWith('create') ? {} : undefined);
} });
const rect = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t });
const el = (name, r, tint, card) => ({ name, rest: r, tint, card, isConnected: true, parentElement: null, nodeType: 1, attrs: new Map(), getAnimations: () => [],
  style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '', getPropertyPriority: () => '', transform: '', opacity: '', translate: '', transition: '' },
  classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
  getAttribute: (k) => (k === 'style' ? '' : null), hasAttribute(k) { return this.attrs.has(k); }, setAttribute(k, v = '') { this.attrs.set(k, String(v)); }, removeAttribute(k) { this.attrs.delete(k); },
  get dataset() { return {}; }, getBoundingClientRect() { return this.rest; }, contains(n) { return n === this; } });
const stage = { nodeType: 1, parentElement: null, isConnected: true, getAnimations: () => [], style: {}, contains: () => false, addEventListener() {}, removeEventListener() {} };
// The cards as app.css declares them: each its own --gl-tint. One glass that is not a card (a menu's 76 %) keeps its own, so the check sees tints.
const SURFACE = '#fcf9f3';
const cards = [
  el('teaching', rect(40, 300, 360, 260), 'rgba(252, 249, 243, 0.66)', true),
  el('case', rect(300, 120, 600, 380), 'rgba(252, 249, 243, 0.66)', true),
  el('data', rect(820, 200, 300, 420), 'rgba(252, 249, 243, 0.66)', true),
  el('sheet', rect(20, 640, 500, 140), 'rgba(252, 249, 243, 0.8)', true),
  el('toast', rect(560, 20, 280, 60), 'rgba(252, 249, 243, 0.7)', true),
  el('high-contrast bar', rect(900, 700, 200, 40), 'rgba(252, 249, 243, 0.92)', true),
  el('menu', rect(980, 60, 180, 220), 'rgba(252, 249, 243, 0.76)', true),
  el('top bar pill', rect(980, 300, 120, 36), 'rgba(252, 249, 243, 0.42)', true),
];
// (The tooltip is not: its glass is the dark one its words are drawn for (menu-glass.js), so the check sees a declared tint when one is drawn.)
const tip = el('tooltip', rect(980, 360, 140, 30), 'rgba(30, 29, 27, 0.8)', false);
const all = [...cards, tip];
for (const e of all) e.parentElement = stage;
const look = (e) => ({ display: 'block', visibility: 'visible', opacity: '1', filter: 'none', boxShadow: 'none', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottomRightRadius: '16px', borderBottomLeftRadius: '16px',
  getPropertyValue: (k) => (k === '--gl-glass' ? '1' : k === '--gl-tint' ? e.tint : k === '--surface' ? SURFACE : '') });
globalThis.getComputedStyle = (e) => (all.includes(e) ? look(e) : { backgroundColor: 'rgba(0, 0, 0, 0)', display: 'block', visibility: 'visible', getPropertyValue: (k) => (k === '--stage-bg' ? '#101820' : ''), opacity: '1', boxShadow: 'none' });
const source = { addEventListener() {}, removeEventListener() {}, width: 2400, height: 1600, getBoundingClientRect: () => rect(0, 0, 1200, 800), getAnimations: () => [], style: {}, parentElement: null, nodeType: 1 };


const F = await import('../src/ui/frame.js');
const { createGlassGL, CARD, SMOOTH, shareStats } = await import('../src/ui/glass-gl.js');
const M = await import('../src/ui/glass-mode.js');

const tops = [];
const add = (t) => { tops.push(t); tops.sort((a, b) => a.order - b.order); return () => { const i = tops.indexOf(t); if (i >= 0) tops.splice(i, 1); }; };
let seq = 1, pend = false;
const present = () => { for (const t of tops) t.prep?.(); for (const t of tops) t.draw(); };
F.onFrameFinal(() => { if (pend) { pend = false; present(); } });
const G = createGlassGL(stage, source, [], { cards: { find: () => all, watch: [stage], before: { parentNode: stage }, region: (e) => ({ card: e.card }) }, version: () => seq });
G.setHost({ gl: fig, canvas: source, add, now: () => { if (F.framePhase()) pend = true; else present(); }, active: () => true, order: { low: 1, high: 3 }, over: () => [], view: () => null });

const settle = () => new Promise((r) => setImmediate(r));
async function frame() {
  runTimers(clock); await settle();
  clock += 16.7; runTimers(clock - 0.1); await settle();
  for (const cb of rafs.splice(0)) cb(clock);
  await settle();
}
// One picture laid: each glass's tint and saturation as the glass set them, the field's cells and reach, and the draws made.
function lay() {
  set.length = 0; draws.length = 0; seq++;
  present();
  const out = [];
  let sat = null, cell = null, reach = null, dir = 0;
  for (const u of set) {
    if (u.name === 'uSat') sat = u.v;
    if (u.name === 'uCell') cell = u.v;
    if (u.name === 'uReach') reach = u.v;
    if (u.name === 'uDir') dir++;
    if (u.name === 'uTint') out.push({ tint: u.v.map((x) => +x.toFixed(4)), sat });
  }
  return { glasses: out, dir, cell, reach, draws: draws.length };
}
for (let i = 0; i < 20; i++) await frame();

test('Blur effect on: every glass is the field (F4), with the one glass\'s tint and saturation, and no blur pass', () => {
  const L = lay();
  assert.equal(L.glasses.length, all.length, `every glass drawn: ${L.glasses.length} of ${all.length}`);
  const [r, g, b] = [0xfc / 255, 0xf9 / 255, 0xf3 / 255], a = CARD.tint, one = [r * a, g * a, b * a, a].map((x) => +x.toFixed(4));
  for (let i = 0; i < cards.length; i++) {
    assert.deepEqual(L.glasses[i].tint, one, `${cards[i].name}: the one card glass's tint`);
    assert.equal(L.glasses[i].sat, CARD.sat, `${cards[i].name}: the one card glass's saturation`);
  }
  assert.equal(L.dir, 0, 'no blur pass: "No more real blur or mesh"');
  assert.equal(L.draws, all.length, 'one draw a glass and nothing else (no pass of a blur)');
  // (The field's cells and its reads' reach, at the canvas's 2 device px a CSS px.)
  assert.deepEqual([SMOOTH.cell, SMOOTH.scale], [72, 64], 'F4: 72 px cells over the figure averaged at 64 px a texel');
  assert.equal(L.cell, SMOOTH.cell * 2);
  assert.equal(L.reach, SMOOTH.reach * 2);
  assert.deepEqual(Object.keys(shareStats(fig)).map((k) => k.split('|')[0]), ['field'], 'one shared copy, the field\'s');
  // (The glass's shader is the field and nothing else: no blur program, no mesh.)
  assert.equal(sources.filter((x) => x.includes('uniform float uW[13]')).length, 0, 'no blur shader compiled');
  assert.ok(sources.some((x) => x.includes('vec4 bsw(float t)')), 'the cubic B-spline\'s weights');
});

test('Blur effect off draws no glass (html[data-noglass], the solid look), and on again draws the field', async () => {
  assert.equal(M.setGlassMode(root, 'off'), true, 'off came: the labels take the glass\'s look');
  assert.equal(root.hasAttribute('data-noglass'), true);
  G.redraw();   // (the page's observer on html's attributes, faked here)
  clock += 300;
  for (let i = 0; i < 5; i++) await frame();
  assert.equal(lay().glasses.length, 0, 'no glass drawn');
  assert.equal(M.setGlassMode(root, 'field'), true);
  assert.equal(root.hasAttribute('data-noglass'), false);
  G.redraw();
  clock += 300;
  for (let i = 0; i < 5; i++) await frame();
  assert.equal(lay().glasses.length, all.length, 'back on');
});

test('at load: on everywhere, phones too, unless turned off; the old four-way choices and the old switch carry over', () => {
  const get = (o) => (k) => (k in o ? o[k] : null);
  assert.equal(M.storedGlassMode(get({})), null);
  for (const m of ['blur', 'mesh', 'field']) assert.equal(M.storedGlassMode(get({ 'pps.glassMode': m })), 'field', `${m} was on`);
  assert.equal(M.storedGlassMode(get({ 'pps.glassMode': 'off' })), 'off');
  assert.equal(M.storedGlassMode(get({ 'pps.noGlass': '1' })), 'off');
  assert.equal(M.storedGlassMode(get({ 'pps.noGlass': '0' })), 'field');
  const fresh = () => { const a = new Map(); return { a, hasAttribute: (k) => a.has(k), getAttribute: (k) => a.get(k) ?? null, setAttribute: (k, v = '') => a.set(k, v), removeAttribute: (k) => a.delete(k) }; };
  for (const [stored, mode] of [[null, 'field'], ['field', 'field'], ['off', 'off']]) {
    const r = fresh();
    assert.equal(M.glassAtLoad(r, { stored }), mode, `${stored}`);
    assert.equal(r.hasAttribute('data-noglass'), mode === 'off');
  }
  // (?noglass=1 set it before: kept, whatever was stored.)
  const q = fresh(); q.setAttribute('data-noglass', '');
  M.glassAtLoad(q, { stored: 'field' });
  assert.equal(q.hasAttribute('data-noglass'), true);
  // (A turn of the switch is stored with the old switch's key kept in step, for the blur guard.)
  const st = new Map();
  M.storeGlassMode((k, v) => st.set(k, v), 'field');
  assert.deepEqual(Object.fromEntries(st), { 'pps.glassMode': 'field', 'pps.noGlass': '0' });
  M.storeGlassMode((k, v) => st.set(k, v), 'off');
  assert.deepEqual(Object.fromEntries(st), { 'pps.glassMode': 'off', 'pps.noGlass': '1' });
});
