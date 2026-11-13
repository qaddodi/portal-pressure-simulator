// The guideline path card's other kinds (7 Nov 2026): the score card and the checklist (kind 'score', allOf for the checklist), the grid
// (kind 'grid') and the ladder (kind 'ladder'). The tree kinds are drawn by tool-path.js; this module lays these out and builds their
// model, and tool-path.js keeps the head (the source's pill and the patient's chips), the rule and the foot.
//   score    rows of answers to choose from (the chosen one lit), the total on a bar of zones, the verdict and what to do next
//   grid     two questions, one cell (the column and the row headers, the cells, the lit one in its own colour), then the reading
//   ladder   the stages as steps (a staircase across on a Mac, a stack on a phone), the lit stage with what it means, and the way back
// Everything is words and shapes for svg-gl (no page text, no layout read): the helpers come from tool-path.js (flow, ROLE, svg, textWidth,
// readParas, TOKEN) so the type is one: a face is drawn by the look path.<face> (chart-looks/path.js). Pure functions of the width, the
// patient and the algorithm, so a unit test can lay one out without a page.
// One card size per slide (Mohammad, 7 Nov 2026): layout() lays out every patient the algorithm can have (every answer of every row) and
// keeps the tallest, so the card never changes size with the case; the model puts the patient's own answers lit inside it.

export const CARD_WIDE_MIN = 420;   // (a card narrower than this, or a phone or an iPad held upright, is the small layout)
/** Whether a card this wide in this page is the small layout (P2: a phone, an iPad held upright, or a card too narrow for the wide one). */
export const cardCompact = (W, phone) => !!phone || !(W >= CARD_WIDE_MIN);
/** The kinds this module draws. */
export const CARD_KINDS = ['score', 'grid', 'ladder'];
export const isCardKind = (kind) => CARD_KINDS.includes(kind);

const ROW_PAD = 9, PAD_X = 9, PAD_Y = 4, PILL_GAP = 6, COL_GAP = 14, STAIR = 18, STEP_GAP = 10;
const memo = new WeakMap();   // alloc-rare: lines broken once for each helpers object, text and width, kept (a card has a dozen)
function fl(H, paras, width, o = {}) {
  let m = memo.get(H);
  if (!m) memo.set(H, m = new Map());
  const k = `${Math.round(width * 100)}|${o.align || ''}|${o.gap || 0}|${paras.map((q) => q.map((r) => `${r.face}:${r.text}`).join('\u0001')).join('\u0002')}`;
  let v = m.get(k);
  if (!v) { if (m.size > 4000) m.clear(); m.set(k, v = H.flow(paras, width, o)); }
  return v;
}
/** The baseline of a single line of a face, from the top of its line box (as flow places it). */
const baseOf = (R) => (R.lh - R.size * 1.21) / 2 + R.size * 0.97;
const wOf = (H, face, text) => H.textWidth(text, { weight: H.ROLE[face].weight, size: H.ROLE[face].size });

// ── ops: plain data, turned into svg-gl pieces by model() ──
const text = (face, x, y, t, on, tone) => ({ k: 't', face, x, y, text: t, on: !!on, tone });
const rect = (look, x, y, w, h, rx, on, tone) => ({ k: 'r', look, x, y, w, h, rx, on: !!on, tone });
const line = (look, x1, y1, x2, y2, on, tone) => ({ k: 'p', look, x1, y1, x2, y2, on: !!on, tone });
const put = (ops, items, ox, oy, on, tone) => { for (const i of items) ops.push(text(i.face, ox + i.x, oy + i.y, i.text, on, tone)); };

/** Every patient an algorithm of these kinds can have (each answer of each row; both questions; each stage with and without the way back). */
export function patientsOf(spec) {
  if (spec.kind === 'score') return spec.rows.reduce((acc, r) => acc.flatMap((p) => r.o.map((_, i) => ({ ...p, [r.k]: i }))), [{}]);
  if (spec.kind === 'grid') return spec.rowsH.flatMap((r) => spec.colsH.map((c) => ({ r: r[0], c: c[0] })));
  return spec.steps.flatMap((_, s) => [false, true].map((rc) => ({ s, rc })));
}

