// The corner credit finds a free spot on the figure: never on or touching a card, a sheet, a bar or a menu.
// It keeps its corner while that corner stays free and is never animated (no glide, no fade): any move hides it at once,
// holds it hidden only until the cards have settled (a slide change lifts its hold 120 ms after the camera move; a move off a spot a card now covers is hidden for 80 ms), then shows it at once at the new spot; with no figure left anywhere it stays hidden.
import { frameFor, figLab } from './frame.js?v=f83d70f0ee';
import { gpuProbe, COUNTED } from './gpu-probe.js?v=dd12fc216c';
import { CELL, cellFor, regionFor, contains, touches, artTest, boxThrough, multiply, invert } from './credit-art.js?v=77b95dafe8';
import { layoutWatch, PLACED } from './idle-keys.js?v=6eccd5d85a';
const nextFrame = frameFor('credit');

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
export const CHROME = '#topbar, .pz-fk, .pz-scales, #vdock, #zoomPill, #sinViews, .stage-clock, .pz-bar, .scan-probe:not(.off) .sp-body, .dop-probe:not(.off) .dpr-body, .pz-prog';   // (.pz-prog: a slide's progress line along the bottom edge)   // (the FibroScan probe: its body carries the reading)

// The figure's own labels (station values, organ captions) and measuring callouts: each one's text and pill, padded and snapped outward to a small
// grid, so a label that jitters by a pixel as its number changes does not read as a move.
const GRID = 8;
export function labelRects(wr, wrap, kept = null) {
  const out = [], seen = new Map();   // the shared ancestors' own opacity, read once per pass
  // (kept: the stage's own kept copy of its styles, for the figure's element: a live read made the browser bring its styles up to date)
  const own = (el) => { let v = seen.get(el); if (v === undefined) { const s = kept?.(el) || getComputedStyle(el), p = (n) => s.getPropertyValue(n); v = p('display') === 'none' || p('visibility') === 'hidden' ? 0 : +p('opacity'); seen.set(el, v); } return v; };
  for (const g of document.querySelectorAll('#labels .lb:not(.lb-off)')) {
    let o = 1;
    for (let el = g; el && el !== wrap && o > 0.01; el = el.parentElement) o *= own(el);
    if (o <= 0.01) continue;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const q of g.querySelectorAll('text, .lb-bg')) {
      const k = q.getBoundingClientRect();
      if (k.width < 1 || k.height < 1) continue;
      l = Math.min(l, k.left); t = Math.min(t, k.top); r = Math.max(r, k.right); b = Math.max(b, k.bottom);
    }
    if (r <= l) continue;
    out.push({ l: Math.floor((l - wr.left - 2) / GRID) * GRID, t: Math.floor((t - wr.top - 2) / GRID) * GRID, r: Math.ceil((r - wr.left + 2) / GRID) * GRID, b: Math.ceil((b - wr.top + 2) / GRID) * GRID, chrome: true });
  }
  // The measuring callouts (the catheter's WHVP and FHVP, the slide's site readings) and the lobule and sinusoid views' labels, names and
  // resistance pills (the figure key must never cover one), likewise.
  for (const el of document.querySelectorAll('.cath-labels .cath-label, .lz-lab, .lz-zone, .lz-call, .lz-call-r.on, .sv-region, .sv-legend')) {
    let o = 1;
    for (let q = el; q && q !== wrap && o > 0.01; q = q.parentElement) o *= own(q);
    if (o <= 0.01) continue;
    const k = el.getBoundingClientRect();
    if (k.width < 1 || k.height < 1) continue;
    out.push({ l: Math.floor((k.left - wr.left - 2) / GRID) * GRID, t: Math.floor((k.top - wr.top - 2) / GRID) * GRID, r: Math.ceil((k.right - wr.left + 2) / GRID) * GRID, b: Math.ceil((k.bottom - wr.top + 2) / GRID) * GRID, chrome: true });
  }
  return out;
}

