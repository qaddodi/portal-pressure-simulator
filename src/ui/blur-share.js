// One blur per look per picture (review pass, 2 Nov 2026, item 7: "one vessel-picture copy per frame does not establish one blur
// operation"). Every glass instance drawn into the figure's canvas (the callouts, the liver's pane, each run's card glass) blurred the
// picture under it on its own: its own copy, halvings, two passes, into its own targets, sized to the union of its own glasses, so a
// card sliding changed that size and reallocated all three targets every few frames, and two card instances (a slide change's old and
// new run) blurred the same picture twice.
//
// Now the instances of one look (its blur and its grid: CARD, GLASS and PANE each their own, so no glass takes another's frost) in one
// context share one set of targets laid on the whole canvas's grid (the grid each instance already used: a texel always covers the same
// figure pixels, so the shared copy's texels are the ones each would have made), sized by the canvas alone, never by where the glasses
// are. Each instance's prep only enters what it needs (its glasses' boxes and the key of the picture under them); the first glass drawn
// on that picture blurs once, the union of everyone's parts, and every instance then draws from it. A picture whose requests and parts
// are all the same as the last blur's is not blurred again.
// The 50 ms hold (glass-gl.js option reblur) keeps the old way (its hold is per instance).

import { caught } from './caught.js';

/** The share for one look in one context (made on first use). key: the look's name, `${blur}|${scale}`, made once by the glass that asks. */
export function shareFor(map, gl, key) {
  let byLook = map.get(gl);
  let S = byLook?.get(key);
  if (S) return S;
  // alloc-rare: a context's first glass of this look makes its share (once per look and context), never per frame
  if (!byLook) { byLook = new Map(); map.set(gl, byLook); }   // alloc-rare: once per context
  // alloc-rare: once per look and context
  S = { look: key, dipAt: 1, reqs: [], phase: 'draw', ok: false, reg: null, t: null, blurs: 0, skips: 0, held: 0, keptAt: -1, allocs: 0, boxBuf: [], partsOut: [], partsPool: [], snapOk: false, snap: newSnap(), cand: newSnap(), dBox: [null], dOut: [], dPool: [], rOut: [], rPool: [], rFull: [[0, 0, 0, 0]], plan: { parts: null, copy: null, same: false } };
  byLook.set(key, S);
  return S;
}

// A plan's key is kept as numbers in kept arrays and compared in place (no key string is made for each picture): the requests' picture keys
// (v, f; in any order), the grid, and the parts of the copy to blur.
const newSnap = () => ({ n: 0, v: [], f: [], g: [0, 0, 0, 0, 0], np: -1, p: [], fn: -1, fp: [], full: false, moved: false });   // alloc-rare: a share's two snapshots are made with the share, once
// (Every request's pictures the same as the snapshot's, in the same order.)
function sameReqs(P, C) {
  if (P.n !== C.n) return false;
  for (let i = 0; i < C.n; i++) if (!sameNum(P.v[i], C.v[i]) || !sameNum(P.f[i], C.f[i])) return false;
  return true;
}
function sameGrid(P, C) { for (let i = 0; i < 5; i++) if (!sameNum(P.g[i], C.g[i])) return false; return true; }
function sameParts(P, C) {
  if (P.fn !== C.fn) return false;
  for (let i = 0; i < C.fn * 4; i++) if (P.fp[i] !== C.fp[i]) return false;
  return true;
}
const MAX_PIECES = 32;
// (What of the rects `parts` lies outside the n rects kept flat in `kept` (x0, y0, x1, y1 each), as rects from the share's pools; null when
// that takes more than MAX_PIECES.)
function outside(S, parts, kept, n, ring, L = S) {
  const A = L.oA || (L.oA = []), B = L.oB || (L.oB = []), pool = L.oPool || (L.oPool = []);   // alloc-rare: the share's lists are made at their first use
  let cur = A, nxt = B, np = 0;
  const take = (x0, y0, x1, y1) => { const o = pool[np] || (pool[np] = [0, 0, 0, 0]); np++; o[0] = x0; o[1] = y0; o[2] = x1; o[3] = y1; return o; };   // alloc-rare: one closure a moved glass's plan, and the pool grows to the most pieces
  cur.length = 0;
  for (const r of parts) cur.push(take(r[0], r[1], r[2], r[3]));
  for (let k = 0; k < n; k++) {
    const kx0 = kept[k * 4] + ring, ky0 = kept[k * 4 + 1] + ring, kx1 = kept[k * 4 + 2] - ring, ky1 = kept[k * 4 + 3] - ring;
    if (!(kx1 > kx0 && ky1 > ky0)) continue;
    nxt.length = 0;
    for (const r of cur) {
      if (r[2] <= kx0 || r[0] >= kx1 || r[3] <= ky0 || r[1] >= ky1) { nxt.push(r); continue; }
      if (r[1] < ky0) nxt.push(take(r[0], r[1], r[2], ky0));
      if (r[3] > ky1) nxt.push(take(r[0], ky1, r[2], r[3]));
      const y0 = Math.max(r[1], ky0), y1 = Math.min(r[3], ky1);
      if (r[0] < kx0) nxt.push(take(r[0], y0, kx0, y1));
      if (r[2] > kx1) nxt.push(take(kx1, y0, r[2], y1));
    }
    if (nxt.length > MAX_PIECES || np > 4 * MAX_PIECES) return null;
    const t = cur; cur = nxt; nxt = t;
  }
  return cur;
}
// (Boxes x (one, or a list) put at the end of cat; false when x is null: not known.)
function joinInto(cat, x) {
  if (!x) return false;
  if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) cat.push(x[i]); } else cat.push(x);
  return true;
}
const sameNum = (a, b) => a === b || (a !== a && b !== b);