/** A score card's total and verdict for a patient. */
export function scoreState(spec, p) {
  const t = spec.rows.reduce((s, r) => s + r.o[p[r.k]][1], 0);
  return { t, v: spec.verdict(t, p, spec.rows) };
}
const pointsText = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
/** A zone's name on the bar: with its range of totals, or alone on a checklist. */
export const zoneText = (z, allOf) => (allOf ? z[2] : `${z[2]} · ${z[1] === 99 ? `≥${z[0]}` : z[0] === z[1] ? z[0] : `${z[0]}–${z[1]}`}`);

// ── score ──
function drawScore(spec, W, compact, p, H) {
  const { ROLE, TOKEN } = H, ops = [], allOf = !!spec.allOf, { t, v } = scoreState(spec, p), tone = TOKEN[v.tone];
  const pillH = ROLE.op.lh + 2 * PAD_Y;
  const pillW = (o) => 2 * PAD_X + wOf(H, 'op', o[0]) + (allOf ? 0 : PILL_GAP + wOf(H, 'pt', pointsText(o[1])));
  const natural = Math.max(...spec.rows.map((r) => r.o.reduce((s, o) => s + pillW(o), 0) + (r.o.length - 1) * PILL_GAP));
  const avail = W - COL_GAP, optsW = Math.min(Math.max(natural, avail * 0.28), avail * 0.68), namesW = avail - optsW;   // (the answers' column as wide as its widest row needs; the names get the rest)
  // a row's answers, wrapped in a width, from (x0, y0): → height
  const pills = (r, x0, y0, width) => {
    let x = 0, y = 0;
    r.o.forEach((o, oi) => {
      const w = pillW(o);
      if (x > 0 && x + w > width + 0.01) { x = 0; y += pillH + PILL_GAP; }
      const on = p[r.k] === oi, px = x0 + x, py = y0 + y;
      ops.push(rect('path.opt', px, py, w, pillH, 8, on, tone));
      ops.push(text('op', px + PAD_X, py + PAD_Y + baseOf(ROLE.op), o[0], on, tone));
      if (!allOf) ops.push(text('pt', px + PAD_X + wOf(H, 'op', o[0]) + PILL_GAP, py + PAD_Y + baseOf(ROLE.op), pointsText(o[1]), on, tone));
      x += w + PILL_GAP;
    });
    return y + pillH;
  };
  let y = 0;
  spec.rows.forEach((r, ri) => {
    if (ri) { ops.push(line('path.rule', 0, y + 0.5, W, y + 0.5)); y += 1 + ROW_PAD; }
    const paras = [[{ text: r.n, face: 'rn' }], ...(r.d ? [[{ text: r.d, face: 'rd' }]] : [])];
    const name = fl(H, paras, compact ? W : namesW, { gap: 2 });
    put(ops, name.items, 0, y, false, 'text');
    let rowH;
    if (compact) rowH = name.h + 6 + pills(r, 0, y + name.h + 6, W);
    else rowH = Math.max(name.h, pills(r, namesW + COL_GAP, y, optsW));
    y += rowH + ROW_PAD;
  });
  // the total: the bar of zones (as wide as the totals each covers), their names, the verdict and what is next
  ops.push(line('path.rule', 0, y + 0.5, W, y + 0.5));
  y += 1 + 10;
  const wts = spec.zones.map((z) => (z[1] === 99 ? 3 : z[1] - z[0] + 1)), unit = (W - 3 * (wts.length - 1)) / wts.reduce((a, b) => a + b, 0);
  let x = 0, zh = 0;
  // (a zone as wide as the totals it covers, but never narrower than its longest word: the width it lacks comes off the widest)
  const ws = wts.map((k) => k * unit);
  spec.zones.forEach((z, i) => {
    const need = Math.ceil(Math.max(...zoneText(z, allOf).split(' ').map((w) => wOf(H, 'zl', w))) + 4);   // (its longest word: the rest wraps)
    if (ws[i] < need) { const j = ws.reduce((m, w, k) => (k !== i && w > (ws[m] ?? -1) ? k : m), i === 0 ? 1 : 0); ws[j] -= need - ws[i]; ws[i] = need; }
  });
  const segs = ws.map((w) => { const s = { x, w }; x += w + 3; return s; });
  spec.zones.forEach((z, i) => {
    ops.push(rect('path.bar', segs[i].x, y, segs[i].w, 8, 4, v.z === i, tone));
    const f = fl(H, [[{ text: zoneText(z, allOf), face: 'zl' }]], segs[i].w);
    zh = Math.max(zh, f.h);
    put(ops, f.items, segs[i].x, y + 8 + 6, v.z === i, tone);
  });
  y += 8 + 6 + zh + 8;
  const head = fl(H, [[{ text: v.head, face: 'rh' }]], W), last = head.items[head.items.length - 1];
  put(ops, head.items, 0, y, true, tone);
  const small = allOf ? `${t} of ${spec.rows.length}` : `Score ${t}`, sx = last.x + wOf(H, 'rh', last.text) + 10;
  if (sx + wOf(H, 'rs', small) <= W) { ops.push(text('rs', sx, y + last.y, small, false, 'text')); y += head.h; }
  else { y += head.h; ops.push(text('rs', 0, y + baseOf(ROLE.rs), small, false, 'text')); y += ROLE.rs.lh; }
  if (v.next) {
    y += 4;
    const nx = fl(H, [[{ text: v.next, face: 'rp' }]], W);
    put(ops, nx.items, 0, y, true, tone);
    y += nx.h;
  }
  return { h: y, ops };
}

