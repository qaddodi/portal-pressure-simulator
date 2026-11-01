// Nothing off the GPU (owner, 1 Nov 2026: "Make the lint test crash if anything is not on GPU" and "block everything until
// everything is on GPU"). scripts/off-gpu-scan.mjs lists every canvas 2D, CPU pixel copy, SVG drawing or raster, backdrop or CSS
// blur, layout animation, layout read or write in a frame, raw requestAnimationFrame and synchronous shader status read; the limit
// is zero. docs/off-gpu-inventory.md is the full list with owners (node scripts/off-gpu-scan.mjs --doc).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scan, inventory } from '../scripts/off-gpu-scan.mjs';

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
  URL.createObjectURL(new Blob(['<svg/>'], { type: 'image/svg+xml' }));
  requestAnimationFrame(() => {});
  raf(step);
  el.addEventListener('pointermove', () => { el.style.left = '3px'; });
  if (!g.getProgramParameter(p, g.LINK_STATUS)) throw 0;
  return w;
}
function step() { place(); measure(); }
function place() { return document.body.getBoundingClientRect(); }
`);
  writeFileSync(join(root, 'src/ui/n.js'), 'export function measure() { return getComputedStyle(document.body); }\nexport function idle() { return document.body.clientWidth; }\n');
  const hits = scan({ root });
  const has = (cat, file, re) => hits.some((h) => h.cat === cat && h.file === file && re.test(h.detail));
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
  assert.equal(hits.filter((h) => h.cat === 'rawRaf').length, 1, 'only the one outside the scheduler');
  assert.ok(has('syncStatus', 'src/ui/m.js', /LINK_STATUS/));
  assert.ok(has('layoutWrite', 'src/ui/m.js', /style\.left/), 'a write in a pointermove handler');
  assert.ok(has('layoutRead', 'src/ui/m.js', /getBoundingClientRect.*step@\d+ → place/), 'reached from a scheduler callback by name');
  assert.ok(has('layoutRead', 'src/ui/n.js', /getComputedStyle/), 'followed through an import');
  assert.ok(!hits.some((h) => h.cat === 'layoutRead' && /offsetWidth|clientWidth/.test(h.detail)), 'one-shot reads outside a frame pass');
  assert.ok(hits.onGpu >= 2 && hits.sites === hits.onGpu + hits.length, 'the webgl2 context and the opacity animation count as on the GPU, every hit as a site');
  assert.match(inventory(hits), /\*\*\d+\/\d+ on GPU/);
});

test('nothing in the app is off the GPU (the limit is zero; see docs/off-gpu-inventory.md)', () => {
  const hits = scan();
  const byCat = {};
  for (const h of hits) byCat[h.cat] = (byCat[h.cat] || 0) + 1;
  const shown = hits.slice(0, 40).map((h) => `  ${h.file}:${h.line} ${h.cat} ${h.fn}: ${h.detail.slice(0, 100)}`).join('\n');
  assert.equal(hits.length, 0, `${hits.length} off the GPU (${Object.entries(byCat).map(([c, n]) => `${c} ${n}`).join(', ')}):\n${shown}${hits.length > 40 ? `\n  … and ${hits.length - 40} more: node scripts/off-gpu-scan.mjs` : ''}`);
});
