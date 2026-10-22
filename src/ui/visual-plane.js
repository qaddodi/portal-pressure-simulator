// Deck visuals V28 (package E): two readings on one plane, one across and one up, with a guideline's zones shaded behind.
// On a summary (visual: 'plane') each patient the slide lists in `of` is a point with its name; in the data card
// (tool: { kind: 'plane' }) the slide's own case is a ring that eases to each new reading. The SAAG and protein quadrant
// (presenter.js quadrantVisual) stays as it is.
//
//   visual: 'plane', plane: 'csph' | 'hvpg-ppg' | { x, y, zones, boxes, cuts, source, key? }, of: [rows as a table's]
//   tool: { kind: 'plane', plane: 'csph' }
//
// An axis is a fingerprint key with its range ({ key, max, min?, ticks?, name, short? }). A zone is { when, t, tone, at? }:
// `when` lists conditions [key, op, value] (op one of < <= > >=) that all hold; the first zone whose conditions hold names a
// point's zone, and one with no `when` is the rest of the plane. A box is an outlined zone drawn over the others (a deck's
// own; the CSPH plane's "no screening scope" box was taken out at Mohammad's word, 19 Oct). cuts: the cut-off lines, { x: [..], y: [..] }. key: false leaves the zones' key off the summary, the
// plot taking its width, where the zones' own words say it all (HVPG against PPG, Mohammad 19 Oct); every zone is then named.
// key: 'never' leaves it off everywhere, the data card and an iPhone too (the CSPH plane, whose zones are wide enough to name themselves). Zone words are the guideline's, checked against
// /mnt/project-files/guidelines/baveno8-aasld.md before a deck uses them.
//
// Everything that decides a place or a size is a pure function here (tests/panels-e.test.js); the drawing is at the
// element's own pixels, one unit a CSS pixel, so its words keep the slide's caption size (12 px or more) at any width.

import { h, fmt, clamp } from './util.js?v=9e70912a09';
import { TILE } from './table-marks.js?v=58a52c530c';

