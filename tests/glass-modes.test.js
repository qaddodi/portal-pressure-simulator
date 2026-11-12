// Settings › Glass effect (Mohammad, 12 Nov 2026: "let's add M1 and F4 as options for the blur/cards and the entirity of the UI, not just
// cards; anywhere where we're using glass effect, make this universal switch change between OFF -> Blur -> M1 -> F4"). One choice for every
// glass the GPU draws; the three live modes keep the one glass's tint and saturation (11 Nov: "Tint and blur of glass should be the same
// EVERYWHERE"), only how the figure under it is smoothed changes. A node replay through the real glass-gl.js, glass-mode.js and frame.js
// (the page and the WebGL context faked, every uniform the glass sets recorded).
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
// One picture laid: each glass's tint, saturation and mode as the glass set them, the blur passes run (uDir), and what each glass read from.
function lay() {
  set.length = 0; draws.length = 0; seq++;
  present();
  const out = [];
  let sat = null, gm = null, cell = null, reach = null, passes = 0;
  for (const u of set) {
    if (u.name === 'uSat') sat = u.v;
    if (u.name === 'uGM') gm = u.v;
    if (u.name === 'uCell') cell = u.v;
    if (u.name === 'uReach') reach = u.v;
    if (u.name === 'uDir') passes++;
    if (u.name === 'uTint') out.push({ tint: u.v.map((x) => +x.toFixed(4)), sat, gm });
  }
  return { glasses: out, passes, cell, reach, read: draws.at(-1) };
}
for (let i = 0; i < 20; i++) await frame();

test('Settings › Glass effect: Blur, Mesh (M1) and Field (F4) draw every glass with the same tint and saturation; only the filter changes', async () => {
  const by = {};
  for (const m of ['blur', 'mesh', 'field']) {
    M.setGlassMode(root, m);
    assert.equal(M.glassMode(), m);
    assert.equal(root.hasAttribute('data-noglass'), false, `${m}: a glass is drawn`);
    assert.equal(root.getAttribute('data-glass'), m === 'blur' ? null : m, `${m}: html[data-glass]`);
    for (let i = 0; i < 3; i++) await frame();
    by[m] = lay();
    assert.equal(by[m].glasses.length, all.length, `${m}: every glass drawn (${by[m].glasses.length} of ${all.length})`);
    for (const g of by[m].glasses) assert.equal(g.gm, { blur: 0, mesh: 1, field: 2 }[m], `${m}: the shader told its mode`);
  }
  const [r, g, b] = [0xfc / 255, 0xf9 / 255, 0xf3 / 255], a = CARD.tint, one = [r * a, g * a, b * a, a].map((x) => +x.toFixed(4));
  for (const m of ['blur', 'mesh', 'field']) {
    for (let i = 0; i < cards.length; i++) {
      assert.deepEqual(by[m].glasses[i].tint, one, `${m}, ${cards[i].name}: the one card glass's tint`);
      assert.equal(by[m].glasses[i].sat, CARD.sat, `${m}, ${cards[i].name}: the one card glass's saturation`);
    }
    assert.deepEqual(by[m].glasses.map((x) => x.tint), by.blur.glasses.map((x) => x.tint), `${m}: every glass's tint the same as Blur's`);
  }
  // (The field's cells and the reads' reach, at the canvas's 2 device px a CSS px.)
  assert.equal(SMOOTH.cell, 72, 'F4: 72 px cells');
  assert.equal(by.field.cell, SMOOTH.cell * 2);
  assert.equal(by.mesh.reach, SMOOTH.reach * 2);
});

