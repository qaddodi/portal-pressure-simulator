// The corner credit finds a free spot on the figure: never on or touching a card, a sheet, a bar or a menu.
// It keeps its corner while that corner stays free and is never animated (no glide, no fade): any move hides it at once,
// holds it hidden only until the cards have settled (a slide change lifts its hold 120 ms after the camera move; a move off a spot a card now covers is hidden for 80 ms), then shows it at once at the new spot; with no figure left anywhere it stays hidden.
import { readFrameFor, figLab, mayTask } from './frame.js';
import { gpuProbe, COUNTED } from './gpu-probe.js';
import { restPass, cancelRest } from './rest-pass.js';
import { CELL, cellFor, regionFor, contains, touches, artTest, boxThrough, multiply, invert } from './credit-art.js';
import { CellGrid, geomOf } from './cell-grid.js';
import { elBoxInto, chainMat } from './shape-gl.js';
import { layoutWatch, PLACED, GESTURE_LOOK } from './idle-keys.js';
import { readAnims, readBox, readCTM, readMetric, readStyle, readTiming, worldCTM } from './layout-snap.js';
const OWN_BOX = { x: 0, y: 0, width: 0, height: 0 };   // alloc-rare: made once (a shape's own box, read at once)
// (The art's walk looks at the camera once a frame: in the frame's first, read-only phase (2 Nov 2026), where the layout is the one the
// browser last drew, never after the frame's writes.)
const nextFrame = readFrameFor('credit');
// (A shape's facts and the labels' boxes are kept until what they were read from changes, so a view switch re-reads only what moved,
// between two frames (rest-pass.js).)
// The figure's shapes are never read while the figure is being moved by hand or by a glide (a pan, a pinch, a camera move: the app's
// stage-busy, the stage's gesture classes): a pinch on the iPhone read every organ and vessel's box and style again some four times in
// 8 s, as the zoom's own redraws of the art kept marking the facts stale (2 Nov 2026, "zoom is miserable"). The look waits and lands as
// the figure stops.
const figureMoving = (world) => {
  if (document.getElementById('app')?.classList.contains('stage-busy')) return true;
  const sv = world?.closest('.stage-view');
  if (sv) for (const c of GESTURE_LOOK) if (sv.classList.contains(c)) return true;
  return false;
};
let stillWait = null;
// (Calls `done` once the figure holds still: polled with a timer, never a frame.)
function whenStill(world, done) {
  if (stillWait) { stillWait.done = done; return; }
  stillWait = { done };
  const go = () => { if (figureMoving(world)) { setTimeout(go, 120); return; } const w = stillWait; stillWait = null; w.done?.(); };
  setTimeout(go, 120);
}

// Corners in order of preference. A bottom corner rises above whatever covers it (up to the middle of the figure);
// a top corner drops below whatever covers it.
export const CORNERS = ['bl', 'br', 'tl', 'tr'];

export const hit = (a, o) => a.l < o.r && a.r > o.l && a.t < o.b && a.b > o.t;

// Every free box over the whole figure on a coarse grid (clear of the cards by `gap`, and of the art by `avoid`).
function wideSpots(fig, obs, w, h, gap, inset, avoid) {
  const big = fig.r - fig.l >= 768, sx = big ? 24 : 12, sy = big ? 16 : 8, out = [];
  for (let y = fig.t + inset; y + h <= fig.b - inset; y += sy) {   // (an inset from the top and bottom edges too: the credit had touched the screen's top, y = 2)
    for (let x = fig.l + inset; x + w <= fig.r - inset + 0.5; x += sx) {
      const box = { l: x - gap, t: y - gap, r: x + w + gap, b: y + h + gap };
      if (!obs.some((q) => hit(box, q)) && !avoid({ l: x, t: y, r: x + w, b: y + h })) out.push({ x, y });
    }
  }
  return out;
}

// fig, obstacles: rects { l, t, r, b } in one frame. Returns { bl, br, tl, tr }: the top-left point of the free box
// of size w × h nearest each corner, or null. A corner that no card clears by moving up or down is tried again beside
// each card, further along the same edge (a phone held sideways: the strip of figure between the words' pane and the data card).
// avoid(box): true for a spot the credit should not take though no card covers it (over an organ's art); such a spot is passed
// over like a covered one.
export function freeSpots(fig, obs, w, h, { gap = 10, inset = 12, avoid = null } = {}) {
  const out = {}, H = fig.b - fig.t;
  let wide = null;
  // A free spot at x: from y0 toward the middle, past the cards (and the art to avoid) it meets.
  const walk = (x, y0, up = y0 > fig.t + H / 2) => {
    if (x < fig.l || x + w > fig.r) return null;
    let y = y0;
    for (let i = 0; i < 40; i++) {
      if (up ? y < fig.t + H * 0.45 - h : y + h > fig.t + H * 0.55 + h) return null;
      const box = { l: x - gap, t: y - gap, r: x + w + gap, b: y + h + gap };
      const o = obs.filter((q) => hit(box, q));
      if (!o.length && !avoid?.({ l: x, t: y, r: x + w, b: y + h })) return y >= fig.t && y + h <= fig.b ? { x, y } : null;
      y = !o.length ? (up ? y - h / 2 : y + h / 2) : up ? Math.min(...o.map((q) => q.t)) - gap - h : Math.max(...o.map((q) => q.b)) + gap;
    }
    return null;
  };
  for (const c of CORNERS) {
    const left = c[1] === 'l', up = c[0] === 'b', x0 = left ? fig.l + inset : fig.r - inset - w;
    const xs = [x0, ...obs.map((q) => (left ? q.r + gap : q.l - gap - w)).filter((x) => (left ? x > x0 : x < x0)).sort((p, q) => (left ? p - q : q - p))];
    out[c] = null;
    // (With art to avoid, the spot may also step in along its edge, 40 px at a time up to the middle; of the spots found, the
    // one nearest its corner, a step in counting half a step down.)
    if (avoid) {
      for (let k = 1; k * 40 < (fig.r - fig.l) * 0.5 - w; k++) xs.push(left ? x0 + k * 40 : x0 - k * 40);
      let best = null, bc = Infinity;
      for (const x of xs) {
        const y0 = up ? fig.b - inset - h : fig.t + inset, p = walk(x, y0);
        if (!p) continue;
        const cost = Math.abs(p.y - y0) + 0.5 * Math.abs(x - x0);
        if (cost < bc) { bc = cost; best = p; }
      }
      // (Nothing along the edges: look over the whole free figure, nearest the corner first: a gap between two cards, a bare patch
      // beside the organs. The free boxes are found once for all four corners.)
      if (!best) {
        wide ||= wideSpots(fig, obs, w, h, gap, inset, avoid);
        const ay = up ? fig.b - inset - h : fig.t + inset;
        for (const q of wide) {
          const cost = Math.abs(q.y - ay) + 0.5 * Math.abs(q.x - x0);
          if (cost < bc) { bc = cost; best = q; }
        }
      }
      out[c] = best;
      continue;
    }
    for (const x of xs) {
      if (x < fig.l || x + w > fig.r) continue;
      let y = up ? fig.b - inset - h : fig.t + inset, spot = null;
      for (let i = 0; i < 40; i++) {
        if (up ? y < fig.t + H * 0.45 - h : y + h > fig.t + H * 0.55 + h) break;
        const box = { l: x - gap, t: y - gap, r: x + w + gap, b: y + h + gap };
        const o = obs.filter((q) => hit(box, q));
        if (!o.length && !avoid?.({ l: x, t: y, r: x + w, b: y + h })) { spot = { x, y }; break; }
        y = !o.length ? (up ? y - h - gap : y + h + gap) : up ? Math.min(...o.map((q) => q.t)) - gap - h : Math.max(...o.map((q) => q.b)) + gap;
      }
      if (spot && spot.y >= fig.t && spot.y + h <= fig.b) { out[c] = spot; break; }
    }
  }
  return out;
}

