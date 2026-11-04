// The chart look resolver (src/ui/chart-looks, docs/chart-looks-in-code-plan.md WP2): layer order, inheritance, state, mix (srgb and
// oklab against known values), em / svk / cap, eases and reduced motion. Node only; the resolver reads no page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOKS, HOSTS } from '../src/ui/chart-looks/index.js';
import { lookFor, makeCtx, withCtx, setTokenSource, clearLookMemo, resolveProps, hostSizeFor, colourOf } from '../src/ui/chart-looks/resolve.js';
import { tok, param, mix, px, em, svk, cap, max, ease } from '../src/ui/chart-looks/dsl.js';
import { mixColor, parseCssColor } from '../src/ui/css-color.js';
import { D_SMALL } from '../src/ui/ease.js';

// (svg-gl.js's PROPS: [CSS property, attribute, inherited, initial]; copied here because that file loads only with a page.)
const PROPS = [['fill', 'fill', true, 'rgb(0, 0, 0)'], ['stroke', 'stroke', true, 'none'], ['strokeWidth', 'stroke-width', true, '1px'], ['opacity', 'opacity', false, '1'],
  ['fillOpacity', 'fill-opacity', true, '1'], ['strokeOpacity', 'stroke-opacity', true, '1'], ['strokeDasharray', 'stroke-dasharray', true, 'none'],
  ['strokeDashoffset', 'stroke-dashoffset', true, '0px'], ['strokeLinecap', 'stroke-linecap', true, 'butt'], ['strokeLinejoin', 'stroke-linejoin', true, 'miter'],
  ['fontSize', 'font-size', true, null], ['fontWeight', 'font-weight', true, '400'], ['textAnchor', 'text-anchor', true, 'start'], ['letterSpacing', 'letter-spacing', true, 'normal'],
  ['textTransform', 'text-transform', true, 'none'], ['paintOrder', 'paint-order', true, 'normal'], ['visibility', 'visibility', true, 'visible'], ['display', 'display', false, null],
  ['vectorEffect', 'vector-effect', false, 'none'], ['dominantBaseline', 'dominant-baseline', true, 'auto'],
  ['stopColor', 'stop-color', false, 'rgb(0, 0, 0)'], ['stopOpacity', 'stop-opacity', false, '1']];

class El {
  constructor(attrs = {}, parent = null) { this.a = attrs; this.parentElement = parent; this.nodeType = 1; }
  getAttribute(n) { return n in this.a ? this.a[n] : null; }
  hasAttribute(n) { return n in this.a; }
}
const TOKENS = {
  light: { text: '#1A1917', caution: '#A2700C', danger: '#B03C28', 'rx-tips': '#336699', surface: '#FFFFFF' },
  dark: { text: '#EEEBE5', caution: '#F0B43C', danger: '#F2634D', 'rx-tips': '#6699CC', surface: '#242321' },
};
setTokenSource((c) => TOKENS[c.dark ? 'dark' : 'light']);
HOSTS.talk = () => 14;
const rgba = (s) => colourOf(s).map((v) => Math.round(v * 255 * 1000) / 1000);
const near = (a, b, e = 0.6) => a.every((v, i) => Math.abs(v - b[i]) <= e);
const ctxLight = () => makeCtx({ host: 'talk', svk: 1.5, scale: { cap: 10, sm: 13 } });
const ctxDark = () => withCtx(ctxLight(), { dark: true, theme: 'dark' });
const look = (key, attrs, ctx, parent = null, root = true) => {
  const top = new El({ 'data-svg-model': '' });
  return lookFor(new El({ 'data-look': key, ...attrs }, root ? top : parent), ctx, null, PROPS);
};

test('mixColor: srgb and oklab against known values, and the percentages CSS reads', () => {
  assert.ok(near(mixColor('srgb', '#ff0000', 50, '#0000ff', 50).map((v) => v * 255), [127.5, 0, 127.5, 255], 0.01));
  const m = mixColor('srgb', '#1A1917', 11, 'transparent', undefined);   // premultiplied: the hue stays, the alpha is 11 %
  assert.ok(near(m.slice(0, 3).map((v) => v * 255), [26, 25, 23], 0.01) && Math.abs(m[3] - 0.11) < 1e-6);
  const g = mixColor('oklab', '#ffffff', 50, '#000000', 50).slice(0, 3).map((v) => v * 255);   // oklab L 0.5: rgb(99, 99, 99)
  assert.ok(near(g, [99.3, 99.3, 99.3], 0.3), String(g));
  const viaString = parseCssColor('color-mix(in oklab, #ffffff 50%, #000000 50%)');
  assert.deepEqual(mixColor('oklab', '#ffffff', 50, '#000000', 50), viaString, 'one mixer for the table and the page colours');
  assert.ok(near(mixColor('srgb', [1, 0, 0, 1], 25, [0, 0, 1, 1]).map((v) => v * 255), [63.75, 0, 191.25, 255], 0.01), 'arrays, and the rest of 100');
});

