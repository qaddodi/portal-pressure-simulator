// The SAAG and ascitic protein plane (Mohammad's review, 15 Nov 2026; mock "Teaching Card Mocks"): one instrument card, in the instrument card's slot on every device,
// that puts the ascitic fluid's two numbers where they point at the cause. SAAG stands on the vertical axis with its cut-off, 1.1 g/dL, and the protein on the
// horizontal with its, 2.5 g/dL (ascites-cuts.js, the one copy; AASLD 2021 Table 4). The patients are points read from their slides' own settled states
// (tool { kind: 'saag', of: [{ id, name }], own?, extra? }: the slide's `of`, as a summary visual's), so a point is the patient the case slide showed; `own` names the
// one the slide is about (filled in full ink); `extra` are causes the model does not simulate ({ name, saag, tp }: an open ring, said to be not modeled).
// A patient with no fluid to tap has no point. Drawn on the GPU as the other cards' pictures are (svg-gl.js), again only when the width, the type size or a
// point changes.

import { h } from './util.js';
import { createSvgGL, svgModel } from './svg-gl.js';
import { fittedType } from './chart-ctx.js';
import { measure } from './glyph-measure.js';
import { readMetric } from './layout-snap.js';
import { wrapWords } from './tool-trial.js';
import { TYPE } from './chart-looks/saag.js';
import { SAAG_PORTAL, TP_HIGH, saagPortal, tpHigh } from '../engine/ascites-cuts.js';
import { NO_ASC } from './table-marks.js';
import { fmt } from './util.js';
import { cardShow } from './card-show.js';

export const SAAG_MAX = 3, TP_MAX = 5;   // (the axes' ends, g/dL)
export const SOURCE = 'AASLD 2021 ascites guidance, Table 4.';
export const ZONE_WORDS = { portal: 'Portal hypertension', none: 'No portal hypertension' };
/** What a patient's two numbers say, in a line (the slide's own patient): SAAG at the cut-off or over is portal hypertension, and its protein tells which kind. */
export function readingOf(saag, tp) {
  const a = fmt(saag, 1), b = fmt(tp, 1);
  if (!saagPortal(+a)) return `SAAG ${a} is under ${SAAG_PORTAL}: portal hypertension is not the cause. Look for peritoneal disease.`;
  return tpHigh(+b) ? `SAAG ${a} with protein ${b}, over ${TP_HIGH}: portal hypertension with a protein-rich fluid points to the heart or the hepatic veins.`
    : `SAAG ${a} with protein ${b}: portal hypertension with a low-protein fluid, the pattern of cirrhosis.`;
}

/** The patients of a slide as points: rows [{ name, f }] (f: a fingerprint or null) and the extra causes, those with fluid to tap. */
export function pointsOf(rows, extra = [], own = null) {
  const out = [];
  for (const r of rows) {
    const f = r.f;
    if (!f || !Number.isFinite(f.saag) || !Number.isFinite(f.tp) || !(f.asc >= NO_ASC)) continue;
    out.push({ id: r.id, name: r.name, saag: f.saag, tp: f.tp, own: !!own && r.id === own, modeled: true });
  }
  for (const x of extra) if (Number.isFinite(x?.saag) && Number.isFinite(x?.tp)) out.push({ id: x.id || x.name, name: x.name, saag: x.saag, tp: x.tp, own: false, modeled: false });
  return out;
}
/** The card's words for a screen reader. */
export const saagWords = (pts) => `SAAG against ascitic fluid protein, g/dL. ${pts.length ? pts.map((p) => `${p.name}${p.modeled ? '' : ' (not modeled)'}: SAAG ${fmt(p.saag, 1)}, protein ${fmt(p.tp, 1)}`).join('; ') : 'No patient with fluid to tap.'}.`;