// ── Conditions: [key, op, value], all of which must hold ──
const OPS = { '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b };
/** True when every condition holds for the values in f; an unknown key or op fails it, an empty list holds. */
export function holds(when, f) {
  if (!when) return true;
  return Array.isArray(when) && when.every((c) => Array.isArray(c) && OPS[c[1]] && Number.isFinite(f?.[c[0]]) && OPS[c[1]](f[c[0]], c[2]));
}
/** The range [lo, hi] the conditions on one key leave open, within [min, max]. */
export function rangeOf(when, key, min, max) {
  let lo = min, hi = max;
  for (const c of when || []) if (c[0] === key) { if (c[1][0] === '<') hi = Math.min(hi, c[2]); else lo = Math.max(lo, c[2]); }
  return [lo, hi];
}

// ── The planes a deck can name ──
// CSPH in compensated advanced chronic liver disease, Baveno VIII (as confirmed in guidelines/baveno8-aasld.md): stiffness 15 kPa
// or less with platelets 150 or more rules CSPH out (1.15); 25 kPa or more rules it in (1.16), but not in obese MASLD, where a model's
// probability decides.
// AASLD 2024 uses the same rule-out and rule-in.
// HVPG against PPG: the app's fixed cut-offs (HVPG 5 and 10, PPG 6 and 12), the words naming the readings only, not a cause.
// Only 'Both normal' takes a rating colour (both under their amber cut-offs, as the tiles rate them); the zones where one or
// both are raised each take a colour of the pressure ramp instead, since a zone spans readings the tiles rate amber and red alike:
// blue for PPG only, violet for HVPG only, wine for both, so the four zones and their four swatches all differ.
export const PLANES = {
  csph: {
    x: { key: 'lsm', min: 0, max: 40, ticks: [0, 10, 15, 20, 25, 40], name: 'Liver stiffness, kPa', short: 'Stiffness, kPa' },
    y: { key: 'plt', min: 0, max: 300, ticks: [0, 100, 150, 300], name: 'Platelets, ×10³/µL', short: 'Platelets' },
    // (Mohammad's three words, 19 Oct: "No CSPH", "CSPH" and "Indeterminate", each on its own zone and no key. at: the middle of
    // the zone's largest open part, the amber L's lower band; edges: its cut-offs only where zones meet.)
    zones: [
      { when: [['lsm', '>=', 25]], t: 'CSPH', tone: 'hi', at: [32.5, 225], note: '25 kPa or more (not in obese MASLD)' },
      { when: [['lsm', '<=', 15], ['plt', '>=', 150]], t: 'No CSPH', tone: 'ok', at: [7.5, 225], note: '15 kPa or less with platelets 150 or more' },
      { t: 'Indeterminate', tone: 'mid', at: [12.5, 75], note: 'A model or spleen stiffness decides' },
    ],
    cuts: { x: [15, 25], y: [150] },
    source: 'Baveno VIII 1.15, 1.16',
    key: 'never',
    edges: true,
  },
  'hvpg-ppg': {
    x: { key: 'hvpg', min: 0, max: 30, ticks: [0, 5, 10, 20, 30], name: 'HVPG, mmHg', short: 'HVPG' },
    y: { key: 'ppg', min: 0, max: 30, ticks: [0, 6, 12, 20, 30], name: 'PPG, mmHg', short: 'PPG' },
    zones: [
      { when: [['hvpg', '<', 5], ['ppg', '<', 6]], t: 'Both normal', short: 'Both normal', tone: 'ok', note: 'HVPG under 5, PPG under 6 mmHg' },
      { when: [['hvpg', '<', 5]], t: 'PPG raised, HVPG normal', short: 'PPG only', tone: 'ppg', note: 'The wedge misses the resistance' },
      { when: [['ppg', '<', 6]], t: 'HVPG raised, PPG normal', short: 'HVPG only', tone: 'hvpg', at: [20, 3], note: 'HVPG 5 or more, PPG under 6 mmHg' },
      { t: 'Both raised', short: 'Both raised', tone: 'both', at: [20, 24], note: 'HVPG 5 or more, PPG 6 or more mmHg' },
    ],
    cuts: { x: [5, 10], y: [6, 12] },
    source: '',
    key: false,
  },
};
/** A slide's plane: a named one, or the deck's own, filled from the named one it starts from (base). */
export function planeOf(p) {
  if (typeof p === 'string') return PLANES[p] || null;
  if (!p || typeof p !== 'object') return null;
  const b = PLANES[p.base] || PLANES[p.zones] || null;   // (zones: 'csph' as the plan writes it, with x and y keys of its own)
  const ax = (a, d) => (typeof a === 'string' ? { ...(d?.key === a ? d : {}), key: a, name: d?.key === a ? d.name : TILE[a]?.t || a, min: d?.key === a ? d.min : 0, max: d?.key === a ? d.max : 30 } : { ...d, ...a });
  const pl = { ...b, ...p, x: ax(p.x ?? b?.x, b?.x), y: ax(p.y ?? b?.y, b?.y) };
  if (!Array.isArray(pl.zones)) pl.zones = b?.zones || [];
  if (!pl.x?.key || !pl.y?.key || !(pl.x.max > (pl.x.min ?? 0)) || !(pl.y.max > (pl.y.min ?? 0))) return null;
  return pl;
}
/** The zone the values in f fall in (the first whose conditions hold), or null. */
export const zoneOf = (pl, f) => pl.zones.find((z) => holds(z.when, f)) || null;

// ── Layout ──
/** The plot's frame in the element's pixels: its margins follow the lettering (fs: the caption size, px). */
/** The y axis's name as one rotated line, or the short name over its unit in two lines where the plot is too low for one. */
export function yLabel(pl, H, fs) {
  const unit = pl.y.name.includes(',') ? pl.y.name.split(',').slice(1).join(',').trim() : '', fit = (t) => t && est(t, fs) <= H - 8;
  const one = [pl.y.name, pl.y.short && unit ? `${pl.y.short}, ${unit}` : null].find(fit);
  if (one) return [one];
  const sh = pl.y.short || pl.y.key;
  return unit && fit(unit) ? [sh, unit] : [sh];
}
export function frame(W, H, fs, pl) {
  const tw = Math.max(...(pl.y.ticks || [pl.y.min ?? 0, pl.y.max]).map((t) => est(String(t), fs)));
  const L = Math.ceil(fs * 1.25 * yLabel(pl, H, fs).length + 10 + tw + 8), B = Math.floor(H - (fs * 1.25 + 8 + fs + 8)), T = Math.ceil(fs * 0.6 + 4), R = Math.floor(W - Math.max(10, est(String(pl.x.max), fs) / 2 + 2));
  return { L, R, T, B };
}
export const est = (t, px, w = 0.6) => String(t).length * px * w;   // (a run's width: Inter averages about 0.6 em a character)
export const scaler = (pl, fr) => ({
  X: (v) => fr.L + (fr.R - fr.L) * (clamp(v, pl.x.min ?? 0, pl.x.max) - (pl.x.min ?? 0)) / (pl.x.max - (pl.x.min ?? 0)),
  Y: (v) => fr.B - (fr.B - fr.T) * (clamp(v, pl.y.min ?? 0, pl.y.max) - (pl.y.min ?? 0)) / (pl.y.max - (pl.y.min ?? 0)),
});
/** Words that fit a width at a size: one line, else broken at spaces (or after a dash, as in Budd–Chiari) into as few lines as
 *  fit, else null (never cut short). */
export function fitWords(t, w, fs, maxLines = 3) {
  if (est(t, fs) <= w) return [t];
  const words = String(t).split(' ').flatMap((wd, i) => wd.split(/(?<=[–-])(?=.)/).map((part, j) => [part, i && !j ? ' ' : ''])), lines = [];
  let cur = '';
  for (const [wd, sep] of words) {
    const next = cur ? `${cur}${sep}${wd}` : wd;
    if (est(next, fs) <= w) cur = next;
    else { if (!cur || est(wd, fs) > w) return null; lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines.length <= maxLines ? lines : null;
}
/** True when the segment from (x0, y0) to (x1, y1) passes through the box [x0, y0, x1, y1] (checked every 2 px). */
export function crosses(ax, ay, bx, by, o) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
  for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; if (x > o[0] && x < o[2] && y > o[1] && y < o[3]) return true; }
  return false;
}
/** The cut-off lines in px, { x1, y1, x2, y2 }: across the whole plot, or with edges: true only where two zones meet, so a zone
 *  reads as one shape (the CSPH plane's amber L, Mohammad 19 Oct: one "Indeterminate" zone, its words with room). */
export function cutSegs(pl, X, Y, fr) {
  const out = [], x0 = pl.x.min ?? 0, y0 = pl.y.min ?? 0;
  const seg = (along, lo, hi, differ, mk) => {
    // (Sampled at 1/400 of the axis: a run of samples where the zones either side differ is one segment.)
    const n = 400, st = (hi - lo) / n;
    let from = null;
    for (let i = 0; i <= n; i++) {
      const t = lo + i * st, d = i < n && differ(t + st / 2);
      if (d && from == null) from = t;
      if (!d && from != null) { out.push(mk(from, t)); from = null; }
    }
  };
  for (const v of pl.cuts?.x || []) {
    if (!pl.edges) { out.push({ x1: X(v), x2: X(v), y1: fr.T, y2: fr.B }); continue; }
    const e = (pl.x.max - x0) / 1000;
    seg('y', y0, pl.y.max, (y) => zoneOf(pl, { [pl.x.key]: v - e, [pl.y.key]: y }) !== zoneOf(pl, { [pl.x.key]: v + e, [pl.y.key]: y }), (a, b) => ({ x1: X(v), x2: X(v), y1: Y(a), y2: Y(b) }));
  }
  for (const v of pl.cuts?.y || []) {
    if (!pl.edges) { out.push({ x1: fr.L, x2: fr.R, y1: Y(v), y2: Y(v) }); continue; }
    const e = (pl.y.max - y0) / 1000;
    seg('x', x0, pl.x.max, (x) => zoneOf(pl, { [pl.x.key]: x, [pl.y.key]: v - e }) !== zoneOf(pl, { [pl.x.key]: x, [pl.y.key]: v + e }), (a, b) => ({ x1: X(a), x2: X(b), y1: Y(v), y2: Y(v) }));
  }
  return out;
}
/** The plane's lines as thin boxes words keep clear of: the cut-offs and the outlined boxes' edges. */
export function lineBoxes(pl, X, Y, fr) {
  const out = [];
  // (4 px either side, so a word never sits against a line either.)
  for (const c of cutSegs(pl, X, Y, fr)) out.push([Math.min(c.x1, c.x2) - 4, Math.min(c.y1, c.y2) - 4, Math.max(c.x1, c.x2) + 4, Math.max(c.y1, c.y2) + 4]);
  for (const b of pl.boxes || []) {
    const [x0, x1, y0, y1] = zoneRect(pl, b), L = X(x0), R = X(x1), T = Y(y1), B = Y(y0);
    out.push([L - 2, T, L + 2, B], [R - 2, T, R + 2, B], [L, T - 2, R, T + 2], [L, B - 2, R, B + 2]);
  }
  return out;
}
/** A cut-off line broken where a name sits across it, pad px clear of the name's box either side: the segments left to draw.
 *  segs: { x1, y1, x2, y2 } (level or upright, as cutSegs); boxes: the names' boxes. */
export function gapSegs(segs, boxes, pad = 4) {
  const out = [];
  for (const s of segs) {
    const up = Math.abs(s.x2 - s.x1) < Math.abs(s.y2 - s.y1), at = up ? s.x1 : s.y1;
    // (The stretches the names take along the line, merged, then the line drawn between them.)
    let cut = boxes.filter((b) => (up ? b[0] - pad < at && b[2] + pad > at : b[1] - pad < at && b[3] + pad > at)).map((b) => (up ? [b[1] - pad, b[3] + pad] : [b[0] - pad, b[2] + pad]));
    let lo = Math.min(up ? s.y1 : s.x1, up ? s.y2 : s.x2);
    const hi = Math.max(up ? s.y1 : s.x1, up ? s.y2 : s.x2);
    cut = cut.sort((a, b) => a[0] - b[0]);
    const put = (a, b) => { if (b - a > 0.5) out.push(up ? { x1: at, x2: at, y1: a, y2: b } : { x1: a, x2: b, y1: at, y2: at }); };
    for (const [a, b] of cut) { if (b <= lo) continue; put(lo, Math.min(a, hi)); lo = Math.max(lo, b); if (lo >= hi) break; }
    put(lo, hi);
  }
  return out;
}
/** Each point's name placed beside it, clear of the other points and names and inside the plot: [{ x, y, anchor, lines }]
 *  (lines: the name, broken if it must be) or null for a name with nowhere to go. pts: [{ x, y, name, short? }] in px (short: a shorter name for when the full one has no room beside the point); avoid: other
 *  boxes [x0, y0, x1, y1] the names keep clear of (the zones' words). cross: the cut-off lines among them a name may sit across
 *  where it has no room beside its point on its own side (the line then breaks behind it, gapSegs), so it stays right by its
 *  point rather than going out on a long line (an iPhone's 0 to 5 mmHg column, some 45 px, holds no name: Mohammad, 19 Oct). */
export function placeNames(pts, fr, fs, r = 8, avoid = [], cross = []) {
  // (When a round leaves a name out or sends one out on a line, others are tried: the round that names the most wins, then
  // the one with the fewest lines, then the one whose names sit closest to their points, then the fewest across a cut-off.)
  const score = (res) => [res.filter((o) => !o).length, res.filter((o) => o?.lead).length, res.reduce((s, o, i) => s + (o ? Math.hypot(...near2(o.box, pts[i])) : 0), 0), res.filter((o) => o?.across).length];
  const better = (a, b) => a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && (a[2] < b[2] - 0.5 || (Math.abs(a[2] - b[2]) <= 0.5 && a[3] < b[3])))));
  let best = placeOnce(pts, fr, fs, r, avoid, null, cross), bs = score(best), order = null;
  for (let round = 0; (bs[0] || bs[1] || bs[3]) && round < 4; round++) {
    // (A name left without a place, or on a line, goes first in the next round, then one sitting across a cut-off.)
    const prev = order || pts.map((_, i) => i), res = round ? placeOnce(pts, fr, fs, r, avoid, prev, cross) : best, rank = (i) => (!res[i] || res[i].lead ? 0 : res[i].across ? 1 : 2);
    order = [0, 1, 2].flatMap((k) => prev.filter((i) => rank(i) === k));
    const next = placeOnce(pts, fr, fs, r, avoid, order, cross), sc = score(next);
    if (better(sc, bs)) best = next, bs = sc;
  }
  return best;
}
/** How far a name's box is from its point, across and down. */
const near2 = (b, p) => [Math.max(b[0] - p.x, 0, p.x - b[2]), Math.max(b[1] - p.y, 0, p.y - b[3])];
function placeOnce(pts, fr, fs, r, avoid, first, cross = []) {
  // (A point keeps every name 4 px clear of its ring: its radius, its 1.5 px outline and the gap.)
  const boxes = [...pts.map((p) => [p.x - r - 6, p.y - r - 6, p.x + r + 6, p.y + r + 6]), ...avoid];
  const lh = fs * 1.2, gap = r + 6;
  const meets = (b, o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1];
  const hit = (b) => boxes.some((o) => meets(b, o));
  // (Sitting across: clear of everything but the cut-off lines it may cross.)
  const hitBut = (b) => boxes.some((o) => !cross.includes(o) && meets(b, o));
  const inside = (b) => b[0] >= fr.L + 2 && b[2] <= fr.R - 2 && b[1] >= fr.T && b[3] <= fr.B - 2;
  // (The lines among the boxes to avoid: a name beside its point stays on the point's side of each one.)
  const cutLines = avoid.filter((o) => Math.min(o[2] - o[0], o[3] - o[1]) <= 8);
  // (Judged from the line itself, not its 4 px band: a point a hair off a cut-off still keeps its name on its own side.)
  const sameSide = (b, p) => cutLines.every((o) => {
    if (o[3] - o[1] > o[2] - o[0]) return b[3] <= o[1] || b[1] >= o[3] || (p.x < (o[0] + o[2]) / 2 ? b[2] <= o[0] : b[0] >= o[2]);
    return b[2] <= o[0] || b[0] >= o[2] || (p.y < (o[1] + o[3]) / 2 ? b[3] <= o[1] : b[1] >= o[3]);
  });
  // (The most crowded points choose first, so a point with little room is not hemmed in by its neighbours' names.)
  const near = (p) => pts.filter((q) => q !== p && Math.hypot(q.x - p.x, q.y - p.y) < 8 * fs).length;
  const order = first ? first.map((i) => [pts[i], i]) : pts.map((p, i) => [p, i, near(p)]).sort((a, b) => b[2] - a[2] || a[1] - b[1]);
  const out = new Array(pts.length).fill(null), named = [];
  for (const [p, i] of order) {
    // (The name on one line, then broken into narrower and narrower columns, so it can sit beside its point between two lines.)
    const full = [[p.name], ...[Math.max(60, (fr.R - fr.L) / 3), 8 * fs, 6 * fs, 4 * fs].map((w) => fitWords(p.name, w, fs, 3))].filter(Boolean)
      .filter((ls, k, all) => all.findIndex((o) => o.join('\n') === ls.join('\n')) === k);
    // (over: the lines it may sit across are no bar, and the place crossing the fewest wins.)
    const beside = (forms, over = false) => {
      let done = null, fewest = Infinity;
      for (const lines of forms) {
        const w = Math.max(...lines.map((l) => est(l, fs, 0.62))), hgt = lines.length * lh;
        // (Right of the point, left of it, above, below, then the four corners.)
        // (A name beside its point may sit a little high or low to clear a cut-off line.)
        const tries = [['start', p.x + gap, p.y - hgt / 2], ['end', p.x - gap, p.y - hgt / 2], ...[-0.45, 0.45].flatMap((k) => [['start', p.x + gap, p.y - hgt / 2 + k * fs], ['end', p.x - gap, p.y - hgt / 2 + k * fs]]),
          // (over or under it, centred, else slid along so it clears a line while still over its point)
          ...[0, -0.25, 0.25, -0.45, 0.45].flatMap((k) => [['middle', p.x + k * w, p.y - gap - hgt], ['middle', p.x + k * w, p.y + gap]]),
          ['start', p.x + gap * 0.7, p.y - gap * 0.7 - hgt], ['end', p.x - gap * 0.7, p.y - gap * 0.7 - hgt], ['start', p.x + gap * 0.7, p.y + gap * 0.7], ['end', p.x - gap * 0.7, p.y + gap * 0.7]];
        for (let [anchor, x, top] of tries) {
          // (A name centred over or under its point slides along to stay inside the plot.)
          if (anchor === 'middle') x = Math.min(Math.max(x, fr.L + 4 + w / 2), fr.R - 4 - w / 2);
          // (and one beside a point near the top or bottom edge slides up or down to stay inside.)
          else top = clamp(top, fr.T, fr.B - 2 - hgt);
          const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2, b = [x0, top, x0 + w, top + hgt];
          if (!over) { if (inside(b) && !hit(b) && sameSide(b, p)) { done = { x, y: top + fs * 0.85, anchor, lines, box: b }; break; } continue; }
          // (Across a cut-off, or on its point's side of every one: never clear of a line but on the wrong side of it.)
          const n = cross.filter((o) => meets(b, o)).length;
          if (n < fewest && inside(b) && !hitBut(b) && (n > 0 || sameSide(b, p))) fewest = n, done = { x, y: top + fs * 0.85, anchor, lines, box: b, across: n > 0 };
        }
        if (done) break;
      }
      return done;
    };
    // (No room beside it: the name at the nearest clear place in the plot, joined to its point by a thin line that crosses no
    // other point or name; over: it may sit across the cut-off lines.)
    const away = (forms, over = false) => {
      let best = null;
      for (const ls of forms) {
        const w = Math.max(...ls.map((l) => est(l, fs, 0.62))), hgt = ls.length * lh;
        for (let x0 = fr.L + 4; x0 + w <= fr.R - 2; x0 += 6) {
          for (let top = fr.T; top + hgt <= fr.B; top += 2) {
            const b = [x0, top, x0 + w, top + hgt];
            const lx = clamp(p.x, b[0], b[2]), ly = clamp(p.y, b[1], b[3]), d = Math.hypot(lx - p.x, ly - p.y) + ls.length * 6;
            if ((best && d >= best.d) || (over ? hitBut(b) : hit(b))) continue;
            if (pts.some((q) => q !== p && crosses(p.x, p.y, lx, ly, [q.x - r - 2, q.y - r - 2, q.x + r + 2, q.y + r + 2]))) continue;
            if (named.some((o) => crosses(p.x, p.y, lx, ly, o))) continue;
            // (A leader across a cut-off counts against it, so a name stays on its point's side of the line if it can, and
            // crosses as few lines as it must when it cannot.)
            const dd = d + 2 * fs * cutLines.filter((o) => crosses(p.x, p.y, lx, ly, o)).length;
            if (best && dd >= best.d) continue;
            // (A place right by its point needs no line.)
            const across = over && cross.some((o) => meets(b, o));
            best = { d: dd, x: x0, y: top + fs * 0.85, anchor: 'start', lines: ls, box: b, across, lead: Math.hypot(lx - p.x, ly - p.y) > gap + 2 || (!across && !sameSide(b, p)) ? [lx, ly] : null };
          }
        }
      }
      return best;
    };
    // (The full name beside the point; else the full name a little way out on a thin line when that is close; else the short
    // name beside it; else the name beside its point across the cut-off lines it must cross; else the full name or the short
    // one further out, whichever lands much nearer.)
    let done = beside(full);
    if (!done) {
      const sh = p.short ? beside([[p.short]]) : null, far = away(full);
      const shFar = !sh && p.short ? away([[p.short]]) : null;
      const over = !sh && cross.length && (!far || far.d > fs) ? beside(full, true) || (p.short ? beside([[p.short]], true) : null) : null;
      // (Out on a line, the name may sit across a cut-off where that brings it much nearer.)
      const farOver = !sh && !over && cross.length && (!far || far.d > fs) ? away(full, true) : null;

      done = sh && (!far || far.d > fs) ? sh : over || (farOver && (!far || farOver.d + fs < far.d) ? farOver : shFar && (!far || shFar.d + 2 * fs < far.d) ? shFar : far || shFar);
    }
    if (done) boxes.push(done.box), named.push(done.box);
    out[i] = done;
  }
  return out;
}
/** A zone's rectangle on the plot, in data units: [x0, x1, y0, y1] (the rest of the plane: the whole of it). */
export const zoneRect = (pl, z) => {
  const [x0, x1] = rangeOf(z.when, pl.x.key, pl.x.min ?? 0, pl.x.max), [y0, y1] = rangeOf(z.when, pl.y.key, pl.y.min ?? 0, pl.y.max);
  return [x0, x1, y0, y1];
};

