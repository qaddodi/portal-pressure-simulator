// The gallery's specimens opened in Node: the page's own DOM (jsdom), the WebGL stand-in of the warm harness, a clock and a frame queue the
// harness moves by hand. Not a .test.js: imported by tests/gallery-specimens.test.js (plan step 2, /mnt/project-files/card-gallery-plan/faster-checks-recs.md).
// What it can say: the card opens without a throw, its words and numbers as the page puts them in, what it made on the GPU is let go.
// What it cannot: layout (every box is empty in jsdom), shaders, pictures, timing.

let T = 1000;
const timers = new Map();
let tid = 1, order = 0, ask = [];
const addTimer = (fn, ms, every, args) => { const id = tid++; timers.set(id, { fn, at: T + Math.max(0, ms || 0), every, args, o: order++ }); return id; };
function runTimers(until) {
  for (;;) {
    let best = null;
    for (const [id, t] of timers) if (t.at <= until && (!best || t.at < best[1].at || (t.at === best[1].at && t.o < best[1].o))) best = [id, t];
    if (!best) return;
    const [id, t] = best; T = Math.max(T, t.at);
    if (t.every) { t.at += t.every; t.o = order++; } else timers.delete(id);
    t.fn(...t.args);
  }
}
/** Moves the harness's clock on by ms: timers due, then the frames asked for (one display frame each 16.7 ms). */
export function pump(ms = 16.7, frames = 1) {
  for (let i = 0; i < frames; i++) {
    const end = T + ms; runTimers(end); T = end;
    const run = ask; ask = [];
    for (const cb of run) cb(T);
    runTimers(T);
  }
}
const realImmediate = globalThis.setImmediate;
const turn = () => new Promise((ok) => realImmediate(ok));   // (a rest pass is a MessageChannel message: it arrives on a real turn of the event loop)
/** Lets the page run for `frames` display frames, with the real event loop turned between them (rest passes, promises). */
export async function run(frames = 6) { for (let i = 0; i < frames; i++) { await turn(); await turn(); pump(16.7); } await turn(); }

let booted = null;
export async function boot() {
  await import('./gl-live.js');   // (before the stub makes a context: it hooks them)
  if (booted) return booted;
  Object.defineProperty(performance, 'now', { value: () => T, configurable: true });
  Date.now = () => 1.7e12 + T;
  let seed = 12345;
  Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  globalThis.setTimeout = (fn, ms, ...a) => addTimer(fn, ms, 0, a);
  globalThis.setInterval = (fn, ms, ...a) => addTimer(fn, ms, Math.max(1, ms || 1), a);
  globalThis.clearTimeout = globalThis.clearInterval = (id) => { timers.delete(id); };
  globalThis.requestAnimationFrame = (cb) => { ask.push(cb); return ask.length; };
  globalThis.cancelAnimationFrame = () => {};
  const { installPage } = await import('../scripts/warm/dom.mjs');
  const { makeGL } = await import('../scripts/warm/gl-stub.mjs');
  const page = installPage();
  const win = page.dom.window, g = globalThis;
  g.AbortController = win.AbortController;
  g.WebGL2RenderingContext ??= function WebGL2RenderingContext() {};
  for (const k of ['dispatchEvent', 'addEventListener', 'removeEventListener']) if (!g[k]) g[k] = win[k].bind(win);
  const ctx2d = (canvas) => new Proxy({ canvas, measureText: (s) => ({ width: String(s).length * 7, actualBoundingBoxLeft: 0, actualBoundingBoxRight: String(s).length * 7, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3, fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 3 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }), createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }) },
  { get: (o, k) => (k in o ? o[k] : typeof k === 'symbol' ? undefined : () => (k.startsWith('create') ? { addColorStop() {} } : undefined)), set: (o, k, v) => { o[k] = v; return true; } });
  // (A context the page gives up, WEBGL_lose_context, is lost as a browser's is: its objects go with it, which tests/gl-live.js snapshotLive leaves out.)
  const newGL = (canvas) => {
    const gl = makeGL(canvas); (globalThis.__glAll ??= []).push(gl);
    const getExt = gl.getExtension;
    gl.__made = new Error('context made').stack;   // (who made a context that is never given up: a leak names where)
    const lose = { loseContext() { gl.__lost = true; }, restoreContext() { gl.__lost = false; } };
    gl.getExtension = (n) => (n === 'WEBGL_lose_context' ? lose : getExt.call(gl, n));
    gl.isContextLost = () => !!gl.__lost;
    return gl;
  };
  win.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type === '2d') return (this.__2d ??= ctx2d(this));
    return type === 'webgl2' ? (this.__gl ??= newGL(this)) : null;
  };
  g.getComputedStyle = (el, p) => page.liveStyle(el, p);
  booted = { page, win };
  return booted;
}

