import { stageSource } from './stage-src.js';
// Production pass (31 Oct): a failed start shows the boot card, a part that cannot load says so, the colour and label caches stay
// bounded, a restored GL context draws again, a worker that never started is terminated. Browser-free: the cache runs for real
// against a stand-in style; the wiring is read from source, as the repo's other review tests do.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { presenterSource, lobuleSource } from './split-src.js';

globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#ffffff' });
globalThis.document.styleSheets = [{ cssRules: [{ style: ['--white'] }] }];   // (the tokens the page declares, util.js readVars)
const { cssAlpha } = await import('../src/ui/util.js');
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('cssAlpha: a fade that asks for a new alpha every frame does not grow the cache without end', () => {
  for (let i = 0; i < 10000; i++) assert.equal(cssAlpha('--white', 0.04 + i / 1e5), `rgba(255,255,255,${0.04 + i / 1e5})`);
  const u = read('src/ui/util.js');
  assert.match(u, /if \(m\.size > 2000\) m\.clear\(\);/);   // (each token's table of alphas is cut at 2000)
  assert.equal(cssAlpha('--white', 0.5), 'rgba(255,255,255,0.5)', 'a value after a cut is still right');
});

test('the label width cache is cut at 1500 and the input tracker is made on read, not on every perf() call', () => {
  assert.match(stageSource(), /if \(widthN > 1500\) \{ widths\.clear\(\); widthN = 0; e = undefined; \}/);
  assert.match(read('src/ui/frame.js'), /get inputToPaint\(\) \{ return inputMeasure\(\); \}/);
});