test('layer order: base, then each matching row in list order, a later row wins', () => {
  LOOKS['t.grid'] = { state: { rate: 'data-rate', cut: 'class:cut' }, base: { stroke: mix('srgb', tok('text'), 11, 'transparent'), width: 1 },
    when: [[{ cut: true }, { width: 1.5, dash: [4, 5] }], [{ rate: 'mid' }, { stroke: tok('caution') }], [{ rate: ['mid', 'hi'], cut: true }, { width: 3 }],
      [{ rate: 'hi' }, { stroke: tok('danger') }], [{ dark: true }, { width: px(2) }]] };
  const L = (attrs, ctx) => look('t.grid', attrs, ctx).o;
  assert.equal(L({}, ctxLight()).strokeWidth, '1px');
  assert.ok(near(rgba(L({}, ctxLight()).stroke), [26, 25, 23, 0.11 * 255], 0.01));
  assert.equal(L({ class: 'cut' }, ctxLight()).strokeWidth, '1.5px');
  assert.equal(L({ class: 'cut' }, ctxLight()).strokeDasharray, '4 5');
  assert.equal(L({ class: 'cut', 'data-rate': 'mid' }, ctxLight()).strokeWidth, '3px', 'the row after wins');
  assert.ok(near(rgba(L({ 'data-rate': 'hi' }, ctxLight()).stroke), [0xB0, 0x3C, 0x28, 255], 0.01));
  assert.equal(L({ 'data-rate': 'low' }, ctxLight()).stroke === L({}, ctxLight()).stroke, true, 'an unlisted value changes nothing');
  assert.equal(L({}, ctxDark()).strokeWidth, '2px', 'dark: true covers the system dark too');
  assert.ok(near(rgba(L({ 'data-rate': 'mid' }, ctxDark()).stroke), [0xF0, 0xB4, 0x3C, 255], 0.01), 'tokens come from the context’s look');
});

test('state is read off an ancestor in the model; a missing look or token is magenta, not silence', () => {
  const root = new El({ 'data-svg-model': '' }), g = new El({ class: 'ptk-grid cut', 'data-rate': 'hi' }, root), line = new El({ 'data-look': 't.grid' }, g);
  const o = lookFor(line, ctxLight(), null, PROPS).o;
  assert.equal(o.strokeWidth, '3px'); assert.ok(near(rgba(o.stroke), [0xB0, 0x3C, 0x28, 255], 0.01));
  const w = console.warn; console.warn = () => {};
  try {
    assert.deepEqual(rgba(look('t.nothing', {}, ctxLight()).o.fill), [255, 0, 255, 255]);
    LOOKS['t.bad'] = { base: { fill: tok('no-such-token') } };
    assert.deepEqual(rgba(look('t.bad', {}, ctxLight()).o.fill), [255, 0, 255, 255]);
  } finally { console.warn = w; }
});

test('inheritance and builder attributes: what the entry leaves alone comes from the parent, then the attribute', () => {
  LOOKS['t.text'] = { base: { font: [600, em(1)], anchor: 'middle' } };
  const parent = { fill: 'rgb(1, 2, 3)', stroke: 'none', strokeWidth: '1px', fontSize: '9px', opacity: '0.5' };
  const el = new El({ 'data-look': 't.text', opacity: '0.25', 'stroke-width': '3' }, new El({ 'data-svg-model': '' }));
  const r = lookFor(el, ctxLight(), parent, PROPS);
  assert.equal(r.o.fill, 'rgb(1, 2, 3)', 'fill is inherited');
  assert.equal(r.o.opacity, '0.25', 'opacity is not inherited: the attribute, and kept live'); assert.equal(r.o['@opacity'], true);
  assert.equal(r.o.strokeWidth, '3', 'the attribute stands where the entry left width alone');
  assert.equal(r.o.fontSize, '14px'); assert.equal(r.o.fontWeight, '600');
  assert.equal(r.o.textAnchor, 'middle'); assert.equal(r.o['@text-anchor'], undefined, 'an anchor the entry sets is not read live');
  const bare = new El({ 'data-look': 't.text', 'text-anchor': 'end' }, null);
  LOOKS['t.plain'] = { base: { fill: tok('text') } };
  const r2 = lookFor(new El({ 'data-look': 't.plain', 'text-anchor': 'end' }), ctxLight(), null, PROPS);
  assert.equal(r2.o.textAnchor, 'end'); assert.equal(r2.o['@text-anchor'], true); assert.equal(r2.o.fontSize, '14px', 'a root piece takes the host size'); assert.ok(bare);
});

