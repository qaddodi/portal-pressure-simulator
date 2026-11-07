// The portal blood card holds still while the model wobbles (Mohammad, 6 Nov 2026: "this card is glitching because lots of its content
// is changing"). A live model reads every 150 ms for up to a minute after a slide lands; each reading that moved a share by a whole
// percent laid the bar out again: a 14↔15 flip, a name on its segment one reading and in a pill under the bar the next, a fifth route
// trading places with Other. These check the three holds in tool-flows.js: a small move waits (smallMove, HOLD_PP), a part's wording
// keeps its place on the bar until it no longer fits (TIER_BAND), and a named route keeps its name against one only a little larger
// (KEEP_NAMED).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { EDGES } from '../src/engine/topology.js';
const { smallMove, HOLD_PP, routeLayout, inflowGeo, inflowSpans, inflowLabels, barOrder, flowParts, TIER_BAND, KEEP_NAMED, LABEL_GAP, routeGeo } = await import('../src/ui/tool-flows.js');

const measure = (t, f, wt = 600) => t.length * f * (wt >= 700 ? 0.6 : 0.56);
const part = (id, pct, name = id) => ({ id, name, tone: '--s1', pct });

test('a split that moves no part by more than a whole percent is a small move; any larger move, or a new part, is not', () => {
  const a = [part('liver', 31), part('var', 20), part('pum', 24), part('rec', 11), part('ret', 14)];
  assert.equal(HOLD_PP, 1);
  assert.ok(smallMove(a, a));
  assert.ok(smallMove(a, [part('liver', 31), part('var', 20), part('pum', 24), part('rec', 10), part('ret', 15)]), 'a 14↔15 flip waits');
  assert.ok(!smallMove(a, [part('liver', 29), part('var', 22), part('pum', 24), part('rec', 11), part('ret', 14)]), 'two percents show at once');
  assert.ok(!smallMove(a, [part('liver', 31), part('var', 20), part('pum', 24), part('rec', 11)]), 'a route that leaves (14%) shows at once');
  assert.ok(smallMove([part('liver', 99), part('var', 1)], [part('liver', 100)]), 'a 1% route at the edge of showing waits');
  assert.ok(!smallMove(null, a) && !smallMove(a, null));
});

test('a part keeps its wording on the bar until it no longer fits, and moves onto the bar only with room to spare', () => {
  const f = 12, w = 400, hh = 120, g = routeGeo(f).g;
  // The name "Retroperitoneal" (15 letters at 500) needs 100.8 px; the segment is p% of 400 px less the gap each side.
  const need = measure('Retroperitoneal', f, 500) + 2 * g;
  const pctAt = (px) => (px / w) * 100;
  const split = (p) => [part('liver', 100 - p, 'Liver'), part('ret', p, 'Retroperitoneal')];
  const tierOf = (lay) => lay.tiers[lay.spans.findIndex((s) => s.id === 'ret')];
  // (a share just wide enough for the name, by the label rule)
  const edge = Math.ceil(pctAt(need));
  assert.equal(tierOf(routeLayout(split(edge), w, hh, f, measure)), 0, 'fresh: the name fits on the bar');
  assert.equal(tierOf(routeLayout(split(edge - 1), w, hh, f, measure)), 2, 'fresh: one percent less and it goes to a pill');
  // Shown on the bar: it stays there while it still fits.
  assert.equal(tierOf(routeLayout(split(edge), w, hh, f, measure, null, { liver: 0, ret: 0 })), 0);
  // Shown in a pill: the share at the edge does not bring it back onto the bar; a share with TIER_BAND × f to spare does.
  assert.equal(tierOf(routeLayout(split(edge), w, hh, f, measure, null, { liver: 0, ret: 2 })), 2, 'at the edge it stays in its pill');
  const back = Math.ceil(pctAt(need + TIER_BAND * f));
  assert.equal(tierOf(routeLayout(split(back), w, hh, f, measure, null, { liver: 0, ret: 2 })), 0, 'with room to spare it comes back');
  // The label rule holds either way: the words are at least LABEL_GAP inside their segment.
  for (const p of [edge, back]) {
    const lay = routeLayout(split(p), w, hh, f, measure, null, { liver: 0, ret: 0 }), s = lay.spans.find((x) => x.id === 'ret');
    if (tierOf(lay) === 0) assert.ok(s.b - s.a - measure('Retroperitoneal', f, 500) >= 2 * LABEL_GAP - 1e-9);
  }
});

test('the inflow bar keeps its words the same way: onto the bar only with room to spare', () => {
  const f = 12, w = 330, geo = inflowGeo(f), ip = (pv) => [{ id: 'portal', name: 'Portal vein', pct: pv }, { id: 'artery', name: 'Hepatic artery', pct: 100 - pv }];
  const artTier = (pv, prev) => inflowLabels(inflowSpans(barOrder(ip(pv), 'inflow'), w), w, geo, measure, null, prev).find((l) => l.id === 'artery').tier;
  // (find the share where the artery's full name first fits)
  let pv = 99;
  while (pv > 1 && artTier(pv) !== 0) pv--;
  assert.equal(artTier(pv), 0);
  assert.notEqual(artTier(pv, { portal: 0, artery: 1 }), 0, 'shown short at the edge: it stays short');
  assert.equal(artTier(pv, { portal: 0, artery: 0 }), 0, 'shown in full: it stays in full');
});