/** Each zone's words (and each outlined box's) placed in the room the names and lines leave: [{ z, cls, x, y, anchor, lines, box }].
 *  used: boxes already taken (names, lines); dots: the points' boxes. Words with no clear place are left out where the key
 *  names them; with no key (pl.key === false, the summary) they search the whole zone, so every zone keeps its words. */
export function placeZoneWords(pl, fr, X, Y, fs, used, dots, card = false, only = null, choose = null) {
  const out = [], taken = [...used], lh = fs * 1.2, noKey = (pl.key === false || pl.key === 'never') && !card;
  const words = (z, cls) => {
    const [x0, x1, y0, y1] = zoneRect(pl, z), wpx = Math.min(X(x1), fr.R) - Math.max(X(x0), fr.L) - 12;
    // (A zone listed earlier lies over this one's rectangle, so its words keep out of it.)
    const over = cls === 'pze-zw' ? pl.zones.slice(0, pl.zones.indexOf(z)).map((o) => { const [a0, a1, b0, b1] = zoneRect(pl, o); return [X(a0), Y(b1), X(a1), Y(b0)]; }) : [];
    const forms = [fitWords(z.t, wpx, fs, 2), z.short && z.short !== z.t ? fitWords(z.short, wpx, fs, 2) : null].filter(Boolean);   // (the zone's short name where its full one has no room)
    const zl = Math.max(X(x0), fr.L) + 4, zr = Math.min(X(x1), fr.R) - 4, zt = Math.max(Y(y1), fr.T) + 4, zb = Math.min(Y(y0), fr.B) - 4;
    const inZone = (b) => b[0] >= zl && b[2] <= zr && b[1] >= zt && b[3] <= zb && !over.some((o) => b[0] < o[2] + 4 && b[2] > o[0] - 4 && b[1] < o[3] + 4 && b[3] > o[1] - 4);
    const clear = (b) => !taken.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) && !dots.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    for (const [k, lines] of forms.entries()) {
      // (The short name only where the full one has no clear place, and with no key only.)
      if (k && !noKey) break;
      let x = X(x0) + 6, y = Y(y1) + 6 + fs * 0.85;
      const w = Math.max(...lines.map((l) => est(l, fs, 0.62))), hgt = (lines.length - 1) * lh;
      // (At its point, slid along to stay inside its zone and the plot.)
      if (z.at) { x = clamp(X(z.at[0]), zl + w / 2, zr - w / 2); y = Y(z.at[1]) - hgt / 2 + fs * 0.3; }
      const boxAt = (x, y, anchor) => { const bx0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2; return [bx0, y - fs * 0.85, bx0 + w, y + hgt + fs * 0.25]; };
      // (A box's words along its bottom edge from the right, else along its top; a zone's along its top from its corner, or
      // around its point. Never over a point, a line or other words, and inside the zone.)
      const tries = [];
      if (cls === 'pze-bxw') for (const ty of [Y(y0) - 6 - hgt, Y(y1) + 6 + fs * 0.85]) for (let tx = zr - 2; tx - w >= zl; tx -= 6) tries.push([tx, ty, 'end']);
      else if (z.at) for (const dy of [0, -lh, lh, -2 * lh, 2 * lh, -3 * lh, 3 * lh]) for (const dx of [0, -12, 12, -24, 24, -48, 48, -72, 72, -96, 96]) tries.push([x + dx, y + dy, 'middle']);
      else for (let k = 0; k < 4; k++) for (let tx = x; tx + w <= zr; tx += 6) tries.push([tx, y + k * lh, 'start']);
      const fits = ([tx, ty, ta]) => { const b = boxAt(tx, ty, ta); return inZone(b) && clear(b); };
      let ok = choose ? null : tries.find(fits);
      // (Given a judge, every clear place, a few dozen spread over the zone, nearest its usual place first: the judge picks.)
      if (choose && noKey) {
        const all = [...tries.filter(fits)];
        for (let ty = zt + fs * 0.85; ty + hgt + fs * 0.25 <= zb; ty += 2) for (let tx = zl; tx + w <= zr; tx += 4) if (fits([tx, ty, 'start'])) all.push([tx, ty, 'start']);
        const mid = (t) => { const b = boxAt(...t); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }, [cx, cy] = mid([x, y, z.at ? 'middle' : 'start']);
        const kept = [];
        for (const t of all.sort((a, b) => Math.hypot(...mid(a).map((v, i) => v - [cx, cy][i])) - Math.hypot(...mid(b).map((v, i) => v - [cx, cy][i])))) {
          const [mx, my] = mid(t);
          if (kept.length < 32 && kept.every((o) => { const [ox, oy] = mid(o); return Math.abs(ox - mx) >= w / 4 || Math.abs(oy - my) >= lh / 2; })) kept.push(t);
        }
        if (kept.length) ok = choose(kept.map((t) => boxAt(...t)), z) ?? 0, ok = kept[ok];
      }
      // (With no key, then anywhere clear in the zone, nearest its usual place.)
      if (!ok && noKey && !choose) {
        let d = Infinity;
        for (let ty = zt + fs * 0.85; ty + hgt + fs * 0.25 <= zb; ty += 2) for (let tx = zl; tx + w <= zr; tx += 4) {
          const dd = Math.hypot(tx + (z.at ? w / 2 : 0) - x, ty - y);
          if (dd < d && fits([tx, ty, 'start'])) d = dd, ok = [tx, ty, 'start'];
        }
      }
      if (!ok) continue;
      const b = boxAt(ok[0], ok[1], ok[2]);
      taken.push(b);
      out.push({ z, cls, x: ok[0], y: ok[1], anchor: ok[2], lines, box: b });
      return;
    }
  };
  for (const z of pl.zones) if (!only || only.includes(z)) words(z, 'pze-zw');
  if (!card) for (const b of pl.boxes || []) if (!only || only.includes(b)) words(b, 'pze-bxw');   // (in the card the ring crosses the box's words; the key under the plot names it)
  return out;
}

