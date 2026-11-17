// The still column, tiles and charts of a slide's data card
// (moved out of presenter.js, text unchanged; a name the rest still reads is exported.)
import { store } from './store.js';
import { glWords } from './gl-words.js';
import { clamp, fadeShown, fmt, h, odoOn } from './util.js';
import { createSvgGL, svgModel, viewMap } from './svg-gl.js';
import { chartCtx } from './chart-ctx.js';
import { fingerprintOf } from '../engine/fingerprint.js';
import { bpText } from './vital-read.js';
import { NO_ASC, SCALE, TILE, bandsOf, cutDp, rateOf, tileOf, tileShown, tipsGoal, stentCuts } from './table-marks.js';
import { cancelFrame } from './frame.js';
import { glyphsReady, loadGlyphs, textWidth } from './text-gl.js';
import { cancelRest, restPass } from './rest-pass.js';
import { createScopeTile } from './scope-tile.js';
import { shownState as pageShown } from './shown.js';
import { createTileShown, tileSmall } from './tile-shown.js';
import { bandStepFor, BAND_LONG_MS } from './band-settle.js';
import { paintBand, shownBand } from './tile-band.js';
import { readBox, readCTM, readMetric, readStyle } from './layout-snap.js';
import { caught } from './caught.js';
import { onFontsLoaded } from './font-arrival.js';
import { COUNT_MS, reduceMotionMQ as reduce } from './motion.js';
import { frameFor } from './frame.js';
import { easeMove } from './motion.js';
const nextFrame = frameFor('presenter');
const ease = easeMove;