test('a start that failed reaches the page\'s boot card; a script that cannot be fetched does too; a strict CSP is not an old browser', () => {
  const m = read('src/ui/main.js');
  assert.match(m, /\(window\.ppsBootErrors \|\|= \[\]\)\.push\(String\(err\?\.message \|\| err\)\.slice\(0, 300\)\); window\.ppsBootFail\?\.\(\{ force: !window\.ppsWired \}\);/);
  const html = read('index.html');
  assert.match(html, /w\.addEventListener\('error',function\(e\)\{var t=e&&e\.target;if\(t&&t\.tagName==='SCRIPT'\)\{.*?note\('Could not load '/);
  assert.match(html, /data-try[^]*?ppsFigureReady[^]*?\?r='/, 'a failed entry script is retried with a fresh URL before the boot card shows');
  // The gate itself, run: under a CSP with no eval, `new Function` throws an EvalError, which must not read as "syntax".
  const gate = html.match(/<script>(\/\* Can this browser run the app\?[\s\S]*?)<\/script>/)[1];
  const run = (fnImpl) => {
    const w = { addEventListener() {}, ResizeObserver: function () {}, structuredClone: () => {}, WebGL2RenderingContext: function () {}, CSS: { supports: () => true }, matchMedia: () => ({ matches: false }) };
    const ctx = vm.createContext({ window: w, document: { createElement: () => ({ noModule: true }) }, CSS: w.CSS, Function: fnImpl, Array, EvalError, SyntaxError });
    // (A fresh `Function` in the sandbox; the script reads `window` as `w` and the rest as globals.)
    vm.runInContext(gate, ctx);
    return JSON.parse(JSON.stringify(w.ppsUnsupported));   // (an array from another realm: compared as plain data)
  };
  assert.equal(run(function () { throw new EvalError('no eval'); }), null, 'EvalError: fine');
  assert.deepEqual(run(function () { throw new SyntaxError('x'); }), ['syntax'], 'a real SyntaxError: still unsupported');
});

test('a part of the app that cannot load says so once with a Reload, and the callers do not leave a rejection loose', () => {
  const u = read('src/ui/util.js');
  assert.match(u, /export function loadFailed\(err\) \{[\s\S]*?toast\('Part of the app could not load\. Reload the page to get the latest version\.', 'bad', \{ actions: \[\['Reload', \(\) => location\.reload\(\)\]\] \}\);/);
  const m = read('src/ui/main.js');
  assert.match(m, /pending = null; loadFailed\(err\); throw err;/);
  assert.match(m, /return paletteL\.get\(\)\.then\(\(q\) => q\.open\(\)\)\.catch\(\(\) => \{\}\)/);
  const menu = read('src/ui/menu.js');
  assert.equal((menu.match(/library\(\)\.then\([^\n]*\.catch\((?:\(\) => \{\}|NOOP)\)/g) || []).length, 2);
  assert.match(stageSource(), /lzWaiting = false; loadFailed\(err\); store\.set\(LOBULE_OFF_BOTH\)/);
});

test('GL: a restored sinusoid context draws a paused picture again; the lobule gives back its old instance; an unused Doppler context is let go', () => {
  const gl = read('src/ui/sinusoid-gl.js');
  assert.match(gl, /const onBack = \(\) => \{ if \(gone\) return; epoch\+\+; tgt = null; sent\.clear\(\); ok = null; skipped = true; startLater\(\); \};\s*evCv\.addEventListener\('webglcontextrestored', onBack\)/);
  assert.match(gl, /get epoch\(\) \{ return epoch; \}/);
  assert.match(read('src/ui/sinusoid-view.js'), /sigW === canvas\.width && sigH === canvas\.height && sigEpoch === gpu\.epoch/);
  assert.match(lobuleSource(), /glTried = false; gl\?\.dispose\?\.\(\); gl = null;/);
  const d = read('src/ui/doppler-gl.js');
  assert.doesNotMatch(d, /getContext\(/);   // (the Doppler's trace has no context of its own to leave unused: it draws in the chart drawer's)
});

test('a still layer gives its bitmap back; a presenter worker that never said hello is terminated before the fallback', () => {
  // (Since 1 Nov the still layer holds no bitmap at all: the parts are drawn by the GPU's pen each frame.)
  const sl = read('src/ui/still-layer.js');
  assert.match(sl, /drop\(\) \{\}/);
  assert.doesNotMatch(sl, /getContext|createElement/);
  const p = presenterSource() + read('src/ui/presenter-visuals.js') + read('src/ui/calc-client.js');
  assert.match(p, /let w = null;\n\s+try \{\n\s+w = new Worker\(/);
  assert.match(p, /if \(w\) \{ w\.onmessage = w\.onerror = null; w\.terminate\(\); \}/);
});

// A page older than the site (a deploy replaced the hashed files its HTML names, 6 Nov 2026: "Could not load main-Q7HLWDMX.js" on the
// preview) reloads once with a fresh index instead of stopping on "couldn't start" (index.html ppsStale; main.js hands it a failed
// chunk import too). The boot gate is run for real in a sandbox against a stand-in fetch, location and sessionStorage.
const gate = read('index.html').match(/<script>(\/\* Can this browser run the app\?[\s\S]*?)<\/script>/)[1];
const tick = () => new Promise((r) => setImmediate(r));

function staleBoot({ href = 'https://x.test/app/preview/?r=1&slide=3#k', page, asset = 200, stored = null, entry = 'main-OLD.js' } = {}) {
  const ls = {}, store = new Map(stored ? [['pps.fresh', stored]] : []), timers = [], replaced = [], fetched = [];
  const location = { href, pathname: new URL(href).pathname, search: new URL(href).search, replace: (u) => replaced.push(u), reload: () => replaced.push('reload') };
  const w = {
    addEventListener: (k, f) => (ls[k] ||= []).push(f), ResizeObserver: function () {}, structuredClone: () => {}, CSS: { supports: () => true }, URL, Date, Math, String,
    fetch: (u) => { fetched.push(u); if (/assets\//.test(u)) return Promise.resolve({ ok: asset === 200 }); return Promise.resolve({ ok: true, text: () => Promise.resolve(page) }); },
  };
  const document = { createElement: () => ({ noModule: true }), querySelector: () => ({ src: 'https://x.test/app/preview/assets/' + entry }) };
  const ctx = vm.createContext({ window: w, document, location, sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, setTimeout: (f, ms) => timers.push([f, ms]), CSS: w.CSS, URL, Date, Math, String, Array, EvalError, SyntaxError, Function, Promise, fetch: w.fetch });
  vm.runInContext(gate, ctx);
  const failed = [];
  w.ppsBootFail = () => failed.push(w.ppsBootErrors.slice());
  // The entry module as the page names it, out of retries (data-try 3): the script element's error event.
  const fire = () => { const t = { tagName: 'SCRIPT', type: 'module', src: 'https://x.test/app/preview/assets/' + entry + '?r=9', getAttribute: () => '3' }; for (const f of ls.error) f({ target: t }); };
  return { w, fire, replaced, failed, timers, fetched, store };
}
const page = (name) => `<html><head><script type="module" src="assets/${name}"></script></head></html>`;

test('a stale page whose entry the server no longer has reloads once with a fresh index, keeping the address', async () => {
  const b = staleBoot({ page: page('main-NEW.js') });
  b.fire(); await tick(); await tick();
  assert.equal(b.failed.length, 0, 'no "couldn\'t start" card');
  assert.equal(b.replaced.length, 1);
  const u = new URL(b.replaced[0]);
  assert.notEqual(u.searchParams.get('r'), '1', 'the reload carries a new r= stamp (a new address: no cached HTML)');
  assert.equal(u.searchParams.get('slide'), '3');
  assert.equal(u.hash, '#k');
  assert.ok(b.store.get('pps.fresh'), 'the reload is remembered, so it happens once');
  assert.ok(/\?r=\d+$/.test(b.fetched[0]), 'the index is asked for at a new address');
});

test('the same entry that now loads (a deploy that was half way) also reloads; one still missing is asked again, then the card shows', async () => {
  const ok = staleBoot({ page: page('main-OLD.js'), asset: 200 });
  ok.fire(); await tick(); await tick(); await tick();
  assert.equal(ok.replaced.length, 1);
  const gone = staleBoot({ page: page('main-OLD.js'), asset: 404 });
  gone.fire();
  for (let i = 0; i < 8; i++) { await tick(); await tick(); await tick(); const t = gone.timers.shift(); if (t) t[0](); }
  assert.equal(gone.replaced.length, 0);
  assert.equal(gone.failed.length, 1, 'after the retries the boot card shows');
  assert.match(gone.failed[0].join('\n'), /Could not load main-OLD\.js/);
  assert.equal(gone.w.ppsRecovering, false);
});

test('no reload loop: a page that was reloaded fresh in the last minute shows the card at once', () => {
  const b = staleBoot({ page: page('main-NEW.js'), stored: String(Date.now() - 5000) });
  b.fire();
  assert.equal(b.replaced.length, 0);
  assert.equal(b.failed.length, 1);
});

// ---- Boot failure states (SHL-4, 19 Nov 2026): a failed or slow start is never a dead shell, a stack trace or an unreadable card ----
// The page's cover script (index.html: the one that owns #boot) run in a sandbox with a small stand-in DOM.
const cover = read('index.html').match(/<script>(\(function\(\)\{var MIN=600[\s\S]*?)<\/script>/)[1];
function coverBoot({ withCover = true, figureReady = false } = {}) {
  let boot = null;
  const mk = () => {
    const cls = new Set();
    return { id: '', innerHTML: '', classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) }, setAttribute() {}, querySelector: () => null, remove() { boot = null; }, cls };
  };
  if (withCover) { boot = mk(); boot.innerHTML = '<div class="boot-in"></div>'; }
  const timers = [], attrs = {};
  const w = { addEventListener() {}, ppsBootErrors: [], ppsFigureReady: figureReady, Promise };
  const document = {
    getElementById: (id) => (id === 'boot' ? boot : null), createElement: () => mk(),
    body: { insertBefore: (el) => { boot = el; el.id = 'boot'; }, appendChild() {} },
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } },
    fonts: { load: () => Promise.resolve() },
  };
  const ctx = vm.createContext({ window: w, document, location: { href: 'https://x.test/' }, navigator: { userAgent: 'test' }, performance: { now: () => 0 }, requestAnimationFrame() {}, addEventListener() {}, setTimeout: (f, ms) => { timers.push([f, ms]); return timers.length; }, Promise, String, Math, Array });
  vm.runInContext(cover, ctx);
  return { w, timers, attrs, get boot() { return boot; } };
}

test('the failure card rebuilds the cover when it has already lifted, and a start-up that threw is not silenced by a ready figure', () => {
  const lifted = coverBoot({ withCover: false });
  lifted.w.ppsBootFail();
  assert.ok(lifted.boot, 'no cover, so a new one is made: the card is never lost');
  assert.match(lifted.boot.innerHTML, /couldn’t start/);
  assert.ok(lifted.boot.cls.has('failed'));
  const ready = coverBoot({ figureReady: true });
  ready.w.ppsBootFail();
  assert.equal(ready.boot.innerHTML.includes('couldn’t start'), false, 'a plain call after the figure is ready stays quiet (a late error is not a failed start)');
  ready.w.ppsBootFail({ force: true });
  assert.match(ready.boot.innerHTML, /couldn’t start/, 'main() threw before the buttons answered: the card shows even though the figure was ready');
});

test('a start that is still pending at 15 s says so, with Reload, instead of lifting the cover onto a shell that ignores every tap', () => {
  const b = coverBoot();
  const at15 = b.timers.find(([, ms]) => ms === 15000);
  assert.ok(at15, 'the 15 s check is armed');
  at15[0]();
  assert.match(b.boot.innerHTML, /Still loading/);
  assert.match(b.boot.innerHTML, /data-reload/);
  assert.ok(b.boot.cls.has('failed'), 'the card is held (the CSS 20 s fail-safe leaves a .failed card up)');
  assert.ok(!b.boot.cls.has('done'), 'the cover is not lifted');
});

test('every var(--token) the page\'s own inline style names is defined by a style sheet (the failure card named --text-1, which nothing defines: black on black in Dark)', () => {
  const html = read('index.html');
  const inline = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const defined = new Set();
  for (const f of ['styles/tokens.css', 'styles/app-01-chrome.css', 'styles/app-05-presenter-cards.css', 'fonts/fonts.css']) for (const m of read(f).matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1]);
  for (const m of inline.matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1]);   // (a token the page declares for itself)
  const missing = [...new Set([...inline.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))].filter((t) => !defined.has(t));
  assert.deepEqual(missing, [], 'tokens named in index.html that no style sheet defines (their fallback colour is used on every look)');
});