// A test for spots over the figure's art (wrap px): the credit sits on bare background, never on an organ or a vessel nor
// touching an outline (Mohammad, 14 Oct). The art (each shape's fill and stroke) is drawn once onto a small canvas, one pixel per
// cell, and any cell it touches counts; a box is tested against every cell it covers, grown by `pad` px all round. (Testing each
// cell's centre against the shapes, thousands of isPointInStroke calls along the vessels, took a few hundred ms per look and made
// panning and zooming lag.)
// On the GPU figure (worldTest below) the grid is in the figure's own coordinates and the shapes are read once: a camera move reads
// no shape and no pixel, the credit only maps its candidate boxes into the world. Elsewhere (the lobule's outline, the SVG figure
// of Lite graphics, a grid over the cap) screenTest draws the art on the screen's own grid, 6 px cells, as it always did.
// Organs and vessels are kept in two grids. On the GPU figure the vessel tubes are not in the page at all (their SVG tubes are
// display:none), only their transparent hit strokes are, so those stand for the vessels there, at 0.7 of their width (a hit stroke is wider than its tube).
const ORGANS = 'g.organ :is(path, circle, ellipse, rect, polygon):not(.org-shade)';
const VESSELS = '#edges :is(.v-lumen, .v-lumenP, .v-strand), #world .v-hit';
// (The ascites fluid and the flanks' outline count as organs' art, as drawn: their fill where they have one, their stroke where
// they have one. A small phone in Patients had put the credit on the fluid.)
// (The diaphragm's line across the back wall counts too: the credit had sat on it with the menu open; sweep 02 #11.)
const FLUID = '#ascites .ascites-fill, #ascites .ascites-line, path.flank, path.org-diaphragm';
const num = (el, a) => parseFloat(el.getAttribute(a)) || 0;
// (A path's Path2D is kept while its outline is the same: read again from its text on every look, the organs' thousands of
// paths, about 1 MB, were most of the 73 to 95 ms each look took on a Mac once a pan or pinch had stopped: Mohammad's ?perf
// readout, 21 Oct. The same outline, so the same cells.)
const pathMemo = new WeakMap();
function shapePath(el) {
  const p = new Path2D(), tag = el.tagName.toLowerCase();
  if (tag === 'path') {
    const d = el.getAttribute('d') || '', m = pathMemo.get(el);
    if (m && m.d === d) return m.p;
    const q = new Path2D(d);
    pathMemo.set(el, { d, p: q });
    return q;
  }
  if (tag === 'circle') p.arc(num(el, 'cx'), num(el, 'cy'), num(el, 'r'), 0, 2 * Math.PI);
  else if (tag === 'ellipse') p.ellipse(num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry'), 0, 0, 2 * Math.PI);
  else if (tag === 'rect') p.rect(num(el, 'x'), num(el, 'y'), num(el, 'width'), num(el, 'height'));
  else if (tag === 'polygon') {
    const v = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
    for (let k = 0; k + 1 < v.length; k += 2) k ? p.lineTo(v[k], v[k + 1]) : p.moveTo(v[k], v[k + 1]);
    p.closePath();
  }
  return p;
}
let organMemo = { key: '', test: null };
// test(box, { pad, org, ves }): true when the box, grown by pad, touches the organs and/or the vessels.
// ring: the lobule's outline (client px) while the lobule fills the view. Its art is then the lobule, not the anatomy hidden under it
// (the credit had landed on the hepatocytes).
// The screen's own grid: the art drawn again, from the page, whenever the camera or the lobule's ring moved.
function screenTest(wr, ring = null) {
  const glows = ring ? [] : window.pps?.stage?.steadyGlows?.() || [];
  const world = document.getElementById('world')?.getScreenCTM(), key = [wr.left, wr.top, wr.width, wr.height, world && [world.a, world.d, world.e, world.f].map((v) => v.toFixed(2)), ring && ring.flat().map((v) => v.toFixed(1)), glows.flat().join()].join('|');
  if (organMemo.key === key) return organMemo.test;
  const cols = Math.ceil(wr.width / CELL) + 1, rows = Math.ceil(wr.height / CELL) + 1, grids = { org: new Uint8Array(cols * rows), ves: new Uint8Array(cols * rows) };
  const cv = document.createElement('canvas');
  cv.width = cols; cv.height = rows;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    const paint = (sel, grid, vessel, asDrawn = false) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!asDrawn) ctx.clearRect(0, 0, cols, rows);   // (as drawn: added to the organs just painted)
      for (const el of document.querySelectorAll(sel)) {
        const m = el.getScreenCTM?.(), r = el.getBoundingClientRect();
        if (!m || !r.width) continue;   // (drawn as a bitmap plate, the shapes stay in place but hidden: they still count)
        const cs = getComputedStyle(el);
        if (cs.display === 'none') continue;
        const w = parseFloat(cs.strokeWidth) || 0;
        // A shape wholly off the grid paints nothing in it, and is not drawn: zoomed in, most of the organs' shapes are off
        // screen, and drawing them all took 28 ms after each pan or zoom (Mohammad's ?perf readout, Mac, 21 Oct). (Its box is
        // the fill's: grown by the most its stroke reaches, a miter at the default limit, twice the stroke width, and a cell.)
        const g = 2 * w * Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)) + CELL;
        if (r.right + g < wr.left || r.left - g > wr.left + cols * CELL || r.bottom + g < wr.top || r.top - g > wr.top + rows * CELL) continue;
        // One canvas pixel per cell: cell (i, j) covers wrap px [i * CELL, (i + 1) * CELL).
        ctx.setTransform(m.a / CELL, m.b / CELL, m.c / CELL, m.d / CELL, (m.e - wr.left) / CELL, (m.f - wr.top) / CELL);
        const path = shapePath(el);
        if (asDrawn ? cs.fill !== 'none' : !vessel || (cs.fill !== 'none' && !el.classList.contains('v-hit'))) ctx.fill(path);
        if (w > 0 && (asDrawn ? cs.stroke !== 'none' : !vessel || cs.stroke !== 'none' || el.classList.contains('v-hit'))) { ctx.lineWidth = el.classList.contains('v-hit') ? w * 0.7 : w; ctx.lineCap = cs.strokeLinecap || 'butt'; ctx.lineJoin = cs.strokeLinejoin || 'miter'; ctx.stroke(path); }
      }
      const px = ctx.getImageData(0, 0, cols, rows).data;
      for (let k = 0; k < grid.length; k++) grid[k] = px[k * 4 + 3] > 0 ? 1 : 0;
    };
    if (ring) {
      // The lobule: its outline filled, and every portal tract and neighbouring central vein round it (a phone had put the credit on a
      // neighbour's central vein, sweep 05); the faint neighbouring lobules' sinusoids are background.
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cols, rows); ctx.beginPath();
      ring.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (x - wr.left) / CELL, (y - wr.top) / CELL));
      ctx.closePath(); ctx.fill();
      for (const [x, y, rr] of ring.discs || []) { ctx.beginPath(); ctx.arc((x - wr.left) / CELL, (y - wr.top) / CELL, rr / CELL, 0, Math.PI * 2); ctx.fill(); }
      const px = ctx.getImageData(0, 0, cols, rows).data;
      for (let k = 0; k < grids.org.length; k++) grids.org[k] = px[k * 4 + 3] > 0 ? 1 : 0;
    } else {
      paint(ORGANS, grids.org, false);
      paint(FLUID, grids.org, false, true);
      paint(VESSELS, grids.ves, true);
      // A lit vessel's glow, the soft band 12 × its width setting (world units) beyond each wall (veins-gl.js), counts as the vessel
      // (sweep 01 review: an iPad zoomed in had put the credit on a glow).
      if (glows.length) {
        for (const [id, wide] of glows) for (const el of document.querySelectorAll(`#world .v-hit[data-id="${CSS.escape(id)}"]`)) {
          const m = el.getScreenCTM?.(), lumen = el.parentNode?.querySelector('.v-lumen');
          if (!m) continue;
          ctx.setTransform(m.a / CELL, m.b / CELL, m.c / CELL, m.d / CELL, (m.e - wr.left) / CELL, (m.f - wr.top) / CELL);
          ctx.lineWidth = (lumen ? parseFloat(getComputedStyle(lumen).strokeWidth) || 0 : parseFloat(getComputedStyle(el).strokeWidth) || 0) + 2 * 12 * Math.min(1.3, Math.max(0.5, wide));
          ctx.lineCap = ctx.lineJoin = 'round'; ctx.stroke(shapePath(el));
        }
        const px = ctx.getImageData(0, 0, cols, rows).data;
        for (let k = 0; k < grids.ves.length; k++) grids.ves[k] = px[k * 4 + 3] > 0 ? 1 : 0;
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
//  - the GRID (worldLevel): the facts drawn onto a canvas over the world rectangle the view and a margin round it cover, one pixel
//    per cell, and read back once. It is reused while the view stays inside that rectangle at a zoom no more than CELL px a cell (a
//    pan of up to half a screen, a zoom in or out by up to twice); past that it is drawn again from the facts, with no page read.
// So a camera move reads no shape and no pixel; the credit maps each box it asks about into the world (credit-art.js artTest).
const ART_MAX_AGE = 15000;
const ART_ATTRS = ['d', 'transform', 'class', 'style', 'hidden', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points'];
const ART_QUIET = '#overlays, #nodes, #guides, #focus, #grid';   // (the figure's groups that hold none of the art tested)
let artFacts = null, artLevel = null, artDirty = true, artMo = null, artCanvas = null;

// One shape's facts (kind: 'organ', 'fluid' as drawn, or 'ves'): the same shapes, fills and strokes the screen grid draws below.
function readShapes(sel, kind, inv) {
  const out = [], asDrawn = kind === 'fluid', vessel = kind === 'ves';
  for (const el of document.querySelectorAll(sel)) {
    const m = el.getScreenCTM?.(), r = el.getBoundingClientRect();
    if (!m || !r.width) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    const w = parseFloat(cs.strokeWidth) || 0, hit = el.classList.contains('v-hit'), rel = multiply(inv, m);
    // (The shape's box is the fill's, grown by the most its stroke reaches, a miter at the default limit: twice the stroke width.)
    const g = 2 * w * Math.max(Math.hypot(rel.a, rel.b), Math.hypot(rel.c, rel.d)), bb = boxThrough(inv, r.left, r.top, r.right, r.bottom);
    const fill = asDrawn ? cs.fill !== 'none' : !vessel || (cs.fill !== 'none' && !hit);
    const stroke = w > 0 && (asDrawn ? cs.stroke !== 'none' : !vessel || cs.stroke !== 'none' || hit);
    out.push({ path: shapePath(el), m: rel, l: bb.l - g, t: bb.t - g, r: bb.r + g, b: bb.b + g, fill, lw: stroke ? (hit ? w * 0.7 : w) : 0, cap: cs.strokeLinecap || 'butt', join: cs.strokeLinejoin || 'miter' });
  }
  return out;
}
// A lit vessel's hit strokes, for its glow (read when a glow first asks for the vessel, then kept with the facts).
function hitsOf(facts, id, inv) {
  let out = facts.hits.get(id);
  if (out) return out;
  out = [];
  for (const el of document.querySelectorAll(`#world .v-hit[data-id="${CSS.escape(id)}"]`)) {
    const m = el.getScreenCTM?.(), lumen = el.parentNode?.querySelector('.v-lumen');
    if (!m) continue;
    out.push({ path: shapePath(el), m: multiply(inv, m), w: (lumen ? parseFloat(getComputedStyle(lumen).strokeWidth) || 0 : parseFloat(getComputedStyle(el).strokeWidth) || 0) });
  }
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
  if (artFacts && !artDirty && artFacts.world === world && artFacts.kids === world.childElementCount && now - artFacts.at < ART_MAX_AGE) return artFacts;
  gpuProbe.note(COUNTED.creditRead);
  const facts = { at: now, world, kids: world.childElementCount, org: [...readShapes(ORGANS, 'organ', inv), ...readShapes(FLUID, 'fluid', inv)], ves: readShapes(VESSELS, 'ves', inv), hits: new Map() };
  watchArt(world);
  artDirty = !facts.org.length;   // (a figure with no organ in it is not built yet, or hidden: read again at the next look)
  return (artFacts = facts);
}
// The facts drawn over `reg` (credit-art.js regionFor), one canvas pixel per cell: cell (i, j) covers the world square at
// (x0 + i c, y0 + j c), c wide. Organs and the fluid in one grid, the vessels (and the lit ones' glow) in the other.
function worldLevel(facts, reg, glows, gk, inv) {
  gpuProbe.note(COUNTED.creditGrid);
  const { cols, rows, c, x0, y0 } = reg, n = cols * rows, org = new Uint8Array(n), ves = new Uint8Array(n);
  artCanvas ||= document.createElement('canvas');
  if (artCanvas.width !== cols || artCanvas.height !== rows) { artCanvas.width = cols; artCanvas.height = rows; }
  const ctx = artCanvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    const paint = (list, grid, glow) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cols, rows);
      const at = (m) => ctx.setTransform(m.a / c, m.b / c, m.c / c, m.d / c, (m.e - x0) / c, (m.f - y0) / c);
      for (const s of list) {
        if (!touches(reg, s)) continue;   // (zoomed in, most shapes are off the grid: not drawn)
        at(s.m);
        if (s.fill) ctx.fill(s.path);
        if (s.lw > 0) { ctx.lineWidth = s.lw; ctx.lineCap = s.cap; ctx.lineJoin = s.join; ctx.stroke(s.path); }
      }
      // A lit vessel's glow, the soft band 12 × its width setting (world units) beyond each wall (veins-gl.js), counts as the vessel
      // (sweep 01 review: an iPad zoomed in had put the credit on a glow).
      if (glow) {
        for (const [id, wide] of glows) for (const h of hitsOf(facts, id, inv)) {
          at(h.m);
          ctx.lineWidth = h.w + 2 * 12 * Math.min(1.3, Math.max(0.5, wide));
          ctx.lineCap = ctx.lineJoin = 'round'; ctx.stroke(h.path);
        }
      }
      const px = ctx.getImageData(0, 0, cols, rows).data;
      for (let k = 0; k < n; k++) grid[k] = px[k * 4 + 3] > 0 ? 1 : 0;
    };
    paint(facts.org, org, false);
    paint(facts.ves, ves, glows.length > 0);
  }
  return { facts, reg, gk, org, ves };
}
// The art test of the GPU figure in the world's coordinates, or null where it does not apply (the Lite graphics' SVG figure, a
// view whose grid would pass the cap): organTest then draws the screen grid.
function worldTest(wr) {
  const world = document.getElementById('world'), wm = world?.getScreenCTM?.(), inv = wm && invert(wm), sc = wm ? Math.hypot(wm.a, wm.b) : 0;
  if (!inv || !(sc > 1e-6)) return null;
  if (!world.closest('.stage-view')?.classList.contains('gl-on')) { artDirty = true; return null; }   // (the SVG tubes show: what counts differs, so the facts are read again when the GPU figure is back)
  const glows = window.pps?.stage?.steadyGlows?.() || [], gk = glows.flat().join();
  const pad = 40 / sc, view = boxThrough(inv, wr.left, wr.top, wr.left + wr.width, wr.top + wr.height);   // (pad: past the view, what a box's own padding reaches)
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
/** The art test: test(box, { pad, org, ves }) over the figure's organs and vessels, in wrap px (see worldTest, screenTest). */
export function organTest(wr, ring = null) {
  return (!ring && worldTest(wr)) || screenTest(wr, ring);
}

// In the sinusoid view, or zooming into or out of it (pps: window.pps, the app's handles).
export const inSinusoidView = (pps) => !!(pps?.store?.get().sinusoid || pps?.stage?.sinusoidOpen?.() || pps?.stage?.sinBusy?.());

export function createCreditPlacer(credit, { keptStyle = null } = {}) {
  const inSinusoid = () => inSinusoidView(window.pps);
  const wrap = credit.offsetParent || credit.parentElement, app = document.getElementById('app');
  const blocked = {};   // corner -> when a card last covered it
  let cur = null, curTight = false, pos = null, moving = false, changedAt = 0, lastSig = '', raf = 0, waitT = 0, moveT = 0, size = null, sizeKey = '';
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
        const k = c.getBoundingClientRect(), wk = wrap.getBoundingClientRect();
        size[b] = { w: k.width, h: k.height, ox: k.left - wk.left - wrap.clientLeft, oy: k.top - wk.top - wrap.clientTop };
        if (b) {
          // The notch's side margins (a phone held sideways) and the home indicator's strip at the bottom, kept clear like a card.
          c.style.padding = '0 env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)';
          const cs = getComputedStyle(c);
          size.sl = parseFloat(cs.paddingLeft) || 0; size.sr = parseFloat(cs.paddingRight) || 0; size.sb = parseFloat(cs.paddingBottom) || 0;
        }
        c.remove();
      }
    }
    return size[busy];
  };
  const rectOf = (el, wr) => {
    if (el === credit || credit.contains(el)) return null;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || el.classList.contains('pz-hide')) return null;
    // A pane can draw outside its own box (the phone slide's words hang above a zero-height holder): take its children too.
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const q of [el.getBoundingClientRect(), ...[...el.children].map((k) => k.getBoundingClientRect())]) {
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
    if (moving || !credit.isConnected || !wrap.offsetParent || !credit.offsetParent) return;   // (not shown: an iPhone slide carries it in the teaching card)
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
    const wm = document.getElementById('world')?.getScreenCTM(), wk = (wm ? [wm.a, wm.d, wm.e, wm.f].map((v) => v.toFixed(2)).join(',') : '') + (ring ? '|' + ring.flat().map(Math.round).join(',') : '');
    if (wk !== worldKey) { worldKey = wk; worldAt = performance.now(); }
    // (The first placement waits for the camera too: a look taken mid-move had put it at the bottom on one load and the top on the next.)
    if (performance.now() - worldAt < 250) { clearTimeout(camT); camT = setTimeout(soon, 260); return; }
    const wr = wrap.getBoundingClientRect();
    let { w, h } = measure(false);
    const fig = { l: size.sl, t: 0, r: wr.width - size.sr, b: wr.height - Math.max(0, size.sb - Math.max(0, innerHeight - wr.bottom)) };   // (the home indicator's strip, where the figure reaches the screen's bottom)
    const els = [...document.querySelectorAll(OBSTACLES)], obs = [...els.map((el) => rectOf(el, wr)), ...gpuProbe.time(null, 'credit: labels', () => labelRects(wr, wrap, keptStyle))].filter((o) => o && hit(o, fig));
    const busy = obs.some((o) => !o.chrome);
    credit.classList.toggle('busy', busy);
    if (busy) ({ w, h } = measure(true));
    const sig = obs.map((o) => [o.l, o.t, o.r, o.b].map(Math.round).join(',')).join(';') + '|' + w + '|' + wr.width + 'x' + wr.height;
    const now = performance.now();
    // A card still sliding or fading in is not where it will settle: wait for it (and for its size to stop changing).
    // (The card and its blocks only: a live instrument deep inside eases all the time and kept the credit hidden.)
    const settling = gpuProbe.time(null, 'credit: card motion', () => els.some((el) => [el, ...el.children].some((c) => c.getAnimations().some((an) => an.playState === 'running' && Number.isFinite(an.effect?.getComputedTiming().endTime)))));
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
    const shade = document.querySelector('.pz-shade'), sr = shade && getComputedStyle(shade).opacity !== '0' ? shade.getBoundingClientRect() : null;
    // Nothing it looks at changed since a look that left it in place (the same cards, labels, camera, size and slide layout):
    // that look's answer holds, so the spot search over the art is not run again. (The poll and every transition ended
    // re-ran it, about 7% of a slowed phone's time on a slide sitting still.) The corners it found covered stay covered.
    const look = `${sig}|${wk}|${busy}|${sr ? Math.round(sr.left) : ''}|${!!(app?.classList.contains('presenting') && document.querySelector('.pz:not(.stack)'))}|${credit.className}`;
    if (look === kept && !settling) { for (const k of keptBlocked) blocked[k] = now; return; }
    kept = '';
    const opt = { gap: wr.width < 768 ? 12 : 24, inset: sr?.width ? Math.max(12, Math.round(sr.left - wr.left - fig.l)) : wr.width < 768 ? 12 : 24 };   // (a clear gap from every card: 24 px on a laptop or tablet)
    const art = gpuProbe.time(null, 'credit: art grid', () => organTest(wr, ring));
    // It holds its spot while that spot stays good: inside the figure, clear of every card and label by the gap, and as clear of the
    // art as when it was chosen. A better spot freeing up is no reason to move (a label's live number changing width beside it
    // had it hop between spots every few seconds; Circuit 7 on a phone). After a slide change or a resize it picks anew.
    if (pos && !fresh && !credit.matches('.moving, .covered')) {
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
    clearTimeout(moveT);
    moveT = setTimeout(() => { moving = false; if (app?.classList.contains('pz-moving')) return soon(); place(c, p, tight); soon(); }, 80);
  }
  function soon() { if (!raf) raf = nextFrame(check); }
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
  const pollKey = () => `${window.pps?.stage?.labelStamp?.() ?? Math.random()}|${document.querySelectorAll('#labels .lb:not(.lb-off), .cath-labels .cath-label').length}|${innerWidth}x${innerHeight}`;
  setInterval(() => {
    if (document.hidden) return;
    const st = window.pps?.store?.get(), k = pollKey();
    // (Settings › Figure performance › Credit check in talks (frame.js): in Present too, only when one of those may have changed.)
    if (watch.due() || k !== polled || st?.lobule || st?.sinusoid || (app?.classList.contains('presenting') && !figLab('creditLean'))) soon();
    polled = k;
  }, 1000);
  soon();
  return { refresh: soon, corner: () => cur, searches: () => searches };
}
