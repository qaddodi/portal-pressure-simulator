// The figure's kept shapes (3 Nov 2026, "Move figure labels and pills off the SVG model"). A shape the page held as an SVG element only
// so that the overlay painter (organ-paint.js) could read it back (the circuit's resistor zigzags, a narrowing's "60 %") is kept here as
// numbers and handed to the painter as the ops it would have read: no element, no attribute written, no style read, nothing for the
// browser to lay out or paint. The painter takes the ops as it takes any others (an op with no chain of elements is static: its frame
// and its opacity are its own fields, organ-paint liveOf), so what changes between frames is a field written in place.
//
// What eases (a group coming or going, a line lit, the circuit view fading in) is eased here, on the clock the caller gives, with the
// curve and the length the page's own CSS gave it (ease.js: D_SURFACE, easeArrive), so the look is the same as the transition it replaces.
// The layer never draws anything itself. Whoever changes a record asks the painter to draw again (organs stack touch, veins.overlay.touch):
// a record is no element, so the painter's watch on the page's elements cannot see it change.
//
// One layer holds entries (a resistor, a label), each a list of parts (a halo and its line; a halo and its glyphs). A part is
//   { polys: [Float32Array (x0, y0, x1, y1, ...), ...], closed, kind: 'stroke' | 'fill', rgb: [r, g, b] (0..1), a (its opacity),
//     w (a stroke's width, in the page's px when nss), nss (non-scaling), cap: 0 butt | 1 round | 2 square }
// and an entry's fade is its own, over every part, as an SVG group's opacity is. A part's `polys` is a new array whenever its points change
// (a part whose `polys` is the same array as before is the same shape: its mesh is kept).

const IDENT = [1, 0, 0, 1, 0, 0];
const SPEC_EMPTY = Object.freeze([]);

/** One eased number: `at(now)` is where it is, `to(v, now, ms)` aims it at v (from where it is now). */
function tween(v) { return { v, from: v, goal: v, t0: 0, ms: 0 }; }   // alloc-rare: one tween for each record, made with it

/**
 * A layer of kept shapes. `ease`: 0..1 → 0..1; `ms`: how long an ease takes; both the caller's (the page's CSS gave them).
 * `moving()` says whether any of its eases is still running.
 */
