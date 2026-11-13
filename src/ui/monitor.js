// The one pressure monitor (Mohammad, 13 Nov 2026: "why do we have multiple monitors with multiple ways to measure. standardize"; "this specifically",
// the HVPG catheter tracing). Every measurement in the app draws on this monitor, the same way: the HVPG procedure pane (Measure › HVPG), the HVPG
// talk's catheter tracing card and the measurement card of a procedure slide (the HVPG, the EUS-PPG, the PPG by IR and the PPG through a TIPS). A
// dark bedside screen, both themes: the header names what the tip reads and gives ONE big number, the live reading; under it the trace, swept as the
// procedure's clock runs, with its beat and breath, a marker dropping onto the trace where each reading is taken, each reading's level and name at the
// right once taken, and the gradient as a bracket between the two with its pill in its cut-off colour.
//
// What differs between measurements is only their script (the procedure's clock, what the tip reads when, its colours and words): a script is
// { heads, win: [t0, t1], at(t, v, wave), lv(t, v), segs, status(t, v, st, out), drops, levels, result, ticks, target?, notes, ymax(v) }, every time
// on the script's own clock (ms). The HVPG catheter's script is hvpg-proc.js's; the procedure scripts are tool-reading.js's.
// Drawn by the GPU through trace-gl.js's 2D context (fitPen), every word, line and fill; with no GPU, on the canvas as before.

import { fmt, clamp, cssVar } from './util.js';
import { FONT } from './charts.js';
import { ease, k01 } from './hvpg-clock.js';
import { fitPen } from './trace-gl.js';
import { traceRoom, TRACE_MIN } from './trace-room.js';
import { drawCallout, dropK, sideFor, calloutCell, calloutText, inkSeg } from './trace-callouts.js';

// The monitor's colours, dark in both themes (theme-tokens.js --mon-*; a reading's are the dark looks' trace colours, theme-tokens.js DARK_TRACE).
export const MON_TOKENS = { bg: '--mon-bg', grid: '--mon-grid', line: '--mon-line', text: '--mon-text', bright: '--mon-bright',
  free: '--mon-free', wedge: '--mon-wedge', pv: '--mon-pv', ivc: '--mon-ivc', ok: '--mon-ok', caution: '--mon-caution', danger: '--mon-alarm' };
export const C = Object.defineProperties({}, Object.fromEntries(Object.entries(MON_TOKENS).map(([k, n]) => [k, { get: () => cssVar(n) }])));
// The HVPG catheter's words on the monitor: its header, longest form first, and its notes before the tip is in, while it waits for the hepatic vein and while it
// probes a thrombosed ostium. One table for Measure › HVPG (hvpg-proc.js) and the procedure slide's card (tool-reading.js): unification audit, finding 1.
export const HVPG_TEXT = {
  heads: ['CATHETER TIP PRESSURE · RIGHT HEPATIC VEIN · mmHg', 'CATHETER TIP PRESSURE · mmHg', 'CATHETER TIP · mmHg'],
  notes: {
    idle: ['The tracing starts once the tip is in the hepatic vein.', 'Starts once the tip is in the hepatic vein.', 'Starts in the hepatic vein.'],
    wait: ['Waiting for the hepatic vein.'],
    probe: ['Probing the ostium: the vein cannot be cannulated.', 'The vein cannot be cannulated.'],
  },
};
/** A gradient card's title, one rule for every card this monitor draws (unification audit, finding 1): the HVPG's reads "HVPG, catheter tracing", every other
 *  measurement "Pressure tracing". id: the script's id (tool-reading.js SCRIPT_IDS: 'hvpg', 'eus', 'ppg', 'tips'); the HVPG catheter's card (tool-hvpg.js) is 'hvpg'. */
export const monitorTitle = (id) => (id === 'hvpg' ? 'HVPG, catheter tracing' : 'Pressure tracing');
/** A rating's colour key (pressure-cuts.js hvpgSev / ppgSev: ok, caution, danger). */
export const SEV_C = { ok: 'ok', caution: 'caution', danger: 'danger' };

