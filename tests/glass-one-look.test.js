// Every card's glass is one glass. Mohammad, 11 Nov 2026, on the iPad, a case card coming up on the hepatitis C slide: "The tint of the
// glass still changes on case cards. Tint and blur of glass should be the same EVERYWHERE."
// Two things made a card's glass differ: each card drew the tint its own --gl-tint declared (the talk's cards 66 % of the surface, the
// phone's sheets 80 %, the toasts 70 %, the high-contrast bar 92 %), and the figure dipped under a case card (stage-dive.js) was laid at a
// fifth of its alpha, so the glass frosted a faint figure over the stage colour and read pale grey until the figure came back.
// A node replay through the real glass-gl.js and frame.js (the page and the WebGL context faked, every uniform the glass sets recorded):
// every card is drawn with the same tint, saturation and blur whatever it declares, and the frost of the figure dipped is the frost of the
// figure as it stands.
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
globalThis.document = { documentElement: { hasAttribute: () => false, setAttribute() {}, removeAttribute() {} }, addEventListener() {}, removeEventListener() {}, timeline: { get currentTime() { return clock; } }, hidden: false, createElement: () => ({ width: 0, height: 0, getContext: () => null }) };

// The figure's context: every uniform the glass's programs are given, by name, and every shader's source.
const sources = [], set = [];
let blits = 0;
const fig = new Proxy({}, { get(_, k) {
  if (typeof k !== 'string') return undefined;
  if (/^[A-Z0-9_]+$/.test(k)) return k;
  if (k === 'isContextLost') return () => false;
  if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
  if (k === 'createProgram') return () => ({});
  if (k === 'shaderSource') return (_s, src) => { sources.push(src); };
  if (k === 'getUniformLocation') return (_p, name) => ({ name });
  if (k === 'blitFramebuffer') return () => { blits++; };
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
// (The tooltip too, since 13 Nov 2026 (unification audit 13): a dark tint declared, the one card glass drawn.)
const tip = el('tooltip', rect(980, 360, 140, 30), 'rgba(30, 29, 27, 0.8)', true);
const all = [...cards, tip];
for (const e of all) e.parentElement = stage;
const look = (e) => ({ display: 'block', visibility: 'visible', opacity: '1', filter: 'none', boxShadow: 'none', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottomRightRadius: '16px', borderBottomLeftRadius: '16px',
  getPropertyValue: (k) => (k === '--gl-glass' ? '1' : k === '--gl-tint' ? e.tint : k === '--surface' ? SURFACE : '') });
globalThis.getComputedStyle = (e) => (all.includes(e) ? look(e) : { backgroundColor: 'rgba(0, 0, 0, 0)', display: 'block', visibility: 'visible', getPropertyValue: (k) => (k === '--stage-bg' ? '#101820' : ''), opacity: '1', boxShadow: 'none' });
const source = { addEventListener() {}, removeEventListener() {}, width: 2400, height: 1600, getBoundingClientRect: () => rect(0, 0, 1200, 800), getAnimations: () => [], style: {}, parentElement: null, nodeType: 1 };

const F = await import('../src/ui/frame.js');
const { createGlassGL, CARD } = await import('../src/ui/glass-gl.js');

const tops = [];
const add = (t) => { tops.push(t); tops.sort((a, b) => a.order - b.order); return () => { const i = tops.indexOf(t); if (i >= 0) tops.splice(i, 1); }; };
let seq = 1, pend = false, dip = 1;
const present = () => { for (const t of tops) t.prep?.(); for (const t of tops) t.draw(); };
F.onFrameFinal(() => { if (pend) { pend = false; present(); } });
const G = createGlassGL(stage, source, [], { cards: { find: () => all, watch: [stage], before: { parentNode: stage }, region: (e) => ({ card: e.card }) }, version: () => seq, dip: () => dip });
G.setHost({ gl: fig, canvas: source, add, now: () => { if (F.framePhase()) pend = true; else present(); }, active: () => true, order: { low: 1, high: 3 }, over: () => [], view: () => null });

const settle = () => new Promise((r) => setImmediate(r));
async function frame() {
  runTimers(clock); await settle();
  clock += 16.7; runTimers(clock - 0.1); await settle();
  for (const cb of rafs.splice(0)) cb(clock);
  await settle();
}
// One picture laid (the figure's present, as the figure's renderer lays one): what the glass set while it drew, glass by glass.
function lay() {
  set.length = 0; seq++;
  present();
  const draws = [];
  let un = null, sat = null;
  for (const u of set) {
    if (u.name === 'uUn') un = u.v;
    if (u.name === 'uSat') sat = u.v;
    if (u.name === 'uTint') draws.push({ tint: u.v.map((x) => +x.toFixed(4)), un, sat });
  }
  return draws;
}
for (let i = 0; i < 20; i++) await frame();

test('every card, menu, pill and callout is drawn with one glass: the same tint and saturation, whatever its own --gl-tint declares', () => {
  const draws = lay();
  assert.equal(draws.length, all.length, `every glass drawn: ${draws.length} of ${all.length}`);
  const [r, g, b] = [0xfc / 255, 0xf9 / 255, 0xf3 / 255], a = CARD.tint;
  const one = [r * a, g * a, b * a, a].map((x) => +x.toFixed(4));
  const cardDraws = draws.slice(0, cards.length);
  for (let i = 0; i < cards.length; i++) {
    assert.deepEqual(cardDraws[i].tint, one, `${cards[i].name}: its glass's tint is not the one card glass (surface at ${a})`);
    assert.equal(cardDraws[i].sat, CARD.sat, `${cards[i].name}: its glass's saturation`);
  }
  assert.equal(CARD.tint, 0.66, 'the card glass is the surface at 66 % (app.css --pz-frost)');
  assert.equal(CARD.blur, 22, 'the card glass blurs 22 px');
  assert.deepEqual(draws.at(-1).tint, one, 'the tooltip: the one card glass too');
});

test('the figure dipped under a case card: the glass frosts the figure as it stands, the same as undipped', () => {
  let draws = lay();
  for (const d of draws) assert.equal(d.un, 1, 'undipped: the copy is taken as it is');
  // The case card comes up: the figure is laid at its dip from now on (stage-dive.js FIG_DIP).
  dip = 0.22;
  const b0 = blits;
  draws = lay();
  assert.ok(blits > b0, 'a new dip: the copy under the glasses is blurred again, all of it at that dip');
  for (const d of draws) assert.ok(Math.abs(d.un * 0.22 - 1) < 1e-9, `the glass takes the dip back out of its copy: uUn ${d.un}`);
  for (let i = 0; i < cards.length; i++) assert.deepEqual(draws[i].tint, lay()[i].tint, 'the tint unchanged by the dip');
  // The glass's own sum, as its shader does it (read from the program the glass gave the context): the same frost dipped or not.
  const fs = sources.find((s) => s.includes('uniform float uUn;'));
  assert.ok(fs, 'the glass program takes the dip');
  assert.match(fs, /s \*= min\(uUn, 1\.0 \/ max\(s\.a, 0\.0001\)\);\n {2}vec3 c = s\.rgb \+ uBg \* \(1\.0 - s\.a\);/, 'the copy taken back to the figure before it is laid over the stage colour');
  const bg = [0x10 / 255, 0x18 / 255, 0x20 / 255];
  const frost = (f, d) => { const s = f.map((x) => x * d), u = Math.min(1 / d, 1 / Math.max(s[3], 1e-4)); const q = s.map((x) => x * u); return [0, 1, 2].map((i) => q[i] + bg[i] * (1 - q[3])); };
  for (const f of [[0.6, 0.1, 0.12, 0.9], [0.2, 0.3, 0.5, 1], [0.05, 0.05, 0.05, 0.1], [0, 0, 0, 0]]) {
    const at = frost(f, 1), dipped = frost(f, 0.22);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(at[i] - dipped[i]) < 1e-9, `a figure pixel ${f}: frost ${at} undipped, ${dipped} dipped`);
  }
  // (A pixel laid whole in a dip, not weighed by it (a label at its own alpha, the lobule): never brighter than whole.)
  const whole = [0.4, 0.4, 0.4, 1], s = whole.map((x) => x * Math.min(1 / 0.22, 1 / whole[3]));
  assert.deepEqual(s, whole);
  // The card goes: the figure comes back, and so does the copy.
  dip = 1;
  draws = lay();
  for (const d of draws) assert.equal(d.un, 1);
});