// ── grid ──
// The grid's shapes (Mohammad, 7 Nov 2026, mock C at artifact DuDRLrqEd5tz6mfhbtNP6R): the cells that give the same answer are one shape (Fig. 5
// has three answers, not six), each answer written once and centred in the widest block of its shape; the patient's cell is a filled inset in it.
/** The cells of a grid joined by answer: → [{ key (the answer's words), tone, cells: [[ri, ci]], box: [r0, r1, c0, c1] (the block its words sit in) }]. */
export function gridGroups(spec) {
  const nr = spec.rowsH.length, nc = spec.colsH.length, ans = (ri, ci) => spec.cells[`${spec.rowsH[ri][0]}|${spec.colsH[ci][0]}`];
  const seen = new Set(), out = [];
  for (let ri = 0; ri < nr; ri++) for (let ci = 0; ci < nc; ci++) {
    if (seen.has(ri * nc + ci)) continue;
    const ce = ans(ri, ci), cells = [], q = [[ri, ci]];
    seen.add(ri * nc + ci);
    while (q.length) {   // the joined cells next to each other with the same words (one shape each)
      const [r, c] = q.pop();
      cells.push([r, c]);
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const r2 = r + dr, c2 = c + dc;
        if (r2 < 0 || c2 < 0 || r2 >= nr || c2 >= nc || seen.has(r2 * nc + c2)) continue;
        const o = ans(r2, c2);
        if (o[0] === ce[0] && o[1] === ce[1] && o[2] === ce[2]) { seen.add(r2 * nc + c2); q.push([r2, c2]); }
      }
    }
    const has = (r, c) => cells.some((x) => x[0] === r && x[1] === c);
    let box = null, best = -1;   // the block of whole cells inside the shape with the most cells (the wider on a tie): the words go there
    for (let r0 = 0; r0 < nr; r0++) for (let r1 = r0; r1 < nr; r1++) for (let c0 = 0; c0 < nc; c0++) for (let c1 = c0; c1 < nc; c1++) {
      let all = true;
      for (let r = r0; r <= r1 && all; r++) for (let c = c0; c <= c1; c++) if (!has(r, c)) { all = false; break; }
      const sc = all ? ((r1 - r0 + 1) * (c1 - c0 + 1)) * 10 + (c1 - c0) : -1;
      if (sc > best) { best = sc; box = [r0, r1, c0, c1]; }
    }
    out.push({ ce, tone: ce[2], cells, box });
  }
  return out;
}
/** The outline of a set of grid cells (one piece, no holes) as corner points, clockwise, each side pulled in by `ins`: xs and ys are the lines between the cells. */
function outlineOf(cells, xs, ys, ins) {
  const has = (r, c) => cells.some((x) => x[0] === r && x[1] === c), edges = new Map();
  // the sides with no cell of the shape beyond them, clockwise (the inside on the right, y down): from (col, row) line points
  for (const [r, c] of cells) {
    if (!has(r - 1, c)) edges.set(`${c},${r}`, [c + 1, r]);
    if (!has(r, c + 1)) edges.set(`${c + 1},${r}`, [c + 1, r + 1]);
    if (!has(r + 1, c)) edges.set(`${c + 1},${r + 1}`, [c, r + 1]);
    if (!has(r, c - 1)) edges.set(`${c},${r + 1}`, [c, r]);
  }
  const k0 = edges.keys().next().value, pts = [];
  let k = k0, guard = 0;
  do { const [a, b] = k.split(',').map(Number); pts.push([a, b]); const n = edges.get(k); k = `${n[0]},${n[1]}`; } while (k !== k0 && ++guard < 64);
  const corners = pts.filter((pt, i) => {   // drop the points along a straight side
    const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
    return !((a[0] === pt[0] && pt[0] === b[0]) || (a[1] === pt[1] && pt[1] === b[1]));
  });
  return corners.map((pt, i) => {
    const a = corners[(i - 1 + corners.length) % corners.length], b = corners[(i + 1) % corners.length];
    // each side's inward normal (clockwise in y-down: (−dy, dx)), the corner moved along both
    const n1 = [-(Math.sign(pt[1] - a[1])), Math.sign(pt[0] - a[0])], n2 = [-(Math.sign(b[1] - pt[1])), Math.sign(b[0] - pt[0])];
    return [xs[pt[0]] + (n1[0] + n2[0]) * ins, ys[pt[1]] + (n1[1] + n2[1]) * ins];
  });
}
/** A path through corner points with each corner rounded (at most half of either side). */
function roundedPath(P, rad) {
  let d = '';
  P.forEach((p1, i) => {
    const p0 = P[(i - 1 + P.length) % P.length], p2 = P[(i + 1) % P.length];
    const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), r = Math.min(rad, d1 / 2, d2 / 2);
    const a = [p1[0] - (p1[0] - p0[0]) / d1 * r, p1[1] - (p1[1] - p0[1]) / d1 * r], b = [p1[0] + (p2[0] - p1[0]) / d2 * r, p1[1] + (p2[1] - p1[1]) / d2 * r];
    d += `${i ? 'L' : 'M'}${a[0].toFixed(2)},${a[1].toFixed(2)}Q${p1[0].toFixed(2)},${p1[1].toFixed(2)} ${b[0].toFixed(2)},${b[1].toFixed(2)}`;
  });
  return `${d}Z`;
}

