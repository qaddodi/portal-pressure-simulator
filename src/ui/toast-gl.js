// A toast's words, shape, mark and buttons laid out in script and drawn on the GPU (widget-gl.js). The page's own toast (util.js
// toastBuild) keeps the box, the hit area and the words a screen reader reads; this is how it looks.
//
// The layout is the one the stylesheet gave it (app.css .toast): no page measure of any kind, so nothing is read from the layout.
//  - docked (below the top bars, nearly every view): a card w wide (the window less 24, at most 560), 52 px tall (84 for longer words or
//    buttons), its words centred in the largest size from 13 px up to 20 that fits, wrapped into even lines, the buttons centred under;
//  - not docked (the sinusoid view's, at the foot): words 12 px, as wide as the words need up to 440 px, a × at the right.
// Words are set from Inter's own advances (glyph-measure.js), as the browser sets them.

import { measure } from './glyph-measure.js';

const ASC = 1984 / 2048, DESC = 494 / 2048;   // Inter's ascent and descent in em: where a line's baseline sits in its line box
const BTN_H = 28, BTN_PAD = 12, BTN_GAP = 8, X_SIZE = 22;
/** The mark of an error (a warning triangle, one text-height tall) and the space after it, in em: app.css .toast-ic. */
export const MARK_EM = 1.05, MARK_GAP_EM = 0.4;
const fontOf = (weight, px) => `${weight} ${px}px Inter`;

/**
 * `words` wrapped to even lines no wider than `max` (CSS text-wrap: balance): the fewest lines greedy wrapping makes at `max`, then the
 * narrowest width that still makes that many, so no line is left with one word. `lead` is the room a mark takes on the first line.
 * Returns the lines' texts in `out` (a kept array, cleared first) and the widest line's width.
 */
export function wrapBalanced(text, font, max, lead = 0, out = []) {
  out.length = 0;
  const words = text.split(' ').filter(Boolean);   // alloc-rare: a toast's words, split once for each message
  const space = measure(' ', font);
  const fill = (limit, into) => {
    let line = '', w = 0, widest = 0, n = 0, first = true;
    const flush = () => { if (into) into.push(line); widest = Math.max(widest, w + (first ? lead : 0)); n++; first = false; line = ''; w = 0; };
    for (const word of words) {
      const ww = measure(word, font);
      const room = limit - (first ? lead : 0);
      if (line && w + space + ww > room) flush();
      if (!line && ww > limit - (first ? lead : 0)) {   // (a word longer than a line breaks where it must, as overflow-wrap: anywhere)
        let rest = word;
        while (rest) {
          let k = rest.length;
          while (k > 1 && measure(rest.slice(0, k), font) > limit - (first ? lead : 0)) k--;
          line = rest.slice(0, k); w = measure(line, font); rest = rest.slice(k);
          if (rest) flush();
        }
        continue;
      }
      line = line ? `${line} ${word}` : word; w = line ? measure(line, font) : 0;
    }
    if (line) flush();
    return { n, widest };
  };
  const base = fill(max, null);
  let lo = 1, hi = Math.ceil(max), best = hi;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fill(mid, null).n <= base.n) { best = mid; hi = mid - 1; } else lo = mid + 1;
  }
  const r = fill(Math.min(max, best), out);
  return r.widest;
}

/**
 * A toast's layout: { w, h, r, px, lh, weight, lines[{ text, x, y, mark }], mark: {x, y, size}, x: {cx, cy}, btns[{ x, y, w, h, label }] }.
 * msg: its words; bad: an error (the mark); acts: the buttons' labels; docked: below the bars; W: the window's width.
 */
