// A slider drawn on the GPU (slider-gl.js): the arithmetic of its dot, its glide and its rings, and where the page's own drawing steps aside.
// Source and number checks: the picture itself is drawn by the shared GPU context, which the browser checks (and the old-against-new frames) cover.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const src = read('src/ui/slider-gl.js'), css = read('styles/app.css'), util = read('src/ui/util.js');
// (The pure parts, taken out of the module so no page is needed: they use nothing of it.)
const pure = (name) => { const at = src.indexOf(`export ${name}`); assert.ok(at >= 0, name); return src.slice(at, src.indexOf('\n}\n', at) + 3); };
const thumbX = new Function(`${src.slice(src.indexOf('export const thumbX'), src.indexOf('\n', src.indexOf('export const thumbX'))).replace('export const', 'return')}`)();
const glideAt = new Function(`${pure('function glideAt').replace('export function glideAt', 'function glideAt')}; return glideAt;`)();
const LV = src.slice(src.indexOf('export const IDLE'), src.indexOf('export const levelFor'));
const levelFor = new Function(`${LV.replaceAll('export const', 'const')}; ${src.slice(src.indexOf('export const levelFor'), src.indexOf('\n', src.indexOf('export const levelFor'))).replace('export const levelFor =', 'const levelFor =')}; return levelFor;`)();

test('the dot sits where the browser puts the native one: half its box in from each end', () => {
  assert.equal(thumbX(300, 28, 0), 14);
  assert.equal(thumbX(300, 28, 1), 286);
  assert.equal(thumbX(300, 32, 0.5), 150);
  assert.equal(thumbX(10, 32, 1), 16, 'a bar shorter than the dot keeps the dot on its middle');
});

test('the knob is never cropped at either end of the bar: its ring, held and grown, fits inside the dot\'s box (what-if slider at 0, 7 Nov 2026)', () => {
  const room = Number(src.match(/export const ROOM = (\d+);/)[1]);
  const dotOf = new Function(`const ROOM = ${room}; ${src.slice(src.indexOf('export const dotOf'), src.indexOf('\n', src.indexOf('export const dotOf'))).replace('export const dotOf =', 'return')}`)();
  const RING = 3, HELD = 1.12;
  for (const [tw, dot] of [[28, 18], [32, 22]]) {
    assert.equal(dotOf(tw), dot, `a ${tw} px box holds the ${dot} px dot`);
    for (const f of [0, 1]) {
      const W = 300, x = thumbX(W, tw, f), r = dot / 2;
      for (const sc of [1, HELD]) {
        const edge = (r + RING) * sc;   // the surface ring, the part the card's own box used to clip
        assert.ok(x - edge >= 0, `f=${f} sc=${sc}: the ring's left edge is inside the bar (${x - edge})`);
        assert.ok(x + edge <= W, `f=${f} sc=${sc}: the ring's right edge is inside the bar (${x + edge - W})`);
      }
    }
  }
  assert.ok(css.includes('--tw: 28px; --dot: 18px;') && css.includes('--tw: 32px; --dot: 22px;'), 'the stylesheet\'s boxes are the same two');
  assert.match(src, /const room = Math\.min\(x - pad, pad \+ W - x\);/, 'the hover, held and focus rings stop at the bar\'s end');
  assert.match(src, /disc\(ctx, x, cy, Math\.min\(\(r \+ v\[0\]\) \* sc, room\)\)/);
  // (The bar is as tall as the held ring: 28 px, 32 under a finger.)
  assert.match(css, /isolation: isolate; height: 28px;/);
  assert.match(css, /\.range-wrap \{ --tw: 32px; --dot: 22px; \}[^\n]*\n {2}\.range-wrap, input\[type=range\] \{ height: 32px; \}/);
});

