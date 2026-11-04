// A chart drawn again glides from the old drawing to the new one instead of fading one over the other (svg-morph.js, sprint 1 Nov).
// The pure parts (numbers inside a string, polyline growth, what is "the same piece") are tested on their own; the morph itself runs on
// a small stand-in for the page's elements.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

class El {
  constructor(tag, attrs = {}, ...kids) {
    this.localName = tag; this.attrs = new Map(Object.entries(attrs).map(([k, v]) => [k, String(v)])); this.children = []; this.parentNode = null;
    this.vis = ''; this.anims = []; this.css = '1';
    this.style = { setProperty() {}, removeProperty() {} };
    Object.defineProperty(this.style, 'visibility', { get: () => this.vis, set: (v) => { this.vis = String(v); } });
    this.append(...kids);
  }
  animate(frames, opts) { const a = { frames, opts, cancelled: false, cancel() { this.cancelled = true; } }; this.anims.push(a); return a; }
  getAnimations() { return this.anims.filter((a) => !a.cancelled); }
  append(...k) { for (const c of k) { if (typeof c === 'string') { this.text = (this.text || '') + c; continue; } c.parentNode?.children.splice(c.parentNode.children.indexOf(c), 1); c.parentNode = this; this.children.push(c); } }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n.root === true; }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  hasAttribute(k) { return this.attrs.has(k); }
  getAttributeNames() { return [...this.attrs.keys()]; }
  get textContent() { return (this.text || '') + this.children.map((c) => c.textContent).join(''); }
  querySelectorAll() { const out = []; const walk = (n) => { for (const c of n.children) { out.push(c); walk(c); } }; walk(this); return out; }
}
let frames = [];
globalThis.requestAnimationFrame = (cb) => { const id = setTimeout(() => cb(performance.now()), 4); frames.push(id); return id; };
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.getComputedStyle = (el) => ({ opacity: el.css });
const M = await import('../src/ui/svg-morph.js');
const { reduceMotionMQ } = await import('../src/ui/motion.js');
const { splitNums, joinNums, polyPoints, polyD, tweenOf, tweenAt, describe, planMorph, morphSvg, holdTween } = M;

const svgOf = (...kids) => new El('svg', { viewBox: '0 0 100 50' }, ...kids);
const line = (x1, y1, x2, y2, extra = {}) => new El('line', { x1, y1, x2, y2, ...extra });
const text = (x, y, s, extra = {}) => new El('text', { x, y, ...extra }, s);

test('numbers inside a string split and join back, whatever the glue', () => {
  const { glue, nums } = splitNums('M1 2L3.5 -4');
  assert.deepEqual(glue, ['M', ' ', 'L', ' ', '']);
  assert.deepEqual(nums, [1, 2, 3.5, -4]);
  assert.equal(joinNums(glue, nums), 'M1 2L3.5 -4');
  assert.equal(joinNums(...Object.values(splitNums('rotate(-45 12.5 30)'))), 'rotate(-45 12.5 30)');
  assert.equal(joinNums(['', ''], [1.004]), '1', 'two decimals at most, no trailing zeros');
});

test('a glide runs between strings in one pattern; a polyline that gains a point grows out of its end, one that loses a point folds into it', () => {
  const t = tweenOf('x', '10', '20');
  assert.equal(tweenAt(t, 0), '10'); assert.equal(tweenAt(t, 0.5), '15'); assert.equal(tweenAt(t, 1), '20');
  assert.deepEqual(tweenOf('x', '5', '5'), { still: true });
  const g = tweenOf('d', 'M0 0L10 10', 'M0 0L5 5L20 20');
  assert.ok(g.poly);
  assert.equal(tweenAt(g, 0), 'M0 0L10 10L10 10', 'the new stretch starts at the old end');
  assert.equal(tweenAt(g, 1), 'M0 0L5 5L20 20');
  const f = tweenOf('d', 'M0 0L5 5L20 20', 'M0 0L10 10');
  assert.equal(tweenAt(f, 0), 'M0 0L5 5L20 20'); assert.equal(tweenAt(f, 1), 'M0 0L10 10L10 10', 'the lost stretch folds into the new end');
  assert.equal(tweenOf('d', 'M0 0C1 1 2 2 3 3', 'M0 0L1 1L2 2'), null, 'different commands cannot be put side by side');
  assert.equal(tweenOf('transform', 'rotate(-45 1 2)', 'translate(1 2)'), null);
  assert.deepEqual(polyPoints('M 1,2 L 3,4'), [[1, 2], [3, 4]]);
  assert.equal(polyPoints('M1 2H4'), null);
  assert.equal(polyD([[1, 2], [3.5, 4]]), 'M1 2L3.5 4');
});