function drawGrid(spec, W, compact, p, H) {
  const ops = [], nc = spec.colsH.length;
  const hdrW = compact ? 76 : 100, g = compact ? 4 : 6, ins = g / 2, cw = (W - hdrW) / nc, padX = compact ? 6 : 10, padY = compact ? 8 : 10, minH = compact ? 64 : 58, cFace = compact ? 'ctc' : 'ct';
  const xs = [...spec.colsH, null].map((_, i) => hdrW + g / 2 + i * cw);   // the lines between the columns (a shape is pulled in by half a gap from each, so the last ends at W)
  const groups = gridGroups(spec);
  // a grid's words break at spaces only ("long-term" stays whole), each line its own paragraph, centred
  const wrap = (t, face, width) => {
    const out = [];
    for (const w of t.split(' ')) { const last = out[out.length - 1], tryLn = last ? `${last} ${w}` : w; if (last && wOf(H, face, tryLn) > width * 0.97) out.push(w); else if (last) out[out.length - 1] = tryLn; else out.push(w); }
    return out.map((ln) => [{ text: ln, face }]);
  };
  const block = (parts, width, gapAfter = 2) => {   // [[text, face]] → one flow, the lines of a part together, a small gap between parts
    const paras = [], ends = new Set();
    for (const [t, face] of parts) { if (!t) continue; paras.push(...wrap(t, face, width)); ends.add(paras.length - 1); }
    return fl(H, paras, width, { align: 'center', gap: (pi) => (ends.has(pi) ? gapAfter : 0) });
  };
  const word = (ce, width) => block([[ce[0], cFace], [ce[1], 'cs']], width);
  const pTone = H.TOKEN[spec.cells[`${p.r}|${p.c}`][2]];
  // (each word of the grid is centred in its frame, kept on the op as box [x0, x1, y0, y1] so a test can hold it inside: nothing spills)
  const putIn = (items, ox, oy, on, tone, box) => { const n = ops.length; put(ops, items, ox, oy, on, tone); for (let i = n; i < ops.length; i++) ops[i].box = box; };
  let y = 0;
  // the column headers, centred over their columns, standing on the shapes (as tall as the tallest); lit on the patient's answer
  const hd = spec.colsH.map((c) => block([[c[1], 'gh']], cw - 2 * ins - 4)), hh = Math.max(...hd.map((f) => f.h));
  hd.forEach((f, i) => putIn(f.items, xs[i] + ins + 2, y + hh - f.h, spec.colsH[i][0] === p.c, pTone, [xs[i] + ins, xs[i + 1] - ins, y, y + hh]));
  y += hh + 6;
  // the rows' heights: each row holds its name and the words of every shape that sits in that row alone; words over two rows or more share them
  const rows = spec.rowsH.map((r) => block([[r[1], 'gr'], [r[2], 'gs']], hdrW - 6));
  const rowH = rows.map((rh) => Math.max(minH, rh.h + 2 * padY - 8));
  const gw = groups.map((gr) => { const [r0, r1, c0, c1] = gr.box; return { gr, f: word(gr.ce, (c1 - c0 + 1) * cw - 2 * ins - 2 * padX), r0, r1 }; });
  // (the patient's shape writes its words in the patient's own cell, inside the filled inset: every cell of a shape can hold them)
  const one = groups.map((gr) => word(gr.ce, cw - 2 * ins - 2 * padX));
  const spans = [...gw.map(({ f, r0, r1 }) => ({ f, r0, r1 })), ...groups.flatMap((gr, i) => gr.cells.map(([r]) => ({ f: one[i], r0: r, r1: r })))];
  for (const { f, r0, r1 } of spans.sort((a, b) => (a.r1 - a.r0) - (b.r1 - b.r0))) {
    const need = f.h + 2 * padY + 2 * ins, have = rowH.slice(r0, r1 + 1).reduce((s, h) => s + h, 0);
    if (need > have) for (let r = r0; r <= r1; r++) rowH[r] += (need - have) / (r1 - r0 + 1);
  }
  const ys = [y];
  rowH.forEach((h) => ys.push(ys[ys.length - 1] + h));
  // the rows' names, centred in their rows; lit on the patient's answer
  rows.forEach((rh, ri) => putIn(rh.items, 3, ys[ri] + (rowH[ri] - rh.h) / 2, spec.rowsH[ri][0] === p.r, pTone, [0, hdrW, ys[ri], ys[ri + 1]]));
  // the shapes (each answer once), the patient's cell filled inside its shape, then the words
  const pr = spec.rowsH.findIndex((r) => r[0] === p.r), pc = spec.colsH.findIndex((c) => c[0] === p.c);
  gw.forEach(({ gr, f: fBox }, gi) => {
    const on = gr.cells.some(([r, c]) => r === pr && c === pc), tone = H.TOKEN[gr.tone];
    ops.push({ k: 'd', look: 'path.group', pts: outlineOf(gr.cells, xs, ys, ins), rad: compact ? 8 : 10, on, tone });
    if (on) {
      const ii = ins + (compact ? 3 : 4);
      ops.push(rect('path.cell', xs[pc] + ii, ys[pr] + ii, xs[pc + 1] - xs[pc] - 2 * ii, ys[pr + 1] - ys[pr] - 2 * ii, compact ? 6 : 7, true, tone));
    }
    const [r0, r1, c0, c1] = on ? [pr, pr, pc, pc] : gr.box, f = on ? one[gi] : fBox, bx = xs[c0] + ins + padX, by = ys[r0] + ((ys[r1 + 1] - ys[r0]) - f.h) / 2;
    putIn(f.items, bx, by, on, tone, [xs[c0] + ins + padX, xs[c1 + 1] - ins - padX, ys[r0] + ins, ys[r1 + 1] - ins]);
  });
  y = ys[ys.length - 1];
  // the reading: the cell's words, why, and what it needs
  const r = spec.reading(`${p.r}|${p.c}`, p);
  y += 12;
  ops.push(line('path.rule', 0, y + 0.5, W, y + 0.5));
  y += 1 + 12;
  const rd = fl(H, H.readParas(r), W, { gap: 4 });
  put(ops, rd.items, 0, y, true, H.TOKEN[r.tone]);
  y += rd.h;
  return { h: y, ops };
}