test('the glide runs from the start fraction to the end, on the steps, and ends exactly on the end', () => {
  assert.equal(glideAt(0.2, 0.9, 0, 0, 100, 5), 0.2);
  assert.equal(glideAt(0.2, 0.9, 1, 0, 100, 5), 0.9);
  const mid = glideAt(0.2, 0.9, 0.5, 0, 100, 5);
  assert.ok(Math.abs(mid * 100 / 5 - Math.round(mid * 100 / 5)) < 1e-9, 'the dot is on a step on the way');
  assert.equal(mid, 0.55);
  assert.ok(Math.abs(glideAt(0.1, 0.4, 0.25, 0, 10, 0) - 0.175) < 1e-12, 'no step: straight along');
  assert.equal(glideAt(0.5, 0.5, 0.5, 5, 5, 1), 0.5, 'a slider with no range has nowhere to go: the end');
});

test('the look follows the stylesheet\'s rules: a mouse over it, then keyboard focus, then held; disabled is plain', () => {
  const [I, H, D, F, FH] = [0, 1, 2, 3, 4];
  assert.equal(levelFor(false, false, false, false), I);
  assert.equal(levelFor(true, false, false, false), H);
  assert.equal(levelFor(true, true, false, false), D, 'a mouse button down is :active, which the hover rule leaves out');
  assert.equal(levelFor(false, true, false, false), D);
  assert.equal(levelFor(false, false, true, false), F);
  assert.equal(levelFor(true, false, true, false), H, 'the hover rule outranks the focus ring');
  assert.equal(levelFor(false, true, true, false), FH, 'a finger\'s press focuses the dot: the focus ring on the held, grown dot');
  assert.equal(levelFor(true, true, true, true), I);
});

test('the rings are the stylesheet\'s numbers: 3 / 6 / 8 px, shadow 1 / 1 / 2 px, 3 / 3 / 6 blur, scale 1.12 held', () => {
  const rows = LV.slice(LV.indexOf('export const LEVELS'));
  assert.match(rows, /of\(3, 0, 1, 3, 0\.14, 1, 0\)/);
  assert.match(rows, /of\(6, 1, 1, 3, 0\.14, 1, 0\)/);
  assert.match(rows, /of\(8, 1, 2, 6, 0\.16, 1\.12, 0\)/);
  // (The page's own thumb before the GPU's picture is up: its box is the dot's box, the surface ring is in its picture, and the soft ring and focus ring are
  // the same radii from the dot as the GPU's, so the rings are 5 px nearer the box's edge than the old 3 / 6 / 8.)
  assert.match(css, /input\[type=range\]:active::-webkit-slider-thumb, input\[type=range\]\.held::-webkit-slider-thumb \{ transform: scale\(1\.12\); box-shadow: 0 2px 6px 1px rgb\(var\(--black-rgb\) \/ \.16\), 0 0 0 3px var\(--accent-soft\), inset 0 0 0 2px transparent; \}/);
  assert.match(css, /:hover::-webkit-slider-thumb \{ box-shadow: 0 1px 3px 1px rgb\(var\(--black-rgb\) \/ \.14\), 0 0 0 1px var\(--accent-soft\), inset 0 0 0 2px transparent; \}/);
});

