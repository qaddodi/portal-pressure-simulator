// Ear clipping for the marks painter (stage-marks.js): the triangles of a simple polygon, counter-clockwise or not.
// The polygon is a doubly linked ring; a corner is an ear when it is convex and no reflex corner of the ring lies inside its triangle (a convex corner inside
// an ear implies a reflex one does, so the reflex ones are all that is tried). The first version tried every remaining point for every corner, and kept
// starting its walk from the first corner: 893 ms for the outlines of one build (tester, 18 Nov 2026, 'vessel marks: last build'). This walks on from the
// corner it cut, and tries only reflex corners, so a build is a few milliseconds.
let prv = new Int32Array(256), nxt = new Int32Array(256), refl = new Uint8Array(256), gone = new Uint8Array(256), gnx = new Int32Array(256), head = new Int32Array(256);

/**
 * Triangulates the n points of P (flat x, y pairs). Writes three indices per triangle into `out` (emptied first). Returns the winding's sign
 * (1 when the points run counter-clockwise in a y-up frame, else -1). A ring that cannot be cut further (self-crossing) is left as it stands.
 */
export function earClip(P, n, out) {
  out.length = 0;
  if (n < 3) return 1;
  if (prv.length < n) { const m = Math.max(n, prv.length * 2); prv = new Int32Array(m); nxt = new Int32Array(m); refl = new Uint8Array(m); gone = new Uint8Array(m); gnx = new Int32Array(m); }   // alloc-rare: grown with the largest outline
  let area = 0;
  for (let i = 0; i < n; i++) { const j = i + 1 === n ? 0 : i + 1; area += P[2 * i] * P[2 * j + 1] - P[2 * j] * P[2 * i + 1]; }
  const sgn = area > 0 ? 1 : -1;
  const cross = (a, b, c) => ((P[2 * b] - P[2 * a]) * (P[2 * c + 1] - P[2 * a + 1]) - (P[2 * b + 1] - P[2 * a + 1]) * (P[2 * c] - P[2 * a])) * sgn;
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  for (let i = 0; i < n; i++) { prv[i] = i === 0 ? n - 1 : i - 1; nxt[i] = i + 1 === n ? 0 : i + 1; }
  for (let i = 0; i < n; i++) refl[i] = cross(prv[i], i, nxt[i]) <= 0 ? 1 : 0;
  // (A grid of the points, about one a cell: an ear is tried against the points in the cells its triangle's box touches, not against the whole ring. A long thin
  // outline, 10 000 points of a vessel's wall, was every ear against every reflex corner: 700 to 800 ms for one build, 18 Nov 2026, on the first version's walk.)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = P[2 * i], y = P[2 * i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const G = Math.max(1, Math.min(512, Math.ceil(Math.sqrt(n)))), cw = Math.max(1e-9, (x1 - x0) / G * 1.000001), ch = Math.max(1e-9, (y1 - y0) / G * 1.000001);
  if (head.length < G * G) head = new Int32Array(G * G);   // alloc-rare: grown with the largest grid
  head.fill(-1, 0, G * G);
  const cx = (x) => Math.min(G - 1, Math.max(0, Math.floor((x - x0) / cw))), cy = (y) => Math.min(G - 1, Math.max(0, Math.floor((y - y0) / ch)));
  for (let i = 0; i < n; i++) { gone[i] = 0; const g = cy(P[2 * i + 1]) * G + cx(P[2 * i]); gnx[i] = head[g]; head[g] = i; }
  let left = n, cur = 0, stuck = 0;
  while (left > 3 && stuck < left) {
    const a = prv[cur], c = nxt[cur];
    let ear = !refl[cur];
    if (ear) {
      const ax = P[2 * a], ay = P[2 * a + 1], bx = P[2 * cur], by = P[2 * cur + 1], ex = P[2 * c], ey = P[2 * c + 1];
      const gx0 = cx(Math.min(ax, bx, ex)), gx1 = cx(Math.max(ax, bx, ex)), gy0 = cy(Math.min(ay, by, ey)), gy1 = cy(Math.max(ay, by, ey));
      scan: for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
        for (let j = head[gy * G + gx]; j >= 0; j = gnx[j]) if (refl[j] && !gone[j] && j !== a && j !== cur && j !== c && inside(j, a, cur, c)) { ear = false; break scan; }
      }
    }
    if (ear) {
      out.push(a, cur, c);
      gone[cur] = 1;
      nxt[a] = c; prv[c] = a; left--;
      refl[a] = cross(prv[a], a, c) <= 0 ? 1 : 0;
      refl[c] = cross(a, c, nxt[c]) <= 0 ? 1 : 0;
      cur = c; stuck = 0;
    } else { cur = c; stuck++; }
  }
  if (left === 3) out.push(prv[cur], cur, nxt[cur]);
  return sgn;
}
