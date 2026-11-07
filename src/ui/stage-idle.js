// The idle loop and the organ covers: when the figure sleeps and wakes, giving back the vessel buffers while hidden, and the organs' cover widths.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { stageCovered } from './seen.js';
import { ORGANS } from './anatomy.js';
import { hold as gpuHold } from './gpu-budget.js';
import { store } from './store.js';
import { WARM_MS, WARM_VIEWS } from './warm-views.js';

import { stageScope } from './stage-scope.js';
export function createIdle(st, live) {
  const { appEl, askAnimate, organEls, readFrame, vCanvas, wrap } = st;
  // (R08, warm-views.js: under the lobule the targets stay WARM_MS, so a quick Lobule → Anatomy makes nothing again; a hidden page
  // gives them back at once. ?warmviews=0: at once, as before.)
  function trimVeins() {
    if (live.veinsTrimmed || !live.veins || live.veins.lost || live.glowSync) return;
    if (WARM_VIEWS && !document.hidden) {
      const t = performance.now();
      if (!live.hiddenAt) {
        live.hiddenAt = t;
        // (Review pass item 8: the warm window is held in the global budget too (gpu-budget.js hold): several warm views at once, or memory
        // over the envelope, give these back before WARM_MS. Its release is this trim, once; showing the figure again drops the hold.)
        live.veinsHold = gpuHold({ owner: 'veins (under the lobule)', kind: 'warm', gl: live.veins.gl, bytes: () => (live.veinsTrimmed ? 0 : vCanvas.width * vCanvas.height * 58), release: () => { live.veinsHold = null; if (!live.veinsTrimmed && live.veins && !live.veins.lost && !live.glowSync) { live.veins.trim(); live.veinsTrimmed = true; live.veinsDirty = true; } } });
      }
      if (t - live.hiddenAt < WARM_MS) return;
    }
    live.veinsHold?.drop(); live.veinsHold = null;
    live.veins.trim(); live.veinsTrimmed = true; live.veinsDirty = true;
  }
  // (C5: a still figure on screen looks again once a second; one not shown (page hidden, home screen, lobule over it) is woken by what
  // shows it again, and looks only at the warm window's end, to give its buffers back (trimVeins), and never once they are.)
  const unseen = () => stageCovered() || !!live.lz?.isOpen();
  function sleepLook() {
    if (!unseen()) return 1000;
    if (live.veinsTrimmed || !live.veins || live.veins.lost) return 0;
    if (live.glowSync || !live.hiddenAt) return 1000;   // (the trim was held back this time: look again as before)
    return Math.max(0, WARM_MS - (performance.now() - live.hiddenAt)) + 1;
  }
  function sleep() {
    live.sleeping = true; stageScope.clear(live.sleepTimer); live.sleepTimer = 0;
    const ms = sleepLook();
    if (ms) live.sleepTimer = stageScope.timer(wake, ms);
  }
  function wake() { if (!live.sleeping) return; live.sleeping = false; stageScope.clear(live.sleepTimer); askAnimate(); }
  live.stageWake = wake;
  // (Not woken by a model frame alone: the frame's own update wakes the figure (update: stageWake), and nothing storeVer keys on is in it.
  // Rev 2 step 3.)
  store.on('*', wake, { frames: false });
  store.on('*', () => { live.storeVer++; }, { frames: false });
  document.addEventListener('visibilitychange', wake);
  new MutationObserver(wake).observe(wrap, { attributes: true, attributeFilter: ['class'] });
  if (appEl) new MutationObserver(wake).observe(appEl, { attributes: true, attributeFilter: ['class'] });
  // Opaque organ shapes (anatomy), as canvas paths; built once, band widths read from the CSS (as the stage is made, coverWRead).
  let organCovers = null;
  const coverW = new Map();
  function coverWRead() {
    let moved = false;
    for (const o of ORGANS) {
      if (!o.band || !organEls[o.id]) continue;
      const w = parseFloat(getComputedStyle(organEls[o.id]).strokeWidth) || 0;
      if (coverW.get(o.id) !== w) { coverW.set(o.id, w); moved = true; }
    }
    if (moved) { organCovers = null; }   // (built again with the widths read)
  }
  coverWRead();
readFrame(coverWRead);
  function getOrganCovers() {
    if (organCovers) return organCovers;
    organCovers = [];
    for (const o of ORGANS) {
      if (o.deco || o.noCover || !organEls[o.id]) continue;
      if (o.circle) { const p = new Path2D(); p.arc(o.circle[0], o.circle[1], o.circle[2], 0, Math.PI * 2); organCovers.push({ p, w: 0, src: { circle: o.circle } }); continue; }
      // (The gut's tubes cover the vessels behind them along their earlier centre lines and widths: ORGANS cover.)
      if (o.cover) { organCovers.push({ p: new Path2D(o.cover.d), w: o.cover.w, src: { d: o.cover.d } }); continue; }
      const w = o.band ? coverW.get(o.id) || 0 : 0;
      if (o.band && w < 4) continue; // the diaphragm is a hairline, not a cover
      organCovers.push({ p: new Path2D(o.d), w, src: { d: o.d } });
    }
    return organCovers;
  }
  return { getOrganCovers, sleep, trimVeins, wake };
}