// The last resort where no bare spot exists (a phone's crowded figure): per corner, the free box with the least art under it,
// the corner's own pull counting a little. Returns { spots, cover }: the spots and the least cover among them.
export function leastCovered(fig, obs, w, h, { gap = 10, inset = 12 } = {}, cover) {
  const wide = wideSpots(fig, obs, w, h, gap, inset, () => false), out = {};
  let least = Infinity;
  for (const c of CORNERS) {
    const left = c[1] === 'l', up = c[0] === 'b', x0 = left ? fig.l + inset : fig.r - inset - w, y0 = up ? fig.b - inset - h : fig.t + inset;
    let best = null, bc = Infinity;
    for (const q of wide) {
      const cv = cover({ l: q.x, t: q.y, r: q.x + w, b: q.y + h }), cost = cv * 40 + Math.abs(q.y - y0) + 0.5 * Math.abs(q.x - x0);
      if (cost < bc) { bc = cost; best = { ...q, cv }; }
    }
    out[c] = best;
    if (best) least = Math.min(least, best.cv);
  }
  return { spots: out, cover: least };
}

// Which corner to use: the current one while it stays free (it never goes back to a corner it left just because that one
// freed up); else the free corner that has gone longest without being covered (blocked: corner -> when a card last covered
// it), ties in the order above. A corner a card keeps coming back to is the last to be chosen, so the credit rarely moves.
export function pickCorner(spots, cur, blocked = {}) {
  if (cur && spots[cur]) return cur;
  const free = CORNERS.filter((c) => spots[c]);
  return free.sort((a, b) => (blocked[a] ?? -Infinity) - (blocked[b] ?? -Infinity))[0] || null;
}

// What the credit keeps clear of. Chrome (the bars, the zoom pill, the figure's labels) is avoided but does not make the screen "busy".
export const OBSTACLES = '.stage-blocker:not([hidden]), .pz-fk:not([hidden]), .stage-clock, .menu, .umenu:not(.out), .why-pop.show, .modal-back.show, .home:not([hidden]), .scan-probe:not(.off) .sp-body, .dop-probe:not(.off) .dpr-body, .pz-shade, .pz-prog';   // (the FibroScan probe's body carries its reading; it counts as chrome below)
export const CHROME = '#topbar, .pz-fk, .pz-scales, #vdock, #zoomPill, .stage-clock, .pz-bar, .scan-probe:not(.off) .sp-body, .dop-probe:not(.off) .dpr-body, .pz-prog';   // (.pz-prog: a slide's progress line along the bottom edge)   // (the FibroScan probe: its body carries the reading)

// The figure's own labels (station values, organ captions) and measuring callouts: each one's text and pill, padded and snapped outward to a small
// grid, so a label that jitters by a pixel as its number changes does not read as a move.
const GRID = 8;
const LABEL_SEL = '.cath-labels .cath-label, .lz-lab, .lz-zone, .lz-call, .lz-call-r.on, .sv-region, .sv-legend';
let labelMemo = { sig: '', out: null, confirmed: false };
const at = (el, k) => el.getAttribute?.(k) || '';
const attrSig = (el) => at(el, 'transform') + '~' + at(el, 'class') + '~' + at(el, 'style') + '~' + (el.hasAttribute?.('hidden') ? 1 : 0) + '~' + at(el, 'x') + at(el, 'y');
// What the label boxes were read from, with no layout read: each label's and callout's attributes, text and ancestors' attributes, the
// wrap's box and the figure's matrix (a label's box moves with the camera).
function labelSig(wr, wrap, world) {
  const parts = [wr.left, wr.top, wr.width, wr.height, world ? [world.a, world.b, world.c, world.d, world.e, world.f].map((v) => v.toFixed(2)).join() : '', readMetric(globalThis, 'innerWidth'), readMetric(globalThis, 'innerHeight')], anc = new Set();
  for (const g of document.querySelectorAll('#labels .lb:not(.lb-off), ' + LABEL_SEL)) {
    parts.push(attrSig(g), g.textContent);
    for (let el = g.parentElement; el && el !== wrap && !anc.has(el); el = el.parentElement) { anc.add(el); parts.push(attrSig(el)); }
  }
  return parts.join('|');
}
export function labelRects(wr, wrap, kept = null) {
  if (typeof document === 'undefined') return labelRectsRead(wr, wrap, kept);
  const sig = labelSig(wr, wrap, readCTM(document.getElementById('world')));
  // (A box is trusted once two reads of the same sig agreed, so a label mid-transition, whose attributes are already final, is read again.)
  if (labelMemo.sig === sig && labelMemo.confirmed) return labelMemo.out.map((o) => ({ ...o }));
  const out = labelRectsRead(wr, wrap, kept), same = labelMemo.sig === sig && JSON.stringify(labelMemo.out) === JSON.stringify(out);
  labelMemo = { sig, out, confirmed: same };
  return out.map((o) => ({ ...o }));
}
function labelRectsRead(wr, wrap, kept = null) {
  const out = [], seen = new Map();   // the shared ancestors' own opacity, read once per pass
  // (kept: the stage's own kept copy of its styles, for the figure's element: a live read made the browser bring its styles up to date)
  const own = (el) => { let v = seen.get(el); if (v === undefined) { const s = kept?.(el) || readStyle(el), p = (n) => s.getPropertyValue(n); v = p('display') === 'none' || p('visibility') === 'hidden' ? 0 : +p('opacity'); seen.set(el, v); } return v; };
  for (const g of document.querySelectorAll('#labels .lb:not(.lb-off)')) {
    let o = 1;
    for (let el = g; el && el !== wrap && o > 0.01; el = el.parentElement) o *= own(el);
    if (o <= 0.01) continue;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const q of g.querySelectorAll('text, .lb-bg')) {
      const k = readBox(q);
      if (k.width < 1 || k.height < 1) continue;
      l = Math.min(l, k.left); t = Math.min(t, k.top); r = Math.max(r, k.right); b = Math.max(b, k.bottom);
    }
    if (r <= l) continue;
    out.push({ l: Math.floor((l - wr.left - 2) / GRID) * GRID, t: Math.floor((t - wr.top - 2) / GRID) * GRID, r: Math.ceil((r - wr.left + 2) / GRID) * GRID, b: Math.ceil((b - wr.top + 2) / GRID) * GRID, chrome: true });
  }
  // The measuring callouts (the catheter's WHVP and FHVP, the slide's site readings) and the lobule and sinusoid views' labels, names and
  // resistance pills (the figure key must never cover one), likewise.
  for (const el of document.querySelectorAll(LABEL_SEL)) {
    // (A name the GPU draws (label-captions.js: the lobule's and the sinusoid's) keeps a clear model in the page, its opacity held at 0 by
    // app.css .cap-gl-on: it counts as shown unless it is fading out, hidden, an unlit call, or set clear by its view; its layers' fades count.)
    const gpu = el.closest?.('.cap-gl-on');
    if (gpu && (el.classList.contains('lz-off') || (el.classList.contains('lz-call') && !el.classList.contains('on')) || el.style.opacity === '0')) continue;
    let o = 1;
    if (gpu) { const s = kept?.(el) || readStyle(el); if (s.getPropertyValue('display') === 'none' || s.getPropertyValue('visibility') === 'hidden') continue; }
    for (let q = gpu ? el.parentElement : el; q && q !== wrap && o > 0.01; q = q.parentElement) o *= own(q);
    if (o <= 0.01) continue;
    const k = readBox(el);
    if (k.width < 1 || k.height < 1) continue;
    out.push({ l: Math.floor((k.left - wr.left - 2) / GRID) * GRID, t: Math.floor((k.top - wr.top - 2) / GRID) * GRID, r: Math.ceil((k.right - wr.left + 2) / GRID) * GRID, b: Math.ceil((k.bottom - wr.top + 2) / GRID) * GRID, chrome: true });
  }
  return out;
}