test('the same piece is the same kind at the same place with the same look and words; the n-th of a key in the old drawing is the n-th in the new', () => {
  const old = svgOf(line(0, 0, 10, 0, { class: 'g' }), line(0, 5, 10, 5, { class: 'g' }), text(3, 4, '10'), text(3, 9, '20'));
  const next = svgOf(line(0, 1, 10, 1, { class: 'g' }), line(0, 6, 10, 6, { class: 'g' }), line(0, 9, 10, 9, { class: 'g' }), text(3, 5, '10'), text(3, 11, '30'));
  const p = planMorph(describe(old), describe(next));
  assert.equal(p.pairs.length, 3, 'two lines and the word 10');
  assert.deepEqual(p.pairs.map((q) => q.b.geo.y1 ?? q.b.geo.y), ['1', '6', '5']);
  assert.equal(p.newOnly.length, 2, 'the third line and the word 30 fade in');
  assert.equal(p.oldOnly.length, 1, 'the word 20 fades out');
  assert.equal(p.pairs.find((q) => q.b.geo.y === '5').tweens[0][0], 'y');
});

test('a changed look or other words is no pair: a colour never changes part way and a word never turns into another', () => {
  const old = svgOf(line(0, 0, 10, 0, { class: 'a', style: 'stroke: var(--x)' }), text(1, 1, '9.0', { class: 'v' }));
  const next = svgOf(line(0, 0, 20, 0, { class: 'a', style: 'stroke: var(--y)' }), text(1, 1, '7.0', { class: 'v' }));
  const p = planMorph(describe(old), describe(next));
  assert.equal(p.pairs.length, 0); assert.equal(p.newOnly.length, 2); assert.equal(p.oldOnly.length, 2);
  // The opacity and visibility the morph itself writes, and a style written back in the browser's form, do not make a look.
  const mid = svgOf(line(0, 0, 10, 0, { style: 'stroke: var(--x); opacity: 0.4;' })), fresh = svgOf(line(0, 0, 12, 0, { style: 'stroke:var(--x)' }));
  assert.equal(planMorph(describe(mid), describe(fresh)).pairs.length, 1);
  assert.equal(planMorph(describe(svgOf(text(1, 1, 'a', { style: 'font-size: 12.00px' }))), describe(svgOf(text(2, 1, 'a', { style: 'font-size: 12px' })))).pairs.length, 1);
});

test('a piece whose geometry cannot be put side by side is no pair; a piece only one side has an attribute for is none either', () => {
  const old = svgOf(new El('path', { d: 'M0 0C1 1 2 2 3 3' }), new El('rect', { x: 0, y: 0, width: 4 }));
  const next = svgOf(new El('path', { d: 'M0 0L1 1' }), new El('rect', { x: 0, y: 0, width: 4, height: 2 }));
  const p = planMorph(describe(old), describe(next));
  assert.equal(p.pairs.length, 0);
});

test('data-nomorph keeps a piece, or a group of them, from being paired: the old one fades out and the new one fades in, like any piece with no partner', () => {
  const g = new El('g', { 'data-nomorph': '' }, new El('circle', { cx: 1, cy: 1, r: 2 }));
  const old = svgOf(g, new El('circle', { cx: 3, cy: 3, r: 2, 'data-nomorph': '' }), line(0, 0, 1, 1));
  const g2 = new El('g', { 'data-nomorph': '' }, new El('circle', { cx: 5, cy: 1, r: 2 }));
  const next = svgOf(g2, new El('circle', { cx: 6, cy: 3, r: 2, 'data-nomorph': '' }), line(0, 0, 2, 2));
  const p = planMorph(describe(old), describe(next));
  assert.equal(p.pairs.length, 1); assert.equal(p.newOnly.length, 2); assert.equal(p.oldOnly.length, 2);
});

