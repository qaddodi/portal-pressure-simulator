// Where each card's words end against what the person can see of the card (Mohammad, 19 Nov 2026: the Shuffle play-test found the words card clipped
// on many slides that no check named; "measure each card's last text line against the card's visible edge and the screen edge").
// Layout numbers only: no picture. Two parts, like fit-rules.js: `readEdges(io)` is ONE SELF-CONTAINED FUNCTION that runs in the page (the gallery's
// layout reads, or scripts/fit-io.mjs's plain ones) and returns plain JSON, and `judgeEdges(read)` is a plain function of that JSON.
//
// A card's VISIBLE EDGE is its own box (as drawn, with any transform) narrowed by its clip-path inset: the card behind in the Shuffle shows only a strip
// (card-shuffle.js), and so does a card that leaves. What it finds, per text element (a leaf with words of its own) inside a card that is on show:
//   cutoff     the words of the card in front end past its visible edge (the last line is cut off, or runs out of the card at the side).
//   off        the words end past the screen's edge, whatever the card says.
//   cutby      the words are cut by a box inside the card that clips (overflow hidden or clip, not an ellipsis): a line half drawn.
//   stray      the card behind: a line of text stands across the edge of the strip, so half its glyphs show (a kicker peeking out of the strip).
//   nobacking  words of the teaching card in front that stand outside its glass (the shade the words sit on): words with nothing behind them.
// Tolerance EDGE_TOL px (a sub-pixel box is not a cut line).

export const EDGE_TOL = 1.5;

/** The page reader. io = { box(el), style(el), metric(el, key) }. Returns { vw, vh, shuf, front, cards: [{ q, behind, box, vis, shade?, leaves: [{ t, b: [l, t, r, b], n, clipBy? }] }] }. */
export function readEdges(io) {
  const vw = io.metric(window, 'innerWidth'), vh = io.metric(window, 'innerHeight');
  const memo = new Map();
  const st = (el) => { let s = memo.get(el); if (!s) { s = io.style(el); memo.set(el, s); } return s; };
  const shown = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const cs = st(n); if (cs.display === 'none' || (n === el && cs.visibility === 'hidden') || +cs.opacity <= 0.05 || n.hidden) return false; }
    return st(el).visibility !== 'hidden';
  };
  const r1 = (v) => Math.round(v * 10) / 10;
  const rect = (b) => [r1(b.left), r1(b.top), r1(b.right), r1(b.bottom)];
  const nameOf = (el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ').slice(0, 2).join('.')}`;
  // (clip-path: inset(a [b [c [d]]] [round r]) as the four edges, in the element's own pixels; anything else clips nothing here.)
  const insetOf = (el) => {
    const m = /^inset\(([^)]*)\)/.exec(st(el).clipPath || '');
    if (!m) return null;
    const v = m[1].split('round')[0].trim().split(/\s+/).map(parseFloat);
    if (!v.length || v.some((x) => !Number.isFinite(x))) return null;
    const [a, b = a, c = a, d = b] = v;
    return [Math.max(0, d), Math.max(0, a), Math.max(0, b), Math.max(0, c)];   // left, top, right, bottom (a negative inset only widens the clip: the card's own box is still its edge)
  };
  const visibleOf = (el, b) => {
    const ins = insetOf(el);
    if (!ins) return rect(b);
    const w = io.metric(el, 'offsetWidth') || b.width, k = w ? b.width / w : 1;   // (the card as drawn is scaled: the clip is in its own pixels)
    return [r1(b.left + ins[0] * k), r1(b.top + ins[1] * k), r1(b.right - ins[2] * k), r1(b.bottom - ins[3] * k)];
  };
  const root = document.querySelector('.pz');
  const shuf = !!root && root.classList.contains('pz-shuf');
  const front = shuf && root.classList.contains('pz-shuf-data') ? 'data' : 'words';
  const shadeEl = document.querySelector('.pz-shade');
  const cards = [];
  for (const q of ['.pz-text', '.pz-data', '.pz-panel']) {
    const card = document.querySelector(q);
    if (!card || !shown(card)) continue;
    const b = io.box(card);
    if (!(b.width > 0 && b.height > 0)) continue;
    const behind = shuf && (q === '.pz-text' ? front === 'data' : q === '.pz-data' ? front === 'words' : false);
    const rec = { q, behind, box: rect(b), vis: visibleOf(card, b), leaves: [] };
    if (q === '.pz-text' && shadeEl && shown(shadeEl)) { const sb = io.box(shadeEl); if (sb.width > 0) rec.shade = visibleOf(shadeEl, sb); }
    for (const el of card.querySelectorAll('*')) {
      if (el.childElementCount && ![...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) continue;
      if (el.tagName === 'CANVAS' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.classList.contains('sr-only') || !el.textContent.trim() || !shown(el)) continue;
      const r = io.box(el);
      if (!(r.width > 0 && r.height > 0)) continue;
      const leaf = { t: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), b: rect(r), n: nameOf(el) };
      // (The nearest box between it and the card that clips: the last line half drawn at its edge. A scrolling box is the scroll rule's business; an ellipsis is meant.)
      if (st(el).textOverflow !== 'ellipsis') {
        for (let a = el.parentElement; a && a !== card; a = a.parentElement) {   // (the card's own edge is the cutoff rule's)
          const o = st(a);
          if (!/hidden|clip/.test(o.overflowX + o.overflowY) || a.tagName === 'CANVAS') continue;
          const ab = io.box(a);
          if (!(ab.width > 0 && ab.height > 0)) continue;
          const cut = r.bottom - ab.bottom > 1.5 || ab.top - r.top > 1.5 || r.right - ab.right > 1.5 || ab.left - r.left > 1.5;
          if (cut && r.bottom > ab.top && r.top < ab.bottom && r.right > ab.left && r.left < ab.right) { leaf.clipBy = [...rect(ab), nameOf(a)]; break; }
        }
      }
      // (Behind, only the strip shows: each line's own top and bottom, so a line cut across by the strip's edge is told from a paragraph that merely starts in it.)
      if (behind) { const rs = (io.lines || io.rects)(el); leaf.lines = []; for (let k = 0; k < rs.length && k < 12; k++) leaf.lines.push([r1(rs[k].top), r1(rs[k].bottom)]); }
      rec.leaves.push(leaf);
    }
    cards.push(rec);
  }
  return { vw, vh, shuf, front, cards };
}

