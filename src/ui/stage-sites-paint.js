// The sites' readings: the portal-blood split bar, the readings' paint, count, measure and size, and the key pill's box.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { NODE_POS } from './anatomy.js';
import { glassCallout } from './callout.js';
import { SHOWN_TAU, follow2 } from './display-state.js';
import { dropLabel } from './drop-label.js';
import { cancelFrame } from './frame.js';
import { glWords } from './gl-words.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { portalSplit } from './table-marks.js';
import { clamp, fmt, putText } from './util.js';

import { stageScope } from './stage-scope.js';
export function createSitesPaint(st, live) {
  const { NI, NO_LIST, RES_BIT, SITE_DEF, SITE_EL, SITE_TPL, SPLIT_B, beatMean, breath, easeFrame, easeInOut, late, nextFrame, nodePos, pinned, readFrame, refreshCTM, resMade, resPaint, resRatio, sites, stageBox, viewMoving, watch, worldToLocalInto } = st;
  // The "Portal blood" callout: the share that bypasses the liver as its headline, over one bar split into the liver's
  // share (portal pink) and the shunts' (tinted like the shunt tile: plain, amber, red). The bar follows the share it is
  // asked for through the one filter the tiles' bars follow theirs with (display-state.js follow2, SHOWN_TAU): a new share
  // glides in, a share that keeps moving (a running model's mean, a what-if slider) is followed as it goes, and the callout's
  // size never changes.
  const SPLIT_TXT = [];   // percent → [the shunts' number, 'To the liver n%', 'Shunts n%']
  for (let i = 0; i <= 100; i++) SPLIT_TXT.push([`${i}`, `To the liver ${i}%`, `Shunts ${i}%`]);
  function splitShow(el, sh) {
    const p = portalSplit(sh);   // (a share of the portal blood: never read as the tile's liver flow, % of normal)
    // (Its three readings are drawn by glWords, never written in a frame: gl-words.js. Their words for each whole percent are made once: SPLIT_TXT.)
    const W = el._spW;
    W[0].set(SPLIT_TXT[p.shunt][0]); W[1].set(SPLIT_TXT[p.liver][1]); W[2].set(SPLIT_TXT[p.shunt][2]);
    el.style.setProperty('--sp-lf', (1 - sh).toFixed(4)); el.style.setProperty('--sp-sf', sh.toFixed(4));
    el.style.setProperty('--sp-lm', p.liver ? '4px' : '0px'); el.style.setProperty('--sp-sm', p.shunt ? '4px' : '0px');   // a share that rounds above 0 keeps a sliver; 0 leaves none
  }
  // (What a quarter of a pixel of the bar is, and under, cannot be seen: a share that far from the one shown lands, and is drawn
  // only when the bar or the number it prints would change, so a model that only breathes costs no styles.)
  const SPLIT_EPS = 0.002, SPLIT_DRAW = 0.0005;
  function splitPaint(el, sh, landed) {
    const d = el._shDrawn;
    if (d === sh || (d != null && !landed && Math.abs(sh - d) < SPLIT_DRAW && portalSplit(sh).shunt === portalSplit(d).shunt)) return;
    el._shDrawn = sh; splitShow(el, sh);
  }
  // splitTo only sets the share the bar aims at; the bar's own frames follow it. An ease that began afresh at each new share ran its
  // first step at no distance, so a share that changed every frame (the live model's running mean) cancelled each step before it
  // ran and the bar froze, 1 Nov. Here nothing restarts: a moving target is followed, from where the bar is, and never snaps.
  // (_sh the share shown, _shW the filter's first stage, _shAt the clock of its last step; the frame's own time can be a few ms before
  // the moment splitTo asked, so a step never runs on a negative interval. A tile that has left the page lands on its share at once,
  // not part way: _shTo already holds it, so the same share asked for again would otherwise never move it.)
  function splitStep(el, now) {
    el._shRaf = 0;
    const T = el._shTo, dt = Math.max(0, (now - el._shAt) / 1000);
    el._shAt = now;
    if (el.isConnected) { const r = follow2(el._sh, el._shW, T, dt, SHOWN_TAU, SPLIT_EPS); el._sh = r.v; el._shW = r.w; } else el._sh = el._shW = T;
    const landed = el._sh === T && el._shW === T;
    splitPaint(el, el._sh, landed);
    if (!landed) el._shRaf = easeFrame(el._shStep);
  }
  function splitTo(el, to) {
    if (el._shTo === to) return;
    el._shTo = to; el.dataset.rate = portalSplit(to).rate;
    const rest = !el._shRaf;
    if (el._sh == null || reduceMotion.matches) { cancelFrame(el._shRaf); el._shRaf = 0; el._shW = el._sh = to; splitPaint(el, to, true); return; }
    if (rest && Math.abs(to - el._sh) < SPLIT_EPS) { el._shW = el._sh = to; splitPaint(el, to, false); return; }
    if (rest) { el._shAt = performance.now(); el._shStep ||= (now) => splitStep(el, now); el._shRaf = easeFrame(el._shStep); }
  }
  const siteLive = (f, live, tol) => Number.isFinite(live) ? (Number.isFinite(f) && Math.abs(live - f) < tol ? f : live) : f;
  // Where a reading stands on the stage (its CSS translate worked out here, so placing it reads no layout), pointer included:
  // the figure's labels keep clear of it (layoutLabels). d: its SITE_DEF entry, or null for the catheter's readings.
  function calloutBox(el, d, cx, y, half, h) {
    const w = 2 * half, low = el.classList.contains('low');
    let bx = cx - half, by;
    if (d?.res) {
      const i = d.res === 'gut' ? 2 : d.res === 'coll' ? 1 : 0;
      if (low) { by = i === 2 ? y + h + 18 : y + 10; if (i === 0) bx = cx - w - 10; else if (i === 1) bx = cx + 10; }
      else by = y - (i + 1) * h - 12 - 6 * i;
      const b = { x0: bx, y0: by, x1: bx + w, y1: by + h };
      // (The key, centred on the group: above the outermost reading of a level circuit, under the group of an upright one.)
      if (el.classList.contains('keyed')) {
        const kw = (el._kwid || 0) / 2;
        b.x0 = Math.min(b.x0, cx - kw); b.x1 = Math.max(b.x1, cx + kw);
        if (low) b.y1 = by + 2 * h + 4; else b.y0 = by - h - 4;
      }
      return b;
    }
    const ahead = el.dataset.at === 'ahead' && !el.classList.contains('above');
    return ahead ? { x0: bx, y0: y, x1: bx + w, y1: y + 18 + h } : { x0: bx, y0: y - 18 - h, x1: bx + w, y1: y };
  }
  // A site's reading that leaves fades out whole, its glass too (cath-leave), and is removed once faded.
  function siteLeave(k, el) {
    if (sites.made.get(k) === el) sites.made.delete(k);
    el.classList.add('cath-leave');
    stageScope.timer(siteGone, reduceMotion.matches ? 0 : 700, el);
  }
  const sitePreQ = [], sitePreRun = () => { for (let i = 0; i < sitePreQ.length; i++) sitePreQ[i].classList.remove('cath-pre'); sitePreQ.length = 0; sitesAgain(); };   // (the readings just made, shown from the frame after)
  const siteGone = (el) => { dropLabel(el); el.remove(); };
  // A reading's number counts to a new value over 950 ms, eased, as the data card's tiles count (presenter.js tweener), so a slide's
  // or a patient's change never swaps it at once; within tol of the number shown (the live model breathing, a slider being dragged)
  // it simply follows. A reading just shown, hidden, or under reduced motion takes its number at once.
  const COUNT_MS = 950, LABEL_GLIDE_MS = 450;   // (LABEL_GLIDE_MS: the figure's labels glide as long: labelGlide)
  let sitesRaf = 0;
  const sitesRun = () => { sitesRaf = 0; if (live.F && sites.list) { refreshCTM(); sitesPaint(); } };
  const sitesAgain = () => { if (!sitesRaf) sitesRaf = nextFrame(sitesRun); };
  const SITE_CLS = {};   // (each reading's class text, made once)
  for (const k of Object.keys(SITE_DEF)) SITE_CLS[k] = `cath-label site ${SITE_DEF[k].cls} cath-pre`;
  const SITE_COUNT = {};   // (each reading's count in flight, made once: the record its element counts with)
  for (const k of Object.keys(SITE_DEF)) SITE_COUNT[k] = { from: 0, to: 0, t0: 0 };
  function siteCount(el, to, tol) {
    if (!Number.isFinite(to)) { el._nv = null; el._ng = null; return to; }
    if (el._nv == null || reduceMotion.matches || el.classList.contains('off')) { el._ng = null; return (el._nv = to); }
    const now = performance.now();
    let g = el._ng;
    if (g ? Math.abs(to - g.to) > tol : Math.abs(to - el._nv) > tol) { g = el._ng = el._ngO; g.from = el._nv; g.to = to; g.t0 = now; }
    if (!g) return (el._nv = to);
    g.to = to;
    const u = clamp((now - g.t0) / COUNT_MS, 0, 1);
    el._nv = g.from + (g.to - g.from) * easeInOut(u);
    if (u < 1) sitesAgain(); else el._ng = null;
    return el._nv;
  }
  const siteAt = [0, 0], resGone = [];   // (the resistors to drop, listed first as resPaint takes them out of resMade; the order the key goes by)
  let sitesWant = NO_LIST;   // (the readings this paint is for)
  function sitesPaint() {
    const want = sitesWant = sites.list || NO_LIST, made = sites.made;
    live.resMask = 0;
    resGone.length = 0;
    for (const k of resMade.keys()) if (!want.includes(k)) resGone.push(k);
    for (let i = 0; i < resGone.length; i++) resPaint(resGone[i], SITE_DEF[resGone[i]], null);
    for (const [k, el] of made) if (!want.includes(k)) siteLeave(k, el);
    if (!live.F || !want.length) return;
    const { width: W, height: H } = stageBox(), t = easeInOut(live.morph);   // (the cached box: reading the wrap's each model frame forced a layout)
    // (Never nearer a screen edge than the slides' one margin, as the cards and the figure's labels keep: 17 Oct design review.)
    const M = live.pillEdge ? live.pillEdge.m : 8;
    const x0 = Math.max(M, live.pzInset('--pz-l') + 8), x1 = W - Math.max(M, live.pzInset('--pz-r') + 8), y0 = Math.max(M, live.pzInset('--pz-t') + 8), y1 = H - live.pzInset('--pz-b') - 8;
    // (A wider screen's colour key stands on the nav pill at the lower right (presenter.js): one box, kept clear of every callout;
    // read at most twice a second, not each model frame.)
    const ko = keyPillBox();
    for (const k of want) {
      const d = SITE_DEF[k];
      if (!d || (d.node && !NODE_POS[d.node])) continue;
      // (A resistor's reading is a figure label now, resItem: only its zigzag is painted here, and which readings have a value is noted for the labels' signature.)
      if (d.res) { const ratio = resRatio(d.res); resPaint(k, d, ratio); if (ratio != null) live.resMask |= RES_BIT[k]; continue; }
      const ratio = null;
      let el = made.get(k);
      if (!el) {
        el = SITE_EL[d.res ? 0 : 1].cloneNode(true); el.className = SITE_CLS[k]; el._ngO = SITE_COUNT[k];
        if (!d.res) el._glass = glassCallout(el);
        // (Its parts are cloned from a model made ahead and put in the page, with their words, between frames: late().)
        const [sm, b0, u, kk] = SITE_TPL.cloneNode(true).children, b = d.split ? SPLIT_B.cloneNode(true) : b0;
        // (The share's three readings, taken from its own parts now: they join the callout only between frames (late), so a first paint
        // that looked for them in the callout found none and threw, and the slide was not shown.)
        if (d.split) el._spW = [...b.querySelectorAll('.sp-n, .sp-lt, .sp-st')].map((e) => glWords(e));
        el._b = b;   // (its number's box, kept for the same reason)
        late('text', sm, d.kicker); late('text', u, d.split ? '' : d.unit ?? 'mmHg');
        late('append', el, d.res ? [sm, b, u, kk] : [sm, b, u]);
        late('add', sites.el, el); made.set(k, el);
        // (Its first look at cath-pre is the frame's own style pass: it comes in from there next frame, with no layout forced for it.)
        { sitePreQ.push(el); nextFrame(sitePreRun); }
      }
      // Live readings, like the data card: the slide's numbers (fp) only while the model still agrees with them, so a
      // what-if slider moves the callouts as it moves the tiles.
      if (d.split) splitTo(el, clamp((Number.isFinite(sites.fp?.shunt) ? sites.fp.shunt : beatMean('shunt', live.F.metrics?.shuntFraction, 2)) ?? 0, 0, 1));   // (the slide's own share, the tile's number; a what-if or a time-lapse moves it with the tiles)
      // (A new number counts there, as the data card's tiles do, never jumps: siteCount.)
      const n = d.split ? null : d.res ? (ratio == null ? null : siteCount(el, ratio, 0.15)) : siteCount(el, siteLive(Number.isFinite(sites.fp?.[k]) ? sites.fp[k] : pinned()?.at?.P[NI[d.node]], (live.F.Pf || live.F.P)[NI[d.node]], breath(Number.isFinite(sites.fp?.[k]) ? sites.fp[k] : (live.F.Pf || live.F.P)[NI[d.node]])), 0.5);
      const b = el._b, v = d.split ? null : d.res ? (n == null ? '' : '×' + fmt(n, n < 10 ? 1 : 0)) : fmt(n, 1);
      if (v != null) putText(b, v);
      let x, y;
      { const np = nodePos(d.node, t), wl = worldToLocalInto(siteAt, np[0], np[1]); x = wl[0]; y = wl[1]; }
      // Off the free space (or a resistor with nothing to show, or out of the circuit), the reading waits hidden; above
      // its point unless the top is covered (decided once, so it never jumps).
      // (A reading wider than the free space, as the portal blood's share is between two wide cards on a phone held sideways, waits
      // hidden too: it would stand half under a card, its words cut off.)
      // (Nor does it stand on a card: one whose box would reach under the teaching card or the top cards turns to the other side of its point
      // where that is clear, and waits hidden where neither is: his ask, 6 Nov 2026, callouts "covering the card on phone".)
      if (!d.res && el._kh > 0 && el._kt != null) {
        const rt = y + el._kt, rb = rt + el._kh;
        if (rb > y1 + 2 && el._below && y - 18 - el._kh >= y0) { el._below = false; el.dataset.at = ''; el._kt = -18 - el._kh; }
        else if (rt < y0 - 2 && !el._below && y + 18 + el._kh <= y1) { el._below = true; el.dataset.at = 'ahead'; el._kt = 18; }
      }
      const onCard = !d.res && el._kh > 0 && el._kt != null && (y + el._kt + el._kh > y1 + 2 || y + el._kt < y0 - 2);
      el.classList.toggle('off', onCard || x < x0 || x > x1 || y < y0 || y > y1 || (!!d.res && (ratio == null || t < 0.5)) || (!d.res && !!el._half && 2 * el._half > x1 - x0 + 1));
      if (el._below == null && el._h) { el._below = d.below ? y + 18 + el._h < y1 : y - 18 - el._h < y0; el.dataset.at = el._below ? 'ahead' : ''; }
      // (Its width read again only when its words or classes change: a read after each frame's new number forced a layout.)
      // (Its digits are tabular, every one as wide as a zero (app.css .cath-label b), so a number counting to its next value keeps the
      // width and is not read again: with each counted step it was, a layout of the whole page forced in the middle of the labels'
      // update, after the figure's writes, 20 to 53 ms on his Mac (30 Oct). The labels' own widths are taken the same way: textW.)
      // (1 Nov 2026: its size is read first in the next frame, before any write (siteSize), never between the frame's writes; 'off' only fades
      // it, so it is not part of the key.)
      const wk = `${el.className.replace(/(?:^|\s)off(?=\s|$)/, '')}|${el.textContent.replace(/\d/g, '0')}|${W}|${live.labelBase()}|${live.labelFonts}`;
      if (el._wk !== wk || !el._half) siteSize(el, d, wk);
      const half = el._half, cx = clamp(x, Math.min(x0 + half, (x0 + x1) / 2), Math.max(x1 - half, (x0 + x1) / 2));
      el._box = el.classList.contains('off') ? null : calloutBox(el, d, cx, y, half, el._h || 0);
      el.style.setProperty('--ax', `${(x - cx).toFixed(1)}px`);
      el._glass?.(x - cx);
      el.style.transform = `translate(${cx.toFixed(1)}px, ${y.toFixed(1)}px)`; el._y = y;
      // Over the key or the nav pill: the callout steps left, its pointer still on its point; with no room there, a callout above
      // its point rises just clear of them. (Its height and its top's offset from its point are read with its width.)
      // (A reading's own offset is known from its side of the point, app.css data-at: read off the screen, it was read part way through
      // the .45 s glide to that side, and a callout below its point counted as above it, its foot on the key: Shunts 2 sideways.)
      if (!d.res) { el._kh = el._h || 0; el._kt = el.dataset.at === 'ahead' && !el.classList.contains('above') ? 18 : -18 - el._kh; }
      else if (el._kw !== wk + el.dataset.at) { el._kw = wk + el.dataset.at; siteSize(el, d, wk); }
      if (ko && !el.classList.contains('off')) {
        const rl = cx - half, rr = cx + half, rt = y + el._kt, rb = y + el._kt + el._kh;   // (its box: left, right, top, bottom)
        if (rr > ko.l - 8 && rl < ko.r + 8 && rb > ko.t - 8 && rt < ko.b + 8) {
          const dx = rr - (ko.l - 8), dy = rb - (ko.t - 8);
          if (rl - dx >= x0 && Math.abs(x - (cx - dx)) < half - 16) {
            el.style.setProperty('--ax', `${(x - cx + dx).toFixed(1)}px`); el._glass?.(x - cx + dx);
            el.style.transform = `translate(${(cx - dx).toFixed(1)}px, ${y.toFixed(1)}px)`;
            if (el._box) { el._box.x0 -= dx; el._box.x1 -= dx; }   // (the box calloutBox just made for this paint: no other holds it yet)
          } else if (!el._below && rt - dy >= y0 - 8) { el.style.transform = `translate(${cx.toFixed(1)}px, ${(y - dy).toFixed(1)}px)`; if (el._box) { el._box.y0 -= dy; el._box.y1 -= dy; } }
          // (One below its point, as the portal blood's share is, with no room to the left: it turns to stand above its point when
          // that is clear, once (Shunts 2 on a phone held sideways, its foot on the key).)
          else if (el._below && !el._turned && y - 18 - el._kh >= y0) { el._turned = true; el._below = false; el.dataset.at = ''; }
        }
      }
    }
  }
  // A reading's size (and a resistor's top, from where it was last placed), read first in the next frame (readFrame), when its words or
  // classes changed; the reading is placed again then. (Its digits are tabular: a counting number keeps its key and is never read again for it.)
  const siteWant = new Set();
  let siteAsk = 0;
  function siteMeasure(el, d, wk) {
    el._wk = wk; el._half = el.offsetWidth / 2; el._h = el.offsetHeight; el._kwid = d.res ? el.querySelector('.res-k')?.offsetWidth || 0 : 0;
    if (d.res && el._y != null) { const q = el.getBoundingClientRect(), wb = stageBox(); el._kt = q.top - wb.top - el._y; el._kh = q.height; }
    else { el._kh = el._h; el._kt = el.dataset.at === 'ahead' && !el.classList.contains('above') ? 18 : -18 - el._kh; }
  }
  function siteSize(el, d, wk) {
    el._sd = d; el._sk = wk; siteWant.add(el);   // (what to measure it with, kept on the reading itself)
    siteAsk ||= readFrame(siteRead);
  }
  function siteRead() {
    siteAsk = 0;
    for (const e of siteWant) if (e.isConnected) siteMeasure(e, e._sd, e._sk);
    siteWant.clear();
    sitesAgain();
  }
  let kpAt = -1e9, kpBox = null, kpAsk = 0;
  const kpBoxKept = { l: 0, t: 0, r: 0, b: 0 };   // (kpBox when a pill shows: written in place by each read, which comes first in a frame; the one caller reads it at once)
  function keyPillBox() {
    const now = performance.now();
    if (now - kpAt < 500) return kpBox;
    // (Kept while nothing laid out may have moved and while the view moves; due, read first in the next frame, never between its writes.)
    if (kpAt > -1e9 && (viewMoving() || !watch.due())) return kpBox;
    kpAsk ||= readFrame(keyPillRead);
    return kpBox;
  }
  function keyPillRead() {
    kpAsk = 0; kpAt = performance.now();
    let box = null;
    const wb = stageBox(), nl = document.querySelectorAll('.pz:not(.stack) .pz-fk:not([hidden]):not([data-empty]), .pz-bar.pzb-pill, .pz:not(.stack) .pz-scales:not([hidden])');
    for (let i = 0; i < nl.length; i++) {
      const r = nl[i].getBoundingClientRect();
      if (!r.width) continue;
      const l = r.left - wb.left, t = r.top - wb.top, rr = r.right - wb.left, b = r.bottom - wb.top;
      if (box) { box.l = Math.min(box.l, l); box.t = Math.min(box.t, t); box.r = Math.max(box.r, rr); box.b = Math.max(box.b, b); } else { box = kpBoxKept; box.l = l; box.t = t; box.r = rr; box.b = b; }
    }
    kpBox = box;
    sitesAgain();
  }
  return { LABEL_GLIDE_MS, siteLeave, sitesPaint };
}
