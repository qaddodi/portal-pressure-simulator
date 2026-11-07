// Nothing off the GPU (owner, 1 Nov 2026: "Make the lint test crash if anything is not on GPU" and "block everything until
// everything is on GPU"). scripts/off-gpu-scan.mjs lists every canvas 2D, CPU pixel copy, SVG drawing or raster, backdrop or CSS
// blur, layout animation, layout read or write in a frame, raw requestAnimationFrame and synchronous shader status read; the limit
// is zero. docs/off-gpu-inventory.md is the full list with owners (node scripts/off-gpu-scan.mjs --doc).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scan, inventory, score, TARGET_PCT } from '../scripts/off-gpu-scan.mjs';

test('the scanner finds each kind of off-GPU work (so it can never quietly go blind)', () => {
  const root = mkdtempSync(join(tmpdir(), 'offgpu-'));
  mkdirSync(join(root, 'src/ui'), { recursive: true }); mkdirSync(join(root, 'styles'));
  writeFileSync(join(root, 'index.html'), '<html><style>.a { transition: height .2s; }</style><svg viewBox="0 0 1 1"></svg></html>');
  writeFileSync(join(root, 'styles/a.css'), [
    '.g { backdrop-filter: blur(8px); -webkit-backdrop-filter: none; }',
    '@supports (backdrop-filter: blur(1px)) { .h { color: red; } }',
    '.t { transition: opacity .2s, max-height .3s ease; }',
    '.u { transition: .2s ease; }',
    '.ok { transition: transform .2s, opacity .2s; filter: drop-shadow(0 0 1px red); }',
    '@keyframes grow { from { width: 0; } to { width: 10px; transform: none; } }',
    '.s { filter: blur(3px); }',
    '.m { transition: -webkit-mask-position .2s, --edge .2s, clip-path .3s; }',
  ].join('\n'));
  writeFileSync(join(root, 'src/ui/frame.js'), 'export function frame(cb) { return requestAnimationFrame(cb); }\nexport const frameFor = (t) => (cb) => frame(cb, t);\n');
  writeFileSync(join(root, 'src/ui/m.js'), `
import { frameFor } from './frame.js';
import { measure } from './n.js';
const raf = frameFor('m');
export function setup(el, cv) {
  const c = cv.getContext('2d'), g = cv.getContext('webgl2');
  c.drawImage(cv, 0, 0); c.filter = 'blur(2px)';
  el.style.backdropFilter = 'blur(4px)';
  const w = el.offsetWidth;                       // (one-shot: not in a frame)
  el.animate([{ height: '0px' }, { height: '9px' }], 200);
  el.animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1 }], 200);
  document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const SVGNS = 'http://www.w3.org/2000/svg'; document.createElementNS(SVGNS, 'g');   // (a constant's name in capitals: 2 Nov 2026 review)
  URL.createObjectURL(new Blob(['<svg/>'], { type: 'image/svg+xml' }));
  requestAnimationFrame(() => {});
  raf(step);
  el.addEventListener('pointermove', () => { el.style.left = '3px'; });
  if (!g.getProgramParameter(p, g.LINK_STATUS)) throw 0;
  return w;
}
function step() { place(); measure(); document.body.textContent = 'x'; document.body.style.boxShadow = 'none'; }
new MutationObserver(() => document.body.offsetHeight);
setTimeout(() => { document.body.classList.add('t'); document.body.getCTM(); }, 9);
setTimeout(() => svgEl.getTotalLength(), 1);
function wip() { document.body.className = 'x'; }
function step2() { wip(); }
raf(step2);
function place() { document.body.getAnimations(); svgEl.getBBox(); return document.body.getBoundingClientRect(); }
`);
  writeFileSync(join(root, 'src/ui/n.js'), 'export function measure() { return getComputedStyle(document.body); }\nexport function idle() { return document.body.clientWidth; }\n');
  const hits = scan({ root });
  const has = (cat, file, re) => hits.some((h) => h.cat === cat && h.file === file && re.test(h.detail));
  assert.ok(has('domWrite', 'src/ui/m.js', /classList\.add/) && has('layoutRead', 'src/ui/m.js', /getCTM/), 'a timer callback is followed, class writes counted');
  assert.ok(has('layoutRead', 'src/ui/m.js', /getTotalLength/), 'a second timer callback is followed');
  assert.ok(has('domWrite', 'src/ui/m.js', /\.className =/) && hits.filter((h) => h.wide).length >= 3, 'class writes and timer/observer hits are in the wide count');
  assert.ok(has('ctx2d', 'src/ui/m.js', /'2d'/), 'getContext 2d');
  assert.equal(hits.filter((h) => h.cat === 'ctx2d').length, 1, 'webgl2 is not a hit');
  assert.ok(has('draw2d', 'src/ui/m.js', /drawImage/));
  assert.ok(has('cpuBlur', 'src/ui/m.js', /blur/) && has('cpuBlur', 'styles/a.css', /blur\(3px\)/));
  assert.ok(has('backdrop', 'src/ui/m.js', /backdropFilter/) && has('backdrop', 'styles/a.css', /blur\(8px\)/));
  assert.equal(hits.filter((h) => h.cat === 'backdrop' && h.file === 'styles/a.css').length, 1, 'none and @supports are not hits');
  assert.ok(has('layoutAnim', 'styles/a.css', /max-height/), 'a listed layout property');
  assert.ok(has('layoutAnim', 'styles/a.css', /transition: \.2s ease/), 'no property means all');
  assert.ok(has('layoutAnim', 'styles/a.css', /keyframes sets width/));
  assert.ok(!hits.some((h) => h.file === 'styles/a.css' && /\.ok/.test(h.fn)), 'transform/opacity and drop-shadow pass');
  assert.equal(hits.filter((h) => h.cat === 'paintAnim' && h.file === 'styles/a.css').length, 3, 'mask, a custom property and clip-path repaint as they ease');
  assert.ok(has('layoutAnim', 'index.html', /height/) && has('svgDom', 'index.html', /<svg/));
  assert.equal(hits.filter((h) => h.cat === 'layoutAnim' && h.file === 'src/ui/m.js').length, 1, 'animate() of height counts, of opacity/transform does not');
  assert.ok(has('svgDom', 'src/ui/m.js', /createElementNS/) && has('svgRaster', 'src/ui/m.js', /svg\+xml/));
  assert.ok(has('svgDom', 'src/ui/m.js', /createElementNS\(SVGNS/), 'the namespace passed as SVGNS counts too');
  assert.ok(has('domWrite', 'src/ui/m.js', /textContent/), 'text written in a frame');
  assert.ok(has('paintWrite', 'src/ui/m.js', /boxShadow/), 'a shadow written in a frame');
  assert.ok(has('observerRead', 'src/ui/m.js', /offsetHeight/), 'a read in a mutation observer');
  assert.equal(hits.filter((h) => h.cat === 'rawRaf').length, 1, 'only the one outside the scheduler');
  assert.ok(has('syncStatus', 'src/ui/m.js', /LINK_STATUS/));
  assert.ok(has('layoutWrite', 'src/ui/m.js', /style\.left/), 'a write in a pointermove handler');
  assert.ok(has('layoutRead', 'src/ui/m.js', /getBoundingClientRect.*step@\d+ → place/), 'reached from a scheduler callback by name');
  assert.ok(has('layoutRead', 'src/ui/n.js', /getComputedStyle/), 'followed through an import');
  assert.ok(has('layoutRead', 'src/ui/m.js', /getAnimations\(\)/) && has('layoutRead', 'src/ui/m.js', /getBBox\(\)/), 'an element\'s animations and an SVG box restyle the page too (2 Nov 2026 trace)');
  assert.ok(!hits.some((h) => h.cat === 'layoutRead' && /offsetWidth|clientWidth/.test(h.detail)), 'one-shot reads outside a frame pass');
  assert.ok(hits.onGpu >= 2 && hits.sites === hits.onGpu + hits.length, 'the webgl2 context and the opacity animation count as on the GPU, every hit as a site');
  assert.match(inventory(hits), /\*\*\d+\/\d+ on GPU/);
});

test('frame paths follow calls by scope, receiver and import, not by bare name', () => {
  const root = mkdtempSync(join(tmpdir(), 'offgpu-'));
  mkdirSync(join(root, 'src/ui'), { recursive: true }); mkdirSync(join(root, 'styles'));
  writeFileSync(join(root, 'index.html'), '<html></html>');
  writeFileSync(join(root, 'src/ui/frame.js'), 'export function lateFrame(cb) { return requestAnimationFrame(cb); }\nexport const lateFrameFor = (t) => (cb) => lateFrame(cb, t);\n');
  writeFileSync(join(root, 'src/ui/z.js'), 'export function createZoom() { function follow() { return document.body.clientHeight; } return { follow }; }\nexport function idle() { return document.body.clientWidth; }\n');
  writeFileSync(join(root, 'src/ui/p.js'), `
import { lateFrameFor } from './frame.js';
import { createZoom } from './z.js';
const draw = lateFrameFor('p');
const seen = new Map();
const ui = { zoom: createZoom() };
function tiles() { return { set() { return document.body.offsetWidth; } }; }
const later = (fn) => draw(fn);                  // (a wrapper that hands its callback on to the scheduler)
function pass(now) { seen.set(now, 1); ui.zoom.follow(); }
later(pass);
const step = (d) => document.body.getBoundingClientRect();   // (a click handler that happens to be called step)
document.body.addEventListener('click', () => step(1));
function outer() { function fit() { return document.body.scrollHeight; } return fit; }
const on = (t, f) => document.body.addEventListener(t, f);
function fold(h) { document.body.style.maxHeight = h + 'px'; }
on('touchmove', (e) => fold(e.touches[0].clientY));                  // (through a listener helper)
const handlers = { pointermove(e) { document.body.style.top = e.clientY + 'px'; } };
function other() { const fit = () => 0; draw(() => fit()); }
export { tiles, outer, other };
`);
  const hits = scan({ root }).filter((h) => h.cat === 'layoutRead');
  const at = (file, re) => hits.some((h) => h.file === file && re.test(h.detail));
  assert.ok(at('src/ui/z.js', /clientHeight.*pass@\d+ → follow/), "a method of an imported factory's object, through a wrapper of lateFrameFor");
  assert.ok(!at('src/ui/p.js', /offsetWidth/), "a Map's set is not the tiles' set()");
  assert.ok(!at('src/ui/p.js', /getBoundingClientRect/), 'a function named step is not a frame callback by its name');
  assert.ok(!at('src/ui/p.js', /scrollHeight/), "the fit in scope is the frame's, not another function's fit");
  assert.ok(!at('src/ui/z.js', /clientWidth/), 'what no frame calls stays out');
  const writes = scan({ root }).filter((h) => h.cat === 'layoutWrite' && h.file === 'src/ui/p.js');
  assert.ok(writes.some((h) => /maxHeight.*fold@/.test(h.detail)), 'a layout write in a touchmove handler registered through on()');
  assert.ok(writes.some((h) => /style\.top/.test(h.detail)), 'a layout write in a handler map keyed pointermove');
});

test(`the honest share on the GPU is reported (target ${TARGET_PCT}%, docs/off-gpu-inventory.md); no percentage fails the run`, (t) => {
  const hits = scan();
  t.diagnostic(score(hits));
  assert.ok(hits.sites > 0 && hits.onGpu <= hits.sites, 'the scan counts its sites');
});

test('only the figure\'s two model trees are left out of the SVG count, and the list does not grow', async () => {
  const { MODEL_SVG } = await import('../scripts/off-gpu-scan.mjs');
  assert.deepEqual(MODEL_SVG, ['stage', 'labels']);
});

test('attribute and inline-style writes in a frame are counted (2 Nov 2026 audit)', () => {
  const root = mkdtempSync(join(tmpdir(), 'offgpu-'));
  mkdirSync(join(root, 'src/ui'), { recursive: true }); mkdirSync(join(root, 'styles'));
  writeFileSync(join(root, 'index.html'), '<html></html>');
  writeFileSync(join(root, 'src/ui/frame.js'), 'export function frame(cb) { return requestAnimationFrame(cb); }\n');
  writeFileSync(join(root, 'src/ui/q.js'), `
import { frame } from './frame.js';
export function go(el) {
  frame(() => {
    el.setAttribute('d', 'M0 0'); el.dataset.k = '1'; el.hidden = true; el.removeAttribute('x');
    el.style.setProperty('--p', '1'); el.style.transform = 'none'; el.style.opacity = '1'; el.style.cssText = 'a:b';
  });
}
`);
  const cats = new Set(scan(root).map((h) => h.cat));
  assert.ok(cats.has('attrWrite') && cats.has('varWrite'), [...cats].join());
});

// ---- Blind spots closed 2 Nov 2026 (audit 1d83acc0) ----
const fixture = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'offgpu-'));
  mkdirSync(join(root, 'src/ui'), { recursive: true }); mkdirSync(join(root, 'styles'));
  writeFileSync(join(root, 'index.html'), '<html></html>');
  writeFileSync(join(root, 'src/ui/frame.js'), 'export function frame(cb) { return requestAnimationFrame(cb); }\n');
  for (const [f, text] of Object.entries(files)) writeFileSync(join(root, f), text);
  return scan({ root });
};