/** The plot's words: the cut-off lines' boxes (rules), each point's name (names, as placeNames) and the zones' words (words, as
 *  placeZoneWords). at: the points in px. The names come first; with no key, a zone whose words found no room then takes its
 *  place first and the names are placed again around it, so every zone keeps its words and every point its name. */
export function layoutPlane(pl, fr, X, Y, fs, at, card = false) {
  const rules = lineBoxes(pl, X, Y, fr), dots = at.map((p) => [p.x - 12, p.y - 12, p.x + 12, p.y + 12]);
  // (The cut-off lines come first among the rules: a name may sit across one of those, the line broken behind it.)
  const cross = rules.slice(0, cutSegs(pl, X, Y, fr).length);
  const boxesOf = (ns) => ns.filter(Boolean).map((n) => n.box);
  let names = placeNames(at, fr, fs, 8, rules, cross), words = placeZoneWords(pl, fr, X, Y, fs, [...boxesOf(names), ...rules], dots, card);
  const missing = (pl.key === false || pl.key === 'never') && !card ? pl.zones.filter((z) => !words.some((w) => w.z === z)) : [];
  if (missing.length) {
    // (Each of them where it leaves the names best placed: all of them named, the fewest out on a line, then the nearest.)
    const score = (ns) => [ns.filter((n) => !n).length, ns.filter((n) => n?.lead).length, ns.reduce((s, n, i) => s + (n ? Math.hypot(Math.max(n.box[0] - at[i].x, 0, at[i].x - n.box[2]), Math.max(n.box[1] - at[i].y, 0, at[i].y - n.box[3])) : 0), 0)];
    const better = (a, b) => a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2] - 0.5)));
    const chosen = [];
    const judge = (cands) => {
      let bi = 0, bs = null;
      cands.forEach((b, i) => { const sc = score(placeNames(at, fr, fs, 8, [...rules, ...chosen, b], cross)); if (!bs || better(sc, bs)) bi = i, bs = sc; });
      chosen.push(cands[bi]);
      return bi;
    };
    const first = placeZoneWords(pl, fr, X, Y, fs, rules, dots, card, missing, judge), held = first.map((w) => w.box);
    const again = placeNames(at, fr, fs, 8, [...rules, ...held], cross);
    if (first.length && boxesOf(again).length >= boxesOf(names).length) {
      names = again;
      words = [...first, ...placeZoneWords(pl, fr, X, Y, fs, [...boxesOf(names), ...rules, ...held], dots, card, [...pl.zones.filter((z) => !missing.includes(z)), ...(pl.boxes || [])])];
    }
  }
  return { rules, names, words, dots };
}

