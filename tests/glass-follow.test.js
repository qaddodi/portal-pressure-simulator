// The callouts' GPU glass leaves and fades with its words (27 Oct: "the callouts for FHVP and WHVP backgrounds glitch; sometimes
// remain on slide when next slide is transitioning"). The glass is drawn on a canvas beside the callout layers, so a fade put on a
// whole layer (the DOM fades the words and the outline with it) never reached it: the pills stayed solid until their words were removed.
// Now the glass takes the opacity of everything that holds it up to its layer, never sleeps while a script's fade or a long transition
// runs in the layers, and the HVPG catheter's readings leave through their own fade (cath-pre, cath-out) instead of a fade of the layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rafs = [];
globalThis.requestAnimationFrame = (cb) => { rafs.push(cb); return rafs.length; };
let clock = 0;
globalThis.performance = { now: () => clock };
const timers = new Map();
let tid = 0;
globalThis.setTimeout = (f, ms) => { timers.set(++tid, { f, ms }); return tid; };
globalThis.clearTimeout = (id) => { timers.delete(id); };
const observers = new Set();
globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; } observe() { observers.add(this); } disconnect() { observers.delete(this); } takeRecords() { return []; } };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.window = globalThis;
globalThis.devicePixelRatio = 2;
globalThis.CSS = { supports: () => true };
globalThis.matchMedia = () => ({ matches: false });
globalThis.WebGL2RenderingContext = class {};
globalThis.Path2D = class {};
globalThis.createImageBitmap = () => Promise.resolve({ close() {} });

// A GL that names its uniforms, so the opacity a glass was drawn with can be read back.
const gls = { alpha: [], draws: 0, clears: 0 };
function fakeGL() {
  let progs = 0, prog = null;
  return new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return 1;
      if (k === 'getExtension') return () => ({ loseContext() {} });
      if (k === 'isContextLost') return () => false;
      if (k === 'getProgramParameter') return () => true;
      if (k === 'createProgram') return () => ({ n: ++progs });
      if (k === 'useProgram') return (p) => { prog = p; };
      if (k === 'getUniformLocation') return (_p, name) => ({ name });
      if (k === 'uniform1f') return (loc, v) => { if (loc.name === 'uA') gls.alpha.push(v); };
      return () => {
        if (k === 'drawArrays' && prog?.n === 2) gls.draws++;
        if (k === 'clear') gls.clears++;
        return k.startsWith('create') ? {} : undefined;
      };
    },
  });
}
const rect = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h });
const wrapEl = { parentElement: null };
const glassCanvas = { parentNode: null, width: 0, height: 0, setAttribute() {}, getContext: () => fakeGL(), getBoundingClientRect: () => rect(0, 0, 800, 600), addEventListener() {}, removeEventListener() {}, remove() {} };
const ctx2d = { fillStyle: '', setTransform() {}, fill() {} };
let canvases = 0;
globalThis.document = {
  documentElement: { hasAttribute: () => false },
  createElement: () => (canvases++ ? { width: 0, height: 0, getContext: () => ctx2d } : glassCanvas),
};
const css = new Map();
globalThis.getComputedStyle = (el) => css.get(el) || { backgroundColor: '#101820', getPropertyValue: () => '', boxShadow: 'none' };

// A callout inside a layer, inside the stage: glass < callout < layer < stage (the canvas lies beside the layer).
const layerStyle = { opacity: '1' };
const layer = { parentElement: wrapEl, m: new Map(), anims: [], before(c) { c.parentNode = wrapEl; }, addEventListener(t, f) { this.m.set(f, t); }, removeEventListener(t, f) { this.m.delete(f); },
  getAnimations() { return this.anims; }, getElementsByClassName() { return [glass]; } };
const card = { parentElement: layer, getBoundingClientRect: () => rect(100, 100, 200, 80) };
const glass = { parentElement: card, isConnected: true, style: { width: '200px', height: '80px' }, attrs: new Set(),
  firstChild: { firstChild: { getAttribute: () => 'M0 0H200V80H0Z' } }, getBoundingClientRect: () => rect(100, 100, 200, 80),
  hasAttribute(k) { return this.attrs.has(k); }, setAttribute(k) { this.attrs.add(k); }, removeAttribute(k) { this.attrs.delete(k); } };