// A test for spots over the figure's art (wrap px): the credit sits on bare background, never on an organ or a vessel nor
// touching an outline (Mohammad, 14 Oct). The art (each shape's fill and stroke) is worked out once onto a small grid (cell-grid.js), one entry per
// cell, and any cell it touches counts; a box is tested against every cell it covers, grown by `pad` px all round. (Testing each
// cell's centre against the shapes, thousands of isPointInStroke calls along the vessels, took a few hundred ms per look and made
// panning and zooming lag.)
// On the GPU figure (worldTest below) the grid is in the figure's own coordinates and the shapes are read once: a camera move reads
// no shape and no pixel, the credit only maps its candidate boxes into the world. Elsewhere (the lobule's outline, the SVG figure
// of Lite graphics, a grid over the cap) screenTest draws the art on the screen's own grid, 6 px cells, as it always did.
// Organs and vessels are kept in two grids. The vessels are not in the page at all: the stage hands over each one's courses in world
// units with its hit width (stage.vesselShapes), counted at 0.7 of that width (a hit width is wider than its tube).
const ORGANS = 'g.organ :is(path, circle, ellipse, rect, polygon):not(.org-shade)';
// (The vessels: the stage's numbers, rebuilt there only when one moved (its ver). A lit vessel's lumen width (world units), the glow's
// core: the stage's own number (a vein's drawn width), else its hit width.)
const vesselsNow = () => window.pps?.stage?.vesselShapes?.() || { ver: '', list: [] };
const lumenW = (v) => window.pps?.stage?.lumenWidth?.(v.id) ?? v.w;
const ID = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
// One course's facts, in the world's own units (the frame every fact is in, so its matrix is the identity).
const vesselFact = (v) => { const lw = v.w * 0.7, g = 2 * lw; return { path: v.path, m: ID, l: v.box[0] - g, t: v.box[1] - g, r: v.box[2] + g, b: v.box[3] + g, fill: false, lw, cap: 'round', join: 'round' }; };
const vesselFacts = () => vesselsNow().list.map(vesselFact);
// (The ascites fluid and the flanks' outline count as organs' art, as drawn: their fill where they have one, their stroke where
// they have one. A small phone in Patients had put the credit on the fluid.)
// (The diaphragm's line across the back wall counts too: the credit had sat on it with the menu open; sweep 02 #11.)
const FLUID = '#ascites .ascites-fill, #ascites .ascites-line, path.flank, path.org-diaphragm';
// (A path's outline is kept while it is the same: read again from its text on every look, the organs' thousands of
// paths, about 1 MB, were most of the 73 to 95 ms each look took on a Mac once a pan or pinch had stopped: Mohammad's ?perf
// readout, 21 Oct. The same outline, so the same cells.)
const pathMemo = new WeakMap();
// (Each shape's outline as polylines, cell-grid.js geomOf: the grid is worked out from the geometry, no 2D canvas, no pixel read.)
function shapePath(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === 'path') {
    const d = el.getAttribute('d') || '', m = pathMemo.get(el);
    if (m && m.d === d) return m.p;
    const q = geomOf('path', () => d);
    pathMemo.set(el, { d, p: q });
    return q;
  }
  return geomOf(tag, (k) => el.getAttribute(k));
}
let organMemo = { key: '', test: null };
// test(box, { pad, org, ves }): true when the box, grown by pad, touches the organs and/or the vessels.
// ring: the lobule's outline (client px) while the lobule fills the view. Its art is then the lobule, not the anatomy hidden under it
// (the credit had landed on the hepatocytes).
// The screen's own grid: the art drawn again, from the page, whenever the camera or the lobule's ring moved.
function screenTest(wr, ring = null) {
  const glows = ring ? [] : window.pps?.stage?.steadyGlows?.() || [];
  const world = readCTM(document.getElementById('world')), key = [wr.left, wr.top, wr.width, wr.height, world && [world.a, world.d, world.e, world.f].map((v) => v.toFixed(2)), ring && ring.flat().map((v) => v.toFixed(1)), glows.flat().join(), vesselsNow().ver].join('|');
  if (organMemo.key === key) return organMemo.test;
  const cols = Math.ceil(wr.width / CELL) + 1, rows = Math.ceil(wr.height / CELL) + 1, grids = { org: new Uint8Array(cols * rows), ves: new Uint8Array(cols * rows) };
  const ctx = new CellGrid();
  ctx.clearRect(0, 0, cols, rows);
  {
    const paint = (sel, grid, asDrawn = false) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!asDrawn) ctx.clearRect(0, 0, cols, rows);   // (as drawn: added to the organs just painted)
      for (const el of document.querySelectorAll(sel)) {
        const m = readCTM(el), r = readBox(el);
        if (!m || !r.width) continue;   // (drawn as a bitmap plate, the shapes stay in place but hidden: they still count)
        const cs = readStyle(el);
        if (cs.display === 'none') continue;
        const w = parseFloat(cs.strokeWidth) || 0;
        // A shape wholly off the grid paints nothing in it, and is not drawn: zoomed in, most of the organs' shapes are off
        // screen, and drawing them all took 28 ms after each pan or zoom (Mohammad's ?perf readout, Mac, 21 Oct). (Its box is
        // the fill's: grown by the most its stroke reaches, a miter at the default limit, twice the stroke width, and a cell.)
        const g = 2 * w * Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)) + CELL;
        if (r.right + g < wr.left || r.left - g > wr.left + cols * CELL || r.bottom + g < wr.top || r.top - g > wr.top + rows * CELL) continue;
        // One grid entry per cell: cell (i, j) covers wrap px [i * CELL, (i + 1) * CELL).
        ctx.setTransform(m.a / CELL, m.b / CELL, m.c / CELL, m.d / CELL, (m.e - wr.left) / CELL, (m.f - wr.top) / CELL);
        const path = shapePath(el);
        if (!asDrawn || cs.fill !== 'none') ctx.fill(path);
        if (w > 0 && (!asDrawn || cs.stroke !== 'none')) { ctx.lineWidth = w; ctx.lineCap = cs.strokeLinecap || 'butt'; ctx.lineJoin = cs.strokeLinejoin || 'miter'; ctx.stroke(path); }
      }
      ctx.readInto(grid);
    };
    if (ring) {
      // The lobule: its outline filled, and every portal tract and neighbouring central vein round it (a phone had put the credit on a
      // neighbour's central vein, sweep 05); the faint neighbouring lobules' sinusoids are background.
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cols, rows); ctx.beginPath();
      ring.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (x - wr.left) / CELL, (y - wr.top) / CELL));
      ctx.closePath(); ctx.fill();
      for (const [x, y, rr] of ring.discs || []) { ctx.beginPath(); ctx.arc((x - wr.left) / CELL, (y - wr.top) / CELL, rr / CELL, 0, Math.PI * 2); ctx.fill(); }
      ctx.readInto(grids.org);
    } else {
      paint(ORGANS, grids.org);
      paint(FLUID, grids.org, true);
      // The vessels: the stage's courses, drawn through the world's matrix.
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cols, rows);
      const vs = vesselsNow().list;
      if (world) {
        ctx.setTransform(world.a / CELL, world.b / CELL, world.c / CELL, world.d / CELL, (world.e - wr.left) / CELL, (world.f - wr.top) / CELL);
        ctx.lineCap = ctx.lineJoin = 'round';
        for (const v of vs) { ctx.lineWidth = v.w * 0.7; ctx.stroke(v.path); }
      }
      ctx.readInto(grids.ves);
      // A lit vessel's glow, the soft band 12 × its width setting (world units) beyond each wall (veins-gl.js), counts as the vessel
      // (sweep 01 review: an iPad zoomed in had put the credit on a glow).
      if (glows.length) {
        if (world) for (const [id, wide] of glows) for (const v of vs) {
          if (v.id !== id) continue;
          ctx.setTransform(world.a / CELL, world.b / CELL, world.c / CELL, world.d / CELL, (world.e - wr.left) / CELL, (world.f - wr.top) / CELL);
          ctx.lineWidth = lumenW(v) + 2 * 12 * Math.min(1.3, Math.max(0.5, wide));
          ctx.lineCap = ctx.lineJoin = 'round'; ctx.stroke(v.path);
        }
        ctx.readInto(grids.ves);
      }
    }
  }
  // How much art a box covers: organ cells count 1, vessel cells 3.
  const cover = (box) => {
    const c0 = Math.max(0, Math.floor(box.l / CELL)), c1 = Math.min(cols - 1, Math.floor(box.r / CELL));
    const r0 = Math.max(0, Math.floor(box.t / CELL)), r1 = Math.min(rows - 1, Math.floor(box.b / CELL));
    let n = 0;
    for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) n += grids.org[j * cols + i] + 3 * grids.ves[j * cols + i];
    return n;
  };
  const test = (box, { pad = 18, org = true, ves = true } = {}) => {
    const c0 = Math.max(0, Math.floor((box.l - pad) / CELL)), c1 = Math.min(cols - 1, Math.floor((box.r + pad) / CELL));
    const r0 = Math.max(0, Math.floor((box.t - pad) / CELL)), r1 = Math.min(rows - 1, Math.floor((box.b + pad) / CELL));
    for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) if ((org && grids.org[j * cols + i]) || (ves && grids.ves[j * cols + i])) return true;
    return false;
  };
  test.cover = cover;
  organMemo = { key, test };
  return test;
}

