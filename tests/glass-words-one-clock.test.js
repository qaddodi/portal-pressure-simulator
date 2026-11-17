// A card's words and its glass come in and go out together, on one clock (glass-clock.js). Mohammad, 17 Nov 2026: "there is definitely a sync
// issue between text showing up and glass/cards showing up on multiple things including alerts, cards, test cards, etc. need to fix at root".
// The glass is drawn by the page in its frame; a card's fade was run by the browser's compositor on its own clock, which runs on through a long
// frame while the glass stands still, and which started before the glass had drawn the card at all. The words ran ahead of their frost.
//
// A node replay through the real glass-gl.js, glass-clock.js and frame.js, frame by frame. The page is faked (boxes, styles, classes); each
// animation is a stand-in with the browser's rules (pause, play, currentTime, finish), and what the screen shows of it is its value at the
// compositor's time, sampled in the middle of a long frame too, not only at the frames the main thread makes. Every way a glass card fades
// is replayed: an el.animate() on the card (util.fadeIn: the vessel card, the Tests card's panes), a CSS animation on it (the alerts' fade-rise),
// a CSS transition on the element that holds it (a sheet whose plate is the glass: Details, Treat, the Tests sheet on a phone), and the words
// in an element of their own beside the glass (the talk's teaching card, whose text is not in its shade).
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
const MOs = new Set();
globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; this.q = []; this.roots = []; this.posted = false; } observe(n) { this.roots.push(n); MOs.add(this); } disconnect() { MOs.delete(this); } takeRecords() { const q = this.q; this.q = []; return q; } };
const record = (target, r) => { for (const o of MOs) { let hit = false; for (let e = target; e; e = e.parentElement) if (o.roots.includes(e)) { hit = true; break; } if (!hit) continue; o.q.push({ target, ...r }); if (!o.posted) { o.posted = true; queueMicrotask(() => { o.posted = false; const q = o.takeRecords(); if (q.length) o.cb(q); }); } } };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.window = globalThis; globalThis.devicePixelRatio = 2; globalThis.innerWidth = 1200; globalThis.innerHeight = 800;
globalThis.CSS = { supports: () => true }; globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.WebGL2RenderingContext = class {}; globalThis.Path2D = class {};
globalThis.createImageBitmap = () => Promise.resolve({ close() {} });
const timeline = { get currentTime() { return clock; } };
globalThis.document = { documentElement: { hasAttribute: () => false, setAttribute() {}, removeAttribute() {} }, addEventListener() {}, removeEventListener() {}, timeline, hidden: false, createElement: () => ({ width: 0, height: 0, getContext: () => null }) };

let progs = 0;
const fig = new Proxy({}, { get(_, k) {
  if (typeof k !== 'string') return undefined;
  if (/^[A-Z0-9_]+$/.test(k)) return k;
  if (k === 'isContextLost') return () => false;
  if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
  if (k === 'createProgram') return () => ({ n: ++progs });
  return (...a) => (k.startsWith('create') || k === 'getUniformLocation' ? {} : undefined);
} });
const rect = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t });

// An animation of opacity with the browser's rules. Its time on screen is the compositor's (wall), on the page the main thread's (clock).
let wall = clock;
class Anim {
  constructor(el, from, to, dur, kind, frames = null) {
    Object.assign(this, { el, from, to, dur, kind, playState: 'running', playbackRate: 1, startTime: clock, hold: 0, timeline, ls: {}, ready: Promise.resolve() });
    this.effect = { target: el,
      getKeyframes: () => frames || [{ offset: 0, computedOffset: 0, opacity: String(from), easing: 'linear', composite: 'auto' }, { offset: 1, computedOffset: 1, opacity: String(to), easing: 'linear', composite: 'auto' }],
      getTiming: () => ({ duration: dur, delay: 0, endDelay: 0, easing: 'linear', fill: kind === 'transition' ? 'backwards' : 'both', iterations: 1, direction: 'normal', iterationStart: 0 }) };
    el.anims.push(this);
  }
  timeAt(w) { return this.playState === 'paused' ? this.hold : this.playState === 'finished' ? this.dur : w - this.startTime; }
  get currentTime() { return this.playState === 'idle' ? null : this.timeAt(clock); }
  set currentTime(v) { if (this.playState === 'paused') this.hold = v; else this.startTime = clock - v; }
  pause() { if (this.playState === 'running') { this.hold = this.timeAt(clock); this.playState = 'paused'; } }
  play() { if (this.playState === 'paused') { this.startTime = clock - this.hold; this.playState = 'running'; } }
  finish() { this.playState = 'finished'; this.fire('finish'); }
  fire(t) { queueMicrotask(() => { for (const f of this.ls[t] || []) f(); }); }
  addEventListener(t, f) { (this.ls[t] ||= []).push(f); }
  value(w) { const u = Math.min(1, Math.max(0, this.timeAt(w) / this.dur)); return this.from + (this.to - this.from) * u; }
  // (Shown: running, held, or finished with a fill that keeps its end. A CSS transition ends with no fill: the style it went to stands.)
  shows() { return this.playState === 'running' || this.playState === 'paused' || (this.playState === 'finished' && this.kind !== 'transition'); }
}
// The browser's own turn at each frame: a running animation past its end finishes (its events after).
const tickAnims = () => { for (const e of all) for (const a of e.anims) if (a.playState === 'running' && clock - a.startTime >= a.dur) a.finish(); };

