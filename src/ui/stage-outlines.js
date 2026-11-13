// The organ outlines and warm glow on the GPU, the narrowing and mark fades, the presenter's pinned and spotlit organs, and the slide's figure callouts (calipers, brackets, edge marks).
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { ORGANS, RECTUM_FADE } from './anatomy.js';
import { acrossVessel, spanOf, spanPath, spleenCaliper, zoneBand } from './callout-math.js';
import { caught } from './caught.js';
import { D_FLIP, D_SMALL, easeMove } from './ease.js';
import { bandRing, dashRings, normalShown } from './highlight-math.js';
import { darkMQ } from './look.js';
import { markFade } from './mark-fade.js';
import { reduceMotionMQ as reduceMotion, smooth01 } from './motion.js';
import { restPass } from './rest-pass.js';
import { measurePath } from './shape-gl.js';
import { store } from './store.js';
import { onTheme } from './theme-epoch.js';
import { s } from './util.js';
import { inGrid, ringGrid, warmVisible } from './warm-vis.js';

import { stageScope } from './stage-scope.js';
export function createOutlines(st, live) {
  const { E, MAP, ND_PER, ND_SEG, arcMid, caud, clampW, clampWOut, easeInOut, gFx, gFxC, geo, late, nd, nextFrame, nodeDots, organEls, organG, ov, pointAt, quietFx, readFrame, refreshCTM, resTheme, svg, themeKey, toRGB } = st;
  // The organ outlines (selected, hovered) are drawn on the GPU with the figure, so a drag, pinch
  // or zoom moves them in the same frame (an SVG overlay is composited apart and can trail it).
  // Each one fades in and out; the SVG lines are kept only where the GPU cannot draw them.
  const glLines = !!live.veins?.canLines;
  const OL_LOOK = { sel: [2.6, 0.7], hov: [2, 0.45], pin: [2.6, 0.6], spot: [2.6, 0.6], normal: [1.4, 0.5] };   // as .org-sel-line and .org-hov-line: width, opacity
  // (spot: a slide's spotlit organ, as a pinned one; normal: the normal-sized spleen's thin line inside an enlarged one, V18.)
  // A selected organ is outlined in its own deep tone (--og-<tone>-3, read through the organ's tone class as --o3), not the
  // accent blue, with a soft glow of the same tone easing out from its edge (G20). Hovered, the same tone without the glow.
  const SEL_GLOW = { reach: 12, alpha: 0.22 };
  const orgToneCache = new Map();   // theme key → [light: Map(id → rgb), dark: Map(id → rgb)]
  function orgTone(id) {
    return orgToneCache.get(themeKey())?.[darkMQ.matches ? 1 : 0].get(id) || live.olCol;
  }
  // (Every organ's tone, read as the stage is made and in the theme's observer (never in a frame): a frame takes the one kept.)
  function orgToneRead() {
    const t = themeKey(), dk = darkMQ.matches ? 1 : 0;   // (darkMQ, by its own query: declared further down)
    let by = orgToneCache.get(t);
    if (!by) orgToneCache.set(t, by = [new Map(), new Map()]);
    for (const id of Object.keys(organG)) {
      if (by[dk].has(id)) continue;
      const g = organG[id], v = g && getComputedStyle(g).getPropertyValue('--o3').trim();
      if (v) by[dk].set(id, [...toRGB(v, null)].slice(0, 3));
    }
  }
  orgToneRead();
  // (A new look: the tones are read at once, and the resolution painters are drawn again in the theme epoch's frame, the same as every
  // other surface (theme-epoch.js). A class change on the page alone draws them again in the next frame, as before.)
  new MutationObserver((rs) => { orgToneRead(); if (rs.some((r) => r.attributeName === 'class')) nextFrame(resTheme); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette', 'class'] });
  darkMQ.addEventListener?.('change', orgToneRead);
  onTheme(resTheme);
  const OL_FADE = D_FLIP;   // ms
  // A narrowing's clamp and its "60 %" fade in and out with the narrowing (they had popped): each narrowing's shown amount
  // (0 … 1), stepped in olStep. A narrowing that goes keeps its marks, moved to ov.clampsOut, until they have faded.
  // (The arrows are drawn on the GPU, so their fade is the draw's alpha; the label, and the arrows without the GPU, take opacity.)
  const CLAMP_FADE = D_SMALL;   // ms
  const clampA = new Map();   // id → { a, on }
  const clampFading = () => { for (const c of clampA.values()) if (c.a !== (c.on ? 1 : 0)) return true; return false; };
  const clampEase = (id) => smooth01(clampA.get(id)?.a ?? 1);
  // The marks a treatment leaves (a stent's mesh, a shunt's sutures, the tie on a divided vein, the cross on a closed shunt, the splenic
  // patches, the variceal bands) fade in and out the same way (mark-fade.js): each is a group with data-mk, its key; the GPU draws it
  // at that key's amount (marksBuild tags its draws), the SVG copy takes the amount as the group's opacity. markLast: when it last stepped.
  const markA = markFade();
  // A stent the figure brings in on its own clock (stage-venous.js: the TIPS, a slide's stented vein): its amount set here as it eases, laid on
  // its draws the same way (13 Nov 2026: the amount was the pieces' opacity, which the marks' build reads once, so a stent built while it was
  // still at nothing stayed at nothing on the GPU until something else rebuilt the marks: Mohammad's "the mesh failed to draw").
  const stentAmt = new Map();
  let stentMoved = false;
  const stentFade = (key, a) => { if (a == null) stentAmt.delete(key); else stentAmt.set(key, a); stentMoved = true; live.askAnimate?.(); };
  const fadeEase = (key) => (markA.has(key) ? markA.amount(key) : stentAmt.has(key) ? stentAmt.get(key) : clampEase(key));
  // (The group's opacity, for the SVG copy the browser draws; the GPU's copy takes the amount on the draw, never from the group, or a
  // fade would be read as a new look at each step.)
  const markShade = (el, a) => {
    if (glLines) { if (el.hasAttribute('opacity')) el.removeAttribute('opacity'); return; }
    if (a < 1) el.setAttribute('opacity', a.toFixed(3)); else if (el.hasAttribute('opacity')) el.removeAttribute('opacity');
  };
  function clampShade(id) {
    const e = clampEase(id), op = e < 1 ? e.toFixed(3) : '';
    for (const g of [ov.clamps, ov.clampsOut, clampW, clampWOut]) for (const el of g.querySelectorAll(`[data-id="${id}"]`)) if (el._c || !glLines) el.style.opacity = op;
  }
  // The heart a slide points at (the right atrium, the heart itself) is lit whole by a soft glow, not a line: one band
  // easing out from its edge (the GPU shades the falloff smoothly, behind the organs): reach in world units, peak opacity.
  const HEART_GLOW = { reach: 46, alpha: 0.34 };
  // A tube (the bowel, colon, duodenum: a stroke along a centre line) is outlined along both its edges (bandRing), at the
  // width its edge is stroked. bare: the organ's own path at its normal size, not as the figure now scales it (the normal
  // spleen, V18).
  const BAND_IDS = new Set(ORGANS.filter((o) => o.band).map((o) => o.id));
  // An organ with a drawn outline of its own (ORGANS ring: the colon as it shows, the transverse colon over the limbs behind)
  // is outlined along it; the small bowel's path is already its outline, the whole pile as one.
  const RING_OF = Object.fromEntries(ORGANS.filter((o) => typeof o.ring === 'string').map((o) => [o.id, o.ring]));
  const bandEdgeW = new Map();
  function bandEdgeRead() {
    for (const id of BAND_IDS) { const edge = organG[id]?.querySelector('.band-edge'); if (edge) bandEdgeW.set(id, parseFloat(getComputedStyle(edge).strokeWidth) || 0); }
  }
  bandEdgeRead();
readFrame(bandEdgeRead);   // (as made, and again in the first frame, once the styles surely apply)
  const ORGAN_DEF = new Map();   // (each organ's definition by its id, the first of that id, as ORGANS.find gave it)
  for (const o of ORGANS) if (!ORGAN_DEF.has(o.id)) ORGAN_DEF.set(o.id, o);
  function olRings(id, bare = false) {
    const rings = olRingsRaw(id, bare);   // (a list made for this call: the tube's rings are replaced in it, not copied)
    if (BAND_IDS.has(id) && !RING_OF[id]) {
      const o = ORGAN_DEF.get(id), edge = organG[id].querySelector('.band-edge');
      const w = o.ringW || (edge ? bandEdgeW.get(id) || 0 : 0);   // (read as the stage is made: bandEdgeRead)
      if (w > 0) {
        let n = 0;
        for (let i = 0; i < rings.length; i++) { const b = bandRing(rings[i], w / 2); if (b.length) rings[n++] = b; }
        rings.length = n;
      }
    }
    return rings;
  }
  // A group's transform as one matrix, read without consolidate() (which rewrites the attribute as a matrix(), and the group's own
  // writer puts translate() back, so the outline keys would change at every build).
  const gMatrix = (g) => { const l = g.transform.baseVal; let m = null; for (let i = 0; i < l.numberOfItems; i++) { const t = l.getItem(i).matrix; m = m ? m.multiply(t) : t; } return m; };
  // An outline's points in its own coordinates, every `stride` along it, kept by its path (bounded: an easing liver's outline is
  // new on every frame). Measured piece by piece (path-pieces.js): getPointAtLength along the whole path walks it from its start
  // on every call, and the first Doppler probe read every organ so (the colon's 608 pieces at 1752 points), a second or two
  // with the page held as a monitor first opened (Mohammad, 22 Oct). The same points, measured once per path.
  const olLocalMemo = new Map([[2, new Map()], [6, new Map()]]);   // (by stride, then by path: the strides olRingsRaw is asked for)
  function olLocal(src, stride) {
    const memo = olLocalMemo.get(stride);
    let r = memo.get(src);
    if (r) return r;
    // (2 Nov 2026: measured in script (shape-gl.js measurePath), with no element and no layout: the probe's and the warm outlines'
    // frames read the page here.)
    const mp = measurePath(src);
    if (!(mp.L > 0)) return null;
    const L = mp.L, n = Math.max(48, Math.ceil(L / stride)), step = L / n, pts = [];
    for (let i = 0; i <= n; i++) pts.push(mp.at(i * step));
    r = { step, pts };
    if (memo.size >= 48) memo.delete(memo.keys().next().value);
    memo.set(src, r);
    return r;
  }
  function olRingsRaw(id, bare, d = null, stride = 2) {
    const m = bare ? null : gMatrix(organG[id]);
    const loc = olLocal(d || RING_OF[id] || organEls[id].getAttribute('d'), stride);
    if (!loc) return [];
    const { step } = loc, rings = [];
    let cur = [], prev = null;
    for (const [qx, qy] of loc.pts) {
      const p = m ? [m.a * qx + m.c * qy + m.e, m.b * qx + m.d * qy + m.f] : [qx, qy];
      if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) > step * 4 * (m ? Math.hypot(m.a, m.b) : 1)) { if (cur.length > 1) rings.push(cur); cur = []; }   // a new subpath
      cur.push(p); prev = p;
    }
    if (cur.length > 1) rings.push(cur);
    return rings;
  }
  const olKey = (id) => organEls[id].getAttribute('d') + '|' + (organG[id].getAttribute('transform') || '');
  // The small bowel's loops as they are drawn now: the centre line of each tube of its pile (the deep-tone stroke under the loops,
  // .ob-deep in organ-art.js), read from the live drawing, so a pile that is reshaped is followed without a copy of its path here.
  // A warm layer (see WARM) is a soft glow along both edges of each tube, on the organs and under the vessels: the loops' outlines
  // glow, the tubes' insides stay as drawn.
  // The tubes are plain polylines: their points are read from the path's own text once (cached by it), every other point, and each
  // build is only the group's transform over them (no path measuring: the ascites moves the bowel, and each move builds again).
  const GLOW_SPAN = 4;   // (points either side an outline's glow takes its direction from: the rings are read every 2 units)
  const WARM = { reach: 10, alpha: 0.46, taper: 20 };   // (how far the glow runs out from a tube's edge, in world units (under the tube's own half width, so a tube's middle stays clear), and its strength on the edge)
  const warmEls = new Map(), warmEdges = new Map(), warmPts = new Map();   // (the drawing's tubes, found again if the pile is redrawn: the key below is read every frame)
  // (the first and last of the drawing's pieces stand for them all: a redrawn pile replaces the lot; an empty list is looked for again)
  const warmGone = (l) => !l || !l.length || !l[0].isConnected || !l[l.length - 1].isConnected;
  const warmTubes = (id) => {
    let t = warmEls.get(id), e = warmEdges.get(id);
    if (warmGone(t) || warmGone(e)) {
      t = [...organG[id].querySelectorAll('.ob-deep')]; warmEls.set(id, t);
      warmEdges.set(id, [...organG[id].querySelectorAll('.ob-edge')]);
    }
    return t;
  };
  // (How many of the tubes have a path.)
  function warmDCount(id) { const t = warmTubes(id); let n = 0; for (let i = 0; i < t.length; i++) if (t[i].getAttribute('d')) n++; return n; }
  function warmLines(d) {
    let r = warmPts.get(d);
    if (!r) {
      // (Only M and L: a path with curves in it is measured along instead.)
      r = /^[ML\d.,\s-]+$/.test(d)
        ? d.split('M').filter(Boolean).map((c) => { const n = c.match(/-?\d*\.?\d+/g).map(Number), pts = []; for (let i = 0; i + 1 < n.length; i += 4) pts.push([n[i], n[i + 1]]); if (n.length >= 4 && (n.length / 2 - 1) % 2) pts.push([n[n.length - 2], n[n.length - 1]]); return pts; })
        : null;
      warmPts.set(d, r);
    }
    return r;
  }
  // (the tubes' lines in the drawing's own coordinates, in drawing order)
  // (Read at once by its callers, warmRings and warmVis, and never kept: one list, written over.)
  const warmLocalBuf = [];
  function warmLocal(id) {
    const t = warmTubes(id), out = warmLocalBuf;
    out.length = 0;
    for (let i = 0; i < t.length; i++) {
      const d = t[i].getAttribute('d');
      if (!d) continue;
      const lines = warmLines(d) || olRingsRaw(id, true, d, 6);
      for (let j = 0; j < lines.length; j++) if (lines[j].length > 1) out.push(lines[j]);
    }
    return out;
  }
  function warmRings(id) {
    const m = gMatrix(organG[id]);
    return warmLocal(id).map((r) => (m ? r.map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]) : r));
  }
  // Which of the loops' edges can be seen (warm-vis.js): not under a loop drawn over it, and inside the organ's own outline (the
  // glow is not clipped as the drawing is). Per tube and point, side -1 then 1; worked out once per drawing (its key below).
  const warmSeen = new Map();   // id → { sig, has, vis }: made for each organ as the stage is, and written over (no record made in a frame)
  // A key as a list of parts, written (store) or compared (not) by one walk over the same parts, so no string is made to tell whether a
  // drawing moved (rev 2 §2.8): wsPart for a number or a string, wsTail for a path (its length and its last 30 characters, as before).
  let wsSnap = null, wsI = 0, wsOk = true, wsStore = false;
  function wsTail(d) {
    if (wsStore) { wsSnap.push(d); return; }
    const prev = wsSnap[wsI++], n = d.length;
    if (typeof prev !== 'string' || prev.length !== n) { wsOk = false; return; }
    for (let q = 1; q <= 30 && q <= n; q++) if (d.charCodeAt(n - q) !== prev.charCodeAt(n - q)) { wsOk = false; return; }
  }
  function wsPart(v) { if (wsStore) wsSnap.push(v); else if (wsSnap[wsI++] !== v) wsOk = false; }
  // Whether the parts that walk gives are those in snap (when it has been written); if not, snap is written with them, and false is returned.
  function wsSame(snap, has, walk, id, a, b) {
    if (has) {
      wsSnap = snap; wsStore = false; wsI = 0; wsOk = true;
      walk(id, a, b);
      if (wsOk && wsI === snap.length) return true;
    }
    snap.length = 0; wsSnap = snap; wsStore = true;
    walk(id, a, b);
    return false;
  }
  function warmDWalk(id) { const t = warmTubes(id); for (let i = 0; i < t.length; i++) { const d = t[i].getAttribute('d'); if (d) wsTail(d); } }
  function warmVisWalk(id, r, dl) { warmDWalk(id); wsPart(r); wsPart(dl); }
  let warmGrid = null;
  const warmInside = (x, y) => inGrid(warmGrid, x, y);
  const warmOpts = { inside: null };
  function warmVis(id) {
    const c = warmSeen.get(id), r = warmR(id);
    if (!wsSame(c.sig, c.has, warmVisWalk, id, r, (organEls[id].getAttribute('d') || '').length)) {
      c.has = true;
      const g = ringGrid(olRingsRaw(id, true));
      warmGrid = g; warmOpts.inside = g ? warmInside : null;
      c.vis = warmVisible(warmLocal(id), r, warmOpts);
    }
    return c.vis;
  }
  // A tube's radius, from the drawing's own pieces (each .ob-edge is stroked 2r wide): the middle one, read again when the
  // deep-toned bed under the tubes (stroked wider as the tubes are) changes, so a refitted pile is followed.
  const warmRad = new Map();   // id → { sw, has, r }
  const warmWBuf = [], numAsc = (u, v) => u - v;
  // (its signature: the bed's stroke widths and a few of the pieces' own, cheap enough to read every frame)
  function warmSwWalk(id) {
    const t = warmTubes(id), e = warmEdges.get(id);
    wsPart(t.length);
    for (let i = 0; i < t.length; i++) wsPart(t[i].getAttribute('stroke-width'));
    wsPart(e.length); wsPart(e[0]?.getAttribute('stroke-width')); wsPart(e[e.length >> 1]?.getAttribute('stroke-width')); wsPart(e[e.length - 1]?.getAttribute('stroke-width'));
  }
  function warmR(id) {
    const c = warmRad.get(id);
    if (!wsSame(c.sw, c.has, warmSwWalk, id)) {
      c.has = true;
      // (A drawing that leaves out its hidden pieces names the middle width of all of them: scripts/organ-art.mjs cullHidden.)
      const named = +organG[id].querySelector('[data-edge-w]')?.dataset.edgeW;
      const edges = warmEdges.get(id), w = warmWBuf;
      w.length = 0;
      for (let i = 0; i < edges.length; i++) { const v = +edges[i].getAttribute('stroke-width'); if (v > 0) w.push(v); }
      w.sort(numAsc);
      c.r = named > 0 ? named / 2 : w.length ? w[w.length >> 1] / 2 : 12.5;
    }
    return c.r;
  }
  for (const id of new Set([...Object.keys(organG), ...Object.keys(organEls)])) { warmSeen.set(id, { sig: [], has: false, vis: null }); warmRad.set(id, { sw: [], has: false, r: 0 }); }
  // The colon's drawn outline (its limbs, closed), from the ring's own text once: the glow is left off where the colon lies over the pile.
  // (As a coarse grid in the colon's own coordinates, filled once by scanlines: a point is then one transform and one look-up,
  // where testing it against the ring made each build cost ten times more, and builds run every frame while the ascites eases.)
  const COLON_CELL = 3;
  let colonMask = null;
  const colonXs = [];   // (one scanline's crossings, written over)
  function colonGrid() {
    if (colonMask) return colonMask;
    const rings = (RING_OF.colon || '').split('M').filter(Boolean).map((c) => { const n = c.match(/-?\d*\.?\d+/g).map(Number), r = []; for (let i = 0; i + 1 < n.length; i += 2) r.push([n[i], n[i + 1]]); return r; });
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rings) for (const q of r) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    const w = Math.ceil((x1 - x0) / COLON_CELL) + 1, h = Math.ceil((y1 - y0) / COLON_CELL) + 1;
    const bits = new Uint8Array(w * h);
    for (const r of rings) for (let j = 0; j < h; j++) {
      const y = y0 + (j + 0.5) * COLON_CELL, xs = colonXs;
      xs.length = 0;
      for (let i = 0, k = r.length - 1; i < r.length; k = i++) if ((r[i][1] > y) !== (r[k][1] > y)) xs.push(r[i][0] + (y - r[i][1]) * (r[k][0] - r[i][0]) / (r[k][1] - r[i][1]));
      xs.sort(numAsc);
      for (let m = 0; m + 1 < xs.length; m += 2) for (let i = Math.max(0, Math.ceil((xs[m] - x0) / COLON_CELL - 0.5)); i <= Math.min(w - 1, Math.floor((xs[m + 1] - x0) / COLON_CELL - 0.5)); i++) bits[j * w + i] = 1;
    }
    return (colonMask = { x0, y0, w, h, bits });
  }
  try { colonGrid(); } catch (e) { caught('stage:colon', e); /* the glow is not cut where the colon lies over it */ }   // (made as the stage is, once: a frame only reads colonMask)
  (typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 5000 }) : (f) => stageScope.timer(f, 3000))(() => { try { if (organG.bowel && warmDCount('bowel')) warmVis('bowel'); } catch (e) { caught('stage:6172', e); /* each is made when a glow first needs it */ } });   // (made while idle, so a slide's start does not pay for them)
  // A warm outline's source as parts (the organ's path and transform, the colon's transform, the bed's and pieces' widths, the tubes' paths):
  // told apart each frame with no string made (ol.sig is written when it moves).
  function warmKeyWalk(id) {
    wsPart(organEls[id].getAttribute('d')); wsPart(organG[id].getAttribute('transform') || ''); wsPart(organG.colon?.getAttribute('transform') || '');
    warmSwWalk(id); warmDWalk(id);
  }
  function warmSnap(id) { const a = []; wsSame(a, false, warmKeyWalk, id); return a; }
  // The other outlines: the organ's path and transform, as they were when it was last laid out.
  function olSame(o) {
    const d = organEls[o.id].getAttribute('d'), t = organG[o.id].getAttribute('transform') || '';
    if (d === o.kd && t === o.kt) return true;
    o.kd = d; o.kt = t;
    return false;
  }
  const olRingsOf = (o) => (o.kind === 'warm' ? warmRings(o.id) : olRings(o.id));
  function olSet(kind, id) {
    for (const o of live.olList) if (o.kind === kind && o.id !== id) o.on = false;
    if (id && organEls[id]?.getAttribute('d')) {
      let found = false;
      for (let i = 0; i < live.olList.length; i++) { const o = live.olList[i]; if (o.kind === kind && o.id === id) { o.on = true; found = true; break; } }
      if (!found) live.olList.push({ kind, id, kd: organEls[id].getAttribute('d'), kt: organG[id].getAttribute('transform') || '', rings: olRings(id), a: 0, on: true });
    }
    live.olDirty = true; live.olLast = performance.now();
  }
  // A presenter slide's organs, outlined and held (several at once): eased in and out like the hover outline.
  // Each in its station's colour ([{ id, tone }], --tr-<tone>).
  // The right atrium's slides light the whole heart (the atrium is one chamber of it), so both ids come to 'heart'.
  // (An item may also ask for the soft glow the heart gets, glow: true, and its own fade in ms, fade: a meal's gut glow swells and
  // eases off over a second or more, where an outline's own fade is 160 ms. glowOrgans adds such items to the slide's pins.)
  const PIN_ID = (id) => (id === 'heart-ra' ? 'heart' : id);
  let pinList = [];
  function pinOrgans(list, more) {
    if (!more) pinList = list || [];
    const items = [...pinList, ...(more || [])].map((o) => (typeof o === 'string' ? { id: o } : o)).map((o) => ({ id: PIN_ID(o.id), tone: o.tone || null, glow: !!o.glow, warm: !!o.warm, fade: o.fade || 0 }));
    const ids = items.map((o) => o.id);
    live.caudPin = ids.includes('caudate') || ids.includes('caudate-lobe');   // (the circuit's caudate lane follows it: stage-frame.js edgeVisible)
    caud.show(live.caudPin, ids.includes('caudate'));   // (only a slide about the caudate draws it: the lobe with its veins, or the lobe alone)
    const want = new Map(items.filter((o) => organEls[o.id]).map((o) => [o.id, o]));
    const cs = getComputedStyle(svg), col = (tone) => (tone ? [...toRGB(`var(${tone.startsWith('--') ? tone : `--tr-${tone}`})`, cs)].slice(0, 3) : null);
    for (const o of live.olList) if (o.kind === 'pin' && !want.has(o.id)) o.on = false;   // (it keeps its own fade on the way out)
    for (const [id, it] of want) {
      const o = live.olList.find((x) => x.kind === 'pin' && x.id === id);
      if (o) { o.on = true; o.col = col(it.tone); o.glow = id === 'heart' || it.glow; o.fade = it.fade; } else if (organEls[id].getAttribute('d')) live.olList.push({ kind: 'pin', id, kd: organEls[id].getAttribute('d'), kt: organG[id].getAttribute('transform') || '', rings: olRings(id), a: 0, on: true, col: col(it.tone), glow: id === 'heart' || it.glow, fade: it.fade });
    }
    // (warm: the organ's loops glow along their edges, beside its outline's glow: the bowel's pile, eased with the same fade.)
    const warm = new Map(items.filter((o) => glLines && o.warm && organEls[o.id]?.getAttribute('d') && warmDCount(o.id)).map((o) => [o.id, o]));
    for (const o of live.olList) if (o.kind === 'warm' && !warm.has(o.id)) o.on = false;
    for (const [id, it] of warm) {
      const o = live.olList.find((x) => x.kind === 'warm' && x.id === id);
      if (o) { o.on = true; o.col = col(it.tone); o.fade = it.fade; } else live.olList.push({ kind: 'warm', id, sig: warmSnap(id), runs: [], rings: warmRings(id), a: 0, on: true, col: col(it.tone), fade: it.fade });
    }
    live.olDirty = true; live.olLast = performance.now();
  }
  // A slide's spotlit organs (V2), outlined beside its pins; an organ the slide already pins keeps that one line.
  function spotOrgans(list) {
    const cs = getComputedStyle(svg), col = (tone) => (tone ? [...toRGB(`var(${tone.startsWith('--') ? tone : `--tr-${tone}`})`, cs)].slice(0, 3) : null);
    const want = new Map((list || []).filter((o) => organEls[o.id]?.getAttribute('d') && !live.olList.some((x) => x.kind === 'pin' && x.on && x.id === o.id)).map((o) => [o.id, o.tone]));
    for (const o of live.olList) if (o.kind === 'spot' && !want.has(o.id)) o.on = false;
    for (const [id, tone] of want) {
      const o = live.olList.find((x) => x.kind === 'spot' && x.id === id);
      if (o) { o.on = true; o.col = col(tone); } else live.olList.push({ kind: 'spot', id, kd: organEls[id].getAttribute('d'), kt: organG[id].getAttribute('transform') || '', rings: olRings(id), a: 0, on: true, col: col(tone) });
    }
    live.olDirty = true; live.olLast = performance.now(); live.stageWake();
  }
  // The normal spleen's outline (V18): wanted by a slide, shown while the spleen is enlarged (normalSync, each frame the spleen
  // is drawn), in the spleen's own deep tone. It keeps the organ's normal size and place as the spleen grows round it.
  // Dashed (on, off in world units), so it reads as where the spleen would be and not as a second organ.
  const normal = { want: false, shown: false, sc: 1 };
  const NORMAL_DASH = [7, 5];
  const normalOl = { kind: 'normal', id: 'spleen', rings: null, a: 0, on: false, col: null, verts: null };
  function normalSync(sc = normal.sc) {
    normal.sc = sc;
    const p = store.get().params;
    const on = normal.want && !!organEls.spleen && p?.splenicRx !== 2 && easeInOut(live.morph) < 0.5 && normalShown(sc, normal.shown);
    if (on === normal.shown) return;
    normal.shown = on;
    let o = null;
    for (let i = 0; i < live.olList.length; i++) if (live.olList[i].kind === 'normal') { o = live.olList[i]; break; }
    if (o) o.on = on;
    else if (on) {
      const n = normalOl;   // (the one record, made ahead: a spleen outline that comes back is this one set afresh)
      n.rings = dashRings(olRings('spleen', true), NORMAL_DASH[0], NORMAL_DASH[1]); n.a = 0; n.on = true; n.col = orgTone('spleen'); n.verts = null;
      live.olList.push(n);
    }
    live.olDirty = true; live.olLast = performance.now(); live.stageWake();
  }
  const fxWide = new Map(), fxBuild = new Map(), fxEls = new Map();
  // A slide's spleen caliper comes whole, in one reveal: while the patient is still morphing to the slide's state (the spleen grows or
  // shrinks to its length, a second or so) a caliper not yet drawn waits, and neither its line nor its reading is made; the frame
  // the morph ends makes both at the landed length. (Mohammad, 11 Nov 2026: "when the spleen caliper appears it only half appears then
  // it shows up fully": it was made at the spleen's size mid-way and grew with it.) One already drawn keeps following the spleen,
  // as a time-lapse's does.
  const capShown = new Set();   // (the caliper ids drawn since the slide's callouts were set)
  let capWas = false;   // (a caliper was waiting at the last frame)
  const capHolds = (c, f) => !!f.morphing && !capShown.has(c.id);
  function setCallouts(sp) {
    const sig = sp ? JSON.stringify([Object.keys(sp.live || {}), (sp.organs || []).map((o) => o.organ + o.kind), (sp.calipers || []).map((c) => c.id), sp.steps, (sp.spans || []).map((x) => x.from + x.to), sp.zone, !!sp.heart]) : '';
    if (!sp || sig !== live.fxSig) { capShown.clear(); capWas = false; fxWide.clear(); for (const [k, b] of live.pool) if (k.startsWith('fxs:')) b.fxIn = false; }
    live.fx = sp ? { live: {}, organs: [], calipers: [], steps: null, spans: [], zone: -1, ...sp } : null; live.fxSig = sig;
    const band = live.fx && zoneBand(live.fx.zone);
    if (band) { MAP.fxX[0] = band[0]; MAP.fxX[1] = band[1]; }
    if (MAP.fxOn !== !!band) { MAP.fxOn = !!band; live.mapWake = true; }
    live.stageWake();
  }
  // A callout's pill (a mark, a caliper's or a bracket's reading): its words as runs, a value in its rating colour where the pill
  // is plain (tone; on a red or accent pill the words keep the pill's own ink), as wide as its widest words (and never narrower
  // than it has been on this slide). fxw: its words with each value as #, so a number ticking redraws no pill (renderBlock).
  const fxRuns = (runs, tone) => runs.map((r, i) => ({ t: r.t, size: 11.5, weight: r.tone !== undefined ? 750 : 650, cls: r.tone !== undefined ? 'lb-focus fx-v' : 'lb-focus', ...(i ? { gap: r.sp ? 3 : 0 } : {}), ...(tone && r.tone ? { fill: `color-mix(in srgb, var(${r.tone}) 78%, var(--text))` } : {}) }));
  // (split: the words on one line and the reading from its first value on under them, where one line is too wide for its room.)
  function fxPill(key, w, cls, tone, split = false) {
    const cut = split ? w.runs.findIndex((r) => r.tone !== undefined) : -1, two = cut > 0;
    const part = (runs) => (two ? [runs.slice(0, cut), runs.slice(cut)] : [runs]);
    const lines = part(w.runs).map((r) => fxRuns(r, tone)), wide = part(w.wide || w.runs).map((r) => fxRuns(r, tone));
    const wd = Math.max(...lines.map(live.lineW), ...wide.map(live.lineW), fxWide.get(key + (two ? ':2' : '')) || 0);
    fxWide.set(key + (two ? ':2' : ''), wd);
    return { key, cls, lines, align: 'middle', bg: true, padX: 8, padY: 4, w: wd, h: lines.reduce((a, l) => a + live.LINE_H(l), 0), label: w.label, fxw: w.runs.map((r) => (r.tone !== undefined ? '#' : r.t)).join(' ') + (two ? '|2' : '') };
  }
  // The calipers' and brackets' lines, each frame (the spleen grows through a time-lapse, a vessel's width eases): a line that
  // comes eases in, one that goes eases out (app.css, Package F).
  // (A new line takes one made ahead, between frames: a frame makes none (2 Nov 2026, "Move everything to GPU"). With none left, it comes
  // in the frame after the spares are made again.)
  const fxSpare = [], FX_SPARE = 6;
  let fxFill = 0;
  // (Each spare carries the calls its life asks for, made with it ahead: fxOn1 starts the fade in two frames on, fxGone takes it away under its key.)
  function fxTop() {
    fxFill = 0;
    while (fxSpare.length < FX_SPARE) {
      const el = s('g', {}, s('path', { class: 'fx-halo' }), s('path', { class: 'fx-ink' }));
      el.fxKey = '';
      el.fxOn2 = () => el.classList.add('on');
      el.fxOn1 = () => nextFrame(el.fxOn2);
      el.fxGone = () => { el.remove(); if (fxEls.get(el.fxKey) === el) fxEls.delete(el.fxKey); };
      fxSpare.push(el);
    }
  }
  fxTop();
  function fxLine(key, parent, d, cls) {
    let el = fxEls.get(key);
    if (!el) {
      el = fxSpare.pop();
      if (fxSpare.length < FX_SPARE / 2 && !fxFill) fxFill = restPass(fxTop);
      if (!el) return;
      el.setAttribute('class', cls);
      el.fxKey = key;
      late('add', parent, el); fxEls.set(key, el);
      if (!reduceMotion.matches) nextFrame(el.fxOn1); else el.classList.add('on');
    }
    el.seen = true;
    if (el._d !== d) { el._d = d; for (const p of el.children) p.setAttribute('d', d); }
  }
  // (Screen pixels per world unit now: lines that keep a size on screen are drawn in world units from it.)
  const fxK = () => { if (!live.CTM) refreshCTM(); return live.CTM?.sc || 1; };
  // (A caliper's ends and its segments: kept and written over, read at once by every caller.)
  const capG = { a: null, b: null }, capS = { a: null, b: null, segs: [[null, null], [[0, 0], [0, 0]], [[0, 0], [0, 0]]] };
  function caliperAt(c, f) {
    if (c.organ) {
      const p = f.viewParams || store.get().params;
      if (p?.splenicRx === 2 || !organEls.spleen || capHolds(c, f)) return null;
      const [a, b] = spleenCaliper((f.slow?.spleen ?? 11) / 11);
      capG.a = a; capG.b = b;
      capShown.add(c.id);
      return capG;
    }
    const x = E[c.edge], cur = geo[c.edge]?.cur;
    if (!x?.vis || x.ghost || !(cur?.length > 1)) return null;
    // (Wall to wall and a little past, and never shorter than 30 px on screen, so a narrow stent on a phone still reads as a caliper.)
    // (A varix at its middle, where the tile measures it; any other vessel a third along, off its station's dot at the middle.)
    const [wx, wy, tx, ty] = c.key === 'varix' ? arcMid(cur) : pointAt(cur, 0.32), [a, b] = acrossVessel(wx, wy, tx, ty, Math.max((x.width || 4) / 2 + 3, 15 / fxK()));
    capG.a = a; capG.b = b;
    return capG;
  }
  // A caliper's line and its end ticks (5 px either side, square to it), in world units.
  function caliperSegs(c, f) {
    const g = caliperAt(c, f);
    if (!g) return null;
    const A = g.a, B = g.b, ax = A[0], ay = A[1], bx = B[0], by = B[1], L = Math.hypot(bx - ax, by - ay) || 1, tk = 5 / fxK(), nx = (-(by - ay) / L) * tk, ny = ((bx - ax) / L) * tk;
    const sg = capS.segs, t1 = sg[1], t2 = sg[2];
    capS.a = A; capS.b = B;
    sg[0][0] = A; sg[0][1] = B;
    t1[0][0] = ax - nx; t1[0][1] = ay - ny; t1[1][0] = ax + nx; t1[1][1] = ay + ny;
    t2[0][0] = bx - nx; t2[0][1] = by - ny; t2[1][0] = bx + nx; t2[1][1] = by + ny;
    return capS;
  }
  function fxSync(f, t) {
    for (const el of fxEls.values()) el.seen = false;
    // (A caliper that waited for the morph is let in: the labels are solved again for its reading, which a changed `live.fx` asks for.)
    let capWait = false;
    if (live.fx) for (const c of live.fx.calipers) if (c.organ && capHolds(c, f)) capWait = true;
    if (capWas && !capWait && live.fx) { live.fx = { ...live.fx }; live.stageWake(); }   // alloc-rare: once, as a held caliper is let in
    capWas = capWait;
    if (live.fx && t < 0.5) for (const c of live.fx.calipers) {
      const g = caliperSegs(c, f);
      if (!g) continue;
      const P = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`;
      fxLine('c:' + c.id, gFx, g.segs.map(([p, q]) => `M${P(p)}L${P(q)}`).join(''), 'fx-cal-line');
    }
    if (live.fx) for (const sp of live.fx.spans) { const at = spanOf(sp.from, sp.to, fxK()); if (at) fxLine(`s:${sp.from}:${sp.to}`, gFxC, spanPath(at), 'fx-span-line'); }
    for (const el of fxEls.values()) {
      if (el.seen || el.going) continue;
      el.going = true; el.classList.remove('on');
      stageScope.timer(el.fxGone, reduceMotion.matches ? 0 : 420);
    }
    for (const [k, el] of fxEls) if (el.seen && el.going) { fxEls.delete(k); }   // (a line gone and wanted again starts afresh)
    if (t !== fxOpT) { fxOpT = t; gFx.style.opacity = t > 0 ? 1 - t : ''; }   // (written when it moves: nothing else sets it)
  }
  let fxOpT = 0;
  // The organ was redrawn (a reshaped liver, a larger spleen): the outlines follow it.
  function olGeom() {
    for (const o of live.olList) { if (o.kind === 'normal') continue; if (!(o.kind === 'warm' ? wsSame(o.sig, true, warmKeyWalk, o.id) : olSame(o))) { o.rings = olRingsOf(o); o.verts = null; live.olDirty = true; } }
  }
  // (Whether any outline is still fading in or out: a loop over the list, no closure made a frame, rev 2 §2.8.)
  function olFading() { for (let i = 0; i < live.olList.length; i++) { const o = live.olList[i]; if (o.a !== (o.on ? 1 : 0)) return true; } return false; }
  // Eases each outline toward shown or gone and hands them to the GPU; true while anything is changing.
  // (Rev 2 §2.8, no record made in a frame: the draws of a frame are written over a kept pool, the list and the two specs handed to the GPU are
  // kept, and the glow's build works in kept lists. The GPU keeps the list it was given until the next, which is written whole before it is.)
  const PASS_HEART = [[true, HEART_GLOW.reach, HEART_GLOW.alpha]];
  const PASS_SEL = [[true, SEL_GLOW.reach, SEL_GLOW.alpha], [false, ...OL_LOOK.sel]];
  const PASS_LINE = {};
  for (const k of Object.keys(OL_LOOK)) PASS_LINE[k] = [[false, ...OL_LOOK[k]]];
  const olDrawPool = [], olFadePool = [], olSpecList = [], olVBuf = [];
  const olSpecs = [{ verts: null, draws: olSpecList, rev: 0 }, { verts: null, draws: olSpecList, rev: 0 }];
  const ndSpecs = [];   // (each station dot's disc and ring draws, in order)
  for (let i = 0; i < nodeDots.length; i++) ndSpecs.push({ first: 0, count: 3 * ND_SEG, col: null, alpha: 0, tri: true }, { first: 0, count: 2 * (ND_SEG + 1), col: null, alpha: 0 });
  let olDrawN = 0, olFadeN = 0, olSpecI = 0;
  function olDraw(first, count, col, alpha, soft, warm) {
    let d = olDrawPool[olDrawN++];
    if (!d) olDrawPool.push(d = { first: 0, count: 0, col: null, alpha: 0, soft: undefined, warm: undefined, under: undefined, endFade: 0 });
    // (An organ's line, a hard draw that is neither a glow nor the warm glow, is laid under the vessels: the vessels that cross an organ's
    // edge cover its outline. Mohammad, 11 Nov 2026: "the liver outline should be below the vessels. That reads better.")
    d.first = first; d.count = count; d.col = col; d.alpha = alpha; d.soft = soft; d.warm = warm; d.under = !soft && !warm ? true : undefined; d.endFade = RECTUM_FADE;
    return d;
  }
  // A mark's draw at its fade's amount (a copy: the mark's own keeps its full alpha).
  function olFaded(d) {
    let c = olFadePool[olFadeN++];
    if (!c) olFadePool.push(c = { first: 0, count: 0, col: null, alpha: 0, tri: undefined, fade: undefined });
    c.first = d.first; c.count = d.count; c.col = d.col; c.alpha = d.alpha * fadeEase(d.fade); c.tri = d.tri; c.fade = d.fade;
    return c;
  }
  const markShadeEach = (key, el, a) => markShade(el, a);
  // The warm glow's build, one tube's ring and one side at a time: the ring's points (wmRing), their directions (wmTg: x, y for each),
  // the bend's radius (wmR) and the side it turns to (wmCs), and the run being laid (wmRun: five numbers a point). wmAtV is the glow at a
  // point, and wmAtOk whether it is shown. All kept, written over.
  let wmV = null, wmRing = null, wmVis = null, wmRad = 1, wmSide = 1, wmReachMax = 0, wmGrid = null, wmInv = null, wmAtOk = false;
  const wmTg = [], wmR = [], wmCs = [], wmRun = [], wmDist = [], wmAtV = [0, 0, 0, 0, 0];
  function wmUnder(x, y) {
    const grid = wmGrid, inv = wmInv;
    if (!grid) return false;
    const lx = inv ? inv.a * x + inv.c * y + inv.e : x, ly = inv ? inv.b * x + inv.d * y + inv.f : y, i = Math.floor((lx - grid.x0) / COLON_CELL), j = Math.floor((ly - grid.y0) / COLON_CELL);
    return i >= 0 && j >= 0 && i < grid.w && j < grid.h && grid.bits[j * grid.w + i] === 1;
  }
  // A run is held until it ends, then laid down fading out to nothing over its first and last WARM.taper units of length (a
  // blunt start or stop would read as a cut). It goes by length, not by points, so a run's profile stays steady as the
  // colon's cut or a bend moves it by a point. The fade rides in the width (64 x its 63 steps + the width; see LINE_VS).
  function wmEnd(o) {
    const run = wmRun, len = run.length / 5, V = wmV;
    if (len > 1) {
      const dist = wmDist;
      dist.length = 0; dist.push(0);
      for (let k = 1; k < len; k++) dist.push(dist[k - 1] + Math.hypot(run[5 * k] - run[5 * k - 5], run[5 * k + 1] - run[5 * k - 4]));
      const L = dist[len - 1];
      for (let k = 0; k < len; k++) {
        const ex = run[5 * k], ey = run[5 * k + 1], tx = run[5 * k + 2], ty = run[5 * k + 3], reach = run[5 * k + 4];
        const f = Math.min(1, Math.min(dist[k], L - dist[k]) / WARM.taper), e = f * f * (3 - 2 * f), w = reach * (0.5 + 0.5 * e) + 64 * Math.round(e * 63);
        V.push(ex, ey, -ty, tx, 0, w, ex, ey, -ty, tx, wmSide, w);
      }
      o.runs.push(len * 2);
    }
    run.length = 0;
  }
  // The glow at a point along the line, between points i0 and i1 (t from 0 to 1): its place, its direction and its reach (wmAtV),
  // and whether it is shown (wmAtOk: the colon is not over it and the reach is room enough).
  function wmPoint(i0, i1, t) {
    const r = wmRing, tg = wmTg, a = r[i0], b = r[i1], rad = wmRad, side = wmSide;
    let tx = tg[2 * i0] * (1 - t) + tg[2 * i1] * t, ty = tg[2 * i0 + 1] * (1 - t) + tg[2 * i1 + 1] * t; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const Rv = 1 / Math.max((1 - t) / wmR[i0] + t / wmR[i1], 1e-9);
    const ex = a[0] + (b[0] - a[0]) * t - ty * rad * side, ey = a[1] + (b[1] - a[1]) * t + tx * rad * side;
    const reach = (t < 0.5 ? wmCs[i0] : wmCs[i1]) === side ? Math.min(wmReachMax, (Rv - rad) * 0.85) : wmReachMax;
    const v = wmAtV;
    v[0] = ex; v[1] = ey; v[2] = tx; v[3] = ty; v[4] = reach;
    wmAtOk = !(reach < 2.5 || (wmVis && !wmVis[2 * (t < 0.5 ? i0 : i1) + (side > 0 ? 1 : 0)]) || wmUnder(ex, ey));
  }
  function wmPush() { const run = wmRun, v = wmAtV; run.push(v[0], v[1], v[2], v[3], v[4]); }
  // Where a run starts or stops falls exactly on its cut (found between the last point on one side and the first on the
  // other), so its length, and with it the fade, moves smoothly as the cut does, not a whole point at a time.
  function wmCut(i, wasOk) {
    let lo = 0, hi = 1;
    for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; wmPoint(i - 1, i, m); if (wmAtOk === wasOk) lo = m; else hi = m; }
    wmPoint(i - 1, i, wasOk ? lo : hi);
  }
  function olStep(now) {
    const cdu = Math.min(1, (now - live.clampLast) / CLAMP_FADE);
    live.clampLast = now;
    let clampMoved = false;
    for (const [id, c] of clampA) {
      const t = c.on ? 1 : 0;
      if (c.a !== t) { c.a = t > c.a ? Math.min(1, c.a + cdu) : Math.max(0, c.a - cdu); clampMoved = true; clampShade(id); }
      if (!c.on && c.a === 0) { for (const el of [...ov.clampsOut.querySelectorAll(`[data-id="${id}"]`), ...clampWOut.querySelectorAll(`[data-id="${id}"]`)]) el.remove(); clampA.delete(id); live.mk.ver++; }
    }
    // The treatment marks, stepped on the frame's own time (a long frame moves them no further than a short one's worth).
    if (markA.size) {
      const dt = Math.min(64, Math.max(0, now - live.markLast));
      const r = markA.step(dt, quietFx());
      markA.each(markShadeEach);
      if (r.gone.length) { for (const el of r.gone) el.remove(); live.mk.ver++; }
      if (r.moving || r.gone.length) clampMoved = true;
    }
    live.markLast = now;
    if (stentMoved) { stentMoved = false; clampMoved = true; }
    live.marksSync();
    if (!glLines || (!live.olDirty && !live.olList.length && !live.mk.dirty && !clampMoved && !nd.dirty)) return false;
    const dt = now - live.olLast;
    live.olLast = now;
    let moving = false;
    for (const o of live.olList) {
      const t = o.on ? 1 : 0, du = Math.min(1, dt / (o.fade || OL_FADE));
      if (o.a !== t) { o.a = t > o.a ? Math.min(1, o.a + du) : Math.max(0, o.a - du); moving = true; }
    }
    // (An outline that has faded out leaves the list: the rest are laid out again, or each would draw from its old place.)
    let kn = 0;
    for (let i = 0; i < live.olList.length; i++) { const o = live.olList[i]; if (o.on || o.a > 0) live.olList[kn++] = o; }
    if (kn !== live.olList.length) { live.olDirty = true; live.olList.length = kn; }
    let V = null;
    if (live.olDirty) { olVBuf.length = 0; V = olVBuf; }
    olDrawN = 0; olFadeN = 0;
    let first = 0;
    for (const o of live.olList) {
      const ease = smooth01(o.a);
      const col = o.col || (o.kind === 'pin' ? live.olCol : orgTone(o.id));
      // A warm layer: a soft glow along each side of every tube, strongest on its edge and easing out from it (strips are laid with MAX,
      // so where two meet they never stack). Only a loop's edge that shows is lit: not where a loop drawn over it lies on it, nor
      // outside the organ's outline (warmVis). Left off where the colon lies over the pile; on the inside of a tight bend the glow is
      // held short of the bend's centre (its reach follows the room there) and dropped where there is none, so it never folds back.
      if (o.kind === 'warm') {
        if (V) {
          const mt = gMatrix(organG[o.id]), rad = warmR(o.id) * (mt ? Math.hypot(mt.a, mt.b) : 1), reachMax = Math.min(63, WARM.reach, 0.8 * rad);   // (under the tube's half width, whatever the drawing)
          const cm = o.id === 'colon' ? null : gMatrix(organG.colon);
          wmV = V; wmRad = rad; wmReachMax = reachMax; wmInv = cm?.inverse() || null; wmGrid = o.id === 'colon' ? null : colonMask;
          o.runs.length = 0;
          const seen = warmVis(o.id);
          for (let ri = 0; ri < o.rings.length; ri++) {
            const r = o.rings[ri];
            wmVis = seen[ri]; wmRing = r;
            const n = r.length, tg = wmTg, R = wmR, cs = wmCs;
            for (let i = 0; i < n; i++) {
              const pa = r[Math.max(0, i - 1)], pb = r[Math.min(n - 1, i + 1)];
              let tx = pb[0] - pa[0], ty = pb[1] - pa[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l; tg[2 * i] = tx; tg[2 * i + 1] = ty;
              const i0 = Math.max(0, i - 2), i1 = Math.min(n - 1, i + 2), ax = r[i][0] - r[i0][0], ay = r[i][1] - r[i0][1], bx = r[i1][0] - r[i][0], by = r[i1][1] - r[i][1];
              const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by), th = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
              R[i] = Math.fround(la < 0.5 || lb < 0.5 || Math.abs(th) < 1e-3 ? 1e9 : (la + lb) / 2 / Math.abs(th));
              cs[i] = th > 0 ? 1 : -1;   // (the side the bend turns toward)
            }
            for (let si = 0; si < 2; si++) {
              wmSide = si ? 1 : -1;
              wmRun.length = 0;
              let prevOk = false;
              for (let i = 0; i < n; i++) {
                wmPoint(i, i, 0);
                if (wmAtOk) {
                  if (i > 0 && !prevOk) { wmCut(i, false); wmPush(); wmPoint(i, i, 0); }
                  wmPush();
                } else { if (prevOk) { wmCut(i, true); wmPush(); wmPoint(i, i, 0); } wmEnd(o); }
                prevOk = wmAtOk;
              }
              wmEnd(o);
            }
          }
        }
        for (let ci = 0; ci < o.runs.length; ci++) { const c = o.runs[ci]; olDraw(first, c, col, WARM.alpha * ease, true, true); first += c; }
        continue;
      }
      // The passes: a glow alone (the heart a slide points at), a glow under the line (a selected organ), or the line.
      const passes = o.glow ? PASS_HEART : o.kind === 'sel' ? PASS_SEL : PASS_LINE[o.kind];
      for (const [glow, w, alpha] of passes) {
        const h = w / 2, a = alpha * ease;
        for (const r of o.rings) {
          const closed = Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) < 0.5;
          const pts = r, n = closed ? r.length - 1 : r.length, count = (n + (closed ? 1 : 0)) * 2;
          // A glow starts on the edge and runs outward only (inside it would fold over itself on a tight curve): the side
          // that points away from the shape, by the ring's winding.
          let out = 1;
          if (glow) { let ar = 0; for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; ar += p[0] * q[1] - q[0] * p[1]; } out = ar > 0 ? -1 : 1; }
          if (V) for (let i = 0; i <= n - (closed ? 0 : 1); i++) {
            // (A glow's direction is taken across a few points either side (GLOW_SPAN, about 8 units): along a hand-drawn line with
            // small wobbles, the next points alone turn it back and forth, and its strips fan out into ticks.)
            const k = i % n, p = pts[k], sp = glow ? Math.min(GLOW_SPAN, (n - 1) >> 1) : 1;
            const pa = pts[closed ? (k - sp + n) % n : Math.max(0, k - sp)], pb = pts[closed ? (k + sp) % n : Math.min(n - 1, k + sp)];
            let tx = pb[0] - pa[0], ty = pb[1] - pa[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
            if (glow) V.push(p[0], p[1], -ty, tx, 0, w, p[0], p[1], -ty, tx, out, w);
            else V.push(p[0], p[1], -ty, tx, 1, h, p[0], p[1], -ty, tx, -1, h);
          }
          olDraw(first, count, col, a, glow || undefined, undefined);
          first += count;
        }
      }
    }
    if (V) live.olVerts = new Float32Array(V);
    // The vessel marks first (they sit under an organ's outline, as in the SVG), then the outlines.
    // (The circuit's station dots last, over everything: their vertices written into the tail of the same array as they move.)
    if (V || live.mk.dirty || !live.mk.all) {
      const n = live.mk.verts.length, o = n + (live.olVerts?.length || 0), all = new Float32Array(o + nd.verts.length);
      all.set(live.mk.verts); if (live.olVerts) all.set(live.olVerts, n);
      all.set(nd.verts, o);
      live.mk.all = all; live.mk.ndAt = o; live.mk.ndRev = nd.rev; live.mk.dirty = false;
    } else if (live.mk.ndRev !== nd.rev) { live.mk.all.set(nd.verts, live.mk.ndAt); live.mk.ndRev = nd.rev; }
    const off = live.mk.verts.length / 6, list = olSpecList;
    list.length = 0;
    for (let i = 0; i < live.mk.draws.length; i++) { const d = live.mk.draws[i]; list.push(d.fade ? olFaded(d) : d); }
    for (let i = 0; i < olDrawN; i++) { const d = olDrawPool[i]; d.first += off; list.push(d); }
    if (MAP.a > 0) {
      const n0 = live.mk.ndAt / 6;
      for (let i = 0; i < nodeDots.length; i++) {
        const a = MAP.a * easeMove(nodeDots[i].u), f = n0 + i * ND_PER;
        if (a <= 0) continue;
        const sa = ndSpecs[2 * i], sb = ndSpecs[2 * i + 1];   // (the dot's two draws, made ahead and written over)
        sa.first = f; sa.col = nd.fill; sa.alpha = a; sb.first = f + 3 * ND_SEG; sb.col = nd.ring; sb.alpha = a;
        list.push(sa, sb);
      }
    }
    nd.dirty = false;
    if (list.length) { const spec = olSpecs[olSpecI ^= 1]; spec.verts = live.mk.all; spec.rev = live.mk.ndRev; live.veins.setLines(spec); } else live.veins.setLines(null);
    live.olDirty = false;
    return moving || !!V;
  }
  return { caliperAt, caliperSegs, clampA, clampFading, clampShade, fxBuild, fxK, fxPill, fxSync, gMatrix, glLines, markA, markShade, normal, normalSync, olFading, olGeom, olKey, olRings, olSet, olStep, orgTone, pinOrgans, setCallouts, spotOrgans, stentFade };
}
