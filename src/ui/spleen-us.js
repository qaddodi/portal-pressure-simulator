// A spleen ultrasound for a slide's data card (tool: { kind: 'spleen' }): a grey sector on a black panel with the spleen's outline cut
// along its long axis, calipers end to end, and the length written inside the picture in white with a dark outline, as the FibroScan
// reading is. The length is the model's (metrics.spleen.length, a slide's settled number once pinned), so it reads as the slide's tile
// does. It redraws only when the length changes by 0.1 cm and eases between. The platelets go in the slide's tile, not in the picture.

import { h, fitCanvas, clamp, cssAlpha, cssVar } from './util.js?v=d2c95a1b16';
import { FONT } from './charts.js?v=ba4050e8a7';
import { frameFor, cancelFrame } from './frame.js?v=19b3f2915c';
const nextFrame = frameFor('spleen-us');

/** The longest spleen the picture holds (the tile's bar ends at 22 cm); the scale is the same for every length, so a bigger spleen is drawn bigger. */
export const SPLEEN_SCALE_CM = 22;
const THICK = 0.27, BOW = 0.07;   // (half the spleen's thickness and the bow of its long axis, as fractions of its length)

/** The spleen of length `cm` in a w × hh picture: its scale (px per cm), the two ends the calipers meet, and its outline (top edge, then bottom edge back). */
export function spleenShape(cm, w, hh, n = 40) {
  const pxPerCm = Math.min((w * 0.78) / SPLEEN_SCALE_CM, (hh * 0.6) / (2 * THICK * SPLEEN_SCALE_CM * 1.15));
  const cx = w / 2, cy = hh * 0.58, len = cm * pxPerCm;
  const at = (u, side) => {   // u from -1 to 1 along the axis
    const t = Math.sqrt(Math.max(0, 1 - u * u)), mid = BOW * len * (1 - u * u);
    return { x: cx + (u * len) / 2, y: cy + mid + side * THICK * len * t };
  };
  const top = [], bottom = [];
  for (let i = 0; i <= n; i++) { const u = -1 + (2 * i) / n; top.push(at(u, -1)); bottom.push(at(-u, 1)); }
  return { pxPerCm, cx, cy, len, a: at(-1, 0), b: at(1, 0), outline: [...top, ...bottom] };
}