const px = (v) => Math.round(v);

/** What does not stand where it should: ['kind: words'] per finding, kinds as in the header. `read` is readEdges's result. */
export function judgeEdges(read, { tol = EDGE_TOL } = {}) {
  const out = [];
  if (!read) return out;
  const { vw, vh } = read;
  for (const c of read.cards) {
    const [vl, vt, vr, vb] = c.vis;
    const name = c.q.slice(1);
    for (const f of c.leaves) {
      const [l, t, r, b] = f.b;
      const inView = r > 0 && l < vw && b > 0 && t < vh;
      if (!inView) continue;
      if (c.behind) {
        // (Behind: what shows is the strip. A line that stands across its edge shows half its letters.)
        const cut = (f.lines || [[t, b]]).find(([lt, lb]) => lb - lt > 4 && lt < vb - tol && lb > vb + tol && lb - vb > 2 && vb - lt > 2);
        if (cut) out.push(`stray: ${name} behind: "${f.t}" has a line cut across by the strip's edge (line ${px(cut[0])} to ${px(cut[1])}, strip ends ${px(vb)})`);
        continue;
      }
      if (b > vb + tol) out.push(`cutoff: ${name}: "${f.t}" ends ${px(b - vb)} px below the card's visible edge (words end ${px(b)}, edge ${px(vb)})`);
      else if (t < vt - tol) out.push(`cutoff: ${name}: "${f.t}" starts ${px(vt - t)} px above the card's visible edge`);
      if (r > vr + tol) out.push(`cutoff: ${name}: "${f.t}" runs ${px(r - vr)} px out of the card's right edge`);
      else if (l < vl - tol) out.push(`cutoff: ${name}: "${f.t}" runs ${px(vl - l)} px out of the card's left edge`);
      if (b > vh + tol || r > vw + tol || t < -tol || l < -tol) out.push(`off: ${name}: "${f.t}" [${px(l)},${px(t)},${px(r)},${px(b)}] reaches past the screen ${vw} x ${vh}`);
      if (f.clipBy) out.push(`cutby: ${name}: "${f.t}" [${px(l)},${px(t)},${px(r)},${px(b)}] is cut by ${f.clipBy[4]} [${px(f.clipBy[0])},${px(f.clipBy[1])},${px(f.clipBy[2])},${px(f.clipBy[3])}]`);
      if (c.shade && c.q === '.pz-text') {
        const [sl, st, sr, sb] = c.shade;
        if (b > sb + tol || t < st - tol || r > sr + tol || l < sl - tol) out.push(`nobacking: ${name}: "${f.t}" [${px(l)},${px(t)},${px(r)},${px(b)}] stands outside its glass [${px(sl)},${px(st)},${px(sr)},${px(sb)}]`);
      }
    }
  }
  return [...new Set(out)];
}