test('a clip path in <defs> glides with its drawing and never fades; ids of the two drawings may differ', () => {
  const clip = (id, w) => new El('defs', {}, new El('clipPath', { id }, new El('rect', { x: 0, y: 0, width: w, height: 20 })));
  const old = svgOf(clip('pzr1', 100), new El('rect', { class: 'bg', 'clip-path': 'url(#pzr1)', x: 0, y: 0, width: 100, height: 20 }));
  const next = svgOf(clip('pzr2', 120), new El('rect', { class: 'bg', 'clip-path': 'url(#pzr2)', x: 0, y: 0, width: 120, height: 20 }), new El('defs', {}, new El('clipPath', { id: 'extra' }, new El('rect', { x: 0, y: 0, width: 1, height: 1 }))));
  const p = planMorph(describe(old), describe(next));
  assert.equal(p.pairs.length, 2, 'the clip rect and the panel');
  assert.equal(p.newOnly.length, 0, 'the extra clip is not faded');
});

test('the groups a piece sits in are part of its place: a piece under another transform is not the same piece', () => {
  const old = svgOf(new El('g', { class: 'm', transform: 'translate(1 2)' }, line(0, 0, 1, 1)));
  const next = svgOf(new El('g', { class: 'm', transform: 'translate(5 2)' }, line(0, 0, 1, 1)));
  assert.equal(planMorph(describe(old), describe(next)).pairs.length, 0);
  const same = svgOf(new El('g', { class: 'm now', transform: 'translate(1 2)' }, line(0, 0, 2, 2)));
  assert.equal(planMorph(describe(old), describe(same)).pairs.length, 1, 'a group that becomes "now" (or on, off) is still itself');
});

test('a gridline and a cut-off line are different pieces though both stand in a ptk-grid group; a group\'s data-* splits them again (a cut that changes its rating)', () => {
  const grid = (y) => new El('g', { class: 'ptk-grid' }, line(0, y, 10, y)), cut = (y, rate) => new El('g', { class: 'ptk-grid cut', 'data-rate': rate }, line(0, y, 10, y));
  const old = svgOf(grid(10), grid(20), grid(30), cut(15, 'mid'), cut(25, 'hi'));
  const next = svgOf(grid(8), grid(16), cut(12, 'mid'), cut(20, 'hi'));
  const p = planMorph(describe(old), describe(next));
  assert.deepEqual(p.pairs.map((q) => [q.a.geo.y1, q.b.geo.y1]), [['10', '8'], ['20', '16'], ['15', '12'], ['25', '20']], 'each line glides to the line of its own kind');
  assert.equal(p.oldOnly.length, 1, 'the third gridline fades out');
  const recoloured = svgOf(grid(8), grid(16), cut(12, 'hi'), cut(20, 'hi'));
  const q = planMorph(describe(old), describe(recoloured));
  assert.equal(q.pairs.length, 3, 'a cut that is now another rating is not the old cut: it fades, so its colour never changes part way');
});

const mount = (...kids) => { const host = new El('div'); host.root = true; const s = svgOf(...kids); host.append(s); return [host, s]; };

test('morphSvg: the new drawing starts where the old stood, the old pieces are put out of sight, then it lands on its own numbers and the old drawing goes', async () => {
  const [host, old] = mount(line(0, 0, 10, 0, { class: 'g' }), text(3, 4, 'a'), text(9, 9, 'gone'));
  const next = svgOf(line(0, 20, 30, 20, { class: 'g' }), text(3, 14, 'a'), text(20, 3, 'fresh'));
  assert.equal(morphSvg(old, next), true);
  assert.equal(host.children.length, 2, 'both drawings stand while it glides');
  assert.equal(next.children[0].getAttribute('x2'), '10', 'the line starts as the old one was');
  assert.equal(next.children[0].getAttribute('y1'), '0');
  assert.equal(old.children[0].vis, 'hidden'); assert.equal(old.children[1].vis, 'hidden'); assert.equal(old.children[2].vis, '', 'a leaving word stays to fade');
  const [out] = old.children[2].anims, [inn] = next.children[2].anims;
  assert.deepEqual(out.frames, [{ opacity: 1 }, { opacity: 0 }], 'the leaving word fades out');
  assert.deepEqual(inn.frames, [{ opacity: 0 }, { opacity: 1 }], 'the new word fades in');
  assert.ok(inn.opts.delay > 0 && inn.opts.duration > 0 && out.opts.delay === 0, 'the new words come once the old ones are going');
  assert.equal(next.children[0].anims.length + next.children[1].anims.length, 0, 'a piece in both is only moved, never faded');
  await new Promise((r) => setTimeout(r, 160));
  const mid = +next.children[0].getAttribute('x2');
  assert.ok(mid > 10 && mid < 30, `part way (${mid})`);
  assert.equal(next.children[0].attrs.get('x2'), '30', 'the glide is held on the piece: no attribute is written in a frame');
  await new Promise((r) => setTimeout(r, 480));
  assert.equal(host.children.length, 1, 'the old drawing is gone');
  assert.equal(host.children[0], next);
  assert.equal(next.children[0].getAttribute('x2'), '30'); assert.equal(next.children[0].getAttribute('y1'), '20');
  assert.ok(inn.cancelled, 'the fade is let go, so the stylesheet has the piece again');
});

