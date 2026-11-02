// A figure's names drawn by the GPU (Mohammad, 2 Nov 2026: "Move. Everything. To. GPU."): the sinusoid's captions, their leaders and
// their lit terms' colour, set in script and drawn through the charts' shared GPU context (trace-gl.js, the SDF atlas of text-gl.js), in the
// frame that asks for them. The page keeps its own captions only as a quiet model, for screen readers and for what reads their boxes
// at rest (credit.js, a slide's wait for its names): made clear (app.css .cap-gl-on), and placed between frames, never in one.
//
// The GPU is the source of truth: each caption is numbers kept here (its lines and their looks, its centre, its step aside and its
// scale, whether it shows), and its fades and steps are eased here, on the frame's clock, as the stylesheet's
// transitions eased them (D_SURFACE on the arrive curve). A frame that moves the figure moves its names in the same frame: the owner
// puts their new places and calls paint(), and the names are drawn in that frame's last turn (finalFrame).
//
//   const cap = createCaptionGL(box);            // box: the names' layer (the canvas goes in first, under the page's own names)
//   cap.look(key, look)                         // its type, ink and halo, read between frames (lookOf below)
//   cap.measure(key, lines)                     // lines: per line [[text, kind], ...]; its [w, h] in its look
//   cap.put(key, { x, y, off, show })           // x, y: the box's centre (px); off: [dx, dy, scale]
//   cap.lead(key, { x1, y1, x2, y2, show, colour, of })
//   cap.extra(key, draw)                        // anything else drawn with the names (the legend): draw(ctx, now)
//   cap.box(key) / cap.at(key)                  // its box (px) / where it is drawn now
//   cap.paint()

import { createTraceGL, fitPen } from './trace-gl.js?v=48fdded63b';
import { finalFrameFor, easeNow } from './frame.js?v=1d147c7c9a';
import { measure } from './glyph-measure.js?v=fb732c3b0d';
import { D_SURFACE, easeArrive } from './ease.js?v=dc92422977';
import { cssColor } from './css-color.js?v=59ed182174';

const finalFrame = finalFrameFor('caption-gl');
/** A colour as the page computed it (rgb(), color(srgb …), oklab() from a color-mix, a token's raw value), as rgba() the GPU's pen reads; '' for none. */
export function rgbaOf(c) {
  if (!c || c === 'none' || c === 'transparent') return '';
  const [r, g, b, a] = cssColor(c);
  return a > 0 ? `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${+a.toFixed(4)})` : '';
}
/** An outer box shadow as computed ("<colour> 0px 1px 6px 0px"): { colour, dy, blur }, or null. */
export function shadowOf(s) {
  if (!s || s === 'none' || /\binset\b/.test(s)) return null;
  const m = /^(.*?\))?\s*(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?\s*(.*)$/.exec(s.trim());
  if (!m) return null;
  const colour = rgbaOf((m[1] || m[6] || '').trim());
  return colour ? { colour, dy: +m[3], blur: +m[4] } : null;
}
// Inter's ascent and descent (hhea 1984 and 494 of 2048), as the browser sets a line: its baseline from the line's top.
const ASC = 1984 / 2048, DESC = 494 / 2048;

// ── Eases: a value that glides to each new target from where it stands, as a CSS transition does ──
const easer = (v) => ({ v, from: v, to: v, t0: 0, ms: 0 });
function easeTo(e, to, now, ms = D_SURFACE) {
  if (e.to === to) return;
  e.from = easeAt(e, now); e.to = to; e.t0 = now; e.ms = ms;
}
function easeAt(e, now) {
  if (!e.ms) return e.to;
  const k = (now - e.t0) / e.ms;
  if (k >= 1) { e.ms = 0; e.v = e.to; return e.to; }
  return (e.v = e.from + (e.to - e.from) * easeArrive(Math.max(0, k)));
}
const easing = (e, now) => !!e.ms && now - e.t0 < e.ms;
const snap = (e, v) => { e.v = e.from = e.to = v; e.ms = 0; };

/**
 * A caption's look, read from the page's own caption between frames (getComputedStyle results): `cs` the caption's, `runs` its kinds of
 * run ({ name: cs, ... }: the name's capitals, a reading's figure and its unit). Every number in px, colours as
 * the page computed them.
 */
