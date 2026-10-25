// An outline measured piece by piece. The browser's getPointAtLength walks a path from its start on every call, so reading
// points every 2 units along a long outline (the colon's 608 pieces, the bowel's 297) costs points × pieces: about 700 000
// curve lengths for the organs' outlines, the Doppler probe's first look at the figure, which held the page for a second or two
// as a monitor first opened (Mohammad, 22 Oct). Cut into its pieces, each measured on its own, each point is one piece's walk.
// The same points: the browser measures each piece as it did within the whole path (the piece starts where the last ended, in
// the path's own numbers), and a line's point is its straight interpolation, as the browser's is.

const TOKEN = /[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/**
 * The path d cut into pieces: { x0, y0, x1, y1, len (a line's or a move's; a curve's is measured), c (a curve's own path,
 * "M x0 y0 C …", else null), move (a jump to a new subpath: no length) }. null for anything but absolute M, L, C and Z, which
 * the caller measures the old way.
 */
export function pathPieces(d) {
  const t = String(d || '').match(TOKEN);
  if (!t || !t.length) return null;
  const out = [];
  let i = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0, xs = '0', ys = '0', sxs = '0', sys = '0';
  const isCmd = (k) => /^[A-Za-z]$/.test(t[k] || '');
  const nums = (n) => {
    if (i + n > t.length) return null;
    for (let k = i; k < i + n; k++) if (isCmd(k)) return null;
    const r = t.slice(i, i + n); i += n; return r;
  };
  while (i < t.length) {
    if (isCmd(i)) { cmd = t[i++]; if (cmd === 'z') cmd = 'Z'; }
    if (cmd === 'Z') {
      out.push({ x0: x, y0: y, x1: sx, y1: sy, len: Math.hypot(sx - x, sy - y), c: null, move: false });
      x = sx; y = sy; xs = sxs; ys = sys; cmd = null;
      continue;
    }
    if (cmd === 'M' || cmd === 'L') {
      const p = nums(2); if (!p) return null;
      const nx = +p[0], ny = +p[1];
      if (cmd === 'M') {
        out.push({ x0: x, y0: y, x1: nx, y1: ny, len: 0, c: null, move: true });
        sx = nx; sy = ny; sxs = p[0]; sys = p[1];
        cmd = 'L';   // (pairs after a move are lines)
      } else out.push({ x0: x, y0: y, x1: nx, y1: ny, len: Math.hypot(nx - x, ny - y), c: null, move: false });
      x = nx; y = ny; xs = p[0]; ys = p[1];
      continue;
    }
    if (cmd === 'C') {
      const p = nums(6); if (!p) return null;
      const nx = +p[4], ny = +p[5];
      out.push({ x0: x, y0: y, x1: nx, y1: ny, len: NaN, c: `M ${xs} ${ys} C ${p.join(' ')}`, move: false });
      x = nx; y = ny; xs = p[4]; ys = p[5];
      continue;
    }
    return null;   // (relative commands, arcs, quadratics, smooth curves: measured the old way)
  }
  return out.length && out[0].move ? out : null;
}

/** The pieces' whole length, each curve measured on its own by curve(piece) → { len, at(u) → [x, y] } (kept on the piece). */
export function piecesLength(pieces, curve) {
  let L = 0;
  for (const q of pieces) {
    if (q.c) { const m = curve(q); q.m = m; q.len = m.len; }
    L += q.len;
  }
  return L;
}

/** The points at the given lengths (ascending) along the measured pieces, as getPointAtLength gives them along the whole path. */
export function pointsAlong(pieces, lengths) {
  const out = [];
  let k = 0, acc = 0;
  const last = pieces.length - 1;
  for (const s of lengths) {
    // (the first piece whose end reaches s, as the browser's walk stops; a move has no length and never holds a point past it)
    while (k < last && (acc + pieces[k].len < s || pieces[k].move)) { acc += pieces[k].len; k++; }
    const q = pieces[k], u = Math.min(Math.max(s - acc, 0), q.len);
    if (q.m) out.push(q.m.at(u));
    else if (q.move || !(q.len > 0)) out.push([q.x1, q.y1]);
    else { const f = u / q.len; out.push([q.x0 + (q.x1 - q.x0) * f, q.y0 + (q.y1 - q.y0) * f]); }
  }
  return out;
}