// A number's text, rebuilt only when the number is not the one it was built from (a cell is { v, s }).
export const cell = () => ({ v: undefined, s: '' });
export function fm1(c, v) {
  if (!Object.is(c.v, v)) { c.v = v; c.s = fmt(v, 1); }   // alloc-rare: only when the number differs from the one its text was built from
  return c.s;
}
/** The first of the lines whose width fits, else the last (the shortest form). */
export function fitLine(ctx, list, room) {
  let q = list[0];
  for (let i = 0; i < list.length; i++) { q = list[i]; if (i === list.length - 1 || ctx.measureText(q).width <= room) break; }
  return q;
}
const tickText = [];   // (an axis number's text, by the number: made the first time it is drawn)
const tick = (p) => tickText[p] ?? (tickText[p] = String(p));   // alloc-rare: only the first time that number is drawn
export function rrect(ctx, x, y, w, h2, r) {
  // (The same rounded outline as the arcs below, as one rounded box: the GPU draws it with a smooth edge.)
  if (ctx.onGPU === true && ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h2, r); return; }
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h2, r); ctx.arcTo(x + w, y + h2, x, y + h2, r);
  ctx.arcTo(x, y + h2, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// What monitorNote keeps for each note it has drawn: its words wrapped for one width and font, so a frame measures once and wraps never.
const noteWrap = new Map();   // text → { maxW, probe, tw, lines }
const NOTE_BOX = { x: 0, y: 0, w: 0, h: 0, lines: null };
let FS = 12;   // the monitor's word size this frame (traceRoom's fs: 12 on a small monitor, up to 15 on a wide one)
/** A note on the monitor, centred between x0 and x1 about cy, wrapped at word breaks to that width (the current font, 16 px
 *  lines), on a patch of the monitor's own background 8 px wider and 4 px taller than the words each side. Returns its box (a kept
 *  object, valid until the next note). The wrap is redone only when the width, or the width the font gives the whole text, changes. */
export function monitorNote(ctx, text, x0, x1, cy) {
  const pad = 8, padY = 4, lh = FS + 4, maxW = Math.max(40, x1 - x0 - 2 * pad);
  let e = noteWrap.get(text);
  if (!e) noteWrap.set(text, e = { maxW: -1, probe: -1, tw: 0, lines: [] });   // alloc-rare: only the first time this note's words are drawn
  const probe = ctx.measureText(text).width;
  if (e.maxW !== maxW || e.probe !== probe) {
    e.maxW = maxW; e.probe = probe;
    const measure = (q) => ctx.measureText(q).width;   // alloc-rare: only when the note's width or font changed (the wrap is kept in e)
    const lines = wrapWords(text, maxW, measure, e.lines);
    let widest = -Infinity;
    for (let i = 0; i < lines.length; i++) widest = Math.max(widest, measure(lines[i]));
    e.tw = Math.min(maxW, widest);
  }
  const lines = e.lines;
  const tw = e.tw;
  const bw = tw + 2 * pad, bh = lines.length * lh + 2 * padY, bx = (x0 + x1) / 2 - bw / 2, by = cy - bh / 2;
  ctx.fillStyle = C.bg; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], (x0 + x1) / 2, by + padY + lh * (i + 0.5));
  ctx.textBaseline = 'alphabetic';
  NOTE_BOX.x = bx; NOTE_BOX.y = by; NOTE_BOX.w = bw; NOTE_BOX.h = bh; NOTE_BOX.lines = lines;
  return NOTE_BOX;
}
/** Words into lines no wider than maxW (measure: a line's width); a single word longer than that keeps a line to itself.
 *  out: the list to fill (emptied first) and return; without one, a new list. */