css.set(layer, layerStyle);
css.set(card, { opacity: '1', boxShadow: 'none' });
css.set(glass, { display: 'block', visibility: 'visible', opacity: '1', getPropertyValue: () => '#ffffff' });
const stageEl = { classList: { contains: () => true } };
const source = { width: 1600, height: 1200, getBoundingClientRect: () => rect(0, 0, 800, 600) };

const { createGlassGL } = await import('../src/ui/glass-gl.js');
const flush = async () => { await new Promise((r) => setImmediate(r)); };
const frame = () => { clock += 16; const q = rafs.splice(0); for (const cb of q) cb(clock); };
const frames = async (k) => { for (let i = 0; i < k; i++) { frame(); await flush(); } };
const write = async () => { [...observers][0].cb([]); await flush(); };   // (a callout written: drawn in the microtask after it)

const G = createGlassGL(stageEl, source, [layer], { version: () => 1, capture() {}, onFigure: () => () => {} });

test('a glass shows at its own opacity times its layer\'s: a faded layer fades the pills with their words', async () => {
  assert.ok(G);
  await frames(4);   // (the first copy in, drawn)
  assert.ok(gls.draws > 0, 'drawn');
  assert.equal(gls.alpha.at(-1), 1);
  layerStyle.opacity = '0.5';
  await write();
  assert.equal(gls.alpha.at(-1), 0.5, 'half as strong as its layer is');
  layerStyle.opacity = '0.2'; css.get(card).opacity = '0.5';
  await write();
  assert.ok(Math.abs(gls.alpha.at(-1) - 0.1) < 1e-9, 'the callout\'s own fade and the layer\'s multiply');
  css.get(card).opacity = '1';
});

test('a layer faded away leaves no glass: the canvas is cleared once and nothing is drawn', async () => {
  layerStyle.opacity = '0';
  const c = gls.clears, d = gls.draws;
  await write();
  assert.equal(gls.clears, c + 1, 'cleared');
  assert.equal(gls.draws, d, 'nothing drawn');
  layerStyle.opacity = '1';
  await write();
  await frames(3);
  assert.ok(gls.draws > d, 'drawn again once the layer is back');
  assert.ok(glass.attrs.has('data-gl'));
});

test('it stays awake while a script\'s fade runs in the layer, which sends no event, and sleeps once it has ended', async () => {
  await frames(4);
  assert.equal(rafs.length, 0, 'asleep before');
  const fade = { playState: 'running', effect: { getComputedTiming: () => ({ endTime: 220 }) } };
  layer.anims = [fade];
  await write();
  await frames(6);
  assert.ok(rafs.length > 0, 'still asking for frames while the fade runs');
  layer.anims = [];
  await frames(5);
  assert.equal(rafs.length, 0, 'asleep again once nothing animates');
});

test('an animation that never ends does not hold it awake', async () => {
  layer.anims = [{ playState: 'running', effect: { getComputedTiming: () => ({ endTime: Infinity }) } }];
  await write();
  await frames(5);
  assert.equal(rafs.length, 0);
  layer.anims = [];
});

test('the catheter\'s readings leave through their own fade, not a fade of the whole layer', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const fn = stage.slice(stage.indexOf('function cathFadeOut()'), stage.indexOf('// the catheter\'s vertices, reused frame to frame'));
  assert.ok(fn.length > 200, 'found');
  assert.match(fn, /for \(const el of cath\.made\?\.values\(\) \|\| \[\]\) el\.classList\.add\('cath-pre', 'cath-out'\);/);
  assert.doesNotMatch(fn, /cath\.labels, cath\.g/, 'the layer is not animated as a whole');
  assert.doesNotMatch(fn, /cath\.labels\.animate/);
  // The readings are removed only once faded: the CSS fade (.35 s, app.css .cath-out) is shorter than the time they are kept.
  const keep = Number(stage.match(/const CATH_OUT_MS = \d+, READING_OUT_MS = (\d+);/)?.[1]);
  assert.ok(keep >= 400, `READING_OUT_MS ${keep}`);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.cath-label\.cath-out > \*[^{]*\{ transition-duration: \.35s !important/);
  assert.match(css, /\.cath-label\.cath-pre \{ --lo: 0; \}/);
});