const all = [];
function el(name, r, parent = null) {
  const props = new Map();
  const text = () => [...props].map(([k, v]) => `${k}: ${v};`).join(' ');
  const e = {
    name, rest: r, isConnected: true, parentElement: parent, attrs: new Map(), cls: new Set(), nodeType: 1, anims: [], hidden: false, children: [],
    getAnimations: () => e.anims.filter((a) => a.shows()),
    animate(kf, o) {
      if (kf[0].opacity == null) return new Anim(e, 1, 1, o.duration, 'waapi', kf.map((k, i) => ({ offset: i, computedOffset: i, easing: 'linear', composite: 'auto', ...k })));   // (a move: its opacity stays)
      return new Anim(e, +kf[0].opacity, +kf[1].opacity, o.duration, 'waapi');
    },
    style: {
      setProperty(k, v) { const was = text(); props.set(k, String(v)); if (text() !== was) record(e, { type: 'attributes', attributeName: 'style', oldValue: was }); },
      removeProperty(k) { const was = text(); props.delete(k); if (text() !== was) record(e, { type: 'attributes', attributeName: 'style', oldValue: was }); },
      getPropertyValue: (k) => props.get(k) ?? '', getPropertyPriority: () => '',
      get transform() { return ''; }, get opacity() { return props.get('opacity') ?? ''; }, get translate() { return ''; }, get transition() { return ''; },
    },
    classList: { add: (c) => { if (!e.cls.has(c)) { e.cls.add(c); record(e, { type: 'attributes', attributeName: 'class' }); } }, remove: (c) => { if (e.cls.delete(c)) record(e, { type: 'attributes', attributeName: 'class' }); }, contains: (c) => e.cls.has(c) },
    getAttribute: (k) => (k === 'style' ? text() : e.attrs.get(k) ?? null), hasAttribute: (k) => e.attrs.has(k), setAttribute: (k, v = '') => e.attrs.set(k, String(v)), removeAttribute: (k) => e.attrs.delete(k),
    get dataset() { return {}; },
    // Its own opacity at time w: an animation's value while one shows, else its style (inline or the class's resting value).
    own(w) { const a = e.anims.findLast((x) => x.shows()); if (a) return a.value(w); const p = props.get('opacity'); return p != null ? +p : e.cls.has('out') ? 0 : 1; },
    getBoundingClientRect: () => r, contains: (n) => n === e,
  };
  all.push(e);
  return e;
}
// What the screen shows of an element at compositor time w: its opacity times everything holding it, up to the stage.
const seenAt = (e, w) => { let o = 1; for (let x = e; x && x !== stage; x = x.parentElement) o *= x.own(w); return o; };

const stage = { nodeType: 1, parentElement: null, isConnected: true, getAnimations: () => [], style: {}, contains: () => false, addEventListener() {}, removeEventListener() {}, anims: [], own: () => 1 };
const glassLook = (e) => ({ display: 'block', visibility: 'visible', get opacity() { return String(e.own(clock)); }, filter: 'none', clipPath: 'none', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottomRightRadius: '16px', borderBottomLeftRadius: '16px',
  getPropertyValue: (k) => (k === '--gl-glass' ? '1' : k === '--gl-tint' ? 'rgba(250, 250, 250, 0.66)' : '') });
globalThis.getComputedStyle = (e) => (e && e.anims && e !== stage ? glassLook(e) : { backgroundColor: 'rgba(0, 0, 0, 0)', display: 'block', visibility: 'visible', clipPath: 'none', getPropertyValue: (k) => (k === '--stage-bg' ? '#101820' : ''), opacity: '1', boxShadow: 'none' });
const source = { addEventListener() {}, removeEventListener() {}, width: 2400, height: 1600, getBoundingClientRect: () => rect(0, 0, 1200, 800), getAnimations: () => [], style: {}, parentElement: null, nodeType: 1 };

const F = await import('../src/ui/frame.js');
const { createGlassGL } = await import('../src/ui/glass-gl.js');
const { animRunning, heldOnGlass } = await import('../src/ui/glass-clock.js');