test('a number the chart writes itself while a piece glides is kept, and the glide lets go of it', async () => {
  const [, old] = mount(line(0, 0, 10, 0, { class: 'g' }));
  const next = svgOf(line(0, 20, 30, 20, { class: 'g' }));
  morphSvg(old, next);
  await new Promise((r) => setTimeout(r, 60));
  next.children[0].setAttribute('x2', '77');
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(next.children[0].getAttribute('x2'), '77', 'the chart\'s own number shows');
  assert.notEqual(next.children[0].getAttribute('y1'), '77');
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(next.children[0].getAttribute('x2'), '77');
  assert.equal(next.children[0].getAttribute('y1'), '20', 'the other numbers still land');
});

test('a piece the stylesheet holds at less than full strength is never faded by the morph (a ring that is off)', () => {
  const [, old] = mount(line(0, 0, 10, 0, { class: 'g' }), text(9, 9, 'gone'));
  old.children[1].css = '0';
  const ring = text(20, 3, 'fresh'); ring.css = '0';
  const next = svgOf(line(0, 20, 30, 20, { class: 'g' }), ring);
  assert.equal(morphSvg(old, next), true);
  assert.equal(old.children[1].anims.length, 0); assert.equal(ring.anims.length, 0);
});

test('morphSvg does nothing, and says so, when it cannot: another size, no common piece, Reduce Motion', () => {
  const [, old] = mount(line(0, 0, 1, 1));
  assert.equal(morphSvg(old, new El('svg', { viewBox: '0 0 200 50' }, line(0, 0, 2, 2))), false, 'a different viewBox');
  const [h2, old2] = mount(text(1, 1, 'a'));
  assert.equal(morphSvg(old2, svgOf(text(1, 1, 'b'))), false, 'no piece in common');
  assert.equal(h2.children.length, 1, 'the page was not touched');
  assert.equal(old2.children[0].vis, '');
  assert.equal(old2.children[0].anims.length, 0);
  const [, old3] = mount(line(0, 0, 1, 1));
  reduceMotionMQ.matches = true;
  assert.equal(morphSvg(old3, svgOf(line(0, 0, 2, 2))), false, 'Reduce Motion');
  reduceMotionMQ.matches = false;
  assert.equal(morphSvg(null, svgOf()), false);
  assert.equal(morphSvg(new El('svg'), svgOf()), false, 'a drawing that is not on the page');
});

test('a morph begun mid-glide takes the drawing as it stands: no piece jumps, the earlier morph lets go of it', async () => {
  const [host, a] = mount(line(0, 0, 10, 0, { class: 'g' }));
  const b = svgOf(line(0, 0, 50, 0, { class: 'g' }));
  morphSvg(a, b);
  await new Promise((r) => setTimeout(r, 150));
  const mid = +b.children[0].getAttribute('x2');
  assert.ok(mid > 10 && mid < 50);
  const c = svgOf(line(0, 0, 90, 0, { class: 'g' }));
  morphSvg(b, c);
  assert.equal(c.children[0].getAttribute('x2'), String(mid), 'the new morph starts at the numbers the old one showed');
  await new Promise((r) => setTimeout(r, 700));
  assert.deepEqual(host.children, [c], 'only the last drawing is left');
  assert.equal(c.children[0].getAttribute('x2'), '90');
  assert.equal(b.children[0].getAttribute('x2'), String(mid), 'the released drawing was not written again');
});

