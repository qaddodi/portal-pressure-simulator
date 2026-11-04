import { stageSource } from './stage-src.js';
// Production pass (31 Oct): a failed start shows the boot card, a part that cannot load says so, the colour and label caches stay
// bounded, a restored GL context draws again, a worker that never started is terminated. Browser-free: the cache runs for real
// against a stand-in style; the wiring is read from source, as the repo's other review tests do.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

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
  assert.match(m, /\(window\.ppsBootErrors \|\|= \[\]\)\.push\(String\(err\?\.message \|\| err\)\.slice\(0, 300\)\); window\.ppsBootFail\?\.\(\);/);
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
  assert.match(m, /open: \(\) => paletteL\.get\(\)\.then\(\(p\) => p\.open\(\)\)\.catch\(\(\) => \{\}\)/);
  const menu = read('src/ui/menu.js');
  assert.equal((menu.match(/library\(\)\.then\([^\n]*\.catch\((?:\(\) => \{\}|NOOP)\)/g) || []).length, 2);
  assert.match(stageSource(), /lzWaiting = false; loadFailed\(err\); store\.set\(LOBULE_OFF_BOTH\)/);
});

test('GL: a restored sinusoid context draws a paused picture again; the lobule gives back its old instance; an unused Doppler context is let go', () => {
  const gl = read('src/ui/sinusoid-gl.js');
  assert.match(gl, /addEventListener\('webglcontextrestored', \(\) => \{ epoch\+\+; tgt = null; sent\.clear\(\); ok = null; skipped = true; startLater\(\); \}\)/);
  assert.match(gl, /get epoch\(\) \{ return epoch; \}/);
  assert.match(read('src/ui/sinusoid-view.js'), /sigW === canvas\.width && sigH === canvas\.height && sigEpoch === gpu\.epoch/);
  assert.match(read('src/ui/lobule-zoom.js'), /glTried = false; gl\?\.dispose\?\.\(\); gl = null;/);
  const d = read('src/ui/doppler-gl.js');
  assert.doesNotMatch(d, /getContext\(/);   // (the Doppler's trace has no context of its own to leave unused: it draws in the chart drawer's)
});

test('a still layer gives its bitmap back; a presenter worker that never said hello is terminated before the fallback', () => {
  // (Since 1 Nov the still layer holds no bitmap at all: the parts are drawn by the GPU's pen each frame.)
  const sl = read('src/ui/still-layer.js');
  assert.match(sl, /drop\(\) \{\}/);
  assert.doesNotMatch(sl, /getContext|createElement/);
  const p = read('src/ui/presenter.js');
  assert.match(p, /let w = null;\n\s+try \{\n\s+w = new Worker\(/);
  assert.match(p, /if \(w\) \{ w\.onmessage = w\.onerror = null; w\.terminate\(\); \}/);
});
