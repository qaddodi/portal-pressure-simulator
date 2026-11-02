// One morph for a chart that is drawn again (sprint 1 Nov, "Animate chart changes smoothly"). A chart in the data card that
// changes (a new slide adds a point to the talk's trace, a curve is swapped for the next slide's) used to be built afresh and faded
// in over the old drawing, so for a moment both stood on the card, two lines, two sets of numbers, each at half strength. Now the
// new drawing takes over the old one's pieces: each line, dot, bar, gridline and word that is in both glides from where it stood to
// where it goes (position, length and size together, --d-surface on --ease-move); a piece only the old drawing has fades out where
// it stood (--d-small), a piece only the new one has fades in once the old words are going (a --d-flip delay, then --d-small).
//
//   morphSvg(prev, next)          prev: the <svg> on the card now, next: the new one, built but not in the page. true when it took
//                                 over (next is appended beside prev, which goes at the end); false when it did nothing at all
//                                 and the caller does what it always did (a crossfade): ?chartmorph=0, Reduce Motion, a drawing
//                                 in another coordinate system (a different viewBox), no piece in common, or a page that cannot.
//
// What is "the same piece": the same kind of element at the same place in the drawing's structure (its parents' first class and
// transform), with the same look (class, style, data-*, every attribute that is not geometry), and for words the same words;
// the n-th such piece of the old drawing is the n-th of the new. Anything else is not a pair, it fades: so a colour never changes
// part way, a word never turns into another, and a piece whose look changed crosses over (a line that turns from grey to red).
//   - Geometry that glides: x, y, x1..y2, cx, cy, r, rx, ry, width, height, d, points, transform, as numbers in the same pattern
//     of letters (a path with the same commands). A line that gains a point (M…L…L…) grows out of its old end; one that loses a
//     point folds into its new end. A pair whose geometry cannot be put side by side is not a pair.
//   - `data-nomorph` on an element, or on any group round it, is never paired: a part the chart moves itself (a ring that glides after
//     the slider, a word it places on every paint) is never written by two hands. It fades like any piece that has no partner.
//   - A fade is the Web Animations API's, over whatever opacity the piece has: a piece the stylesheet holds at less than full strength
//     (a ring that is `off`) is left to its own transition and never faded by this file.
//   - The clip paths in <defs> glide with their drawing, so a panel's corners and its fills stay together; nothing in <defs> fades.
// A morph begun while another is still going on the same card takes the drawing as it stands, mid-glide, as its old one, so a
// quick run of slides never jumps; the earlier morph's leaving words finish fading on their own.
// The clock is the eases' (frame.js easeNow: no leap after a long frame) and the writes come in the frame's late phase, after the
// chart's own paints, so a frame shows the glide and nothing else.
import { lateFrameFor, cancelFrame, easeNow } from './frame.js?v=8f6a8cf4d8';
import { D_FLIP, D_SMALL, D_SURFACE, EASE_ARRIVE, EASE_MOVE, easeMove } from './ease.js?v=7513a88c68';

const nextLate = lateFrameFor('svg-morph');

/** ?chartmorph=0 in a page's search string: charts crossfade as they always did. */
export const morphOff = (search) => /[?&]chartmorph=0\b/.test(String(search ?? ''));
const OFF = morphOff(typeof location !== 'undefined' ? location.search : '');

const GEO = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'd', 'points', 'transform']);
const LEAF = new Set(['line', 'path', 'rect', 'circle', 'ellipse', 'text', 'polyline', 'polygon']);
const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

// ── Numbers inside a string ─────────────────────────────────────────────────────────────────────────────────────────
/** A string split at its numbers: 'M1 2L3.5 4' → { glue: ['M', ' ', 'L', ' ', ''], nums: [1, 2, 3.5, 4] } (glue is one longer). */
export function splitNums(str) {
  const nums = [], glue = []; let last = 0;
  for (const m of String(str).matchAll(NUM)) { glue.push(str.slice(last, m.index)); nums.push(parseFloat(m[0])); last = m.index + m[0].length; }
  glue.push(String(str).slice(last));
  return { glue, nums };
}
const fmt = (v) => { const s = (Math.round(v * 100) / 100).toFixed(2); return s.replace(/\.?0+$/, '') || '0'; };
/** The numbers put back into their glue. */
export const joinNums = (glue, nums) => glue.reduce((s, g, i) => s + g + (i < nums.length ? fmt(nums[i]) : ''), '');
const sameGlue = (a, b) => a.length === b.length && a.every((g, i) => g === b[i]);