/** The data card's dot for the slide's case, in proportion to the plot: its radius r and the clear gap g around it, px. */
export function dotSize(fr) {
  const m = Math.min(fr.R - fr.L, fr.B - fr.T), r = clamp(m * 0.025, 4, 6.5);
  return { r, g: clamp(r * 0.6, 2.5, 4) };
}
/** The circles [x, y, radius] the zones' words keep out of for the card's dot: the dot and its gap plus 4 px, where it stands
 *  and, when it moves, all along its way from where it was (at, from: { x, y } in px; R: the dot's radius with its gap). */
export function dotBoxes(at, from, R) {
  if (!at) return [];
  const k = R + 4, box = (x, y) => [x, y, k];
  if (!from || (Math.abs(from.x - at.x) < 0.5 && Math.abs(from.y - at.y) < 0.5)) return [box(at.x, at.y)];
  const n = Math.max(1, Math.ceil(Math.hypot(at.x - from.x, at.y - from.y) / 4)), out = [];
  for (let i = 0; i <= n; i++) out.push(box(from.x + (at.x - from.x) * i / n, from.y + (at.y - from.y) * i / n));
  return out;
}
/** Every zone's words in the data card, each in its own zone, nearest the zone's point (`at`, else its middle): [{ z, x, y, lines,
 *  fs, box, onLine }], x the words' middle and y the first line's baseline. They keep clear of the dot (avoid: dotBoxes), of
 *  each other and of the cut-off lines; at the card's caption size first, then smaller down to 12 px (never below, never cut
 *  short). Only where a zone has no room between its lines do its words sit across one inside it (onLine: the line hides
 *  behind them). */