export function lookOf(cs, runs) {
  const px = (v) => parseFloat(v) || 0;
  const run = (s) => ({ size: px(s.fontSize) || 12, weight: parseFloat(s.fontWeight) || 400, ls: px(s.letterSpacing), fill: rgbaOf(s.color), op: s.opacity === '' || s.opacity == null ? 1 : +s.opacity, upper: s.textTransform === 'uppercase', mr: px(s.marginRight) });
  const lh = cs.lineHeight === 'normal' || !cs.lineHeight ? 1.2 : /px$/.test(cs.lineHeight) ? px(cs.lineHeight) / (px(cs.fontSize) || 12) : px(cs.lineHeight);
  const R = {};
  for (const k in runs) if (runs[k]) R[k] = run(runs[k]);
  return { lh, gap: px(cs.rowGap), halo: px(cs.webkitTextStrokeWidth), haloC: rgbaOf(cs.webkitTextStrokeColor), runs: R };
}
/** The ring of an inset box shadow as computed ("<colour> 0px 0px 0px 2px inset"): { w, colour }, or null. */
export function ringOf(s) {
  if (!s || s === 'none' || !/\binset\b/.test(s)) return null;
  const m = /^(.*?\))?\s*(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s*(.*?)\s*inset\s*$/.exec(s.trim());
  if (!m) return null;
  return { w: +m[5], colour: rgbaOf((m[1] || m[6] || '').trim()) };
}
const fontOf = (r, s) => `${r.weight} ${(r.size * s).toFixed(2)}px Inter`;
const upper = (r, t) => (r.upper ? t.toUpperCase() : t);

/**
 * A caption's lines set in a look: { lines: [{ runs: [{ t, r (its look), x }], w, y, base }], w, h }. `lines`: per line, its runs as
 * [text, kind] (kind: one of the look's runs, as 'name', 'fig', 'unit'); a run of a kind the look does not have is left out.
 */
export function setLines(look, lines) {
  let w = 0, h = 0;
  const out = [];
  for (const spec of lines) {
    let x = 0, top = 0;
    const runs = [];
    for (const [t, kind] of spec) {
      const r = look.runs[kind];
      if (!r || t == null || t === '') continue;
      const u = upper(r, String(t));
      runs.push({ t: u, r, x });
      x += measure(u, fontOf(r, 1)) + r.ls * [...u].length + r.mr;
      top = Math.max(top, r.size);
    }
    if (!runs.length) continue;
    const lw = x - runs.at(-1).r.mr, lh = look.lh * top;
    if (out.length) h += look.gap;
    // (Each run on the line's one baseline, set as the browser sets a line of mixed sizes: the half leading of its largest type.)
    out.push({ runs, w: lw, y: h, base: h + (lh - (ASC + DESC) * top) / 2 + ASC * top });
    w = Math.max(w, lw);
    h += lh;
  }
  return { lines: out, w, h };
}

