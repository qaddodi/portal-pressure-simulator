// The liver's inflow card (tool-flows.js, tool: { kind: 'flows', of: 'inflow' }) is one bar across the card with the healthy
// split as a dashed line over it (Mohammad, 25 Oct, "the blood into the liver card ... so off center it's bad"). These check
// the places the words take (inflowLabels), then run the real card: one centred bar, the Healthy line and its words, nothing
// hanging, and a name that changes wording fading out and back in. The portal blood card shares the file: its bars stand centred
// (the right margin is the names' gutter) and a lone Healthy bar glides to the card's middle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { EDGES } from '../src/engine/topology.js';
import { inflowGeo, inflowMarker, inflowSpans, inflowLabels, barOrder, flowLayout, LABEL_GAP, MIN_BAR } from '../src/ui/tool-flows.js';

const idx = Object.fromEntries(EDGES.map((e, k) => [e.id, k]));
const size = { w: 330, h: 72, f: 12 };
const node = (tag) => ({
  tag, attrs: {}, kids: [], style: {}, dataset: {}, isConnected: true, clientWidth: size.w, clientHeight: size.h,
  setAttribute(k, v) { this.attrs[k] = v; },
  append(...k) { this.kids.push(...k); },
  replaceChildren(...k) { this.kids = k; },
  getBoundingClientRect() { return { width: size.w, height: size.h }; },
});
globalThis.document.createElement = (tag) => (tag === 'canvas' ? { getContext: () => null } : node(tag));
globalThis.document.createElementNS = (ns, tag) => node(tag);
globalThis.getComputedStyle = () => ({ fontSize: `${size.f}px`, getPropertyValue: () => '' });
let frames = [];
globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
globalThis.cancelAnimationFrame = () => {};
const { createFlowsTool } = await import('../src/ui/tool-flows.js');

const measure = (t, f, wt = 600) => t.length * f * (wt >= 700 ? 0.6 : 0.56);
const parts = (pv, ha) => [{ id: 'portal', name: 'Portal vein', pct: pv }, { id: 'artery', name: 'Hepatic artery', pct: ha }].filter((p) => p.pct > 0);
const fp = (pv, ha, shunt = 0) => {
  const Q = new Array(EDGES.length).fill(0);
  Q[idx.PRE_R] = pv / 2; Q[idx.PRE_L] = pv / 2; Q[idx.A_HR] = ha / 2; Q[idx.A_HL] = ha / 2; Q[idx.PV_TRUNK] = pv;
  return { at: { Q }, shunt };
};
const healthy = fp(73, 27);
const walk = (n, out = []) => { out.push(n); for (const k of n.kids || []) if (k && typeof k === 'object') walk(k, out); return out; };
const words = (n) => n.kids.filter((k) => typeof k === 'string').join('');
const drain = () => { let n = 0; while (frames.length && n++ < 300) frames.shift()(); return n; };
const drawCard = (of, now, w = 330, h = 72, f = 12) => {
  Object.assign(size, { w, h, f });
  frames = [];
  const card = createFlowsTool();
  card.configure({ kind: 'flows', of }, { fp: now, healthy: () => healthy });
  drain();
  return card;
};

test('the Healthy line stands where the healthy portal blood ends, its words inside the card', () => {
  for (const w of [160, 220, 330, 420, 600]) {
    const m = inflowMarker(parts(73, 27), w, 12, measure);
    assert.equal(m.text, 'Healthy portal 73%');
    assert.ok(Math.abs(m.x - 0.73 * w) < 1e-9);
    assert.ok(m.L >= 0 && m.R <= w + 1e-9, `the words fit the card at ${w}`);
    assert.ok(m.L <= m.x && m.x <= m.R, 'the line stands under its words');
  }
  assert.equal(inflowMarker(null, 330, 12, measure), null, 'no healthy split yet: no line');
  assert.equal(inflowMarker(parts(0, 100), 330, 12, measure), null);
  assert.equal(inflowMarker(parts(100, 0), 330, 12, measure), null);
});