export function recordLayer({ ease = (x) => x, ms = 420 } = {}) {
  const entries = new Map();   // key → { key, parts: [op, ...], fade: tween, base: [tween, ...], gone }   // alloc-rare: made once with the layer
  let ops = SPEC_EMPTY, spec = null, ver = 0;
  const layer = tween(1);
  const paints = new Map();   // alloc-rare: one paint for each colour, so an op's colour is the same object while it stands

  const at = (t, now) => {
    if (t.ms <= 0 || now >= t.t0 + t.ms) return t.goal;
    return t.from + (t.goal - t.from) * ease(Math.max(0, (now - t.t0) / t.ms));
  };
  const aim = (t, goal, now, dur) => {
    if (t.goal === goal) return false;
    t.from = at(t, now); t.goal = goal; t.t0 = now; t.ms = dur;
    return true;
  };
  const running = (t, now) => t.ms > 0 && now < t.t0 + t.ms;

  const paintOf = (rgb) => {   // alloc-rare: a colour met for the first time (a theme, a tone); kept after
    // alloc-rare: only on a put, which the caller makes when a resistor's look changed (a slide's change, a theme), never in a frame that kept it
    const k = `${rgb[0].toFixed(4)},${rgb[1].toFixed(4)},${rgb[2].toFixed(4)}`;
    let p = paints.get(k);
    // alloc-rare: a colour met for the first time, kept after
    if (!p) paints.set(k, (p = { solid: [rgb[0], rgb[1], rgb[2], 1] }));
    return p;
  };

  // The ops are rebuilt only when an entry comes, goes or changes what it is made of; the ones that stay are the same objects, so the
  // painter keeps its meshes for them.
  function rebuild() {   // alloc-rare: an entry came, went or changed (a resistor or a label appearing, lit, or gone), never a frame that kept them
    // alloc-rare: the list of ops is made when an entry came, went or changed
    const list = [];
    for (const e of entries.values()) for (const p of e.parts) list.push(p);
    ops = list.length ? list : SPEC_EMPTY;
    // alloc-rare: a new spec when the set of ops changed (the painter treats its group as new)
    spec = list.length ? { ops, opacity: 1, mask: null, root: null } : null;   // (a new spec: the painter treats its group as new)
    ver++;
  }

  // An op's opacity now: its own, the entry's fade, the layer's.
  function alphaOf(e, i, now) { return at(e.base[i], now) * at(e.fade, now) * at(layer, now); }

  // Writes every op's opacity for `now` (its own ease × its entry's × the layer's), drops the entries that have faded out, and says in `out`
  // { changed: some op's opacity moved or the set of ops did, moving: an ease is still running }. The caller's record: nothing is made.
  function sweep(now, out) {
    let changed = false, moving = running(layer, now), drop = false;
    for (const e of entries.values()) {
      const f = running(e.fade, now);
      if (f) moving = true;
      for (let i = 0; i < e.parts.length; i++) {
        if (running(e.base[i], now)) moving = true;
        const a = alphaOf(e, i, now), op = e.parts[i];
        if (op.alpha !== a) { op.alpha = a; changed = true; }
      }
      if (e.gone && !f && e.fade.goal === 0) drop = true;
    }
    if (drop) {
      for (const [k, e] of entries) if (e.gone && !running(e.fade, now) && e.fade.goal === 0) entries.delete(k);
      rebuild(); changed = true;
    }
    out.changed = changed; out.moving = moving;
    return out;
  }
  const SCRATCH = { changed: false, moving: false };   // alloc-rare: made once with the layer

  return {
    /** The group the painter draws, or null for none: `{ ops, opacity, mask, root }` in organ-paint's form. Same object while the ops are. */
    get spec() { return spec; },
    /** Moves on each time the set of ops changes (an entry added, removed or changed). */
    get ver() { return ver; },
    get size() { return entries.size; },
    has: (key) => entries.has(key),
    keys: () => entries.keys(),
    entry: (key) => entries.get(key) || null,

    /**
     * Puts the entry `key` made of `parts` (see the top). `now`: the clock. A new entry fades in (over `ms`, unless `instant`); an entry
     * that was going comes back. True when the set of ops changed (the caller then hands the painter the new spec).
     */
    put(key, parts, now, instant = false) {
      let e = entries.get(key);
      const fresh = !e;
      if (fresh) { e = { key, parts: [], fade: tween(0), base: [], gone: false }; entries.set(key, e); }   // alloc-rare: an entry is made once, when it first appears
      let changed = fresh;
      if (fresh || e.gone) { e.gone = false; aim(e.fade, 1, now, instant ? 0 : ms); }
      // The ops already there are kept when a part is what it was (same points, colour, width, cap); a part that is not is made again.
      // alloc-rare: the entry's new part lists, made on a put (a change in the resistor), not in a frame
      const next = [], base = [];
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i], old = e.parts[i];
        const same = old && old.geomSrc === p.polys && old.kind === (p.kind || 'stroke') && old.rgbKey === paintOf(p.rgb) && old.w === (p.w || 0) && old.cap === (p.cap ?? 1) && !!old.nss === !!p.nss && old.closed === !!p.closed;
        let op = old;
        if (!same) {
          changed = true;
          op = {   // alloc-rare: a part made when its points, colour, width or cap changed
            // alloc-rare: a part made when its points, colour, width or cap changed
            geom: { poly: p.polys.map((pts) => ({ pts, closed: !!p.closed })) },
            geomSrc: p.polys, m: IDENT, kind: p.kind || 'stroke', paint: paintOf(p.rgb), rgbKey: paintOf(p.rgb), closed: !!p.closed, alpha: 0, w: p.w || 0, cap: p.cap ?? 1, clip: null, el: null, a0: 0,
          };
          if (p.nss) op.nss = true;
        }
        next.push(op);
        let t = e.base[i];
        if (!t) t = tween(p.a ?? 1);
        else aim(t, p.a ?? 1, now, instant ? 0 : ms);   // (its own opacity eases to the new one)
        base.push(t);
      }
      if (next.length !== e.parts.length) changed = true;
      e.parts = next; e.base = base;
      if (changed) rebuild();
      sweep(now, SCRATCH);
      return changed;
    },

    /** The entry fades out and is dropped once faded (`instant`: dropped at once). True when the set of ops changed now. */
    drop(key, now, instant = false) {
      const e = entries.get(key);
      if (!e || e.gone) return false;
      if (instant || ms <= 0) { entries.delete(key); rebuild(); return true; }
      e.gone = true; aim(e.fade, 0, now, ms);
      return false;
    },

    /** The layer's own opacity (the circuit view's fade), eased. */
    show(goal, now, instant = false) { return aim(layer, goal, now, instant ? 0 : ms); },
    get shown() { return layer.goal; },

    /** sweep, for the caller's own record `out`. */
    step: sweep,

    /** Everything gone (the layer is no more drawn). */
    clear() { if (!entries.size) return false; entries.clear(); rebuild(); return true; },
  };
}