// The still column (D5), for a wedge slide with column: true: one vessel drawn along its path (portal vein, the portal tract's narrowing,
// the sinusoids as fine channels, central vein, hepatic vein, the balloon on its catheter, free blood beyond it). The balloon stops the
// hepatic vein, and the column behind it (in the wedge colour) fills back through the central vein and the sinusoids to the first moving
// blood. Here it stops at the resistance in the portal tract (schistosomiasis), so the wedge never sees it.
export function wedgeColumn() {
  const W = 360, L = 5, R = W - 5, xPV1 = 72, xN = 84, xS0 = 96, xS1 = 207, xC1 = 265, bx0 = 286, bx1 = 333, id = `pzwc${++uid}`;
  // The lumen's half-height along the path, smoothed between its stations; the portal vein's end is round.
  const pts = [[L, 9.7], [xPV1 - 4, 9.7], [xN, 2.5], [xN + 6, 2.5], [xS0 + 6, 1.8], [xS1 - 6, 1.8], [xS1 + 6, 6.2], [xC1 - 6, 6.2], [xC1 + 10, 11.4], [R - 1, 11.4]];
  const half = (x) => {
    let hw = pts.at(-1)[1];
    for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, h0] = pts[i - 1], [x1, h1] = pts[i], t = Math.max(0, (x - x0) / (x1 - x0)); hw = h0 + (h1 - h0) * t * t * (3 - 2 * t); break; }
    return x < L + 9.7 ? Math.min(hw, Math.sqrt(Math.max(0, 9.7 ** 2 - (L + 9.7 - x) ** 2))) : hw;
  };
  const up = [], dn = [];
  for (let x = L; x <= R - 1 + 0.01; x += 1.5) { up.push(`${x.toFixed(1)} ${(-half(x)).toFixed(1)}`); dn.push(`${x.toFixed(1)} ${half(x).toFixed(1)}`); }
  const sil = `M${up.join(' L')} L${dn.reverse().join(' L')} Z`;
  // The sinusoids: three lanes (drawn from the central vein back, so the column fills along them) and two links between them.
  const xs0 = xS0 + 6, xs1 = xS1 - 6, mid = (xs0 + xs1) / 2, ys = [-8.8, 0, 8.8], fw = bx0 + 8 - xN - 1, idF = `${id}f`;
  const lane = (dy) => `M${xs1} 0 C${xs1 - 16} ${dy * 0.15} ${xs1 - 22} ${dy} ${xs1 - 46} ${dy} H${xs0 + 46} C${xs0 + 22} ${dy} ${xs0 + 16} ${dy * 0.15} ${xs0} 0`;
  const links = `M${mid - 14} ${ys[0]} V${ys[1]} M${mid + 14} ${ys[1]} V${ys[2]}`;
  const lanes = (cls, look) => ys.map((dy) => sv('path', { class: cls, 'data-look': look, d: lane(dy), pathLength: 1 }));
  const fill = sv('rect', { class: 'c-fill', 'data-look': 'card.col.fill', x: xN + 1, y: -16, width: fw, height: 32, style: `transform: translate(${fw}px, 0px)` });
  const art = sv('g', { class: 'c-art', 'data-look': 'card.g' },
    sv('clipPath', { id, 'data-look': 'card.g' }, sv('path', { 'data-look': 'card.g', d: sil })),
    sv('g', { 'clip-path': `url(#${id})`, 'data-look': 'card.g' }, sv('rect', { class: 'c-pv', 'data-look': 'card.col.pv', x: L - 1, y: -16, width: xN - L + 2, height: 32 }), sv('rect', { class: 'c-flow', 'data-look': 'card.col.flow', x: xN + 1, y: -16, width: R - xN, height: 32 })),
    ...lanes('c-lane', 'card.col.lane'), sv('path', { class: 'c-lane c-link-b', 'data-look': 'card.col.link.b', d: links }),
    // (The column fills from the balloon back: its colour slides in from the right inside its own span, eased by the picture from its
    // transition, where a scaleX on SVG was repainted by the page every frame.)
    sv('clipPath', { id: idF, 'data-look': 'card.g' }, sv('rect', { 'data-look': 'card.g', x: xN + 1, y: -16, width: fw, height: 32 })),
    sv('g', { 'clip-path': `url(#${id})`, 'data-look': 'card.g' }, sv('g', { 'clip-path': `url(#${idF})`, 'data-look': 'card.g' }, fill)),
    ...lanes('c-lane-f', 'card.col.lane.f'), sv('path', { class: 'c-lane-f c-link', 'data-look': 'card.col.link.f', d: links }),
    sv('path', { class: 'c-edge', 'data-look': 'card.col.edge', d: sil }),
    sv('path', { class: 'c-blk', 'data-look': 'card.col.blk', d: `M${xN - 5} -11.4 Q${xN} -3.5 ${xN - 5} -1.3 M${xN + 6} -11.4 Q${xN + 1} -3.5 ${xN + 6} -1.3 M${xN - 5} 11.4 Q${xN} 3.5 ${xN - 5} 1.3 M${xN + 6} 11.4 Q${xN + 1} 3.5 ${xN + 6} 1.3` }),
    sv('rect', { class: 'c-bal', 'data-look': 'card.col.bal', x: bx0, y: -14, width: bx1 - bx0, height: 28, rx: 9.7 }),
    sv('path', { class: 'c-cath', 'data-look': 'card.col.cath', d: `M${bx0 + 7} 0 H${W - 1}` }), sv('circle', { class: 'c-tip', 'data-look': 'card.col.tip', cx: bx0 + 7, cy: 0, r: 2.3 }));
  const lead = sv('path', { class: 'c-lead', 'data-look': 'card.col.lead' }), brk = sv('path', { class: 'c-brk', 'data-look': 'card.col.brk' });
  const top = ['Still column:', 'reads the sinusoids'].map((t) => sv('text', { class: 'c-top', 'data-look': 'card.col.top', 'text-anchor': 'middle' }, t));
  const red = ['Resistance in', 'the portal tract'].map((t) => sv('text', { class: 'c-blkt', 'data-look': 'card.col.blkt' }, t));
  const names = [['Portal vein', 'start'], ['Sinusoids', 'middle'], ['Central vein', 'middle'], ['Balloon', 'end']].map(([t, a]) => sv('text', { 'data-look': 'card.col.text', 'text-anchor': a }, t));
  const model = sv('svg', { 'data-look': 'card.root', viewBox: `0 0 ${W} 100`, 'aria-label': 'The still column fills from the balloon back through the central vein and the sinusoids, and stops at the resistance in the portal tract.' },
    art, lead, brk, ...red, ...top, ...names);
  const svg = glBox('pz-col', model, { role: 'img', 'aria-label': model.getAttribute('aria-label'), style: `aspect-ratio: ${W} / 100` }, 'col');
  // The words follow the lettering (the slide's caption size as drawn): two lines over the picture, the names in one row under it.
  // (Widths are measured: the column only lays out while it shows.) The lettering never steps off its role: when the four names do not
  // stand in one row clear of each other they take two rows, and when the two headings do not stand side by side the column's heading
  // goes under the red one (clear of the red leader line); the card's own fit takes the extra height.
  const bL = xN + 10, bR = bx0 + 7;
  fitChart(svg, ({ cap: c0 }, box) => {
    // (A card that zooms its contents down, --pz-fit, takes the lettering down with it, never under 12 px on the screen nor under half its role.)
    const role = c0 * box.width / W, z = parseFloat(svg.closest('.pz-text')?.style.getPropertyValue('--pz-fit')) || 1;
    // (A run's width from Inter's own outlines, as the picture draws it (600, letter spacing .02 em), never asked of the page.)
    const wOf = (e) => (glyphsReady() ? textWidth(e.textContent, { weight: 600, size: c, ls: 0.02 * c }) : est(e.textContent, c)), c = c0 * Math.min(1, Math.max(z, Math.max(12, role * 0.55) / role));
    const place = () => {
      [...red, ...top, ...names].forEach((e) => fsOf(e, c));
      const rW = Math.max(...red.map(wOf)), tW = Math.max(...top.map(wOf)), nW = names.map(wOf), tx = (bL + bR) / 2 + 14;
      const xs = [[L, L + nW[0]], [(xs0 + xs1) / 2 - 8 - nW[1] / 2, (xs0 + xs1) / 2 - 8 + nW[1] / 2], [(xS1 + xC1) / 2 - nW[2] / 2, (xS1 + xC1) / 2 + nW[2] / 2], [W - 5 - nW[3], W - 5]];
      const apart = xs.every((b, i) => !i || b[0] - xs[i - 1][1] >= 6), band = L + rW + 8 <= tx - tW / 2 && tx + tW / 2 <= W - 2;
      return { rW, tW, nW, tx, xs, apart, band };
    };
    const p = place(), lh = 1.2 * c, stack = !p.band, rows2 = !p.apart;
    // (Stacked, the heading stays right of the red leader line at the narrowing and inside the picture.)
    const sx = Math.min(Math.max((bL + bR) / 2, xN + 8 + p.tW / 2), W - 2 - p.tW / 2);
    const y1 = 0.8 * c + 2, yRed2 = y1 + lh, bandEnd = (stack ? yRed2 + 2 * lh : yRed2) + 0.3 * c;
    const brY = bandEnd + 0.4 * c, cy = brY + 8 + 14, base = cy + 14 + 4 + 0.8 * c;
    red.forEach((e, i) => { setA(e, 'x', L); setA(e, 'y', (y1 + i * lh).toFixed(1)); });
    top.forEach((e, i) => { setA(e, 'x', (stack ? sx : p.tx).toFixed(1)); setA(e, 'y', ((stack ? yRed2 + lh : y1) + i * lh).toFixed(1)); });
    names.forEach((e, i) => { setA(e, 'x', i === 0 ? L : i === 3 ? W - 5 : ((p.xs[i][0] + p.xs[i][1]) / 2).toFixed(1)); setA(e, 'y', (base + (rows2 && i % 2 ? lh : 0)).toFixed(1)); });
    setA(art, 'transform', `translate(0 ${cy.toFixed(1)})`);
    setA(lead, 'd', `M${xN + 0.5} ${(yRed2 + 4).toFixed(1)} V${(cy - 14).toFixed(1)}`);
    setA(brk, 'd', `M${bL} ${(brY + 5).toFixed(1)} V${brY.toFixed(1)} H${bR} V${(brY + 5).toFixed(1)}`);
    const vh = (base + (rows2 ? lh : 0) + 0.3 * c + 2).toFixed(1);
    setA(model, 'viewBox', `0 0 ${W} ${vh}`);
    if (svg.style.aspectRatio !== `${W} / ${vh}`) svg.style.aspectRatio = `${W} / ${vh}`;
  }, () => restPass(() => { svg.classList.add('in'); model.classList.add('in'); fill.style.transform = 'translate(0px, 0px)'; svg._svgGL.wake(2600); }));
  if (!glyphsReady()) loadGlyphs().then(() => restPass(() => fitted.forEach((c) => c.svg === svg && (c.fs = null, fitNow(c)))));
  return svg;
}
// (The blood pressure tile prints systolic/diastolic (mean), 120/80 (93), from f's sbp and dbp: TILE.map.bp.)
export const tileVal = (k, v, f = null) => (v == null ? '—' : tileOf(k)?.bp ? bpText(f?.sbp, f?.dbp, v) : fmt(v * (tileOf(k)?.x ?? 1), tileOf(k)?.d ?? 1));
// The live model's numbers in the fingerprint's terms (a time-lapse plays on the live figure): the same function the worker builds a slide's
// state with. It has no starling() here, so the lymph's overflow, take-back and net stay null and the fluid card follows the live frames.
export const liveFp = (fr) => fingerprintOf(fr.metrics, { P: fr.Pf || fr.P, Q: fr.Qf || fr.Q, D: fr.D, params: store.get().params });

