// Chrome and the scale switch
// (moved out of presenter.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { frameFor } from './frame.js';
import { readAnims, readBox, readMetric, readStyle, readTiming } from './layout-snap.js';
import { paintClauses, slideTargets } from './presenter-words.js';
import { SCALE_NAME, pickedScale, scaleCentre, scaleView } from './scale-switch.js';
import { beatView } from './slide-beats.js';
import { slideCount, slideCountLabel, slideSaid, slideSay } from './slide-say.js';
import { store } from './store.js';
import { dataSoon } from './class-soon.js';
import { clamp, h, icon } from './util.js';
import { animRunning } from './glass-clock.js';   // (a fade held on the glass's clock is still under way)

export function createScales(st, live) {
  const { HUSH_OUT, app, camera, creditLease, dock, dockHalt, dockPaint, dockRest, eased, figOf, fitDone, homeLease, hush, lastBeat, layout, markLong, next, openSettings, paintOverlays, paintZoom, phone, pillKind, placeLip, poke, prev, pview, reFit, reframe, run, shortSide, stage, stimer, stop, tabUp, toggleJump, unhush, until, waitCut, wrap, zoomOn } = st;
  const sizeNow = () => { const r = readBox(wrap); return `${innerWidth}x${innerHeight}:${Math.round(r.width)}x${Math.round(r.height)}`; };
  const onResize = (e) => {
    if (!live.ui) return;
    if (e?.type === 'resize' && zoomOn()) { live.ui.zoom.reset(); paintZoom(); }   // (a new size: the card is put back, laid out and zoomed again by a tap)
    if (e?.type === 'resize') live.sizeSeen = sizeNow();
    // (Turned between upright (a phone's or tablet's stacked cards) and a wider layout: a data card closed in the one comes in open in
    // the other, at once with everything else. Kept closed, an iPad's card turned on its side stood off the screen's left edge.)
    if (e?.type === 'resize' && phone() !== live.ui.root.classList.contains('stack') && dock.to === 1 && !dock.auto) { dockHalt(); dock.to = 0; dock.lvl = 0; dock.down = -1; dockRest(); dockPaint(); placeLip(); }
    clearTimeout(live.refitT); live.refitT = stimer(reFit, 250);
    if (live.ui.data.hasAttribute('data-sin-tiles')) live.ui.data.classList.toggle('under', !shortSide.matches && phone());   // (turned on or off its side)
    // (For 0.8 s after a resize or a turn the data card takes each new place at once, with no fade or glide: the words' card
    // re-fits in steps as the size settles, and a data card easing after it passed over the words.)
    const turn = e?.type === 'resize';
    if (turn) stage.handClear?.();   // (a turn of the device or a new window size: the camera frames the slide again)
    if (turn) { live.ui.root.classList.add('pz-turning'); clearTimeout(live.turnT); live.turnT = stimer(() => live.ui?.root.classList.remove('pz-turning'), 800); }
    if (live.ui.bar.dataset.kind !== pillKind()) paintChrome();   // (turned between a phone's, a tablet's and a wide screen's pill: its buttons change before the words are fitted around it)
    layout();
    // (Judged once the cards have their new layout's classes, then laid out again if that changed the title.)
    if (turn && !live.ui.text.hidden) { const was = !!live.ui.text.querySelector('.pz-h.long'); markLong(live.ui.text); if (was !== !!live.ui.text.querySelector('.pz-h.long')) { live.textLock = null; layout(); } }
    setLabels(!turn);
    if (!live.shown) return;
    // (Under the start's cover, the projector layout landing or a window settling: framed at once, so the reveal shows it framed.)
    if (live.booting) { clearTimeout(live.reframeT); live.reframeT = 0; reframe(0); return; }
    // (Another caller (a card's dock moving, its fit done) frames at once, unless a resize is still settling: then that one look covers both.)
    if (!turn && !live.reframeT) { reframe(400); return; }
    clearTimeout(live.reframeT);
    live.reframeT = stimer(() => { live.reframeT = 0; if (live.ui && live.shown) reframe(400); }, 250);
  };
  function setLabels(unchanged = false) {
    const k = (phone() ? 1.15 : clamp(Math.min(innerHeight / 540, innerWidth / 960), 1.25, 2.4));
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const key = `${k}|${stage.labelScale()}`;
    if (unchanged && key === live.labelsFor) return;
    live.labelsFor = key;
    stage.setProjection(k);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    { const lv = String(Math.min(k, 2.2) * stage.labelScale()); document.documentElement.style.setProperty('--label-k', lv); document.documentElement.style.setProperty('--label-scale', String(Math.max(1, Math.min(k, 2.2) / 1.5) * stage.labelScale())); }   // (font roles: the projector's size over Explore's, never below it)
    labelling = true; dispatchEvent(new Event('pps:labelscale')); labelling = false;
  }
  // The viewer's own text size (Settings) scales them too: a change there while presenting is re-applied on top.
  let labelling = false;
  // A new text size draws the slide again, as a fresh load at that size does (the words out and back in, laid out from the
  // start, the camera framing around them). Adjusted in place, a card kept what the old size had chosen: a 200% card stayed
  // folded or kept the compact strip at 100%, and a 100% card switched to 200% folded where a fresh load did not.
  // (As when coming back to the slide: a time-lapse shows its end, not playing again.)
  addEventListener('pps:labelscale', () => {
    if (!live.deck || !live.ui || labelling) return;
    setLabels();
    if (!live.shown) return;   // (a slide on its way in lays out at the new size anyway)
    // (Nothing fitted at the old size carries over: each card's fit, the words' steps (a title judged long or not at the old
    // step had kept that size), and each ladder's choice of plot or strip.)
    for (const el of [live.ui.text, live.ui.data, live.ui.panel]) { fitDone.delete(el); for (const n of ['--pz-fit', '--pz-z', '--pz-tk', '--pz-bk', '--pz-dk']) el.style.removeProperty(n); }
    live.ui.text.classList.remove('pz-nocauses');
    reFit();
    live.lastAt = Math.max(live.lastAt, live.shown.i + 1); live.redrawn = ++live.gen;
    if (!live.busy) run();
  });
  // Where an element will rest once the entry or exit animations on it and its ancestors (a slide in or out) have ended: its box
  // now, less the shift those animations give it at this moment. Also how long until the last of them ends.
  function restRect(el) {
    let dx = 0, dy = 0, left = 0;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const run = readAnims(n).filter((a) => animRunning(a) && Number.isFinite(readTiming(a.effect).endTime));
      if (!run.length) continue;
      for (const a of run) left = Math.max(left, readTiming(a.effect).endTime - (a.currentTime || 0));
      const t = readStyle(n).transform;
      if (!t || t === 'none') continue;
      const m = new DOMMatrixReadOnly(t), z = readMetric(n, 'offsetHeight') ? readBox(n).height / readMetric(n, 'offsetHeight') : 1;   // (in screen px: through any zoom)
      dx += m.e * z; dy += m.f * z;
    }
    const r = readBox(el);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    return { top: r.top - dy, right: r.right - dx, height: r.height, width: r.width, left };
  }
  // The pill's width, for the words' last line to keep clear of (--pz-pill-w); then the words keep clear of it (clearPill).
  function placeBar() {
    if (!live.ui) return;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (phone() && readMetric(live.ui.bar, 'offsetWidth') && readMetric(live.ui.bar, 'offsetWidth') !== live.pillW) { live.pillW = readMetric(live.ui.bar, 'offsetWidth'); app.style.setProperty('--pz-pill-w', `${live.pillW}px`); }
    clearPill();
    placeScales();
  }
  // (No pill on any slide, Mohammad 12 Nov: "Remove the pill anyways." To show something in the lobule or the sinusoid, a slide dives into it: its own cam, 'lobule:...' or 'sinusoid'.)
  const scalesOf = () => [];
  function paintScales(s, i) {
    if (!live.ui) return;
    const el = live.ui.scl, ks = s && !s.visual ? scalesOf(s) : [];
    el.hidden = !ks.length;
    if (!ks.length) { el.replaceChildren(); delete el.dataset.sig; return; }
    const sig = ks.join(' ');
    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig;
      el.replaceChildren(h('i', { class: 'pzs-thumb', 'aria-hidden': 'true' }),
        ...ks.map((k) => h('button', { type: 'button', 'data-scale': k, 'aria-pressed': 'false', onclick: () => flipScale(k) }, SCALE_NAME[k])));
      el.classList.add('pzs-new');   // (a new set of words: the thumb takes its place without easing across)
    }
    paintScaleSel(pickedScale(live.scalePick, i, s));
    placeScales();
  }
  // The inner pill moves and stretches on the compositor (translate and a horizontal scale of a width laid out once), never a width
  // eased by layout: its laid-out width is the first word's it stood under, kept until the pill is built again.
  function pzsThumb(el, on) {
    const w = readMetric(on, 'offsetWidth');
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (!el._pzsW0 || el.classList.contains('pzs-new')) { el._pzsW0 = w; el.style.setProperty('--pzs-w0', `${w}px`); }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    el.style.setProperty('--pzs-x', `${readMetric(on, 'offsetLeft')}px`);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    el.style.setProperty('--pzs-s', (w / el._pzsW0).toFixed(4));
  }
  // The selected word, and the soft inner pill eased under it (as Explore's selection eases from one word to the next).
  function paintScaleSel(k) {
    const el = live.ui?.scl;
    if (!el || el.hidden) return;
    let on = null;
    // (A sinusoid slide on a device that cannot draw the wall shows the lobule: camera(). Its pill selects Lobule.)
    const want = k === 'sinusoid' && !el.querySelector('[data-scale="sinusoid"]') ? 'lobule' : k;
    for (const b of el.querySelectorAll('button')) { const yes = b.dataset.scale === want; b.setAttribute('aria-pressed', String(yes)); if (yes) on = b; }
    if (on) pzsThumb(el, on);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (el.classList.contains('pzs-new')) { const nf = frameFor('scale select'); nf(() => nf(() => el.classList.remove('pzs-new'))); }
  }
  function placeScales() {
    const el = live.ui?.scl;
    if (!el || el.hidden) return;
    const p = phone();
    // (A phone's pill stands over the figure, above the teaching card: the camera frames above it, as above the card.)
    el.toggleAttribute('data-safe', p); if (p) el.dataset.safe = 'bottom';
    if (p) {
      const wr = readBox(wrap), k = wr.width / (readMetric(wrap, 'clientWidth') || wr.width) || 1, r = restRect(live.ui.shade);
      if (r.width) {
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        el.style.setProperty('--pzs-b', `${Math.max(0, (wr.bottom - r.top) / k + 8).toFixed(1)}px`);
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        // (restRect's `left` is the milliseconds its entry has left, not an edge: used as one it pushed the pill right by that many px while the cards came in, off an upright iPad.)
        el.style.setProperty('--pzs-cx', `${scaleCentre({ right: r.right, width: r.width, wrapLeft: wr.left, k, pill: readMetric(el, 'offsetWidth'), wrapW: readMetric(wrap, 'clientWidth') }).toFixed(1)}px`);
      }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    } else if (readMetric(live.ui.bar, 'offsetWidth')) el.style.setProperty('--pzs-r', `${readMetric(live.ui.bar, 'offsetWidth')}px`);
    const on = el.querySelector('[aria-pressed="true"]');
    if (on) pzsThumb(el, on);
  }
  // A tap on the pill: once the slide has landed (cards in, any case card lifted), and while it shows. A tap while a flip moves
  // turns it to the new scale once its present step ends; Next, Back or a jump cuts it.
  async function flipScale(k) {
    if (!live.deck || !live.ui || live.caseCard || !live.shown || live.shown.i !== live.want || live.shown.gen !== live.gen) return;
    if (live.shownBeat !== live.beat) return;   // (a beat still on its way)
    const i = live.shown.i, s = figOf(i);   // (the beat on screen: its scales, and its anatomy view to come back to)
    if (!scalesOf(s).includes(k)) return;
    live.scalePick = { i, scale: k }; paintScaleSel(k);
    if (live.flipping) return;
    live.flipping = true;
    const creditOff = creditLease.take();
    try {
      for (let at = null; live.deck && live.want === i && live.shown?.i === i && live.scalePick?.i === i && live.scalePick.scale !== at;) {
        at = live.scalePick.scale;
        const k0 = at, cut = () => !live.deck || live.want !== i || live.shown?.i !== i || live.scalePick?.scale !== k0;
        await flipMove(s, i, k0, cut);
      }
    } finally {
      live.flipping = false;
      creditOff();
    }
  }
  // One flip: the scale's call-outs leave (all the liver's labels out first, as on a slide change), the camera makes the scale's move,
  // then that scale's view calls out what it names (scale-switch.js scaleView: the slide's own at its own scale).
  async function flipMove(s, i, k, cut) {
    const v = scaleView(s, k), cam = v.cam;
    if ((store.get().lobule || store.get().sinusoid) && !live.booting) hush();
    live.markBase = null;
    store.set({ focus: null, presentLabels: [], presentTerms: null, lobuleCallout: null }); stage.setSites(null); stage.setGlow(null); stage.pinOrgans(null);
    if (live.hushed) { await waitCut(Math.max(0, HUSH_OUT - (performance.now() - live.hushAt)), cut); if (cut()) return; await eased(['opacity'], 600, '.lz-labels'); if (cut()) return; }
    const homeOff = homeLease.take();
    try { await camera(cam, v, cut); } finally { homeOff(); }
    live.lastCam = cam;
    if (cut()) return;
    paintOverlays(v, i, live.states[live.stateOf[i]] || null, false);
    await unhush(cut);
  }
  // One more clause of a revealing line (reveal.js, N3): it fades in (or the last one out, going back) and the figure lights the terms the
  // clauses shown name. Nothing else moves: no camera, no cards, no refit (the whole line is typeset from the start). In the liver a
  // change of the lit set runs the labels' hush as a slide change does, so no label shows half lit.
  async function revealMove(i, k) {
    const g = live.gen, s = live.slides[i], cut = () => !live.deck || live.want !== i || live.gen !== g || live.beat !== k || live.shown?.i !== i;
    const v = beatView(s, k), creditOff = creditLease.take();
    try {
      if (live.flipping) { await until(() => !live.flipping, 9000); if (cut()) return; }
      if ((store.get().lobule || store.get().sinusoid) && !live.booting && slideTargets(v).lit.join(' ') !== (app.dataset.lit || '')) {
        hush();
        await waitCut(Math.max(0, HUSH_OUT - (performance.now() - live.hushAt)), cut); if (cut()) return; await eased(['opacity'], 600, '.lz-labels'); if (cut()) return;
      }
      live.fig = { i, s: v };
      paintClauses(live.ui.text.querySelector('.pz-line'), k + 1);
      paintOverlays(v, i, live.states[live.stateOf[i]] || null, false);
      await unhush(cut);
      if (cut()) return;
      live.shownBeat = k; paintChrome();
    } finally { creditOff(); }
  }
  // The words' last shown block keeps clear of a phone's pill: a line of words (or the station key) ends with a gap the pill's
  // width and as tall as the pill reaches into the words (--pz-reach, measured), on its own line if the last line is too long
  // for it; so the pill only ever meets that last line. A box (buttons, a monitor, a diagram) ends just above the pill instead.
  // Run on every layout (fonts fitted, the screen turned): only a phone shows either.
  // (The one spacer, moved to whichever block ends the words: no node made per layout.)
  const pillGap = h('span', { class: 'pz-pillgap', 'aria-hidden': 'true' });
  function clearPill() {
    const text = live.ui.text, gap = text.querySelector('.pz-pillgap'), was = text.querySelector('.pz-pillclr');
    let end = null, box = null;
    if (phone() && !text.hidden) {
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const shown = (c) => readBox(c).height > 0, last = [...text.children].filter(shown).at(-1);   // (an svg has no offsetHeight)
      const tail = last;
      // (A colour key docked at the words' bottom-left (figure-key.js) takes a row of its own beside the pill: the words end above it.)
      if (tail?.matches('p, h1, li, .pz-stk') && live.ui.fk.dataset.empty != null) end = tail; else box = last || null;
      // (Read from the layout boxes where both rest, never from the screen: a card still easing in or out (pz-leave's 18 px
      // slide) read 18 px more reach, and the words were fitted smaller for it, then grew once the card settled.)
      const wr = restRect(live.ui.root), k = wr.width / (readMetric(live.ui.root, 'clientWidth') || wr.width) || 1, bar = live.ui.bar;
      const reach = readMetric(bar, 'offsetParent') && readMetric(bar, 'offsetParent') === readMetric(text, 'offsetParent') ? readMetric(text, 'offsetTop') + readMetric(text, 'offsetHeight') - readMetric(bar, 'offsetTop')
        : (restRect(text).top + readMetric(text, 'offsetHeight') * k - readBox(bar).top) / k;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      text.style.setProperty('--pz-reach', `${Math.max(0, Math.ceil(reach) + 3)}px`);
      // A box ends 8 px above the pill on a tablet, measured to the fraction (offsetTop rounds; the rounded reach had left it at 5,
      // sweep 03 #23). A phone's
      // keeps the reach's 3 px: its words are fitted to the last pixel, and 5 more cost them a size step (Right heart 7 at 390
      // went from 0.70 to 0.58 and its What-if slider from 236 to 56 px; sweep 01 review).
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      text.style.setProperty('--pz-reach-box', live.ui.root.classList.contains('tab') ? `${Math.max(0, (restRect(text).top + restRect(text).height - restRect(bar).top) / k + 8).toFixed(2)}px` : `${Math.max(0, Math.ceil(reach) + 3)}px`);
    }
    fitKey();
    if (gap && gap.parentElement !== end) gap.remove();
    if (end && !end.querySelector(':scope > .pz-pillgap')) end.append(pillGap);
    if (was && was !== box) was.classList.remove('pz-pillclr');
    box?.classList.add('pz-pillclr');
  }
  // A key that wraps is balanced: the narrowest width that keeps its number of lines, so no line is left with one word ("Systemic"
  // alone under the other origins, "Reversed" under "Usual": 17 Oct design review). Its lines and height stay as they were.
  function balanceKey(fk, maxW) {
    const h0 = readMetric(fk, 'offsetHeight');
    let lo = Math.floor(maxW / 2), hi = Math.floor(maxW);
    while (hi - lo > 2) {
      const mid = (lo + hi) >> 1;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      fk.style.setProperty('--pz-fk-room', `${mid}px`);
      if (readMetric(fk, 'offsetHeight') > h0 + 1) lo = mid; else hi = mid;
    }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    fk.style.setProperty('--pz-fk-room', `${hi}px`);
  }
  // A phone's docked colour key and the nav pill never overlap. It sits on one line beside the pill when it fits; else on two lines
  // beside it (fk-two, as tall as the pill's row); else on its own row just above the pill's row (fk-up; a 320 px phone), one line,
  // shrunk to the card's width if even that is too narrow. The words end above whatever the key takes (--pz-fkrow).
  function fitKey() {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const fk = live.ui.fk, root = live.ui.root, set = (two, up, wrap = false, flow = false, short = false) => { root.classList.toggle('fk-two', two); root.classList.toggle('fk-up', up); root.classList.toggle('fk-wrap', wrap); root.classList.toggle('fk-flow', flow); root.classList.toggle('fk-short', short); };
    const on = phone() && !live.ui.text.hidden && fk.dataset.empty == null;
    if (!on) { set(false, false); return; }
    const was = fk.hidden; fk.hidden = false; set(false, false);
    const wr = restRect(root), k = wr.width / (readMetric(root, 'clientWidth') || wr.width) || 1;
    const w = readMetric(fk, 'offsetWidth'), l = parseFloat(readStyle(fk).left) || 21;
    const bar = readBox(live.ui.bar), barH = bar.height / k;
    const room = (bar.left - wr.left) / k - l - 8, full = readMetric(root, 'clientWidth') - 2 * l;
    let row;
    // (Beside the pill on one line, a key taller than the pill's row (a larger text size: its name over its scale) reaches above
    // it: the words end 8 px above the key, not 3 px above the pill (Circulation 3 at 150 %: the buttons sat on the key).)
    if (w <= room) row = Math.max(0, Math.ceil((bar.top - readBox(fk).top) / k + 5));
    else if (root.classList.contains('tab')) {
      // (An upright iPad has the width for the key on its own row above the pill, one line across the card, rather than two lines
      // squeezed beside it: 17 Oct design review. Wrapped, and balanced, only if even the card's width is too narrow.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (w > full) fk.style.setProperty('--pz-fk-room', `${Math.floor(full)}px`);
      set(false, true, w > full);
      if (w > full) balanceKey(fk, full);
      row = Math.ceil(readMetric(fk, 'offsetHeight')) + 12;
    } else {
      // (Two lines inside the pill's own height, the two read as one row: its name over its swatches; else name and swatches flowing
      // over both lines; else the same with the swatches' short names (SV, HA, Sys). Only then a row of its own above the pill, which
      // took a whole line from the words and left the room beside the pill empty: Mohammad, 20 Oct, TIPS Doppler 3 on an iPhone,
      // "The legend of the lens could be on two lines ... Can use abbreviations".)
      const sh = !!fk.querySelector('.pz-lk-s');
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const two = (flow, short) => { set(true, false, false, flow, short); fk.style.setProperty('--pz-fk-room', `${Math.floor(room)}px`); return readMetric(fk, 'scrollWidth') <= room + .5 && readMetric(fk, 'offsetHeight') <= barH + 1.5; };
      if (two(false, false) || two(true, false) || (sh && (two(false, true) || two(true, true)))) {
        balanceKey(fk, room); row = Math.max(0, readMetric(fk, 'offsetHeight') - barH) + 2; }
      else {
        // (Wider than the card too: wrapped to its width, at its own size; it had been scaled down, its words under 12 px.)
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        if (w > full) fk.style.setProperty('--pz-fk-room', `${Math.floor(full)}px`);
        set(false, true, w > full);
        if (w > full) balanceKey(fk, full);
        row = Math.ceil(readMetric(fk, 'offsetHeight')) + 12;
      }
    }
    fk.hidden = was;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    live.ui.text.style.setProperty('--pz-fkrow', `${row}px`);
  }
  // A phone held sideways: the colour key stands on the nav pill at the lower right, beside the teaching card. A key too long for
  // the room beside the card wraps there to two lines at its own size, its name over its swatches, 4 px above the pill (not 8:
  // the room under the data card), where that clears the card and the data card; else the words end above it, fitted a little smaller (Mohammad, 18 Oct, "wrap first": Pre-hepatic 6 and TIPS
  // Doppler 3 at 667 x 375 ran the key under the words). True when the words' room was cut, so they are fitted again.
  function lowKey(t, d, padT, pad0, vm, wr, H, k) {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const fk = live.ui.fk, root = live.ui.root, plain = () => { root.classList.remove('fk-side'); fk.style.removeProperty('--pz-fk-room'); };
    plain();
    if (fk.dataset.empty != null) return false;
    const was = fk.hidden; fk.hidden = false;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const card = { left: t.left - pad0, right: t.right + pad0, top: t.top - padT, bottom: t.bottom + pad0 };
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const hits = (q, a, g) => !!a && Math.min(q.right, a.right) - Math.max(q.left, a.left) > -g && Math.min(q.bottom, a.bottom) - Math.max(q.top, a.top) > -g;
    let q = readBox(fk), cut = false;
    if (hits(q, card, 6)) {
      const room = Math.floor((q.right - card.right - 8) / k);
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      root.classList.add('fk-side'); fk.style.setProperty('--pz-fk-room', `${room}px`);
      q = readBox(fk);
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const lines = new Set([...fk.querySelectorAll(':scope > b, .pz-lens-k')].map((e) => Math.round(readBox(e).top))).size;
      if (room > 0 && lines <= 2 && readMetric(fk, 'scrollWidth') <= readMetric(fk, 'clientWidth') + .5 && !hits(q, card, 6) && !hits(q, d, 4)) balanceKey(fk, room);
      else {
        plain(); q = readBox(fk);
        // (The words end 4 px above the key, wherever the card stands: level with the data card, or centred top to bottom. The key
        // may stand on the card's glass below them, as an upright phone's stands inside its card.)
        const foot = q.top - wr.top - 4, top = d ? d.top - wr.top + padT : vm + padT;
        const h = d ? foot - top : Math.min(foot - top, 2 * (foot + pad0) - H + pad0 - padT);
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        live.ui.text.style.maxHeight = `${Math.max(0, h / k).toFixed(1)}px`; cut = true;
      }
    }
    fk.hidden = was;
    return cut;
  }
  // What a screen reader is told: one line per slide ("Slide 3 of 12: its title"), and only once that slide is on screen. The count on the bar
  // runs ahead (want is the slide asked for), but the cards of the slide before stay until the move has landed, and a jump that fails or is
  // overtaken by the next one never reaches its slide: it was announced all the same, and the page then read out a slide it did not show.
  // (force: a move that ended in an error, whose cards came back; busy: the cards are changing, so a reader waits for them.)
  const landedNow = () => !!live.shown && live.shown.i === live.want && live.shown.gen === live.gen;
  // (A case or question card is the slide's own first screen: it stands, and the count on the bar reads the slide's number, a long while before the
  // slide's cards land, so the reader is told that slide too (play-test, 16 Nov 2026: "2 / n" on the bar, "Slide 1" still announced on the case cards
  // of Choose the treatment and Preventing the next bleed). The card is tagged with the slide it came up for (presenter-case.js cardUp).)
  const onScreenNow = () => landedNow() || slideSaid({ want: live.want, card: live.caseCard });
  function announce(force = false) {
    poke();   // (a change of slide or a beat wakes a resting page, whoever asked: a clicker, the presenter's window)
    if (!live.ui) return;
    const i = live.want, t = slideSay(i, live.slides.length, live.slides[i]?.title);
    if ((force || onScreenNow()) && live.ui.say.textContent !== t) live.ui.say.textContent = t;
    const moving = String(live.busy && !landedNow());
    for (const e of [live.ui.text, live.ui.data]) if (e.getAttribute('aria-busy') !== moving) e.setAttribute('aria-busy', moving);
  }
  function paintChrome() {
    if (!live.ui) return;
    const n = live.slides.length, i = live.want;
    pview.publish(live.deck, live.slides, i, live.beat, lastBeat(i) + 1);
    live.ui.prog.style.setProperty('--p', String((i + 1) / n));
    announce();
    const views = lastBeat(i) + 1;
    const ph = phone(), skip = live.lapseOn && live.lapseLeft > 0, more = !skip && live.beat < lastBeat(i), last = i === n - 1 && !skip && !more;
    // The count opens the slide list (G).
    // (A list still fading out after a pick counts as closed: the count must not stay grey, as if the list were open, on the slide picked.)
    const countLabel = slideCountLabel(i, n), listOpen = String(!live.ui.jump.hidden && !live.ui.jump.classList.contains('pz-leave'));
    live.ui.bar.classList.toggle('phone', ph); live.ui.bar.classList.toggle('pzb-pill', !ph);
    live.ui.bar.dataset.kind = pillKind();
    const nextLabel = skip ? 'Run the time-lapse to its end' : more ? `Next view, ${live.beat + 2} of ${lastBeat(i) + 1}` : 'Next slide', nextTitle = skip ? 'Skip to the end of the time-lapse (→)' : 'Next (→)';
    if (ph) live.ui.bar.classList.remove('idle');
    // The same pill from slide to slide is updated in place, its count crossfading to the new number; it was rebuilt on
    // every slide, its buttons popping out and back (MOTION_HEAT_REVIEW P16). A new layout builds it afresh.
    const tab = ph && tabUp(), sig = `${ph}|${tab}|${!!openSettings}`, k = live.ui.bar._pill;
    if (k && k.sig === sig && k.count.isConnected) {
      // (T2: the count never disappears. It was swapped through a fade to nothing and its words then came back between frames or as a GPU
      // picture, and through a case or question card, the busiest part of a slide change, the pill stood with no number for the whole card.
      // The number is written in place, at once: a speaker glances at it to pace the talk. The pill's width is measured again, 9 to 10 widens it.)
      const countTxt = slideCount(i, n);
      if (k.num.textContent !== countTxt) k.num.textContent = countTxt;
      dataSoon(k.pips, 'n', String(views)); dataSoon(k.pips, 'at', String(live.beat));
      k.count.setAttribute('aria-label', countLabel); k.count.setAttribute('aria-expanded', listOpen);
      if (k.prev) k.prev.disabled = i === 0 && live.beat === 0;
      if (k.next) { k.next.disabled = last; k.next.classList.toggle('skipping', skip); k.next.setAttribute('aria-label', nextLabel); k.next.title = nextTitle; }
      placeBar();
      return;
    }
    // (The views of a slide that has several (one per Next, up to three) as short strokes under the count, the one on show full: a Next that only turns the figure is no longer unseen. They fade, never pop.)
    const num = h('span', { class: 'pzb-nt' }, slideCount(i, n)), pips = h('span', { class: 'pzb-pips', 'aria-hidden': 'true', 'data-n': String(views), 'data-at': String(live.beat) }, h('i'), h('i'), h('i'));
    const countBtn = h('button', { class: 'pzb-n', 'aria-label': countLabel, title: 'Slide list (G)', 'aria-expanded': listOpen, onclick: () => toggleJump() }, num, pips);
    const prevBtn = () => h('button', { class: 'ib', 'aria-label': 'Previous slide', title: 'Previous (←)', disabled: i === 0 && live.beat === 0, onclick: prev }, icon('chev-left'));
    const nextBtn = () => h('button', { class: `ib pzb-next${skip ? ' skipping' : ''}`, 'aria-label': nextLabel, title: nextTitle, disabled: last, onclick: next }, icon('chev-right'));
    if (ph) {
      // A phone's pill: the count (it opens the slide list), settings, exit. Slides change by swiping. An upright tablet's
      // pill has back and next around the count too, as a wide screen's: an iPad mirrored to a projector is often driven
      // by tapping, and a swipe there competes with the card fold and the figure pan (review U5).
      const kids = tab ? [prevBtn(), countBtn, nextBtn()] : [countBtn];
      live.ui.bar.replaceChildren(...kids, live.gear(),
        h('button', { class: 'ib', 'aria-label': 'Exit the presentation', title: 'Exit', onclick: stop }, icon('close')));
      live.ui.bar._pill = { sig, count: countBtn, num, pips, prev: tab ? kids[0] : null, next: tab ? kids[2] : null };
      placeBar();
      return;
    }
    // A wide screen's pill, as on a phone at the lower right (Mohammad): back, the count (it opens the slide list), next,
    // settings, exit. (No ask-the-room buttons: he asks the room by voice; full screen is in Settings and on F.)
    const pb = prevBtn(), nxb = nextBtn();
    live.ui.bar.replaceChildren(
      pb,
      countBtn,
      nxb,
      live.gear(),
      h('button', { class: 'ib', 'aria-label': 'Stop presenting', title: 'Stop (Esc)', onclick: stop }, icon('close')));
    live.ui.bar._pill = { sig, count: countBtn, num, pips, prev: pb, next: nxb };
    placeBar();
  }
  return { announce, clearPill, lowKey, onResize, paintChrome, paintScaleSel, paintScales, placeBar, revealMove, setLabels, sizeNow };
}