export function placeCardWords(pl, fr, X, Y, fs, avoid = []) {
  // (o: a box [x0, y0, x1, y1], or a circle [x, y, r] the box must keep out of.)
  const rules = lineBoxes(pl, X, Y, fr), out = [];
  const hit = (b, o) => (o.length === 3 ? Math.hypot(Math.max(b[0] - o[0], 0, o[0] - b[2]), Math.max(b[1] - o[1], 0, o[1] - b[3])) < o[2] : b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  const sizes = [fs, ...[fs - 1, fs - 2, 12].filter((v, i, a) => v >= 12 && v < fs && a.indexOf(v) === i)];
  for (const z of pl.zones) {
    const [x0, x1, y0, y1] = zoneRect(pl, z), i = pl.zones.indexOf(z);
    const zl = Math.max(X(x0), fr.L) + 4, zr = Math.min(X(x1), fr.R) - 4, zt = Math.max(Y(y1), fr.T) + 4, zb = Math.min(Y(y0), fr.B) - 4;
    // (A zone listed earlier lies over this one's rectangle, so its words keep 4 px out of it.)
    const over = pl.zones.slice(0, i).map((o) => { const [a0, a1, b0, b1] = zoneRect(pl, o); return [X(a0) - 4, Y(b1) - 4, X(a1) + 4, Y(b0) + 4]; });
    const [cx, cy] = z.at ? [X(z.at[0]), Y(z.at[1])] : [(zl + zr) / 2, (zt + zb) / 2];
    let done = null;
    for (const strict of [true, false]) {
      for (const px of sizes) {
        // (On one line, else on two, so the words can sit beside the dot where it stands in a small zone's middle.)
        const lh = px * 1.2, sp = [...z.t.matchAll(/ /g)].map((m) => [z.t.slice(0, m.index), z.t.slice(m.index + 1)])
          .sort((a, b) => Math.max(...a.map((l) => l.length)) - Math.max(...b.map((l) => l.length)))[0];
        const forms = [[z.t], sp].filter((ls) => ls && Math.max(...ls.map((l) => est(l, px, 0.62))) <= zr - zl);
        for (const lines of forms) {
          const w = Math.max(...lines.map((l) => est(l, px, 0.62))), up = px * 0.85, hgt = up + (lines.length - 1) * lh + px * 0.25;
          let best = null, bd = Infinity;
          for (let top = zt; top + hgt <= zb; top += 2) for (let left = zl; left + w <= zr; left += 2) {
            const b = [left, top, left + w, top + hgt], d = Math.hypot(left + w / 2 - cx, top + hgt / 2 - cy);
            if (d >= bd || over.some((o) => hit(b, o)) || avoid.some((o) => hit(b, o)) || out.some((o) => hit(b, o.box)) || (strict && rules.some((o) => hit(b, o)))) continue;
            best = b, bd = d;
          }
          if (best) { done = { z, x: (best[0] + best[2]) / 2, y: best[1] + up, lines, fs: px, box: best, onLine: !strict && rules.some((o) => hit(best, o)) }; break; }
        }
        if (done) break;
      }
      if (done) break;
    }
    if (done) out.push(done);
  }
  return out;
}

// ── Drawing ──
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, typeof v === 'number' ? +v.toFixed(1) : v);
  el.append(...kids.flat().filter((k) => k != null));
  return el;
};
const valOf = (k, v) => (v == null || !Number.isFinite(v) ? '—' : fmt(v * (TILE[k]?.x ?? 1), TILE[k]?.d ?? 1));
const unitOf = (k) => TILE[k]?.u || '';

/** The plot itself: an element whose CSS gives it a size; draw(points, ring) redraws it at that size.
 *  points: [{ f, name, site }]; ring: the case's fingerprint or null. */