// The GPU figure's art in the figure's own coordinates. Two things are kept, and each is rebuilt only when it must be:
//  - the FACTS (worldFacts): for each shape that counts, its outline, its matrix inside the world, its box and what it draws.
//    Read from the page once, then again only after a shape changed (a mutation on the art's own groups: the organs' outlines and
//    transforms, the fluid, a vessel's hit width, a shape added or removed), after 15 s, or once the GPU figure has been off.
//    A camera move changes none of them: the world's own transform is not one of the watched.
//  - the GRID (worldLevel): the facts drawn onto a cell grid over the world rectangle the view and a margin round it cover, one pixel
//    per cell, and read back once. It is reused while the view stays inside that rectangle at a zoom no more than CELL px a cell (a
//    pan of up to half a screen, a zoom in or out by up to twice); past that it is drawn again from the facts, with no page read.
// So a camera move reads no shape and no pixel; the credit maps each box it asks about into the world (credit-art.js artTest).
const ART_MAX_AGE = 15000;
const ART_ATTRS = ['d', 'transform', 'class', 'style', 'hidden', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points'];
const ART_QUIET = '#overlays, #guides, #focus';   // (the figure's groups that hold none of the art tested)
let artFacts = null, artLevel = null, artDirty = true, artMo = null, artCanvas = null;

// One shape's facts (kind: 'organ', or 'fluid' as drawn; the vessels are the stage's numbers, vesselFact): the same shapes, fills and strokes the screen grid draws below.
function readShapes(sel, kind, inv) {
  const out = [];
  for (const el of document.querySelectorAll(sel)) { const f = readShape(el, kind, inv); if (f) out.push(f); }
  return out;
}
// (One shape's facts, or null for one that draws nothing: shown nowhere, or not shown.)
const shapeMemo = new WeakMap();
let shapeEpoch = '', staleSalt = 0;
// What a shape's facts are read from, without a layout read: its own attributes and those of every parent up to the figure, and the epoch
// (the view's classes, the theme, the window's size). A camera move changes none of it: the facts are in the figure's own units.
function shapeSig(el) {
  let s = shapeEpoch + (el.tagName || '') + (at(el, 'd') || at(el, 'points')) + ['cx', 'cy', 'r', 'rx', 'ry', 'width', 'height'].map((k) => at(el, k)).join();
  for (let q = el; q && q.id !== 'world'; q = q.parentElement) s += '|' + attrSig(q);
  return s;
}
function newEpoch() {
  const de = document.documentElement, sv = document.getElementById('world')?.closest('.stage-view');
  shapeEpoch = [de.className, de.dataset?.theme, sv?.className, readMetric(globalThis, 'innerWidth'), readMetric(globalThis, 'innerHeight'), globalThis.devicePixelRatio, staleSalt].join('~');
}
function readShape(el, kind, inv) {
  if (Math.abs(inv.b) > 1e-9 || Math.abs(inv.c) > 1e-9) return readShapeNow(el, kind, inv);
  const sig = shapeSig(el), m = shapeMemo.get(el);
  if (m && m.sig === sig && m.kind === kind) return m.fact;
  const fact = readShapeNow(el, kind, inv);
  shapeMemo.set(el, { sig, kind, fact });
  return fact;
}
// (A shape the GPU draws in its place, its SVG out of the page's layout (app.css: the organs and the backdrop under the plate, the fluid
// and the ghosts whenever the GPU draws the vessels): its frame and box are worked out from its own numbers (shape-gl.js chainMat,
// elBox), since the browser gives a shape outside the layout no box. It still counts as art: the GPU draws it there.)
const gpuDrawn = (el) => {
  const sv = el.closest?.('.stage-view');
  return !!sv && ((sv.classList.contains('gl-plate') && !!el.closest('#organs, #backdrop')) || (sv.classList.contains('gl-on') && !!el.closest('#ascites, #ghosts')));
};
function readShapeNow(el, kind, inv) {
  const asDrawn = kind === 'fluid';
  let rel, bb;
  if (gpuDrawn(el)) {
    const world = document.getElementById('world'), own = world && elBoxInto(el, OWN_BOX);
    if (!own || !(own.width || own.height)) return null;
    rel = chainMat(el, world);
    bb = boxThrough(rel, own.x, own.y, own.x + own.width, own.y + own.height);
  } else {
    const m = readCTM(el), r = readBox(el);
    if (!m || !r.width) return null;
    rel = multiply(inv, m); bb = boxThrough(inv, r.left, r.top, r.right, r.bottom);
  }
  const cs = readStyle(el);
  if (cs.display === 'none') return null;
  const w = parseFloat(cs.strokeWidth) || 0;
  // (The shape's box is the fill's, grown by the most its stroke reaches, a miter at the default limit: twice the stroke width.)
  const g = 2 * w * Math.max(Math.hypot(rel.a, rel.b), Math.hypot(rel.c, rel.d));
  const fill = !asDrawn || cs.fill !== 'none';
  const stroke = w > 0 && (!asDrawn || cs.stroke !== 'none');
  return { path: shapePath(el), m: rel, l: bb.l - g, t: bb.t - g, r: bb.r + g, b: bb.b + g, fill, lw: stroke ? w : 0, cap: cs.strokeLinecap || 'butt', join: cs.strokeLinejoin || 'miter' };
}
// A lit vessel's courses, for its glow (taken when a glow first asks for the vessel, then kept with the facts).
function hitsOf(facts, id) {
  let out = facts.hits.get(id);
  if (out) return out;
  out = vesselsNow().list.filter((v) => v.id === id).map((v) => ({ path: v.path, m: ID, w: lumenW(v) }));
  facts.hits.set(id, out);
  return out;
}
// Watches the art's groups: the first change that can move a shape marks the facts stale and the watch stops (until they are read
// again), so a morph's thousands of writes cost one batch of records, not one per frame.
function watchArt(world) {
  artMo ??= new MutationObserver(() => { artDirty = true; artMo.disconnect(); });
  artMo.disconnect();
  for (const g of world.children) if (!g.matches(ART_QUIET)) artMo.observe(g, { subtree: true, childList: true, attributes: true, attributeFilter: ART_ATTRS });
}
function worldFacts(world, inv) {
  const now = performance.now();
  if (artFacts && !artDirty && artFacts.world === world && artFacts.kids === world.childElementCount && artFacts.vesVer === vesselsNow().ver && now - artFacts.at < ART_MAX_AGE) return artFacts;
  gpuProbe.note(COUNTED.creditRead);
  if (artFacts && now - artFacts.at >= ART_MAX_AGE) staleSalt++;   // (the safety net: every shape measured again)
  newEpoch();
  const facts = { at: now, world, kids: world.childElementCount, org: [...readShapes(ORGANS, 'organ', inv), ...readShapes(FLUID, 'fluid', inv)], ves: vesselFacts(), vesVer: vesselsNow().ver, hits: new Map() };
  watchArt(world);
  artDirty = !facts.org.length;   // (a figure with no organ in it is not built yet, or hidden: read again at the next look)
  return (artFacts = facts);
}
// The facts drawn over `reg` (credit-art.js regionFor), one grid entry per cell: cell (i, j) covers the world square at
// (x0 + i c, y0 + j c), c wide. Organs and the fluid in one grid, the vessels (and the lit ones' glow) in the other.
function worldLevel(facts, reg, glows, gk, inv) {
  gpuProbe.note(COUNTED.creditGrid);
  const { cols, rows } = reg, n = cols * rows, org = new Uint8Array(n), ves = new Uint8Array(n);
  const ctx = (artCanvas ||= new CellGrid());
  {
    const paint = (list, grid, glow) => {
      gridBegin(ctx, reg);
      gridShapes(ctx, reg, list, 0, Infinity);
      if (glow) gridGlows(ctx, reg, facts, glows, inv);
      gridRead(ctx, reg, grid);
    };
    paint(facts.org, org, false);
    paint(facts.ves, ves, glows.length > 0);
  }
  return { facts, reg, gk, org, ves };
}
// (A grid's drawing, in its parts: cleared, its shapes from `from` until `until` (performance.now()) has passed, at least one of
// them, returning where it stopped; its lit vessels' glow; and read back into `grid`. worldLevel draws them in one go, a spread job
// (artStep) a frame's share at a time, the same calls in the same order on the same grid.)
function gridBegin(ctx, reg) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, reg.cols, reg.rows); }
const gridAt = (ctx, { c, x0, y0 }, m) => ctx.setTransform(m.a / c, m.b / c, m.c / c, m.d / c, (m.e - x0) / c, (m.f - y0) / c);
function gridShapes(ctx, reg, list, from, until) {
  let i = from;
  while (i < list.length) {
    const s = list[i++];
    if (!touches(reg, s)) continue;   // (zoomed in, most shapes are off the grid: not drawn)
    gridAt(ctx, reg, s.m);
    if (s.fill) ctx.fill(s.path);
    if (s.lw > 0) { ctx.lineWidth = s.lw; ctx.lineCap = s.cap; ctx.lineJoin = s.join; ctx.stroke(s.path); }
    if (performance.now() >= until) break;
  }
  return i;
}
// A lit vessel's glow, the soft band 12 × its width setting (world units) beyond each wall (veins-gl.js), counts as the vessel
// (sweep 01 review: an iPad zoomed in had put the credit on a glow).
function gridGlows(ctx, reg, facts, glows, inv) {
  for (const [id, wide] of glows) for (const h of hitsOf(facts, id)) {
    gridAt(ctx, reg, h.m);
    ctx.lineWidth = h.w + 2 * 12 * Math.min(1.3, Math.max(0.5, wide));
    ctx.lineCap = ctx.lineJoin = 'round'; ctx.stroke(h.path);
  }
}
function gridRead(ctx, reg, grid) { ctx.readInto(grid); }
// The art test of the GPU figure in the world's coordinates, or null where it does not apply (the Lite graphics' SVG figure, a
// view whose grid would pass the cap): organTest then draws the screen grid.
function worldTest(wr, spread = null) {
  const world = document.getElementById('world'), wm = readCTM(world), inv = wm && invert(wm), sc = wm ? Math.hypot(wm.a, wm.b) : 0;
  if (!inv || !(sc > 1e-6)) return null;
  if (!world.closest('.stage-view')?.classList.contains('gl-on')) { artDirty = true; artJob = null; return null; }   // (the SVG tubes show: what counts differs, so the facts are read again when the GPU figure is back)
  const glows = window.pps?.stage?.steadyGlows?.() || [], gk = glows.flat().join();
  const pad = 40 / sc, view = boxThrough(inv, wr.left, wr.top, wr.left + wr.width, wr.top + wr.height);   // (pad: past the view, what a box's own padding reaches)
  if (spread) return spreadTest(world, wm, wr, sc, glows, gk, view, pad, spread);
  const facts = worldFacts(world, inv);
  let lv = artLevel;
  if (lv && lv.facts === facts && lv.gk === gk && lv.reg.c * sc <= CELL + 1e-6 && contains(lv.reg, { l: view.l - pad, t: view.t - pad, r: view.r + pad, b: view.b + pad })) gpuProbe.note(COUNTED.creditKept);
  else {
    const reg = regionFor(view, cellFor(sc), pad);
    if (!reg) return null;
    lv = artLevel = worldLevel(facts, reg, glows, gk, inv);
  }
  return artTest(lv, wm, wr);
}
// ── A look spread over frames (the placer's) ──
// The art read again (every shape's facts) and its grid drawn again took one frame of 105 to 150 ms on his Mac, after each pinch and
// on slides whose art moves (his ?perf readouts, 30 Oct). Spread, the same work is done ART_SLICE ms a frame: the same reads, the same
// drawing in the same order on a grid of its own, so the grid is the one a single frame would have drawn from the page as it then
// stood. It waits while the camera moves (a slice in a pan or pinch would add to it). Meanwhile the look answers PENDING: the placer
// leaves the credit as it is and waits, and the job calls it back (`done`) once its grid is in. A grid a job made is taken by the
// looks that follow for ART_TAKE ms even if the art changed since: art that changes on every frame (a breath eases a vessel's width
// by a fraction of a pixel) would otherwise make every look wait for another job, and never land.
export const PENDING = Symbol('art pending');
const ART_SLICE = 8, ART_TAKE = 400;
const READS = [[ORGANS, 'organ', 'org'], [FLUID, 'fluid', 'org'], [null, 'ves', 'ves']];   // (the vessels: the stage's numbers, taken at once)
let artJob = null, artMade = null, jobCanvas = null;
const covers = (lv, sc, gk, view, pad) => lv.gk === gk && lv.reg.c * sc <= CELL + 1e-6 && contains(lv.reg, { l: view.l - pad, t: view.t - pad, r: view.r + pad, b: view.b + pad });
function spreadTest(world, wm, wr, sc, glows, gk, view, pad, done) {
  const now = performance.now();
  if (artMade && (artMade.lv.facts.world !== world || now - artMade.at >= ART_TAKE)) artMade = null;
  if (artMade && covers(artMade.lv, sc, gk, view, pad)) return artTest(artMade.lv, wm, wr);
  // (A job under way: its look waits for it. Its facts are not in yet, and the ones it replaces only look fresh, as it watches from its start.)
  if (artJob && artJob.world === world) { artJob.done = done; return PENDING; }
  const fresh = artFacts && !artDirty && artFacts.world === world && artFacts.kids === world.childElementCount && artFacts.vesVer === vesselsNow().ver && now - artFacts.at < ART_MAX_AGE;
  if (fresh && artLevel?.facts === artFacts && covers(artLevel, sc, gk, view, pad)) { gpuProbe.note(COUNTED.creditKept); return artTest(artLevel, wm, wr); }
  const reg = regionFor(view, cellFor(sc), pad);
  if (!reg) return null;   // (past the cap: the screen grid, as before)
  if (!fresh && figureMoving(world)) { whenStill(world, done); return PENDING; }   // (no shape read in a gesture: the look waits for it to end)
  // (The facts the job reads are watched from its start: a change while it runs leaves them stale for the look after ART_TAKE.)
  const facts = fresh ? artFacts : null;
  if (!facts) { gpuProbe.note(COUNTED.creditRead); artDirty = false; watchArt(world); }
  artJob = { world, done, reg, glows, gk, wk: null, facts, at: now, kids: world.childElementCount, ri: 0, list: null, i: 0, acc: { org: [], ves: [] }, stage: facts ? 1 : 0, org: null, ves: null, drawn: false };
  nextFrame(artStep);
  return PENDING;
}
// The shapes' facts are read from the page only once the art has held still for HOLD_STILL ms (a MutationObserver window on the art's own
// groups, re-armed each time it fires: no per-frame read, no per-frame write). Every read of a shape after a write by the figure made
// the browser redo style and layout for it, a flush a frame while the art moved (the trace's 2,294 invalidations under artStep, which
// itself writes nothing); and facts read in the middle of a change were stale at once. After HOLD_MAX it reads anyway, so a
// figure that never stops moving still lands its look.
const HOLD_STILL = 100, HOLD_MAX = 600;
function artHold(j, world) {
  if (j.quiet || j.stage !== 0 || j.list || j.ri) return false;
  const now = performance.now();
  if (figureMoving(world)) { j.at = j.armed = now; return true; }   // (a gesture is waited out whole: it ends, unlike a breath)
  if (now - j.at >= HOLD_MAX) { j.quiet = true; return false; }
  if (j.armed === undefined || artDirty) { j.armed = now; artDirty = false; watchArt(world); return true; }
  if (now - j.armed < HOLD_STILL) return true;
  j.quiet = true;
  return false;
}
function artStep() {
  const j = artJob;
  if (!j) return;
  // (A job's reads stop while the figure is moved, part-way too, and go on where they were once it stops: its facts are in world units.)
  if (j.stage === 0 && figureMoving(j.world)) { j.quiet = false; setTimeout(() => { if (artJob === j) nextFrame(artStep); }, HOLD_STILL); return; }
  if (j.stage === 0 && !j.quiet) {
    const w = document.getElementById('world');
    if (w && w === j.world && artHold(j, w)) { setTimeout(() => { if (artJob === j) nextFrame(artStep); }, HOLD_STILL / 2); return; }
  }
  // (The figure's matrix comes from the stage's own arithmetic, not getScreenCTM: that read, a frame at a time while the figure moved, made
  // the browser redo style and layout after each of the figure's writes, the trace's 2,294 invalidations under artStep.)
  const world = document.getElementById('world'), wm = worldCTM() || readCTM(world), inv = wm && invert(wm);
  if (world !== j.world || !inv || !world.closest('.stage-view')?.classList.contains('gl-on')) { artJob = null; artDirty = true; j.done?.(); return; }
  const wk = [wm.a, wm.b, wm.c, wm.d, wm.e, wm.f].join();
  const still = j.wk === null || wk === j.wk;
  j.wk = wk;
  // (The shapes' facts are read in a task straight after the frame is drawn, not inside it: read in the frame, after the figure's
  // own changes to the page, the first shape's box and style made the browser lay the page out there and then, 49 to 91 ms in one
  // frame on the catheter slide on his Mac (1d32d326, 30 Oct). Just after the frame the layout is the one the frame just drew, so
  // the reads find it ready. The same reads of the same page, a slice a frame as before.)
  // (The grid's slices too run in that task straight after the frame, never inside it: a slice reads a lit vessel's stroke the first
  // time its glow asks for it.)
  if (still) { restPass(artReadJob); return; }
  artNext(j);
}
const artReadJob = () => artRead(artJob);
function artRead(j) {
  if (!j || artJob !== j) return;
  const world = document.getElementById('world'), wm = worldCTM() || readCTM(world), inv = wm && invert(wm);
  if (world !== j.world || !inv || !world.closest('.stage-view')?.classList.contains('gl-on')) { artJob = null; artDirty = true; j.done?.(); return; }
  gpuProbe.time(null, j.stage === 0 ? 'credit: art read' : 'credit: art grid', () => artSlice(j, inv, performance.now() + ART_SLICE));
  artNext(j);
}
function artNext(j) {
  if (artJob !== j) return;
  if (j.stage < 4) { nextFrame(artStep); return; }
  artJob = null;
  artLevel = { facts: j.facts, reg: j.reg, gk: j.gk, org: j.org, ves: j.ves };
  artMade = { lv: artLevel, at: performance.now() };
  j.done?.();
}
// One frame's share: the facts (stage 0), then the organs' grid (1, 2) and the vessels' (3), as worldFacts and worldLevel do them.
function artSlice(j, inv, until) {
  while (j.stage === 0) {
    if (!j.list) {
      if (j.ri === READS.length) {
        j.facts = artFacts = { at: j.at, world: j.world, kids: j.kids, org: j.acc.org, ves: j.acc.ves, vesVer: j.vesVer, hits: new Map() };
        if (!j.facts.org.length) artDirty = true;   // (a figure with no organ in it is not built yet, or hidden: read again at the next look)
        j.stage = 1;
        break;
      }
      if (j.ri === 0) newEpoch();
      if (!READS[j.ri][0]) { const vs = vesselsNow(); j.acc.ves.push(...vs.list.map(vesselFact)); j.vesVer = vs.ver; j.ri++; continue; }
      j.list = document.querySelectorAll(READS[j.ri][0]); j.i = 0;
    }
    const [, kind, into] = READS[j.ri];
    while (j.i < j.list.length) {
      const f = readShape(j.list[j.i++], kind, inv);
      if (f) j.acc[into].push(f);
      if (performance.now() >= until) return;
    }
    j.list = null; j.ri++;
  }
  const { cols, rows } = j.reg;
  if (j.stage === 1) {
    gpuProbe.note(COUNTED.creditGrid);
    j.org = new Uint8Array(cols * rows); j.ves = new Uint8Array(cols * rows);
    j.stage = 2; j.i = 0; j.list = null;
    j.ctx = (jobCanvas ||= new CellGrid());
    gridBegin(j.ctx, j.reg);
  }
  // (Each grid is read back a frame after its last shape is drawn: Safari records a canvas's drawing and paints it when it is read,
  // so a read straight after the drawing waited out all of it, 116 ms in one frame on his Mac (ee881888, 30 Oct). A frame later the
  // painting has had that frame to get done, as the organ pictures' strips are read (stage.js rasterPlate). The same pixels.)
  while (j.stage === 2 || j.stage === 3) {
    if (j.drawn) {
      j.drawn = false;
      gridRead(j.ctx, j.reg, j.stage === 2 ? j.org : j.ves);
      j.stage++; j.i = 0;
      if (j.stage === 3) gridBegin(j.ctx, j.reg);
      if (performance.now() >= until) return;
      continue;
    }
    const list = j.stage === 2 ? j.facts.org : j.facts.ves;
    if (j.i < list.length) { j.i = gridShapes(j.ctx, j.reg, list, j.i, until); if (j.i < list.length) return; }
    if (j.stage === 3 && j.glows.length) gridGlows(j.ctx, j.reg, j.facts, j.glows, inv);
    j.drawn = true;
    return;
  }
}