export function wrapWords(text, maxW, measure, out = []) {   // alloc-rare: the default list only for a caller with none; monitorNote hands its own
  out.length = 0;
  let cur = '';
  // alloc-rare: wrapping runs only when monitorNote sees a new text, width or font (its wrap is kept)
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const next = cur ? cur + ' ' + word : word;   // alloc-rare: the same, a changed note
    if (cur && measure(next) > maxW) { out.push(cur); cur = word; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

// The axes of the frame being drawn (set by monOn; the draw is synchronous and does not call itself).
let axTop = 0, axBot = 0, axMax = 15, axL = 0, axR = 0, axT0 = 0, axT1 = 1;
const Y = (p) => axBot - (clamp(p, 0, axMax) / axMax) * (axBot - axTop);
const X = (tt) => axL + k01(tt, axT0, axT1) * (axR - axL);
const ST = { label: '', num: '', col: 'text' };   // (what a script's status writes: kept, written in place)

/** Draw script S's monitor on canvas cv (g: the GPU drawer, trace-gl.js, or null). st: { ph: 'idle' (no tip yet: its note), 'enter' (on its way:
 *  its note), 'abort' (the vein will not take it), 'run' (the trace); t: ms on the script's clock; v: the readings the script reads; running: the
 *  procedure still sweeping; wave: the beat and breath the trace's waves follow (hvpg-clock.js), null: the script's own clock's; blocked, probing }. */
export function drawMonitor(cv, g, S, st) {
  const p = fitPen(cv, g);
  try { monOn(p, S, st); } finally { p.ctx.end?.(); }
}

function monOn({ ctx, w, h: hh }, S, st) {
  if (w < 80 || hh < 60) return;
  const { ph, t, v, wave } = st;
  ctx.clearRect(0, 0, w, hh);
  rrect(ctx, 0, 0, w, hh, 12); ctx.fillStyle = C.bg; ctx.fill();
  const x = 14, y = 10, W = w - 28, H = hh - 18;
  const narrow = W < 300;
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  // (Every word on the monitor at 12 px or more; the header takes the longest form that clears the big reading.)
  const { big, fs, k: HK } = traceRoom(W, H, 10); FS = fs;
  ctx.font = FONT(700, big); const room = W - ctx.measureText('88.8').width - 12;
  ctx.fillStyle = C.text; ctx.font = FONT(600, FS);
  ctx.fillText(fitLine(ctx, S.heads, room), x, y + 13 * HK);
  if (ph === 'abort') {
    const [title, line, sub] = S.abort;
    ctx.font = FONT(600, FS); ctx.fillStyle = C.danger; ctx.fillText('Aborted', x, y + 32 * HK);
    ctx.textAlign = 'center'; ctx.font = FONT(600, FS); ctx.fillText(narrow ? title : line, w / 2, hh / 2 + 8);
    ctx.fillStyle = C.text; ctx.font = FONT(500, FS); ctx.fillText(sub, w / 2, hh / 2 + 28);
    return;
  }
  ST.label = ''; ST.num = ''; ST.col = 'text';
  if (ph === 'idle') ST.label = 'Ready';
  else if (ph === 'enter') ST.label = S.enterWord || 'Catheter advancing';
  else S.status(t, v, st, ST);
  const col = C[ST.col] || C.text;
  ctx.font = FONT(600, FS); ctx.fillStyle = ST.col === 'text' ? C.bright : col; ctx.fillText(ST.label, x, y + 32 * HK);
  if (ST.num) { ctx.font = FONT(700, big); ctx.textAlign = 'right'; ctx.fillText(ST.num, x + W, y + 14 + big); ctx.textAlign = 'left'; }
  const { top, bot } = traceRoom(W, H, y), L = x + Math.round(FS * 1.8), R = x + W - (narrow ? 2 : Math.round(FS * 4.2));
  const note = st.probing ? S.notes.probe : ph === 'idle' ? S.notes.idle : S.notes.wait;
  if (bot - top < TRACE_MIN) {
    // (Too short for the tracing, a phone held sideways: its note alone, in the longest form that fits, so the box is never
    // blank under "Ready". Sweep batch 03, shot 03.)
    if (ph !== 'idle' && ph !== 'enter') return;
    ctx.font = FONT(500, FS);
    const ty = Math.min(hh - 12, Math.max(y + 54, (y + 40 + hh) / 2));
    monitorNote(ctx, fitLine(ctx, note, W - 16), x + 8, x + W - 8, ty - 4);
    return;
  }
  const ymax = S.ymax(v);
  axTop = top; axBot = bot; axMax = ymax; axL = L; axR = R; axT0 = S.win[0]; axT1 = S.win[1];
  ctx.lineWidth = 1; ctx.font = FONT(500, FS); ctx.fillStyle = C.text; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let p = 0; p <= ymax; p += 5) {
    ctx.fillStyle = p ? C.grid : C.line; ctx.fillRect(L, Math.round(Y(p)), R - L, 1);   // (boxes, not stroked lines: see inkSeg)
    if (p % 10 === 0 || ymax <= 20) { ctx.fillStyle = C.text; ctx.fillText(tick(p), L - 5, Y(p)); }
  }
  if (ph === 'idle' || ph === 'enter') {
    // (Wrapped inside the grid, 8 px clear of the axis numbers and the monitor's right edge, on a solid patch of the monitor
    // so no gridline runs through it: sweep 2 review items 14 and 15.)
    ctx.font = FONT(500, FS);
    monitorNote(ctx, note[0], L + 8, Math.min(R, x + W) - 8, (top + bot) / 2);
    return;
  }
  // A target the gradient is read against (after a TIPS: <12 mmHg), a dashed line under the trace.
  if (S.target) {
    const ty = Math.round(Y(S.target)), dash = 6, gap = 5;
    ctx.fillStyle = C.caution; ctx.globalAlpha = 0.7;
    for (let xx = L; xx < R; xx += dash + gap) ctx.fillRect(xx, ty, Math.min(dash, R - xx), 1);
    ctx.globalAlpha = 1;
    if (!narrow) { ctx.font = FONT(600, FS); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = C.caution; ctx.fillText(S.targetWord, R, ty - 4); }
  }
  // The trace, swept up to now, each stretch in the colour of what the tip reads there.
  const tNow = Math.min(t, axT1);
  for (let i = 0; i < S.segs.length; i++) { const sg = S.segs[i]; seg(ctx, S, v, wave, sg[0], sg[1], C[sg[2]], tNow); }
  if (t < axT1 && t > axT0) { const p = S.at(tNow, v, wave); if (Number.isFinite(p)) { ctx.fillStyle = C.bright; ctx.beginPath(); ctx.arc(X(tNow), Y(p), 2.6, 0, Math.PI * 2); ctx.fill(); } }
  // (Each level's name and number at the right, centred on its line; two pairs kept 28 px apart so they never touch.)
  const L0 = S.levels[0], L1 = S.levels[1];
  const on0 = !!L0 && t >= L0[0], on1 = !!L1 && t >= L1[0];
  if (on0 || on1) {
    const a = on0 ? v[L0[1]] : NaN, b = on1 ? v[L1[1]] : NaN;
    const both = on0 && on1, lo = both ? (a <= b ? 0 : 1) : on0 ? 0 : 1;   // (the lower level's label goes below, the upper's above)
    const yA = Y(a), yB = Y(b), sep = both ? Math.max(0, 28 * HK - Math.abs(yA - yB)) / 2 : 0;
    const yLo = Math.min((lo === 0 ? yA : yB) + sep, hh - 12), yHi = Math.min((lo === 0 ? yB : yA) - sep, yLo - 28 * HK);
    if (on0) level(ctx, a, C[L0[2]], L0[3], both ? (lo === 0 ? yLo : yHi) : Math.min(yA, hh - 12), narrow, R, L, cLv0);
    if (on1) level(ctx, b, C[L1[2]], L1[3], both ? (lo === 1 ? yLo : yHi) : Math.min(yB, hh - 12), narrow, R, L, cLv1);
  }
  const res = S.result;
  if (res && t >= res.show) {
    const lo = v[res.lo], hi = v[res.hi], g = v[res.key];
    if (Number.isFinite(lo) && Number.isFinite(hi) && Number.isFinite(g)) {
      const a = ease(k01(t, res.at - 400, res.at + 200)), xa = L + (R - L) * 0.9, y1 = Y(lo), y2 = Y(lo + (hi - lo) * a), col2 = C[SEV_C[res.sev(g)]];
      ctx.strokeStyle = col2; ctx.fillStyle = col2; ctx.lineWidth = 1.6;
      ctx.fillRect(xa - 0.8, Math.min(y1, y2), 1.6, Math.abs(y2 - y1));
      if (Math.abs(y1 - y2) > 10) { const d = hi >= lo ? 1 : -1; arrowHead(ctx, xa, y1, d); arrowHead(ctx, xa, y2, -d); }
      if (a > 0.6) {
        ctx.save(); ctx.globalAlpha = ease(k01(t, res.at, res.at + 450));
        if (!Object.is(cRes.v, g) || cRes.w !== res.word) { cRes.v = g; cRes.w = res.word; cRes.s = `${res.word} ${fmt(g, 1)}`; }   // alloc-rare: only when the gradient differs from the one this text was built from
        const txt = cRes.s; ctx.font = FONT(700, FS);
        const tw = ctx.measureText(txt).width + 12, lx = xa - tw - 6, ly = (y1 + y2) / 2;
        ctx.fillStyle = C.bg; rrect(ctx, lx, ly - FS * 0.75, tw, FS * 1.5, FS * 0.75); ctx.fill(); ctx.strokeStyle = col2; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = col2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, lx + 6, ly + 0.5);
        ctx.restore();
      }
    }
  }
  // (A marker drops onto the trace where each reading is taken, at the moment the figure's callout prints it: they stand on the trace itself, so they move with it.)
  for (let i = 0; i < S.drops.length; i++) {
    const [at, word, key, ck, want] = S.drops[i];
    if (t < at || !Number.isFinite(v[key])) continue;
    const p = S.at(at, v, wave);
    if (!Number.isFinite(p)) continue;
    const yp = Y(p);
    drawCallout(ctx, calloutText(cDrop[i] ||= calloutCell(), word, v[key]), X(at), yp, sideFor(yp, want, top, bot), C[ck], C.bg, dropK(t - at), 1, L, R, top, bot, FS);   // alloc-rare: a marker's cell, once
  }
  // (A step's tick and its words come with the step, not before: the balloon's "balloon up", Mohammad, 12 Nov 2026.)
  for (let i = 0; i < S.ticks.length; i++) {
    const [at, word] = S.ticks[i];
    if (t < at) continue;
    ctx.fillStyle = C.text; ctx.font = FONT(500, FS); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(word, X(at), bot + FS + 3);
    ctx.fillStyle = C.line; ctx.fillRect(X(at) - 0.5, bot, 1, 4);
  }
}
const cLv0 = cell(), cLv1 = cell(), cRes = { v: undefined, w: '', s: '' }, cDrop = [];