test('Mesh and Field run no blur passes and have a share of their own; going back to Blur blurs again', async () => {
  M.setGlassMode(root, 'field');
  for (let i = 0; i < 3; i++) await frame();
  lay();
  // (A new picture: the averaged copy made again, never blurred.)
  seq++;
  let L = lay();
  assert.equal(L.passes, 0, 'Field: no blur pass');
  assert.ok(Object.keys(shareStats(fig)).some((k) => k.startsWith('field|')), `Field's own share: ${Object.keys(shareStats(fig))}`);
  assert.ok(!Object.keys(shareStats(fig)).some((k) => !k.startsWith('field|')), 'the Blur share let go once no glass uses it');
  M.setGlassMode(root, 'mesh');
  L = lay();
  assert.equal(L.passes, 0, 'Mesh: no blur pass');
  assert.deepEqual(Object.keys(shareStats(fig)).map((k) => k.split('|')[0]), ['mesh']);
  M.setGlassMode(root, 'blur');
  L = lay();
  assert.ok(L.passes >= 2, `Blur: its two passes (${L.passes})`);
  assert.deepEqual(Object.keys(shareStats(fig)), [`${CARD.blur}|${CARD.scale}`]);
});

test('Off draws no glass: html[data-noglass], the solid look', async () => {
  M.setGlassMode(root, 'off');
  assert.equal(root.hasAttribute('data-noglass'), true);
  assert.equal(root.getAttribute('data-glass'), null);
  G.redraw();   // (the page's observer on html's attributes, faked here)
  clock += 300;
  for (let i = 0; i < 5; i++) await frame();
  assert.equal(lay().glasses.length, 0, 'no glass drawn');
  M.setGlassMode(root, 'mesh');
  G.redraw();
  clock += 300;
  for (let i = 0; i < 5; i++) await frame();
  const L = lay();
  assert.equal(L.glasses.length, all.length, 'back on, in the mode chosen');
  for (const g of L.glasses) assert.equal(g.gm, 1);
});

test('the choice at load: stored, else the old Blur effect switch, else Off on a phone and Blur elsewhere', () => {
  const get = (o) => (k) => (k in o ? o[k] : null);
  assert.equal(M.storedGlassMode(get({ 'pps.glassMode': 'field' })), 'field');
  assert.equal(M.storedGlassMode(get({ 'pps.noGlass': '1' })), 'off');
  assert.equal(M.storedGlassMode(get({ 'pps.noGlass': '0' })), 'blur');
  assert.equal(M.storedGlassMode(get({ 'pps.glassMode': 'nonsense', 'pps.noGlass': '1' })), 'off');
  assert.equal(M.storedGlassMode(get({})), null);
  const fresh = () => { const a = new Map(); return { a, hasAttribute: (k) => a.has(k), getAttribute: (k) => a.get(k) ?? null, setAttribute: (k, v = '') => a.set(k, v), removeAttribute: (k) => a.delete(k) }; };
  for (const [stored, phone, mode] of [[null, true, 'off'], [null, false, 'blur'], ['off', false, 'off'], ['blur', true, 'blur'], ['mesh', true, 'mesh'], ['field', false, 'field']]) {
    const r = fresh();
    assert.equal(M.glassAtLoad(r, { stored, phone }), mode, `${stored} ${phone}`);
    assert.equal(r.hasAttribute('data-noglass'), mode === 'off');
    assert.equal(r.getAttribute('data-glass'), mode === 'mesh' || mode === 'field' ? mode : null);
  }
  // (?noglass=1 set it before: kept, whatever was stored.)
  const q = fresh(); q.setAttribute('data-noglass', '');
  M.glassAtLoad(q, { stored: 'field', phone: false });
  assert.equal(q.hasAttribute('data-noglass'), true);
  // (A pick is stored with the old switch's key kept in step, for the blur guard.)
  const st = new Map();
  M.storeGlassMode((k, v) => st.set(k, v), 'mesh');
  assert.deepEqual(Object.fromEntries(st), { 'pps.glassMode': 'mesh', 'pps.noGlass': '0' });
  M.storeGlassMode((k, v) => st.set(k, v), 'off');
  assert.deepEqual(Object.fromEntries(st), { 'pps.glassMode': 'off', 'pps.noGlass': '1' });
});
