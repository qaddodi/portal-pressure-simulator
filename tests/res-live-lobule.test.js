// Figure resolution in the lobule and the sinusoid while they show (30 Oct, Mohammad: "I don't think the lobule and sinusoid are
// obeying resolutions? At least when I check manual 25% for example the lobule doesn't change"). A change made while either shows
// is taken up once it stands still, under the anatomy's FADE_MS smoothstep: the lobule's layers stacked into one opaque cover that
// fades out over them (lobule-zoom.js resSwap), the sinusoid's canvas mixed as the anatomy's is (sinusoid-view.js svSwap). These
// tests run the pixels of both through a model of the page and pin the code paths they rely on; Full (no change) runs none of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

// A one-pixel 2D context compositing premultiplied RGBA as a canvas does (source-over, lighter, globalAlpha).
function ctx2d(cv) {
  const c = { buf: [0, 0, 0, 0], globalAlpha: 1, globalCompositeOperation: 'source-over' };
  c.setTransform = () => {}; c.clearRect = () => { c.buf = [0, 0, 0, 0]; };
  c.save = c.restore = c.beginPath = c.rect = c.clip = () => {};
  c.drawImage = (img) => {
    const s = img.px.map((v) => v * c.globalAlpha);
    c.buf = c.globalCompositeOperation === 'lighter' ? c.buf.map((v, i) => Math.min(1, v + s[i])) : c.buf.map((v, i) => s[i] + v * (1 - s[3]));
  };
  cv.ctx = c;
  return c;
}
function canvas(px, extra = {}) {
  const cv = { style: { opacity: '', visibility: '' }, width: 4, height: 4, offsetWidth: 2, offsetHeight: 2, isConnected: true, ...extra };
  if (px) cv.px = px;
  else { cv.getContext = () => cv.ctx || ctx2d(cv); Object.defineProperty(cv, 'px', { get: () => cv.ctx.buf }); }
  return cv;
}
globalThis.document = { createElement: () => canvas(null) };
const { stackInto, viewFollow, mixInto, fadeAlpha, FADE_MS } = await import('../src/ui/res-fade.js');

const pm = (r, g, b, a) => [r * a, g * a, b * a, a];
const over = (top, under) => top.map((v, i) => v + under[i] * (1 - top[3]));
const mix = (a, o, n) => o.map((v, i) => v * a + n[i] * (1 - a));
const near = (x, y, msg) => x.forEach((v, i) => assert.ok(Math.abs(v - y[i]) < 1e-9, `${msg}: channel ${i} ${v} vs ${y[i]}`));

test('stackInto stacks the layers that show, in order, and skips hidden, empty or detached ones', () => {
  const tissue = canvas(pm(0.9, 0.8, 0.7, 1)), vessels = canvas(pm(0.8, 0.1, 0.1, 0.5)), fx = canvas(pm(0.2, 0.6, 0.9, 0.3));
  const off = canvas(pm(0, 0, 0, 1), { style: { opacity: '0', visibility: '' } }), hid = canvas(pm(0, 0, 0, 1), { style: { opacity: '', visibility: 'hidden' } });
  const empty = canvas(pm(0, 0, 0, 1), { width: 0 }), gone = canvas(pm(0, 0, 0, 1), { isConnected: false });
  const cv = canvas(null);
  assert.equal(stackInto(cv, [tissue, off, hid, vessels, empty, gone, fx, null]), true);
  near(cv.px, over(fx.px, over(vessels.px, tissue.px)), 'the page\'s own stack');
  assert.equal(stackInto(canvas(null), [off, hid, empty]), false, 'nothing shows: no cover');
});

test('viewFollow carries the picture with a pan and a zoom, and is nothing while the view stands', () => {
  assert.equal(viewFollow({ k: 2, x: 10, y: 20 }, { k: 2, x: 10, y: 20 }), '');
  const v0 = { k: 2, x: 10, y: 20 }, v = { k: 3, x: -5, y: 40 };
  const m = viewFollow(v0, v).match(/matrix\((.+)\)/)[1].split(',').map(Number);
  for (const w of [[0, 0], [7, -3], [100, 50]]) {
    const s0 = [w[0] * v0.k + v0.x, w[1] * v0.k + v0.y], s = [w[0] * v.k + v.x, w[1] * v.k + v.y];
    assert.ok(Math.abs(m[0] * s0[0] + m[2] * s0[1] + m[4] - s[0]) < 1e-9 && Math.abs(m[1] * s0[0] + m[3] * s0[1] + m[5] - s[1]) < 1e-9, `world ${w}`);
  }
});

test('the lobule: the cover over the redrawn layers shows old × a + new × (1 − a) all the way, and a second change starts from what shows', () => {
  // The tissue fills every pixel; the vessels and the ductules over it are translucent, and a lower share softens them (other values).
  const at = (k) => [canvas(pm(0.92, 0.86, 0.8, 1)), canvas(pm(0.75, 0.15 + k * 0.1, 0.12, 0.55 + k * 0.2)), canvas(pm(0.3, 0.55, 0.85, 0.25 + k * 0.1))];
  const shown = (layers) => layers.reduce((s, l) => over(l.px, s), [0, 0, 0, 0]);
  const old = at(1), cover = canvas(null);
  stackInto(cover, old);
  const oldPic = shown(old);
  const now = at(0.25), newPic = shown(now);
  let last = null;
  for (let t = 0; t <= FADE_MS; t += 16.7) {
    const a = fadeAlpha(t / FADE_MS), screen = over(cover.px.map((v) => v * a), newPic);
    near(screen, mix(a, oldPic, newPic), `${t.toFixed(0)} ms`);
    if (last) assert.ok(Math.abs(screen[0] - last[0]) < 0.02, 'no step between frames');
    last = screen;
  }
  near(over(cover.px.map((v) => v * fadeAlpha(0)), newPic), oldPic, 'the first frame shows the picture before');
  // A second change at a: the new cover is the layers as they stand with the old cover laid at its weight, so nothing jumps.
  const a = fadeAlpha(0.4), before = over(cover.px.map((v) => v * a), newPic);
  const next = canvas(null);
  stackInto(next, now);
  next.ctx.globalAlpha = a; next.ctx.drawImage(cover); next.ctx.globalAlpha = 1;
  near(next.px, before, 'the second cover is the screen as it was');
});