/** The names' layer in `box`: see above. */
export function createCaptionGL(box) {
  const cv = document.createElement('canvas');
  cv.className = 'cap-gl';
  cv.setAttribute('aria-hidden', 'true');
  box.prepend(cv);
  const items = new Map(), leads = new Map(), extras = new Map(), looks = new Map();
  let ask = 0, gpu = null, drewOnce = false, onDrawn = null, onRest = null, wasMoving = false, lastT = 0;
  function draw() {
    ask = 0;
    if (!cv.isConnected) return;
    const pen = fitPen(cv, gpu), { ctx, w, h } = pen;
    const now = easeNow();
    lastT = now;
    let more = false;
    try {
      ctx.clearRect(0, 0, w, h);
      if (!(w > 0 && h > 0)) return;
      // Leaders under the names, as their layer was.
      for (const L of leads.values()) {
        const a = easeAt(L.a, now) * (L.of ? itemA(L.of, now) : 1);
        more ||= easing(L.a, now);
        if (a <= 0.002 || !L.colour) continue;
        let { x1, y1 } = L;
        const I = L.of && items.get(L.of);
        // (Its near end follows its name's step aside, as eased, to the edge of the smaller box when the name was set smaller.)
        if (I && L.follow) { const s = easeAt(I.s, now); x1 += easeAt(I.dx, now) - L.sg * (I.w / 2) * (1 - s); y1 += easeAt(I.dy, now); }
        ctx.globalAlpha = a * 0.6; ctx.strokeStyle = L.colour; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(L.x2, L.y2); ctx.stroke();
        ctx.globalAlpha = a * 0.8; ctx.fillStyle = L.colour;
        ctx.beginPath(); ctx.arc(L.x2, L.y2, L.r ?? 1.8, 0, Math.PI * 2); ctx.fill();
      }
      for (const I of items.values()) {
        const lk = looks.get(I.key);
        if (!lk || !I.set) continue;
        const a = easeAt(I.a, now), s = easeAt(I.s, now), dx = easeAt(I.dx, now), dy = easeAt(I.dy, now);
        more ||= easing(I.a, now) || easing(I.s, now) || easing(I.dx, now) || easing(I.dy, now);
        if (a <= 0.002) continue;
        const cx = I.x + dx, cy = I.y + dy, bw = I.w * s, bh = I.h * s, l = cx - bw / 2, t = cy - bh / 2;
        // A lit term (a slide's) shows in its colour on the name and figure alone, as the page's look reads it: no pill or chip behind
        // a figure's label (owner, 2 Nov: anatomy-style halo text, no pills).
        // Its words: each run's halo (the page's text stroke, laid first), then its ink, in the page's order.
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        for (const ln of I.set.lines) {
          const x0 = l + (bw - ln.w * s) / 2, by = t + ln.base * s;
          for (const { t: txt, r, x } of ln.runs) {
            const ra = a * r.op;
            ctx.font = fontOf(r, s); ctx.letterSpacing = `${r.ls * s}px`;
            if (lk.halo > 0 && lk.haloC) { ctx.globalAlpha = ra; ctx.strokeStyle = lk.haloC; ctx.lineWidth = lk.halo * s; ctx.strokeText(txt, x0 + x * s, by); }
            ctx.globalAlpha = ra; ctx.fillStyle = r.fill; ctx.fillText(txt, x0 + x * s, by);
          }
        }
        ctx.letterSpacing = '0px';
      }
      ctx.globalAlpha = 1;
      for (const f of extras.values()) if (f(ctx, now)) more = true;
    } finally { ctx.end?.(); }
    if (pen.gpu && !drewOnce) { drewOnce = true; onDrawn?.(); }
    if (more) ask = finalFrame(draw);
    else if (wasMoving) onRest?.();   // (its eases done: the owner may place its page model, between frames)
    wasMoving = more;
  }
  function itemA(key, now) { const I = items.get(key); return I ? easeAt(I.a, now) : 1; }
  gpu = createTraceGL(cv, { redraw: () => api.paint() });
  const api = {
    cv,
    /** Whether the GPU draws the names (WebGL2 and the charts' drawer are here); false: the page's own names must show. */
    get on() { return !!gpu; },
    /** Called once, after the first frame the GPU drew the names. */
    set onDrawn(f) { onDrawn = f; if (drewOnce) f?.(); },
    /** Called after a frame in which the last of its eases ended. */
    set onRest(f) { onRest = f; },
    /** A caption's look (lookOf): its sizes are set again the next time it is measured. */
    look(key, lk) { looks.set(key, lk); api.paint(); },
    hasLook: (key) => looks.has(key),
    /** Sets the lines of a caption in its look, for its size: { w, h } (0 until its look is read). */
    measure(key, lines) {
      const lk = looks.get(key);
      let I = items.get(key);
      if (!I) items.set(key, I = { key, a: easer(0), s: easer(1), dx: easer(0), dy: easer(0), x: 0, y: 0, w: 0, h: 0, shown: false });
      const sig = JSON.stringify(lines);
      if (lk && (I.sig !== sig || I.lk !== lk)) { I.sig = sig; I.lk = lk; I.lines = lines; I.set = setLines(lk, lines); I.w = I.set.w; I.h = I.set.h; }
      else if (!lk) { I.lines = lines; I.sig = ''; }
      return lk ? [I.w, I.h] : [0, 0];
    },
    /**
     * Places a caption: x, y its box's centre (px), off [dx, dy, s] its step aside and scale (eased), show 0 or 1 (eased; a caption seen
     * for the first time fades in).
     */
    put(key, { x, y, off = null, show = 1, now = easeNow() }) {
      const I = items.get(key);
      if (!I) return;
      lastT = now;
      I.x = x; I.y = y;
      if (off) {
        if (!I.placed) { snap(I.dx, off[0]); snap(I.dy, off[1]); snap(I.s, off[2]); }
        else { easeTo(I.dx, off[0], now); easeTo(I.dy, off[1], now); easeTo(I.s, off[2], now); }
      }
      if (I.set) {
        if (!I.placed) { I.placed = true; easeTo(I.a, show, now); }
        else easeTo(I.a, show, now);
        const lk = looks.get(key);
      }
      api.paint();
    },
    /** Hides a caption at once (as a view leaves): it fades in again the next time it is placed. */
    reset(key) { const I = items.get(key); if (I) { I.placed = false; snap(I.a, 0); } },
    lead(key, L) {
      let o = leads.get(key);
      if (!o) leads.set(key, o = { a: easer(L.show ?? 1) });
      Object.assign(o, L);
      if (L.cut) snap(o.a, 0); else easeTo(o.a, L.show ?? 1, easeNow());
      api.paint();
    },
    leadOf: (key) => leads.get(key),
    extra(key, f) { if (f) extras.set(key, f); else extras.delete(key); api.paint(); },
    /** Where a caption is drawn (its box's centre, step aside included) and how much it shows: { x, y, w, h, a }, or null; by default as
     *  of the frame that last placed or drew the names. */
    at(key, now = lastT || easeNow()) {
      const I = items.get(key);
      if (!I) return null;
      const s = easeAt(I.s, now);
      return { x: I.x + easeAt(I.dx, now), y: I.y + easeAt(I.dy, now), w: I.w * s, h: I.h * s, a: easeAt(I.a, now) };
    },
    /** Whether a caption or a leader is still easing. */
    moving(now = easeNow()) {
      for (const I of items.values()) if (easing(I.a, now) || easing(I.s, now) || easing(I.dx, now) || easing(I.dy, now)) return true;
      for (const L of leads.values()) if (easing(L.a, now)) return true;
      return false;
    },
    paint() { if (!ask) ask = finalFrame(draw); },
    /** Draws now, in this frame (the owner's frame moved the figure: its names move with it). */
    drawNow() { if (ask) return; draw(); },
    dispose() { gpu?.dispose?.(); gpu = null; },
  };
  return api;
}
