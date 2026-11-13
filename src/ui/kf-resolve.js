// A keyframe's move in pixels, for the glass (13 Nov 2026, iPhone: "the menus are still glitched", a swipe down "goes blank").
//
// The menu sheets rise and sink by keyframes the stylesheet writes against their own size: translateY(calc(100% + 8px)) (dock-sheet-in/out),
// translate(var(--edge-x), var(--edge-y)) with --edge-y: calc(100% + 8px) (slide-from-edge), and the exit menu-leave.js plays from where an
// entrance had got to, translateY(calc((100% + 8px) * 0.42)). glass-motion.js reads a keyframe's move as pixels only, so it could not follow
// these: the glass was read again from the page each frame instead, a frame behind, and the frost trailed the sheet as it came and went (seen
// headless, frame by frame). Here such a keyframe is turned into pixels once, when the glass first sees the animation, from the element's own
// size and custom properties: the same numbers the browser works it out with. Anything it cannot read is left as it was.

import { readMetric, readStyle } from './layout-snap.js';

const FN = /^(translate|translateX|translateY|translate3d)\(/;

/** Evaluates a CSS length expression of px, %, plain numbers, + - * / and brackets: px, with % of `pct` px. NaN when it cannot. */
export function evalLength(src, pct) {
  let i = 0;
  const s = String(src).replace(/calc\(/g, '(');   // alloc-rare: a keyframe resolved once, when the glass first sees its animation
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  function atom() {
    ws();
    if (s[i] === '(') { i++; const v = sum(); ws(); if (s[i] !== ')') return { v: NaN, u: 0 }; i++; return v; }
    if (s[i] === '-' ) { i++; const a = atom(); return { v: -a.v, u: a.u }; }
    const m = /^[+]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?(px|%|vh|vw|svh|dvh)?/i.exec(s.slice(i));
    if (!m) return { v: NaN, u: 0 };
    i += m[0].length;
    const n = parseFloat(m[1] + (m[2] || ''));
    const u = (m[3] || '').toLowerCase();
    return u === '%' ? { v: n / 100 * pct, u: 1 } : u === 'vw' ? { v: n / 100 * (globalThis.innerWidth || 0), u: 1 } : u.endsWith('vh') ? { v: n / 100 * (globalThis.innerHeight || 0), u: 1 } : u ? { v: n, u: 1 } : { v: n, u: 0 };   // (u: a length, or a plain number)
  }
  function prod() {
    let a = atom();
    for (;;) {
      ws();
      const op = s[i];
      if (op !== '*' && op !== '/') return a;
      i++;
      const b = atom();
      a = op === '*' ? { v: a.v * b.v, u: a.u || b.u } : { v: a.v / b.v, u: a.u };
    }
  }
  function sum() {
    let a = prod();
    for (;;) {
      ws();
      const op = s[i];
      if (op !== '+' && op !== '-') return a;
      i++;
      const b = prod();
      a = { v: op === '+' ? a.v + b.v : a.v - b.v, u: a.u || b.u };
    }
  }
  const r = sum();
  ws();
  return i === s.length && Number.isFinite(r.v) ? r.v : NaN;
}

/** Splits a function's arguments on its top-level commas (or spaces, for the translate property). */
function args(body, comma) {
  const out = []; let depth = 0, from = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (!depth && (comma ? c === ',' : c === ' ')) { out.push(body.slice(from, i)); from = i + 1; }
  }
  out.push(body.slice(from));
  return out.map((x) => x.trim()).filter((x) => x !== '');
}

/** Puts each var() the element defines in place (its computed value, else the var's own fallback). */
export function fillVars(str, get) {
  let s = String(str), guard = 0;
  for (;;) {
    const at = s.indexOf('var(');
    if (at < 0 || guard++ > 16) return s;
    let depth = 0, end = -1;
    for (let i = at + 3; i < s.length; i++) { if (s[i] === '(') depth++; else if (s[i] === ')') { depth--; if (!depth) { end = i; break; } } }
    if (end < 0) return s;
    const inner = s.slice(at + 4, end), comma = inner.indexOf(',');
    const name = (comma < 0 ? inner : inner.slice(0, comma)).trim(), fb = comma < 0 ? '' : inner.slice(comma + 1).trim();
    const v = String(get(name) || '').trim() || fb;
    s = s.slice(0, at) + v + s.slice(end + 1);
  }
}

/** One transform (a single translate function) or translate-property value as pixels, `translate(Xpx, Ypx)` / `Xpx Ypx`; null when it is not one. */
export function pxShift(val, prop, w, h, get) {
  const s = fillVars(val, get).trim();
  if (prop === 'translate') {
    const a = args(s, false);
    if (!a.length || a.length > 3) return null;
    const x = evalLength(a[0], w), y = a.length > 1 ? evalLength(a[1], h) : 0;
    return Number.isFinite(x) && Number.isFinite(y) ? `${x}px ${y}px` : null;
  }
  const m = FN.exec(s);
  if (!m || !s.endsWith(')')) return null;
  const a = args(s.slice(m[0].length, -1), true);
  let x = 0, y = 0;
  if (m[1] === 'translateX') x = evalLength(a[0], w);
  else if (m[1] === 'translateY') y = evalLength(a[0], h);
  else { x = evalLength(a[0], w); y = a.length > 1 ? evalLength(a[1], h) : 0; }
  return Number.isFinite(x) && Number.isFinite(y) && a.length >= 1 ? `translate(${x}px, ${y}px)` : null;
}

const needs = (v) => typeof v === 'string' && (v.includes('%') || v.includes('var('));

/** getKeyframes() of an animation of `el`, with each translation written against its size or a custom property turned into pixels. */
export function resolveKeyframes(kfs, el) {
  if (!kfs?.length || !el || !kfs.some((k) => needs(k.transform) || needs(k.translate) || needs(k.opacity))) return kfs;
  let w = 0, h = 0, cs = null;
  try { w = readMetric(el, 'offsetWidth') || 0; h = readMetric(el, 'offsetHeight') || 0; cs = readStyle(el); } catch { return kfs; }
  const get = (name) => cs?.getPropertyValue?.(name);
  return kfs.map((k) => {
    const o = { ...k };
    if (needs(k.transform)) { const r = pxShift(k.transform, 'transform', w, h, get); if (r) o.transform = r; }
    if (needs(k.translate)) { const r = pxShift(k.translate, 'translate', w, h, get); if (r) o.translate = r; }
    if (needs(k.opacity)) { const v = evalLength(fillVars(k.opacity, get), 0); if (Number.isFinite(v)) o.opacity = String(v); }   // (var(--edge-o, 1), or menu-leave.js's calc of it)
    return o;
  });
}
