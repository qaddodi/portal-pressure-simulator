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
function drawGrid(spec, W, compact, p, H) {
  const { ROLE, TOKEN } = H, ops = [];
  const hdrW = compact ? 84 : 100, g = compact ? 4 : 6, cw = (W - hdrW - 3 * g) / 3, padX = compact ? 4 : 8, padY = compact ? 7 : 9, minH = compact ? 76 : 62, cFace = compact ? 'ctc' : 'ct';
  const colX = (i) => hdrW + g + i * (cw + g);
  let y = 0;
  // the column headers (standing on the cells, as tall as the tallest)
  const hd = spec.colsH.map((c) => fl(H, [[{ text: c[1], face: 'gh' }]], cw, { align: 'center' })), hh = Math.max(...hd.map((f) => f.h));
  hd.forEach((f, i) => put(ops, f.items, colX(i), y + hh - f.h, false, 'text'));
  y += hh + 2 + g;
  spec.rowsH.forEach((r, ri) => {
    const cells = spec.colsH.map((c) => {
      const ce = spec.cells[`${r[0]}|${c[0]}`];
      return { ce, f: fl(H, [[{ text: ce[0], face: cFace }], ...(ce[1] ? [[{ text: ce[1], face: 'cs' }]] : [])], cw - 2 * padX, { align: 'center', gap: 2 }) };
    });
    const rh = fl(H, [[{ text: r[1], face: 'gr' }], [{ text: r[2], face: 'gs' }]], hdrW, { gap: 2 });
    const rowH = Math.max(minH, rh.h, ...cells.map((c) => c.f.h + 2 * padY));
    put(ops, rh.items, 0, y + (rowH - rh.h) / 2, false, 'text');
    cells.forEach((c, ci) => {
      const on = r[0] === p.r && spec.colsH[ci][0] === p.c, tone = TOKEN[c.ce[2]];
      ops.push(rect('path.cell', colX(ci), y, cw, rowH, compact ? 8 : 10, on, tone));
      put(ops, c.f.items, colX(ci) + padX, y + (rowH - c.f.h) / 2, on, tone);
    });
    y += rowH + (ri < spec.rowsH.length - 1 ? g : 0);
  });
  // the reading: the cell's words, why, and what it needs
  const r = spec.reading(`${p.r}|${p.c}`, p);
  y += 12;
  ops.push(line('path.rule', 0, y + 0.5, W, y + 0.5));
  y += 1 + 12;
  const rd = fl(H, H.readParas(r), W, { gap: 4 });
  put(ops, rd.items, 0, y, true, TOKEN[r.tone]);
  y += rd.h;
  return { h: y, ops };
}

// ── ladder ──
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
    const name = fl(H, [[{ text: st[0], face: 'r' }]], width);
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
    const f = fl(H, [[{ text: rc ? 'Back to compensated. ' : 'The way back. ', face: 'bb' }, { text: spec.back, face: 'bk' }]], W - 20);
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
    return svg('path', { d: `M${o.x1},${o.y1 + oy}L${o.x2},${o.y2 + oy}`, class: cls, 'data-look': o.look, 'data-p-tone': o.tone || 'text' });
  });
}
