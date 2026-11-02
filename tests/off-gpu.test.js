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
