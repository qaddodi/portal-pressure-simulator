// One of the six ladders zoomed; layout and fit
// (moved out of presenter.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { throwLanded, throwing } from './card-throw.js';
import { SHUF } from './card-shuffle.js';
import { SIDEWAYS_MAX_H, WIDE, figFloorOf, pairRise, phonePlan, sidewaysWords, titleFloorK, dkFloorOf } from './card-type.js';
import { createInsetHold } from './inset-hold.js';
import { readBox, readMetric, readStyle } from './layout-snap.js';
import { reduceMotionMQ as reduce } from './motion.js';
import { LOBULE_CAM } from './presenter-words.js';
import { cancelRest, restPass } from './rest-pass.js';
import { store } from './store.js';
import { glyphsReady, loadGlyphs, textWidth } from './text-gl.js';
import { isModalOpen, restBox } from './util.js';

export function createLadders(st, live) {
  const { GRIP, LIP, LOW_M, SHORT_H, TEXT_CARD, app, autoDock, capOf, cath, creditLease, dataStands, dock, dockPaint, dockRest, dockVec, figOf, fitCards, fitDone, fitSig, frameTo, insetL, liftTo, lipOn, lowKey, minText, overflowOf, phone, placeBar, placeLip, slip, splitSheet, stage, stimer, stopUnder, tabBeside, tabUp, throwCards, underU, until, wideSheet, words, wordsGlide, wrap } = st;
  // A card whose contents grow after the layout (a time-lapse, the numbers settling) is fitted again.
  // A slide whose data card changes only its readings while it shows: a what-if slider or compare button driving the live model
  // (liveOff), or a time-lapse slide (its days running, or run). Its cards keep the plan made as the slide came in.
  const readingsOnly = () => live.liveOff || live.handOn || live.lapseOn || (!!live.shown && live.shown.i === live.want && !!live.slides[live.want]?.lapse);
  // A time-lapse slide in view: as its days run the data card's readings change many times a second, and each change that measured
  // the card a hair different laid every card out again, so on an iPhone the teaching card vibrated as the days passed (Endoscopy 3,
  // 18 Oct). The data card is only fitted again in its own room; the words and their glass stay as they came in. (A resize, a turn or
  // a new text size still lays everything out afresh: onResize.)
  // (The same while a what-if slider or a compare button drives the live model (liveOff): each reading that measured the data card a
  // hair different laid the cards out again and fitted the words afresh, a pixel off each time, so the teaching card's text shook
  // under the finger: Tricuspid leak on slide 60 of the test-all deck on an iPhone, 19 Oct.)
  const cardsStill = () => !!live.shown && live.shown.i === live.want && (live.liveOff || live.handOn || !!live.slides[live.want]?.lapse) && !!live.ui && !live.ui.root.classList.contains('pz-prep');
  // (While the readings' card slides or a part folds, the data card's box changes size on every frame: each change laid every card out
  // again, the words fitted afresh and the figure framed, frame by frame, so the slide ran at about 10 frames a second (Mohammad, 25 Oct).
  // The card moves by its own CSS (--pz-u, --pz-grow) and is laid out once it rests: foldStill.)
  // (And while the card is zoomed to the middle of the screen, zoomHeld below: it too is laid out once it rests.)
  const cardMoving = () => !!live.ui && (live.ui.data.classList.contains('pz-sliding') || 'folding' in live.ui.data.dataset || zoomHeld() || throwCards().some((el) => el && throwing(el)));   // (R01: and a card on a throw, in or out)
  // (R14: a card change that is only wanted (a font that finished loading, a card's box that changed) while the cards are on their throws is
  // not made under them, nor lost: one pass is queued for when they have landed, whichever of them asked and however many did. A real
  // resize still lays out at once, onResize. The talk and the cards it was asked for must still be the ones on screen.)
  const thrown = () => throwCards().some((el) => el && throwing(el));
  let landQ = false;
  function layoutAtLanding() {
    if (landQ || !live.ui) return;
    landQ = true;
    const u = live.ui, s = live.sess;
    Promise.all(throwCards().map((el) => el && throwLanded(el))).then(() => {
      landQ = false;
      if (live.ui !== u || live.sess !== s || !s?.live()) return;
      restPass(() => { if (live.ui !== u || live.sess !== s) return; if (cardMoving()) { if (thrown()) layoutAtLanding(); return; } if (cardsStill()) fitCards(live.ui.data); else layout(); });
    });
  }
  const zoomOn = () => !!live.ui?.zoom.on;
  // The readings' card may come out or tuck away under the zoomed card once its glide in has ended (the handle, a pull up, the trackpad, the arrow
  // keys; Mohammad, 28 Oct: "allow me to untuck the card when zoomed in to instrument stacked cards and adjust the zoom ease"). The zoom is then
  // fitted again to the whole stack on every frame of it (zoomFollow), so the stack stays in the middle of the screen and whole, smaller as it
  // gets taller and larger as it shortens, and nothing snaps. zoomU0: how far out the readings stood as the card zoomed.
  // (Only where the readings' card rises with its travel, slip.lift: the stack the zoom is fitted to then grows upward, as it models.)
  const zoomSteady = () => !!live.ui?.zoom.steady;
  const zoomFolds = () => zoomSteady() && slip.lift - slip.base > 0.5;
  let zoomU0 = 0;
  const zoomFollow = (f, trav) => {
    if (!zoomFolds()) return;
    live.ui.zoom.follow((f - zoomU0) * (trav - LIP), (f - zoomU0) * trav);
  };
  let zoomWas = '';   // (the window and deck as the card went up: zoomSettled refits only if one of them, or the card's fit key, changed meanwhile)
  const zoomKey = () => `${innerWidth}x${innerHeight}|${live.gen}|${live.want}`;
  const zoomHeld = () => { if (!live.ui?.zoom.on) return false; if (!live.zoomMissed) zoomWas = zoomKey(); live.zoomMissed = true; return true; };
  // The readings' card comes out as the card zooms (false: it stays tucked, behind the instrument card, and a tap on its handle brings it out).
  const ZOOM_OPENS_READINGS = false;
  // Whether the card may zoom now: it stands whole, on a wide screen, with an instrument, and nothing else is going on.
  // (A slide with no data card at all, such as Sites and causes 2 of 14 whose teaching card holds the site bar, zooms the teaching card alone: the zoom is
  // fitted and centred on the words and their glass, main in zoomOpen; Mohammad, 10 Nov 2026: "when i click on this card on this slide it doesn't zoom in
  // view like other cards". It stood on `zoomCard() && dataStands()`, which a slide without a data card never meets.)
  const wordsAlone = () => live.ui.data.hidden && !live.ui.text.hidden && !!live.ui.text.childElementCount && !live.ui.text.classList.contains('pz-leave');
  const zoomReady = () => !!live.ui && !!live.deck && !!live.shown && live.shown.i === live.want && live.shown.gen === live.gen && (!live.busy || live.playing) && !live.leaving && !live.black && !caseStands() && live.ui.jump.hidden && !isModalOpen()
    && live.ui.root.classList.contains('pz-wide') && ((zoomCard() && dataStands()) || wordsAlone()) && !live.ui.root.classList.contains('pz-prep');
  // (A card with an instrument zooms, and so does a tiles-only card, in every talk (Mohammad, 6 Nov 2026: a tap on the teaching card or the tile
  // card of Left-sided portal hypertension did nothing; only the Circuit talk had opted in). A talk may still opt out with zoomTiles: false.)
  const zoomCard = () => live.ui.data.classList.contains('has-tool') || (live.deck?.zoomTiles !== false && !live.ui.data.hidden);
  const caseStands = () => !!live.caseCard && !live.caseCard.flown;
  async function zoomOpen(focus) {
    if (!zoomReady() || live.ui.zoom.on) return;
    const z = live.ui.zoom;
    if (ZOOM_OPENS_READINGS && wideSheet(live.ui.data) && !live.ui.data.classList.contains('tool-open')) {
      live.ui.setFold(true);
      await until(() => !live.ui || !('folding' in live.ui.data.dataset), 1500);
      if (!zoomReady()) return;
    }
    // (A shuffled pair: the data card comes to the front first, and the zoom is planned from where it stands then; the words' card stays behind it, never enlarged
    // (scene is empty for it), and the shuffle holds still while the zoom is up, card-shuffle.js hold. The words' card has no zoom here: it already has the whole height.)
    const sh = live.shuffle?.active() ? live.shuffle : null;
    if (sh) {
      if (focus === 'text') return;
      sh.hold('data');
      await until(() => !live.ui || sh.settled(), 900);
      if (!zoomReady()) return;
    }
    live.ui.scope?.close();   // (the scope view shuts as a card zooms: it would stand over the card; Mohammad 6 Nov 2026)
    zoomU0 = underU(live.ui.data);
    // (The teaching card's glass, the shade, stands at the figure's level, under the page's veil: framed, it is veiled by fscrim, laid under the
    // shade, and the page's veil (zscrim) is clear and only takes the tap back (app.css .pz-fscrim). Its glass is then as bright as the data card's
    // zoomed: Mohammad, 6 Nov 2026, "the teaching card zoomed in has more darkness and less glass than when we zoom in to the data card".)
    if (z.open(focus === 'text' ? { main: [live.ui.text, live.ui.shade], scrim: [live.ui.zscrim, live.ui.fscrim] } : undefined)) paintZoom();
  }
  // (focus 'text': a tap on the teaching card frames and centres it, the data card riding along; otherwise the data card is the one framed.)
  function zoomToggle(focus) { if (!live.ui) return; if (live.ui.zoom.up) live.ui.zoom.close().then(paintZoom); else zoomOpen(focus); }
  // ── One of the six ladders zoomed to the middle (Sites 10, Where-resistance 14; Mohammad, 29 Oct: "on this slide i feel we should be allowed to
  // click individual ladder cards and have them zoom in similar to how we do it in the slides") ──
  // The same zoom as the data card's (src/ui/card-zoom.js), taken to one cell of the panel's grid: a tap on a cell glides it to the middle of
  // the screen and grows it as one piece, its words and chart only larger; the page and the rest of the panel dim under it, which stays where it
  // is. It goes back by a tap on the cell or outside it, Esc, a slide or a resize, as the card does (zoomOn covers both). Where the grid draws
  // each case on a line (a phone, upright or sideways, an upright iPad) there is no chart to enlarge, and no zoom.
  const cellReady = () => !!live.ui && !!live.deck && !!live.shown && live.shown.i === live.want && live.shown.gen === live.gen && (!live.busy || live.playing) && !live.leaving && !live.black && !caseStands() && live.ui.jump.hidden && !isModalOpen()
    && !live.ui.panel.hidden && !live.ui.panel.classList.contains('pz-leave') && !live.ui.root.classList.contains('pz-prep') && !live.ui.root.classList.contains('stack') && !live.ui.root.classList.contains('low');
  function cellOpen(cell) {
    if (!cell || !cellReady() || live.ui.zoom.on) return;
    const own = cell.parentElement?.querySelector(':scope > .pz-gscrim');
    live.ui.scope?.close();
    live.ui.zoom.open({ card: cell, along: [], scrim: [live.ui.pscrim, own].filter(Boolean), part: true });
  }
  // (A tap on the panel: a zoomed cell goes back, whichever part of the panel it lands on; otherwise the cell under it zooms.)
  function cellTap(e) {
    if (!live.ui) return;
    if (live.ui.zoom.up) { live.ui.zoom.close().then(paintZoom); return; }
    cellOpen(e.target?.closest?.('.pz-cell'));
  }
  const paintZoom = () => {
    if (!live.ui) return;
    const up = live.ui.zoom.up;
    live.ui.zbtn.setAttribute('aria-expanded', String(up)); live.ui.zbtn.setAttribute('aria-label', up ? 'Put the card back' : 'Enlarge this card'); live.ui.zbtn.title = up ? 'Put back' : 'Enlarge';
  };
  // (The corner credit sits out the glide as it does a slide change, and comes back once the card is.)
  let zoomCreditOff = null;
  const zoomCredit = (on) => {
    if (on) { zoomCreditOff ||= creditLease.take(); return; }
    zoomCreditOff?.(); zoomCreditOff = null;   // (R02: one hold per glide, given back once)
  };
  // (The words' card behind it eases back to its tucked place as the card zooms in, and to where the readings need it as the card comes back:
  // wordsAt, wordsGlide.)
  const zoomBehind = (up, ms) => { words.held = up; wordsGlide(ms); };
  // (The card is back: a layout asked for while it was up runs now, once.)
  const zoomSettled = () => restPass(() => { if (!live.ui || !live.zoomMissed || live.ui.zoom.on) return; live.zoomMissed = false; if (zoomKey() === zoomWas && fitDone.get(live.ui.data) === fitSig(live.ui.data)) return; fitDone.delete(live.ui.data); live.onResize(); });   // (nothing changed while it was up: the card keeps its size, no jump after the zoom)
  let shiftLock = null;   // (the stacked pair's centring, keyed as the words' lock: layout)
  const fitWatch = () => {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    live.fitRO ||= new ResizeObserver(() => {
      cancelRest(live.fitRaf);
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      live.fitRaf = restPass(() => { if (live.ui && cardMoving()) { if (thrown()) layoutAtLanding(); return; } if (live.ui && cardsStill()) { fitCards(live.ui.data); return; } if (live.ui && [live.ui.text, live.ui.data, live.ui.panel].some((el) => !el.hidden && fitDone.get(el) !== fitSig(el) && (el.style.getPropertyValue('--pz-fit') || (({ v, h }) => v > 1 || h > 1)(overflowOf(el))))) layout(); });   // (a shrunk card is fitted again when it changes, so it can grow back)
    });
    // (Watched again only when the cards' children changed: observing a box reports it at once, so re-observing on every pass
    // ran the layout again every frame on a slide sitting still, Circuit 7 on an iPhone some four times a second.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const kids = [live.ui.text, live.ui.data, live.ui.panel].flatMap((el) => [...el.children]);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (kids.length !== live.fitKids.length || kids.some((c, i) => c !== live.fitKids[i])) { live.fitRO.disconnect(); for (const c of kids) live.fitRO.observe(c); live.fitKids = kids; }
    // A slide that keeps its figure clear of the cards frames it again as the cards settle to their size (a chart arriving, a line wrapping).
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const again = () => { if (!live.ui) return; if (!live.shown || 'folding' in live.ui.data.dataset) { live.clearT = setTimeout(again, 150); return; }   // (a slide still coming in: once it is in; a card still folding or pulled: once it rests, so the figure and its labels hold still under the finger)
      if (cardSig() !== live.framedSig) reframe(400); };   // (only when the cards really changed: the camera framed them once; any slide, so a card that grew never covers its box)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const soon = () => { clearTimeout(live.clearT); live.clearT = setTimeout(again, 120); };
    // (The words' glass pane and the figure's insets follow a card that grows after the layout, a chart arriving under the words.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    live.clearRO ||= new ResizeObserver(() => { cancelRest(live.paneRaf); live.paneRaf = restPass(() => { if (!live.ui) return; if (cardMoving()) { if (thrown()) layoutAtLanding(); return; } if (cardsStill()) fitCards(live.ui.data); else layout(); }); soon(); });
    if (live.clearFor !== live.ui) { live.clearRO.disconnect(); live.clearRO.observe(live.ui.data); live.clearRO.observe(live.ui.text); live.clearFor = live.ui; }
    live.ui.data.ontransitionend = live.ui.text.ontransitionend = soon;   // (a card slides into place: its edge is where it ends, not where it was measured)
  };
  // How far a phone's glass reaches above the words (page px): 16 px, or the deck's tab and 8 px more, so the tab never meets
  // the title. The data card and the words' plan leave room for that reach (layout, phoneTextCap): counted as 16 px, an opened
  // stacked card ended 6 px into the glass, under its tab, Sites 3 on an iPhone, 20 Oct.
  // (The level's tab and the deck's share the glass's top edge; where they would come within 8 px of each other, the deck's gives way.)
  // (Judged with the deck's tab shown, as the layout does below: a tight class left from the last pass hides it.)
  const tabsTight = (k) => {
    const tabEl = live.ui.shade.querySelector('.pz-tabname'), stab = live.ui.shade.querySelector('.pz-sitetab:not([hidden])'), was = live.ui.shade.classList.contains('pz-tabs-tight');
    if (was) live.ui.shade.classList.remove('pz-tabs-tight');
    const tight = !!(stab && tabEl && readBox(stab).right + 8 * k > readBox(tabEl).left);
    if (was) live.ui.shade.classList.add('pz-tabs-tight');
    return tight;
  };
  const glassLift = (k) => {
    const tabEl = live.ui.shade.querySelector('.pz-tabname'), stab = live.ui.shade.querySelector('.pz-sitetab:not([hidden])'), tight = tabsTight(k);
    if (!tabEl && !stab) return 16;
    const was = live.ui.shade.classList.contains('pz-tabs-tight');
    if (was) live.ui.shade.classList.remove('pz-tabs-tight');
    const tabH = Math.max(tabEl && !tight ? readMetric(tabEl, 'offsetHeight') : 0, readMetric(stab, 'offsetHeight') || 0);
    if (was) live.ui.shade.classList.add('pz-tabs-tight');
    return Math.max(16, tabH + 8);
  };
  // (The shuffle's animations are parked while the cards are measured, so no box is read through its own transform: card-shuffle.js.)
  function layout() {
    if (!live.ui) return;
    if (zoomHeld()) return;   // (the zoomed card is not where it rests: it is laid out once it is back, zoomSettled)
    live.shuffle?.park();
    try { layoutNow(); } finally { live.shuffle?.resume(); }
  }
  function layoutNow() {
    live.zoomMissed = false;
    // k: screen px per CSS px of the figure's box (1 unless the page is scaled): rects are screen px, inline sizes are the page's own (screen / k).
    const p = phone(), wr = readBox(wrap), W = wr.width, H = wr.height, k = wr.width / (readMetric(wrap, 'clientWidth') || wr.width) || 1;
    live.ui.root.classList.toggle('stack', p); live.ui.shade.classList.toggle('stack', p);
    live.ui.root.classList.toggle('tab', p && tabUp()); live.ui.shade.classList.toggle('tab', p && tabUp()); live.ui.text.classList.toggle('pz-tabgap', !!(live.ui.shade.querySelector('.pz-tabname') || live.ui.shade.querySelector('.pz-sitetab:not([hidden])')));   // (a tabbed card keeps half a tab's height clear under the strip: styles/app.css .pz-tabgap)
    // (A phone held sideways takes the Mac and iPad landscape layout, 3 Nov 2026, Mohammad: "the cards on the left both of them, tuck and untuck like Mac":
    // the words' card and the data card stacked at the left, its readings' card tucked under, the compact .pz.short sizes. `low`, the old split
    // layout (words left, instruments right behind Show), is never set now; its branches stay for the one-step revert.)
    const low = false;
    // (A wider screen under 860 px tall, an iPad on its side or a short Mac window: the compact layout, tighter cards at the roles'
    // own sizes whose lettering never zooms under 12 px, shortFit; styles/app.css .pz.short.)
    const short = !p && !low && H / k <= SHORT_H;
    live.ui.root.classList.toggle('short', short);
    const cardOn = TEXT_CARD && !p;   // (a phone held sideways too: its words in a floating card, not a panel at the edge)
    live.ui.root.classList.toggle('pz-card', cardOn); live.ui.shade.classList.toggle('pz-card', cardOn);
    live.ui.root.classList.toggle('low', low); live.ui.shade.classList.toggle('low', low);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const off = (el) => el.hidden || (el === live.ui.data ? 'gone' in el.dataset : el.classList.contains('pz-hide'));   // (a card only easing out and back in for the next slide still counts, where it rests: the camera frames once)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const r = (el) => (off(el) ? null : restBox(el));
    // The words' sizes settle once per slide, before its cards enter: a later pass (a reading ticking, the data card growing)
    // keeps them, so the teaching card's text never changes size while it is in view. (A new text size in Settings is a new layout:
    // kept, a card folded at 200% stayed folded back at 100%.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const at = live.shown || live.entering, lockKey = at ? `${at.gen}:${at.i}:${W.toFixed(0)}x${H.toFixed(0)}:${stage.labelScale()}` : null, lock = lockKey && live.textLock?.key === lockKey ? live.textLock : null;
    // (Wider cards, 19 Nov 2026: a screen too short for the pair gives the cards a wider column before it shuffles them (below): the same words and instrument in fewer lines. Every pass starts
    // from the normal width; a slide that was widened keeps it with the rest of what its words lock.)
    if (lock?.wide) live.ui.root.style.setProperty('--pz-cw', SHUF.wide); else live.ui.root.style.removeProperty('--pz-cw');
    // (A ladder's fold holds for the slide being drawn, from its first measure: keyed by the slide wanted, not the one shown, so
    // the fold found while its cards come in is kept once it shows. Keyed by the slide shown, the card unfolded for a moment
    // as it came in at 200%, then folded again.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const foldKey = `${live.gen}:${live.want}:${W.toFixed(0)}x${H.toFixed(0)}:${stage.labelScale()}`;
    live.ui.text.style.removeProperty('--pz-tk'); live.ui.text.style.removeProperty('--pz-bk'); live.ui.text.classList.remove('pz-nocauses');
    live.ui.text.style.maxHeight = '';   // (the last pass's cap would shrink the words to a room they no longer have)
    // (A phone's words keep clear of the pill and the colour key first: the room they leave (--pz-reach, --pz-fkrow) is part
    // of the fit. Placed only after it, the words were fitted to the last slide's key and kept that fit: Circulation slide 2
    // on an iPhone came in at 0.814 and took 0.847 on the next refit, or the other way round.)
    if (phone()) placeBar();
    // A phone keeps a fixed share of its height for the figure between the data card and the words (FIG_MIN), so the readings a
    // slide teaches always have room to show: the words' card is capped to what is left (their fit then sets them a little
    // smaller), decided once per slide and size, so it never changes while the slide is in view. (Capped only at 62 % before:
    // with a tall data card, a 667 px iPhone kept 24 to 70 px of figure on a dozen slides and Circuit 2 hid its R liver.)
    // (Before the words are measured for the phone's cap: measured with the full names on two rows, the card kept 12 px it no longer needed.)
    abShort(live.ui.text, true);   // (a row that would wrap takes its compact labels on every screen)
    // (A phone's card with a second part keeps that part on its sheet (.pz-lip, dockVec); each slide arrives partly open.)
    // (Mac and iPad landscape: the same, stacked under the words, every instrument with readings, the Gut to heart chart too: pz-wide.)
    const wide = cardOn && !low;
    live.ui.root.classList.toggle('pz-wide', wide);
    const dd0 = live.ui.data, sheet = (p || wide) && dd0.classList.contains('has-tool') && !dd0.classList.contains('tool-only');
    // (An upright phone's or tablet's sheet stays opaque while it is out and fades its parts instead, styles/app.css: a card that
    // becomes one, or stops being one, while it is out takes its new state at once, so its glass never shows, fading, between two slides.)
    if (sheet !== dd0.classList.contains('pz-sheet') && (p || wide) && dd0.classList.contains('pz-hide')) {
      const was = dd0.style.transition;
      dd0.style.transition = 'none'; dd0.classList.toggle('pz-sheet', sheet); void readMetric(dd0, 'offsetWidth'); dd0.style.transition = was;
    }
    dd0.classList.toggle('pz-sheet', sheet);
    if (!p) dd0.classList.toggle('pz-beside', !sheet && dd0.hasAttribute('data-beside') && !dd0.classList.contains('pz-folds'));   // (the readings' card holds the tiles: none beside the instrument)
    if ((p || low) && dd0.classList.contains('pz-folds')) dd0.classList.remove('pz-folds');   // (a wider screen's fold, left by a window made narrow)
    // (Mac and iPad landscape too: each slide comes in with its readings tucked, the words whole; they come out on a pull or a tap.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (sheet && dd0.classList.contains('tool-open') && dd0.dataset.openFor !== String(live.want)) { stopUnder(); dd0.classList.remove('tool-open'); }
    // (The readings' travel (--pz-d) is measured once, by fitCards at the fit it ends with, never here: 2 Nov 2026's stale-travel case is covered because every new slide refits.)
    const phoneCap = p ? phoneTextCap(lockKey, H, k) : null;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (phoneCap != null) live.ui.text.style.maxHeight = `${phoneCap.toFixed(1)}px`;
    if (p) autoDock(phoneShut); else if (!low) autoDock(false);
    // A phone held sideways: its card stands level with the data card at the top right (one margin from the top without one), its
    // top padding tall enough for the deck's tab beside the title (padT), one margin from the foot. The words' room is set before
    // they are fitted, the same room the card is given below, so they are fitted once to the room they keep.
    const vm = LOW_M * k;
    let padT = 0, pad0 = 0;
    if (cardOn && low) {
      pad0 = (readMetric(live.ui.text, 'offsetLeft') - readMetric(live.ui.shade, 'offsetLeft')) * k; const tab = live.ui.shade.querySelector('.pz-tabname') || live.ui.shade.querySelector('.pz-sitetab:not([hidden])');
      padT = Math.max(pad0, readMetric(tab, 'offsetHeight') ? (readMetric(tab, 'offsetHeight') + 6) * k : 0);
      const top = off(live.ui.data) ? vm : r(live.ui.data).top - wr.top;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      live.ui.text.style.maxHeight = `${Math.max(0, (H - top - padT - pad0 - vm) / k).toFixed(1)}px`;
    }
    fitCards(live.ui.text);
    // (The words' card taller than its own room, a long body in a short window: the title steps down, to the floor that keeps it a title, before the words are zoomed (17 Nov 2026, the tester: the
    // teaching body fell from 18 to 15.5 px on hvpg 13 to 15, shunts 15 and 16, ascites 8 and varices 10 and 11 at 1440 x 780). The words keep their size wherever the title can give the room.)
    let tk0 = 1;
    if (cardOn && !p && !low) {
      const ts0 = live.ui.text.style, fit0 = () => parseFloat(ts0.getPropertyValue('--pz-fit')) || 1;
      if (fit0() < 0.999) {
        const hEl = live.ui.text.querySelector('.pz-h'), bEl = live.ui.text.querySelector('.pz-line') || live.ui.text.querySelector('p:not(.pz-eqk)');
        const f = titleFloorK(hEl ? parseFloat(readStyle(hEl).fontSize) : 0, bEl ? parseFloat(readStyle(bEl).fontSize) : 0), a = Math.max(WIDE.title, f);
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        for (const tk of f < a ? [a, f] : [a]) {
          tk0 = tk; ts0.setProperty('--pz-tk', String(tk));
          fitDone.delete(live.ui.text); fitCards(live.ui.text);
          if (fit0() >= 0.999) break;
        }
      }
    }
    let t = r(live.ui.text);
    if (cardOn && low && t && lowKey(t, r(live.ui.data), padT, pad0, vm, wr, H, k)) { fitDone.delete(live.ui.text); fitCards(live.ui.text); t = r(live.ui.text); }
    const sl = readMetric(live.ui.shade, 'offsetLeft') * k, sm = Math.min(sl, Math.max(sl - insetL() * k, 8 * k)), pad = cardOn && t ? t.left - wr.left - sl : 0, dd = live.ui.data, ts = live.ui.text.style;
    if (!(cardOn && low)) padT = pad;
    // On a laptop or tablet the data card always stacks under the words' card, at its width, a gap below it (0.6 of the margin),
    // above the controls; what does not fit is made smaller in fixed steps, never moved to the top right. A card in view that
    // changes place fades out, moves while unseen and fades back in.
    let below = false, shuf = false, wider = !!lock?.wide, gap = 0, cw = 0, foot = H, wordsCap = Infinity, rise = 0;   // (rise: how far a stacked pair that is a few px too tall for the screen stands higher, into its top margin, so the data card keeps its whole height)   // (wordsCap: the height the words' card is held to where the data card needs the room, below)
    slip.base = 0;
    const top0 = cardOn && t ? sm : 0;   // (the cards' top: one margin from the top, as from the side)
    if (cardOn && !low && t && !off(dd)) {
      gap = Math.round(0.6 * sm); cw = t.right - wr.left + pad - sl;
      // (Folding the instrument behind Show is the last step, below: each new measure starts unfolded. It snaps while the card is
      // measured, so the measure sees where it rests; a tap on Show or Hide then eases it.)
      const canFold = dd.classList.contains('has-tool') && !dd.classList.contains('tool-only') && !dd.classList.contains('tool-lead') && !dd.classList.contains('pz-sheet');   // (a stacked card tucks its readings instead)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const setFolds = (on) => {
        if (dd.classList.contains('pz-folds') === on) return;   // (unchanged: a pass mid-ease must not cut a Show or Hide short)
        if (on) dd.classList.remove('pz-lt', 'pz-lt2');   // (folded, the compact layout's steps run again from the loosest)
        const tl = dd.querySelector(':scope > .pz-tool');
        if (tl) tl.style.transition = 'none';
        dd.classList.toggle('pz-folds', on); dd.classList.toggle('pz-beside', !on && dd.hasAttribute('data-beside'));
        if (tl) { void readMetric(tl, 'offsetHeight'); tl.style.transition = ''; }
      };
      // (A card already folded for this slide at this size stays folded until the slide is shown and its words lock: unfolded
      // and folded again on every pass, the foot row under the words was made anew each time, the words fitted without it, and
      // the next pass came at once; the data card flashed in and out and the words' card jumped until the slide had settled.
      // Sites 9 on a Mac, 17 Oct.)
      const held = !lock && live.foldHeld === foldKey && dd.classList.contains('pz-folds');
      if (!lock && !held && dd.classList.contains('pz-folds')) setFolds(false);
      const q = live.ui.bar.hidden || !readMetric(live.ui.bar, 'offsetWidth') ? null : readBox(live.ui.bar);
      foot = q && q.left - wr.left < sl + cw ? q.top - wr.top - gap : H - sm;
      let ch = colHeight(cw / k) * k, dk = 1;
      const slack = dd.classList.contains('col') ? 8 : 0;
      below = top0 + t.height + 2 * pad + gap + ch <= foot + slack;
      // Too tall to stack: the words' card gives way first, only a little: from Regular to Compact, its title and words each one
      // fixed step (card-type.js WIDE, so every slide reads at one of two sizes and its title always well above its words; its column
      // never widens: every slide keeps one card width), then the data card's blocks step smaller (DK). At the last step the pair
      // stays stacked and the data card's own fit does the rest.
      // (trim: the words' card's last steps, below. 1: the title one step further down (WIDE.tight); 2: and the CAUSES line gone.)
      let trim = 0;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const put = (tk, bk) => { live.ui.text.style.setProperty('--pz-tk', trim ? Math.min(tk, WIDE.tight) : tk); live.ui.text.style.setProperty('--pz-bk', bk); live.ui.text.classList.toggle('pz-nocauses', trim > 1); t = r(live.ui.text); return top0 + t.height + 2 * pad + gap + ch <= foot; };   // (no slack once shrunk: the data card is never squeezed)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      // (Regular only, 17 Nov 2026, Mohammad: "Fix this issue everywhere": the words never step down for the data card's height. The data card's blocks step
      // smaller, its instrument folds behind Show, its own fit does the rest. Only a phone held sideways, where no room is left, still steps the words down.)
      const sw = H <= SIDEWAYS_MAX_H * k;
      // (17 Nov 2026, the TIPS deck's data card clipped at its foot on a Mac, slides 8 and 20: the instrument's pictures and the 12 px floor of its words left it nothing to give, and the words'
      // card kept all the room. The title is what gives way first, to the card-type.js steps (WIDE.title, then WIDE.tight), the words never: --pz-bk stays 1. The instrument is then not squeezed.)
      // (The title stops at TITLE_RATIO times the words, card-type.js titleFloorK: a title that reads as a bold first line is not a title. The pair then rises into its top margin, below, and the data card's own fit does the rest.)
      const steps = () => {
        if (put(tk0, 1)) return true;
        const hEl = live.ui.text.querySelector('.pz-h'), bEl = live.ui.text.querySelector('.pz-line') || live.ui.text.querySelector('p:not(.pz-eqk)');
        const f = titleFloorK(hEl ? parseFloat(readStyle(hEl).fontSize) / tk0 : 0, bEl ? parseFloat(readStyle(bEl).fontSize) : 0), a = Math.max(WIDE.title, f);   // (the title as it is at tk 1: put(tk0, 1) left it at tk0)
        return (a < tk0 && put(a, 1)) || (f < a && f < tk0 && put(f, 1));
      };
      const step = () => (sw ? put(WIDE.title, WIDE.words) : steps());
      const title = () => (sw ? put(1, 1) || put(WIDE.title, WIDE.words) : steps());
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const foldH = (s) => colHeight(cw / k, s);
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const stepDk = (s) => { dk = s; ch = foldH(s) * k; };
      // (The words stay Compact while the blocks step down: one size for the words, whatever the data card needs.)
      // (The compact layout steps its blocks tighter instead (.pz-lt, .pz-lt2), never smaller: its lettering stays 12 px, shortFit.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const ladder = () => {
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        if (short) { for (const c of ['pz-lt', 'pz-lt2']) { if (below) break; dd.classList.add(c); ch = colHeight(cw / k) * k; below = step(); } return; }
        // (The blocks step down only while their smallest lettering, the tiles' names, stays 12 px on the screen: a step of 0.86 took them to 10.3 px, the tester, 17 Nov 2026. dkFloorOf, card-type.js.)
        const kEl = dd.querySelector('.pz-tiles .pzt-k'), dkMin = dkFloorOf(kEl ? parseFloat(readStyle(kEl).fontSize) : 0);
        for (const s of DK) { if (below || s < dkMin - 1e-6) break; stepDk(s); below = step(); }   // (the data card's blocks a step or two smaller: no further, or the words would squeeze)
      };
      // When even the smallest blocks leave the pair too tall, the words' card gives way once more before anything is cut off: its title one
      // step down, then the CAUSES line gone, the blocks stepping again from full size under each (Mohammad, 23 Oct, Sites 4 on a Mac at a
      // larger text size: a tall title and a long CAUSES line left the Gut to heart chart cut off). Only a slide the steps above could not fit
      // comes here, so every slide that fitted stays as it was.
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const squeeze = () => {
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        for (const n of [1, 2]) {
          trim = n; dd.classList.remove('pz-lt', 'pz-lt2'); stepDk(1);
          below = step();
          if (!below && n === 2) ladder();
          if (below) return;
        }
      };
      // The last step when even the smallest blocks leave the pair too tall: the instrument folds behind Show (as on a phone),
      // its tiles in a row under the header at the card's full width, and the steps run again from full size.
      // (Not for a slide whose instrument is its point (tool-lead), nor a card that holds only the instrument.)
      if (lock) {
        for (const [n, v] of lock.vars) if (v) ts.setProperty(n, v);
        live.ui.text.classList.toggle('pz-nocauses', !!lock.nc);
        if (lock.folds) setFolds(true);
        shuf = !!lock.shuf;
        t = r(live.ui.text); below = lock.below; dk = lock.dk; cw = t.right - wr.left + pad - sl; ch = foldH(dk) * k;
      } else {
        // (The words at Compact at the one card width, then the steps below; the column never widens.)
        if (held) stepDk(1);
        dd.classList.remove('pz-lt', 'pz-lt2'); ch = foldH(dk) * k;
        below = title();
        if (!below) ladder();
        // (Shuffle, 19 Nov 2026, Mohammad: "when the vertical screen is not enough. No text scrolling inside cards." A screen too short for the pair, an iPhone on its side,
        // gives the two cards one place: the words at Regular size in front and the instrument behind, a strip of it showing above, a swipe shuffling them (card-shuffle.js).
        // Each has the whole height, so neither shrinks for the other. A card with readings to tuck (a sheet) tucks them instead.)
        if (!below && sw && !wideSheet(dd) && !lock?.wide) {
          // (First a wider column: the words and the instrument in fewer lines may fit the pair stacked after all.)
          live.ui.root.style.setProperty('--pz-cw', SHUF.wide);
          wider = true; t = r(live.ui.text); cw = t.right - wr.left + pad - sl;
          trim = 0; stepDk(1); below = title(); if (!below) ladder();
        }
        if (!below && sw && !wideSheet(dd)) {
          shuf = true; below = true; stepDk(1);
          // (The words stand alone in their place: Regular size at first, then the title a step down, then the CAUSES line gone, the way a pair too tall does (squeeze); the body never
          // shrinks. The data card's height and the gap are out of the sum for it, so `put` answers whether the words alone fit.)
          const ch0 = ch, gap0 = gap; ch = 0; gap = 0;
          trim = 0;
          let fits = steps();
          if (!fits) for (const n of [1, 2]) { trim = n; fits = steps(); if (fits) break; }
          // (None fits at Regular: a phone held sideways, where no room is left, steps the words to Compact as it always has, once the title and the CAUSES line have given what they can; WIDE.words, never under 12 px.)
          if (!fits) for (const n of [0, 1, 2]) { trim = n; if (step()) break; }
          ch = ch0; gap = gap0;
        }
        if (!below && sw) squeeze();   // (the title one step down and the CAUSES line gone: only a phone on its side)
        if (!below && canFold && !held) { setFolds(true); trim = 0; ts.removeProperty('--pz-tk'); ts.removeProperty('--pz-bk'); live.ui.text.classList.remove('pz-nocauses'); stepDk(1); below = title(); if (!below) ladder(); }
        if (!below && sw && !held && dd.classList.contains('pz-folds')) squeeze();   // (folded just now: the same last steps again)
        // (Still too tall at the smallest step: the pair stays stacked at the one card width, the words at their smallest (the title one step
        // down and no CAUSES line) and the blocks at their smallest step; the data card is never moved to the top right, its own fit (fitCards)
        // makes the rest fit its room.)
        // (A phone held sideways, 3 Nov 2026, Mohammad: "the instrument card should look good even if the text of the teaching card is smaller": the instrument
        // keeps its size and the words' card shrinks further, the title and the words a few steps below Compact, until the pair stands in the 390 px.)
        // (The words' extra steps, card-type.js sidewaysWords: a step is kept only while the card's smallest lettering stays 12 px on the
        // screen (minText), and where none fits the pair the words stay at the last step kept, never back up at Compact, which left the
        // data card the rest: Doppler 3 on an iPhone on its side had a strip of spectrum under 5 lines of words, 11 Nov 2026.)
        if (!below && H <= SIDEWAYS_MAX_H * k) {
          trim = 2;
          // (16 Nov 2026, play-test, iPhone 844 x 390, Circulation 3: the words' last fit, 0.984, was left from Regular's height, where the card had
          // overflowed its cap. Every step below it was then judged with that zoom on top, its smallest lettering read 11.8 px, the first step was refused
          // and the words fell back to Compact, 232 px tall: the Gut to heart chart got the 105 px left and ran off the screen. The steps are judged
          // at their own size, the fit cleared, and the words are fitted once more at the step kept.)
          const fz = ts.getPropertyValue('--pz-fit'), zz = ts.getPropertyValue('--pz-z');
          const own = { clear: () => { ts.removeProperty('--pz-fit'); ts.removeProperty('--pz-z'); }, restore: () => { if (fz) ts.setProperty('--pz-fit', fz); if (zz) ts.setProperty('--pz-z', zz); } };
          if (!sidewaysWords(put, () => minText(live.ui.text), own).last) put(WIDE.title, WIDE.words);   // (not even the first step keeps 12 px: Compact, as before)
          fitDone.delete(live.ui.text); fitCards(live.ui.text); t = r(live.ui.text);
          below = true;
        }
        if (!below) { step(); below = true; }
      }
      // (A phone on its side where the pair is still a few px too tall at the words' last step: the pair rises into its top margin (never closer than 4 px
      // to the top) rather than the data card's chart being cut off by its cap, 16 Nov 2026, play-test. A cut-off chart is a bug; a thinner margin is not.)
      // (The pair's steps took the title further down than the words' fit was made for: the words are fitted again to the card as it now is, and are zoomed no more than it needs.)
      if (!p && (parseFloat(ts.getPropertyValue('--pz-fit')) || 1) < 0.999 && (parseFloat(ts.getPropertyValue('--pz-tk')) || 1) < tk0 - 1e-6) { fitDone.delete(live.ui.text); fitCards(live.ui.text); t = r(live.ui.text); }
      if (below && !shuf && !wideSheet(dd)) rise = pairRise(top0 + t.height + 2 * pad + gap + ch - foot, top0, 4 * k);   // (every screen: the title's floor leaves the pair a few px too tall at times; it rises into its top margin, never closer than 4 px to the top)
      if (dk < 1) dd.style.setProperty('--pz-dk', dk); else dd.style.removeProperty('--pz-dk');
      live.foldHeld = dd.classList.contains('pz-folds') ? foldKey : null;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (lockKey && !lock) live.textLock = { key: lockKey, below, shuf, wide: wider, dk, folds: dd.classList.contains('pz-folds'), nc: live.ui.text.classList.contains('pz-nocauses'), vars: ['--pz-tk', '--pz-bk'].map((n) => [n, ts.getPropertyValue(n)]) };
      // (A Gut to heart chart is drawn at its own size, never zoomed by the fit, and has a smallest height. Where the pair is too tall for it
      // even at the smallest steps, the words' card eases up with the data card, its top slipping behind the screen's top if need be, so the
      // chart stays whole in its card instead of spilling past the screen (Mohammad, 22 Oct: "It's ok if the top of the teaching card slips
      // behind upper part of the screen as the info below is more pertinent"). The readings add their own rise on top, slip.lift.)
      if (wideSheet(dd) && dd.hasAttribute('data-ladder')) {
        const b = Math.max(0, Math.min(top0 + t.height + 2 * pad + gap + ch - foot, t.height + 2 * pad + gap)) / k;
        slip.base = b > 0.5 ? b : 0;
      }
    } else dd.style.removeProperty('--pz-dk');
    const isCol = dd.classList.contains('col');
    if (below !== isCol) {
      if (live.colT) below = isCol;   // (a move under way: the card moves once it has faded out)
      // (Not after its fade (swapNow: it moves now, though a slow frame left it not quite faded; it had stayed stacked under the
      // words for good when an iPad was turned upright), nor on a resize or a turn, where everything moves at once: faded there,
      // it showed over the words' card for a moment while the words had already moved.)
      else if (!live.swapNow && !live.ui.root.classList.contains('pz-turning') && !dd.hidden && !reduce.matches && (dd.classList.contains('pz-sheet') ? !dd.classList.contains('pz-hide') : +readStyle(dd).opacity > 0.05)) {
        below = isCol;
        if (!dd.classList.contains('pz-hide')) {
          dd.classList.add('pz-hide'); dd.dataset.colswap = '';
          // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
          live.colT = stimer(() => { live.colT = 0; if (!live.ui) return; const mine = 'colswap' in live.ui.data.dataset; delete live.ui.data.dataset.colswap; live.swapNow = true; try { layout(); } finally { live.swapNow = false; } if (mine) live.ui.data.classList.remove('pz-hide'); }, 340);
        }
      }
    }
    if (below !== isCol) { dd.style.transition = 'none'; dd.classList.toggle('col', below); }
    if (off(dd) || below) delete dd.dataset.safe; else dd.dataset.safe = p ? 'top' : 'right';
    // (The sheet's edge under the card is part of it for the camera: left out, the room between the cards was taken 24 px taller
    // than it is, and the figure sat that much high.)
    if (dd.dataset.safe) live.ui.lip.dataset.safe = dd.dataset.safe; else delete live.ui.lip.dataset.safe;
    const lipK = below && wideSheet(dd) ? LIP * k : 0;   // (a wide stacked card: its readings' card's tucked edge above it)
    let y = shuf ? top0 : top0 + t?.height + 2 * pad + gap + lipK;   // (shuffled: the instrument's place is the words' own, lowered by the strip's room below)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    dd.style.left = below ? `${(sl / k).toFixed(1)}px` : '';
    // (One width on every slide: stacked or at the top right, the data card is always the teaching card's width, whatever it holds.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    dd.style.width = cw ? `${(cw / k).toFixed(1)}px` : '';
    dd.style.maxWidth = cw ? 'none' : '';   // (no per-content cap: tiles, an instrument or a chart never make it narrower)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    dd.style.top = below ? `${(y / k).toFixed(1)}px` : '';
    dd.style.maxHeight = below ? capOf(dd, (foot - y) / k) : '';
    // (A phone: the data card ends 8 px short of the teaching card (where its glass begins, glassLift), however much it holds: an opened instrument had grown over the words.)
    // (And leaves the figure its share: FIG_MIN between the two cards.)
    // (Partly open, its sheet's edge (LIP) stands below it in that room too. A card that came in closed (phoneShut) leaves the figure
    // its share only while closed: brought back by the reader it may cover the figure, never the words.)
    // (The sheet's edge comes out of the figure's share, not the card's: taken from the card, it shrank the instrument and tiles to
    // 90-99 %, Endoscopy 4 on an iPhone. And 2 px more: the card's border and rounding had left it 99.6 %.)
    if (p && t) { const cs = readStyle(dd), lip = lipOn(dd) ? LIP : 0, fig = phoneCap != null && !phoneShut && !dd.classList.contains('tool-open') && !('folding' in dd.dataset) ? Math.max(0, phoneFig / k - lip - 2) : 0;
      const room = Math.floor((t.top - wr.top) / k - (parseFloat(cs.top) || 0) - glassLift(k) - 8 - lip - fig);
      // (An upright phone's stacked card grows by its readings' card as that slides out or back (--pz-grow, styles/app.css): capped
      // at its tucked height mid-slide, the card's box came out shorter than the instrument, so the instrument card's glass, which ends
      // the readings' travel above the box's foot, cut through the portal blood bar's names, Mohammad on an iPhone, TIPS Doppler 3, 20 Oct.)
      // (Its cap is the tucked card's in every state, readings out or not, and the readings' share is added on top (--pz-grow), never
      // past the room an opened card has: fitted against the opened card's larger room, the instrument came out bigger the moment the
      // readings came out, and its chart snapped to the new size, Sites 3 on an iPhone, 20 Oct. fitCards fits it with --pz-grow at the readings' share (--pz-d),
      // so open or tucked it is fitted against one cap and keeps one size.)
      if (splitSheet(dd)) {
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        const tuck = cs.getPropertyValue('--pz-cap').trim() || 'none';
        const base = (t.top - wr.top) / k - (parseFloat(cs.top) || 0) - glassLift(k) - 8;
        const roomT = Math.floor(base - LIP - (phoneCap != null && !phoneShut ? Math.max(0, phoneFig / k - LIP - 2) : 0)), roomO = Math.floor(base);
        // (No tucked room at all, a tiny screen or a very large text size: the tucked cap is the card's own, as before, and the opened card's
        // room still caps it, so it never runs under the words. The same cap open or tucked either way, so the fit never changes on opening.)
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        const capT = roomT > 0 ? (tuck === 'none' ? `${roomT}px` : `min(${tuck}, ${roomT}px)`) : tuck;
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        if (roomO > 0) dd.style.maxHeight = capT === 'none' ? `${roomO}px` : `min(calc(${capT} + var(--pz-grow, 0px)), ${roomO}px)`;
        // (A picture's room, --pz-ph: 0.6 of the tucked card's own height cap, worked out from the card's box and its cap here, no content measured.
        // The stylesheet gives each picture min(its height times the fit, this, never under the picture's own least), so none is taller than the card holds.)
        const capPx = Math.min(roomT > 0 ? roomT : Infinity, ...[...tuck.matchAll(/([\d.]+)(%|px)/g)].map((m) => (m[2] === '%' ? m[1] / 100 * wr.height / k : +m[1])));
        if (Number.isFinite(capPx)) dd.style.setProperty('--pz-ph', `${Math.floor(capPx * 0.6)}px`); else dd.style.removeProperty('--pz-ph');
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      } else { dd.style.removeProperty('--pz-ph'); if (room > 0) dd.style.maxHeight = cs.maxHeight === 'none' ? `${room}px` : `min(${cs.maxHeight}, ${room}px)`; } }
    // (A wider screen: a data card at the top right ends 8 px above the colour key standing on the nav pill (a phone held sideways had covered it).)
    if (!p && !below && live.ui.fk.dataset.empty == null && !live.ui.bar.hidden) {
      const f = live.ui.fk, was = f.hidden; f.hidden = false; const q = readBox(f); f.hidden = was;
      const cs = readStyle(dd), room = Math.floor((q.top - wr.top) / k - (parseFloat(cs.top) || 0) - 8 - (lipOn(dd) ? LIP : 0));
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (q.width && room > 0) dd.style.maxHeight = cs.maxHeight === 'none' ? `${room}px` : `min(${cs.maxHeight}, ${room}px)`;
    }
    if (below !== isCol) { void readMetric(dd, 'offsetWidth'); dd.style.transition = ''; }
    chipRoom(dd);
    const beside = low && tabBeside();
    fitCards(live.ui.data, live.ui.panel);
    if (beside && !tabBeside()) { fitDone.delete(live.ui.panel); fitCards(live.ui.panel); }
    // (No step takes the words down for a data card its own fit cannot make whole, 17 Nov 2026: at a text size above 100 % a Mac or an iPad on its side used to
    // zoom the words' card down, to 12 px at most, and the Gut to heart chart's axis names stayed. The words keep their size at every text size; the data card's
    // own fit and its fold do what they can. tests/words-never-shrink.test.js.)
    // The stacked pair shorter than the screen is centred top to bottom as one (equal room above and below, never closer than one margin
    // to the top or the controls); a pair that fills the screen stays where it is. Set here, before the cards come in, so nothing moves after.
    let shift = 0;
    if (below && t && !off(dd)) {
      // (A stacked card counts with its readings tucked and their card's foot under it, whatever share of them is out: the pair is centred
      // for the tucked card, and rises from there only as far as the readings need, slip.lift.)
      const ws = wideSheet(dd);
      const dpx = ws ? parseFloat(dd.style.getPropertyValue('--pz-d')) || 0 : 0;
      const tuckH = ws ? readMetric(dd, 'offsetHeight') - underU(dd) * dpx + LIP : readMetric(dd, 'offsetHeight');
      // Centre against the chart's destination too: a chart still growing must not lend its temporary
      // empty space to a downward move that would leave too little room for its final height.
      const cardH = !ws && parseFloat(dd.style.getPropertyValue('--ft-card')) || tuckH;
      const stackH = t.height + 2 * pad + gap + cardH * k;
      shift = shuf ? SHUF.lift * k : rise > 0 ? -rise : Math.max(0, Math.min((H - stackH) / 2 - top0, foot - top0 - stackH));
      // (Centred once per slide: while only the data card's readings change (a time-lapse, a what-if slider), the pair keeps the place
      // it came in at, so the words never ride up and down with a reading that measured a pixel taller.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (lockKey && shiftLock?.key === lockKey && readingsOnly()) shift = shiftLock.v; else if (lockKey) shiftLock = { key: lockKey, v: shift };
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (Math.abs(shift) > 0.5) {
        dd.style.top = `${((y + shift) / k).toFixed(1)}px`; dd.style.maxHeight = capOf(dd, (foot - y - shift) / k);
        // (The card was fitted against the cap it had before the pair was centred, raised or shuffled: its instrument's pictures took that room, and ran up to 8 px past the new one, the deck sweep, 19 Nov 2026. Fitted again at the cap it rests with.)
        if (fitDone.get(dd) !== fitSig(dd)) fitCards(dd);
      } else shift = 0;
      // (How far the words rise with the readings all out: the readings' whole travel, so the instrument card never moves (Mohammad, 22 Oct:
      // "It's ok if the top of the teaching card slips behind upper part of the screen as the info below is more pertinent").)
      if (ws) slip.lift = dpx + slip.base;   // (in all: a Gut to heart chart's own rise, slip.base, and then the readings' travel)
    }
    if (!(below && t && wideSheet(dd))) { slip.lift = 0; slip.base = 0; }
    liftTo(underU(dd));
    fitWatch();
    const dv = dockRest();
    const d = below ? null : r(live.ui.data);
    // The words' card is only as tall as the words. With a data card beside or under it, its top is level with the data
    // card's place at the top right and the words start one padding below it; without one, the words stay centred and the card wraps them.
    // (With no data card the card is centred top to bottom, never closer than one margin to either edge.)
    // (A phone held sideways: level with the data card at the top right, or centred with no data card, one margin (LOW_M) from the
    // top and the foot; the deck's tab sits in its taller top padding, padT.)
    const lvl = cardOn && low && t ? (d ? d.top - wr.top : Math.max(vm, (H - t.height - pad - padT) / 2)) + padT
      : cardOn && t ? (d && !below ? d.top - wr.top : off(dd) ? Math.max(sm, (H - t.height - 2 * pad) / 2) : top0 + shift) + pad : null;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    ts.top = lvl != null ? `${(lvl / k).toFixed(1)}px` : ''; ts.bottom = ts.marginBlock = lvl != null ? 'auto' : '';
    if (lvl != null) ts.marginBlock = '0';
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    ts.maxHeight = lvl != null ? `${Math.min((H - lvl - pad - (low ? vm : sm)) / k, wordsCap).toFixed(1)}px` : phoneCap != null ? `${phoneCap.toFixed(1)}px` : '';   // (one margin at the bottom too)
    if (t) t = r(live.ui.text);   // (always: the words may already stand there, and the glass is sized to where they are)
    // The words sit on a frosted glass pane: the figure shows through it blurred, behind a crisp edge with a soft
    // shadow. The figure frames itself just past that shadow, so nothing it frames is hidden.
    // (On a phone the words sit at the bottom, over the Back/Next bar, and the data card at the top: B is the height
    // from the words' top edge down to the bottom of the figure.)
    const L = t ? t.right - wr.left : 0, B = t ? H - readMetric(live.ui.text, 'offsetTop') * k : 0;
    // (The words' card: as far past the words on the right as its left edge is before them.)
    const card = cardOn && t ? L + pad - sl : 0;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    live.ui.shade.style.width = !p && t ? `${(card || L + 36) / k}px` : '';
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    live.ui.shade.style.height = !p && cardOn && t ? `${(t.height + pad + padT) / k}px` : '';
    // (A phone's glass reaches 16 px above the words, or the deck's tab and 8 px more: the tab never meets the title.)
    // (The level's tab and the deck's share the glass's top edge; where they would come within 8 px of each other, a long deck
    // name on a narrow phone, the deck's gives way: the level is what the slide teaches.)
    live.ui.shade.classList.remove('pz-tabs-tight');
    if (t && tabsTight(k)) live.ui.shade.classList.add('pz-tabs-tight');
    const lift = p && t ? glassLift(k) : 16;
    // (The words' rect carries the stacked pair's rise, --pz-rise, which the glass takes by its own translate: read back without it.)
    const lf = (parseFloat(live.ui.text.style.getPropertyValue('--pz-rise')) || 0) * k;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    live.ui.shade.style.top = p && t ? `${readMetric(live.ui.text, 'offsetTop') - lift}px` : cardOn && t ? `${(t.top - wr.top - padT + lf) / k}px` : '';
    if (live.ui.shade.style.getPropertyPriority('opacity') !== 'important') live.ui.shade.style.opacity = t ? '1' : '0';   // (not over a throw's own: card-throw.js writes it important while it moves the glass or holds it out)
    live.ui.safe.hidden = !t;
    live.ui.safe.dataset.safe = p ? 'bottom' : 'left';
    live.frameL = !p && t ? (card ? sl + card + 24 : L + 48) : 0;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    live.ui.safe.style.width = p ? '' : `${live.frameL / k}px`;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    live.ui.safe.style.height = p ? `${(B + Math.max(34, lift * k + 4)) / k}px` : '';
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const set = (k, v) => { const px = `${Math.max(0, Math.round(v))}px`; insets.put(k, px); };
    set('--pz-l', live.frameL);
    const rBase = !p && d ? W - (readMetric(live.ui.data, 'offsetLeft') + dock.to * dv[0]) * k + 8 : 0;   // (where the card comes to rest: past its entry shift, at its dock)
    set('--pz-r', rBase);
    set('--pz-t', p && d ? (readMetric(live.ui.data, 'offsetTop') + readMetric(live.ui.data, 'offsetHeight') + (lipOn(live.ui.data) ? LIP : 0) + dv[1] * dock.to) * k + 4 : 0);   // (offsets: a card coming in is still shifted by its entry transform)
    set('--pz-b', p && t ? B + 34 : 0);
    if (!dock.drag) { dockPaint(); placeLip(); }   // (the edge's place, read here at rest: a glide's frames only move it)
    // (The corner icon is offered where the card has room to grow, and only on a wide screen with an instrument: card-zoom.js.)
    live.ui.data.classList.toggle('pz-zoomable', wide && !live.ui.data.hidden && zoomCard() && !!live.ui.zoom.plan());
    placeBar();
    live.shuffle?.sync(shuf, lockKey || '');
    if (!insets.held) dispatchEvent(new Event('pps:occ'));
  }
  // (2 Nov 2026, the labels thread: the room the new cards leave (--pz-l, --pz-t...) was written as their layout ran, before the camera set
  // off, so the figure's labels were laid out once for the new room under the old camera: an organ's name under the coming card faded out
  // for about 0.3 s, then came back where the glide landed. Through a slide change whose camera moves, that room is held back and written
  // as the glide starts (frameTo reads it then, to frame for it), and the labels are laid out once, where it lands.)
  const insets = createInsetHold(app.style);
  const occ = () => dispatchEvent(new Event('pps:occ'));
  function insetsHold() { insets.hold(occ); }
  /** Writes the held room now; tells the figure (pps:occ) unless `quiet` (the glide about to start tells it once it has). */
  function insetsGo(quiet = false) { if (insets.go() && !quiet) occ(); }
  // A row of choices is one row: where its full names would wrap (five treatments on a 375 to 430 px iPhone), each button that has
  // one takes its compact label (the full name stays its accessible name and tooltip), never a second row or a smaller size.
  function abShort(root, may) {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    for (const row of root.querySelectorAll('.pz-ab')) {
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const bs = [...row.querySelectorAll('.pz-abb[data-short]')];
      if (!bs.length) continue;
      for (const b of bs) b.textContent = b.dataset.full;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const tops = () => new Set([...row.querySelectorAll('.pz-abb')].map((b) => Math.round(readMetric(b, 'offsetTop')))).size;
      if (may && (tops() > 1 || readMetric(row, 'scrollWidth') > readMetric(row, 'clientWidth') + 1)) for (const b of bs) b.textContent = b.dataset.short;
    }
    // (A phone on its side: the row of choices at the largest size that holds it on one line, never under 12 px on the screen nor
    // over its own size; the card's fit, which took the four lens buttons to 11 px at 150 %, never sets it.)
    if (!live.ui.root.classList.contains('low')) return;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    for (const row of root.querySelectorAll(':scope > .pz-ab')) {
      const b = row.querySelector('.pz-abb'), host = row.parentElement;
      if (!b || !readMetric(host, 'clientWidth')) continue;
      row.style.zoom = '1'; row.style.flexWrap = 'nowrap'; row.style.width = 'max-content'; row.style.maxWidth = 'none';
      const nat = readBox(row).width + 2, cs = readStyle(host), avail = readMetric(host, 'clientWidth') - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      row.style.flexWrap = row.style.width = row.style.maxWidth = '';
      const fs = parseFloat(readStyle(b).fontSize) || 12;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      row.style.zoom = String(Math.max(12 / fs, Math.min(1, avail / nat)).toFixed(3));
    }
  }
  // The figure's share of a phone's height (between the data card and the words' glass), and the words' cap that keeps it.
  // Where the figure's share, the data card and the words at 12 px or more cannot all fit, the data card folds to its header
  // behind Show (the button that already folds a phone's instrument): the card takes its folded size at once, never easing in view.
  const FIG_MIN = (H) => Math.round(Math.max(170, 0.3 * H));
  let phoneLock = null, phoneShut = false, phoneFig = 0;   // (phoneFig: the figure's share the slide's plan keeps, screen px)   // (phoneShut: the slide's data card comes in closed (autoDock), too tall beside the words and the figure)
  function phoneTextCap(key, H, k) {
    const dd = live.ui.data, ds = dd.style, gone = dd.hidden || 'gone' in dd.dataset;
    let held = key && phoneLock?.key === key ? phoneLock : null;
    // (Also while a what-if slider or a compare button drives the live model (liveOff): its data card changes only its numbers,
    // and re-planned on every live reading that measured a pixel taller, the words' cap stepped and the teaching card shook
    // under the finger on a phone, Sites 4's clot slider. The plan made as the slide came in holds until the next slide.)
    // (And through a time-lapse, while it plays and once it has ended: its data card changes only its readings as the days run, a
    // varix appearing on the scope, and re-planned whenever one measured a pixel taller, the words' cap stepped and the teaching card
    // bounced as the days passed, Endoscopy 3 on an iPhone, 18 Oct.)
    // (A plan that shut the data card is held too, but only until the card is measured smaller than it was planned: planned while its readings or chart were still arriving it came in closed
    // and stayed closed for the slide, whatever its settled height was. TIPS deck, iPhone, 17 Nov 2026: slides 3, 8, 12-22 docked or open by how soon the reader arrived.)
    if (held && (gone || readingsOnly())) { phoneShut = held.shut; phoneFig = held.fig; return held.cap; }
    if (held && held.shut) {
      const sv = [ds.maxHeight, ds.getPropertyValue('--pz-fit'), ds.getPropertyValue('--pz-z')];
      ds.maxHeight = 'none'; ds.removeProperty('--pz-fit'); ds.removeProperty('--pz-z');
      const now = readMetric(dd, 'offsetHeight') * k + (lipOn(dd) ? LIP * k : 0);
      ds.maxHeight = sv[0]; if (sv[1]) ds.setProperty('--pz-fit', sv[1]); else ds.removeProperty('--pz-fit'); if (sv[2]) ds.setProperty('--pz-z', sv[2]);
      if (!(now < held.data - 2) || dd.classList.contains('tool-open') || dd.classList.contains('pz-sliding') || 'folding' in dd.dataset) { phoneShut = held.shut; phoneFig = held.fig; return held.cap; }
      phoneLock = null; held = null;   // (measured smaller than planned: planned again below)
    }
    phoneShut = false; phoneFig = FIG_MIN(H);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const natural = (el, st, fit = 0) => {   // (as it stands unfitted and uncapped; or at that fit)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const sv = [st.maxHeight, st.getPropertyValue('--pz-fit'), st.getPropertyValue('--pz-z')];
      st.maxHeight = 'none'; st.removeProperty('--pz-fit'); st.removeProperty('--pz-z');
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (fit) st.setProperty('--pz-fit', String(fit));
      const v = readMetric(el, 'offsetHeight') * k;
      st.maxHeight = sv[0]; if (sv[1]) st.setProperty('--pz-fit', sv[1]); else st.removeProperty('--pz-fit'); if (sv[2]) st.setProperty('--pz-z', sv[2]);
      return v;
    };
    // (Kept while the slide shows, unless its data card grew past what was planned for it, an instrument or chart built after
    // the slide arrived: Doppler 5 on a 320 px iPhone was planned at 148 px and grew to 284, over the figure's share.)
    // (Not for an instrument the reader opened: that grows by choice, over the figure, and closes again.)
    const lip = lipOn(dd) ? LIP * k : 0;
    // (Nor while its readings' card is pulled or easing out: they grow the card on the way, and re-planned mid-pull the card came out
    // too tall and closed itself under the finger instead of opening the readings, Mohammad on an iPhone, 20 Oct.)
    if (held) { if (dd.classList.contains('tool-open') || dd.classList.contains('pz-sliding') || 'folding' in dd.dataset || natural(dd, ds) + lip <= held.data + 1) { phoneFig = held.fig; return held.cap; } }
    const ts = live.ui.text.style, was = ts.maxHeight;
    ts.maxHeight = '';
    const css = readStyle(live.ui.text), own = parseFloat(css.maxHeight) * (css.maxHeight.endsWith('%') ? H / 100 : 1), foot = (parseFloat(css.bottom) || 0) * k;
    ts.maxHeight = was;
    // (Measured at that size, not scaled from the full size: zoomed down, the lines take more words each and the card comes
    // out shorter than its full height times the zoom. Scaled, HVPG 5 on a 667 px iPhone asked 263 px for words that take 230.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const textAt = (z) => (z < 1 ? (() => {
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const sv = [ts.maxHeight, ts.getPropertyValue('--pz-fit'), ts.getPropertyValue('--pz-z')];
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      ts.maxHeight = 'none'; ts.removeProperty('--pz-z'); ts.setProperty('--pz-fit', String(z));
      const v = readMetric(live.ui.text, 'offsetHeight') * k;
      ts.maxHeight = sv[0]; if (sv[1]) ts.setProperty('--pz-fit', sv[1]); else ts.removeProperty('--pz-fit'); if (sv[2]) ts.setProperty('--pz-z', sv[2]);
      return v;
    })() : natural(live.ui.text, ts)) + 4;
    // (The words stay at Regular on every slide, 17 Nov 2026: the plan below (card-type.js phonePlan) finds their room from the figure's share
    // and, past that, by closing the data card, never by taking their size down to 12 px or Compact as it did.)
    const regular = textAt(1);
    // (The words' glass starts 16 px above them or higher, glassLift, the data card ends 8 px above that and stands its own top (8 px) from the
    // screen's top: the same room the layout gives it below.) The data card shows at full size or comes in closed: never shrunk to fit.
    // It comes in closed (autoDock, its edge and handle at the top) where it and the words at 12 px cannot both fit beside the figure's
    // share, or where it is taller than its own cap (styles/app.css max-height). (Capped at 45 % of the shared room before, its own fit
    // doing the rest: Treatment 2 on a 667 px iPhone came in at half size, and the 8 px of its top left out shrank hvpg 5's card to 78 % on a 844 px one.)
    // (Never folded to its header behind Show any more: Mohammad, 17 Oct, "The data card should not glitch like this on the iPhone".)
    const dcs = readStyle(dd), dtop = (parseFloat(dcs.top) || 0) * k;
    // (The cap with the readings tucked: out, it grows by their height, styles/app.css .pz-sheet.has-tool.tool-open.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const dmax = (() => { const sv = ds.maxHeight; ds.maxHeight = ''; const m = readStyle(dd).maxHeight; ds.maxHeight = sv; if (m === 'none') return Infinity; let v = 0; m.replace(/(-?[\d.]+)(%|px)/g, (_, n, u) => { v += u === '%' ? n * H / 100 : n * k; }); return v; })()
      - (splitSheet(dd) && dd.classList.contains('tool-open') && dd.classList.contains('has-tool') ? (parseFloat(ds.getPropertyValue('--pz-d')) || 0) * k : 0);
    const reach = glassLift(k) * k;
    const room = H - foot - reach - 8;
    // (Measured as the slide arrives, partly open with its sheet's edge below it, whatever the reader opened: the part's ease held
    // back so the measure sees where it rests.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const arriving = (fit = 0) => {
      const p = dd.classList.contains('pz-sheet') && dd.classList.contains('tool-open') ? live.ui.partOf() : null;
      if (!p) return natural(dd, ds, fit) + lip;
      const tr = p.style.transition; p.style.transition = 'none'; dd.classList.remove('tool-open');
      const v = natural(dd, ds, fit) + LIP * k;
      dd.classList.add('tool-open'); void readMetric(p, 'offsetHeight'); p.style.transition = tr;
      return v;
    };
    const full = gone ? 0 : arriving(), sheetLip = dd.classList.contains('pz-sheet') ? LIP * k : 0;
    // (Every chart in a phone's card has one size on every slide (styles/app.css .pz.stack .pz-prof, .pz-flows, .pz-flowtime): never
    // given way to 80 % to fit, which drew the Gut to heart ladder small on one slide and large on the next, Mohammad, 21 Oct: "Just
    // make it one version everywhere". A card too tall beside the words borrows from the figure instead, below.)
    const data = full;
    // (The figure's share gives way first, down to figFloorOf, then the data card comes in closed (autoDock, its edge and handle at the top, the reader
    // pulls it open): the words never drop a size for either. phonePlan, pure, is tested over every height: tests/phone-words-plan.test.js.)
    const mine = Number.isFinite(own) ? own : 0.62 * H;
    const plan = phonePlan({ room, dtop, data, dmax, lip: sheetLip, regular, mine, grip: GRIP * k, figMin: FIG_MIN(H), figFloor: figFloorOf(H), gone, hasData: !!dd.querySelector(':scope > :not(.pz-dh):not(.pz-grip):not(.pz-lip)') });
    phoneFig = plan.fig;
    phoneShut = plan.shut;
    const cap = plan.cap / k, shut = plan.shut;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (key) phoneLock = { key, cap, shut, data: full, fig: phoneFig };   // (data: at full size, as the check above measures it)
    return cap;
  }
  // The stacked data card's fixed block sizes, largest first (the words beside them stay at Compact: card-type.js WIDE).
  const DK = [0.9, 0.8, 0.7, 0.6];
  // The data card's height at width w (page px) under the words: as it would stand there, at full size (unfitted).
  // A header's Show or Hide keeps its title clear by the chip's own width, not a fixed 64 or 66 px: a larger text size grows the chip,
  // and a title once ran under it (DOPPLER, TH at 200 % on a 390 px phone). Its words' width goes to the stylesheet in ems of the
  // header's own type (--pz-chip-em, the wider of Show and Hide), so the room never changes with the card's zoom or a tap.
  // (Measured from Inter's own advances and kerning, text-gl.js, the font the GPU draws words from: no 2D canvas. Until those are
  // here, the first card uses a wide guess, 0.68 em a letter, and is measured again once they arrive.)
  let chipWait = false;
  function chipRoom(dd) {
    const f = dd.querySelector('.pz-dh > .pz-fold');
    if (!f) return;
    const cs = readStyle(f), fs = parseFloat(cs.fontSize) || 0, ls = parseFloat(cs.letterSpacing) || 0;
    if (!fs) return;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (!glyphsReady() && !chipWait) { chipWait = true; loadGlyphs().then(() => restPass(() => { if (live.ui && !live.ui.data.hidden) chipRoom(live.ui.data); })).catch(() => {}); }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const w = Math.max(...['Show', 'Hide'].map((t) => {
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const x = cs.textTransform === 'uppercase' ? t.toUpperCase() : t;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      return (glyphsReady() ? textWidth(x, { weight: cs.fontWeight, size: fs }) : x.length * fs * 0.68) + ls * x.length;
    }));
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    dd.style.setProperty('--pz-chip-em', (w / fs).toFixed(3));
  }
  function colHeight(w, dk = 1) {
    // (Unfitted, its zoom (--pz-z) cleared with the fit: kept, the card measured at the last fit's zoom, so the words' step depended on
    // what was fitted before (a live text-size change took a larger title than a fresh load at that size).)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const d = live.ui.data, ds = d.style, sv = [d.className, ds.width, ds.maxHeight, ds.getPropertyValue('--pz-fit'), ds.getPropertyValue('--pz-dk'), ds.getPropertyValue('--pz-z'), ds.getPropertyValue('--pz-u')];
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    d.classList.add('col'); if (dk < 1) ds.setProperty('--pz-dk', dk); else ds.removeProperty('--pz-dk'); ds.width = `${w}px`; ds.maxHeight = 'none'; ds.removeProperty('--pz-fit'); ds.removeProperty('--pz-z');
    // (A stacked card with its readings tucked, their card's foot below it: the room it keeps; brought out, the pair rises to make room for
    // them where the screen is short, slip.lift.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const sheet = d.classList.contains('pz-sheet'), parts = sheet ? [...d.children].filter((c) => c.matches('.pz-tiles')) : [], was = parts.map((c) => c.style.display);
    if (sheet) { d.classList.remove('tool-open', 'pz-sliding'); ds.removeProperty('--pz-u'); for (const c of parts) c.style.display = 'none'; }
    const hh = readMetric(d, 'offsetHeight') + (sheet ? LIP : 0);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    parts.forEach((c, i) => { c.style.display = was[i]; });
    d.className = sv[0]; ds.width = sv[1]; ds.maxHeight = sv[2]; if (sv[3]) ds.setProperty('--pz-fit', sv[3]); if (sv[4]) ds.setProperty('--pz-dk', sv[4]); else ds.removeProperty('--pz-dk'); if (sv[5]) ds.setProperty('--pz-z', sv[5]); if (sv[6]) ds.setProperty('--pz-u', sv[6]);
    live.ui.lipMO?.takeRecords();
    return hh;
  }
  function freeRects() {
    if (!live.ui || phone()) return null;
    const wr = readBox(wrap), W = wr.width, H = wr.height, k = W / (readMetric(wrap, 'clientWidth') || W) || 1, G = 12;
    const obs = [], d = live.ui.data;
    let dk = null, pill = null;
    if (!d.hidden && !('gone' in d.dataset) && !d.classList.contains('under') && !d.classList.contains('col')) {
      const x = readMetric(d, 'offsetLeft') + dock.to * dockVec()[0];
      obs.push(dk = { l: x * k, t: readMetric(d, 'offsetTop') * k, r: (x + readMetric(d, 'offsetWidth')) * k, b: (readMetric(d, 'offsetTop') + readMetric(d, 'offsetHeight') + (lipOn(d) ? LIP : 0)) * k });   // (and its sheet's edge below it, .pz-lip)
    }
    if (!live.ui.bar.hidden && readMetric(live.ui.bar, 'offsetWidth')) { const q = readBox(live.ui.bar); obs.push(pill = { l: q.left - wr.left, t: q.top - wr.top, r: q.right - wr.left, b: q.bottom - wr.top }); }
    // (The colour key stands on the pill: the two are one obstacle. Measured where it will show, even before it fades in.)
    if (pill && live.ui.fk.dataset.empty == null) {
      const f = live.ui.fk, was = f.hidden; f.hidden = false; const q = readBox(f); f.hidden = was;
      if (q.width) { pill.t = Math.min(pill.t, q.top - wr.top); pill.l = Math.min(pill.l, q.left - wr.left); }
    }
    // Each obstacle splits a rectangle it overlaps into the open parts left, right, above and below it.
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const split = (q, o) => (o.r <= q.l || o.l >= q.r || o.b <= q.t || o.t >= q.b ? [q]
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      : [{ ...q, r: o.l - G }, { ...q, l: o.r + G }, { ...q, b: o.t - G }, { ...q, t: o.b + G }].filter((x) => x.r - x.l > 0 && x.b - x.t > 0));
    // First choice: the space between the words' card and the data card, full height (clear of the controls), so a subject
    // sits centred between the cards rather than in the strip under a short corner card.
    const ok = (q) => q.r - q.l >= 200 && q.b - q.t >= 150;
    let mid = [{ l: live.frameL, t: 0, r: dk ? dk.l - G : W, b: H }];
    if (pill) mid = mid.flatMap((q) => split(q, pill));
    // (Marked pref: the camera uses the rest only for a box too big for these at its widest zoom.)
    mid = mid.filter(ok).map((q) => ({ ...q, pref: true }));
    let out = [{ l: live.frameL, t: 0, r: W, b: H }];
    for (const o of obs) out = out.flatMap((q) => split(q, o));
    return [...mid, ...out.filter(ok)];
  }
  stage.setFreeArea(freeRects);
  // (A face that arrives after a card was fitted changes its words' size, not its box (a phone's card is held to a cap): the words' plan and the
  // phone's cap, each kept per slide, and every card's fit are dropped, so all of them are made afresh with the face that is there now. PC-1.)
  const onFonts = () => {
    if (!live.ui) return;
    live.textLock = null; phoneLock = null;
    for (const el of [live.ui.text, live.ui.data, live.ui.panel]) fitDone.delete(el);
    if (thrown()) layoutAtLanding(); else layout();
  };   // (R14: a font that arrives while the cards come in refits them once, when they have landed)   // (R14: a font that arrives while the cards come in refits them once, when they have landed)
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  const cardSig = () => (live.ui ? [live.ui.text, live.ui.data].map((el) => (el.hidden ? '-' : ((r) => [r.left, r.top, r.width, r.height].map((v) => Math.round(v / 4)).join())(readBox(el)))).join('|') : '');
  function reframe(ms) {
    const s = figOf(live.shown.i);
    // (In a talk that opts in (deck keepPinch), a view the learner pinched, dragged or zoomed stays: a card that changed size, a dock or a settling sheet does not pull it back to the
    // slide's framing. Next, Back, a jump, Fit and a turn of the device frame it again: they clear the hand, stage.handClear / the slide's own move.)
    if (live.deck?.keepPinch && stage.handMoved?.() && !live.booting) return;
    // (Under the start's cover the framing is set outright: unseen, a glide only kept the reveal waiting, or was caught by it.)
    const cam = s.visual ? s.cam : s.cam || 'fit';
    // (A slide with no framing of its own (the outline, a table) leaves the figure at the stage's fit, which follows the cards:
    // under the cover that fit is set outright too. Left to the stage, it followed the outline's card only after the reveal, on
    // a busy page in one frame: the figure stood behind where the words had been, then jumped to the middle.)
    if (live.booting && !cam && !store.get().lobule) { stage.fitSlow(0); return; }
    stage.carryProbe?.();   // (a refit to the cards, not a new slide's framing: a Doppler probe that shows rides it out)
    fitAround(s, cam, live.booting ? 0 : ms);
  }
  // The view follows the stacked card's readings' card frame by frame as they come out or tuck away, under the finger or on their own
  // ease (stage.js followAt; Mohammad, 30 Oct, iPhone: "The view still snaps/jumps when I untuck a stacked card"): the framing for them
  // tucked and for them out are worked out once (stage.aimView, the slide's own camera asked where it would go), and liftTo sets the view
  // between the two at the share the card has travelled. Only for a slide framed at the fit or on a box, its view standing still at that
  // framing; a catheter, a procedure's shot, a time-lapse's push, the lobule, a zoomed card, a dock moving or reduced motion keep the
  // refit glide (foldReframe, foldStill). (Mac and iPad landscape: the figure's column is the same tucked or out, the two framings agree,
  // and nothing follows.)
  // (camSlide: the slide the view follows a card on; a move to another slide ends it, so the card put back for the new slide never takes
  // the view back to the old slide's framing.)
  let camSlide = -1, camSlideGen = -1;   // (the slide's index and generation, as numbers: camAt runs every frame of a slide and builds no key)
  const camAt = (u) => { if (!stage.following?.()) return; if (camSlide === live.want && camSlideGen === live.gen && live.shown?.i === live.want) stage.followAt(u); else stage.followEnd?.(); };
  const camKind = () => { const s = figOf(live.shown.i); return s.visual ? s.cam : s.cam || 'fit'; };
  const camFollowOk = () => !!live.ui && !!live.shown && live.shown.i === live.want && live.shown.gen === live.gen && !(live.busy && !live.playing) && !live.leaving && !live.booting && !reduce.matches
    && dock.to === 0 && dock.lvl === 0 && !zoomOn() && !live.reframeT && !(live.deck?.keepPinch && stage.handMoved?.()) && !(cath.on && cath.cam) && !live.procRun?.running
    // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
    && !(live.push && live.push.i === live.shown.i && live.push.until > performance.now()) && !store.get().lobule && ((c) => !!c && !LOBULE_CAM.test(c))(camKind());
  // (Where the slide's camera would frame the cards as they stand now: the handle placed at the card's foot first, as it rests.)
  // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
  const camAim = () => { placeLip(); const s = figOf(live.shown.i); return stage.aimView?.(() => frameTo(camKind(), s, 400, { steady: true })); };
  // From the view now, framed for the readings as they rest (open: out), to the framing for the cards as they stand now (the other state).
  function camFollow(vNow, open) {
    const vTo = camAim();
    if (!vNow || !vTo || !stage.follow?.(open ? vNow : vTo, open ? vTo : vNow)) return false;
    stage.carryProbe?.();   // (a Doppler probe that shows rides it out)
    camSlide = live.shown.i; camSlideGen = live.shown.gen; live.framedSig = cardSig();
    return true;
  }
  // A finger takes the readings' card at rest: the framing for the other state is worked out with the card turned to it for the measure
  // only (its class and its handle, put back before anything is drawn), so the view can follow the finger from the first move.
  // (Decided as the finger takes the card; the measure is a rest pass right after the move that took it, never inside a touch move:
  // the card measured as it rests, its slide's class off for the measure and back before anything is drawn. The view follows from then.)
  let camGrabT = 0;
  function camGrab() {
    const d = live.ui?.data;
    if (!d || stage.following?.() || !camFollowOk() || d.classList.contains('pz-sliding')) return;
    cancelRest(camGrabT); camGrabT = restPass(camGrabNow);
  }
  function camGrabNow() {
    const d = live.ui?.data;
    if (!d || stage.following?.() || !camFollowOk()) return;
    const vNow = stage.viewNow?.();
    if (!vNow) return;
    const open = d.classList.contains('tool-open'), sliding = d.classList.contains('pz-sliding');
    if (sliding) d.classList.remove('pz-sliding');
    d.classList.toggle('tool-open', !open);
    let vOther;
    try { vOther = camAim(); } finally { d.classList.toggle('tool-open', open); if (sliding) d.classList.add('pz-sliding'); placeLip(); live.ui.lipMO?.takeRecords(); }
    if (vOther && stage.follow?.(open ? vOther : vNow, open ? vNow : vOther)) { stage.carryProbe?.(); camSlide = live.shown.i; camSlideGen = live.shown.gen; }
  }
  // The camera eases to fit a slide's framing into the space its cards leave (the lobule refits itself on pps:occ).
  function fitAround(s, cam, ms) {
    live.framedSig = cardSig();
    // (Steady: timed so a slow frame at its start holds the glide back instead of carrying it part of the way at once, glide-clock.js.)
    // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
    if (cath.on && cath.cam) stage.cathFocus(cath.cam, ms, { both: true, steady: true });
    else if (live.procRun?.refit(ms)) return;   // (a procedure holds its own shot: the cards changing frame that shot again)
    else if (cam && !LOBULE_CAM.test(cam) && !store.get().lobule) {
      // (While a time-lapse pushes, a refit (the cards moved, the screen turned) keeps pushing, to the new fit, over the seconds left.)
      const left = live.push && live.push.i === live.shown?.i ? live.push.until - performance.now() : 0;
      // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
      frameTo(cam, s, left > 0 ? left : ms, left > 0 ? { drift: true } : { steady: true });
    }
  }
  return { camAt, camFollow, camFollowOk, camGrab, cardMoving, cardSig, cardsStill, cellReady, cellTap, insets, insetsGo, insetsHold, layout, layoutAtLanding, onFonts, paintZoom, reframe, thrown, zoomBehind, zoomCredit, zoomFolds, zoomFollow, zoomHeld, zoomOn, zoomReady, zoomSettled, zoomToggle };
}
