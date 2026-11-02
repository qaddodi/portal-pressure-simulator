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
// ?glassshare=0: each instance blurs on its own, as before. The 50 ms hold (?reblur=1) keeps the old way too (its hold is per instance).

import { caught } from './caught.js?v=b96b17594a';
const SEARCH = typeof location !== 'undefined' ? location.search || '' : '';
export const GLASS_SHARE = !/[?&]glassshare=0\b/.test(SEARCH);

/** The share for one look in one context (made on first use). */
export function shareFor(map, gl, look, scale) {
  let byLook = map.get(gl);
  if (!byLook) { byLook = new Map(); map.set(gl, byLook); }
  const k = `${look.blur}|${scale}`;
  let S = byLook.get(k);
  if (!S) { S = { look: k, reqs: [], phase: 'draw', key: '', ok: false, reg: null, t: null, blurs: 0, skips: 0, allocs: 0 }; byLook.set(k, S); }
  return S;
}

/** An instance's needs for the picture just laid: req { id, boxes (CSS px from the canvas's corner), key }. A second request from the
 *  same instance, or one after a draw, starts the next picture's set. */
export function sharePrep(S, req) {
  if (S.phase !== 'prep' || S.reqs.some((r) => r.id === req.id)) { S.reqs = []; S.phase = 'prep'; }
  S.reqs.push(req);
}

/** What the first draw on this picture blurs: the parts of the copy every request needs (null: all of it) and the key it is made from. */
export function sharePlan(S, grid, t, bw, bh, full, blurBoxes) {
  const boxes = [];
  for (const r of S.reqs) for (const b of r.boxes) boxes.push(b);
  let parts = full ? null : blurBoxes(boxes, grid.x, grid.y, t, bw, bh);
  if (parts && (!parts.length || (parts.length === 1 && !parts[0][0] && !parts[0][1] && parts[0][2] === bw && parts[0][3] === bh))) parts = null;
  const keys = S.reqs.map((r) => r.key).sort().join(',');
  const key = `${keys}|${grid.X0}|${grid.Y0}|${grid.X1}|${grid.Y1}|${grid.T}${parts ? `|${parts.join(';')}` : ''}`;
  return { parts, key };
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
export function shareUse(S, id) { (S.users ||= new Set()).add(id); }
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
    S.key = ''; S.ok = false;
  }
  if (!byLook.size) map.delete(gl);
  return n;
}
/** The GPU bytes a share's targets hold now (the copy, the pass and the blurred picture at their size, and its halvings). */
export function shareBytes(S) {
  const t = S?.t;
  if (!t) return 0;
  const [w, h] = String(t.size || '0x0').split('x').map(Number);
  let b = (w * h || 0) * 4 * 3;
  for (const st of t.steps || []) b += (st.w * st.h || 0) * 4;
  return b;
}
