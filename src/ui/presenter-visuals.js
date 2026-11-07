// The Presenter's visuals over the dimmed figure (scale, quadrant, walls) and its calculator worker, moved out of presenter.js (size budget).
import { h, fmt, clamp } from './util.js';
import { noteLoop } from './svg-gl.js';
import { NO_ASC, TILE } from './table-marks.js';
import { restPass } from './rest-pass.js';
import { EASE_ARRIVE, EASE_MOVE, cssCurve } from './ease.js';
import { reduceMotionMQ as reduce } from './motion.js';
import { frameFor } from './frame.js';

const nextFrame = frameFor('presenter');

export function createVisuals({ sv, glBox, est, fitChart, fsOf }) {
// ── Visuals over the dimmed figure ─────────────────
/** One number on a scale with its thresholds: the reflowing key (scaleKey), on every screen.
 *  sc: { key, max, low, marks: [[value, words, short]] }; rows: [{ name, f, site }]. */
// A visual's own patient ({ preset } with its params and days, if any), as one key.
const xKey = (o) => o.preset + (o.params || o.days ? JSON.stringify([o.params, o.days]) : '');
const dig = (k) => TILE[k]?.d ?? 1;
function scaleVisual(sc, rows) {
  return scaleKey(sc, rows);
}

/** The scale as a figure that reflows: short zone names over the band, the cut-offs under it, each patient a
 *  numbered dot gliding to its value, named in a key below (value, name and, with sub, a second reading). */
function scaleKey(sc, rows) {
  const max = sc.max || 20, u = TILE[sc.key]?.u || '', P = (v) => `${(100 * clamp(v, 0, max) / max).toFixed(2)}%`;
  const cuts = [0, ...sc.marks.map(([v]) => v), max];
  const zones = cuts.slice(0, -1).map((a, i) => ({ a, b: cuts[i + 1], c: ['ok', 'mid', 'hi', 'top'][Math.min(i, 3)], t: i ? sc.marks[i - 1][2] || sc.marks[i - 1][1] : sc.low }));   // (a mark's third item: its short name, for the band)
  const span = (z) => `left:${P(z.a)};width:calc(${P(z.b)} - ${P(z.a)})`;
  const cols = `grid-template-columns:${zones.map((z) => `minmax(0, ${z.b - z.a}fr)`).join(' ')}`;
  const pins = rows.filter((r) => r.f).sort((a, b) => a.f[sc.key] - b.f[sc.key]);
  // (each patient takes the colour of the zone it sits in)
  const rate = (r) => (zones.find((z) => r.f[sc.key] < z.b) || zones[zones.length - 1]).c;
  // A second reading or several under each patient (sub: a tile key or a list), pressures in whole mmHg.
  const SUBNAME = { hvpg: 'HVPG', plt: 'Platelets', ppg: 'PPG', pv: 'Portal vein', sin: 'Sinusoids', ra: 'Right atrium', ivc: 'IVC' };
  const sub = (f) => [sc.sub || []].flat().filter((k) => f[k] != null).map((k) => `${SUBNAME[k] || TILE[k]?.t || k} ${fmt(f[k], dig(k))}${TILE[k]?.u ? ` ${TILE[k].u}` : ''}`);
  const box = h('div', { class: 'pz-visual pz-sk', role: 'img', 'aria-label': pins.map((r) => `${r.name} ${fmt(r.f[sc.key], 1)} ${u}`).join(', ') },
    // (the names and the rules sit in columns as wide as their zones, so a long one wraps inside its zone, never into the next)
    h('div', { class: 'pzk-names', 'aria-hidden': 'true', style: cols }, zones.map((z) => h('span', { 'data-rate': z.c }, z.t))),
    h('div', { class: 'pzk-bar', 'aria-hidden': 'true' },
      zones.map((z) => h('i', { 'data-rate': z.c, style: span(z) })),
      sc.marks.map(([v]) => h('b', { style: `left:${P(v)}` })),
      pins.map((r, i) => h('span', { class: 'pzk-dot', 'data-rate': rate(r), style: `--x:${P(r.f[sc.key])};--xq:${P(r.f[sc.key]).replace('%', 'cqw')};--i:${i}` }, String(i + 1)))),
    h('div', { class: 'pzk-axis', 'aria-hidden': 'true' }, [0, ...sc.marks.map(([v]) => v)].map((v) => h('span', { style: `left:${P(v)}` }, String(v))), h('span', { class: 'end' }, `${max}+ ${u}`)),
    // (rules: each zone's rule in words, under its stretch of the axis)
    sc.rules ? h('div', { class: 'pzk-rules', style: cols }, zones.map((z, i) => h('span', { 'data-rate': z.c }, sc.rules[i] || ''))) : null,
    h('ol', { class: 'pzk-key' }, pins.map((r, i) => h('li', { 'data-rate': rate(r), style: `--i:${i}` },
      h('span', { class: 'pzk-n' }, String(i + 1)),
      h('span', { class: 'pzk-v' }, fmt(r.f[sc.key], dig(sc.key)), h('small', {}, ` ${u}`)),
      h('span', { class: 'pzk-name' }, r.name),
      sub(r.f).map((t) => h('span', { class: 'pzk-sub' }, t))))));
  const boxIn = () => box.classList.add('in');
  nextFrame(() => nextFrame(boxIn)); setTimeout(boxIn, 120);
  return box;
}

/** SAAG against ascites protein: the four quadrants numbered on the plot in reading order (1 top left to 4 bottom
 *  right) and named beside it, the model's patients as points (two close together share a point, names stacked). */
const QUADS = [
  { n: 1, x: 0, y: 1, t: 'Not portal: the peritoneum leaks', c: 'Peritoneal cancer · tuberculosis · pancreatic ascites' },
  { n: 2, x: 1, y: 1, t: 'Portal hypertension, open sinusoids', c: 'Heart failure · constrictive pericarditis · early Budd–Chiari' },
  { n: 3, x: 0, y: 0, t: 'Not portal, protein-poor', c: 'Nephrotic syndrome · protein-losing enteropathy' },
  { n: 4, x: 1, y: 0, t: 'Portal hypertension, sealed sinusoids', c: 'Cirrhosis · late Budd–Chiari · massive liver metastases' },
];
function quadrantVisual(rows) {
  // The plot's margins and height follow its lettering (lay): the axis names and ticks take the room they need, and a
  // point's names go to whichever side has room for them.
  const W = 760, R = W - 24;
  let L = 96, B = 548, T = 24;
  const X = (v) => L + (R - L) * clamp(v, 0, 3) / 3, Y = (v) => B - (B - T) * clamp(v, 0, 5) / 5;
  const pts = [];
  for (const r of rows) {
    if (!r.f || r.f.asc < NO_ASC) continue;
    const near = pts.find((p) => Math.abs(p.saag - r.f.saag) < 0.3 && Math.abs(p.tp - r.f.tp) < 0.5);   // (labels that would overlap)
    if (near) near.names.push(r.name); else pts.push({ saag: r.f.saag, tp: r.f.tp, names: [r.name], site: r.site });
  }
  const quads = QUADS.map((q) => { const rect = sv('rect', { 'data-look': 'card.quad.rect' }), n = sv('text', { class: 'pzq-n', 'data-look': 'card.quad.n', 'text-anchor': 'start' }, String(q.n)); return { q, rect, n, g: sv('g', { class: 'pzq-q', 'data-look': 'card.g', 'data-q': String(q.n) }, rect, n) }; });
  const cuts = [sv('line', { class: 'pzq-cut', 'data-look': 'card.quad.cut' }), sv('line', { class: 'pzq-cut', 'data-look': 'card.quad.cut' })], axes = [sv('line', { class: 'pzq-axis', 'data-look': 'card.quad.axis' }), sv('line', { class: 'pzq-axis', 'data-look': 'card.quad.axis' })];
  const xt = [[0, '0'], [1.1, '1.1'], [2, '2'], [3, '3']].map(([v, t]) => ({ v, el: sv('text', { class: 'pzq-t' + (v === 1.1 ? ' on' : ''), 'data-look': 'card.quad.t', 'text-anchor': 'middle' }, t) }));
  const yt = [[0, '0'], [2.5, '2.5'], [5, '5']].map(([v, t]) => ({ v, el: sv('text', { class: 'pzq-t' + (v === 2.5 ? ' on' : ''), 'data-look': 'card.quad.t', 'text-anchor': 'end' }, t) }));
  const axX = sv('text', { class: 'pzq-ax', 'data-look': 'card.quad.ax', 'text-anchor': 'middle' }, 'SAAG, g/dL'), axY = sv('text', { class: 'pzq-ax', 'data-look': 'card.quad.ax', x: 0, y: 0, 'text-anchor': 'middle' }, 'Ascites protein, g/dL');
  const dots = pts.map((p, i) => {
    const circle = sv('circle', { 'data-look': 'card.quad.dot', r: 15 }), names = p.names.map((nm) => sv('text', { 'data-look': 'card.quad.name' }, nm));
    return { p, circle, names, g: sv('g', { class: 'pzq-pt', 'data-look': 'card.quad.pt', 'data-site': p.site || 'none', 'data-i': String(i) }, circle, names) };
  });
  const label = 'SAAG against ascites protein: ' + pts.map((p) => `${p.names.join(' and ')}, SAAG ${fmt(p.saag, 1)}, protein ${fmt(p.tp, 1)}`).join('; ');
  const model = sv('svg', { 'data-look': 'card.root', viewBox: `0 0 ${W} 640`, 'aria-label': label },
    quads.map((q) => q.g), cuts, axes, xt.map((t) => t.el), yt.map((t) => t.el), axX, axY, dots.map((d) => d.g));
  const svg = glBox('pz-quad', model, { role: 'img', 'aria-label': label, style: `aspect-ratio: ${W} / 640` }, 'quad');
  const at = (e, o) => { for (const [k, v] of Object.entries(o)) e.setAttribute(k, typeof v === 'number' ? v.toFixed(1) : v); };
  const lay = (fs) => {
    const t = fs.cap, a = fs.cap, nm = fs.lab, n = fs.val;
    T = Math.max(24, 0.75 * t + 6);   // (room above for the top tick)
    const ax = 2 + a;   // (the rotated name's baseline: its letters rise to the left of it)
    L = ax + 0.3 * a + 8 + est('2.5', t) + 14 + 0.3 * t;   // (the y ticks stand 0.3 letter further out, so the two 0s at the corner never touch at 200 %)
    // (The rotated axis name never stretches the plot to fit long words: in a height-capped box that shrinks the whole chart,
    // which grows the lettering again and never settles. A name too long for the plot drops to its short form.)
    const yName = est('Ascites protein, g/dL', a) + 24 <= 524 ? 'Ascites protein, g/dL' : 'Protein, g/dL';
    if (axY.textContent !== yName) axY.textContent = yName;
    B = T + Math.max(524, est(yName, a) + 24);
    const H = B + 20 + t + 12 + 0.75 * a + 0.3 * a + 6;
    model.setAttribute('viewBox', `0 0 ${W} ${H.toFixed(1)}`);
    if (svg.style.aspectRatio !== `${W} / ${H.toFixed(1)}`) svg.style.aspectRatio = `${W} / ${H.toFixed(1)}`;
    const xs = X(1.1), ys = Y(2.5), box = [[L, T, xs, ys], [xs, T, R, ys], [L, ys, xs, B], [xs, ys, R, B]];
    for (const { q, rect, n: el } of quads) {
      const [x0, y0, x1, y1] = box[(q.y ? 0 : 2) + q.x];
      at(rect, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
      at(el, { x: x0 + 16, y: q.y ? y0 + 0.8 * n + 12 : y1 - 18 - 0.25 * n }); fsOf(el, n);   // (a lower number's foot clear of the axis's ticks)
    }
    at(cuts[0], { x1: xs, x2: xs, y1: T, y2: B }); at(cuts[1], { x1: L, x2: R, y1: ys, y2: ys });
    at(axes[0], { x1: L, x2: R, y1: B, y2: B }); at(axes[1], { x1: L, x2: L, y1: T, y2: B });
    for (const { v, el } of xt) { at(el, { x: X(v), y: B + 10 + 0.8 * t }); fsOf(el, t); }
    for (const { v, el } of yt) { at(el, { x: L - 14 - 0.3 * t, y: Y(v) + 0.36 * t }); fsOf(el, t); }
    at(axX, { x: (L + R) / 2, y: B + 20 + t + 12 + 0.75 * a }); fsOf(axX, a);
    axY.setAttribute('transform', `translate(${ax.toFixed(1)} ${((T + B) / 2).toFixed(1)}) rotate(-90)`); fsOf(axY, a);
    for (const { p, circle, names } of dots) {
      const x = X(p.saag), y = Y(p.tp), w = Math.max(...p.names.map((s) => est(s, nm, 0.62)));
      // (Right of the point, else left of it, else centred above it when neither side has the room.)
      const side = x + 26 + w <= R - 4 ? 'start' : x - 26 - w >= L + 4 ? 'end' : 'middle';
      const nx = side === 'start' ? x + 26 : side === 'end' ? x - 26 : clamp(x, L + w / 2 + 4, R - w / 2 - 4);
      const up = y - 22 - (names.length - 1) * 1.2 * nm, ny = side !== 'middle' ? y + 0.35 * nm - (names.length - 1) / 2 * 1.2 * nm : up - nm > T ? up : y + 22 + 0.8 * nm;
      at(circle, { cx: x, cy: y });
      names.forEach((el, j) => { at(el, { x: nx, y: ny + j * 1.2 * nm, 'text-anchor': side }); fsOf(el, nm); });
      const x0 = side === 'start' ? nx : side === 'end' ? nx - w : nx - w / 2;
      p.box = [x0, ny - 0.8 * nm, x0 + w, ny + (names.length - 1) * 1.2 * nm + 0.3 * nm];
    }
    // (A quadrant's number gives way to a patient's name that reaches its corner; the list beside the plot still numbers them.)
    for (const { n: el } of quads) {
      const x0 = +el.getAttribute('x'), y1 = +el.getAttribute('y'), b = [x0, y1 - 0.8 * n, x0 + 0.7 * n, y1 + 0.2 * n];
      el.style.opacity = dots.some(({ p }) => p.box[0] < b[2] && p.box[2] > b[0] && p.box[1] < b[3] && p.box[3] > b[1]) ? '0' : '';
    }
  };
  lay({ cap: 25, lab: 29, val: 42 });
  // (Each point fades and rises into place in turn (its transition, app.css .pzq-pt), run by the picture once its look is read.)
  for (const { g } of dots) g.style.transform = 'translate(0px, 9px)';
  fitChart(svg, lay, () => restPass(() => { svg.classList.add('in'); model.classList.add('in'); for (const { g } of dots) g.style.transform = 'translate(0px, 0px)'; svg._svgGL.wake(400 + dots.length * 180 + 600); }));
  return h('div', { class: 'pz-visual pz-quadwrap' }, svg,
    h('ol', { class: 'pz-quads' }, QUADS.map((q) => h('li', { 'data-q': String(q.n) },
      h('span', { class: 'qn' }, String(q.n)), h('span', { class: 'qt' }, q.t), h('span', { class: 'qc' }, q.c)))));
}

/** Why a clot before the liver leaves the abdomen dry: the gut's capillary wall holds protein back, so its
 *  oncotic pull holds the fluid in; the sinusoid's wall lets protein through, so pressure becomes lymph. */
function wallsVisual() {
  // Each wall is a panel: its name, a line under it and two lines of what follows are slide text (they wrap and follow
  // the type scale); the drawing between them keeps only the names of its bands, sized from the scale as drawn (lay).
  // Side by side on a wide screen, one above the other on a phone.
  const panel = (sin) => {
    const yW = 236, lumen = [yW + 16, yW + 132], dots = [];
    for (let i = 0; i < 8; i++) dots.push(sv('circle', { class: 'pzw-alb', 'data-look': 'card.walls.alb', cx: 70 + i * 66, cy: lumen[0] + 30 + (i % 3) * 30, r: 8 }));   // (their drift stays in the lumen)
    const cross = [];
    // The sinusoid's wall: six plates with a pore between each; albumin rises through three of them.
    const pores = [104, 202, 300, 398, 496];
    if (sin) for (const x of [pores[0], pores[2], pores[4]]) cross.push(sv('circle', { class: 'pzw-alb pzw-cross', 'data-look': 'card.walls.cross', cx: x, cy: yW + 6, r: 8, style: `--d:${(x / 400).toFixed(2)}s` }));
    // (Each arrow's head is drawn as its own shape at the line's end (the marker's triangle, 5 strokes long, pointing up), so the picture draws it.)
    const sw = sin ? 7 : 4, hs = sw / 2;
    const arrows = (sin ? pores : [170, 430]).map((x) => { const ey = yW - (sin ? 22 : 26); return sv('g', { class: 'pzw-arrow', 'data-look': 'card.g' }, sv('path', { class: 'pzw-flow' + (sin ? ' big' : ''), 'data-look': 'card.walls.flow', d: `M${x} ${yW + 40} V${ey}` }), sv('path', { class: 'pzw-head', 'data-look': 'card.walls.head', d: `M${x - 5 * hs} ${ey + 5 * hs} L${x} ${ey - 5 * hs} L${x + 5 * hs} ${ey + 5 * hs} Z` })); });
    const wall = sin
      ? [0, 1, 2, 3, 4, 5].map((k) => sv('rect', { class: 'pzw-wall', 'data-look': 'card.walls.wall', x: 20 + k * 98, y: yW, width: 70, height: 14, rx: 7 }))
      : [sv('rect', { class: 'pzw-wall', 'data-look': 'card.walls.wall', x: 20, y: yW, width: 560, height: 14, rx: 7 }), sv('rect', { class: 'pzw-bm', 'data-look': 'card.walls.bm', x: 20, y: yW - 9, width: 560, height: 6, rx: 3 })];
    // A band's name, placed in lay: [text, band top, band height, centred in the band].
    const names = sin ? [[sv('text', { class: 'pzw-l', 'data-look': 'card.walls.l', x: 34 }, 'Liver cells'), 108, 42, true], [sv('text', { class: 'pzw-l', 'data-look': 'card.walls.l', x: 34 }, 'Space of Disse: lymph'), 154, 74, false]]
      : [[sv('text', { class: 'pzw-l', 'data-look': 'card.walls.l', x: 34 }, 'Tissue fluid: little'), 108, 120, false]];
    const dotsG = sv('g', { class: 'pzw-dots', 'data-look': 'card.g' }, dots);
    const model = sv('svg', { 'data-look': 'card.root', viewBox: '0 100 600 276' },
      sin ? [sv('rect', { class: 'pzw-hep', 'data-look': 'card.walls.hep', x: 20, y: 108, width: 560, height: 42, rx: 12 }), sv('rect', { class: 'pzw-disse', 'data-look': 'card.walls.disse', x: 20, y: 154, width: 560, height: 74, rx: 8 })]
        : sv('rect', { class: 'pzw-tissue', 'data-look': 'card.walls.tissue', x: 20, y: 108, width: 560, height: 120, rx: 12 }),
      names.map(([t]) => t),
      sv('rect', { class: 'pzw-lumen', 'data-look': 'card.walls.lumen', x: 20, y: lumen[0], width: 560, height: lumen[1] - lumen[0], rx: 10 }),
      dotsG, cross, wall, arrows);
    const draw = glBox('pzw-art', model, { style: 'aspect-ratio: 600 / 276' }, 'walls');
    // The scene keeps moving on the picture (svg-gl noteLoop), as its keyframes did on SVG (app.css pzw-drift, pzw-pulse, pzw-rise): the
    // albumin drifts in the lumen, the flow pulses up through the wall, and in the sinusoid albumin rises through three pores. Reduced
    // motion keeps the pulse and the rise's fade, and nothing travels.
    const still = reduce.matches, eM = cssCurve(EASE_MOVE), eA = cssCurve(EASE_ARRIVE);
    const seg = (k, a, b, f) => f(Math.max(0, Math.min(1, (k - a) / (b - a))));
    noteLoop(dotsG, { ms: 3200, alternate: true, xy: still ? null : (k) => [-30 + 60 * eM(k), 0] });
    for (const g of arrows) noteLoop(g, { ms: 2400, op: (k) => (k < 0.5 ? 0.45 + 0.5 * seg(k, 0, 0.5, eM) : 0.95 - 0.5 * seg(k, 0.5, 1, eM)) });
    for (const c of cross) noteLoop(c, { ms: 2600, delay: 1000 * parseFloat(/--d:([\d.]+)s/.exec(c.getAttribute('style'))?.[1] || 0),
      op: (k) => (k < 0.25 ? seg(k, 0, 0.25, eA) : k < 0.75 ? 1 : 1 - seg(k, 0.75, 1, eA)), xy: still ? null : (k) => [0, 40 - 84 * eA(k)] });
    fitChart(draw, (fs) => { for (const [t, y, hgt, mid] of names) { t.setAttribute('y', (mid ? y + hgt / 2 + 0.36 * fs.cap : y + 8 + 0.75 * fs.cap).toFixed(1)); fsOf(t, fs.cap); } }, () => draw._svgGL.paint());
    return h('div', { class: 'pzw-panel' + (sin ? ' sin' : '') },
      h('div', { class: 'pzw-t' }, sin ? 'Liver sinusoid' : 'Gut capillary'),
      h('div', { class: 'pzw-s' }, sin ? 'Open pores, no basement membrane' : 'Continuous wall, basement membrane'),
      draw,
      h('p', { class: 'pzw-c' }, sin ? 'Protein crosses: nothing holds the fluid back' : 'Protein stays in: its pull holds the fluid back'),
      h('p', { class: 'pzw-c2' }, sin ? 'A rise in pressure becomes lymph at once' : 'A rise in pressure makes little fluid'));
  };
  return h('div', { class: 'pz-visual pz-walls', role: 'img', 'aria-label': 'The gut capillary wall holds protein back; the liver sinusoid lets it through' }, panel(false), panel(true));
}

// ── The off-screen engine ──────────────────────────
// A second engine in its own worker (the main thread when workers are unavailable) computes the slides'
// states, so the live figure keeps running while a presentation is prepared.
function makeCalc() {
  const pending = new Map();
  let seq = 1, post = null, kill = () => {}, broken = false;
  // Every waiting request settles with an error: a page left open across an update can no longer load the engine (its
  // stamped files are gone from the cache and the server), and the presenter says so instead of waiting for ever.
  const fail = (message) => { broken = true; for (const [reqId, p] of pending) p.done({ type: 'error', reqId, message }); pending.clear(); };
  const onMsg = (m) => {
    const p = pending.get(m.reqId);
    if (!p) return;
    if (m.type === 'seqStep') { p.step?.(m); return; }
    pending.delete(m.reqId); p.done(m);
  };
  const ready = (async () => {
    let w = null;
    try {
      w = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
      await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('worker timeout')), 15000);   // (long: a slow load still gets the worker; host.js)
        w.onmessage = (e) => { if (e.data?.type === 'presets') { clearTimeout(t); res(); } };
        w.onerror = (e) => { clearTimeout(t); rej(e); };
        w.postMessage({ type: 'visibility', visible: false });
        w.postMessage({ type: 'run', running: false });
        w.postMessage({ type: 'presets', reqId: 0 });
      });
      w.onmessage = (e) => onMsg(e.data); w.onerror = (e) => { e.preventDefault?.(); fail('the engine stopped'); };
      post = (m) => w.postMessage(m); kill = () => w.terminate();
    } catch {
      if (w) { w.onmessage = w.onerror = null; w.terminate(); }   // (a worker that never said hello: not left running beside the page's own engine)
      try {
        const { createCore } = await import('../worker-core.js');
        const core = createCore((m) => setTimeout(() => onMsg(m), 0));
        core.handle({ type: 'visibility', visible: false }); core.handle({ type: 'run', running: false });
        post = (m) => core.handle(structuredClone(m)); kill = () => core.dispose();
      } catch { fail('the engine could not load'); }
    }
  })();
  const send = async (msg, entry) => {
    await ready;
    if (broken) { entry.done({ type: 'error', reqId: msg.reqId, message: 'the engine is unavailable' }); return; }
    pending.set(msg.reqId, entry); post(msg);
  };
  return {
    request: (type, payload = {}) => new Promise((done) => send({ type, reqId: seq++, ...payload }, { done })),
    sequence: (steps, base, step) => new Promise((done) => send({ type: 'sequence', reqId: seq++, steps, base }, { done, step })),
    kill: () => kill(),
    get broken() { return broken; },
  };
}

  return { scaleVisual, quadrantVisual, wallsVisual, makeCalc, xKey };
}