/** The art test: test(box, { pad, org, ves }) over the figure's organs and vessels, in wrap px (see worldTest, screenTest). With
 *  `spread` (a callback), a look that has to read or draw the art again answers PENDING and calls `spread` once the art is in. */
export function organTest(wr, ring = null, spread = null) {
  if (!ring) { const t = worldTest(wr, spread); if (t) return t; }
  return screenTest(wr, ring);
}

// In the sinusoid view, or zooming into or out of it (pps: window.pps, the app's handles).
export const inSinusoidView = (pps) => !!(pps?.store?.get().sinusoid || pps?.stage?.sinusoidOpen?.() || pps?.stage?.sinBusy?.());

export function createCreditPlacer(credit, { keptStyle = null } = {}) {
  const inSinusoid = () => inSinusoidView(window.pps);
  const wrap = readMetric(credit, 'offsetParent') || credit.parentElement, app = document.getElementById('app');
  const blocked = {};   // corner -> when a card last covered it
  let cur = null, curTight = false, pos = null, moving = false, changedAt = 0, lastSig = '', raf = 0, waitT = 0, moveT = 0, moveR = 0, size = null, sizeKey = '';
  // The move to a new spot: hidden at once, shown there after a moment. The spot waits in these while the timer and the rest pass run it.
  let moveC = null, moveP = null, moveTight = false;
  const moveLand = () => { moving = false; if (app?.classList.contains('pz-moving')) return soon(); place(moveC, moveP, moveTight); soon(); };
  const moveFire = () => { moveR = restPass(moveLand); };
  let worldKey = '', worldAt = 0, camT = 0;   // (the figure's camera: its last transform and when it last changed)
  // (kept: the last look that left the credit where it was, what it saw, and the corners it found covered; searches: how many
  // looks ran the full spot search, for the checks)
  let kept = '', keptBlocked = [], searches = 0;
  // (tier: the art test the spot was found under (null: the least covered spot, or the plain one); fresh: the next look picks
  // anew instead of keeping the spot (after a slide change or a resize); resized: when the screen last changed size)
  let tier = null, fresh = true, resizedAt = -1e9, stuck = '';   // (stuck: the slide it was hidden on for want of a bare spot)
  let steady = '', steadyAt = 0;   // (the look a new spot waits to see twice, and since when it has waited)
  const measure = (busy) => {
    const key = innerWidth + 'x' + innerHeight;
    if (key !== sizeKey) {
      sizeKey = key; size = {};
      for (const b of [false, true, 'tight']) {
        const c = credit.cloneNode(true);
        c.className = 'stage-credit' + (b ? ' busy' : '') + (b === 'tight' ? ' tight' : '');
        Object.assign(c.style, { visibility: 'hidden', transition: 'none', translate: 'none', top: '0', left: '0', bottom: 'auto' });
        wrap.append(c);
        // (Its size as drawn: on a phone it is scaled down from its bottom left corner, and its box at that scale had been
        // taken a third too big, so a strip of figure it fits in was passed over and it sat on a vessel: Treatment 2.)
        const k = readBox(c), wk = readBox(wrap);
        size[b] = { w: k.width, h: k.height, ox: k.left - wk.left - readMetric(wrap, 'clientLeft'), oy: k.top - wk.top - readMetric(wrap, 'clientTop') };
        if (b) {
          // The notch's side margins (a phone held sideways) and the home indicator's strip at the bottom, kept clear like a card.
          c.style.padding = '0 env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)';
          const cs = readStyle(c);
          size.sl = parseFloat(cs.paddingLeft) || 0; size.sr = parseFloat(cs.paddingRight) || 0; size.sb = parseFloat(cs.paddingBottom) || 0;
        }
        c.remove();
      }
    }
    return size[busy];
  };
  const rectOf = (el, wr) => {
    if (el === credit || credit.contains(el)) return null;
    const s = readStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || el.classList.contains('pz-hide')) return null;
    // A pane can draw outside its own box (the phone slide's words hang above a zero-height holder): take its children too.
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const q of [readBox(el), ...[...el.children].map((k) => readBox(k))]) {
      if (!q.width || !q.height) continue;
      l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
    }
    if (r <= l) return null;
    return { l: l - wr.left, t: t - wr.top, r: r - wr.left, b: b - wr.top, chrome: el.matches(CHROME) };
  };
  const place = (c, p, tight = false) => {
    credit.classList.toggle('tight', tight);
    curTight = tight;
    const z = size[tight ? 'tight' : credit.classList.contains('busy')] || {};   // (p: where its drawn box goes)
    credit.style.setProperty('--cx', `${Math.round(p.x - (z.ox || 0))}px`);
    credit.style.setProperty('--cy', `${Math.round(p.y - (z.oy || 0))}px`);
    cur = c; pos = p;
    credit.classList.add('placed');
    credit.classList.remove('moving', 'covered');
  };
  function check() {
    raf = 0;
    if (moving || !credit.isConnected || !readMetric(wrap, 'offsetParent') || !readMetric(credit, 'offsetParent')) return;   // (not shown: an iPhone slide carries it in the teaching card)
    // A slide change (the presenter's pz-moving): out of sight until the cards are in and the camera has settled; it then
    // appears at once at its final spot.
    // A deck opened by its link still loading: out of sight until it is up (it had settled on the plain figure, then hidden as the
    // slide came in; sweep 01 review).
    if ('pzOpening' in document.documentElement.dataset) { credit.classList.add('moving'); lastSig = ''; kept = ''; fresh = true; clearTimeout(camT); camT = setTimeout(soon, 200); return; }
    if (app?.classList.contains('pz-moving')) { credit.classList.add('moving'); changedAt = 0; lastSig = ''; kept = ''; fresh = true; return; }
    // The sinusoid view is all art (hepatocytes, the wall, the blood): no bare spot, so it is hidden there, from the moment the
    // zoom in starts until the zoom back out to the lobule has landed, then placed afresh (at once, never faded).
    if (inSinusoid()) {
      credit.classList.add('covered'); changedAt = 0; lastSig = ''; kept = ''; fresh = true;
      clearTimeout(camT); if (!window.pps?.store?.get().sinusoid) camT = setTimeout(soon, 120);   // (on the way out: look again until it lands)
      return;
    }
    // A resize or a turn: hidden at once, and placed once when the size has held a moment (it had hopped three times in 1.2 s
    // as the cards and the figure followed the new size).
    if (performance.now() - resizedAt < 400) { credit.classList.add('moving'); fresh = true; clearTimeout(camT); camT = setTimeout(soon, 420); return; }
    // The dive into the lobule (or back out) under way: the credit holds still (and the look waits) until it has landed.
    const dv = window.pps?.stage?.diveProgress?.() ?? 0;
    if (dv > 0 && dv < 1) { clearTimeout(camT); camT = setTimeout(soon, 150); return; }
    // A pan or a zoom under way: the art under every spot moves with the camera, and sampling it again on each look
    // (thousands of point-in-shape tests over the vessels) made panning and zooming lag. A placed credit keeps its spot
    // until the camera has rested a moment, then looks once.
    // (In the lobule its outline stands for the camera: the lobule pans and zooms on its own.)
    const ring = window.pps?.stage?.lobuleRing?.() || null;
    const wm = readCTM(document.getElementById('world')), wk = (wm ? [wm.a, wm.d, wm.e, wm.f].map((v) => v.toFixed(2)).join(',') : '') + (ring ? '|' + ring.flat().map(Math.round).join(',') : '');
    if (wk !== worldKey) { worldKey = wk; worldAt = performance.now(); }
    // (The first placement waits for the camera too: a look taken mid-move had put it at the bottom on one load and the top on the next.)
    if (performance.now() - worldAt < 250) { clearTimeout(camT); camT = setTimeout(soon, 260); return; }
    const wr = readBox(wrap);
    let { w, h } = measure(false);
    const fig = { l: size.sl, t: 0, r: wr.width - size.sr, b: wr.height - Math.max(0, size.sb - Math.max(0, innerHeight - wr.bottom)) };   // (the home indicator's strip, where the figure reaches the screen's bottom)
    // (The catheter's shaft too: on the GPU it is not in the page, so the art test cannot see it, and the credit had stood on it, HVPG 2 on a phone held sideways.)
    const cathBars = (window.pps?.stage?.cathBoxes?.() || []).map((q) => ({ l: Math.floor(q.l / GRID) * GRID, t: Math.floor(q.t / GRID) * GRID, r: Math.ceil(q.r / GRID) * GRID, b: Math.ceil(q.b / GRID) * GRID, chrome: true }));
    const els = [...document.querySelectorAll(OBSTACLES)], obs = [...els.map((el) => rectOf(el, wr)), ...gpuProbe.time(null, 'credit: labels', () => labelRects(wr, wrap, keptStyle)), ...cathBars].filter((o) => o && hit(o, fig));
    const busy = obs.some((o) => !o.chrome);
    credit.classList.toggle('busy', busy);
    if (busy) ({ w, h } = measure(true));
    const sig = obs.map((o) => [o.l, o.t, o.r, o.b].map(Math.round).join(',')).join(';') + '|' + w + '|' + wr.width + 'x' + wr.height;
    const now = performance.now();
    // A card still sliding or fading in is not where it will settle: wait for it (and for its size to stop changing).
    // (The card and its blocks only: a live instrument deep inside eases all the time and kept the credit hidden.)
    const settling = gpuProbe.time(null, 'credit: card motion', () => els.some((el) => [el, ...el.children].some((c) => readAnims(c).some((an) => an.playState === 'running' && Number.isFinite(readTiming(an.effect).endTime)))));
    // (lastSig is empty after a slide change: the first look at the settled cards is taken as it is, with no extra beat.)
    if ((lastSig && sig !== lastSig) || settling) {
      // Something moved: if it now reaches the credit, hide it at once; let it settle before choosing a new spot
      // (but not forever: a piece that keeps moving is taken where it is after a moment).
      lastSig = sig;
      const hitNow = pos && obs.some((o) => hit({ l: pos.x - 4, t: pos.y - 4, r: pos.x + w + 4, b: pos.y + h + 4 }, o));
      if (hitNow) credit.classList.add('moving');
      // (Shown and still clear: it stays painted where it is while the rest settles; it waits only when it has to move.)
      if (hitNow || !pos || credit.matches('.moving, .covered')) {
        changedAt ||= now;
        if (now - changedAt < 1600) { clearTimeout(waitT); waitT = setTimeout(soon, 50); return; }
      }
    }
    changedAt = 0; lastSig = sig;
    // (One margin with the cards: the credit's edge lines up with the presenter's cards, the screen's margin.)
    const shade = document.querySelector('.pz-shade'), sr = shade && readStyle(shade).opacity !== '0' ? readBox(shade) : null;
    // Nothing it looks at changed since a look that left it in place (the same cards, labels, camera, size and slide layout):
    // that look's answer holds, so the spot search over the art is not run again. (The poll and every transition ended
    // re-ran it, about 7% of a slowed phone's time on a slide sitting still.) The corners it found covered stay covered.
    const look = `${sig}|${wk}|${busy}|${sr ? Math.round(sr.left) : ''}|${!!(app?.classList.contains('presenting') && document.querySelector('.pz:not(.stack)'))}|${credit.className}`;
    if (look === kept && !settling) { for (const k of keptBlocked) blocked[k] = now; return; }
    kept = '';
    const opt = { gap: wr.width < 768 ? 12 : 24, inset: sr?.width ? Math.max(12, Math.round(sr.left - wr.left - fig.l)) : wr.width < 768 ? 12 : 24 };   // (a clear gap from every card: 24 px on a laptop or tablet)
    // (The art read or drawn again is spread over frames: PENDING until it is in, when the job looks again. Meanwhile the credit
    // stays as it is; a new spot's wait for a steady view, below, runs alongside it.)
    const art = gpuProbe.time(null, 'credit: art grid', () => organTest(wr, ring, soon)), artWait = art === PENDING;
    // It holds its spot while that spot stays good: inside the figure, clear of every card and label by the gap, and as clear of the
    // art as when it was chosen. A better spot freeing up is no reason to move (a label's live number changing width beside it
    // had it hop between spots every few seconds; Circuit 7 on a phone). After a slide change or a resize it picks anew.
    if (pos && !fresh && !credit.matches('.moving, .covered')) {
      if (artWait) return;
      const z = curTight ? measure('tight') : { w, h }, bx = { l: pos.x, t: pos.y, r: pos.x + z.w, b: pos.y + z.h };
      const inside = bx.l >= fig.l && bx.r <= fig.r && bx.t >= fig.t + Math.min(opt.inset, 12) && bx.b <= fig.b - 4;
      const clear = !obs.some((o) => hit({ l: bx.l - opt.gap, t: bx.t - opt.gap, r: bx.r + opt.gap, b: bx.b + opt.gap }, o));
      if (inside && clear && tier && !art(bx, tier)) { kept = look; keptBlocked = []; return; }
    }
    // (Hidden on a slide for want of a bare spot: it stays hidden through that slide's picks and steps, never flickering back as
    // a number or a card shifts, until the next slide or a resize looks afresh.)
    const slide = app?.classList.contains('presenting') ? `${document.title}|${document.querySelector('.pzb-n')?.textContent}` : '';
    if (stuck && !fresh && slide && stuck === slide) { kept = look; keptBlocked = []; return; }
    // A new spot is chosen only from a view that has held still: the same cards, labels, camera and size on two looks 150 ms
    // apart (a label or the lobule's outline still arriving had made the same view land it in different corners on two loads;
    // sweep 02). A slide too, after its pz-moving hold: its labels and readings arrive after the camera settles (Circuit 10 on an
    // iPad showed it for a second, then hid it). Never longer than 1.6 s.
    if (steadyAt && now - steadyAt > 2000) { steady = ''; steadyAt = 0; }   // (a wait left behind by a look that kept its spot)
    if (look !== steady && (!steadyAt || now - steadyAt < 1600)) { steadyAt ||= now; steady = look; clearTimeout(waitT); waitT = setTimeout(soon, 150); return; }
    if (artWait) return;   // (a steady view: the search waits for the art, and lands when it is in)
    steady = ''; steadyAt = 0;
    stuck = ''; fresh = false; searches++;
    const covered = CORNERS.filter((k) => !freeSpots(fig, obs, w, h, opt)[k]);
    for (const k of covered) blocked[k] = now;
    // Only bare figure: never on an organ or a vessel, nor on a card or label (Mohammad, 14 Oct; and 15 Oct: it had been put over
    // a vessel where nothing bare was free). The strictest look first, 18 px clear of the art, then 8 and then 4, always on one
    // line (it had wrapped onto two in a narrow strip; sweeps 01 #14, 02 #13, #22). With no bare spot anywhere it stays hidden.
    let spots = null, tight = false, found = null;
    find: for (const t of [{ pad: 18 }, { pad: 8 }, { pad: 4 }]) {
      for (const two of [false]) {
        const z = two ? measure('tight') : { w, h }, b = freeSpots(fig, obs, z.w, z.h, { ...opt, avoid: (box) => art(box, t) });
        if (CORNERS.some((k) => b[k])) { spots = b; tight = two; found = t; break find; }
      }
    }
    // (A slide on a laptop or tablet: one spot, the figure's top right, whenever it is free; a phone keeps the corner order.)
    const pref = app?.classList.contains('presenting') && document.querySelector('.pz:not(.stack)') ? 'tr' : null;
    tier = found;
    const c = !spots ? null : pref && spots[pref] ? pref : pickCorner(spots, cur, blocked);
    if (!c) { credit.classList.add('covered'); stuck = slide; kept = look; keptBlocked = covered; return; }
    const p = spots[c];
    if (c === cur && tight === curTight && !credit.classList.contains('moving') && !credit.classList.contains('covered') && Math.abs(p.x - pos.x) <= 4 && Math.abs(p.y - pos.y) <= 4) {
      // A nudge of a few pixels (its own size easing to the busy size) is taken in place.
      if (p.x !== pos.x || p.y !== pos.y) place(c, p, tight);
      kept = look; keptBlocked = covered;
      return;
    }
    if (!pos || credit.classList.contains('covered') || credit.classList.contains('moving')) { place(c, p, tight); return; }
    // A new spot: hide at once, hold hidden a moment, show at once there (never a slide across the figure, never a fade).
    credit.classList.add('moving');
    moving = true;
    clearTimeout(moveT); cancelRest(moveR);
    moveC = c; moveP = p; moveTight = tight;   // (what the move lands on: kept here, as the timer above is cancelled before any later ask replaces them)
    moveT = setTimeout(moveFire, 80);   // (the writes run between frames)
  }
  // (A look reads the page's layout (the cards, labels and the figure's box): it runs as a rest pass between frames, never inside one
  // (rest-pass.js; the owner's rule, 1 Nov: no layout reads in a frame).)
  function soon() { if (!raf) raf = restPass(check); }
  addEventListener('resize', () => { resizedAt = performance.now(); artDirty = true; soon(); });   // (a media query can change a stroke's width: the shapes are read again)
  addEventListener('pps:occ', soon);
  // Readout bars ease on every value and never cover the figure: their transitions are not a reason to look again. Nor is a
  // transition that can move nothing the look measures: only one on the figure (its labels), or on, in or around a card, bar or
  // menu (PLACED: base selectors, so a piece fading out of its shown state still counts). Review item 29.
  const settled = (e) => {
    const t = e.target;
    if (t?.nodeType !== 1 || t.classList.contains('rb-fill')) return;
    if (wrap.contains(t) || t.closest(PLACED) || t.querySelector(PLACED)) soon();
  };
  addEventListener('transitionend', settled, true);
  addEventListener('animationend', settled, true);
  // (Not for stage-busy alone: the floating pieces' fade while the figure moves changes only their opacity, and a look then,
  // as the menus faded back in after each pan or pinch, added to that beat's hitch.)
  const appCls = () => app.className.replace(/(?:^|\s)stage-busy(?=\s|$)/g, '');
  let appWas = app ? appCls() : '';
  if (app) new MutationObserver(() => { const c = appCls(); if (c !== appWas) { appWas = c; soon(); } }).observe(app, { attributes: true, attributeFilter: ['class'] });
  // Cards open, close and resize in many ways; a light poll catches the ones no event announces. (It looks only when something
  // the look measures may have changed: a card or bar moved, sized or changed state (layoutWatch), the labels were laid out
  // again or the camera moved, or labels came or went. In the lobule and the sinusoid, whose own labels move by themselves, it
  // looks every second as before.) A look with nothing changed had measured every card and label just to keep its spot.
  const watch = layoutWatch();
  let polled = '';
  // (2 Nov 2026, the iPhone trace: innerWidth and innerHeight read here, each second, made the browser bring the page's layout up to
  // date then. The window's size is kept from its resize events instead.)
  let winKey = `${innerWidth}x${innerHeight}`;
  addEventListener('resize', () => { winKey = `${innerWidth}x${innerHeight}`; }, { passive: true });
  // (bugs-recs 4, 2 Nov 2026: the labels' own boxes are in labelBoxStamp, a shown label with its box and a gone one with none, so the
  // page is not searched for them each second; only without that stamp are they counted. The catheter's readings are a live list.)
  const cathLabs = document.getElementsByClassName('cath-label');
  const pollKey = () => `${window.pps?.stage?.labelBoxStamp?.() ?? window.pps?.stage?.labelStamp?.() ?? Math.random()}|${window.pps?.stage?.labelBoxStamp ? '' : document.querySelectorAll('#labels .lb:not(.lb-off)').length}|${cathLabs.length}|${winKey}`;
  // (The poll is a may task of the page's one frame, a second apart (notBefore), never a timer task of its own between frames, and it
  // waits while the tab is hidden: no frame comes then, so nothing runs until the page shows again.)
  const POLL_MS = 1000;
  const poll = () => {
    mayTask('credit-poll', poll, { notBefore: performance.now() + POLL_MS });
    if (document.hidden) return;
    const k = pollKey();
    // (Settings › Figure performance › Credit check in talks (frame.js): in Present too, only when one of those may have changed.)
    // (Since 1 Nov 2026 not every second in the lobule and the sinusoid either: their views and gliding names are in the key (stage.js
    // labelStamp), so a still lobule or sinusoid measures nothing.)
    if (watch.due() || k !== polled || (app?.classList.contains('presenting') && !figLab('creditLean'))) soon();
    polled = k;
  };
  mayTask('credit-poll', poll, { notBefore: performance.now() + POLL_MS });
  soon();
  return { refresh: soon, corner: () => cur, searches: () => searches };
}
