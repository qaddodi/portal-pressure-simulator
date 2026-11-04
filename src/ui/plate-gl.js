// A popover's or menu's own look (its fill, its ring and its shadow) drawn on the GPU (Mohammad, 3 Nov 2026: "Move. Everything. To. GPU.").
//
// Why a plate, not a picture inside the menu (as a toast has): a menu scrolls and clips what is inside it (overflow), so a picture
// laid inside it would scroll with the rows and lose its shadow at the edge. The picture is therefore a sibling, a plate laid just
// under the menu in the page. It rides where the menu rides with no script in a frame:
//   - its place and its way in and out are the menu's own CSS (position, translate, animation, clip), carried over by twin rules made
//     from the stylesheet when the first plate is made (twinRules: every rule whose subject is the menu gets a twin for the plate, so
//     an edit to the menu's CSS reaches its plate with it);
//   - what the menu's inline style sets (its translate from the corner, a swipe's transform, the dock's --sink)
//     is copied across in the same microtask, before the frame that draws it (a MutationObserver, class and style);
//   - its size is the menu's, from the menu's ResizeObserver (a border box that cost no layout read), and its picture is drawn in the
//     same callback, so the plate and the menu are never of two sizes in one frame.
// The menu keeps its box, its hit area, its focus and its words; its own background and box-shadow give way (.box-gl) only once the
// GPU has drawn the plate, so a GPU that cannot draw yet (shaders compiling, a lost context, a software renderer) leaves the menu as
// the page paints it, never bare.
//
//   const plate = plateFor(menuEl, 'menu' | 'umenu');   // null where the GPU cannot take it (the menu keeps its own look)
//   plate.leaveAlong()    // the menu has started to leave while still coming in: the plate follows the same way out
//   plate.dispose()
//
// What the plate draws is what the menu's own CSS says (read from its computed style, off the menu's own look): the opaque fill, the box
// shadows (blurred, ring, inset ring) and the corner radius, so a sheet's square foot, the upright iPad's floating sheet and the dark
// themes' deeper shadows are the stylesheet's, not a copy kept here. A look it cannot draw exactly (a translucent fill, a gradient, mixed
// corners) is left to the page.

import { widgetGL } from './widget-gl.js';
import { noteBox } from './util.js';
import { caught } from './caught.js';
import { shadowsOf } from './shadow-parse.js';
import { readStyle } from './layout-snap.js';
import { replayExit } from './menu-leave.js';
import { restRemove } from './rest-pass.js';

const ON = 'box-gl';
// The classes that decide where a menu sits and how it comes and goes (app.css): the plate takes the same ones, prefixed (bp-).
const STATE = ['as-sheet', 'sheet', 'from-dock', 'leaving', 'out', 'still', 'app-menu'];
const KIND = ['menu', 'umenu'];
// What a twin rule carries over: where the box sits and how it moves, never how it looks or what is in it.
const CARRY = /^(position|left|right|top|bottom|inset(-.*)?|translate|rotate|scale|transform(-origin)?|clip-path|z-index|animation(-.*)?|opacity|--.*)$/;

// ── The stylesheet's twin rules ──
let twinned = false;
const subjectIsMenu = (sel) => {
  const last = sel.trim().split(/\s*[\s>+~]\s*/).pop() || '';
  return !sel.includes('::') && /\.(menu|umenu)(?![\w-])/.test(last);
};
const twinOf = (sel) => {
  let s = sel.replace(/\.(menu|umenu)(?![\w-])/g, '.bp-$1');
  for (const c of STATE) s = s.replace(new RegExp(`\\.${c}(?![\\w-])`, 'g'), `.bp-${c}`);
  return s;
};
function twinRules(into, rules) {
  for (const r of rules) {
    if (r.type === 1 /* style */) {
      const sels = r.selectorText.split(/,(?![^(]*\))/).map((x) => x.trim()).filter(subjectIsMenu);
      if (!sels.length) continue;
      let body = '';
      for (let i = 0; i < r.style.length; i++) {
        const p = r.style[i];
        if (CARRY.test(p)) body += `${p}: ${r.style.getPropertyValue(p)}${r.style.getPropertyPriority(p) ? ' !important' : ''}; `;
      }
      if (body) into.insertRule(`${sels.map(twinOf).join(', ')} { ${body} }`, into.cssRules.length);
    } else if ((r.type === 4 /* media */ || r.type === 12 /* supports */) && r.cssRules?.length) {
      const head = r.type === 4 ? `@media ${r.media.mediaText}` : `@supports ${r.conditionText}`;
      const at = into.insertRule(`${head} {}`, into.cssRules.length), wrap = into.cssRules[at];
      twinRules(wrap, r.cssRules);
      if (!wrap.cssRules.length) into.deleteRule(at);
    }
  }
}
function makeTwins() {
  if (twinned) return;
  twinned = true;
  const style = document.createElement('style');
  style.setAttribute('data-plate-twins', '');
  document.head.append(style);
  const sheet = style.sheet;
  for (const sh of [...document.styleSheets]) {
    if (sh === sheet) continue;
    try { twinRules(sheet, sh.cssRules); } catch (e) { caught('plate-gl:twin', e); }   // (a sheet of another origin has no rules of ours to read)
  }
}

