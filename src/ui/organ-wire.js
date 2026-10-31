// The organ painter's groups as plain values (worker plan, item 3). A group read from the page (organ-paint readGroup) holds the
// page's SVG elements: the painter reads their inline opacities, frames and path text at each paint (liveOf, chainM, pathKey). To
// paint in a worker, each element becomes a stand-in with the same few members the painter reads, and what changes on the page goes
// across as a delta of those members, once per frame, only for the elements that differ.
//
//   const wire = createWireOut();  const plain = wire.encode(spec);  const delta = wire.delta();   // page
//   const wire = createWireIn();   const spec = wire.decode(plain);  wire.apply(delta);           // worker

import { heldOf, hold } from './organ-paint.js?v=010d7c2e2a';

const NAMES = ['opacity', 'fill-opacity', 'stroke-opacity', 'd'];
const STYLE = { opacity: 'opacity', 'fill-opacity': 'fillOpacity', 'stroke-opacity': 'strokeOpacity' };

// What the painter reads from one element: its name, its inline settings, its own transform, and what it holds beside it.
function snapOf(el) {
  const attrs = {}, style = {};
  for (const n of NAMES) { const v = el.getAttribute(n); if (v != null) attrs[n] = v; }
  for (const k of Object.values(STYLE)) { const v = el.style?.[k]; if (v != null && v !== '') style[k] = v; }
  const t = el.transform?.baseVal;
  let m = null;
  if (t && t.numberOfItems) { const k = t.consolidate().matrix; m = [k.a, k.b, k.c, k.d, k.e, k.f]; }
  const h = heldOf(el);
  return { name: el.localName, attrs, style, m, held: { o: h.o, fo: h.fo, so: h.so, css: h.css, src: h.src ? { d: h.src.d, cmds: h.src.cmds, id: h.src.id } : null } };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createWireOut() {
  const ids = new Map(), last = [];   // element → id; id → the snapshot last sent
  const refOf = (el) => {
    let id = ids.get(el);
    if (id === undefined) { id = last.length; ids.set(el, id); last.push(null); pending.push([id, el]); }
    return { ref: id };
  };
  const pending = [];
  const copy = (v) => {
    if (v == null || typeof v !== 'object') return v;
    if (v.nodeType === 1) return refOf(v);
    if (ArrayBuffer.isView(v)) return v;
    if (Array.isArray(v)) return v.map(copy);
    const o = {};
    for (const k of Object.keys(v)) o[k] = copy(v[k]);
    return o;
  };
  const els = () => [...ids.entries()];
  return {
    /** A group read by readGroup as plain values; every element in it is a { ref } to the table. */
    encode: (spec) => copy(spec),
    /** The elements that are new or differ from what was last sent: [[id, snapshot]]. Call once per frame, after the groups are encoded. */
    delta() {
      const out = [];
      pending.length = 0;
      for (const [el, id] of els()) {
        const s = snapOf(el);
        if (!last[id] || !same(last[id], s)) { last[id] = s; out.push([id, s]); }
      }
      return out;
    },
    get size() { return ids.size; },
  };
}

// A stand-in element: the members the painter reads, from a snapshot.
function stand(s) {
  const el = {
    nodeType: 1, localName: s.name, attrs: {}, style: {},
    getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
    transform: { baseVal: { numberOfItems: 0, consolidate: () => ({ matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } }) } },
  };
  fill(el, s);
  return el;
}
function fill(el, s) {
  el.attrs = { ...s.attrs };
  el.style = { ...s.style };
  const t = el.transform.baseVal;
  if (s.m) { t.numberOfItems = 1; t.consolidate = () => ({ matrix: { a: s.m[0], b: s.m[1], c: s.m[2], d: s.m[3], e: s.m[4], f: s.m[5] } }); } else { t.numberOfItems = 0; t.consolidate = () => ({ matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } }); }
  hold(el, s.held);
}

export function createWireIn() {
  const els = new Map();
  const back = (v) => {
    if (v == null || typeof v !== 'object') return v;
    if (ArrayBuffer.isView(v)) return v;
    if (Array.isArray(v)) return v.map(back);
    if (Object.keys(v).length === 1 && 'ref' in v) return els.get(v.ref) || (els.set(v.ref, stand({ name: '', attrs: {}, style: {}, m: null, held: {} })), els.get(v.ref));
    const o = {};
    for (const k of Object.keys(v)) o[k] = back(v[k]);
    return o;
  };
  return {
    decode: (plain) => back(plain),
    /** Applies the page's delta: the stand-ins are made or changed to match. */
    apply(delta) { for (const [id, s] of delta) { const el = els.get(id); if (el) { el.localName = s.name; fill(el, s); } else els.set(id, stand(s)); } },
    get size() { return els.size; },
  };
}