test('words on a segment keep clear of its edges and the Healthy line; a segment too narrow for them takes the next wording', () => {
  const f = 12, geo = inflowGeo(f), g = geo.g;
  for (const w of [200, 260, 330, 420, 520, 700]) {
    for (const [pv, ha] of [[73, 27], [20, 80], [0, 100], [100, 0], [50, 50], [90, 10], [95, 5], [5, 95], [60, 40], [35, 65]]) {
      const mark = inflowMarker(parts(73, 27), w, f, measure), sp = inflowSpans(barOrder(parts(pv, ha), 'inflow'), w);
      const labs = inflowLabels(sp, w, geo, measure, mark);
      labs.forEach((l, i) => {
        const s = sp[i], v = `${s.pct}%`, vw = measure(v, f, 700), where = `w ${w}, ${pv}/${ha}, ${s.id}`;
        const full = s.id === 'portal' ? 'Portal vein' : 'Hepatic artery', short = s.id === 'portal' ? 'Portal' : 'Artery';
        const tw = [Math.max(measure(full, f, 500), vw), Math.max(measure(short, f, 500), vw), vw][l.tier];
        if (l.tier <= 2) {
          assert.ok(l.cx - tw / 2 >= s.a + g - 1e-6 && l.cx + tw / 2 <= s.b - g + 1e-6, `on its segment, ${g} px in: ${where}`);
          assert.ok(l.cx + tw / 2 <= mark.x - LABEL_GAP + 1e-6 || l.cx - tw / 2 >= mark.x + LABEL_GAP - 1e-6, `clear of the line: ${where}`);
        } else if (l.tier === 3) {
          const L = l.cx - l.tw / 2, R = l.cx + l.tw / 2;
          assert.ok(L >= -1e-6 && R <= w + 1e-6, `above the bar inside the card: ${where}`);
          assert.ok(L <= l.lead + 1e-6 && l.lead <= R + 1e-6, `its leader lands under it: ${where}`);
          assert.ok(R <= mark.L - g + 1e-6 || L >= mark.R + g - 1e-6, `clear of the Healthy words: ${where}`);
        }
      });
    }
  }
});

test('at the opening slide\'s width every name is whole where it fits and short where it does not', () => {
  const f = 12, geo = inflowGeo(f), mark = inflowMarker(parts(73, 27), 330, f, measure);
  const phone = inflowLabels(inflowSpans(parts(73, 27), 330), 330, geo, measure, mark);
  assert.deepEqual(phone.map((l) => l.tier), [0, 1], 'Portal vein whole, Artery short on a phone');
  const mac = inflowLabels(inflowSpans(parts(73, 27), 520), 520, geo, measure, inflowMarker(parts(73, 27), 520, f, measure));
  assert.deepEqual(mac.map((l) => l.tier), [0, 0], 'both whole on a wider card');
});

test('the card draws one bar the full width, centred top to bottom, with the Healthy line and no second bar', () => {
  for (const now of [healthy, fp(20, 80), fp(0, 100)]) {
    const card = drawCard('inflow', now);
    const all = walk(card.el.kids[0]), segs = all.filter((n) => n.attrs.class === 'pfl-seg');
    assert.ok(segs.length >= 1 && segs.length <= 2);
    assert.ok(Math.abs(Math.min(...segs.map((s) => +s.attrs.x))) < 1e-6, 'the bar starts at the card\'s left edge');
    assert.ok(Math.abs(Math.max(...segs.map((s) => +s.attrs.x + +s.attrs.width)) - size.w) < 1e-6, 'and runs to its right edge');
    assert.equal(new Set(segs.map((s) => s.attrs.y)).size, 1, 'one bar: every segment on one row');
    assert.ok(!all.some((n) => /pfl-(row|healthy|now)/.test(n.attrs.class || '')), 'no Healthy or Now bar, no row names');
    const mk = all.find((n) => n.attrs.class === 'pfl-mk');
    assert.ok(mk, 'the Healthy line is drawn');
    assert.equal(words(mk.kids.find((k) => k.tag === 'text')), 'Healthy portal 73%');
    const above = +mk.kids.find((k) => k.tag === 'text').attrs.y - inflowGeo(12).base, below = size.h - +mk.kids.find((k) => k.tag === 'line').attrs.y2;
    assert.ok(above >= 0 && Math.abs(above - below) < 0.01, `centred top to bottom: ${above.toFixed(1)} px above the drawing, ${below.toFixed(1)} below`);
    assert.ok(all.filter((n) => n.attrs.class === 'pfl-lead').length === 0, 'nothing hangs on a leader');
    card.dispose();
  }
});