// ── What a menu looks like, from its own CSS ──
const alphaOf = (c) => {
  const s = String(c || '').trim();
  if (s === 'transparent') return 0;
  const m = /^rgba?\(([^)]+)\)$/.exec(s)?.[1].split(/[\s,/]+/).filter(Boolean);
  if (m) return m.length > 3 ? parseFloat(m[3]) : 1;
  return /^#/.test(s) && s.length === 7 ? 1 : NaN;   // (anything else is a form this does not know: not drawn)
};
/** The look an element's own CSS gives it (its class `on` set aside while it is read): { ok, bg, color, r, shadows, pad }. */
export function lookOf(el, on = ON) {
  const had = el.classList.contains(on);
  if (had) el.classList.remove(on);
  const cs = readStyle(el);
  const r = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(parseFloat);
  const shadows = shadowsOf(cs.boxShadow);
  const L = { ok: true, bg: cs.backgroundColor, color: cs.color, r, shadows: shadows || [], pad: 0 };
  if (had) el.classList.add(on);
  const [tl, tr, br, bl] = r;
  const shape = tl === tr && tr === br && br === bl ? 'round' : tl === tr && br === 0 && bl === 0 ? 'sheet' : '';
  L.shape = shape;
  if (!shadows || alphaOf(L.bg) !== 1 || cs.backgroundImage !== 'none' || !shape || r.some(Number.isNaN)) L.ok = false;
  for (const s of L.shadows) {
    if (s.inset ? s.blur > 0 : false) L.ok = false;
    if (!s.inset) L.pad = Math.max(L.pad, Math.max(Math.abs(s.x), Math.abs(s.y)) + s.blur + Math.max(0, s.spread));
  }
  L.pad = Math.ceil(L.pad) + 2;
  return L;
}
/** Draws a look as a box at (x, y), w × h: its shadows, its fill, its inset rings. A sheet's square foot is drawn as a round one a corner below the box (the screen's edge). */
export function paintLook(ctx, L, x, y, w, h) {
  const r = L.r[0], hh = L.shape === 'sheet' ? h + r : h;
  for (let i = L.shadows.length - 1; i >= 0; i--) {
    const s = L.shadows[i];
    if (s.inset) continue;
    const sp = Math.max(0, s.spread), rr = r + sp;
    if (s.blur > 0) ctx.shadowBox(x + s.x - sp, y - sp, w + 2 * sp, hh + 2 * sp, rr, s.c, 2 * s.blur, s.y);   // (the drawer's blur is the half-width of its ramp; a CSS blur of B is a gaussian of sigma B / 2, whose ramp the drawer's smoothstep over B each side matches)
    else if (sp > 0) {   // (a ring: a stroke as wide as the spread, laid just outside the box)
      ctx.strokeStyle = s.c; ctx.lineWidth = sp;
      ctx.beginPath(); ctx.roundRect(x + s.x - sp / 2, y + s.y - sp / 2, w + sp, hh + sp, r + sp / 2); ctx.stroke();
    }
  }
  ctx.fillStyle = L.bg;
  ctx.beginPath(); ctx.roundRect(x, y, w, hh, r); ctx.fill();
  for (const s of L.shadows) {
    if (!s.inset || !(s.spread > 0)) continue;
    ctx.strokeStyle = s.c; ctx.lineWidth = s.spread;
    ctx.beginPath(); ctx.roundRect(x + s.spread / 2, y + s.spread / 2, w - s.spread, hh - s.spread, Math.max(0, r - s.spread / 2)); ctx.stroke();
  }
}