// A value counts from where it was to where it goes (eased, over COUNT_MS unless told); reduced motion jumps.
// (Tiles' numbers and bar marks follow the page's shown state: see tileGlide.)
// (A touch's history of points, [x or time, time or distance] pairs the drags read the last 100 ms of: kept pairs are written in place. A pair that
// falls out of a window, or past PT_MAX points, is the next point's, so a drag allocates only for its first points.)
export const PT_FREE = [], PT_MAX = 48;
// alloc-rare: the pool is empty only while a gesture's first points arrive (at most the points in its window)
const ptNew = (a, b) => { const p = PT_FREE.pop() || [0, 0]; p[0] = a; p[1] = b; return p; };
export const ptPush = (pts, a, b) => { if (pts.length >= PT_MAX) PT_FREE.push(pts.shift()); pts.push(ptNew(a, b)); };
// R19: a live model frame never writes the tiles while their card moves (a slide's slide or fold): the newest is kept and written
// once the card is still. A slide's own paint (its arrival, a new set of tiles) is never held.
// R19: a tile's changing number is drawn on the GPU (gl-words.js: Inter's outlines over the tile's own words, which are made clear and
// take the number back once it holds still), not written into the page on each model frame. A slide's count follows the page's shown state
// (tileGlide), its number and bar mark painted from one follower in each display frame.
// (A record's fields set to another's, in place: the keys it lacks are let go, so it ends equal to `src`, as a fresh copy would, with none made.)
function copyKeys(dst, src) {
  for (const k in dst) if (!(k in src)) delete dst[k];
  for (const k in src) dst[k] = src[k];
  return dst;
}
function tweener(draw) {
  let cur = null, raf = 0;
  const run = (to, ms = COUNT_MS) => {
    cancelFrame(raf);
    if (!cur || reduce.matches || ms === 0) { cur = copyKeys(cur || {}, to); draw(cur); return; }
    const from = { ...cur }, t0 = performance.now();
    const step = (now) => {
      const u = ease(clamp((now - t0) / ms, 0, 1));
      for (const k in to) cur[k] = from[k] == null || to[k] == null ? to[k] : from[k] + (to[k] - from[k]) * u;
      draw(cur);
      if (u < 1) raf = nextFrame(step);
    };
    raf = nextFrame(step);
  };
  run.again = () => { if (cur) draw(cur); };   // (the same frame again, after the geometry moved)
  run.has = () => !!cur;
  run.stop = () => { cancelFrame(raf); raf = 0; };   // (a glide under way ends where it is; nothing is drawn after)
  run.jump = (to) => { cancelFrame(raf); cur = copyKeys(cur || {}, to); draw(cur); };   // (straight to the end, its glide left to the compositor: tileGlide)
  return run;
}

// The deck's own diagrams (the still column, the SAAG map, the two walls, the rail's block) are models drawn on the GPU (svg-gl.js), never
// SVG the page paints (2 Nov 2026, "Move everything to GPU"): sv makes the same tree, of plain elements, hidden; glBox holds it and its picture.
export const sv = svgModel;
/** A diagram's box: a block of the diagram's class (its look and size in the stylesheet) holding the model and the GPU picture of it. Its
 *  look is read once it is on the page and laid out (fitChart), and again whenever its lettering is laid out anew. */
export function glBox(cls, root, attrs = {}, host = '') {   // (host: the chart's name in the looks table, chart-looks/card.js)
  const box = h('div', { class: cls, ...attrs });
  const gl = createSvgGL(box, { host });
  if (!attrs['aria-label']) { gl.cv.setAttribute('aria-hidden', 'true'); gl.cv.removeAttribute('role'); }
  box.append(root);
  box._model = root;
  return box;
}
let uid = 0;

