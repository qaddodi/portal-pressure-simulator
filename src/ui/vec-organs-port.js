// The organ stack's input as Vector's organs (workstream F, vec-organs.js) take it (plan 9.H; workstream H).
//
// veins-gl.js tells the Vector renderer what the organ stack is told, one `setOrgans(kind, ...)` a change (paint, bake, commit, drop, live,
// liveAll, order, shift, overlay, overlay-touch, replay). F's `setOrgans(layers, order)` takes the whole set at once: a Map of layer name →
// [{ spec, m }] back to front, and the layers' order. This port keeps what the kinds say and hands F the set when it is next needed (its
// update, draw, prepare, step or covers), so the fifteen bakes of a slide's layers make one ingest, not fifteen. Everything else of F's
// goes through as it is (the port's prototype is F's object), so E sees F's whole API.
//
// The set: the whole live set when the stage gives one (liveAll); else the committed slot's baked groups (slot 0, or slot 1 while only that
// is committed), with the live layers over them by name. `paint` is F's setCovers. The overlay groups (the organs drawn over the vessels)
// and `shift` have no slot in F's or E's passes yet: they are kept and not drawn (noted in the report to E).

/** Wraps F's organs object `organs` (createVecOrgans) in the port. */
export function vecOrgansPort(organs) {
  const bakes = [new Map(), new Map()], commits = [null, null];
  let live = null, liveAll = null, order = null, dirty = false;
  const port = Object.create(organs);
  const compose = () => {
    const out = new Map();
    if (liveAll && liveAll.size) { for (const [n, g] of liveAll) out.set(n, g); return out; }
    const slot = commits[0] ? 0 : commits[1] ? 1 : -1;
    if (slot >= 0) for (const n of commits[slot]) { const g = bakes[slot].get(n); if (g) out.set(n, g); }
    if (live) for (const [n, g] of live) out.set(n, g);
    return out;
  };
  const flush = () => {
    if (!dirty) return;
    dirty = false;
    const map = compose();
    const names = order ? order.filter((n) => map.has(n)) : [...map.keys()];
    for (const n of map.keys()) if (!names.includes(n)) names.push(n);
    organs.setOrgans?.(map, names);
  };
  const kept = (rec) => rec.groups;
  const SET = {
    live: (organs0) => { live = organs0 || null; liveAll = null; },
    liveAll: (organs0) => { liveAll = organs0 || null; live = null; },
    order: (o) => { order = o || null; },
    bake: (slot, name, groups) => { bakes[slot].set(name, groups); },
    commit: (slot, names) => {
      commits[slot] = names.slice();
      for (const n of bakes[slot].keys()) if (!commits[slot].includes(n)) bakes[slot].delete(n);
    },
    drop: (slot) => { bakes[slot].clear(); commits[slot] = null; },
    replay: (ops) => {
      for (let s = 0; s < 2; s++) {
        bakes[s].clear();
        for (const [n, rec] of ops.bakes[s]) bakes[s].set(n, kept(rec));
        commits[s] = ops.commits[s] ? ops.commits[s].slice() : null;
      }
      live = ops.live || null; liveAll = ops.liveAll || null; order = ops.order || null;
      if (ops.paint?.shapes) organs.setCovers?.(ops.paint.shapes, ops.paint.rect, ops.paint.k);
    },
  };
  port.setOrgans = (kind, a, b, c) => {
    if (kind === 'paint') return organs.setCovers ? organs.setCovers(a, b, c) : false;
    if (kind === 'overlay' || kind === 'overlay-touch' || kind === 'shift') return false;
    const f = SET[kind];
    if (!f) {
      // (F's own form, the layer map and the order: passed through, nothing kept.)
      return organs.setOrgans?.(kind, a, b);
    }
    if (kind === 'bake') f(a, b, c); else f(a, b);
    dirty = true;
    return true;
  };
  for (const name of ['update', 'draw', 'prepare', 'step', 'covers']) {
    if (typeof organs[name] !== 'function') continue;
    port[name] = (a, b, c) => { if (dirty) flush(); return organs[name](a, b, c); };
  }
  return port;
}