test('sizes: em is the host, svk the chart’s letter scale, cap the card’s, max picks the larger', () => {
  LOOKS['t.size'] = { base: { size: svk(px(15)), width: max(px(1), em(0.075)), letterSpacing: cap(0.5) } };
  const o = look('t.size', {}, ctxLight()).o;
  assert.equal(o.fontSize, '22.5px'); assert.equal(o.strokeWidth, '1.05px'); assert.equal(o.letterSpacing, '5px');
  assert.equal(hostSizeFor(ctxLight()), 14);
  assert.equal(hostSizeFor(makeCtx({ host: 'none-such' })), 12);
});

test('param colours are token names given by the piece; the look re-resolves under another look', () => {
  LOOKS['t.band'] = { base: { fill: param('rx'), opacity: 0.12 }, when: [[{ dark: true }, { opacity: 0.24 }]] };
  LOOKS['t.name'] = { base: { fill: mix('oklab', param('rx'), 62, tok('text')) } };
  assert.ok(near(rgba(look('t.band', { 'data-p-rx': 'rx-tips' }, ctxLight()).o.fill), [0x33, 0x66, 0x99, 255], 0.01));
  assert.ok(near(rgba(look('t.band', { 'data-p-rx': 'rx-tips' }, ctxDark()).o.fill), [0x66, 0x99, 0xCC, 255], 0.01));
  assert.equal(look('t.band', { 'data-p-rx': 'rx-tips' }, ctxDark()).o.opacity, '0.24');
  const expect = mixColor('oklab', '#336699', 62, '#1A1917', 38).map((v) => v * 255);
  assert.ok(near(rgba(look('t.name', { 'data-p-rx': 'rx-tips' }, ctxLight()).o.fill), expect, 0.01));
});

test('eases: the duration and curve of ease.js, dropped in a reduced-motion row', () => {
  LOOKS['t.ease'] = { base: { opacity: 1, ease: { opacity: ease('small'), transform: ease('flip', 'ease-in-out') } }, when: [[{ motion: 'reduce' }, { ease: { opacity: null } }]] };
  const r = look('t.ease', {}, ctxLight());
  assert.equal(r.tr.ms, D_SMALL); assert.equal(r.tr.delay, 0); assert.equal(typeof r.tr.ease, 'function'); assert.ok(r.trT.ms > 0);
  const q = look('t.ease', {}, withCtx(ctxLight(), { motion: 'reduce' }));
  assert.equal(q.tr, null); assert.ok(q.trT);
  assert.equal(look('t.plain', {}, ctxLight()).tr, null);
});

test('container rows: minW and maxW read the box width, and the memo keeps them apart', () => {
  LOOKS['t.cq'] = { base: { size: px(10) }, when: [[{ minW: 400 }, { size: px(12) }], [{ maxW: 200 }, { size: px(8) }]] };
  const at = (w) => look('t.cq', {}, withCtx(ctxLight(), { boxW: w })).o.fontSize;
  assert.deepEqual([at(300), at(400), at(200), at(500)], ['10px', '12px', '8px', '12px']);
});

test('the memo: the same key, context and state answers the same record; clearing it keeps the answer', () => {
  const a = resolveProps(LOOKS['t.grid'], ctxLight(), { rate: 'mid', cut: false }, {});
  clearLookMemo();
  assert.deepEqual(resolveProps(LOOKS['t.grid'], ctxLight(), { rate: 'mid', cut: false }, {}), a);
});

test('the default token source is theme-tokens.js: a table entry reads the look the context names', async () => {
  const { tokensFor } = await import('../src/ui/theme-tokens.js');
  setTokenSource(tokensFor);
  LOOKS['t.real'] = { base: { fill: tok('text') } };
  const c = makeCtx({});
  assert.deepEqual(rgba(look('t.real', {}, c).o.fill), rgba(tokensFor(c).text));
  assert.notDeepEqual(rgba(look('t.real', {}, withCtx(c, { dark: true, theme: 'dark', palette: 'black' })).o.fill), rgba(tokensFor(c).text));
});

test('a piece with no data-look takes its attributes and its parent\'s, and asks nothing of the page (WP12)', () => {
  const parent = lookFor(new El({ fill: '#123456', 'font-size': '13' }), ctxLight(), null, PROPS);
  const kid = lookFor(new El({ stroke: '#abcdef', opacity: '0.4' }, null), ctxLight(), parent.o, PROPS).o;
  assert.equal(kid.fill, '#123456', 'fill is inherited');
  assert.equal(kid.stroke, '#abcdef');
  assert.equal(kid.opacity, '0.4');
  assert.equal(kid.visibility, 'visible');
  assert.equal(parent.cs, null);
});