// A drawn chart lays out in its own units, scaled to its card, so its lettering is set from the slide's type scale as
// drawn: lay(fs) gets each role (--s-cap … --s-big, the text size setting included) in the chart's units and places the
// text and the rows around it. It runs again when the chart is resized or the text size changes, until the scale settles.
const ROLE_NAMES = ['cap', 'lab', 'body', 'val', 'big'];
export const fitted = new Set();
// (A chart whose fit throws is counted and left: reFit runs these for every chart before any new card comes in, and one error there left
// the cards unseen with the figure dimmed. 3 Nov 2026.)
export const fitNow = (c) => { try { fitLoop(c); if (c.gl && c.fs) { const cx = chartCtx(c.svg); if (c.placed) { c.gl.setCtx(cx); c.gl.relook(); } else { Object.assign(c.gl.local, cx);  c.placed = true; c.gl.place(c.root); c.onPlace?.(); } } } catch (e) { caught('presenter:fit', e); } };
const fitLoop = (c) => {
  const { svg, lay } = c;
  if (!svg.isConnected) { fitted.delete(c); c.ro?.disconnect(); return; }
  for (let n = 0; n < 8; n++) {
    // (Units per css px, before a full card's zoom: the chart's lettering zooms with the rest of its card. A model's box: its viewBox
    // mapped into the box as the picture maps it.)
    const box = readBox(svg), m = c.root ? null : readCTM(svg);
    const k = c.root ? 1 / (viewMap(c.root.getAttribute('viewBox'), c.root.getAttribute('preserveAspectRatio'), box.width, box.height)[0] || Infinity) : m && m.a ? 1 / m.a : 0;
    if (!k || !box.width) return;
    // (A chart in a data card reads the card's own chart sizes, --ch-<role>, where it sets them: a ladder's words at the tiles' small size.)
    const pr = document.createElement('span'), host = svg.closest('.pz-data, .pz-cell') || svg.closest('.pz') || document.body;
    pr.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    host.append(pr);
    const fs = {};
    // (The screen's matrix carries the card's zoom: a data card whose words zoom down past its fit's last step, --pz-z, has its
    // chart's words drawn that much smaller too.)
    let wz = parseFloat(host.style?.getPropertyValue('--pz-z')) || 1;
    // (A phone's site ladders zoom with their card, --pz-fit, as its words do: read through the matrix alone, the fit's own zoom made
    // their lettering larger in the chart's units, the strips taller, and the card stayed zoomed to half for good.)
    const cellGrid = svg.closest(':is(.pz.stack, .pz.low) .pz-cell')?.parentElement;
    if (cellGrid) wz *= parseFloat(readStyle(cellGrid).zoom) || 1;
    for (const r of ROLE_NAMES) { pr.style.fontSize = `var(--ch-${r}, var(--s-${r}))`; fs[r] = parseFloat(readStyle(pr).fontSize) * k * wz; }
    pr.remove();
    if (c.fs && ROLE_NAMES.every((r) => Math.abs(c.fs[r] - fs[r]) < 0.01 * fs[r]) && Math.abs(c.w - box.width) + Math.abs(c.h - box.height) < 1) return;
    c.fs = fs; c.w = box.width; c.h = box.height; lay(fs, box);
  }
};
// An attribute or a text written only when it changes (a tween's frame rewrote every one of them, same or not).
const setA = (e, k, v) => { v = String(v); if (e.getAttribute(k) !== v) e.setAttribute(k, v); };
const setT = (e, t) => { t = String(t); if (e.textContent !== t) e.textContent = t; };
export const est = (t, px, w = 0.6) => String(t).length * px * w;   // (a run's width: Inter averages about 0.6 em a character, 0.66 bold capitals)
export function fitChart(svg, lay, onPlace = null) {
  // (A diagram's box (glBox): measured as the box, its model laid out, and its picture's look read once the lettering stands.)
  const c = svg._model ? { svg, lay, fs: null, root: svg._model, gl: svg._svgGL, onPlace } : { svg, lay, fs: null };
  fitted.add(c);
  // (After the observer, not inside it: the new layout changes the chart's own height. A rest pass between frames, rest-pass.js.)
  if (typeof ResizeObserver !== 'undefined') { c.ro = new ResizeObserver(() => { cancelRest(c.raf); c.raf = restPass(() => fitNow(c)); }); c.ro.observe(svg); }
  return c;
}
if (typeof addEventListener !== 'undefined') addEventListener('pps:labelscale', () => restPass(() => fitted.forEach(fitNow)));
/** Lets go of every GPU chart inside a card that is about to be replaced (the column, rail block, quadrant, walls art): its svg-gl picture is
 *  disposed (the module keeps each one live until then), and its fit entry and observer are dropped. Never run on a kept card. */
export function dropCharts(el) {
  if (!el) return;
  for (const c of [...fitted]) if (el.contains(c.svg)) { c.ro?.disconnect(); cancelRest(c.raf); fitted.delete(c); }
  for (const b of el.querySelectorAll('.svg-gl-box')) b._svgGL?.dispose();
  if (el._svgGL) el._svgGL.dispose();
}
export const fsOf = (el, px) => { el.style.fontSize = px.toFixed(2) + 'px'; el.setAttribute('font-size', px.toFixed(2)); };   // (a model piece's looks come from the table, which takes its size from the attribute)