/** An instance's needs for the picture just laid: req { id, boxes (CSS px from the canvas's corner), v, f (the keys of the picture under
 *  them) }. A second request from the same instance, or one after a draw, starts the next picture's set. */
export function sharePrep(S, req) {
  let again = S.phase !== 'prep';
  for (let i = 0; i < S.reqs.length && !again; i++) if (S.reqs[i].id === req.id) again = true;
  if (again) { S.reqs.length = 0; S.phase = 'prep'; }
  S.reqs.push(req);
}

/** What the first draw on this picture blurs: the parts of the copy every request needs (null: all of it), and whether that, the grid and
 *  every request's picture are the same as the last blur kept (shareKeep): { parts, same } (a record kept in the share, read before the
 *  next call). blurInto(out, pool, boxes, ox, oy, t, bw, bh): glass-gl's blurBoxesInto. */
// A blur the moving blood alone calls for (the same picture under the glasses, the same grid and parts, only the blood drew over it) waits until
// this long after the last blur kept. It was 28 ms, every second frame of a 60 Hz screen: the blood under a card blurred 30 times a second at
// rest, for streaks a 22 px blur leaves nothing of (heat recs H2, 12 Nov 2026: the phone and the Mac warm at rest). 250 ms: the blood in the
// glass is refreshed 4 times a second. Anything else (the view, the picture, a card's box) blurs at once, as before; the tint and blur are
// the same glass, only how often the blood in it is taken again changed.
export const BLOOD_BLUR_MS = 250;
/** Whether a blur that only the blood calls for is held back: `now` (ms) is less than `gap` after the last blur kept. */
export const bloodHeld = (keptAt, now, gap) => gap > 0 && keptAt >= 0 && now >= keptAt && now - keptAt < gap;
export function sharePlan(S, grid, t, bw, bh, full, blurInto, dirtyFor = null, dirtyInto = null, picDirtyFor = null, ring = 0, now = -1, gap = 0) {
  const boxes = S.boxBuf;
  boxes.length = 0;
  for (const r of S.reqs) for (const b of r.boxes) boxes.push(b);
  let parts = full ? null : blurInto(S.partsOut, S.partsPool, boxes, grid.x, grid.y, t, bw, bh);
  if (parts && (!parts.length || (parts.length === 1 && !parts[0][0] && !parts[0][1] && parts[0][2] === bw && parts[0][3] === bh))) parts = null;
  const C = S.cand, n = S.reqs.length;
  for (let i = 0; i < n; i++) { C.v[i] = S.reqs[i].v; C.f[i] = S.reqs[i].f; }
  C.n = n;
  // (A kept blur moved with the figure (shareShift) holds pictures of frames whose blood squares lie where the figure was: the blood's own path is
  // not taken from it, and a blur kept on the same pictures stays so marked, until a blur of a new picture or blood count.)
  const moved = S.snapOk && S.snap.moved;
  C.moved = moved && sameReqs(S.snap, C);
  C.g[0] = grid.X0; C.g[1] = grid.Y0; C.g[2] = grid.X1; C.g[3] = grid.Y1; C.g[4] = grid.T;
  // (The parts the glasses read, whole: kept in the snapshot beside the parts blurred, which may be fewer; see below.)
  C.fn = parts ? parts.length : -1;
  if (parts) { let k = 0; for (const r of parts) { C.fp[k++] = r[0]; C.fp[k++] = r[1]; C.fp[k++] = r[2]; C.fp[k++] = r[3]; } }
  // Only the moving blood changed since the last blur (the one request with the same picture, only its blood count moved), the grid and
  // the parts the glasses read the same, and the blood frames' squares known (dirtyFor): the parts to blur are those inside the squares'
  // reach, the rest of the blurred picture being what the last blur left. No squares known, or any of that different: all the parts, as ever.
  // (Render-cost plan 3c: any number of requests, so long as each one's picture is the last blur's and every one of them moved by the same
  // blood frames; until 5 Nov 2026 only a lone request was let through, and a card glass beside another of its look blurred all its parts.)
  // (3b: or each one's picture moved on by the same pictures (picDirtyFor: where those drew, when each was a part of the canvas drawn again).)
  if ((dirtyFor || picDirtyFor) && dirtyInto && !full && n >= 1 && S.snapOk && !moved) {
    const P = S.snap;
    let ok = P.n === n && P.fn === C.fn && typeof P.f[0] === 'number' && typeof C.f[0] === 'number' && C.f[0] >= P.f[0];
    const vMoved = ok && C.v[0] !== P.v[0];
    if (vMoved) ok = !!picDirtyFor && typeof P.v[0] === 'number' && typeof C.v[0] === 'number' && C.v[0] > P.v[0];
    for (let i = 0; ok && i < n; i++) {
      if (P.f[i] !== P.f[0] || C.f[i] !== C.f[0]) ok = false;
      else if (vMoved ? P.v[i] !== P.v[0] || C.v[i] !== C.v[0] : P.v[i] !== C.v[i]) ok = false;
    }
    const fMoved = ok && C.f[0] > P.f[0];
    if (!vMoved && !fMoved) ok = false;
    for (let i = 0; ok && i < 5; i++) if (!sameNum(P.g[i], C.g[i])) ok = false;
    for (let i = 0; ok && i < C.fn * 4; i++) if (P.fp[i] !== C.fp[i]) ok = false;
    // (Only the blood moved: the blur kept is current enough until the gap has passed. The snapshot stays, so the blur that follows covers every
    // blood frame since it: dirtyFor takes the range from the snapshot's frame.)
    if (ok && fMoved && !vMoved && now >= 0 && bloodHeld(S.keptAt, now, gap)) { S.plan.parts = null; S.plan.copy = null; S.plan.same = true; S.held++; return S.plan; }
    let d = null;
    if (ok) {
      const cat = S.dCat || (S.dCat = []);   // alloc-rare: the share's joined list is made at its first use
      cat.length = 0;
      if (fMoved && !(dirtyFor && joinInto(cat, dirtyFor(P.f[0], C.f[0])))) ok = false;
      if (ok && vMoved && !joinInto(cat, picDirtyFor(P.v[0], C.v[0]))) ok = false;
      if (ok) d = cat;
    }
    if (d) {
      let rects = parts;
      if (!rects) { const r = S.rFull[0]; r[0] = 0; r[1] = 0; r[2] = bw; r[3] = bh; rects = S.rFull; }
      // (d: one box, or a list of them (the tiles the blood drew, render-cost plan 3a); an empty list is nowhere.)
      let dl = d;
      if (!Array.isArray(d)) { S.dBox[0] = d; dl = S.dBox; }
      const dp = dl.length ? dirtyInto(S.dOut, S.dPool, dl, grid.x, grid.y, t, bw, bh) : (S.dOut.length = 0, S.dOut);
      let m = 0;
      for (const r of rects) for (let j = 0; j < dp.length; j++) {
        const q = dp[j], x0 = Math.max(r[0], q[0]), y0 = Math.max(r[1], q[1]), x1 = Math.min(r[2], q[2]), y1 = Math.min(r[3], q[3]);
        if (x1 > x0 && y1 > y0) { const o = S.rPool[m] || (S.rPool[m] = [0, 0, 0, 0]); o[0] = x0; o[1] = y0; o[2] = x1; o[3] = y1; S.rOut[m++] = o; }   // alloc-rare: the pool grows to the most parts a picture has had
      }
      S.rOut.length = m;
      if (!m) { S.plan.parts = null; S.plan.copy = null; S.plan.same = true; return S.plan; }   // (nothing the glasses read was reached: the blur kept is current; the snapshot stays, so the next range starts from it)
      parts = S.rOut;
    }
  }
  // (Render-cost plan 3d: the same pictures under every glass, the same grid, only the parts the glasses read moved (a card sliding over a figure
  // that stands still): the texels of the parts the last blur kept are current, so only what lies outside them is blurred. All of it inside
  // them: nothing is blurred, and the snapshot stays. Too many pieces: the parts whole, as before.)
  // (ring: how many texels in from a part's edge its blur reads texels the copy may not hold (the taps and one): only the kept parts shrunk
  // by it are taken as current. 0, not given: never.)
  let copy = null;
  // (The same parts as well: nothing moved since the blur kept, which may have been of some of them only (a strip, a slide): it is current.)
  if (ring > 0 && !full && parts && S.snapOk && C.fn > 0 && S.snap.fn > 0 && sameReqs(S.snap, C) && sameGrid(S.snap, C) && sameParts(S.snap, C)) { S.plan.parts = null; S.plan.copy = null; S.plan.same = true; return S.plan; }
  if (ring > 0 && !full && parts && S.snapOk && C.fn > 0 && S.snap.fn > 0 && sameReqs(S.snap, C) && sameGrid(S.snap, C) && !sameParts(S.snap, C)) {
    const left = outside(S, parts, S.snap.fp, S.snap.fn, ring);
    if (left && !left.length) { S.plan.parts = null; S.plan.copy = null; S.plan.same = true; return S.plan; }
    if (left) {
      // (The copy the kept parts hold, whole, is of these pictures too: only what lies outside them is copied from the canvas again, the costly
      // part of a blur (every canvas pixel under it read); the passes run on all of `left`, reading the copy kept around it. 12 Nov 2026, heat H2b:
      // a pan copies the strip it brings in, not the ring the passes need.)
      copy = outside(S, left, S.snap.fp, S.snap.fn, 0, S.oc || (S.oc = {}));   // alloc-rare: the share's second set of lists, made at its first use
      parts = left;
    }
  }
  C.np = parts ? parts.length : -1;
  if (parts) { let k = 0; for (const r of parts) { C.p[k++] = r[0]; C.p[k++] = r[1]; C.p[k++] = r[2]; C.p[k++] = r[3]; } }
  S.plan.parts = parts;
  S.plan.copy = copy;
  S.plan.same = S.snapOk && sameSnap(C, S.snap);
  return S.plan;
}
function sameSnap(a, b) {
  if (a.n !== b.n || a.np !== b.np) return false;
  for (let i = 0; i < 5; i++) if (!sameNum(a.g[i], b.g[i])) return false;
  for (let i = 0; i < a.np * 4; i++) if (!sameNum(a.p[i], b.p[i])) return false;
  let used = 0;   // (the requests in any order: each matches one of the other's, once)
  for (let i = 0; i < a.n; i++) {
    let hit = false;
    for (let j = 0; j < b.n; j++) if (!(used & (1 << j)) && a.v[i] === b.v[j] && a.f[i] === b.f[j]) { used |= 1 << j; hit = true; break; }
    if (!hit) return false;
  }
  return true;
}
/** The blur just made from the plan is the one kept: the next plan that is the same needs none. */
export function shareKeep(S, now = -1) { const t = S.snap; S.snap = S.cand; S.cand = t; S.snapOk = true; S.keptAt = now; }
/** Nothing kept: the next picture blurs. */
export function shareForget(S) { S.snapOk = false; }
/** The kept blur's targets were moved (sx, sy) texels with the figure (a pan: glass-gl.js shiftBlur), onto `grid` ({ X0, Y0, X1, Y1, T }; bw × bh
 *  texels): the snapshot's parts move with them, cut to the copy, and its grid is that one, so a plan on the same pictures takes every part still
 *  inside as current and blurs only the strip the pan brought under the glasses (sharePlan's 3d path). False, nothing kept, when it cannot. */