export function planePlot(pl, { card = false } = {}) {
  const el = h('div', { class: 'pze-plot' + (card ? ' pze-incard' : '') + (card && pl.key === 'never' ? ' pze-ownwords' : ''), role: 'img' });
  const svg = sv('svg', { class: 'pze-plane', 'aria-hidden': 'true' });
  // (The drawing redraws in base; the card's zone words and its dot stay the same elements, so they ease from where they were.)
  const halo = sv('circle', { class: 'pze-halo' }), dot = sv('circle', { class: 'pze-dot' });
  const base = sv('g'), wordsG = sv('g', { class: 'pze-cwords' }), ringG = sv('g', { class: 'pze-ring' }, halo, dot);
  svg.append(base, wordsG, ringG);
  el.append(svg);
  const cardWords = new Map();   // (zone → its text element in the card)
  let pts = [], ring = null, size = '', was = null, sizeWas = '';
  const draw = () => {
    const W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return;
    size = `${W}x${H}`;
    const fs = Math.max(12, parseFloat(getComputedStyle(el).fontSize) || 13);
    const fr = frame(W, H, fs, pl), { X, Y } = scaler(pl, fr);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    const kids = [];
    // Zones, the rest of the plane first, the first listed last (on top), as zoneOf reads them.
    const zs = [...pl.zones].reverse();
    for (const z of zs) {
      const [x0, x1, y0, y1] = zoneRect(pl, z);
      kids.push(sv('rect', { class: 'pze-zone', 'data-tone': z.tone || 'none', x: X(x0), y: Y(y1), width: X(x1) - X(x0), height: Y(y0) - Y(y1) }));
    }
    // The patients' names first, so every point keeps its name; the zones' words then take what room is left (the key names
    // every zone anyway; with no key, each zone's words search the whole zone for a clear place).
    const at = pts.filter((p) => Number.isFinite(p.f?.[pl.x.key]) && Number.isFinite(p.f?.[pl.y.key])).map((p) => ({ ...p, x: X(p.f[pl.x.key]), y: Y(p.f[pl.y.key]) }));
    // (No words ever sit on a line. Each zone's words in its corner, the rest of the plane at its own point, only where they
    // fit whole.)
    const { names, words } = card ? { names: [], words: [] } : layoutPlane(pl, fr, X, Y, fs, at, card);
    for (const b of pl.boxes || []) {
      const [x0, x1, y0, y1] = zoneRect(pl, b);
      kids.push(sv('rect', { class: 'pze-box', x: X(x0), y: Y(y1), width: X(x1) - X(x0), height: Y(y0) - Y(y1) }));
    }
    for (const w of words) {
      kids.push(sv('text', { class: 'pze-zt ' + w.cls, 'data-tone': w.z.tone || 'none', x: w.x, y: w.y, 'text-anchor': w.anchor, style: `font-size:${fs}px` }, w.lines.map((l, i) => sv('tspan', { x: w.x, dy: i ? fs * 1.2 : null }, l))));
    }
    // The cut-off lines, the axes and their ticks.
    // (Broken 4 px clear of a name that sits across one.)
    for (const c of gapSegs(cutSegs(pl, X, Y, fr), names.filter((n) => n?.across).map((n) => n.box))) kids.push(sv('line', { class: 'pze-cut', ...c }));
    kids.push(sv('line', { class: 'pze-axis', x1: fr.L, x2: fr.R, y1: fr.B, y2: fr.B }), sv('line', { class: 'pze-axis', x1: fr.L, x2: fr.L, y1: fr.T, y2: fr.B }));
    const on = (a, v) => (pl.cuts?.[a] || []).includes(v);
    // (x ticks that would touch drop out, the cut-offs kept first)
    const xt = [...(pl.x.ticks || [pl.x.min ?? 0, pl.x.max])].sort((a, b) => on('x', b) - on('x', a)), xs = [];
    for (const v of xt) { const x = X(v), w = est(String(v), fs) + 6; if (xs.every((o) => Math.abs(o - x) >= w)) xs.push(x), kids.push(sv('text', { class: 'pze-t' + (on('x', v) ? ' on' : ''), x, y: fr.B + 6 + fs * 0.9, 'text-anchor': 'middle', style: `font-size:${fs}px` }, String(v))); }
    const ys = [];   // (y ticks that would touch drop out, the cut-offs kept first)
    for (const v of [...(pl.y.ticks || [pl.y.min ?? 0, pl.y.max])].sort((a, b) => on('y', b) - on('y', a))) { const y = Y(v); if (ys.every((o) => Math.abs(o - y) >= fs * 1.1)) ys.push(y), kids.push(sv('text', { class: 'pze-t' + (on('y', v) ? ' on' : ''), x: fr.L - 6, y: y + fs * 0.35, 'text-anchor': 'end', style: `font-size:${fs}px` }, String(v))); }
    const xName = est(pl.x.name, fs) <= fr.R - fr.L ? pl.x.name : pl.x.short || pl.x.key, yNames = yLabel(pl, H, fs);   // (the name runs the plot's full height; a short name keeps the unit, on a second line if it must)
    kids.push(sv('text', { class: 'pze-ax', x: (fr.L + fr.R) / 2, y: H - 4, 'text-anchor': 'middle', style: `font-size:${fs}px` }, xName));
    yNames.forEach((t, k) => kids.push(sv('text', { class: 'pze-ax', transform: `translate(${(fs * (0.95 + 1.25 * k)).toFixed(1)} ${clamp((fr.T + fr.B) / 2, est(t, fs) / 2 + 4, H - est(t, fs) / 2 - 4).toFixed(1)}) rotate(-90)`, 'text-anchor': 'middle', style: `font-size:${fs}px` }, t)));
    // The patients: a point each, its name beside it.
    at.forEach((p, i) => {
      const n = names[i];
      kids.push(sv('g', { class: 'pze-pt', 'data-site': p.site || 'none', style: `--i:${i}` }, n?.lead ? sv('line', { class: 'pze-lead', x1: p.x, y1: p.y, x2: n.lead[0], y2: n.lead[1] }) : null, sv('circle', { cx: p.x, cy: p.y, r: 8 }),
        n ? sv('text', { x: n.x, y: n.y, 'text-anchor': n.anchor, style: `font-size:${fs}px` }, n.lines.map((l, j) => sv('tspan', { x: n.x, dy: j ? fs * 1.2 : null }, l))) : null));
    });
    // The slide's case: a dot in proportion to the plot, a gap in the card's colour around it, that eases from where it was (a
    // transform, so Safari eases it too).
    const { r, g } = dotSize(fr), has = ring && Number.isFinite(ring[pl.x.key]) && Number.isFinite(ring[pl.y.key]);
    const now = has ? { x: X(ring[pl.x.key]), y: Y(ring[pl.y.key]) } : null;
    halo.setAttribute('r', (r + g).toFixed(1)); dot.setAttribute('r', r.toFixed(1));
    if (now) {
      ringG.style.transform = `translate(${now.x.toFixed(1)}px, ${now.y.toFixed(1)}px)`;
      ringG.style.opacity = '1';
    } else ringG.style.opacity = '0';
    // The card's zones name themselves, clear of the dot where it stands and all along its way there.
    if (card) {
      // (Where the dot's whole way leaves a zone no room, its words keep clear of where the dot ends.)
      let cw = placeCardWords(pl, fr, X, Y, fs, dotBoxes(now, sizeWas === size ? was : null, r + g));
      if (cw.length < pl.zones.length) { const end = placeCardWords(pl, fr, X, Y, fs, dotBoxes(now, null, r + g)); if (end.length > cw.length) cw = end; }
      for (const [z, t] of cardWords) if (!cw.some((w) => w.z === z)) t.remove(), cardWords.delete(z);
      for (const w of cw) {
        let t = cardWords.get(w.z);
        const pos = `translate(${w.x.toFixed(1)}px, ${w.y.toFixed(1)}px)`, body = w.lines.join('\n') + '|' + w.fs;
        if (!t) {
          t = sv('text', { class: 'pze-zt pze-zw', 'data-tone': w.z.tone || 'none', 'text-anchor': 'middle' });
          t.style.transform = pos; t.dataset.pos = pos;
          cardWords.set(w.z, t); wordsG.append(t);
        } else if (t.dataset.pos !== pos) {
          t.dataset.pos = pos;
          // (Moving out of the dot's way: out quickly before the dot gets there, back in at its new place.)
          t.style.opacity = '0';
          clearTimeout(t._mv);
          t._mv = setTimeout(() => { t.style.transform = pos; t.style.opacity = ''; }, 150);
        }
        if (t.dataset.body !== body) {
          t.dataset.body = body;
          t.style.fontSize = `${w.fs}px`;
          t.replaceChildren(...w.lines.map((l, j) => sv('tspan', { x: 0, dy: j ? w.fs * 1.2 : null }, l)));
        }
        t.classList.toggle('pze-onl', w.onLine);
      }
    }
    was = now; sizeWas = size;
    base.replaceChildren(...kids);
    el.setAttribute('aria-label', `${pl.y.name} against ${pl.x.name}` + (at.length ? ': ' + at.map((p) => `${p.name}, ${valOf(pl.x.key, p.f[pl.x.key])} and ${valOf(pl.y.key, p.f[pl.y.key])}, ${zoneOf(pl, p.f)?.t || ''}`).join('; ') : '')
      + (ring ? `; this patient ${valOf(pl.x.key, ring[pl.x.key])} ${unitOf(pl.x.key)} and ${valOf(pl.y.key, ring[pl.y.key])} ${unitOf(pl.y.key)}, ${zoneOf(pl, ring)?.t || ''}` : ''));
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (`${el.clientWidth}x${el.clientHeight}` !== size) requestAnimationFrame(draw); }).observe(el);
  return {
    el,
    set(points, r = ring) { pts = points || []; ring = r; if (el.isConnected) draw(); else requestAnimationFrame(draw); },
    ring(f) { ring = f; if (el.isConnected) draw(); },
  };
}