const turnAll = async (n = 2) => { for (let i = 0; i < n; i++) await turn(); };
/** Pumps the page until a promise settles (the calculator answers through the clock's timers). */
export async function until(p, max = 2000) {
  let done = false, val, err;
  p.then((v) => { done = true; val = v; }, (e) => { done = true; err = e; });
  for (let i = 0; i < max && !done; i++) { await turnAll(); pump(16.7); }
  if (!done) throw new Error('timed out waiting on the page clock');
  if (err) throw err;
  return val;
}

/** Everything the page said or threw while `fn` ran: console errors and warnings, errors the app caught and went on from (caught.js), and a throw. */
export async function watching(fn) {
  const { caughtNow } = await import('../src/ui/caught.js');
  const before = caughtNow(), said = [];
  const ce = console.error, cw = console.warn;
  console.error = (...a) => { said.push(`console.error: ${a.map((x) => (x && x.stack) || String(x)).join(' ').slice(0, 300)}`); };
  console.warn = (...a) => { said.push(`console.warn: ${a.map((x) => String(x)).join(' ').slice(0, 300)}`); };
  let threw = null, value;
  try { value = await fn(); } catch (e) { threw = e; } finally { console.error = ce; console.warn = cw; }
  const after = caughtNow();
  for (const [tag, r] of Object.entries(after)) if (r.n > (before[tag]?.n || 0)) said.push(`caught ${tag}: ${r.last}`);
  return { value, said, threw };
}
/** The words under an element, the text of each node apart (a tile's name and number are two words, not one). */
export const textOf = (el) => {
  if (!el) return '';
  const out = [];
  const walk = (n) => { if (n.nodeType === 3) out.push(n.nodeValue); else for (const c of n.childNodes) walk(c); };
  walk(el);
  return out.join(' ').replace(/\s+/g, ' ').trim();
};

// ── Slides ──
/** A deck's slides as the presenter shows them, without its layout: the instrument in the data card, the tiles, the words. `states` are the slides' model
 *  states ({ fp, snap, params }, deck-states.js deckStatesFull). open(i) puts slide i's cards up with the model's frames running, read() says what they hold,
 *  close() lets them go as the presenter does at the end of a talk. */