/** The plane's drawing at width W, base type size f. Pure: pts → { texts, rects, paths, H, plot }. meas(text, font) → px. */
export function saagLayout(W, f, meas, pts, { read = null, source = true } = {}) {
  const texts = [], rects = [], paths = [];
  const px = (look) => TYPE[look][1] * f, font = (look) => `${TYPE[look][0]} ${px(look)}px Inter`;
  const say = (x, y, t, look, anchor = 'start') => texts.push({ x, y, t, look, anchor });
  const tk = px('saag.ax'), axl = px('saag.axl'), ql = px('saag.ql'), pl = px('saag.pl'), pls = px('saag.pls');
  const L = Math.ceil(meas('0.0', font('saag.ax')) + f * 0.9), R = Math.ceil(f * 0.5), T = Math.ceil(axl * 1.5);
  const pw = W - L - R, ph = Math.round(Math.min(Math.max(pw * 0.62, 130), 280));
  const X = (p) => L + (Math.min(Math.max(p, 0), TP_MAX) / TP_MAX) * pw, Y = (s) => T + (1 - Math.min(Math.max(s, 0), SAAG_MAX) / SAAG_MAX) * ph;
  const r = Math.max(4, Math.round(f * 0.4)), rc = Math.round(r * 1.3);
  // The zones: portal hypertension (SAAG over its cut-off) in two, split at the protein cut-off
  const yc = Y(SAAG_PORTAL), xc = X(TP_HIGH);
  rects.push({ x: L, y: T, w: xc - L, h: yc - T, r: 4, look: 'saag.zone' }, { x: xc, y: T, w: L + pw - xc, h: yc - T, r: 4, look: 'saag.zone.hi' });
  paths.push({ d: `M${L} ${yc.toFixed(2)} H${(L + pw).toFixed(2)}`, look: 'saag.cut' }, { d: `M${xc.toFixed(2)} ${T} V${(T + ph).toFixed(2)}`, look: 'saag.cut' });
  paths.push({ d: `M${L} ${T} V${T + ph} H${L + pw}`, look: 'saag.axis' });
  say(L + f * 0.4, T + ql * 1.15, ZONE_WORDS.portal, 'saag.ql');
  say(L + f * 0.4, T + ph - ql * 0.4, ZONE_WORDS.none, 'saag.ql');
  // Ticks: the SAAG's at 0, its cut-off and 3; the protein's at 0, its cut-off and the end
  for (const s of [0, SAAG_PORTAL, SAAG_MAX]) say(L - f * 0.4, Y(s) + tk * 0.34, String(s), 'saag.ax', 'end');
  for (const p of [0, TP_HIGH, TP_MAX]) say(X(p), T + ph + tk * 1.15, String(p), 'saag.ax', 'middle');
  say(L, axl * 0.9, 'SAAG, g/dL', 'saag.axl');
  say(L + pw / 2, T + ph + tk * 1.15 + axl * 1.35, 'Ascitic protein, g/dL', 'saag.axl', 'middle');
  let y = T + ph + tk * 1.15 + axl * 1.35 + f * 0.3;
  // The patients: a point and its name, to its right where the name fits inside the card, else to its left; names that would touch are moved apart
  const placed = pts.map((p) => ({ p, x: X(p.tp), y: Y(p.saag), w: Math.max(meas(p.name, font('saag.pl')), p.modeled ? 0 : meas('not modeled', font('saag.pls'))), rr: p.own ? rc : r }));
  for (const q of placed) q.side = q.x + q.rr + f * 0.35 + q.w <= W ? 'start' : 'end';
  const lh = pl * 1.2 + pls * 1.2;
  placed.sort((a, b) => a.y - b.y);
  placed.forEach((q, i) => {
    q.ly = q.y;
    for (let j = 0; j < i; j++) {
      const o = placed[j];
      if (o.side === q.side && Math.abs(o.ly - q.ly) < (q.p.modeled && o.p.modeled ? pl * 1.25 : lh) && Math.abs(o.x - q.x) < Math.max(o.w, q.w) + f * 3) q.ly = o.ly + (o.p.modeled ? pl * 1.25 : lh);
    }
    q.ly = Math.min(Math.max(q.ly, T + pl * 0.8), T + ph - pls * 0.4);
  });
  for (const q of placed) {
    const d = q.rr * 2;
    if (q.p.modeled) rects.push({ x: q.x - q.rr, y: q.y - q.rr, w: d, h: d, r: q.rr, look: q.p.own ? 'saag.pt.cur' : 'saag.pt' });
    else rects.push({ x: q.x - q.rr + 0.75, y: q.y - q.rr + 0.75, w: d - 1.5, h: d - 1.5, r: q.rr - 0.75, look: 'saag.ptx' });
    const tx = q.side === 'start' ? q.x + q.rr + f * 0.35 : q.x - q.rr - f * 0.35;
    say(tx, q.ly + pl * 0.34, q.p.name, 'saag.pl', q.side);
    if (!q.p.modeled) say(tx, q.ly + pl * 0.34 + pls * 1.2, 'not modeled', 'saag.pls', q.side);
  }
  if (read) {
    const rl = wrapWords(read, W, px('saag.read'), TYPE['saag.read'][0], meas, 4), rh = px('saag.read') * 1.32;
    rl.forEach((l, i) => say(0, y + px('saag.read') * 0.9 + i * rh, l, 'saag.read'));
    y += rl.length * rh + f * 0.3;
  }
  if (source) {
    const sl = wrapWords(SOURCE, W, px('saag.src'), TYPE['saag.src'][0], meas, 2);
    sl.forEach((l, i) => say(0, y + px('saag.src') * (0.9 + i * 1.3), l, 'saag.src'));
    y += sl.length * px('saag.src') * 1.3;
  }
  return { texts, rects, paths, H: Math.ceil(y + f * 0.2), plot: { L, T, pw, ph } };
}