// (Boxes [x0, y0, x1, y1] × n, flat, moved (sx, sy) and cut to bw × bh in place: how many are left.)
function cutShift(a, n, sx, sy, bw, bh) {
  let m = 0;
  for (let i = 0; i < n; i++) {
    const x0 = Math.max(0, a[i * 4] + sx), y0 = Math.max(0, a[i * 4 + 1] + sy), x1 = Math.min(bw, a[i * 4 + 2] + sx), y1 = Math.min(bh, a[i * 4 + 3] + sy);
    if (!(x1 > x0 && y1 > y0)) continue;
    a[m * 4] = x0; a[m * 4 + 1] = y0; a[m * 4 + 2] = x1; a[m * 4 + 3] = y1; m++;
  }
  return m;
}
export function shareShift(S, sx, sy, grid, bw, bh) {
  const P = S.snap;
  if (!S.snapOk || P.fn < 0) { S.snapOk = false; return false; }
  P.fn = cutShift(P.fp, P.fn, sx, sy, bw, bh);
  if (P.np >= 0) P.np = cutShift(P.p, P.np, sx, sy, bw, bh);
  if (!P.fn) { S.snapOk = false; return false; }
  P.g[0] = grid.X0; P.g[1] = grid.Y0; P.g[2] = grid.X1; P.g[3] = grid.Y1; P.g[4] = grid.T;
  P.moved = true;
  return true;
}