// The glasses on the page now, and for a glass whose words are not inside it, the element they are in.
const glasses = [], words = new Map();
const tops = [];
const add = (t) => { tops.push(t); tops.sort((a, b) => a.order - b.order); return () => { const i = tops.indexOf(t); if (i >= 0) tops.splice(i, 1); }; };
let seq = 1, pend = false;
const present = () => { for (const t of tops) t.prep?.(); for (const t of tops) t.draw(); };
const figFrame = F.frameFor('figure');
const figLoop = () => { seq++; present(); figFrame(figLoop); };
F.onFrameFinal(() => { if (pend) { pend = false; present(); } });
const G = createGlassGL(stage, source, [], { cards: { find: () => glasses, watch: [stage], before: { parentNode: stage }, with: (g) => (words.has(g) ? [words.get(g)] : null) }, version: () => seq });
G.setHost({ gl: fig, canvas: source, add, now: () => { if (F.framePhase()) pend = true; else present(); }, active: () => true, order: { low: 1, high: 3 }, low: () => false, over: () => [], view: () => null });

const settle = () => new Promise((r) => setImmediate(r));
let glassA = new Map();   // (the glass each card has on screen: the last picture laid, which stays on screen through a long frame)
const bad = [];
let watching = [];
function check(when) {
  for (const { g, w, drawnYet } of watching) {
    const seenWords = seenAt(w, wall), ga = glassA.get(g) ?? 0;
    // (Words never shown ahead of their glass, nor a glass left without its words; 0.03: a frame's step of the slowest fade here.)
    if (Math.abs(seenWords - ga) > 0.03) bad.push(`${when} ${g.name}: words ${seenWords.toFixed(3)} glass ${ga.toFixed(3)}${drawnYet() ? '' : ' (glass not drawn yet)'}`);
  }
}
async function frame(stallMs = 0) {
  runTimers(clock);
  await settle();
  // (A long frame: the screen keeps showing the last picture, and the compositor's clock runs on; looked at half way.)
  if (stallMs) { wall = clock + stallMs / 2; check('mid-stall'); }
  clock += stallMs || 16.7; wall = clock;
  tickAnims();
  await settle();
  runTimers(clock - 0.1);
  await settle();
  const q = rafs.splice(0);
  for (const cb of q) cb(clock);
  await settle();
  const d = G.drawn();
  glassA = new Map();
  for (const p of d.panes) glassA.set(p.el, p.a);
  check('frame');
}
figLoop();
for (let i = 0; i < 10; i++) await frame();

// One card's way in and out: shown faded out, faded in by `fadeIn` (a long frame in the middle), held, then faded out by `fadeOut` (again
// with a long frame) and taken off the page.
async function replay(name, { glass, wordsEl, holder, fadeIn, fadeOut }) {
  bad.length = 0;
  glasses.push(glass);
  if (wordsEl) words.set(glass, wordsEl);
  let drawn = false;
  watching = [{ g: glass, w: wordsEl || glass, drawnYet: () => drawn }];
  const target = holder || glass;
  target.classList.add('out');   // (on the page, at 0)
  if (wordsEl && wordsEl !== target) wordsEl.classList.add('out');
  for (let i = 0; i < 4; i++) await frame();
  const inn = fadeIn(target);
  if (wordsEl && wordsEl !== target) fadeIn(wordsEl);
  for (let i = 0; i < 3; i++) { await frame(); drawn ||= glassA.has(glass); }
  await frame(140);   // (the busy frame a card's arrival brings)
  for (let i = 0; i < 30; i++) { await frame(); drawn ||= glassA.has(glass); }
  assert.ok(drawn, `${name}: its glass was drawn`);
  assert.ok(Math.abs((glassA.get(glass) ?? 0) - 1) < 0.01, `${name}: in whole (glass ${glassA.get(glass)})`);
  assert.equal(inn.playState, 'finished', `${name}: its way in finished, as the browser's would`);
  const out = fadeOut(target);
  if (wordsEl && wordsEl !== target) fadeOut(wordsEl);
  await frame(); await frame();
  assert.ok(animRunning(out), `${name}: its way out reads as under way while it is held on the glass's clock`);
  await frame(120);
  for (let i = 0; i < 30; i++) await frame();
  assert.ok(!(glassA.get(glass) > 0.001), `${name}: its glass gone with its words`);
  glasses.splice(glasses.indexOf(glass), 1); words.delete(glass); watching = [];
  for (let i = 0; i < 4; i++) await frame();
  assert.deepEqual(bad, [], `${name}: words and glass apart:\n${bad.slice(0, 6).join('\n')}`);
}
// (A CSS transition or animation is the browser's own: no animate() call announces it, the page's class change does, and the glass finds it.)
const cssFade = (kind, to, dur) => (e) => { const a = new Anim(e, e.own(clock), to, dur, kind); if (to > 0.5) e.classList.remove('out'); else e.classList.add('out'); return a; };
const waapi = (to, dur) => (e) => { const a = e.animate([{ opacity: e.own(clock) }, { opacity: to }], { duration: dur }); if (to > 0.5) e.classList.remove('out'); else e.classList.add('out'); return a; };