export function layoutToast({ msg, sub = null, note = false, bad, acts, docked, W }) {
  const nAct = acts?.length || 0;
  const L = { w: 0, h: 0, r: 16, px: 12, lh: 16.8, weight: docked ? 600 : 400, lines: [], mark: null, x: { cx: 0, cy: 0 }, btns: [] };   // alloc-rare: one layout for each message raised
  const btnW = (s) => Math.ceil(measure(s, fontOf(500, 14)) + BTN_PAD * 2 + 2);
  const row = (top, widths) => {   // (buttons side by side, centred on the card's middle)
    let total = -BTN_GAP;
    for (const x of widths) total += x + BTN_GAP;
    let at = (L.w - total) / 2;
    for (let i = 0; i < widths.length; i++) { L.btns.push({ x: at, y: top, w: widths[i], h: BTN_H, label: acts[i] }); at += widths[i] + BTN_GAP; }   // alloc-rare: a toast's buttons
  };
  const mk = (px) => (bad ? px * (MARK_EM + MARK_GAP_EM) : 0);
  const base = (px, lh, top) => top + (lh - (ASC + DESC) * px) / 2 + ASC * px;
  const widths = nAct ? acts.map(btnW) : null;
  if (note) {
    // A preset's note (app.css .toast.note): a dot, the name (14 px, semibold) and its lines (12.5 px, the second ink), on a card as wide as the words allow up to 420 px.
    const out = [], outS = [], PL = 14, DOT = 8, GAP = 10, PR = 14, TOP = 10, BOT = 11, LH = 17.5;
    L.w = Math.min(420, W - 24);
    const tx = PL + DOT + GAP, max = L.w - tx - PR;
    const wgt = sub ? 600 : 500;   // (a notice with no second line is the words alone, a little lighter)
    const wt = wrapBalanced(msg, fontOf(wgt, 14), max, 0, out);
    const ws = sub ? wrapBalanced(sub, fontOf(400, 12.5), max, 0, outS) : 0;
    let wb = 0;
    if (nAct) { wb = -BTN_GAP; for (const x of widths) wb += x + BTN_GAP; }
    L.w = Math.min(L.w, Math.ceil(tx + Math.max(wt, ws, wb) + PR));
    L.px = 14; L.lh = LH; L.weight = wgt; L.note = true; L.x = null;
    let y = TOP;
    for (const text of out) { L.lines.push({ text, x: tx, y: base(14, LH, y) }); y += LH; }   // alloc-rare: a note's lines
    if (outS.length) y += 1;
    for (const text of outS) { L.lines.push({ text, x: tx, y: base(12.5, LH, y), font: fontOf(400, 12.5), ink: 'text2' }); y += LH; }   // alloc-rare: a note's lines
    if (nAct) {   // (buttons under the words, from the words' left edge; app.css .toast.note .toast-acts)
      y += 8; let at = tx;
      for (let i = 0; i < nAct; i++) { L.btns.push({ x: at, y, w: widths[i], h: BTN_H, label: acts[i] }); at += widths[i] + BTN_GAP; }   // alloc-rare: a note's buttons
      y += BTN_H;
    }
    L.h = Math.round(Math.max(y + BOT, 40));
    if (bad) L.mark = { x: PL - 2, y: TOP + (LH - 16) / 2, size: 16 };   // (an error's warning triangle takes the dot's place)
    else L.dot = { x: PL + DOT / 2, y: TOP + LH / 2, r: DOT / 2 };
    return L;
  }
  if (docked) {
    L.w = Math.min(W - 24, 560);
    L.h = msg.length > 60 || nAct ? 84 : 52;
    const max = L.w - 80, room = L.h - 8 - (nAct ? BTN_H + 6 : 0);
    const out = [];   // alloc-rare: one list of lines for each message raised
    const fits = (px) => {
      const widest = wrapBalanced(msg, fontOf(600, px), max, mk(px), out);
      return out.length * px * 1.2 <= room && widest <= max + 0.01;
    };
    let px = msg.length <= 28 ? 20 : msg.length <= 60 ? 17 : 15;
    if (!fits(px)) {
      let lo = 13, hi = px - 1, best = 13;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (fits(mid)) { best = mid; lo = mid + 1; } else hi = mid - 1; }
      px = best;
      wrapBalanced(msg, fontOf(600, px), max, mk(px), out);
    }
    const lh = px * 1.2, block = out.length * lh, whole = block + (nAct ? 6 + BTN_H : 0);
    const top = 4 + (L.h - 8 - whole) / 2;
    L.px = px; L.lh = lh;
    for (let i = 0; i < out.length; i++) {
      const text = out[i], tw = measure(text, fontOf(600, px)), lead = i === 0 ? mk(px) : 0, x0 = (L.w - (tw + lead)) / 2;
      L.lines.push({ text, x: x0 + lead, y: base(px, lh, top + i * lh) });   // alloc-rare: a toast's lines
      if (i === 0 && bad) L.mark = { x: x0, y: top + (lh - px * MARK_EM) / 2 + px * 0.02, size: px * MARK_EM };
    }
    if (nAct) row(top + block + 6, widths);
    L.x.cx = L.w - 8 - X_SIZE / 2; L.x.cy = L.h / 2;
    return L;
  }
  // (Not docked: padding 5 6 5 12, an 8 px gap, the × 22 px; as wide as the words, up to 440 px or 92 % of the window.)
  const px = 12, lh = 16.8, totalMax = Math.min(440, W * 0.92), text = totalMax - 12 - 8 - X_SIZE - 6;
  const out = [];   // alloc-rare: one list of lines for each message raised
  const one = measure(msg, fontOf(400, px)) + mk(px);
  if (one <= text) out.push(msg); else wrapBalanced(msg, fontOf(400, px), text, mk(px), out);   // alloc-rare: the one line of a short message
  L.px = px; L.lh = lh;
  L.w = Math.min(totalMax, Math.ceil(12 + (one <= text ? one : text) + 8 + X_SIZE + 6));
  const rows = Math.max(out.length * lh, X_SIZE);
  L.h = Math.round(rows + 10 + (nAct ? BTN_GAP + BTN_H : 0));
  for (let i = 0; i < out.length; i++) {
    const t = out[i], lead = i === 0 ? mk(px) : 0;
    L.lines.push({ text: t, x: 12 + lead, y: base(px, lh, 5 + (rows - out.length * lh) / 2 + i * lh) });   // alloc-rare: a toast's lines
    if (i === 0 && bad) L.mark = { x: 12, y: 5 + (rows - out.length * lh) / 2 + (lh - px * MARK_EM) / 2 + px * 0.02, size: px * MARK_EM };
  }
  if (nAct) row(5 + rows + BTN_GAP, widths);
  L.x.cx = L.w - 6 - X_SIZE / 2; L.x.cy = 5 + Math.min(rows, X_SIZE) / 2 + (rows - Math.min(rows, X_SIZE)) / 2;
  return L;
}