// ── The plates ──
const PLATES = new Set();   // alloc-rare: the plates alive (one for each open menu, added once as it opens)
let watched = false;
function watchTheme() {
  if (watched) return;
  watched = true;
  // (A new theme or palette: every plate is drawn again in the microtask that follows the write, before the frame that shows it, so a menu
  // left open while the theme changes never shows its old surface under its new words.)
  new MutationObserver(() => { for (const p of PLATES) p.refresh(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette', 'data-noglass'] });   // alloc-rare: one observer for the page, made with the first plate
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { for (const p of PLATES) p.refresh(); });   // alloc-rare: one listener for the page
}

/** The GPU plate for `el` (a .menu or a .umenu, in the page), or null where the GPU cannot take it. */
export function plateFor(el, kind = 'menu') {
  if (typeof document === 'undefined' || !document.head || typeof el.before !== 'function' || !el.isConnected || !KIND.includes(kind)) return null;   // (no page, or a stand-in for one in a check: no plate)
  makeTwins();
  watchTheme();
  const plate = document.createElement('div');
  plate.setAttribute('aria-hidden', 'true');
  let wgl = null, look = null, size = null, dead = false, sty = null;
  const have = new Set();   // (the bp- classes the plate wears now)
  // (What the menu's classes say, carried across by name; classList, never className, so what the drawer puts on the plate stays.)
  const follow = () => {
    if (dead) return;
    for (const c of STATE) {
      const on = el.classList.contains(c);
      if (on !== have.has(c)) { plate.classList.toggle(`bp-${c}`, on); if (on) have.add(c); else have.delete(c); }
    }
    // (What the menu's inline style says is carried across; the plate's own size is written after it, important, so a copied height or max-height never wins.)
    const s = el.getAttribute('style') || '';
    if (s !== sty) {
      sty = s; plate.style.cssText = s;
      if (wgl) plate.style.setProperty('--wgl-pad', `${wgl.pad0}px`);
      if (size) putSize();
    }
  };
  const putSize = () => {
    plate.style.setProperty('width', `${size.w}px`, 'important');
    plate.style.setProperty('height', `${size.h}px`, 'important');
  };
  const live = (on) => { el.classList.toggle(ON, on); mo.takeRecords(); };
  const mo = new MutationObserver(follow);
  mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
  const draw = () => {
    if (dead || !size || size.w < 1 || size.h < 1) return false;
    look = lookOf(el);
    mo.takeRecords();
    if (!look.ok) { wgl?.dispose(); wgl = null; live(false); return false; }
    if (!wgl) {
      // (The picture's callback is the drawer's own, which also calls it when a GPU that was not ready becomes ready; the menu's own look
      // gives way in the microtask after such a draw, once the drawer says it drew.)
      wgl = widgetGL(plate, (ctx, w, h, pad) => { paintLook(ctx, look, pad, pad, w - 2 * pad, h - 2 * pad); queueMicrotask(() => { if (!dead && wgl?.live && look.ok) live(true); }); }, { pad: look.pad });
      if (!wgl) { live(false); return false; }
      wgl.pad0 = look.pad;
      plate.style.setProperty('--wgl-pad', `${look.pad}px`);
    }
    const host = plate.firstElementChild;
    if (host) noteBox(host, size.w + 2 * wgl.pad0, size.h + 2 * wgl.pad0);   // (the picture is drawn at the size just set, not at the one the observer last reported)
    const ok = wgl.paint() === true;
    live(ok || (wgl.live && look.ok));
    return ok;
  };
  const ro = new ResizeObserver((es) => {
    if (dead) return;
    if (!el.isConnected) { api.dispose(); return; }
    const b = es[es.length - 1].borderBoxSize?.[0];
    const w = b ? b.inlineSize : es[es.length - 1].contentRect.width, h = b ? b.blockSize : es[es.length - 1].contentRect.height;
    if (size && size.w === w && size.h === h) return;
    size = { w, h };
    putSize();
    draw();
  });
  const api = {
    el, plate,
    /** The look read again and drawn now (a theme, a palette: before the frame that shows it). */
    refresh() { if (!dead && el.isConnected) draw(); },
    /** The menu is leaving while its entrance still runs (menu-leave.js played an exit from where it had got to): the plate plays the same. */
    leaveAlong() {
      if (dead) return;
      try { replayExit(plate); } catch (e) { caught('plate-gl:leave', e); }
    },
    dispose() {
      if (dead && !plate.isConnected && !wgl) { PLATES.delete(api); return; }
      dead = true;
      PLATES.delete(api);
      mo.disconnect(); ro.disconnect();
      wgl?.dispose(); wgl = null;
      restRemove(plate);   // (taken out of the page between frames; the menu it sat under is leaving or gone, so its own class need not be put back)
    },
  };
  plate.className = `bp bp-${kind}`;
  follow();
  el.before(plate);
  PLATES.add(api);
  ro.observe(el);
  return api;
}
