// The liver's inflow card (tool-flows.js, tool: { kind: 'flows', of: 'inflow' }) is one bar across the card with the healthy
// split as a dashed line over it (Mohammad, 25 Oct, "the blood into the liver card ... so off center it's bad"). These check
// the places the words take (inflowLabels), then run the real card: one centred bar, the Healthy line and its words, nothing
// hanging, and a name that changes wording fading out and back in. The portal blood card shares the file (Mohammad, 25 Oct, "the
// data card should be fixed similar to the other one (all of those kinds) centered"): one bar across it, a Healthy bracket over the
// bar, and a name too narrow for its segment in a pill under the bar, in centred rows, never on a leader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { EDGES } from '../src/engine/topology.js';
import { inflowGeo, inflowMarker, inflowSpans, inflowLabels, barOrder, routeGeo, routeHeight, routeRows, routeMarker, routeLayout, LABEL_GAP } from '../src/ui/tool-flows.js';

const idx = Object.fromEntries(EDGES.map((e, k) => [e.id, k]));
const size = { w: 330, h: 72, f: 12 };   // (the inflow card is six em tall, the portal blood card ten)
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
const fp = (pv, ha, shunt = 0, via = {}) => {
  const Q = new Array(EDGES.length).fill(0);
  Q[idx.PRE_R] = pv / 2; Q[idx.PRE_L] = pv / 2; Q[idx.A_HR] = ha / 2; Q[idx.A_HL] = ha / 2; Q[idx.PV_TRUNK] = pv;
  for (const [id, q] of Object.entries(via)) Q[idx[id]] = q;   // (the blood a route takes past the liver)
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

const bar = (card) => walk(card.el.kids[0]).filter((n) => n.attrs.class === 'pfl-seg');
const pills = (card) => walk(card.el.kids[0]).filter((n) => /\bpfl-pill\b/.test(n.attrs.class || ''));
const rectOf = (n) => n.kids.find((k) => k.tag === 'rect').attrs;
const portal = (liver, ...routes) => [{ id: 'liver', name: 'Liver', pct: liver }, ...routes.map(([id, name, pct]) => ({ id, name, pct }))];
const H = 10 * 12;   // (the portal blood card is ten em tall)

test('the portal blood bar spans the card whole; a segment that carries its name and percent has the room for them, one that carries only its percent has room for that', () => {
  const f = 12, geo = routeGeo(f), g = geo.g;
  for (const w of [200, 240, 280, 330, 420, 560, 720]) {
    for (const parts of [portal(70, ['var', 'Varices', 20], ['srs', 'Splenorenal', 10]), portal(20, ['tips', 'TIPS', 80]), portal(100), portal(91, ['var', 'Varices', 9]), portal(60, ['var', 'Varices', 20], ['grs', 'Gastrorenal', 12], ['pum', 'Paraumbilical', 5], ['other', 'Other', 3])]) {
      const lay = routeLayout(parts, w, H, f, measure, portal(100)), where = `w ${w}, ${parts.map((p) => p.pct).join('/')}`;
      assert.ok(lay.spans[0].a === 0 && Math.abs(lay.spans.at(-1).b - w) < 1e-9, `the bar spans the card: ${where}`);
      lay.spans.forEach((s, i) => {
        const room = s.b - s.a - 2 * g, pw = measure(`${s.pct}%`, f, 700), both = Math.max(measure(s.name, f, 500), pw);
        if (lay.tiers[i] === 0) assert.ok(both <= room + 1e-9, `${s.name} and its percent fit on the segment: ${where}`);
        if (lay.tiers[i] === 2) assert.ok(pw <= room + 1e-9 && both > room, `only its percent fits: ${where}`);
        if (lay.tiers[i] === 3) assert.ok(pw > room, `named in a pill only where not even its percent fits: ${where}`);
      });
    }
  }
});

test('pills under the bar: in the bar\'s order, in rows centred on the card, inside it, apart from each other, the rows within the card\'s height', () => {
  const f = 12, geo = routeGeo(f), many = portal(40, ['var', 'Varices', 22], ['grs', 'Gastrorenal', 12], ['pum', 'Paraumbilical', 8], ['srs', 'Splenorenal', 6], ['other', 'Other', 4], ['ret', 'Retroperitoneal', 4]);
  for (const w of [260, 300, 330, 420, 560]) {
    const lay = routeLayout(many, w, H, f, measure, portal(100));
    assert.ok(lay.ok && lay.rows <= routeRows(H, geo), `${w}: the rows fit the card`);
    assert.ok(lay.top >= 0 && lay.top + routeHeight(lay.rows, geo) <= H + 1e-9, `${w}: the drawing inside the card`);
    const rows = new Map();
    for (const p of lay.pills) { (rows.get(p.row) || rows.set(p.row, []).get(p.row)).push(p); assert.ok(p.cx - p.w / 2 >= -1e-9 && p.cx + p.w / 2 <= w + 1e-9, `${w}: a pill inside the card`); }
    for (const row of rows.values()) {
      const a = row[0].cx - row[0].w / 2, b = row.at(-1).cx + row.at(-1).w / 2;
      assert.ok(Math.abs(a - (w - b)) < 1e-6, `${w}: a row centred, ${a.toFixed(1)} px at its left and ${(w - b).toFixed(1)} at its right`);
      row.slice(1).forEach((p, i) => assert.ok(p.cx - p.w / 2 - (row[i].cx + row[i].w / 2) >= geo.gx - 1e-9, `${w}: pills apart`));
    }
    const named = lay.spans.filter((s, i) => lay.tiers[i] === 3).map((s) => s.id);
    assert.deepEqual(lay.pills.map((p) => p.id), named, `${w}: a pill for each name that has no room on the bar, in the bar's order`);
    assert.deepEqual([...rows.keys()], [...rows.keys()].sort(), 'rows run downward in order');
  }
});

test('where the rows are not enough the smallest routes join Other, the liver\'s share and one named route staying', () => {
  const f = 12, thin = portal(74, ['var', 'Varices', 7], ['grs', 'Gastrorenal', 6], ['pum', 'Paraumbilical', 5], ['srs', 'Splenorenal', 4], ['other', 'Other', 4]);
  const wide = routeLayout(thin, 700, H, f, measure, portal(100));
  assert.equal(wide.parts, thin, 'nothing merged where the card holds them');
  assert.ok(wide.ok);
  const narrow = routeLayout(thin, 260, H, f, measure, portal(100));
  assert.ok(narrow.parts.length < thin.length && narrow.ok, 'some routes joined Other');
  assert.equal(narrow.parts.reduce((s, p) => s + p.pct, 0), 100);
  assert.equal(narrow.parts.find((p) => p.id === 'liver').pct, 74);
  assert.ok(narrow.parts.some((p) => !['liver', 'other'].includes(p.id)), 'a route still named');
  const dropped = thin.filter((p) => p.id !== 'other' && !narrow.parts.some((q) => q.id === p.id));
  assert.equal(narrow.parts.find((p) => p.id === 'other').pct, 4 + dropped.reduce((sum, p) => sum + p.pct, 0), 'what left the bar is in Other');
  // The card holds two rows of pills at every text size (it is ten em tall).
  assert.equal(routeRows(10 * 12, routeGeo(12)), 2);
  assert.equal(routeRows(10 * 16, routeGeo(16)), 2);
});

test('the Healthy bracket spans the share its liver takes of the bar, its words centred over it and inside the card', () => {
  for (const w of [160, 260, 330, 560]) {
    const m = routeMarker(portal(100), w, 12, measure);
    assert.equal(m.text, 'Healthy: liver 100%');
    assert.ok(m.x0 === 0 && Math.abs(m.x1 - w) < 1e-9, 'the whole bar');
    assert.ok(m.L >= 0 && m.R <= w + 1e-9, 'the words inside the card');
    assert.ok(Math.abs((m.L + m.R) / 2 - w / 2) < 1e-6 || m.L === 0 || m.R === w, 'centred on the card');
  }
  assert.equal(routeMarker(portal(88, ['var', 'Varices', 12]), 400, 12, measure).x1, 352, 'a healthy split with some bypass ends where its liver ends');
  assert.equal(routeMarker(null, 330, 12, measure), null, 'no healthy split yet: no bracket');
});

test('the portal blood card draws one bar the full width, the bracket over it and the pills under it, centred top to bottom and left to right', () => {
  const now = fp(73, 27, 0.5, { C1b: 6, C5: 4, C3: 2, C6: 2.5, C4: 0.5 });   // (liver 50%; four routes, the smaller ones too narrow for their names)
  for (const [w, h] of [[330, H], [420, H], [260, H]]) {
    const card = drawCard('portal', now, w, h, 12), all = walk(card.el.kids[0]), segs = bar(card);
    assert.ok(segs.length >= 2, 'the liver and its routes');
    assert.ok(Math.abs(Math.min(...segs.map((s) => +s.attrs.x))) < 1e-6 && Math.abs(Math.max(...segs.map((s) => +s.attrs.x + +s.attrs.width)) - w) < 1e-6, `${w}: the bar runs from edge to edge`);
    assert.equal(new Set(segs.map((s) => s.attrs.y)).size, 1, 'one bar: every segment on one row');
    assert.ok(!all.some((n) => /pfl-(row|healthy|now|lead)/.test(n.attrs.class || '')), 'no second bar, no row names, nothing on a leader');
    const mk = all.find((n) => n.attrs.class === 'pfl-mk'), label = mk.kids.find((k) => k.tag === 'text');
    assert.equal(words(label), 'Healthy: liver 100%');
    assert.equal(mk.kids.find((k) => k.tag === 'path').tag, 'path', 'the bracket is drawn');
    // Centred left to right: each row of pills has as much card at its left as at its right.
    const rows = new Map();
    for (const p of pills(card)) { const r = rectOf(p), k = r.y; (rows.get(k) || rows.set(k, []).get(k)).push([+r.x, +r.x + +r.width]); }
    assert.ok(rows.size >= 1, `${w}: some names are in pills`);
    for (const row of rows.values()) { row.sort((a, b) => a[0] - b[0]); assert.ok(Math.abs(row[0][0] - (w - row.at(-1)[1])) < 0.01, `${w}: a row of pills centred`); }
    // Centred top to bottom: as much card above the Healthy words as under the last row.
    const geo = routeGeo(12), above = +label.attrs.y - geo.base, last = Math.max(...pills(card).map((p) => +rectOf(p).y + +rectOf(p).height)), below = h - last;
    assert.ok(above >= 0 && Math.abs(above - below) < 0.01, `${w}: ${above.toFixed(1)} px above the drawing, ${below.toFixed(1)} below`);
    card.dispose();
  }
});

test('a card with no pills (the liver alone) centres the bar and the bracket', () => {
  const card = drawCard('portal', fp(73, 27, 0), 330, H, 12), geo = routeGeo(12);
  const all = walk(card.el.kids[0]), label = all.find((n) => n.attrs.class === 'pfl-mk').kids.find((k) => k.tag === 'text');
  const seg = bar(card)[0], above = +label.attrs.y - geo.base, below = H - (+seg.attrs.y + +seg.attrs.height);
  assert.equal(pills(card).length, 0);
  assert.ok(Math.abs(above - below) < 0.01, `${above.toFixed(1)} above, ${below.toFixed(1)} below`);
  card.dispose();
});

test('a name that moves between the bar and a pill fades out and in: one wording at a time, and the card settles', () => {
  const card = drawCard('portal', fp(73, 27, 0.4, { C1b: 8 }), 330, H, 12);   // (Varices is the whole 40% bypassing the liver: named on its segment)
  const wording = () => walk(card.el.kids[0]).filter((n) => n.attrs['data-part'] === 'var' && /\b(pfl-lab|pfl-pill)\b/.test(n.attrs.class || '')).map((n) => n.attrs.class.replace('ppf-pill ', ''));
  assert.deepEqual(wording(), ['pfl-lab'], 'named on its segment');
  frames = [];
  card.configure({ kind: 'flows', of: 'portal' }, { fp: fp(73, 27, 0.4, { C1b: 0.6, C5: 7, C6: 0.3, C3: 0.2 }), healthy: () => healthy });   // (now 7% of the bypass: a few pixels)
  const seen = new Set();
  let n = 0;
  while (frames.length && n++ < 300) { frames.shift()(); assert.ok(wording().length <= 1, 'one wording of Varices at a time'); wording().forEach((c) => seen.add(c)); }
  assert.ok(n < 300, 'it settles');
  assert.ok(seen.has('pfl-lab') && seen.has('pfl-pill'), `the old wording faded out and the pill in: ${[...seen]}`);
  assert.deepEqual(wording(), ['pfl-pill'], 'named in a pill under the bar once it settles');
  card.dispose();
});