test('dynamic dispatch: a callback kept in a map, array, handler object or event bus runs where a frame calls through it', () => {
  const hits = fixture({
    'src/ui/bus.js': `
const listeners = new Map();
const hooks = [];
const OPS = { grow(el) { el.textContent = 'ops'; } };
export const bus = {
  on(key, fn) { if (!listeners.has(key)) listeners.set(key, []); listeners.get(key).push(fn); },
  emit(key, v) { const l = listeners.get(key); if (l) for (let i = 0; i < l.length; i++) l[i](v); },
};
export function onTick(fn) { hooks.push(fn); }
export function runHooks() { for (const h of hooks) h(); }
export function run(name, el) { OPS[name](el); }
const table = new Map([['a', () => document.body.append('x')]]);
export function viaGet(k) { table.get(k)?.(); }
`,
    'src/ui/app.js': `
import { frame } from './frame.js';
import { bus, onTick, runHooks, run, viaGet } from './bus.js';
bus.on('go', () => document.body.getBoundingClientRect());
function viaName(v) { document.body.offsetWidth; }
bus.on('named', viaName);
onTick(() => document.body.getBoundingClientRect.call(0));
const handlers = {};
handlers.pop = () => document.body.getAnimations();
export function pass(k) { handlers[k](); }
frame(() => { bus.emit('go', 1); bus.emit('named', 2); runHooks(); run('grow', document.body); viaGet('a'); pass('pop'); });
`,
    'src/ui/idle.js': `import { bus } from './bus.js';\nbus.on('never', () => document.body.getBoundingClientRect());\nexport function later() { bus.emit('never'); }\n`,
  });
  const reach = (cat, file, re) => hits.some((h) => h.cat === cat && h.file === file && re.test(h.detail) && / path: /.test(h.detail));
  assert.ok(reach('layoutRead', 'src/ui/app.js', /getBoundingClientRect.*emit/), 'a subscriber handed to bus.on (imported object, listeners Map) is reached from emit');
  assert.ok(reach('layoutRead', 'src/ui/app.js', /\.offsetWidth/), 'a named function handed to on() is reached');
  assert.ok(reach('layoutRead', 'src/ui/app.js', /getAnimations/), 'a handler stored under a computed name and called as handlers[k]()');
  assert.ok(reach('domWrite', 'src/ui/bus.js', /textContent/), 'a handler object called as OPS[name](…)');
  assert.ok(reach('domWrite', 'src/ui/bus.js', /append/), 'a Map entry called as table.get(k)?.()');
  // idle.js subscribes to the same bus, so its callback is reached too (the registry is the bus's, by design: conservative)
  assert.ok(hits.some((h) => h.file === 'src/ui/idle.js' && h.cat === 'layoutRead'));
});