test('a vessel card or a Tests pane faded by el.animate(): words and glass on one clock, in and out', async () => {
  const c = el('vessel card', rect(800, 120, 320, 260), stage);
  await replay('vessel card', { glass: c, fadeIn: waapi(1, 300), fadeOut: waapi(0, 240) });
});

test('an alert (toast) faded by its CSS animation: words and glass on one clock, in and out', async () => {
  const t = el('alert', rect(420, 640, 360, 56), stage);
  await replay('alert', { glass: t, fadeIn: cssFade('animation', 1, 220), fadeOut: cssFade('animation', 0, 200) });
});

test('a sheet whose plate is the glass, faded by a CSS transition on the sheet: words and glass on one clock', async () => {
  const sheet = el('sheet', rect(0, 420, 400, 380), stage);
  const plate = el('sheet plate', rect(0, 420, 400, 380), sheet);
  await replay('sheet', { glass: plate, holder: sheet, fadeIn: cssFade('transition', 1, 320), fadeOut: cssFade('transition', 0, 260) });
});

test('a card whose words lie beside its glass (the teaching card and its text): both fades on one clock', async () => {
  const shade = el('teaching card', rect(40, 300, 360, 260), stage);
  const textEl = el('teaching words', rect(40, 300, 360, 260), stage);
  await replay('teaching card', { glass: shade, wordsEl: textEl, fadeIn: cssFade('transition', 1, 300), fadeOut: cssFade('transition', 0, 300) });
});

test('a card hidden at once leaves with its glass in the same frame', async () => {
  const c = el('card hidden at once', rect(600, 100, 300, 200), stage);
  glasses.push(c);
  for (let i = 0; i < 8; i++) await frame();
  assert.ok(glassA.get(c) > 0.99, 'drawn whole at rest');
  c.hidden = true; record(c, { type: 'attributes', attributeName: 'hidden' });
  await frame();
  assert.ok(!glassA.has(c), 'its glass is gone the frame its words are');
  glasses.splice(glasses.indexOf(c), 1);
  for (let i = 0; i < 4; i++) await frame();
});

test('a held fade is given back to the browser when the glass stops drawing', async () => {
  const c = el('card, glass stops', rect(600, 100, 300, 200), stage);
  glasses.push(c);
  c.classList.add('out');
  for (let i = 0; i < 6; i++) await frame();
  const a = waapi(1, 600)(c);
  await frame(); await frame();
  assert.equal(a.playState, 'paused', 'held on the glass clock');
  G.release();   // (the glass gives the figure's canvas back: the browser's glass shows)
  assert.equal(a.playState, 'running', 'given back to the browser at once, running on from where it stood');
  glasses.splice(glasses.indexOf(c), 1);
  for (let i = 0; i < 4; i++) await frame();
});

test('a finger\'s pull on a sheet (an animation the page scrubs itself, num-move.js) is never run by the glass clock', async () => {
  // (Mohammad, 17 Nov 2026, the Layers sheet on the iPhone: "Text flies and moves outside the card". The pull's animate() was taken onto the glass
  // clock in the call itself, before the pull paused it, and the clock ran it on its own time while the finger set it: the words flew off the glass.)
  const c = el('pulled sheet', rect(0, 400, 400, 400), stage);
  glasses.push(c);
  for (let i = 0; i < 6; i++) await frame();
  const a = c.animate([{ translate: '0px 0px' }, { translate: '0px 64px' }], { duration: 64 });
  a.pause();
  for (let i = 0; i < 12; i++) {
    a.currentTime = 10 + i * 3;   // (the finger's distance)
    await frame();
    assert.equal(a.currentTime, 10 + i * 3, 'the finger alone sets where the sheet is');
    assert.equal(heldOnGlass(a), false, 'never held on the glass clock');
  }
  glasses.splice(glasses.indexOf(c), 1);
  for (let i = 0; i < 4; i++) await frame();
});

test('a fade the glass holds is let go, untouched, the moment another script sets its time', async () => {
  const c = el('card scrubbed later', rect(600, 100, 300, 200), stage);
  glasses.push(c);
  c.classList.add('out');
  for (let i = 0; i < 6; i++) await frame();
  const a = waapi(1, 600)(c);
  await frame(); await frame();
  assert.equal(heldOnGlass(a), true, 'held on the glass clock while it plays');
  a.currentTime = 450;   // (another hand takes it: a drag's level)
  await frame();
  assert.equal(heldOnGlass(a), false, 'let go');
  assert.equal(a.currentTime, 450, 'left where the other hand put it');
  glasses.splice(glasses.indexOf(c), 1);
  for (let i = 0; i < 4; i++) await frame();
});