test('a polyline glides as held points (no text in a frame), a single number as a number; both let go at the landing', async () => {
  const path = (d) => new El('path', { d, class: 'p' });
  assert.ok(tweenOf('d', 'M0 0L10 10', 'M0 0L5 5L20 20').flat, 'a polyline of other length glides as points');
  assert.ok(tweenOf('d', 'M0 0L10 10', 'M0 0L20 40').flat, 'so does one of the same length');
  assert.equal(tweenOf('d', 'M0 0C1 1 2 2 3 3', 'M0 0C1 1 2 2 6 6').flat, undefined, 'a curve stays text');
  assert.equal(tweenOf('x', '10', '20').one, true);
  const [host, a] = mount(path('M0 0L10 10'), line(0, 0, 10, 0));
  const b = svgOf(path('M0 0L20 40'), line(0, 0, 30, 0));
  assert.equal(morphSvg(a, b), true);
  const [p] = b.children;
  assert.ok(p._pts, 'the path is held as points from the first frame');
  assert.deepEqual([...p._pts.buf.slice(0, 4)], [0, 0, 10, 10], 'it starts where the old one stood');
  await new Promise((r) => setTimeout(r, 160));
  const x = p._pts.buf[2];
  assert.ok(x > 10 && x < 20, `part way (${x})`);
  assert.equal(p.attrs.get('d'), 'M0 0L20 40', 'no attribute is written in a frame');
  await new Promise((r) => setTimeout(r, 560));
  assert.equal(p._pts, undefined, 'the points are let go at the landing');
  assert.equal(p.getAttribute('d'), 'M0 0L20 40');
  assert.equal(host.children.length, 1);
});

test('a curve glides as held commands and a transform as a held matrix, equal to the text they stand for', () => {
  const near = (got, want) => got.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-9, `${[...got]} vs ${want}`));
  const c = tweenOf('d', 'M0 0C0 10 10 10 10 0', 'M0 0C0 20 20 20 20 0');
  assert.ok(c.cmds && !c.flat, 'a curve of the same commands');
  const el = {};
  holdTween(el, 'd', c, 0.5);
  near(el._cmds.v, [0, 0, 0, 15, 15, 15, 15, 0]);
  assert.deepEqual([...el._cmds.op.slice(0, el._cmds.n)], [1, 3]);
  assert.equal(tweenOf('d', 'M0 0C0 10 10 10 10 0', 'M0 0L5 5'), null, 'other commands cannot be put side by side');
  assert.equal(tweenOf('d', 'M0 0A5 5 0 0 1 10 0', 'M0 0A5 5 0 1 1 10 0'), null, 'an arc whose flag changes does not glide');
  const t = tweenOf('transform', 'translate(0 0) rotate(0 5 5)', 'translate(10 20) rotate(90 5 5)');
  assert.ok(t.mat);
  holdTween(el, 'transform', t, 1);
  near(el._mat, [0, 1, -1, 0, 20, 20]);
  holdTween(el, 'transform', t, 0);
  near(el._mat, [1, 0, 0, 1, 0, 0]);
  const s = tweenOf('transform', 'scale(2)', 'scale(4)');
  holdTween(el, 'transform', s, 1);
  near(el._mat, [4, 0, 0, 4, 0, 0]);
  assert.equal(tweenOf('transform', 'foo(1)', 'foo(2)'), null, 'a function the matrix does not know is not paired');
});

test('the charts that morph keep their crossfade for when they cannot', () => {
  const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
  for (const f of ['talk-trace.js', 'tool-curve.js', 'tool-course.js']) {
    // (a chart drawn on the GPU hands its new drawing to its picture, svg-gl.js's show, which morphs or crossfades it)
    assert.match(src(f), /morphSvg\(|gl\.show\(/, `${f} morphs`);
    // (a chart drawn on the GPU, svg-gl.js, crossfades in its picture: fadeIn)
    assert.match(src(f), /classList\.add\('in'\)|gl\.fadeIn\(|gl\.show\(/, `${f} still has its crossfade for when it cannot`);
  }
  assert.match(src('svg-gl.js'), /g\.show = [\s\S]*morphSvg\([\s\S]*g\.fadeIn\(/, 'the GPU picture morphs a new drawing, or fades it in');
});