export async function slideRig(deck, states) {
  await boot();
  const { createCore } = await import('../src/worker-core.js');
  const { store } = await import('../src/ui/store.js');
  const { createTools } = await import('../src/ui/presenter-tools.js');
  const { bigTiles, tileVal } = await import('../src/ui/presenter-cards.js');
  const { tileKeys } = await import('../src/ui/card-tiles.js');
  const { rich } = await import('../src/ui/presenter-words.js');
  const { makeCalc } = await import('../src/ui/calc-client.js');
  const { kept } = await import('./deck-states.js');
  const frames = [], asked = new Map();
  const core = createCore((m) => { if (m.type === 'frame') frames.push(m); else if (asked.has(m.reqId)) { asked.get(m.reqId)(m); asked.delete(m.reqId); } });
  core.handle({ type: 'visibility', visible: true });
  const calc = makeCalc();
  const slides = deck.slides, stage = {};
  const stateOf = slides.map((_, i) => i);
  const fpOf = (id) => states[slides.findIndex((x) => x.id === id)]?.fp ?? null;
  const changes = (s) => !!(s.preset || s.presetDays || s.params || s.action || s.days);
  const deltaOf = (s, i) => s.delta ?? (i > 0 && !s.preset && changes(s) ? true : null);
  const refOf = (s, i) => { const d = deltaOf(s, i); return (d === true ? states[i - 1]?.fp : typeof d === 'string' ? fpOf(d) : null) || null; };
  // (What the calculator works out on the engine, a sweep or a course, is kept on disk: a second run reads it back.)
  const run = (steps, from, st) => kept('gallery-run', { steps, from: from === undefined ? st?.snap ?? null : from }, async () => {
    const out = [];
    const end = await until(calc.sequence(steps, from === undefined ? st?.snap ?? null : from, (m) => { out[m.i] = { snap: m.snap, base: m.base, params: m.params, fp: m.fp, extra: m.extra, trail: m.trail }; }), 20000);
    return end?.type === 'error' ? null : out;
  });
  const ctxOf = (s, i) => {
    const st = states[i];
    return { slide: s, index: i, deck, slides, stage, store, app: document.body, reveal: 1, state: st, snap: st?.snap ?? null, params: st?.params ?? null, fp: st?.fp ?? null,
      ref: s.tool || s.delta != null ? refOf(s.tool?.delta != null ? { ...s, delta: s.tool.delta } : s, i) : null, enrolled: null, extra: null,
      whenExtra: () => Promise.resolve(null), liveParams: () => store.get().params, fpOf, healthy: () => states[0]?.fp ?? null,
      stateAt: (j) => states[j] ?? null, stateKeys: () => stateOf, shown: () => true,
      request: (type, payload = {}) => calc.request(type, payload), run: (steps, from) => run(steps, from, st) };
  };
  // (The live model is this rig's own core: a request for the steady state's history, a probe change, are answered by it as the page's worker answers.)
  let reqs = 0;
  const host = { request: (type, p) => new Promise((ok) => { const reqId = ++reqs + 1e6; asked.set(reqId, ok); core.handle({ type, reqId, ...p }); }), send: (m) => { core.handle(m); } };
  const RECORDS = ['doppler', 'trace', 'vitals', 'hvpg', 'reading'];   // (the instruments that draw the beats as they come: they are given a second of them)
  const framesKept = new Map();
  async function framesOf(i, rec) {
    const st = states[i], probe = slides[i].tool?.kind === 'doppler' ? slides[i].tool.vessel || 'PV_TRUNK' : 'PV_TRUNK', key = `${JSON.stringify(st.fp)}|${rec}|${probe}`;
    if (!framesKept.has(key)) {
      frames.length = 0;
      core.handle({ type: 'probe', id: probe });
      core.handle({ type: 'restore', snap: st.snap });
      if (rec) core.handle({ type: 'run', running: true });
      await turnAll();
      if (rec) for (let k = 0; k < 4; k++) { pump(33); await turnAll(); }
      core.handle({ type: 'run', running: false });
      await turnAll();
      framesKept.set(key, frames.slice());
    }
    return framesKept.get(key);
  }
  return {
    ctxOf, refOf,
    async open(i, { quick = false } = {}) {
      const s = slides[i], st = states[i], fp = st.fp;
      const mine = await framesOf(i, RECORDS.includes(s.tool?.kind));
      store.set({ params: st.params, frame: mine.at(-1) });
      const tools = createTools({ host, stage }), tiles = bigTiles();
      const root = document.createElement('div');
      root.append(tools.el, tiles.el); document.body.append(root);
      const tileKs = s.data ? tileKeys(s) : [];
      if (s.tool) tools.show(s.tool, { slide: i, stateKey: i, ctx: ctxOf(s, i), chain: [], trail: null, reveal: 1 });
      tools.pin?.(fp);
      if (s.data) tiles.paintTiles(fp, tileKs, s.key || [], refOf(s, i), 0, false, false);
      for (const fr of mine) store.setFrame(fr);
      await runFrames(quick ? 2 : 4);
      return {
        slide: s, fp, tileKeys: tileKs, tools, tiles, root,
        /** The words the cards hold now (the slide's own and what the instrument and the tiles put in the page). */
        read() {
          const line = s.line ? textOf(wrap(rich(s.line, s, fp, !!st.params?.tips?.on))) : '';
          const labels = [...root.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label'));
          const tileRows = tileKs.map((k) => {
            const el = [...tiles.el.querySelectorAll('.pz-tile')][tileKs.indexOf(k)];
            return { key: k, shown: textOf(el?.querySelector('.pzt-v')), wanted: tileVal(k, fp[k], fp), head: textOf(tiles.head.querySelectorAll('.pz-hi')[tileKs.indexOf(k)]?.querySelector('b')) };
          });
          return { title: s.title || '', kicker: s.kicker || '', line, notes: s.notes || '', tool: textOf(tools.el), tiles: textOf(tiles.el), labels, tileRows };
        },
        async close() { tools.hide(); tools.dispose(); tiles.dispose(); root.remove(); await runFrames(2); },
        /** Every context the page still holds (debugging a resource kept per open: GALLERY_WHO=1 names where each was made). */
        held: () => liveContexts().map(madeAt),
      };
    },
  };
}
const runFrames = (n) => run(n);
const wrap = (nodes) => { const d = document.createElement('div'); d.append(...[].concat(nodes).map((n) => (typeof n === 'string' ? document.createTextNode(n) : n))); return d; };

/** The contexts made and not given up. */
export const liveContexts = () => (globalThis.__glAll || []).filter((g) => !g.__lost);
/** Where a context was made: the app's own frames of its stack, the nearest first. */
export const madeAt = (gl) => String(gl.__made || '').split('\n').slice(2).filter((l) => /\/src\//.test(l)).slice(0, 4).map((l) => l.trim().replace(/\(?file:\/\/.*?\/src\//, '(src/').replace(/^at /, '')).join(' < ');