test('the sinusoid: the mix of its translucent canvas keeps the screen constant when the two pictures agree, and runs old to new', () => {
  const glow = pm(0.6, 0.3, 0.5, 0.45), bg = pm(0.96, 0.95, 0.93, 1);
  const c0 = canvas(glow), old = canvas(null); old.getContext().drawImage(c0);
  const cv = canvas(null), cvx = cv.getContext();
  for (let u = 0; u <= 1; u += 0.05) {
    mixInto(cvx, cv, old, canvas(glow), fadeAlpha(u), null);
    near(over(cv.px, bg), over(glow, bg), `the same picture at u ${u.toFixed(2)}`);
  }
  const sharp = pm(0.7, 0.2, 0.4, 0.6);
  mixInto(cvx, cv, old, canvas(sharp), fadeAlpha(0.5), null);
  near(cv.px, mix(fadeAlpha(0.5), glow, sharp), 'halfway: an even mix, weights summing to 1');
});

test('lobule-zoom.js: the change waits for a still, whole lobule, and its cover never touches the layers', () => {
  const lz = src('lobule-zoom.js');
  assert.match(lz, /const resSteady = \(\) => fade > 0\.98 && !diveScaled && sinU === 0 && !sinTo && !wide && !keep2D && !staging && !!geo && !!model;/);
  assert.match(lz, /if \(lzWant != null && resSteady\(\)\) resSwap\(\);\n\s*const drew = draw\(moving \? dt : 0\);/, 'swapped in the loop, just before the frame is drawn');
  assert.match(lz, /if \(resCover\) resCoverStep\(now\);/);
  assert.match(lz, /\(flowA === 0 \|\| flowA === 1\) && !resCover\) \{/, 'the loop sleeps only once the cover is gone');
  const swap = lz.slice(lz.indexOf('function resSwap()'), lz.indexOf('function resCoverStep('));
  assert.ok(swap.indexOf('if (draw(0))') < swap.indexOf('stackInto(cv, [tissue, tissueG, glCv, fx])'), 'copied in the frame that drew it');
  assert.ok(swap.indexOf('stackInto(') < swap.indexOf('lzK = k;'), 'at the share before');
  assert.match(swap, /tissueKey = ''; drawKey = ''; glDirty = true; fxDrawn = ''; fxBoxes = null; lyKey = ''; idleDrawn = '';/, 'every layer drawn whole');
  assert.match(swap, /else fx\.after\(cv\);/, 'over the layers, under the leaders and labels');
  assert.match(lz, /if \(u >= 1 \|\| diveScaled \|\| wide \|\| fade <= 0\) \{ resCoverEnd\(\); return; \}/);
  assert.match(lz, /setDiveZoom\(k, x, y, tx = x, ty = y\) \{\n\s*if \(k < 0\.9999\) resCoverEnd\(\);/, 'a dive takes it away before the layers scale');
  assert.match(lz, /function buildWide\(W, H, box\) \{\n\s*resCoverEnd\(\);/);
  assert.match(lz, /function release\(\) \{\n\s*dropWide\(\);\n\s*resCoverEnd\(\);/);
  assert.match(lz, /if \(fade === 0\) \{ resCoverEnd\(\);/);
  // (The layers' own opacity and visibility are set only where they were before.)
  assert.equal(lz.split('tissue.style.opacity').length - 1, 1);
  assert.equal(lz.split('glCv.style').length - 1, 0);
  assert.equal(lz.split('fx.style').length - 1, 0);
});

test('sinusoid-view.js: the change waits for the open view, is mixed right after each draw, and hides the canvas by visibility', () => {
  const sv = src('sinusoid-view.js');
  assert.match(sv, /if \(!paint\) return;\n\s*if \(svWant != null && gpu && open && !dive\) svSwap\(\);/);
  const swap = sv.slice(sv.indexOf('function svSwap()'), sv.indexOf('function svFadeStep('));
  assert.ok(swap.indexOf("gpuKey = '';") < swap.indexOf('draw(0, false);') && swap.indexOf('draw(0, false);') < swap.indexOf('drawImage(src, 0, 0)'), 'drawn again, then copied, in one frame');
  assert.ok(swap.indexOf('drawImage(src, 0, 0)') < swap.indexOf('svK = k;'), 'at the share before');
  assert.match(swap, /canvas\.style\.visibility = 'hidden';/);
  assert.ok(!/canvas\.style\.opacity/.test(sv), 'never its opacity');
  assert.match(sv, /const gk = go === 0 && !dive && !svFade \?/, 'drawn every frame while the mix runs');
  assert.match(sv, /gpuKey = gk;\n\s*if \(svFade\) svFadeStep\(\);/, 'the mix remade right after the canvas is drawn');
  assert.match(sv, /if \(u >= 1 \|\| dive\) \{ svFadeEnd\(\); return; \}/);
  assert.match(sv, /if \(opacity <= 0 && was > 0\) \{ svFadeEnd\(\);/);
});
