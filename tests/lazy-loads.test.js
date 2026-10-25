// Review 22 Oct, item 10: the lobule view, the sinusoid view, the Doppler and the FibroScan load after the first paint (about 700 kB of
// script that most sessions open late or never). These tests pin the three things that make that safe: the first load really does not
// reach them, nothing a late-built layer or pane would have heard is lost, and the page keeps the order it had.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI = fileURLToPath(new URL('../src/ui/', import.meta.url));
const read = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

// ── The first load ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Every module main.js reaches through static imports is in the first download; the lazily loaded ones are reached through import() only.
const STATIC = /^\s*(?:import|export)\b[^;'"]*?(?:from\s*)?['"](\.{1,2}\/[^'"?]+\.js)(?:\?v=[0-9a-f]+)?['"]/gm;
function staticGraph(entry) {
  const seen = new Map();
  const walk = (file, from) => {
    if (seen.has(file)) return;
    seen.set(file, from);
    for (const m of readFileSync(file, 'utf8').matchAll(STATIC)) walk(resolve(dirname(file), m[1]), file);
  };
  walk(entry, null);
  return seen;
}

test('the first load does not reach the lobule, the sinusoid view, the Doppler or the FibroScan', () => {
  const first = staticGraph(UI + 'main.js');
  for (const f of ['lobule-zoom', 'sinusoid-view', 'sinusoid-gl', 'doppler', 'doppler-gl', 'fibroscan', 'fibroscan-gl']) {
    const from = first.get(resolve(UI, f + '.js'));
    assert.equal(from, undefined, `${f}.js is in the first load (imported by ${from})`);
  }
  assert.ok(first.size > 50, 'the walk found the app');
});

test('each is loaded by import(), when its time comes', () => {
  assert.match(read('stage.js'), /import\('\.\/lobule-zoom\.js\?v=[0-9a-f]+'\)/);
  assert.match(read('main.js'), /lazy\(\(\) => import\('\.\/doppler\.js\?v=[0-9a-f]+'\), \(\{ createDoppler \}\) => createDoppler\(\{ onProbe: probeTo \}\)\)/);
  assert.match(read('main.js'), /lazy\(\(\) => import\('\.\/fibroscan\.js\?v=[0-9a-f]+'\), \(\{ createFibroScan \}\) => createFibroScan\(\)\)/);
  for (const file of ['main.js', 'presenter.js']) assert.match(read(file), /import \{ sinusoidSupported \} from '\.\/gl-support\.js/, `${file} asks gl-support.js, which does not load the view`);
  assert.doesNotMatch(read('main.js'), /from '\.\/sinusoid-view\.js/);
});

// ── The lobule's layer, built late ────────────────────────────────────────────────────────────────────────────────────────
test('the stage builds the lobule layer when its code has come, in the place in the page it always had', () => {
  const stage = read('stage.js');
  assert.doesNotMatch(stage, /^import .*lobule-zoom/m, 'no static import');
  assert.match(stage, /const lzAnchor = document\.createComment\('lobule'\);\s*\n\s*wrap\.append\(lzAnchor\);/, 'a marker takes the layer\'s place where it was built');
  assert.match(stage, /lz = createLobuleZoom\(\{ host: wrap, styles: wrapCS, before: lzAnchor \}\)/);
  const lobule = read('lobule-zoom.js'), view = read('sinusoid-view.js');
  assert.match(lobule, /host\.insertBefore\(field, before\); host\.insertBefore\(el, before\);/);
  assert.match(lobule, /createSinusoidView\(\{ host, before \}\)/, 'the sinusoid view sits in the same place');
  assert.match(view, /host\.insertBefore\(el, before\);/);
  assert.doesNotMatch(lobule, /host\.append\(/);
  assert.doesNotMatch(view, /host\.append\(/);
});

test('a dive asked for before the layer exists goes on when it does, with the slide\'s aim and the frame as they stand', () => {
  const stage = read('stage.js');
  const open = stage.slice(stage.indexOf('function openLobule('), stage.indexOf('function closeLobule()'));
  assert.match(open, /if \(!lz\) \{\s*\n\s*if \(!lzWaiting\) \{[\s\S]*?lobuleReady\(\)\.then\(\(\) => \{ lzWaiting = false; if \(store\.get\(\)\.lobule\) openLobule\(\); \}/);
  assert.ok(open.indexOf("store.set({ view: 'anatomic' })") < open.indexOf('if (!lz)'), 'the view turns to the anatomy while the code loads');
  assert.match(open, /store\.set\(\{ lobule: false, sinusoid: false \}\)/, 'a load that fails puts the switch back');
  const ready = stage.slice(stage.indexOf('function lobuleReady()'), stage.indexOf('// ── Detail'));
  assert.ok(ready.indexOf('lz.aim(...aimWait)') > ready.indexOf('createLobuleZoom(') && ready.indexOf('lz.update(F)') > ready.indexOf('lz.aim('));
  assert.match(stage, /lobuleAim: \(part, opts\) => \{ if \(lz\) lz\.aim\(part, opts\); else \{ aimWait = \[part, opts\]; lobuleReady\(\)\.catch\(\(\) => \{\}\); \} \}/);
});

test('the first dive is prepared ahead as before: the code is fetched as the figure is shown, the layer built when the page is quiet', () => {
  const stage = read('stage.js');
  const prep = stage.slice(stage.indexOf('function prepLobule()'), stage.indexOf('let catchUp = false'));
  assert.match(prep, /if \(figureShown && !lzLoad && !lzSoon\) \{ lzSoon = true; lobuleCode\(\)\.catch\(\(\) => \{\}\); prepIdle\(\(\) => lobuleReady\(\)\.then\(\(\) => prepLobule\(\)/);
  assert.match(stage, /const lobuleCode = \(\) => \(lzCode \|\|= import\('\.\/lobule-zoom\.js\?v=[0-9a-f]+'\)/);
  assert.match(prep, /if \(prepBusy \|\| !figureShown \|\| now - prepAt < 1000\) return;/);
  assert.match(prep, /lz\.preparePieces\(\)/);
});

test('a layer built after the store was set reads the slide\'s callout and a sinusoid already asked for', () => {
  const lobule = read('lobule-zoom.js');
  assert.match(lobule, /const onCallout = \(\) => \{/);
  assert.match(lobule, /store\.on\('lobuleCallout', onCallout\);/);
  assert.match(lobule, /\n {2}onCallout\(\);\n {2}if \(store\.get\(\)\.sinusoid\) diveSinusoid\(true\);\n {2}return api;\n\}/);
});

// ── gl-support.js ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// A small tree of fake elements (Node has no DOM): enough for h(), a pane's swap and the support check.
class Fake {
  constructor(tag) { this.tag = tag; this.nodeType = 1; this.children = []; this.parentNode = null; this.attrs = {}; this.style = { setProperty() {} }; this._cls = new Set(); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._cls].join(' '); }
  get classList() { const c = this._cls; return { add: (k) => c.add(k), remove: (k) => c.delete(k), contains: (k) => c.has(k) }; }
  get textContent() { return this.children.map((n) => n.data ?? n.textContent).join(''); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  append(...ns) { for (const n of ns) { n.parentNode = this; this.children.push(n); } }
  replaceChildren(...ns) { for (const c of this.children) c.parentNode = null; this.children = []; this.append(...ns); }
  replaceWith(n) { const p = this.parentNode; if (!p) return; p.children[p.children.indexOf(this)] = n; n.parentNode = p; this.parentNode = null; }   // (a node with no parent: nothing happens, as in a browser)
}
let canvas = null;   // a test sets what a canvas gives for getContext
document.createElement = (tag) => (tag === 'canvas' && canvas ? canvas() : new Fake(tag));
document.createTextNode = (data) => ({ nodeType: 3, data: String(data), parentNode: null });

test('asking whether the sinusoid view can run makes one context and gives it back; the view\'s own answer replaces it', async () => {
  let made = 0, lost = 0;
  canvas = () => ({ getContext: (k) => (k === 'webgl2' ? (made++, { getExtension: (n) => (n === 'WEBGL_lose_context' ? { loseContext() { lost++; } } : null) }) : null) });
  const g = await import('../src/ui/gl-support.js?a');
  assert.equal(g.sinusoidSupported(), true);
  assert.equal(g.sinusoidSupported(), true);
  assert.deepEqual([made, lost], [1, 1], 'one throwaway context, handed back at once, asked for once');
  g.noteSinusoidSupport(false);
  assert.equal(g.sinusoidSupported(), false, 'the view could not make its own: that is the answer');
  assert.deepEqual([made, lost], [1, 1], 'and nothing more is made');
  // A browser without WebGL2:
  canvas = () => ({ getContext: () => null });
  assert.equal((await import('../src/ui/gl-support.js?b')).sinusoidSupported(), false);
  canvas = () => ({ getContext() { throw new Error('blocked'); } });
  assert.equal((await import('../src/ui/gl-support.js?c')).sinusoidSupported(), false);
  canvas = null;
});

// ── The panes ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const tick = () => new Promise((r) => setTimeout(r, 0));
function instrument() {
  const el = new Fake('div'); el.className = 'dock-pane dop';
  const log = [];
  return { el, log, ingest: (f) => log.push(['ingest', f]), update: (f) => log.push(['update', f]), redraw: () => log.push(['redraw']), clear: () => log.push(['clear']) };
}
/** main.js lazy(): get() builds the instrument once; now() is it, once built. */
function handleOf(load) {
  let inst = null, pending = null;
  const h = { loads: 0, now: () => inst, get: () => (pending ||= (h.loads++, load().then((i) => (inst = i)))) };
  return h;
}

test('a pane waits for its instrument, keeps the frames it is fed, and the instrument takes its place with them', async () => {
  const { lazyPane } = await import('../src/ui/lazy-pane.js');
  let release; const gate = new Promise((r) => (release = r));
  const real = instrument(), handle = handleOf(() => gate.then(() => real));
  let ready = 0;
  const pane = lazyPane({ id: 'doppler', label: 'Doppler', handle, cls: 'dop', history: 3, slim: (f) => ({ n: f.n }), onReady: () => ready++ });
  const section = new Fake('section'); section.append(pane.el);
  assert.ok(pane.el.classList.contains('instrument-view') && pane.el.classList.contains('dop'), 'the empty pane lays out as the real one will');
  for (let n = 1; n <= 5; n++) pane.ingest({ n, big: new Float32Array(8) });
  pane.redraw();   // (nothing to draw yet)
  const wait = pane.need();
  assert.ok(wait instanceof Promise && pane.need() === wait, 'asked for once: the same promise');
  assert.equal(handle.loads, 1);
  release(); await wait;
  assert.equal(pane.need(), null, 'null once it is in');
  assert.equal(section.children[0], real.el, 'the instrument is in the pane');
  assert.ok(real.el.classList.contains('instrument-view') && !real.el.classList.contains('dock-pane'), 'dressed as the dock dresses its instruments');
  assert.deepEqual(real.log.map(([k, f]) => [k, f.n, 'big' in f]), [['ingest', 3, false], ['ingest', 4, false], ['ingest', 5, true]], 'the last three frames, the latest whole');
  assert.equal(ready, 1, 'the dock refits around it');
  pane.ingest({ n: 6 }); pane.redraw(); pane.clear();
  assert.deepEqual(real.log.slice(3).map(([k]) => k), ['ingest', 'redraw', 'clear'], 'from then on everything goes straight through');
});

test('what is cleared before the instrument arrives is not given to it, and the last frame of a gauge is', async () => {
  const { lazyPane } = await import('../src/ui/lazy-pane.js');
  const real = instrument(), handle = handleOf(async () => real);
  const trace = lazyPane({ id: 'doppler', label: 'Doppler', handle, history: 10, slim: (f) => f });
  trace.ingest({ n: 1 }); trace.ingest({ n: 2 }); trace.clear(); trace.ingest({ n: 3 });
  await trace.need();
  assert.deepEqual(real.log.map(([k, f]) => [k, f.n]), [['ingest', 3]]);
  const gauge = instrument(), fibro = lazyPane({ id: 'fibroscan', label: 'FibroScan', handle: handleOf(async () => gauge) });
  fibro.update({ n: 1 }); fibro.update({ n: 2 });
  await fibro.need();
  assert.deepEqual(gauge.log.map(([k, f]) => [k, f.n]), [['update', 2]]);
});

test('an instrument loaded ahead is the pane itself, and a load that fails leaves a note and is tried again', async () => {
  const { lazyPane } = await import('../src/ui/lazy-pane.js');
  const ahead = instrument(), loaded = handleOf(async () => ahead);
  await loaded.get();
  assert.equal(lazyPane({ id: 'doppler', label: 'Doppler', handle: loaded }), ahead);
  let tries = 0; const real = instrument();
  const flaky = { now: () => null, get: () => (tries++ ? Promise.resolve(real) : Promise.reject(new Error('offline'))) };
  const warn = console.warn; console.warn = () => {};
  try {
    const pane = lazyPane({ id: 'fibroscan', label: 'FibroScan', handle: flaky });
    const section = new Fake('section'); section.append(pane.el);
    await pane.need();   // (a failed load settles too: it never leaves the dock waiting)
    assert.match(pane.el.textContent, /FibroScan did not load\. Tap its tab to try again\./);
    await pane.need();
    assert.equal(section.children[0], real.el, 'the second try brings it in');
  } finally { console.warn = warn; }
});

test('a tab for an instrument still on its way waits for it, and the latest tab wins', async () => {
  const { holdUntilLoaded } = await import('../src/ui/lazy-pane.js');
  const releases = {}, panes = {
    ready: { need: () => null },
    slow: { need: () => (releases.slow ||= Promise.withResolvers()).promise },
    slower: { need: () => (releases.slower ||= Promise.withResolvers()).promise },
    plain: {},
  };
  const afterLoad = holdUntilLoaded((id) => panes[id]), went = [];
  assert.equal(afterLoad('ready', () => went.push('ready')), false, 'already in: the caller goes on at once');
  assert.equal(afterLoad('plain', () => went.push('plain')), false, 'an instrument that is never lazy');
  assert.equal(afterLoad('nothing', () => went.push('nothing')), false);
  assert.deepEqual(went, [], 'go is not called when the caller goes on itself');
  assert.equal(afterLoad('slow', () => went.push('slow')), true);
  assert.equal(afterLoad('slower', () => went.push('slower')), true, 'a second tab before the first has come');
  releases.slow.resolve(); releases.slower.resolve(); await tick();
  assert.deepEqual(went, ['slower'], 'only the latest tab is shown');
  assert.equal(afterLoad('slow', () => went.push('again')), true);
  assert.equal(afterLoad('ready', () => went.push('x')), false, 'a tab that needs no wait replaces the one that was waiting');
  releases.slow.resolve(); await tick();
  assert.deepEqual(went, ['slower'], 'and the one that was waiting does not come back over it');
});

test('the dock holds the two panes, loads them when the card opens, a tab is touched or shown, and when idle, and never shows one empty', () => {
  const dock = read('dock.js'), main = read('main.js');
  assert.doesNotMatch(dock, /from '\.\/(doppler|fibroscan)\.js/);
  assert.match(dock, /lazyPane\(\{ id: 'doppler', label: 'Doppler', handle: lazy\.doppler, cls: 'dop', history: 2000, slim: dopplerSlim, onReady: \(\) => \{ fitHeight\(\); queueRefresh\(\); \} \}\)/);
  assert.match(dock, /lazyPane\(\{ id: 'fibroscan', label: 'FibroScan', handle: lazy\.fibroscan, onReady: \(\) => \{ fitHeight\(\); queueRefresh\(\); \} \}\)/);
  assert.match(dock, /for \(const id of open\) byId\[id\]\.need\?\.\(\);/, 'an instrument left open comes in with the dock');
  assert.match(dock, /const afterLoad = holdUntilLoaded\(\(id\) => byId\[id\]\);/);
  assert.match(dock, /function pick\(id\) \{\s*\n\s*if \(!afterLoad\(id, \(\) => pickNow\(id\)\)\) pickNow\(id\);/, 'a tapped or swiped-to tab waits for its instrument');
  assert.match(dock, /if \(!afterLoad\(id, \(\) => showNow\(id, opts\)\)\) showNow\(id, opts\);/, 'so does show() (a button, the palette, a card)');
  assert.match(dock, /!byId\[TABS\[j\]\]\.need\?\.\(\) \? paneFor\(TABS\[j\]\) : null/, 'a swipe does not slide an unfinished pane in');
  assert.match(dock, /if \(!preloaded && isVisible\(\)\) \{ preloaded = true; load\(\); \}/, 'asked for as the card opens');
  assert.match(dock, /for \(const ev of \['pointerenter', 'pointerdown', 'focus'\]\) b\.addEventListener\(ev, \(\) => byId\[id\]\.need\?\.\(\)\);/, 'and as a tab is reached');
  assert.match(dock, /function load\(\) \{ for \(const p of panes\) p\.need\?\.\(\); \}/);
  assert.match(main, /idle\(\(\) => dock\.load\(\)\)/, 'the rest when the app is idle');
  assert.match(main, /lazy: \{ doppler: dopplerL, fibroscan: fibroL \}/);
  assert.match(main, /if \(wasOpen\.includes\(id\)\) openAtStart\.push\(l\.get\(\)\.catch/, 'one left open last time is asked for at the start');
  assert.match(main, /Promise\.all\(\[host\.request\('healthyProfile'\), host\.request\('presets'\), \.\.\.openAtStart\]\)/, 'and waited for with the model\'s first answers, so its pane is whole with the dock');
  // The Doppler's trace reads only these of a frame it is given (a kept frame is cut down to them):
  const slim = dock.match(/const dopplerSlim = \(f\) => \(\{ ([^}]*) \}\);/)[1];
  assert.equal(slim, 'probe: f.probe, clock: f.clock, resp: f.resp, running: f.running, settling: f.settling, samples: f.samples');
  const ingest = read('doppler.js');
  const body = ingest.slice(ingest.indexOf('  function ingest(f) {'), ingest.indexOf('  function pin(fp)'));
  assert.deepEqual([...new Set([...body.matchAll(/\bf\.([a-z]+)/g)].map((m) => m[1]))].sort(), ['clock', 'probe', 'resp', 'running', 'samples', 'settling'], 'ingest reads no other field of a frame');
});

test('a load that failed is asked for again on the next ask', () => {
  assert.match(read('main.js'), /pending \|\|= load\(\)\.then\(\(m\) => \(inst = make\(m\)\)\)\.catch\(\(err\) => \{ pending = null; throw err; \}\)/);
});

// esbuild lists every module that is only import()ed (the lobule, the Doppler, the perf readout) with an entryPoint too. index.html's script
// was "the first output with an entryPoint", which was the app only while it happened to be listed first: with the lazy modules it was the perf
// readout, and the built page did not start.
test('the built page runs the app\'s own entry, whichever output esbuild lists first', () => {
  const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  assert.match(build, /const isApp = \(o\) => o\.entryPoint\?\.endsWith\('src\/ui\/main\.js'\);/);
  assert.match(build, /const appFile = basename\(Object\.keys\(app\.metafile\.outputs\)\.find\(\(f\) => isApp\(app\.metafile\.outputs\[f\]\)\)\);/);
  assert.match(build, /const appOut = Object\.values\(app\.metafile\.outputs\)\.find\(isApp\);/);
  assert.doesNotMatch(build, /\.find\(\(f\) => app\.metafile\.outputs\[f\]\.entryPoint\)/);
});