test('the card is as tall as its drawing: the group fits the six em it is given', () => {
  const geo = inflowGeo(12);
  assert.ok(geo.h <= 6 * 12, `${geo.h} px of drawing in 72`);
  assert.ok(inflowGeo(16).h <= 6 * 16);
});

test('a name that changes wording fades out and back in, never two wordings at once, and the card settles', () => {
  const card = drawCard('inflow', healthy);
  const say = () => walk(card.el.kids[0]).filter((n) => n.attrs.class === 'pfl-lab' && n.attrs['data-part'] === 'portal').map((g) => g.kids.map(words).join('|'));
  assert.deepEqual(say(), ['Portal vein|73%']);
  frames = [];
  card.configure({ kind: 'flows', of: 'inflow' }, { fp: fp(20, 80), healthy: () => healthy });
  const seen = new Set();
  let n = 0;
  while (frames.length && n++ < 300) { frames.shift()(); for (const s of say()) seen.add(s.split('|')[0]); assert.ok(say().length <= 1, 'one portal label at a time'); }
  assert.ok(n < 300, 'it settles');
  assert.ok(seen.has('Portal vein') && seen.has('Portal'), 'the old wording faded out, the new one in');
  assert.deepEqual(say(), ['Portal|20%']);
  card.dispose();
});

test('the portal blood card\'s bars stand centred where the card has the room: the margin at the right is the names\' gutter at the left', () => {
  const portal = [{ id: 'liver', name: 'Liver', pct: 70 }, { id: 'var', name: 'Varices', pct: 20 }, { id: 'srs', name: 'Splenorenal', pct: 10 }];
  const h = [{ id: 'liver', name: 'Liver', pct: 100 }];
  for (const w of [480, 520, 700]) {
    const lay = flowLayout(portal, 'portal', w, 160, 12, measure, h);
    assert.ok(Math.abs(lay.gut - (w - lay.gut - lay.bw)) < 1e-9, `${w}: ${lay.gut} left, ${w - lay.gut - lay.bw} right`);
    assert.ok(Math.abs(lay.segs.at(-1).b - (w - lay.gut)) < 1e-6, 'the last segment ends at the margin');
  }
  // (Narrower, the margin gives way before the bar drops under MIN_BAR; it never depends on the slide, so the bars keep one width.)
  for (const w of [260, 330, 420]) {
    const a = flowLayout(portal, 'portal', w, 160, 12, measure, h), b = flowLayout([{ id: 'liver', name: 'Liver', pct: 100 }], 'portal', w, 160, 12, measure, h);
    assert.ok(a.bw >= Math.min(w - a.gut, MIN_BAR) - 1e-9, `${w}: the bar keeps ${a.bw} px`);
    assert.equal(a.bw, b.bw, `${w}: the same bar width on every slide`);
  }
});

test('a Healthy bar standing alone glides to the card\'s middle, and the Now bar returns beneath it', () => {
  // (Shunt 0: the portal card's Now bar reads the same as Healthy, so only the Healthy bar shows.)
  const alone = drawCard('portal', fp(73, 27, 0), 420, 160, 12);
  const bar = (card) => walk(card.el.kids[0]).filter((n) => n.attrs.class === 'pfl-seg').map((n) => +n.attrs.y);
  const g = [...new Set(bar(alone))];
  assert.equal(g.length, 1, 'one bar');
  assert.ok(Math.abs(g[0] - (160 - 2.7 * 12) / 2) < 0.5, `in the middle: bar at ${g[0]} of 160`);
  alone.dispose();
  const both = drawCard('portal', fp(73, 27, 0.3), 420, 160, 12);
  const ys = [...new Set(bar(both))].sort((a, b) => a - b);
  assert.equal(ys.length, 2, 'Healthy above, Now under it');
  assert.ok(ys[0] < g[0], 'the Healthy bar is higher while the Now bar is there');
  both.dispose();
});