/** The zones' key: each zone's swatch, words and note, and the source line. */
export function planeKey(pl, lit = null) {
  return h('div', { class: 'pze-key' },
    h('ul', {}, [...pl.zones, ...(pl.boxes || []).map((b) => ({ ...b, box: true }))].map((z) => h('li', { 'data-tone': z.tone || 'none', class: (z.box ? 'pze-bx' : '') + (lit && lit === z.t ? ' on' : '') },
      h('i', { 'aria-hidden': 'true' }), h('b', {}, z.t), z.note ? h('span', {}, z.note) : null))),
    pl.source ? h('p', { class: 'pze-src' }, pl.source) : null);
}

/** The case's reading under the card's plot: its two values and the zone they fall in. */
const word = (a) => (a.short || a.name || a.key).split(',')[0];
export function planeReading(pl, f) {
  if (!f || !Number.isFinite(f[pl.x.key]) || !Number.isFinite(f[pl.y.key])) return '';
  const z = zoneOf(pl, f), u = (k) => (unitOf(k) ? ` ${unitOf(k)}` : '');
  return `${word(pl.x)} ${valOf(pl.x.key, f[pl.x.key])}${u(pl.x.key)} · ${word(pl.y)} ${valOf(pl.y.key, f[pl.y.key])}${u(pl.y.key)}${z ? ` · ${z.t}` : ''}`;
}
/** The card's short key under its plot (the plot is too small for every zone's words): a swatch and a short name each. */
export const planeCardKey = (pl) => h('ul', { class: 'pze-ckey', 'aria-hidden': 'true' }, [...pl.zones, ...(pl.boxes || []).map((b) => ({ ...b, box: true }))]
  .map((z) => h('li', { 'data-tone': z.tone || 'none', class: z.box ? 'pze-bx' : null }, h('i'), z.short || z.t)));

// ── The two forms ──
/** A summary panel: the plane with a point for each patient in the slide's `of`, and the zones' key beside it (where the plane
 *  sets key: false, only under the plot on an iPhone: elsewhere the plot takes the whole width and its zones name themselves). */
export function planeVisual(s, ctx, rowsFp) {
  const pl = planeOf(s.plane);
  if (!pl) return null;
  const plot = planePlot(pl);
  // (key: false hides it but on an iPhone, app.css; key: 'never' leaves only the source line under the plot.)
  const wrap = h('div', { class: 'pz-visual pze-planewrap' + (pl.key === false || pl.key === 'never' ? ' pze-nokey' : '') }, plot.el,
    pl.key === 'never' ? (pl.source ? h('p', { class: 'pze-src' }, pl.source) : null) : planeKey(pl));
  rowsFp(s, ctx, (rows) => plot.set(rows.map((r) => ({ f: r.f, name: r.name, short: r.short, site: r.site }))));
  return wrap;
}
/** A tool's plane: its plane field, its own x, y and zones, or the CSPH plane. */
export const toolPlane = (t) => planeOf(t?.plane ?? (t?.x || t?.y || t?.zones ? { x: t.x, y: t.y, zones: t.zones, base: t.base } : 'csph'));
/** The data card's instrument: the slide's case as a dot on the plane, its reading under it. */
export function createPlaneTool() {
  const el = h('div', { class: 'pze-tool' }), read = h('p', { class: 'pze-read', 'aria-live': 'polite' });
  let pl = null, plot = null, sig = '', last = null;
  return {
    el,
    configure(t) {
      const p = toolPlane(t);
      const k = JSON.stringify(t.plane ?? [t.x, t.y, t.zones, t.base]);
      if (k === sig && plot) return;
      sig = k; pl = p;
      if (!pl) { el.replaceChildren(); plot = null; return; }
      plot = planePlot(pl, { card: true });
      el.replaceChildren(...[plot.el, pl.key === 'never' ? null : planeCardKey(pl), read].filter(Boolean));
      if (last) this.pin(last);
    },
    pin(fp) {
      last = fp;
      if (!plot || !fp) return;
      plot.ring(fp);
      const t = planeReading(pl, fp);
      if (read.textContent !== t) read.textContent = t;
    },
    clear() { last = null; },
  };
}