/** The draw phase begins: true when this call is the picture's first (the one that blurs). */
export function shareTurn(S) {
  if (S.phase === 'draw') return false;
  S.phase = 'draw';
  return true;
}

// (recs-production-120hz §18: the shared targets have owners. Each instance that enters a request is a user; the last user to let go
// (its host freed, the instance disposed) frees the targets and the share itself, and the budget may reclaim them as a retained
// holder in between (they are made again by the next blur). A lost context takes the whole map, as before.)
/** Marks `id` a user of share S. */
export function shareUse(S, id) { (S.users ||= new Set()).add(id); }   // alloc-rare: the set is made at a share's first user, once
/** `id` lets go of every share of this context; a share left with no user is freed (free(S.t)) and forgotten. Returns how many. */
export function shareRelease(map, gl, id, free) {
  const byLook = map.get(gl);
  if (!byLook) return 0;
  let n = 0;
  for (const [k, S] of [...byLook]) {
    if (!S.users?.delete(id) || S.users.size) continue;
    byLook.delete(k); n++;
    S.hold?.drop(); S.hold = null;
    if (S.t) { try { free(S.t); } catch (e) { caught('blur-share:67', e); /* a lost context: nothing to free */ } S.t = null; }
    shareForget(S); S.ok = false;
  }
  if (!byLook.size) map.delete(gl);
  return n;
}
/** The GPU bytes a share's targets hold now (the copy, the pass and the blurred picture at their size, and its halvings). */
export function shareBytes(S) {
  const t = S?.t;
  if (!t) return 0;
  const [w, h] = String(t.size || '0x0').split('x').map(Number);
  let b = (w * h || 0) * 4 * (t.spare ? 4 : 3);   // (the copy, its pass, the blur, and the spare a pan's move goes through)
  for (const st of t.steps || []) b += (st.w * st.h || 0) * 4;
  return b;
}