// The block is a hatched fill: bold diagonal red stripes over a faint red tint (visible in light and dark, no label).
// Shared by the ladders and the level rail, so the block looks the same everywhere.
const hatch = (id, s) => sv('pattern', { id, width: s, height: s, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
  sv('rect', { class: 'pz-hb', 'data-look': 'card.hatch.bg', width: s, height: s }), sv('rect', { class: 'pz-hs', 'data-look': 'card.hatch.stripe', width: s / 2, height: s }));
/** The block on the level rail: the phone ladder's block (rounded, red outline, red hatching) wrapped round the blocked level's whole bar. */
function railBlock() {
  const id = 'pzRailB' + ++uid;
  // (A model drawn on the GPU in px of its box: its viewBox and its block's size are the box's own, set as the box is laid out.)
  const pat = hatch(id, 7), drop = sv('rect', { class: 'pzs-drop', 'data-look': 'card.drop', width: '100%', height: '100%', rx: 6, fill: `url(#${id})` });
  const model = sv('svg', { viewBox: '0 0 100 20', preserveAspectRatio: 'none' }, sv('defs', {}, pat), drop);
  const box = glBox('pz-rail-blk', model, { 'aria-hidden': 'true' });
  fitChart(box, () => {
    const w = readMetric(box, 'offsetWidth'), ht = readMetric(box, 'offsetHeight');
    if (!(w > 0 && ht > 0)) return;
    setA(model, 'viewBox', `0 0 ${w} ${ht}`); setA(drop, 'width', w); setA(drop, 'height', ht);
  });
  return box;
}
/** The readings a tracing card measures: its header shows them only once the measurement is done (the card's data-reading="pending" holds them, app-11-deck-visuals.css), never
 *  ahead of the trace that gives them ("HVPG FALL 16 %" over an empty tracing, 16 Nov 2026). */
export const MEASURED = ['hvpg', 'hvpgFall', 'ppg'];
/** Big number tiles, each rated; set() counts to the new values. Given ref (an earlier state's numbers), each
 *  tile also says how far it moved from there, green when it went the better way (and plain within normal). */
export function bigTiles() {
  const el = h('div', { class: 'pz-tiles' });
  const head = h('span', { class: 'pz-hr', 'data-n': '0' });   // (the same readings, numbers only, for an instrument card's header row)
  let sig = '', parts = [], draw = null, goal = false, tileArgs = null, tileAsk = 0, picT = null, tileRO = null, dead = false, stopShown = null;
  // (The newest paintTiles call's seven arguments, kept in one array written in place: a what-if drag calls it every frame. The paint, a task
  // between frames, reads them; one pass is asked for however many calls land before it.)
  const paintAsk = () => { tileAsk = 0; const a = tileArgs; if (a) paintTilesNow(a[0], a[1], a[2], a[3], a[4], a[5], a[6]); };
  // (R19: a tile's number as shown, and set: through its GPU words while the model ticks, into the page at once (now) while a slide's
  // roll is set up or the fit measures.)
  // (Its value, bar mark and start ring follow the page's shown state, tile-shown.js: painted from what is shown, in the frames while one is on the way.)
  const ts = createTileShown(pageShown);
  const vText = (p) => (p.vw ? p.vw.text : p.v.textContent);
  const vSet = (p, t) => { if (!p.vw) setT(p.v, t); else p.vw.set(t); };
  // After TIPS the PPG is read against its target (below 12 mmHg), so a tile never says "High" under a line that
  // says the target is reached.
  const rated = (k, f) => (goal && k === 'ppg' && f.ppg != null ? tipsGoal(f.ppg) : rateOf(k, f));
  // (A tile's word judges the number it prints: 4.98 L shows "5.0 L", so it reads Grade 3.)
  const ratedShown = (k, f) => (f[k] != null ? rated(k, { ...f, [k]: tileShown(k, f[k]) }) : rated(k, f));
  // Where a value sits on its tile's bar, 0 to 100 (shown units, held inside the bar).
  const at = (k, v) => { const [a, b] = SCALE[k], x = TILE[k]?.x ?? 1; return Math.min(100, Math.max(0, ((v * x - a) / (b - a)) * 100)); };
  // A number and its unit always fit inside their tile: where the tile is too narrow for them at the layout's size, both
  // shrink together (the unit never below 12 px; the number then takes the rest of the cut). Measured with the wider of the
  // number shown and the one it counts to, so the count never runs past the edge; again when the row changes size.
  function fit() {
    for (const p of parts) {
      if (p.pic) continue;   // (the endoscopic view's tile: a picture, its number and unit never placed, so nothing to fit; reading them threw)
      const vu = p.v.parentNode;
      p.v.style.fontSize = p.u.style.fontSize = p.v.style.lineHeight = '';
      const cs = readStyle(p.tile), room = readMetric(p.tile, 'clientWidth') - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
      if (!(room > 0)) continue;
      const cur = vText(p), wide = (p.fin || '').length > cur.length ? p.fin : cur;
      // (Written only when the number it counts to is longer: the same text measured as it stands keeps a roll's digit columns.)
      if (wide !== cur) { if (p.vw) p.vw.now(wide); else p.v.textContent = wide; }
      const vw = readBox(p.v).width, uw = p.u.hidden ? 0 : readBox(p.u).width;
      const gap = p.u.hidden ? 0 : parseFloat(readStyle(vu).columnGap) || 0;
      if (wide !== cur) { if (p.vw) p.vw.now(cur); else p.v.textContent = cur; }
      const need = vw + gap + uw;
      if (need <= room) continue;
      const vs = readStyle(p.v), vf = parseFloat(vs.fontSize), uf = parseFloat(readStyle(p.u).fontSize);
      let k = (room - 1) / need, ku = k;
      if (uf * ku < 12) { ku = Math.min(1, 12 / uf); k = Math.max(0, (room - 1 - uw * ku) / (vw + gap)); }
      p.v.style.lineHeight = vs.lineHeight;   // (the line keeps its height, so the tile and its card never change size)
      p.v.style.fontSize = `${Math.max(12, Math.floor(vf * k * 10) / 10)}px`;
      if (ku < 1) p.u.style.fontSize = `${Math.floor(uf * ku * 10) / 10}px`;
    }
  }
  let fitRaf = 0, fitShape = '';
  const fitSoon = () => { if (dead) return; cancelRest(fitRaf); fitRaf = restPass(fit); };   // (measured between frames, never in one: rest-pass.js)
  if (typeof ResizeObserver !== 'undefined') (tileRO = new ResizeObserver(fitSoon)).observe(el);
  const offFonts = onFontsLoaded(fitSoon);   // (a face arriving after the tiles were fitted changes the numbers' widths, not their boxes: font-arrival.js)
  const bandOf = (p, v) => shownBand(p, v, rated, tileShown);
  function buildTiles(ks, withRef) {
    if (dead) return;
    picT?.stop(); picT = null;
    for (const p of parts || []) { p.vw?.dispose(); p.hw?.dispose(); p.pic?.dispose(); ts.drop(p.k); if (p.T?.bp) { ts.drop('map.s'); ts.drop('map.d'); } }   // (the pressure's systolic and diastolic followers go with its mean: left behind they glided the next card's 120/80 from the last card's pair, beside a mean that had started afresh, 16 Nov 2026) (recs §8: the tiles they wrote are replaced; their GPU words, scope picture and followers go with them)
    parts = ks.map((k) => {
      const T = tileOf(k) || { t: k, s: '', u: '' };
      const v = h('span', { class: 'pzt-v' }), u = h('small', {}, T.u), r = h('span', { class: 'pzt-r' });
      const d = h('span', { class: 'pzt-d' });
      // The scale bar: the tile's bands (coloured by its rating), its cut-offs, a ring where it started (given ref) and a dot
      // where it is. A tile with no scale keeps an empty bar, and every tile keeps its change line (empty on a slide that counts
      // no change), so every tile of every slide is the same height (2 Nov 2026, Mohammad: "the tiles are variable in height").)
      const bands = bandsOf(k) || [], S = SCALE[k];
      const zs = bands.map((z) => h('i', { class: 'pzb-z', style: `left:${at(k, z.a / (T.x ?? 1))}%;width:${at(k, z.b / (T.x ?? 1)) - at(k, z.a / (T.x ?? 1))}%` }));
      const ts = S ? S[2].map((c) => h('i', { class: 'pzb-t', style: `left:${at(k, c / (T.x ?? 1))}%` })) : [];
      const ls = S ? S[2].map((c) => h('span', { class: 'pzb-l', style: `left:${at(k, c / (T.x ?? 1))}%` }, fmt(c, cutDp(c)))) : [];
      const link = withRef ? h('i', { class: 'pzb-link' }) : null, was = withRef ? h('i', { class: 'pzb-was' }) : null, now = h('i', { class: 'pzb-now' });
      const bar = h('span', { class: 'pzt-bar' + (S ? '' : ' empty'), 'aria-hidden': 'true' }, h('span', { class: 'pzb-track' }, h('span', { class: 'pzb-zs' }, zs), ts, link, was, S ? now : null), ls);
      const pic = k === 'scope' ? createScopeTile() : null;   // (the endoscopic view: a picture in place of a number; v, u and r stay unplaced)
      const tile = pic ? h('div', { class: 'pz-tile pz-scope' }, h('span', { class: 'pzt-k' }, T.t), pic.el)
        : h('div', { class: 'pz-tile' + (S ? ' scaled' : '') }, h('span', { class: 'pzt-k', 'data-s': T.n || null }, T.t), h('span', { class: 'pzt-vu' + (T.u === '%' ? ' pct' : '') }, v, u), r, d, bar);
      // (R19: its number's GPU words, laid over the number and its unit's row: their canvas sits in that row, never inside the number,
      // which a roll's digit columns and the fit rewrite.)
      const vw = !pic ? glWords(v, { host: v.parentNode }) : null;
      // (Its reading in the instrument card's header row, numbers only: the short name, the number and its unit, no dot (style A, 7 Nov 2026). The number is
      // its own GPU words, in the rating's ink with the label look's outline (halo); the rating is the item's data-rate, written with the tile's.)
      const hv = h('b', {}), hu = h('small', {}), hi = pic ? null : h('span', { class: 'pz-hi', 'data-rate': 'plain', 'data-measured': MEASURED.includes(k) ? '' : null }, h('span', { class: 'pz-hk' }, T.n || T.t), hv, hu);
      const hw = hi ? glWords(hv, { halo: true, keep: true }) : null;   // (kept: the GPU number stays up, no hand-over to the page's text, as the Doppler numbers)
      return { k, T, tile, v, vw, u, r, d, S, bands, zs, ts, ls, cuts: '', link, was, now, zr: '', pic, hi, hv, hu, hw, sm: tileSmall(T, S), none: false, hasRef: false, sv: NaN, sr: NaN };
    });
    el.replaceChildren(...parts.map((p) => p.tile));
    head.replaceChildren(...parts.filter((p) => p.hi).map((p) => p.hi));
    head.dataset.n = String(head.childElementCount);
    el.classList.remove('pzb-nonum');   // (new bars keep their numbers' row until the card's fit has seen them: fitCards)
    el.dataset.n = String(parts.length);
    // (The numbers, ratings and marks are written at a value's end, never counted frame by frame (2 Nov 2026, "Move everything to GPU": a
    // count wrote each tile's text on every frame); only the endoscopic view, a GPU picture, follows its value through the ease.)
    picT = parts.some((p) => p.pic) ? tweener((f) => parts.forEach((p) => { if (p.pic) p.pic.set(f.varix); })) : null;
    let cur = null;
    draw = { has: () => !!cur, jump: (to) => { cur = { ...to }; write(cur); }, glide: (to) => { cur = { ...to }; write(cur, true); }, go: (to, ms) => { draw.jump(to); picT?.(to, ms); } };
    // (A tile's number and bar mark from the value shown now, v (the model's units): painted by a write at once, and by paintShown in each display
    // frame while the follower is on the way. Always .set on a header reading, never .now: a kept GPU number is redrawn by set alone.)
    const putNum = (p, v) => {
      const hs = p.none ? '—' : tileVal(p.k, v, p.bp);
      vSet(p, hs);
      if (p.hi) { if (!p.hw) setT(p.hv, hs); else p.hw.set(hs); }
    };
    const putBar = (p, v, v0) => {
      if (!p.S) return;
      const on = p.on, w = on ? at(p.k, v) : 0;
      // (The marks stay whole inside the track: a value past either end of the scale, as platelets of 380 on a bar
      // that stops at 300, rests against that end instead of running half off it. Sweep, 16 Oct.)
      if (p.now._w !== w) { p.now._w = w; p.now.style.translate = `clamp(6px, ${w}%, calc(100% - 6px)) 0`; }   // (written only when it moves; a transform: the mark is the track's width, app.css)
      if (p.was) {
        const ok = p.hasRef, w0 = ok ? at(p.k, v0) : 0;
        if (p.was._w !== w0) { p.was._w = w0; p.was.style.translate = `clamp(4.5px, ${w0}%, calc(100% - 4.5px)) 0`; }
        if (p.link._w !== w || p.link._w0 !== w0) { p.link._w = w; p.link._w0 = w0; p.link.style.translate = `${Math.min(w, w0)}% 0`; p.link.style.scale = `${(Math.abs(w - w0) / 100).toFixed(4)} 1`; }
      }
    };
    // (Each display frame while a tile's follower is on the way: the number and the marks from what is shown, the same filter as the dock's bars.)
    const paintShown = () => {
      for (const p of parts) {
        // (A rating held while its number glided across a cut-off, write: taken once the number has landed.)
        // (Or once it has waited BAND_LONG_MS and the number on show has itself entered the band: a number that keeps moving, a live strain, never lands.)
        if (p.pend && (!ts.moving(p.k) || (performance.now() - p.waitT >= BAND_LONG_MS && p.on && bandOf(p, ts.get(p.k, p.sv)) === p.pend[1]))) { const [w, r] = p.pend; p.pend = null; paintBand(p, w, r); }
        if (p.pic || !p.on) continue;
        const v = ts.get(p.k, p.sv), v0 = p.hasRef ? ts.get(p.k, p.sr, true) : p.sr;
        const bs = p.bp ? ts.get('map.s', p.bp.sbp) : 0, bd = p.bp ? ts.get('map.d', p.bp.dbp) : 0;
        if (v === p.sv && v0 === p.sr && (!p.bp || (bs === p.bp.sbp && bd === p.bp.dbp))) continue;
        p.sv = v; p.sr = v0;
        if (p.bp) { p.bp.sbp = bs; p.bp.dbp = bd; }
        putNum(p, v); putBar(p, v, v0);
      }
    };
    stopShown?.();
    stopShown = ts.onFrame(paintShown);
    // go: the values follow the page's shown state (a slide's change, a kept card's patient); otherwise they are shown at once.
    const write = (f, go = false) => parts.forEach((p) => {
      if (p.pic) return;
      const [cls, word] = ratedShown(p.k, f), none = cls == null && (p.k === 'saag' || p.k === 'tp');
      const on = !none && f[p.k] != null, r0 = p.k === 'hvpgFall' ? null : f['ref_' + p.k], ok = on && r0 != null;
      p.none = none; p.on = on; p.hasRef = ok;
      p.sv = on ? ts.set(p.k, f[p.k], p.sm, go) : f[p.k];
      p.sr = ok ? ts.set(p.k, r0, p.sm, go, true) : r0;
      if (!on) ts.drop(p.k);
      // (The blood pressure's systolic and diastolic follow beside its mean, for its words: 120/80 (93).)
      if (p.T.bp) {
        const b = p.bp || (p.bp = { sbp: NaN, dbp: NaN });   // alloc-rare: once per pressure tile
        b.sbp = on ? ts.set('map.s', f.sbp, p.sm, go) : f.sbp; b.dbp = on ? ts.set('map.d', f.dbp, p.sm, go) : f.dbp;
        if (!on) { ts.drop('map.s'); ts.drop('map.d'); }
      }
      putNum(p, p.sv);
      fadeShown(p.u, !(none || !p.T.u));   // (a tile's parts fade in and out with its reading: nothing pops)
      // (A1, band-settle.js: a rating that changes while the number glides waits for it to land, paintShown; Reduce Motion, a first one: at once.)
      const rate = cls || (none ? 'none' : 'plain');
      p.f = f;
      if (bandStepFor(p.rate, rate, go && ts.moving(p.k), reduce.matches, p.pend ? performance.now() - p.waitT : 0, p.pend ? bandOf(p, p.sv) : rate) === 'wait') { if (!p.pend) p.waitT = performance.now(); p.pend = [word, rate]; }   // alloc-rare: only when a slide's change moves a rating across a cut-off
      else { p.pend = null; paintBand(p, word, rate); }
      if (p.hi) {
        // (putNum sets the header's number: always .set, never .now, even while the tiles glide in. A kept GPU number is redrawn by set alone; now writes only
        // the page's text, which stays clear under the picture, so a header reading written that way kept showing the number it had before, the slide's start
        // on a time-lapse's end: 7 Nov 2026, "the slide says 15.1 but the readout says 23.7". Nothing measures the header's words, so nothing needs now.)
        fadeShown(p.hu, !(none || !p.T.u));
        if (p.hu.textContent !== p.T.u) p.hu.textContent = p.T.u;
      }
      // (The response tile's line names the HVPG the fall is counted from.)
      if (p.k === 'hvpgFall') {
        const t = f.respFrom == null ? '' : `from ${fmt(f.respFrom, 1)} mmHg`;
        if (p.d.textContent !== t) p.d.textContent = t;
      }
      if (p.S) {
        fadeShown(p.now, on);
        if (p.was) { fadeShown(p.was, ok); fadeShown(p.link, ok); }
        putBar(p, p.sv, p.sr);
      }
      if (r0 == null || f[p.k] == null) return;
      // (The start as shown: the ring on the bar marks it, the words give its number.)
      const x = p.T.x ?? 1, dg = p.T.d ?? 1, rd = (v) => +(v * x).toFixed(dg), same = Math.abs(rd(f[p.k]) - rd(r0)) < 0.5 * 10 ** -dg;
      const t = same ? 'No change' : `from ${fmt(r0 * x, dg)}${p.T.u === '%' ? '%' : ''}`;
      if (p.d.textContent !== t) p.d.textContent = t;
    });
  }
  // (Since 1 Nov 2026 (Mohammad: "Move everything to GPU"; a 120 Hz frame budget) a change of slide no longer redraws the tiles with the
  // model's own work on each frame of a count: the rating's word and colour take their new value as it starts, and the number, the bar's
  // mark and the start ring follow the page's shown state (tile-shown.js, 8 Nov 2026, recs 15), the filter the dock's bars and the vessels
  // use: the number is drawn by the GPU's words (gl-words.js) and the marks are a translate, both from the same follower in each display
  // frame, so the number, the bar and the figure arrive together. A kept card's polls bend the speed instead of restarting a curve. A
  // number whose shape changes (9.9 to 10.1) simply takes its new text. Not with the endoscopic view (it draws each step), or Reduce Motion.)
  function tileGlide(to, ms = COUNT_MS) {   // (ms 0: shown at once; any other time is the follower's, not the caller's)
    if (!odoOn() || !draw?.has() || reduce.matches || ms === 0 || parts.some((p) => p.pic)) return false;
    draw.glide(to);
    return true;
  }
  // A band's colour is the rating of its middle (after TIPS the PPG's bands follow its target, as its word does).
  // A stent's peak velocity bar keeps its cut-offs at the range for the stent's own diameter (90 to 190 cm/s for 8 to 10 mm, scaled and provisional for another: stentCuts):
  // the bands, ticks and labels are moved when that range changes (a new slide's stent), never while a frame is drawn, so the bar and the word agree.
  const STENT_VEL = { tipsVel: 'tips', dipsVel: 'dips' };
  function retuneStent(p, f) {
    const r = stentCuts(STENT_VEL[p.k], f), key = `${r[0]}|${r[1]}`;
    if (key === p.cuts) return;
    p.cuts = key;
    const x = p.T.x ?? 1, edges = [p.S[0], r[0] * x, r[1] * x, p.S[1]];
    p.bands.forEach((z, i) => {
      z.a = edges[i]; z.b = edges[i + 1]; z.m = (z.a + z.b) / 2 / x;
      const a = at(p.k, z.a / x), b = at(p.k, z.b / x);
      p.zs[i].style.left = `${a}%`; p.zs[i].style.width = `${b - a}%`;
    });
    for (let i = 0; i < 2; i++) { const c = edges[i + 1]; p.ts[i].style.left = `${at(p.k, c / x)}%`; p.ls[i].style.left = `${at(p.k, c / x)}%`; p.ls[i].textContent = fmt(c, cutDp(c)); }
  }
  function paintBands(f) {
    for (const p of parts) {
      if (!p.S) continue;
      if (STENT_VEL[p.k]) retuneStent(p, f);
      const rs = p.bands.map((z) => rated(p.k, { ...f, respAt: null, asc: Math.max(f.asc ?? 0, NO_ASC), [p.k]: z.m })[0] || 'info'), sig = rs.join();   // (hvpgFall's bands read the fall alone)
      if (sig === p.zr) continue;
      p.zr = sig;
      p.zs.forEach((e, i) => { e.dataset.rate = rs[i]; });
    }
  }
  // (R19: the card the tiles sit in is moving: its slide or its fold, read from its class and data, never from layout.)
  let held = null, heldObs = null;
  const movingCard = () => el.closest('.pz-sliding, [data-folding]');
  function release() {
    if (movingCard()) return;
    heldObs?.disconnect(); heldObs = null;
    const a = held; held = null;
    if (a) api.paintTiles(...a);
  }
  const api = {
    el,
    head,
    // (Painted between frames, never in one: a slide's new tiles are built and their words written in a rest pass, the latest call's
    // values winning, so a frame writes nothing into the tiles (2 Nov 2026, "Move everything to GPU").)
    /** Lets go of everything the tiles own: their GPU words, the scope picture, its glide, the fit and the held frame. Idempotent. */
    dispose() {
      if (dead) return;
      dead = true;
      cancelRest(tileAsk); tileAsk = 0; cancelRest(fitRaf); fitRaf = 0; tileArgs = null; held = null;
      tileRO?.disconnect(); tileRO = null; heldObs?.disconnect(); heldObs = null;
      offFonts();
      picT?.stop(); picT = null;
      stopShown?.(); stopShown = null;
      for (const p of parts) { p.vw?.dispose(); p.hw?.dispose(); p.pic?.dispose(); ts.drop(p.k); }
      parts = []; draw = null;
    },
    paintTiles(f, ks, key, ref, ms, tips, live) {
      if (dead) return;
      // alloc-rare: made once, with the first call
      const a = tileArgs || (tileArgs = [0, 0, 0, 0, 0, 0, 0]);
      a[0] = f; a[1] = ks; a[2] = key; a[3] = ref; a[4] = ms; a[5] = tips; a[6] = live;
      if (!tileAsk) tileAsk = restPass(paintAsk);
    },
  };
  function paintTilesNow(f, ks, key = [], ref = null, ms, tips = false, live = false) {
    {
      // (A live frame while the card moves: kept, the newest only, and painted when the card is still, on the card's own change.)
      if (live && draw && ks.join() + (ref ? '|ref' : '') === sig) {
        const mc = movingCard();
        if (mc) {
          held = [f, ks, key, ref, ms, tips, false];
          if (!heldObs && typeof MutationObserver === 'function') { heldObs = new MutationObserver(release); heldObs.observe(mc, { attributes: true, attributeFilter: ['class', 'data-folding'] }); }
          return;
        }
      }
      held = null;
      goal = !!tips;
      const sg = ks.join() + (ref ? '|ref' : '');
      if (sg !== sig || !draw) { sig = sg; buildTiles(ks, !!ref); }   // (no tiles at all is a build too)
      el.dataset.keys = ks.join();
      parts.forEach((p) => { p.tile.classList.toggle('key', key.includes(p.k)); p.hi?.classList.toggle('key', key.includes(p.k)); });
      paintBands(f);
      const to = Object.fromEntries([...ks, 'asc', ...(ks.includes('map') ? ['sbp', 'dbp'] : [])].map((k) => [k, f[k]]));
      if (ks.includes('scope')) to.varix = f.varix;   // (the endoscopic view follows the varix's size)
      if (ref) for (const k of ks) to['ref_' + k] = ref[k];
      if (ks.includes('hvpgFall')) Object.assign(to, { respFrom: f.respFrom, respAt: f.respAt });
      for (const p of parts) p.fin = tileVal(p.k, to[p.k], to);
      if (!tileGlide(to, ms)) draw.go(to, ms);
      // (Fitted again only when a number's shape changed, its final text or the length of the one shown: measuring the tiles forced a
      // layout on every model frame, with the same answer. A tile's own size change still refits through the observer below.)
      const shape = parts.map((p) => `${p.fin}|${vText(p).length}`).join();
      if (shape !== fitShape) { fitShape = shape; fitSoon(); }
    }
  }
  return api;
}

// The six levels along the route, portal vein to heart: [id, name]. The three middle levels are inside the liver.
const SITES = [
  ['pre', 'Pre-hepatic'],
  ['presin', 'Presinusoidal'],
  ['sin', 'Sinusoidal'],
  ['postsin', 'Postsinusoidal'],
  ['post', 'Post-hepatic'],
  ['cardiac', 'Cardiac'],
];
/** The six levels, portal vein to heart, the liver's three bracketed; mode: 'all' shows each level named,
 *  a level id marks that one as the block, anything else shows the levels unmarked. Each name stays on one
 *  line under its bar (it shrinks to fit the card, and tilts 45° when the card is too narrow). */
export function rail(mode) {
  const at = SITES.findIndex(([id]) => id === mode);
  return h('div', { class: 'pz-rail' + (mode === 'all' ? ' all' : at >= 0 ? ' one' : ''), role: 'img', 'aria-label': at >= 0 ? `Resistance: ${SITES[at][1]}` : 'Six levels: pre-hepatic, presinusoidal, sinusoidal, postsinusoidal, post-hepatic, cardiac' },
    h('div', { class: 'pz-rail-liver' }, h('i'), h('span', {}, 'Liver'), h('i')),
    h('ol', {}, SITES.map(([id, name], i) => h('li', { 'data-site': id, class: i === at ? 'on' : null },
      h('i', {}, i === at ? railBlock() : null), h('span', { class: 'n' }, name)))));
}