const sv = svgModel;
/** The card: configure(t, ctx) reads the slide's patients from the context (ctx.fpOf, the slide's `of`) and draws; drawn again only when a point or the size changes. */
export function createSaag() {
  const el = h('div', { class: 'pz-saag', role: 'group' });
  const gl = createSvgGL(el, { host: 'saag' }), put = cardShow(gl);
  let pts = [], read = null, drawn = '', dead = false, tool = null, ctx0 = null, poll = 0, tries = 0;
  const textW = (s, font) => measure(s, font);
  function draw() {
    const W = Math.round(readMetric(el, 'clientWidth') || 0);
    if (dead || !W || !el.isConnected) return;
    const f = fittedType(el, gl, 12);
    const key = `${W}|${f}|${pts.map((p) => `${p.name}:${p.saag.toFixed(1)}:${p.tp.toFixed(1)}:${p.own ? 1 : 0}`).join(',')}`;
    if (key === drawn) return;
    drawn = key;
    const L = saagLayout(W, f, textW, pts, { read });
    const kids = [
      ...L.rects.map((r) => sv('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: r.r, 'data-look': r.look })),
      ...L.paths.map((p) => sv('path', { d: p.d, 'data-look': p.look })),
      ...L.texts.map((s) => sv('text', { x: s.x, y: s.y, 'text-anchor': s.anchor, 'data-look': s.look }, s.t)),
    ];
    // (A patient's dot at its new place, or another slide's patients, glide there; a new width or type size is put down, card-show.js.)
    put(sv('svg', { width: W, height: L.H, viewBox: `0 0 ${W} ${L.H}`, role: 'img', 'aria-label': saagWords(pts) }, ...kids), `${W}|${f}`);
    el.style.height = `${L.H}px`;
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(el);
  // (The slide's rows are other slides' settled states: read as the slide lands, and again until each has come, as the plane panel does, ext-panels.js.)
  function gather() {
    poll = 0;
    if (dead || !tool) return;
    const of = Array.isArray(ctx0?.slide?.of) ? ctx0.slide.of : [];
    const rows = of.map((o) => { const x = typeof o === 'string' ? { id: o } : o; return { id: x.id, name: x.name || x.title || ctx0.slide?.title || x.id, f: x.id ? ctx0.fpOf?.(x.id) ?? null : null }; });
    pts = pointsOf(rows, tool.extra || [], tool.own || null);
    const own = pts.find((p) => p.own);
    read = own ? readingOf(own.saag, own.tp) : null;
    el.setAttribute('aria-label', saagWords(pts));
    draw();
    if (rows.some((r) => !r.f) && tries++ < 100) poll = setTimeout(gather, 300);
  }
  return {
    el,
    configure(t, ctx = null) { tool = t || null; ctx0 = ctx; tries = 0; drawn = ''; clearTimeout(poll); gather(); },
    clear() {},
    dispose() { dead = true; clearTimeout(poll); ro?.disconnect(); gl.dispose?.(); },
  };
}