test('the page\'s own drawing steps aside only once the GPU\'s picture is up, and the input stays for the pointer, keys and screen readers', () => {
  assert.match(css, /\.range-wrap\.wgl-on::before, \.range-wrap\.wgl-on::after \{ content: none; \}/);
  assert.match(css, /\.range-wrap\.wgl-on > \.normal, \.range-wrap\.wgl-on > \.sl-start \{ visibility: hidden; \}/);
  assert.match(css, /\.range-wrap\.wgl-on input\[type=range\]::-webkit-slider-thumb \{ background: transparent !important; box-shadow: none !important;/);
  assert.match(css, /\.range-wrap\.wgl-on input\[type=range\]::-moz-range-thumb \{ background: transparent !important;/);
  assert.ok(!/\.wgl-on input\[type=range\] *\{[^}]*(display: none|visibility: hidden|opacity: 0)/.test(css), 'the input itself is never hidden');
  assert.match(src, /widgetGL\(S\.wrap, S\.paintFn, \{ pad: PAD \}\)/);
});

test('a frame of motion draws and asks for the next only while something moves, and writes nothing to the page', () => {
  const tick = src.slice(src.indexOf('function tick(S)'), src.indexOf('// ---- The picture'));
  assert.match(tick, /S\.w\?\.paint\(\);\s*if \(more\) S\.raf = frame\(S\.tickFn, 'numbers'\);/);
  assert.ok(!/getComputedStyle|getBoundingClientRect|offset(Width|Height|Left|Top)|readStyle|readBox|\.style\b|classList|setAttribute/.test(tick + src.slice(src.indexOf('function drawSlider'))), 'no page read or write in a frame');
  assert.match(src, /new IntersectionObserver/, 'made when a slider comes near the screen, not for every one a panel builds');
});

test('the touch, mouse and key states reach the dot as events, never as a frame\'s work', () => {
  for (const ev of ["'pointerover'", "'pointerout'", "'focusin'", "'focusout'", "'input'"]) assert.ok(util.includes(`root.addEventListener(${ev}`), ev);
  assert.match(util, /addEventListener\('pointerup', releaseAll, true\); addEventListener\('pointercancel', releaseAll, true\)/);
  assert.match(util, /const INPUT_EV = new Event\('input', \{ bubbles: true \}\), CHANGE_EV = new Event\('change', \{ bubbles: true \}\);/);
  assert.ok(!/new Event\('input'/.test(util.slice(util.indexOf('export function enhanceRanges'))), 'a drag\'s moves make no event');
});

test('the dot\'s box is 32 px under the two media queries the stylesheet gives it, and 28 px elsewhere', () => {
  const q = (name) => src.match(new RegExp(`export const [^;]*${name} = '([^']*)'`))[1];
  const phone = q('PHONE_MQ'), coarse = q('COARSE_MQ');
  assert.ok(css.includes(`@media ${phone} {`), 'the phone query is the stylesheet\'s');
  assert.ok(css.includes(`@media ${coarse} {\n  .range-wrap { --tw: 32px; --dot: 22px; }`), 'the finger query is the stylesheet\'s');
  assert.match(src, /const dotWidth = \(\) => \(phone\?\.matches \|\| coarse\?\.matches \? 32 : 28\);/);
  assert.ok(!/readStyle|getComputedStyle/.test(src), 'no style is read');
});

test('a widget\'s picture box out-ranks .stage-view canvas (inset 0, 100%), so a slider on an organ card is drawn at its padded size, not stretched', () => {
  assert.match(css, /canvas\.wgl\.wgl, canvas\.wgl\.wgl \+ canvas\.trace-gl \{ position: absolute; left: calc\(-1 \* var\(--wgl-pad, 0px\)\);/);
  const stage = css.indexOf('.stage-view canvas {'), widget = css.indexOf('canvas.wgl.wgl, ');
  assert.ok(stage >= 0 && widget > stage, 'and it comes later, so a tie cannot go to the stage rule');
});

test('a widget\'s picture is drawn again when its box changes size (a window or card resize), not left stretched at the old buffer', () => {
  const widget = readFileSync(new URL('../src/ui/widget-gl.js', import.meta.url), 'utf8');
  assert.match(widget, /onCanvasResized\(host, \(\) => api\.paint\(\)\)/);
  assert.match(widget, /unsized\(\); gpu\?\.dispose\(\)/);
});

test('a frame the GPU could not draw never takes a widget\'s picture down (its page look is out of the way, so a hidden picture was a vanished slider)', () => {
  const widget = readFileSync(new URL('../src/ui/widget-gl.js', import.meta.url), 'utf8');
  const trace = readFileSync(new URL('../src/ui/trace-gl.js', import.meta.url), 'utf8');
  assert.match(widget, /createTraceGL\(host, \{ redraw: \(\) => api\.paint\(\), keep: true \}\)/);
  assert.match(trace, /hide\(\) \{(?:\n\s+\/\/[^\n]*)*\n\s+if \(\(keep \|\| \(!failed && !dead\)\) && host\.style\.opacity === '0'\) return;/);
});