/** The length the calipers measure on a shape, in cm. */
export const caliperCm = (s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / s.pxPerCm;

const seeded = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE_S = 0.22;   // seconds for the length to settle on a new reading

export function createSpleenUS() {
  const cv = h('canvas', { role: 'img', 'aria-label': 'Spleen ultrasound' });
  const el = h('div', { class: 'chart-box spleen-box' }, cv);
  let goal = null, shown = null, raf = 0, last = 0, pinned = null, speck = null;
  const reading = () => (shown == null ? '—' : shown.toFixed(1));

  // Speckle: a fixed scatter for this picture's size, so the texture holds still while the spleen grows under it.
  function scatter(w, hh) {
    if (speck && speck.w === w && speck.h === hh) return speck.dots;
    const r = seeded(7), dots = [];
    for (let i = 0, n = Math.round((w * hh) / 38); i < n; i++) dots.push([r() * w, r() * hh, 0.5 + r() * 0.5, r() < 0.35 ? 1.4 : 1]);
    speck = { w, h: hh, dots };
    return dots;
  }
  function draw() {
    const { ctx, w, h: hh } = fitCanvas(cv);
    if (w < 80 || hh < 60) return;
    ctx.clearRect(0, 0, w, hh);
    const white = (a) => cssAlpha('--white', a), black = (a) => cssAlpha('--black', a);
    const rr = (x, y, ww, hh2, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, ww, hh2, r) : ctx.rect(x, y, ww, hh2); };
    // The monitor's black, in both themes; the picture is clipped to its rounded corners.
    rr(0, 0, w, hh, 12); ctx.fillStyle = cssVar('--mon-bg'); ctx.fill();
    ctx.save(); rr(0, 0, w, hh, 12); ctx.clip();
    // The sector: the probe's apex above the top edge, the fan opening downward.
    const ax = w / 2, ay = -hh * 0.08, spread = (40 * Math.PI) / 180, rad = hh * 1.1 - ay;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.arc(ax, ay, rad, Math.PI / 2 - spread, Math.PI / 2 + spread); ctx.closePath();
    ctx.fillStyle = white(0.07); ctx.fill();
    ctx.save(); ctx.clip();
    const dots = scatter(w, hh);
    ctx.fillStyle = white(0.16);
    for (const [x, y, a, s] of dots) if (a > 0.5) ctx.fillRect(x, y, s, s);
    const s = shown != null && shown > 0.4 ? spleenShape(shown, w, hh) : null;
    if (s) {
      // The spleen: a denser echo than the fan round it, a bright capsule along its edge.
      ctx.beginPath(); s.outline.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y)); ctx.closePath();
      ctx.fillStyle = white(0.2); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = white(0.3);
      for (const [x, y, a, sz] of dots) if (a > 0.18) ctx.fillRect(x, y, sz, sz);
      ctx.restore();
      ctx.lineJoin = 'round'; ctx.strokeStyle = white(0.62); ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
    // Words and calipers: white with a dark outline, as the FibroScan's reading is. Never under 12 px.
    const fs = parseFloat(getComputedStyle(cv).fontSize) || 12, cap = Math.max(12, Math.round(clamp(fs * (w / (cv.offsetWidth || w)), 12, 20)));
    ctx.lineJoin = 'round'; ctx.strokeStyle = black(0.7);
    if (s) {
      const m = Math.max(5, cap * 0.45);
      ctx.lineCap = 'round';
      // Calipers: a dotted line end to end and a + on each end.
      ctx.save(); ctx.strokeStyle = white(0.95); ctx.lineWidth = 1.25; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke(); ctx.setLineDash([]);
      for (const p of [s.a, s.b]) { ctx.beginPath(); ctx.moveTo(p.x - m, p.y); ctx.lineTo(p.x + m, p.y); ctx.moveTo(p.x, p.y - m); ctx.lineTo(p.x, p.y + m); ctx.stroke(); }
      ctx.restore();
    }
    // The length, big, in the top right corner; "cm" small beside it, right aligned so it never moves while the number eases.
    const big = Math.round(clamp(Math.min(cap * 4, hh * 0.3, w * 0.26), 24, 72)), edge = Math.max(10, Math.round(big * 0.4));
    ctx.fillStyle = white(0.96); ctx.textAlign = 'right';
    if (shown != null && shown > 0.4) {
      ctx.lineWidth = Math.max(3, big * 0.16);
      ctx.font = FONT(500, Math.round(cap * 1.4)); const ux = w - edge;
      ctx.strokeText('cm', ux, edge + Math.round(big * 0.74)); ctx.fillText('cm', ux, edge + Math.round(big * 0.74));
      const uw = ctx.measureText('cm').width;
      ctx.font = FONT(600, big); ctx.strokeText(reading(), ux - uw - 5, edge + Math.round(big * 0.74)); ctx.fillText(reading(), ux - uw - 5, edge + Math.round(big * 0.74));
    } else if (shown != null) {
      ctx.textAlign = 'center'; ctx.lineWidth = Math.max(3, cap * 0.3); ctx.font = FONT(600, Math.round(cap * 1.4));
      ctx.strokeText('Spleen removed', w / 2, hh * 0.58); ctx.fillText('Spleen removed', w / 2, hh * 0.58);
    }
    ctx.textAlign = 'left';
    rr(0.5, 0.5, w - 1, hh - 1, 12); ctx.strokeStyle = cssVar('--mon-line'); ctx.lineWidth = 1; ctx.stroke();
    const label = shown != null && shown > 0.4 ? `Spleen ultrasound, ${reading()} cm long` : 'Spleen ultrasound, no spleen';
    if (cv.getAttribute('aria-label') !== label) cv.setAttribute('aria-label', label);
  }
  // The length eases to a new reading over a fraction of a second, drawn on each frame it moves; at rest nothing is redrawn.
  function step(now) {
    raf = 0;
    const dt = clamp((now - last) / 1000, 0, 0.1); last = now;
    if (shown == null || goal == null) return;
    shown = Math.abs(goal - shown) < 0.03 ? goal : shown + (goal - shown) * (1 - Math.exp(-dt / EASE_S));
    draw();
    if (shown !== goal && el.isConnected) raf = nextFrame(step);
  }
  function aim(cm) {
    if (!Number.isFinite(cm)) return;
    const want = +cm.toFixed(1);
    if (goal != null && Math.abs(want - goal) < 0.1 - 1e-9) return;   // (redrawn only when the length changes by 0.1 cm)
    goal = want;
    if (shown == null || REDUCED) { shown = goal; draw(); return; }
    if (!raf && el.isConnected) { last = performance.now(); raf = nextFrame(step); }
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!raf) draw(); }) : null;
  ro?.observe(cv);
  return {
    id: 'spleen', label: 'Spleen ultrasound', el,
    update(f) { if (pinned == null) aim(f.metrics?.spleen?.length); },
    // A slide's settled number: the tile's and the words', not the live value.
    pin(fp) { pinned = fp?.spleen ?? null; if (pinned != null) aim(pinned); },
    dispose() { cancelFrame(raf); raf = 0; ro?.disconnect(); },
  };
}