// The trace from a to b (ms on the script's clock), swept as far as tNow; a stretch where the script reads nothing (NaN: the needle out, another
// way in) is left blank. (Drawn with the axes monOn set: Y, X.)
function seg(ctx, S, v, wave, a, b, colr, tNow) {
  if (tNow <= a) return;
  // (Laid as small round boxes along the trace, not one stroked line: a stroke is drawn through the GPU's coverage target and the tracing came
  // up with no line on a phone while its dot, words and axes drew. A box draws wherever the dot does.)
  ctx.fillStyle = colr; ctx.beginPath();
  let px = 0, py = 0, have = false;
  const end = Math.min(b, tNow);
  for (let tt = a; tt <= end + 15; tt += 30) {
    const t2 = Math.min(tt, end), p = S.at(t2, v, wave);
    if (!Number.isFinite(p)) { have = false; if (t2 >= end) break; continue; }
    const X1 = X(t2), Y1 = Y(p);
    if (have) inkSeg(ctx, px, py, X1, Y1, 2); else inkSeg(ctx, X1, Y1, X1, Y1, 2);
    px = X1; py = Y1; have = true;
    if (t2 >= end) break;
  }
  ctx.fill();
}
// A level's solid line across the grid and, when there is room, its name and number at the right (c: the number's text cell).
function level(ctx, p, colr, txt, ly, narrow, R, L, c) {
  ctx.save(); ctx.fillStyle = colr; ctx.globalAlpha = 0.75;
  const dy = Math.round(Y(p));
  ctx.fillRect(L, dy, R - L, 1);   // (solid, as the trace is: owner, 10 Nov 2026; one box, drawn wherever the dot does: see seg)
  ctx.restore();
  if (!narrow) { ctx.fillStyle = colr; ctx.font = FONT(600, FS); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(txt, R + 6, ly - FS * 0.6); ctx.font = FONT(700, FS); ctx.fillText(fm1(c, p), R + 6, ly + FS * 0.6); }
}
// One end of the difference's bracket: a small arrowhead at yy, pointing d (1 down the page's way, -1 the other).
function arrowHead(ctx, xa, yy, d) {
  ctx.beginPath(); ctx.moveTo(xa, yy); ctx.lineTo(xa - 4, yy - 6 * d); ctx.lineTo(xa + 4, yy - 6 * d); ctx.closePath(); ctx.fill();
}