// ── ladder ──
/** A word wider than its column ("decompensation" in a Mac staircase column) is hyphenated at the last syllable break that fits, so it
 *  wraps instead of running past the column and being cut at the card's edge. Words that fit are left as they are. */
const VOW = /[aeiouy]/i;
function hyphenate(H, face, textIn, width) {
  const room = width * 0.97;
  return textIn.split(' ').map((w) => {
    if (wOf(H, face, w) <= room) return w;
    for (let i = w.length - 3; i >= 3; i--) {
      const a = w[i - 1], b = w[i], c = w[i + 1] || '';
      const syl = !VOW.test(b) && VOW.test(c) && (VOW.test(a) || (!VOW.test(a) && VOW.test(w[i - 2])));
      if (syl && wOf(H, face, `${w.slice(0, i)}-`) <= room) return `${w.slice(0, i)}- ${w.slice(i)}`;
    }
    return w;
  }).join(' ');
}
function drawLadder(spec, W, compact, p, H) {
  const { ROLE, TOKEN } = H, ops = [], n = spec.steps.length, s = p.s, rc = !!p.rc && s >= 2;
  // one step's words from (x, y) in a width: → height. The lit one says "Patient is here" above and what the stage means below.
  const stepWords = (st, i, x, y0, width, reserveYou) => {
    const on = i === s, tone = TOKEN[st[3]];
    let y = y0;
    if (on) ops.push(text('yo', x, y + baseOf(ROLE.yo), 'Patient is here', true, tone));
    if (on || reserveYou) y += ROLE.yo.lh;
    ops.push(text('sn', x, y + baseOf(ROLE.sn), `Stage ${i + 1}`, on, tone));
    y += ROLE.sn.lh + 4;
    const name = fl(H, [[{ text: hyphenate(H, 'r', st[0], width), face: 'r' }]], width);
    put(ops, name.items, x, y, on, tone);
    y += name.h + 4;
    const sd = fl(H, [[{ text: st[1], face: 't' }]], width);
    put(ops, sd.items, x, y, on, tone);
    y += sd.h;
    if (on) {
      y += 4;
      const sw = fl(H, [[{ text: st[2], face: 'sw' }]], width);
      put(ops, sw.items, x, y, true, tone);
      y += sw.h;
    }
    return y - y0;
  };
  let y = 0;
  if (!compact) {
    const cw = (W - STEP_GAP * (n - 1)) / n;
    spec.steps.forEach((st, i) => {
      const x = i * (cw + STEP_GAP), top = (n - 1 - i) * STAIR;
      ops.push(line('path.step', x, top + 1.5, x + cw, top + 1.5, i === s, TOKEN[st[3]]));
      y = Math.max(y, top + 3 + 8 + stepWords(st, i, x, top + 3 + 8, cw, true));
    });
  } else {
    spec.steps.forEach((st, i) => {
      const top = y, h = stepWords(st, i, 13, top, W - 13, false);
      ops.push(line('path.step', 1.5, top, 1.5, top + h, i === s, TOKEN[st[3]]));
      y = top + h + (i < n - 1 ? 8 : 0);
    });
  }
  if (s >= 2) {
    y += 12;
    const f = fl(H, [[{ text: rc ? 'Recompensated. ' : 'Reversible. ', face: 'bb' }, { text: spec.back, face: 'bk' }]], W - 20);
    ops.push(rect('path.back', 0.5, y + 0.5, W - 1, f.h + 14, 10, rc, TOKEN.ok));
    put(ops, f.items, 10, y + 7, rc, TOKEN.ok);
    y += f.h + 14;
  }
  return { h: y, ops };
}