test('dispatch aliases are scoped: a local named like another function\'s registry element calls nothing in the registry', () => {
  const hits = fixture({
    'src/ui/scoped.js': `
import { frame } from './frame.js';
const shown = [() => document.body.append('x')];
function other() { for (const r of shown) r(); }
other();
function step() { const r = 3; return r.toFixed(2); }
function again() { for (const r of shown) r(); }
frame(step);
export function later() { again(); }
`,
  });
  assert.ok(!hits.some((h) => h.file === 'src/ui/scoped.js' && h.cat === 'domWrite' && / path: /.test(h.detail)), 'step()\'s own r is not the loop\'s r in other()');
  const hits2 = fixture({
    'src/ui/scoped2.js': `
import { frame } from './frame.js';
const shown = [() => document.body.append('x')];
function step() { for (const r of shown) r(); }
frame(step);
`,
  });
  assert.ok(hits2.some((h) => h.file === 'src/ui/scoped2.js' && h.cat === 'domWrite' && / path: /.test(h.detail)), 'a call through the loop\'s own r is still followed');
});

test('a style written through a computed name is counted (el.style[k] = v, Object.assign(el.style, …))', () => {
  const hits = fixture({
    'src/ui/w.js': `
import { frame } from './frame.js';
export function go(el, k, v) {
  frame(() => {
    el.style[k] = v;
    el.style['width'] = '1px';
    el.style['color'] = 'red';
    el.style['--p'] = '1';
    el.dataset[k] = v;
    el['textContent'] = 'x';
    Object.assign(el.style, { left: '1px', pointerEvents: 'none' });
    Object.assign(el.style, k);
  });
}
`,
  });
  const has = (cat, re) => hits.some((h) => h.file === 'src/ui/w.js' && h.cat === cat && re.test(h.detail) && / path: /.test(h.detail));
  assert.ok(has('varWrite', /style\[<dynamic name>\]/), 'a name that is not a literal is a script-driven style write');
  assert.ok(has('layoutWrite', /style\['width'\]/), 'a literal layout name is a layout write');
  assert.ok(has('paintWrite', /style\['color'\]/), 'a literal repainting name is a paint write');
  assert.ok(has('varWrite', /style\['--p'\]/));
  assert.ok(has('attrWrite', /dataset\[/) && has('domWrite', /\['textContent'\]/));
  assert.equal(hits.filter((h) => /Object\.assign\(style, \{ left, pointerEvents \}\)/.test(h.detail)).length, 1, 'one hit per Object.assign, of its heaviest kind');
  assert.ok(has('layoutWrite', /Object\.assign\(style, \{ left, pointerEvents \}\)/) && has('varWrite', /Object\.assign\(style, <dynamic>\)/));
});

test('a site no frame path reaches is never credited as on the GPU (unreached)', () => {
  const hits = fixture({
    'src/ui/u.js': `
import { frame } from './frame.js';
export function setup(el) { el.textContent = 'a'; el.getBoundingClientRect(); el.style.left = '1px'; el.classList.add('x'); }
frame(() => { document.body.offsetWidth; });
`,
  });
  const un = hits.filter((h) => h.cat === 'unreached');
  assert.ok(un.some((h) => /textContent/.test(h.detail)) && un.some((h) => /getBoundingClientRect/.test(h.detail)) && un.some((h) => /style\.left/.test(h.detail)) && un.some((h) => /classList\.add/.test(h.detail)), un.map((h) => h.detail).join());
  assert.ok(!hits.some((h) => h.cat === 'layoutRead' && /getBoundingClientRect/.test(h.detail)), 'it is not a frame hit');
  assert.equal(hits.sites, hits.onGpu + hits.length, 'every unreached site is a site and not on the GPU');
  const lines = new Set(hits.map((h) => `${h.file}:${h.line}`));
  assert.ok(lines.has('src/ui/u.js:3'), 'its line is not counted as on the GPU');
});

test('unreached sites are triaged: setup is left out of the count and listed, use and no-caller sites stay flagged with their reason', () => {
  const hits = fixture({
    'src/ui/t.js': `
import { frame } from './frame.js';
function build(el) { el.textContent = 'built'; el.getBoundingClientRect(); }       // (called once, at load)
build(document.body);
const root = document.body; root.className = 'ready';                               // (module top level)
function onTap() { document.body.classList.add('tapped'); }                          // (a click handler)
document.body.addEventListener('click', onTap);
setTimeout(() => { document.body.offsetWidth; }, 5);                                  // (a timer)
function both() { document.body.setAttribute('a', 'b'); }
both(); document.body.addEventListener('click', () => both());                        // (boot and use: use wins)
function orphan() { document.body.hidden = true; }                                    // (nobody calls it)
frame(() => {});
`,
  });
  const un = (re) => hits.filter((h) => h.cat === 'unreached' && re.test(h.detail));
  const setup = (re) => (hits.setup || []).filter((h) => re.test(h.detail));
  assert.ok(setup(/textContent/).length && setup(/getBoundingClientRect/).length && setup(/\.className =/).length, 'load-time code is setup');
  assert.ok(!hits.some((h) => /textContent|\.className =/.test(h.detail)), 'setup is not a hit');
  assert.ok(un(/classList\.add.*runs during use \(event handler\)/).length, 'a click handler is flagged with its reason');
  assert.ok(hits.some((h) => h.cat === 'layoutRead' && h.wide && /offsetWidth/.test(h.detail)), 'a timer callback is already a (wide) hit, not setup');
  assert.ok(un(/setAttribute.*runs during use/).length && !setup(/setAttribute/).length, 'called at boot and during use: flagged, not setup');
  assert.ok(un(/\.hidden =.*no caller found/).length && !setup(/\.hidden =/).length, 'an uncalled function is flagged, never assumed to be setup');
  assert.equal(hits.sites, hits.onGpu + hits.length, 'setup sites are on neither side of the count');
  assert.match(score(hits), /during use \d+, no caller found \d+; \d+ setup sites left out/);
  assert.match(inventory(hits), /## Setup sites \(\d+\)/);
});

test('an imported Map or Set is the built-in\'s, not a method of its module (store.js shownVel.set vs store.set)', () => {
  const hits = fixture({
    'src/ui/st.js': `export const seen = new Map();\nexport const store = { set(p) { document.body.textContent = p; } };\n`,
    'src/ui/c.js': `import { frame } from './frame.js';\nimport { seen, store } from './st.js';\nframe(() => { seen.set(1, 2); });\nexport function later() { store.set('x'); }\n`,
  });
  assert.ok(!hits.some((h) => h.cat === 'domWrite' && h.file === 'src/ui/st.js' && / path: /.test(h.detail)), 'a frame calling seen.set does not reach store.set');
});

test('an allocation marked alloc-rare with a reason leaves the count and is listed; one with no reason still counts', () => {
  const root = mkdtempSync(join(tmpdir(), 'offgpu-rare-'));
  mkdirSync(join(root, 'src/ui'), { recursive: true }); mkdirSync(join(root, 'styles'));
  writeFileSync(join(root, 'index.html'), '<html></html>');
  writeFileSync(join(root, 'src/ui/frame.js'), 'export function frame(cb) { return requestAnimationFrame(cb); }\n');
  writeFileSync(join(root, 'src/ui/r.js'), [
    "import { frame } from './frame.js';",
    'let cache = null;',
    'function tick() {',
    '  const a = [1, 2];                      // counted',
    '  if (!cache) cache = { k: 1 };          // alloc-rare: first frame only',
    '  // alloc-rare: a resize',
    '  const b = [3, 4];',
    '  const c = { z: 1 };                    // alloc-rare:',
    '  frame(tick);',
    '}',
    'frame(tick);',
  ].join('\n'));
  const hits = scan({ root }).filter((h) => h.cat === 'alloc');
  assert.deepEqual(hits.map((h) => h.line).sort((x, y) => x - y), [4, 8], 'counted: no marker, and a marker with no reason');
  const rare = scan({ root }).rare;
  assert.deepEqual(rare.map((h) => h.line), [5, 7]);
  assert.match(rare[0].detail, /first frame only/);
  assert.ok(scan({ root }).rare.length === 2 && /tagged run-once\/rare allocations/.test(score(Object.assign(scan({ root }), {}))), "tagged lines are counted apart in the score line");
});