test('a named route keeps its name against one only a little larger, so the fourth place never flips with a wobble', () => {
  const idx = Object.fromEntries(EDGES.map((e, k) => [e.id, k]));
  const fp = (flows) => { const Q = new Array(EDGES.length).fill(0); for (const [id, q] of Object.entries(flows)) Q[idx[id]] = q; return { at: { Q }, shunt: 0.6 }; };
  // Five routes: varices, gastrorenal, paraumbilical, and rectal or retroperitoneal at the edge of the four.
  const base = { C1b: 30, C5: 25, C3: 15 };
  const named = (ps) => ps.filter((p) => p.id !== 'liver' && p.id !== 'other').map((p) => p.id).sort().join(',');
  const a = flowParts(fp({ ...base, C4: 10, C7: 9 }), 'portal');
  assert.ok(named(a).includes('rec') && !named(a).includes('ret'), 'rectal is fourth');
  const keep = new Set(a.filter((p) => p.id !== 'liver' && p.id !== 'other').map((p) => p.id));
  // Retroperitoneal edges past rectal: the bar keeps rectal named, until it is more than KEEP_NAMED larger.
  assert.ok(named(flowParts(fp({ ...base, C4: 10, C7: 11 }), 'portal', null, keep)).includes('rec'));
  assert.ok(named(flowParts(fp({ ...base, C4: 10, C7: 11 }), 'portal')).includes('ret'), 'fresh, the larger one is named');
  assert.ok(named(flowParts(fp({ ...base, C4: 10, C7: 10 * KEEP_NAMED + 1 }), 'portal', null, keep)).includes('ret'), 'a clear lead takes the place');
});

test('the real card keeps what it shows through a wobble of readings, then lands on the newest once they rest', async () => {
  const idx = Object.fromEntries(EDGES.map((e, k) => [e.id, k]));
  const node = (tag) => ({
    tag, attrs: {}, kids: [], style: {}, dataset: {}, isConnected: true, clientWidth: 420, clientHeight: 160,
    setAttribute(k, v) { this.attrs[k] = v; },
    append(...k) { for (const c of k) { if (c && typeof c === 'object') c.parent = this; this.kids.push(c); } },
    replaceChildren(...k) { this.kids = k; },
    getBoundingClientRect() { return { width: 420, height: 160 }; },
    prepend(...k) { this.kids.unshift(...k); },
    remove() { const p = this.parent; if (p) p.kids = p.kids.filter((c) => c !== this); },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    get children() { return this.kids.filter((c) => c && typeof c === 'object'); },
    get localName() { return this.tag; },
    get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value: String(value) })); },
    getAttribute(k) { return k in this.attrs ? String(this.attrs[k]) : null; },
    hasAttribute(k) { return k in this.attrs; },
  });
  globalThis.document.createElement = (tag) => (tag === 'canvas' ? { getContext: () => null, setAttribute() {}, style: {} } : node(tag));
  globalThis.document.createElementNS = (ns, tag) => node(tag);
  globalThis.getComputedStyle = () => ({ fontSize: '14px', getPropertyValue: () => '' });
  let frames = [];
  globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  globalThis.cancelAnimationFrame = () => {};
  const { createFlowsTool, HOLD_MS } = await import('../src/ui/tool-flows.js');
  const fp = (shunt, c7) => {
    const Q = new Array(EDGES.length).fill(0);
    Q[idx.C1b] = 20; Q[idx.C3] = 24; Q[idx.C4] = 11; Q[idx.C7] = c7;
    return { at: { Q }, shunt };
  };
  const healthy = { at: { Q: new Array(EDGES.length).fill(0) }, shunt: 0 };
  const run = () => { for (let n = 0; frames.length && n < 500; n++) frames.shift()(); };
  const svgOf = (card) => card.el.kids.find((k) => k.tag === 'svg') || card.el._svgGL?.pending;
  const card = createFlowsTool();
  card.configure({ kind: 'flows' }, { fp: fp(0.69, 14), healthy: () => healthy });
  run();
  const first = svgOf(card).attrs['aria-label'];
  assert.ok(/Liver 31%/.test(first), first);
  // Ten readings a whole percent either side, as a live model gives every 150 ms: the card shows the first all through.
  for (let i = 0; i < 10; i++) { card.pin(fp(i % 2 ? 0.69 : 0.70, i % 2 ? 14 : 14.8)); run(); assert.equal(svgOf(card).attrs['aria-label'], first, `reading ${i}`); }
  // Once the readings rest it takes the newest (here the 30% liver), so it always lands on the slide's own numbers.
  card.pin(fp(0.70, 14)); run();
  await new Promise((r) => setTimeout(r, HOLD_MS + 100)); run();
  assert.ok(/Liver 30%/.test(svgOf(card).attrs['aria-label']), svgOf(card).attrs['aria-label']);
  // A larger move shows at once.
  card.pin(fp(0.5, 14)); run();
  assert.ok(/Liver 50%/.test(svgOf(card).attrs['aria-label']));
  card.dispose();
});
