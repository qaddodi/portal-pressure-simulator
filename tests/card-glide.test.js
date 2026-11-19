// The stiffness bar's mark and the SAAG plane's dots glide to a new reading, never jump (Mohammad, 15 Nov 2026). The cards drew their whole picture
// again at each reading with show(model, false), which puts the new model down at once; they go through cardShow (card-show.js) now, which asks for the
// picture's morph. No browser: the morph's own plan (svg-morph.js planMorph) is asked what it would do with two drawings of the bar, and a stand-in
// picture records how each drawing was put on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './dom-shim.js';

class El {
  constructor(tag, attrs = {}, ...kids) {
    this.localName = tag; this.attrs = new Map(Object.entries(attrs).map(([k, v]) => [k, String(v)])); this.children = []; this.parentNode = null; this.text = '';
    for (const c of kids) { if (typeof c === 'string') this.text += c; else { c.parentNode = this; this.children.push(c); } }
  }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  getAttributeNames() { return [...this.attrs.keys()]; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  querySelectorAll() { const out = []; const walk = (n) => { for (const c of n.children) { out.push(c); walk(c); } }; walk(this); return out; }
}
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
const { describe: describeSvg, planMorph } = await import('../src/ui/svg-morph.js');
const { stiffLayout } = await import('../src/ui/stiff-bar.js');
const { cardShow, glides, glideInStep, SHOW_GLIDE_MS } = await import('../src/ui/card-show.js');
const { COUNT_MS } = await import('../src/ui/motion.js');

const meas = (s, font) => s.length * 0.56 * parseFloat(/([\d.]+)px/.exec(font)[1]);
// The bar's drawing as createStiffBar builds it (the same kids from the same layout), on the stand-in elements.
const barOf = (lsm, plt, W = 320, f = 12) => {
  const L = stiffLayout(W, f, meas, { lsm, plt, note: true });
  return new El('svg', { width: W, height: L.H, viewBox: `0 0 ${W} ${L.H}` },
    ...L.rects.map((r) => new El('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: r.r, 'data-look': r.look })),
    ...L.paths.map((p) => new El('path', { d: p.d, 'data-look': p.look })),
    ...L.texts.map((s) => new El('text', { x: s.x, y: s.y, 'text-anchor': s.anchor, 'data-look': s.look }, s.t)));
};

test('a new reading moves the mark: its stem and its arrow are one piece in both drawings, and both glide', () => {
  const plan = planMorph(describeSvg(barOf(8, 200)), describeSvg(barOf(22, 200)));
  const mark = plan.pairs.filter((p) => p.b.el.getAttribute('data-look') === 'stiff.mk');
  assert.equal(mark.length, 2, 'the stem and the arrow are both kept');
  const stem = mark.find((p) => p.b.el.localName === 'rect'), arrow = mark.find((p) => p.b.el.localName === 'path');
  assert.ok(stem.tweens.some(([a, tw]) => a === 'x' && !tw.still), 'the stem glides along the bar');
  assert.ok(arrow.tweens.some(([a]) => a === 'd'), 'the arrow glides with it');
  // (Nothing else moves: the zones, the ticks and their words are the same pieces at the same places.)
  assert.equal(plan.pairs.filter((p) => p.tweens.length && p.b.el.getAttribute('data-look') !== 'stiff.mk').length, 0);
  assert.equal(plan.oldOnly.filter((a) => a.el.getAttribute('data-look') === 'stiff.mk').length, 0, 'the old mark does not fade out beside the glide');
});

test('a mark that first comes, or goes, fades with the morph, it is never put down or taken away in one frame', () => {
  const came = planMorph(describeSvg(barOf(null, 200)), describeSvg(barOf(8, 200)));
  assert.equal(came.newOnly.filter((b) => b.el.getAttribute('data-look') === 'stiff.mk').length, 2);
  const went = planMorph(describeSvg(barOf(8, 200)), describeSvg(barOf(null, 200)));
  assert.equal(went.oldOnly.filter((a) => a.el.getAttribute('data-look') === 'stiff.mk').length, 2);
});

test('cardShow: the first drawing and a drawing at a new size are put down, a later one at the same size glides', () => {
  const calls = [], gl = { show: (m, fade) => calls.push([m, fade]) }, put = cardShow(gl);
  put('a', '320|12'); put('b', '320|12'); put('c', '320|12'); put('d', '280|12'); put('e', '280|12'); put('f', '280|14');
  assert.deepEqual(calls.map((c) => c[1]), [false, true, true, false, true, false]);
  assert.equal(glides(null, '1'), false);
  assert.equal(glides('1', '1'), true);
});

test('the glide keeps in step with the number roll (one surface glide, 420 ms, against the roll\'s 400)', () => {
  assert.ok(glideInStep(), `${SHOW_GLIDE_MS} ms against ${COUNT_MS} ms`);
});

test('the instrument cards draw through cardShow, never show(model, false) at a new reading', () => {
  for (const f of ['src/ui/stiff-bar.js', 'src/ui/tool-saag.js']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.match(src, /cardShow\(gl\)/, `${f} makes its put`);
    assert.doesNotMatch(src, /gl\.show\(/, `${f} puts nothing down by hand`);
  }
});