/** One patient's card body at a width: { h, ops }, positions from the top of the body. */
export function drawCard(spec, W, compact, p, H) {
  return spec.kind === 'score' ? drawScore(spec, W, compact, p, H) : spec.kind === 'grid' ? drawGrid(spec, W, compact, p, H) : drawLadder(spec, W, compact, p, H);
}

/**
 * The room a card of this kind needs at this width: the tallest body over every patient the algorithm can have (and the one given), so the
 * card never changes size with the case. → { kind, W, compact, H } (H in px, whole).
 */
export function layout(spec, W, compact, patient, H) {
  let max = 0;
  for (const q of [...patientsOf(spec), ...(patient ? [patient] : [])]) max = Math.max(max, drawCard(spec, W, compact, q, H).h);
  return { kind: spec.kind, W, compact, H: Math.ceil(max) };
}

/** The body's pieces for svg-gl for this patient, y from oy: → the array of models. */
export function model(spec, L, patient, H, oy = 0) {
  const { ROLE, svg } = H, { ops } = drawCard(spec, L.W, L.compact, patient, H);
  return ops.map((o) => {
    const cls = o.on ? 'lit' : '';
    if (o.k === 't') return svg('text', { x: o.x, y: o.y + oy, class: cls, 'data-look': `path.${o.face}`, 'data-p-tone': o.tone || 'text', 'text-anchor': 'start', 'font-size': ROLE[o.face].size }, o.text);
    if (o.k === 'r') return svg('rect', { x: o.x, y: o.y + oy, width: o.w, height: o.h, rx: o.rx, class: cls, 'data-look': o.look, 'data-p-tone': o.tone || 'text' });
    if (o.k === 'd') return svg('path', { d: roundedPath(o.pts.map((q) => [q[0], q[1] + oy]), o.rad), class: cls, 'data-look': o.look, 'data-p-tone': o.tone || 'text' });
    return svg('path', { d: `M${o.x1},${o.y1 + oy}L${o.x2},${o.y2 + oy}`, class: cls, 'data-look': o.look, 'data-p-tone': o.tone || 'text' });
  });
}