/** The points of a path that is one 'M x y' and then 'L x y's (how the charts draw a polyline), else null. */
export function polyPoints(d) {
  const { glue, nums } = splitNums(d);
  if (nums.length < 2 || nums.length % 2) return null;
  const g = glue.map((s) => s.replace(/[\s,]+/g, ''));
  for (let i = 0; i < g.length; i++) if (g[i] !== (i === 0 ? 'M' : i === g.length - 1 || i % 2 ? '' : 'L')) return null;
  const pts = []; for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}
export const polyD = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`).join('');

/** How a geometry attribute glides from `a` to `b`: { glue, from, to } over numbers in one pattern, { poly: true, from, to } for polylines
 *  of different lengths (the shorter one's last point repeated, so a new stretch grows out of the end and a lost one folds into it),
 *  or null when the two cannot be put side by side. Equal strings need no glide: { still: true }. */
export function tweenOf(attr, a, b) {
  if (a === b) return { still: true };
  const A = splitNums(a), B = splitNums(b);
  if (sameGlue(A.glue, B.glue) && A.nums.length === B.nums.length) return { glue: B.glue, from: A.nums, to: B.nums };
  if (attr === 'd') {
    const p = polyPoints(a), q = polyPoints(b);
    if (p && q) {
      const n = Math.max(p.length, q.length), pad = (pts) => Array.from({ length: n }, (_, i) => pts[Math.min(i, pts.length - 1)]);
      return { poly: true, from: pad(p), to: pad(q) };
    }
  }
  return null;
}
/** The glide's string at k (0 → a, 1 → b). */
export function tweenAt(tw, k) {
  if (tw.poly) return polyD(tw.from.map(([x, y], i) => [x + (tw.to[i][0] - x) * k, y + (tw.to[i][1] - y) * k]));
  return joinNums(tw.glue, tw.from.map((v, i) => v + (tw.to[i] - v) * k));
}

// ── Describing a drawing ────────────────────────────────────────────────────────────────────────────────────────────
const unref = (v) => v.replace(/url\(#[^)]*\)/g, 'url(#)');
// (A style as its declarations, without the opacity and visibility the morph itself writes, and with its numbers in one form: the browser
// writes a style back in its own, 12.00px as 12px.)
const styleOf = (el) => (el.getAttribute('style') || '').split(';').map((d) => d.trim()).filter((d) => d && !/^(?:opacity|visibility)\s*:/i.test(d))
  .map((d) => d.replace(/\s*:\s*/, ': ').replace(NUM, (m) => fmt(parseFloat(m)))).join('; ');
const firstClass = (el) => (el.getAttribute('class') || '').trim().split(/\s+/)[0] || '';
// What a group is, for the pieces inside it: its kind, its classes (less the ones that only say what state it is in), its data-* and its transform.
// So a gridline and a cut-off line, both in a group of class ptk-grid, are not mixed up, and a mark that becomes the last ("now") is still itself.
const VOLATILE = new Set(['now', 'on', 'off', 'in']);
const groupOf = (el) => {
  const t = el.localName || el.tagName, cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter((c) => c && !VOLATILE.has(c)).join('.');
  const data = el.getAttributeNames().filter((n) => n.startsWith('data-') && n !== 'data-nomorph').sort().map((n) => `${n}=${el.getAttribute(n)}`).join(',');
  return `${t}.${cls}${data ? `[${data}]` : ''}${el.getAttribute('transform') ? `@${el.getAttribute('transform')}` : ''}`;
};

/** Every piece of a drawing that can glide or fade, in document order: { el, key, geo, defs, skip }. key is what makes two pieces the
 *  same one (kind, place in the structure, look, and the words); geo the geometry attributes; defs: inside <defs> (glides, never fades);
 *  skip: kept out of the morph (data-nomorph). */
export function describe(svg) {
  const out = [];
  for (const el of svg.querySelectorAll('*')) {
    const tag = el.localName || el.tagName;
    if (!LEAF.has(tag)) continue;
    const path = []; let skip = false, defs = false;
    for (let p = el.parentNode; p && p !== svg; p = p.parentNode) {
      const t = p.localName || p.tagName;
      if (t === 'defs') defs = true;
      if (p.hasAttribute?.('data-nomorph')) skip = true;
      path.push(groupOf(p));
    }
    if (el.hasAttribute?.('data-nomorph')) skip = true;
    const geo = {}, look = [];
    for (const name of el.getAttributeNames()) {
      if (name === 'id' || name === 'style') continue;
      const v = el.getAttribute(name);
      if (GEO.has(name)) geo[name] = v; else look.push(`${name}=${unref(v)}`);
    }
    const st = styleOf(el); if (st) look.push(`style=${unref(st)}`);
    let words = '';
    if (tag === 'text') words = (el._t ?? el.textContent) + '\u0001' + [...el.children].map((c) => `${firstClass(c)}:${styleOf(c)}`).join('\u0002');
    out.push({ el, key: `${path.reverse().join('>')}>${tag}|${look.sort().join(';')}|${words}`, geo, defs, skip });
  }
  return out;
}

/** The morph of drawing A into drawing B (describe's lists): { pairs: [{ a, b, tweens: [[attr, tween]] }], oldOnly, newOnly }. The n-th piece
 *  of a key in A is the n-th in B; a pair whose geometry cannot be put side by side is no pair (both fade). */
export function planMorph(A, B) {
  const pool = new Map();
  for (const a of A) if (!a.skip) { let q = pool.get(a.key); if (!q) pool.set(a.key, q = []); q.push(a); }
  const pairs = [], newOnly = [], taken = new Set();
  for (const b of B) {
    if (b.skip) { if (!b.defs) newOnly.push(b); continue; }
    const a = pool.get(b.key)?.shift();
    const tweens = [];
    let ok = !!a;
    if (a) for (const attr of new Set([...Object.keys(a.geo), ...Object.keys(b.geo)])) {
      const x = a.geo[attr], y = b.geo[attr];
      const tw = x == null || y == null ? null : tweenOf(attr, x, y);
      if (!tw) { ok = false; break; }
      if (!tw.still) tweens.push([attr, tw]);
    }
    if (ok) { pairs.push({ a, b, tweens }); taken.add(a); } else if (!b.defs) newOnly.push(b);
  }
  const oldOnly = A.filter((a) => !a.defs && !taken.has(a));
  return { pairs, oldOnly, newOnly };
}

// ── The morph on the page ───────────────────────────────────────────────────────────────────────────────────────────
const active = new WeakMap();   // host → the morph going on in it
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const canFade = (el) => typeof el.animate === 'function' && typeof getComputedStyle === 'function';
/** A piece's opacity now and whether an earlier fade is still on it: { o, flying }. */
const probe = (el) => {
  const o = parseFloat(getComputedStyle(el).opacity);
  return { o: Number.isFinite(o) ? o : 1, flying: (el.getAnimations?.().length || 0) > 0 };
};
const FULL = 0.999;

export function morphSvg(prev, next) {
  try {
    if (OFF || reduced() || !prev?.isConnected || !prev.parentNode || typeof prev.querySelectorAll !== 'function' || typeof next?.querySelectorAll !== 'function' || typeof prev.getAttributeNames !== 'function') return false;
    for (const a of ['viewBox', 'width', 'height', 'preserveAspectRatio']) if ((prev.getAttribute(a) || '') !== (next.getAttribute(a) || '')) return false;
    const plan = planMorph(describe(prev), describe(next));
    if (!plan.pairs.length) return false;
    const host = prev.parentNode;
    active.get(host)?.release();
    const m = new Morph(host, prev, next, plan);
    active.set(host, m);
    m.start();
    return true;
  } catch (err) {
    // (Whatever went wrong, the caller crossfades as it always did.)
    console.error('[svg-morph]', err);
    return false;
  }
}

class Morph {
  constructor(host, prev, next, plan) {
    this.host = host; this.prev = prev; this.next = next; this.plan = plan;
    this.live = true; this.t0 = null; this.raf = 0; this.fades = [];
  }
  start() {
    const { host, next, plan } = this;
    host.append(next);
    const fade = canFade(next);
    // (What each piece is doing now, read before anything is written: a piece caught mid-fade by an earlier morph carries on from the strength
    // it has; one the stylesheet holds at less than full strength is left to the stylesheet.)
    const gone = fade ? plan.oldOnly.map((a) => probe(a.el)) : [], came = fade ? plan.newOnly.map((b) => probe(b.el)) : [];
    const kept = fade ? plan.pairs.map(({ a, b }) => { const pa = probe(a.el); return pa.flying ? { from: pa.o, to: probe(b.el).o } : null; }) : [];
    if (fade) for (const { a } of plan.pairs) a.el.getAnimations?.().forEach((x) => x.cancel());
    // (The new drawing starts exactly as the old one stood: its pieces at the old pieces' places, the old ones put out of sight under them.)
    for (const { a, b, tweens } of plan.pairs) {
      for (const [attr, tw] of tweens) { const v = tweenAt(tw, 0); b.el.setAttribute(attr, v); tw.last = v; }
      a.el.style.visibility = 'hidden';
    }
    // (A chart drawn on the GPU (svg-gl.js) draws each fade from its animation's own clock: noteFade.)
    const to = (el, from, o, delay, ms, ease) => { el.getAnimations?.().forEach((x) => x.cancel()); const an = el.animate([{ opacity: from }, { opacity: o }], { duration: ms, delay, easing: ease, fill: 'both' }); this.fades.push(an); host._svgGL?.noteFade(el, an, from, o, delay, ms, ease); };
    plan.oldOnly.forEach((a, i) => { const p = gone[i]; if (p && (p.flying || p.o >= FULL)) to(a.el, p.o, 0, 0, D_SMALL, EASE_MOVE); });
    plan.newOnly.forEach((b, i) => { const p = came[i]; if (p && p.o >= FULL) to(b.el, 0, 1, D_FLIP, D_SMALL, EASE_ARRIVE); });
    plan.pairs.forEach(({ b }, i) => { const k = kept[i]; if (k && k.to >= FULL) to(b.el, k.from, 1, 0, D_SMALL, EASE_ARRIVE); });
    host._svgGL?.wake(D_SURFACE + D_FLIP + D_SMALL + 80);   // (its GPU picture drawn every frame of the glide and the fades)
    this.raf = nextLate(() => this.tick());
  }
  /** Another morph takes this card over: this one stops moving the new drawing (it is that morph's old one now); its leaving words finish. */
  release() { this.live = false; }
  tick() {
    this.raf = 0;
    const now = easeNow();
    if (this.t0 == null) this.t0 = now;
    const t = now - this.t0, { plan } = this;
    const gone = !this.next.isConnected;
    if (this.live && !gone) {
      const e = easeMove(clamp01(t / D_SURFACE));
      for (const { b, tweens } of plan.pairs) for (const [attr, tw] of tweens) {
        // (Something else wrote this number since the glide did, the chart's own paint: it keeps it, and the glide lets go of it.)
        if (tw.dead || (tw.last != null && b.el.getAttribute(attr) !== tw.last)) { tw.dead = true; continue; }
        tw.last = tweenAt(tw, e); b.el.setAttribute(attr, tw.last);
      }
    }
    if (gone || t >= D_SURFACE) { this.finish(); return; }
    this.raf = nextLate(() => this.tick());
  }
  finish() {
    const { plan } = this;
    if (this.live && this.next.isConnected) for (const { b, tweens } of plan.pairs) for (const [attr, tw] of tweens) if (!tw.dead) b.el.setAttribute(attr, b.geo[attr]);
    for (const f of this.fades) f.cancel();
    this.prev.remove();
    cancelFrame(this.raf); this.raf = 0;
    if (active.get(this.host) === this) active.delete(this.host);
    this.live = false;
  }
}