// The look of a toast and what moves in it, kept with it: which control the pointer is on (0 none, 1 the ×, 2.. a button) and which is down.
/** The ink a toast is drawn in, read from the page's tokens (they follow the theme and the palette). */
export function inkOf(cssVar, docked) {
  const rgba = (name, a) => `rgba(${cssVar(name).replace(/\s+/g, ', ')}, ${a})`;
  return {
    fill: cssVar(docked ? '--surface' : '--glass'), text: cssVar('--text'), text2: cssVar('--text-2'), hair: cssVar('--hairline'),
    danger: cssVar('--danger-ink'), border: cssVar('--border'), borderStrong: cssVar('--border-strong'), surface: cssVar('--surface'),
    accent: cssVar('--accent'), surface2: cssVar('--surface-2'), surface3: cssVar('--surface-3'), shadow: rgba('--black-rgb', 0.14), menu: rgba('--shadow-rgb', 0.1), menu2: rgba('--shadow-rgb', 0.06),
    slant: parseFloat(cssVar('--light-slant')) || 1,
  };
}

/** The warning triangle (icon-art.html i-alert, a 24 × 24 drawing) as a stroked path at `size`, its corner at (x, y). */
function drawMark(ctx, x, y, size, ink) {
  const k = size / 24;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(21.7, 18); ctx.lineTo(13.7, 4);
  ctx.arcTo(12, 2.4, 10.3, 4, 2); ctx.lineTo(2.3, 18);
  ctx.arcTo(2, 21, 4, 21, 2); ctx.lineTo(20, 21);
  ctx.arcTo(22, 21, 21.7, 18, 2);
  ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12, 9); ctx.lineTo(12, 13); ctx.stroke();
  ctx.beginPath(); ctx.arc(12, 17, 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Draws a laid-out toast at (pad, pad) in a picture. `state`: { hot, down } (the control under the pointer and the one pressed). */
export function paintToast(ctx, L, { pad, docked, bad, state, ink, glass = false }) {
  const x0 = pad, y0 = pad;
  // (glass: the cards' frosted glass draws this card's tint, edge and shadow under it (glass-gl.js, --gl-tint --gl-line --gl-drop), or is
  // about to: the picture then carries only the words and the controls. Without it, the card is drawn whole here, solid, never bare.)
  if (!glass) {
    if (docked) ctx.shadowBox(x0, y0, L.w, L.h, L.r, ink.shadow, 10, 2);
    else { ctx.shadowBox(x0 + 6 * ink.slant, y0, L.w, L.h, L.r, ink.menu, 20, 6); ctx.shadowBox(x0 + ink.slant, y0, L.w, L.h, L.r, ink.menu2, 3, 1); }
    ctx.fillStyle = ink.fill;
    ctx.beginPath(); ctx.roundRect(x0, y0, L.w, L.h, L.r); ctx.fill();
    ctx.strokeStyle = ink.hair; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x0 + 0.5, y0 + 0.5, L.w - 1, L.h - 1, L.r - 0.5); ctx.stroke();
  }
  ctx.font = fontOf(L.weight, L.px); ctx.fillStyle = ink.text; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  for (const ln of L.lines) {
    if (ln.font) { ctx.font = ln.font; ctx.fillStyle = ink[ln.ink]; ctx.fillText(ln.text, x0 + ln.x, y0 + ln.y); ctx.font = fontOf(L.weight, L.px); ctx.fillStyle = ink.text; }
    else ctx.fillText(ln.text, x0 + ln.x, y0 + ln.y);
  }
  if (L.dot) { ctx.globalAlpha = 0.8; ctx.fillStyle = ink.accent; ctx.beginPath(); ctx.arc(x0 + L.dot.x, y0 + L.dot.y, L.dot.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
  if (bad && L.mark) drawMark(ctx, x0 + L.mark.x, y0 + L.mark.y, L.mark.size, ink.danger);
  // The buttons (app.css .btn.sm): a hairline box, 14 px words; lit while the pointer is on one, pressed while it is down.
  ctx.font = fontOf(500, 14);
  for (let i = 0; i < L.btns.length; i++) {
    const b = L.btns[i], hot = state.hot === 2 + i, down = state.down === 2 + i;
    const s = down ? 0.97 : 1, bx = x0 + b.x + (b.w * (1 - s)) / 2, by = y0 + b.y + (b.h * (1 - s)) / 2, bw = b.w * s, bh = b.h * s;
    ctx.fillStyle = down ? ink.surface3 : hot ? ink.surface2 : ink.surface;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill();
    ctx.strokeStyle = hot || down ? ink.borderStrong : ink.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx + 0.5, by + 0.5, bw - 1, bh - 1, 5.5); ctx.stroke();
    ctx.fillStyle = ink.text; ctx.textAlign = 'center';
    ctx.fillText(b.label, bx + bw / 2, by + bh / 2 + (ASC - DESC) * 7);
    ctx.textAlign = 'left';
  }
  // The × (app.css .toast-x): a 22 px disc that lights under the pointer, a 12 px cross in the second ink. (A note has none.)
  if (!L.x) return;
  const hot = state.hot === 1 || state.down === 1;
  if (hot) { ctx.fillStyle = ink.surface3; ctx.beginPath(); ctx.arc(x0 + L.x.cx, y0 + L.x.cy, X_SIZE / 2 * (state.down === 1 ? 0.88 : 1), 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = hot ? ink.text : ink.text2; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
  const cx = x0 + L.x.cx, cy = y0 + L.x.cy, a = state.down === 1 ? 2.6 : 3;
  ctx.beginPath(); ctx.moveTo(cx - a, cy - a); ctx.lineTo(cx + a, cy + a); ctx.moveTo(cx + a, cy - a); ctx.lineTo(cx - a, cy + a); ctx.stroke();
}