// ── The two readings' travel into the summary (cath-flip.js) ──
const { bezier, flipFrom, flipAt, FLIP_MS } = await import('../src/ui/cath-flip.js');

test('the travel\'s curve is CSS\'s cubic-bezier(.2, .8, .2, 1): the same ease it had as a transition', () => {
  const e = bezier(0.2, 0.8, 0.2, 1);
  assert.equal(e(0), 0); assert.equal(e(1), 1);
  // (Reference values of that curve, read from the CSS definition: x(s) = 3(1-s)²s·.2 + 3(1-s)s²·.2 + s³, y likewise.)
  const ref = (t) => {
    const x = (s) => 3 * (1 - s) ** 2 * s * 0.2 + 3 * (1 - s) * s * s * 0.2 + s ** 3;
    const y = (s) => 3 * (1 - s) ** 2 * s * 0.8 + 3 * (1 - s) * s * s * 1 + s ** 3;
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (x(m) < t) lo = m; else hi = m; }
    return y((lo + hi) / 2);
  };
  for (const t of [0.05, 0.1, 0.25, 0.5, 0.75, 0.9]) assert.ok(Math.abs(e(t) - ref(t)) < 1e-4, `t ${t}: ${e(t)} against ${ref(t)}`);
  let prev = 0;
  for (let i = 1; i <= 40; i++) { const v = e(i / 40); assert.ok(v >= prev - 1e-9, 'never turns back'); prev = v; }
  // A curve Newton's steps cannot solve (flat at its start) is solved by halving.
  const flat = bezier(0, 0, 1, 1);
  assert.ok(Math.abs(flat(0.5) - 0.5) < 1e-4);
});

test('a reading starts exactly where its pill was, eases in, and lands without a step', () => {
  const f = flipFrom(120, -40, 1000);
  assert.deepEqual([flipAt(f, 1000).x, flipAt(f, 1000).y, flipAt(f, 1000).done], [120, -40, false], 'the first frame is where the pill stood');
  assert.deepEqual(flipAt(f, 900), { x: 120, y: -40, done: false }, 'before it begins it waits there');
  const mid = flipAt(f, 1000 + FLIP_MS / 2);
  assert.ok(mid.x < 120 * 0.2 && mid.x > 0, `an ease-out: most of the way gone by the middle (${mid.x})`);
  assert.ok(Math.abs(mid.y / -40 - mid.x / 120) < 1e-9, 'x and y go together');
  let prev = Infinity;
  for (let t = 0; t <= FLIP_MS; t += 16) { const q = flipAt(f, 1000 + t); assert.ok(q.x <= prev + 1e-9, 'only toward its row'); prev = q.x; }
  const end = flipAt(f, 1000 + FLIP_MS);
  assert.deepEqual(end, { x: 0, y: 0, done: true });
  assert.equal(flipAt(f, 1000 + FLIP_MS + 500).done, true);
});

test('the travel is written each frame on the main thread, not left to a CSS transition the compositor runs', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(stage, /r\._flip = flipFrom\(a\.left - b\.left, a\.top - b\.top, performance\.now\(\)\);/);
  assert.match(stage, /const q = flipAt\(f, performance\.now\(\)\);\s*r\.style\.transform = q\.done \? '' : `translate\(/);
  // It asks for the next frame until every reading has landed, as a glide does.
  assert.match(stage, /if \(travelling && !cath\.glideRaf\) cath\.glideRaf = nextFrame\(\(\) => \{ cath\.glideRaf = 0; cath\.lblKey = ''; cathLabelsSoon\(\); \}\);/);
  assert.doesNotMatch(stage, /transform \.6s var\(--ease\)/, 'no transform transition on a reading');
  assert.doesNotMatch(css, /\.cath-label[^{]*\{[^}]*transition:[^;}]*\btransform\b/, 'none in the stylesheet either');
});
