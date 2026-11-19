// The data card slides out of view; the card zoomed
// (moved out of presenter.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { clippedBy, isClipped } from './card-clip.js';
import { COMPACT, SIDEWAYS_MAX_H, WORDS_MIN_PX, fitMins } from './card-type.js';
import { D_SMALL, D_SURFACE, EASE_ARRIVE, easeOut3 } from './ease.js';
import { flowTimeHeight } from './flow-time.js';
import { slideFold } from './fold-slide.js';
import { fontGen, onFontsLoaded } from './font-arrival.js';
import { cancelFrame, easeNow } from './frame.js';
import { readBox, readCTM, readMetric, readRects, readStyle } from './layout-snap.js';
import { toolRoomOf } from './tool-room.js';
import { wordsOf } from './live-text.js';
import { reduceMotionMQ as reduce } from './motion.js';
import { cancelRest, restPass } from './rest-pass.js';
import { EXT, safe } from './slide-ext.js';
import { checkText } from './presenter-words.js';
import { SHORT_SIDE_MQ, STACK_MQ, TABLET_UP_MQ, clamp, h } from './util.js';

export function createZoom(st, live) {
  const { app, ctxOf, degrade, degraded, ease, laddersGrid, layout, nextFrame, quadrantVisual, reframe, rowsOf, scaleVisual, summaryTable, wallsVisual, wrap } = st;
  // (A visual a deck visuals package registers (slide-ext.js visuals) is called with the slide and its context; the app's own win.)
  const visualOf = (s, i) => (VISUALS[s.visual] ? VISUALS[s.visual](s) : safe(() => EXT.visuals[s.visual](s, ctxOf(s, i)), null, `visuals.${s.visual}`));
  const VISUALS = {
    table: summaryTable,
    ladders: laddersGrid,
    scale: (s) => scaleVisual(s.scale, rowsOf(s)),
    quadrant: (s) => quadrantVisual(rowsOf(s)),
    walls: () => wallsVisual(),
    // The closing quick check: a few questions to answer from memory; a tap on one shows its answer.
    check: (s) => h('ol', { class: 'pz-check' }, s.checks.map(([q, a], k) => {
      const li = h('li', {}, h('button', { type: 'button', class: 'pzc-q', 'aria-expanded': 'false', 'aria-controls': `pzc-a${k}`,
        // (the answer slides down out from under its question and the rest of the list with it, by transform: fold-slide.js)
        onclick: (e) => { const on = !li.classList.contains('open'); e.currentTarget.setAttribute('aria-expanded', String(on)); slideFold({ item: li, inner: li.querySelector('.pzc-a > p'), root: li.parentElement?.parentElement, open: on, set: (v) => li.classList.toggle('open', v), ms: D_SURFACE }); } },
      h('span', { class: 'pzc-t' }, checkText(q)), h('span', { class: 'pzc-hint', 'aria-hidden': 'true' }, 'Show answer')),
      h('div', { class: 'pzc-a', id: `pzc-a${k}` }, h('p', {}, checkText(a))));
      return li;
    })),
    outline: (s) => h('div', { class: 'pz-outline' },
      h('section', {}, h('h2', { class: 'pz-sub' }, 'Outline'), h('ol', {}, s.outline.map((k) => h('li', {}, k)))),
      s.objectives.length ? h('section', { class: 'pzo-obj' }, h('h2', { class: 'pz-sub' }, 'By the end you can'), h('ul', {}, s.objectives.map((o) => h('li', {}, o)))) : null),
  };
  // ── Layout: what the slide's words and data cover, so the figure frames itself in the rest ──
  // An upright phone, or a tablet held upright, stacks the words under the figure and the data card over it; a tablet on its
  // side and any phone on its side keep the words at the left and the data card at the right (a small phone on its side had
  // no height for the two stacked). An upright tablet's cards take 70% of the width (class `tab`), centred.
  // (The same breakpoints as the style sheet's (util.js): a 700–767 px window or a near-square upright one stacked by the CSS
  // while these said wide, and the text card took the wrong fit floor and Compact step.)
  const stackMQ = matchMedia(STACK_MQ), shortMQ = matchMedia(SHORT_SIDE_MQ), tabMQ = matchMedia(TABLET_UP_MQ);
  const tabUp = () => tabMQ.matches;
  const phone = () => stackMQ.matches && !shortMQ.matches;
  // Which pill the screen takes (paintChrome): a phone's, an upright tablet's (with back and next) or a wide screen's.
  const pillKind = () => (phone() ? (tabUp() ? 'tab' : 'phone') : 'wide');
  // ── The data card slides out of view and back ──
  // Drag or swipe it away (up on a phone, to the right on a tablet; to the left when it sits under the words) and a sliver
  // stays at the edge: a tap or a drag on the sliver brings it back. It follows the finger, eases to rest, and stays put from
  // slide to slide until brought back. (Driven from script, frame by frame: the card is frosted glass.)
  const GRIP = 34;
  // On a laptop or tablet, and on a phone held sideways (I23, 17 Oct), the words sit on a floating card like the data card (false:
  // the full-height glass panel at the left edge). (An upright phone keeps its words' panel at the foot either way.)
  const TEXT_CARD = true;
  const SHORT_H = 860;   // (a wider screen this tall or less takes the compact layout, .pz.short: css px)
  const LOW_M = 10;   // (a phone held sideways: its teaching card's margin from the top and bottom, css px; styles/app.css .pz.low)
  // (auto: closed by the layout, a slide whose card does not fit beside the words and the figure; autoKey: the slide it closed on.
  // A card the reader closed stays closed from slide to slide; one the layout closed opens again on the next slide that fits.)
  // (down: on an upright phone or tablet, the slide whose readings' card was just tucked away by a tap on the handle, so the next tap closes
  // the instrument card; cleared when the card opens again and by a new slide.)
  // (lvl: how far out the card is docked, 0 open, 1 closed. During a glide the browser plays it (an animation of the card's translate, on the
  // compositor, dockGlide), and lvl is read from that animation's clock, so no script runs per frame; a finger, a resize or a new glide
  // takes it from there (dockHalt).)
  let lvlSet = 0, glide = null;
  const dock = { get lvl() { return glide ? glideLvl() : lvlSet; }, set lvl(v) { if (glide) dockHalt(); lvlSet = v; }, to: 0, raf: 0, auto: false, autoKey: '', down: -1 };
  // A phone's instrument card with readings shows the instrument first and keeps its tiles (or pressure strip) on a sheet tucked
  // under it: the sheet's edge (LIP px, .pz-lip) shows below the card and carries the handle (Mohammad, 17 Oct: "round 2 A"; "I thought
  // the Doppler will show first with an indication for a card under it?"). Pulled down or tapped, the sheet comes out flush with
  // the card; pushed up, the card slides away to its handle. No Show or Hide.
  const LIP = 24;
  const lipOn = (d) => d.classList.contains('pz-sheet') && !d.classList.contains('tool-open');
  // An upright phone or tablet opens the readings on a card of their own under the instrument's (Mohammad, 17 Oct: "The top data
  // card doesn't truly open as an extended card under the Doppler. It should. ... first close up is to close this under side card";
  // the iPhone too, 17 Oct): the one card's glass is drawn as two pieces (styles/app.css .pz.stack.stack .pz-sheet), the
  // instrument's and the readings'. A push up, or a tap on the handle, from fully open tucks the readings' card away; the next closes
  // the instrument card. A pull down on the closed card brings the instrument card out, and the same pull carried on brings the
  // readings' card out after it (dockTouch, sheetPull: "if I keep sliding I can open both in one swipe").
  // (Mac and iPad landscape too, the data card stacked under the words (pz-wide): the same two cards, its readings' card out as a slide
  // comes in (Mohammad, 22 Oct: "is there a way to build something similar for mac and ipad, stacked card to show the main card and the
  // stacked card behind it"). There the readings' card is tucked behind the instrument card's top edge, its handle on top, and comes out
  // upward: the words' card rises with it and comes back down as it tucks away (Mohammad, 22 Oct: "make so I open the stacked card untuck
  // it to the TOP not to the bottom. Cuz that's easier to pull up and the teaching card goes up"; slip.lift, liftTo).)
  const splitSheet = (d) => !!live.ui && (live.ui.root.classList.contains('stack') || live.ui.root.classList.contains('pz-wide')) && d.classList.contains('pz-sheet');
  const wideSheet = (d) => !!live.ui?.root.classList.contains('pz-wide') && d.classList.contains('pz-sheet');
  // The readings' card slides out from behind the instrument card and back under it, one solid piece (Mohammad, 17 Oct: "The secondary
  // card should actually be hidden underneath the other card not just pop into existence"): --pz-u on the card is how far out it is,
  // set frame by frame by the finger or here, never by a CSS transition (the card is frosted glass); styles/app.css works out both
  // pieces of glass, the readings' place and where they are cut at the instrument card's foot from it. (d: how far it travels, the
  // readings' share of the card's height; h0: the card's height with them tucked, css px; raf: the ease running.)
  const slip = { d: null, h0: null, raf: 0, lift: 0, base: 0 };
  // (Mac and iPad landscape: the stacked card's height cap is the room under the words and its readings' card's tucked edge, grown by what
  // is out of the readings (--pz-grow, styles/app.css), so the instrument is fitted to the tucked room and keeps that size open or tucked.)
  // (A Gut to heart chart too tall for it grows the cap by slip.base, the room the pair rises by: below.)
  // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
  const capOf = (d, room) => (wideSheet(d) ? `calc(${(room + slip.base).toFixed(1)}px + var(--pz-grow, 0px))` : `${room.toFixed(1)}px`);
  // (The rise, frame by frame with the readings' card: u of the way out lifts the words' card, its glass and the data card's box by u of
  // slip.lift, the readings' travel (layout), so the instrument card stays where it is and the readings come out above it; tucking them
  // brings everything back down the same way. A translate, never their top, which eases on its own.)
  // (slip.base: the rise a Gut to heart chart needs whatever the readings do, its tucked card being taller than the room under the words; the
  // readings add the rest of slip.lift on top, by u.)
  // (Two rises: --pz-lift, the readings' travel, carries the box and the handle, so the instrument card stays put; --pz-rise, the words' card
  // and its glass, is LIP less of the readings' travel: the readings' card already shows its LIP-px edge above the instrument card tucked, so
  // out it needs LIP less than the instrument card's rise to stand the same gap under the words, tucked or out (Mohammad, 22 Oct: "the distance
  // between the untucked and tucked card and teaching card should remain consistent"; it was LIP more out, about 110 px beside 60 px.))
  // (Written on the cards that rise, never on the stage's box: a custom property there is inherited by the whole figure, so each frame of
  // a slide restyled every vessel, and the stage, which watches its box's style, dropped its style snapshot and synced every vessel again,
  // about 10 frames a second on a Mac, Mohammad, 25 Oct: "moving the cards up sliding tucking untucking is very very laggy".)
  // (The glass's view of those rises (glass-gl.js cards.shift): where app.css turns --pz-rise and --pz-lift into a translate, the move they
  // make, from the inline value as written this frame; null where no rule moves the element.)
  // (Cards are glass (Mohammad, 2 Nov 2026: "CARDS ARE GLASS"): a card zoomed up (card-zoom.js data-zoomed) keeps its GPU frost, its panes read
  // at the zoom's scale (sheet-glass.js) and again in each frame of its glide (glass-gl.js LIVE_READ); the words, their glass and the stage's
  // labels step out from under it (app.css .pz-zoomed), so only the frosted figure lies behind it.)
  const risePx = (el, name) => parseFloat(el.style.getPropertyValue(name)) || 0;
  const riseShift = (el) => {
    if (!live.ui) return null;
    const wide = live.ui.root.classList.contains('pz-wide');
    const v = el === live.ui.shade ? (el.classList.contains('pz-card') && !el.classList.contains('stack') && !el.classList.contains('low') ? risePx(el, '--pz-rise') : 0)
      : el === live.ui.text ? (wide ? risePx(el, '--pz-rise') : 0)
        : el === live.ui.data ? (wide && el.classList.contains('col') ? risePx(el, '--pz-lift') : 0) : 0;
    return v ? [0, -v] : null;
  };
  // (The two cards a rise is written on, kept and refilled in place: a rise is written every frame the readings slide.)
  const riseOn = (() => {
    const lift = [null, null], words = [null, null];
    return (name) => { if (name === '--pz-lift') { lift[0] = live.ui?.data; lift[1] = live.ui?.lip; return lift; } words[0] = live.ui?.text; words[1] = live.ui?.shade; return words; };
  })();
  const setRise = (name, w) => { const v = w > 0.5 ? `${w.toFixed(1)}px` : ''; for (const el of riseOn(name)) if (el && el.style.getPropertyValue(name) !== v) { if (v) el.style.setProperty(name, v); else el.style.removeProperty(name); } };
  // (The words' card while a card is zoomed: it stays at its tucked, original place, whatever the readings do under the zoom, and the rise
  // owed to them is taken up once the card is back (Mohammad, 28 Oct: "when the stacked cards are zoomed in and i untuck the stacked card, the
  // TEACHING card in the background is reacting still by going up; ... if the stack is unstacked, and i zoom into it, the teaching card should go
  // back to original location"). words.held: the zoom is up, so the words' rise is slip.base alone; u, trav: the readings' last place and travel
  // (liftTo), what the rise is once released; now: the rise as written.)
  // (A change of that rise that is the zoom's, not a finger's or a slide's, is eased by wordsGlide: the rise is written at once, where it ends,
  // and the card's translate is animated from where it stands to it, in step with the zoom's glide. A rise written per frame by liftTo takes
  // the glide's place.)
  const words = { held: false, u: 0, trav: 0, now: 0, anims: [] };
  const wordsAt = () => slip.base + (words.held ? 0 : words.u) * Math.max(0, words.trav - LIP);
  const stopWords = () => { for (const a of words.anims) a.cancel(); words.anims.length = 0; };
  const setWords = (w) => { if (Math.abs(w - words.now) > 0.5) stopWords(); words.now = w; setRise('--pz-rise', w); };
  function wordsGlide(ms) {
    const to = wordsAt(), els = [live.ui?.text, live.ui?.shade].filter(Boolean), from = els.map((el) => readStyle(el).translate), moves = Math.abs(to - words.now) > 0.5;
    stopWords();
    words.now = to; setRise('--pz-rise', to);
    if (!ms || !moves) return;
    slideTell();
    els.forEach((el, i) => {
      const a = el.animate?.([{ translate: from[i] }, { translate: readStyle(el).translate }], { duration: ms, easing: EASE_ARRIVE });
      if (!a) return;
      words.anims.push(a);
      a.onfinish = () => { if (words.anims.includes(a)) { words.anims = words.anims.filter((x) => x !== a); if (!words.anims.length) dispatchEvent(new Event('pps:occ')); } };
    });
  }
  const slideFrame = new Event('pps:slideframe');   // (the glass reads the readings' card's panes in this frame: glass-gl.js onSlideFrame)
  const liftTo = (u) => { const trav = Math.max(0, slip.lift - slip.base), f = u > 0 ? u : 0; setRise('--pz-lift', slip.base + f * trav); words.u = f; words.trav = trav; setWords(wordsAt()); live.zoomFollow(f, trav); };
  // (Told when the readings' card starts to move, so the Doppler probe is placed against the cards frame by frame as they go: stage.js dprTrack.)
  const slideTell = () => dispatchEvent(new Event('pps:slide'));
  const underU = (d) => (d.classList.contains('pz-sliding') ? parseFloat(d.style.getPropertyValue('--pz-u')) || 0 : d.classList.contains('tool-open') ? 1 : 0);
  function slideUnder(from, to, ms = 360) {
    const d = live.ui.data;
    cancelFrame(slip.raf);
    if (reduce.matches) ms = 0; else ms *= Math.max(0.4, Math.abs(to - from));
    // alloc-rare: the readings slide begins: once per slide of the card, not per frame
    d.classList.add('pz-sliding'); d.style.setProperty('--pz-u', from.toFixed(4)); liftTo(from); slideTell(); live.camAt(from);   // (camAt: the view with the card, camFollow)
    const t0 = performance.now();
    // alloc-rare: the readings slide begins: once per slide of the card, not per frame
    const step = (now) => {
      const t = ms ? clamp((now - t0) / ms, 0, 1) : 1;
      if (t < 1) { const u = from + (to - from) * easeOut3(t); d.style.setProperty('--pz-u', u.toFixed(4)); liftTo(u); live.camAt(u); slip.raf = nextFrame(step); }
      else stopUnder();
      dispatchEvent(slideFrame);
    };
    slip.raf = nextFrame(step);
  }
  // (At rest the card's class says where the readings are: tool-open, out.)
  function stopUnder() {
    cancelFrame(slip.raf);
    if (!live.ui?.data.classList.contains('pz-sliding')) return;
    live.ui.data.style.removeProperty('--pz-u'); live.ui.data.classList.remove('pz-sliding'); liftTo(underU(live.ui.data)); live.camAt(underU(live.ui.data));
  }
  // How far the readings' card travels: the card's height with them out less its height without them, read in the card's own px (its
  // parts are zoomed by the fit, so their own boxes are not read). (--pz-o: a second part's place under the first, for its cut.)
  function measureUnder(d) {
    // (Never while the card is zoomed to the middle: it answers for the place it rests, so with the readings in and out it reads the same
    // height, their travel comes out none, --pz-d 0, and their room opens above the header: a big empty card running off the bottom. It is
    // measured again the moment the card is back, zoomSettled.)
    if (live.zoomOn()) return;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const parts = [...d.children].filter((c) => c.matches('.pz-tiles') && readStyle(c).display !== 'none');
    if (!parts.length || !readRects(d).length) return;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const kw = readBox(wrap).width / (readMetric(wrap, 'clientWidth') || 1) || 1, hh = () => readBox(d).height / kw;
    // (Without the card's height cap, which is the tucked card's: out, the card is fitted again. The card's own style changes only
    // for the measure, so its watcher is not told: told, it measured again, for ever.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const was = parts.map((c) => c.style.cssText), cap = d.style.maxHeight;
    d.style.maxHeight = 'none';
    parts[0].style.marginTop = wideSheet(d) ? '16px' : '14px';   // (out: styles/app.css)
    // (A part after the first rides under it with no travel of its own: the bleed clock's row, removed 30 Oct. Measured with the card's --pz-d in its
    // margin, the travel read back changed the travel, every write of --pz-d told the watcher again, and the page froze: Variceal bleed 3 to 4.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    for (const c of parts.slice(1)) c.style.marginTop = '0px';
    const h1 = hh(), z = (parseFloat(readStyle(parts[0]).zoom) || 1) * kw;
    const o = parts[1] ? (readBox(parts[1]).top - readBox(parts[0]).top) / z : 0;
    for (const c of parts) c.style.display = 'none';
    const h0 = hh();
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    parts.forEach((c, i) => { c.style.cssText = was[i]; });
    d.style.maxHeight = cap; live.ui.lipMO?.takeRecords();
    slip.h0 = h0;
    // (Judged against the card's own --pz-d, never only the last measure: a deck started again builds a new card, and one whose
    // readings travel as far as the last deck's had none, so its readings' card stood out unpulled: Liver inflow 2, 18 Oct.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (Math.abs((slip.d ?? -1) - (h1 - h0)) > 0.05 || !d.style.getPropertyValue('--pz-d')) { slip.d = h1 - h0; d.style.setProperty('--pz-d', `${slip.d.toFixed(2)}px`); }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (parts[1] && parts[1].style.getPropertyValue('--pz-o') !== `${o.toFixed(2)}px`) parts[1].style.setProperty('--pz-o', `${o.toFixed(2)}px`);
  }
  // The screen's right safe-area inset, read once from a zero-size probe (an unregistered custom property hands env() back unresolved) and again after a resize.
  let insetRight = null, insetLeft = null;
  addEventListener('resize', () => { insetRight = null; insetLeft = null; });
  // (The left one too: a phone on its side keeps its cards clear of the Dynamic Island, 3 Nov 2026.)
  const insetL = () => {
    if (insetLeft == null) {
      const p = document.createElement('div');
      p.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left,0px)';
      document.body.append(p); insetLeft = parseFloat(readStyle(p).paddingLeft) || 0; p.remove();
    }
    return insetLeft;
  };
  const insetR = () => {
    if (insetRight == null) {
      const p = document.createElement('div');
      p.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none;padding-right:env(safe-area-inset-right,0px)';
      document.body.append(p); insetRight = parseFloat(readStyle(p).paddingRight) || 0; p.remove();
    }
    return insetRight;
  };
  const dockVec = () => {
    const d = live.ui.data;
    // alloc-rare: read at rest as a dock glide starts or a finger lands: once per gesture, not per move
    if (phone()) return [0, GRIP - (lipOn(d) ? LIP : 0) - (readMetric(d, 'offsetTop') + readMetric(d, 'offsetHeight'))];   // (closed: the sheet's edge and 10 px of the card show)
    // alloc-rare: read at rest as a dock glide starts or a finger lands: once per gesture, not per move
    if (d.classList.contains('under') || d.classList.contains('col')) return [GRIP - (readMetric(d, 'offsetLeft') + readMetric(d, 'offsetWidth')), 0];
    // (A phone on its side: the strip that stays on show, and its handle, sit inside the island's or notch's inset, not under it.)
    // alloc-rare: read at rest as a dock glide starts or a finger lands: once per gesture, not per move
    return [readMetric(wrap, 'clientWidth') - GRIP - (live.ui.root.classList.contains('low') ? insetR() : 0) - readMetric(d, 'offsetLeft'), 0];
  };
  // (Where the closed card goes, read at rest: by the layout, as a glide starts and as a finger lands. A glide's or a drag's frames
  // only write transforms from it, never read the page. Its offsets are the card's resting box: its translate never changes them.)
  // alloc-rare: read at rest as a dock glide starts or a finger lands: once per gesture, not per move
  const dockRest = () => (dock.vec = live.ui && !live.ui.data.hidden ? dockVec() : [0, 0]);
  const DOCK_ZERO = [0, 0];
  let rtEl = null, rtX = NaN, rtY = NaN, rtTo = NaN;   // (dockPaint: the rest place last written, and on which card)
  // (A wide screen's stacked pair keeps its rise, --pz-lift, while the card docks: styles/app.css.)
  const dockPos = (lv) => {
    const vec = dock.vec || DOCK_ZERO, x = vec[0], y = vec[1];
    const ly = wideSheet(live.ui.data) ? ' - var(--pz-lift, 0px)' : '';
    // alloc-rare: a place for the card is written at rest, as a glide starts or lands or a finger moves it, never per frame of a glide
    return lv ? `${(x * lv).toFixed(1)}px ${ly ? `calc(${(y * lv).toFixed(1)}px${ly})` : `${(y * lv).toFixed(1)}px`}` : '';
  };
  const dockPaint = () => {
    if (!live.ui) return;
    const vec = dock.vec || DOCK_ZERO, x = vec[0], y = vec[1];
    // (During a glide the card's place is where the frames have it now: glideStep writes it each frame.)
    live.ui.data.style.translate = dockPos(dock.lvl);
    // (Where the glide ends: the camera frames for the card there, util.js translateRest, never where it stands this frame.)
    // (Where it ends is written when the card, its place or its target changes, not on each frame of a glide or a drag.)
    if (rtEl !== live.ui.data || rtX !== x || rtY !== y || rtTo !== dock.to) {
      rtEl = live.ui.data; rtX = x; rtY = y; rtTo = dock.to;
      // alloc-rare: only when the card, its rest place or its target changed
      live.ui.data.dataset.restTranslate = `${(x * dock.to).toFixed(1)} ${(y * dock.to).toFixed(1)}`;
    }
    live.ui.data.classList.toggle('docked', dock.to === 1);
    dockFade(dock.to === 1);
    lipPaint();
  };
  // A closed card shows only its glass edge and handle: its contents fade out as it goes and back in as it comes out (the sliver
  // had shown the cut-off foot of its readings, under the preview badge too). By the Web Animations API, over the parts' own
  // transitions; a part that arrives while the card is closed (the next slide's) is faded at once.
  const DOCK_FADE = { duration: D_SMALL, easing: EASE_ARRIVE, fill: 'forwards' };
  // (Under a finger the contents follow the card instead: fully there once it is a third of the way out, so a slow pull shows the
  // chart as it comes, never an empty glass until the finger lets go (Mohammad, 1 Nov 2026: "it's empty before it renders"). A paused
  // animation held at the drag's level, so neither the parts' own transitions nor a frame's lag come between the finger and them.)
  const dockShows = () => clamp((1 - dock.lvl) / 0.35, 0, 1);
  function dockFade(shut) {
    for (const c of live.ui.data.children) {
      if (c.classList.contains('pz-grip') || !c.animate) continue;
      if (dock.drag) {
        if (!c._dockHand) {
          if (c._dockFade) { c._dockFade.cancel(); c._dockFade = null; }
          // alloc-rare: the card docks or undocks, or a drag begins: once per change of state, not per frame
          c._dockHand = c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, fill: 'both' }); c._dockHand.pause();   // (linear: its time is the drag's level)
        }
        c._dockHand.currentTime = dockShows() * D_SMALL;
        continue;
      }
      let from = null;
      if (c._dockHand) { from = dockShows(); c._dockHand.cancel(); c._dockHand = null; }
      // alloc-rare: the card docks or undocks, or a drag begins: once per change of state, not per frame
      if (shut && !c._dockFade) c._dockFade = c.animate([{ opacity: from ?? 1 }, { opacity: 0 }], { ...DOCK_FADE, duration: from == null && dock.lvl > 0.5 ? 0 : DOCK_FADE.duration });
      // alloc-rare: the card docks or undocks, or a drag begins: once per change of state, not per frame
      else if (!shut && c._dockFade) { c._dockFade.cancel(); c._dockFade = null; c.animate([{ opacity: 0 }, { opacity: 1 }], { ...DOCK_FADE, fill: 'none' }); }
      // alloc-rare: the card docks or undocks, or a drag begins: once per change of state, not per frame
      else if (!shut && from != null && from < 1) c.animate([{ opacity: from }, { opacity: 1 }], { ...DOCK_FADE, fill: 'none' });
    }
  }
  // The sheet's edge is the card's sibling, not its child: inside the card, the card's glass clipped it away on an iPhone (802e093,
  // no edge and no handle under Doppler 7). It stands at the card's foot at the card's width, and moves with the card's own drag.
  function placeLip() {
    const d = live.ui?.data, l = live.ui?.lip;
    if (!l || d.hidden || !d.classList.contains('pz-sheet')) return;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const px = (v) => `${v.toFixed(1)}px`;
    const split = splitSheet(d), open = d.classList.contains('tool-open'), sliding = d.classList.contains('pz-sliding');
    // (Read before the writes below, with the card at rest, open or closed: it never changes while the card docks. Skipped while
    // closed, a slide that came in with its card closed kept its readings in the card's flow and the whole card shrank to fit them,
    // to 74 % on Varices 3 at 375 x 667, until it was opened.)
    if (split && !sliding && dock.lvl === dock.to) measureUnder(d);
    const u = sliding ? parseFloat(d.style.getPropertyValue('--pz-u')) || 0 : 0;
    // (Sliding, at the readings' card's foot to the fraction of a px: the card's own box height is whole px.)
    // (Mac and iPad landscape: over the card's top, in the readings' card's top edge, tucked or out; the rise, --pz-lift, carries it up.)
    const ut = wideSheet(d) ? (sliding ? u : open ? 1 : 0) : 0;
    l.style.left = px(readMetric(d, 'offsetLeft')); l.style.width = px(readMetric(d, 'offsetWidth')); l.style.top = px(wideSheet(d) ? readMetric(d, 'offsetTop') - LIP * (1 - ut) : readMetric(d, 'offsetTop') + (sliding && slip.h0 != null ? slip.h0 + u * slip.d : readMetric(d, 'offsetHeight')));
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (sliding) l.style.setProperty('--pz-u', u.toFixed(4)); else l.style.removeProperty('--pz-u');
    // (Fully open on a phone the edge sits 24 px up, in the card's foot (app.css margin-top, taken at once): the step it makes is eased by a
    // transform from where it stood, on the compositor, never by the margin, a layout each frame.)
    const step = open && !wideSheet(d);
    if (live.lipStep != null && step !== live.lipStep && !l.hidden && !d.classList.contains('pz-hide') && !sliding && !reduce.matches)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      l.animate?.([{ transform: `translateY(${step ? LIP : -LIP}px)` }, { transform: 'translateY(0)' }], { duration: D_SURFACE, easing: EASE_ARRIVE, composite: 'add' });
    live.lipStep = step;
    lipPaint();
  }
  // (The edge's part of a dock glide's or a drag's frame: it moves with the card's translate and names what a tap on it does. Its
  // place and size are set at rest, placeLip, where nothing moves: nothing is read here.)
  function lipPaint() {
    const d = live.ui?.data, l = live.ui?.lip;
    if (!l || d.hidden || !d.classList.contains('pz-sheet')) return;
    const split = splitSheet(d), open = d.classList.contains('tool-open');
    l.style.translate = d.style.translate; l.dataset.restTranslate = d.dataset.restTranslate ?? '0 0';
    const say = dock.to === 1 ? 'Open the card' : wideSheet(d) ? (open ? 'Hide the readings' : 'Show the readings') : open ? (split ? 'Hide the readings' : 'Close the card') : split && dock.down === live.want ? 'Close the card' : 'Show the rest of the card';
    if (l.getAttribute('aria-label') !== say) l.setAttribute('aria-label', say);
  }
  // The dock glide: the card's translate (and its handle's) written by the frames, on the eases' clock, in the frame the GPU glass reads
  // them in (3 Nov 2026, cards trailing: as one animation each the browser's compositor moved the card from a clock of its own, which
  // can stand a display frame from the page's time, so the glass and the card parted by that frame, 0 or 1 of them from run to run).
  // One string a frame for the card and its handle, the same; no style is read and nothing else is written. The glass takes the inline
  // translate (glass-gl.js moveOf), so the two never part.
  function glideLvl() {
    const g = glide, u = g.ms > 0 ? clamp((easeNow() - g.t0) / g.ms, 0, 1) : 1;
    return g.from + (g.to - g.from) * ease(u);
  }
  // alloc-rare: one string a frame for the card and its handle while a dock glide plays (the translate's text takes the card's place, which no table can hold)
  const glideText = (lv) => { const v = dock.vec || DOCK_ZERO; return `${(v[0] * lv).toFixed(1)}px ${(v[1] * lv).toFixed(1)}px`; };
  function glideStep() {
    dock.raf = 0;
    const g = glide;
    if (!g || !live.ui) return;
    const u = g.ms > 0 ? clamp((easeNow() - g.t0) / g.ms, 0, 1) : 1;
    if (u >= 1) { glideDone(); return; }
    const t = glideText(g.from + (g.to - g.from) * ease(u));
    live.ui.data.style.translate = t;
    if (g.lip && live.ui.lip) live.ui.lip.style.translate = t;
    dock.raf = nextFrame(glideStep);
  }
  // The glide over, where it was going.
  function glideEnd() {
    const g = glide;
    if (!g) return;
    cancelFrame(dock.raf); dock.raf = 0;
    glide = null; lvlSet = g.to;
    if (live.ui) { live.ui.data.style.translate = dockPos(g.to); lipPaint(); }
  }
  const lipSoon = () => live.ui && placeLip();   // (kept: a glide's landing makes no closure)
  const glideDone = () => { if (!glide) return; glideEnd(); dock.rest = restPass(lipSoon); };   // (landed: the edge measured where the card now rests, between frames)
  /** Whatever glide is under way ends here, the card where it now stands (a finger, a resize or a new glide takes it from there). */
  function dockHalt() {
    cancelFrame(dock.raf); dock.raf = 0;
    const g = glide;
    if (!g) return;
    const v = glideLvl();
    glide = null; lvlSet = v;
    if (live.ui) { live.ui.data.style.translate = dockPos(v); lipPaint(); }
  }
  function dockGlide(from, to, ms) {
    const d = live.ui.data, l = live.ui.lip;
    // alloc-rare: a dock glide begins: once per glide, not per frame
    glide = { from, to, ms, t0: easeNow(), lip: !!(l && d.classList.contains('pz-sheet')) };
    dock.raf = nextFrame(glideStep);
  }
  function dockTo(to, ms = 380) {
    dockHalt();
    dock.to = to;
    if (!to) dock.down = -1;
    // (Closed from either open state; it opens again on its first step, the sheet tucked under it.)
    if (to === 1 && live.ui?.data.classList.contains('pz-sheet') && live.ui.data.classList.contains('tool-open')) live.ui.setFold(false);
    if (reduce.matches) ms = 0;
    const from = dock.lvl, t0 = performance.now();
    dockRest();
    cancelRest(dock.rest);
    if (ms && from !== to && live.ui && !live.ui.data.hidden && !wideSheet(live.ui.data)) {
      dockGlide(from, to, ms);
      dockPaint();
    } else {
      // (No glide to play, a reduced-motion jump or a wide screen's, which keeps its rise in the translate: stepped by the frames as before.)
      // alloc-rare: a dock glide begins or lands: once per glide, not per step
      const step = (now) => {
        const u = ms ? clamp((now - t0) / ms, 0, 1) : 1;
        lvlSet = from + (to - from) * ease(u);
        dockPaint();
        if (u < 1) dock.raf = nextFrame(step);
        // alloc-rare: a dock glide begins or lands: once per glide, not per step
        else dock.rest = restPass(lipSoon);   // (landed: the edge measured where the card now rests, between frames)
      };
      dock.raf = nextFrame(step);
    }
    layout();   // (the figure frames itself for where the card is going)
    // (V-FIT: and the camera sets off now, on the card's own clock, not once the card's fit pass has run 60 ms on; that pass then finds the camera
    // already headed to the same view. Not while a slide comes in or goes, or a resize is still settling: they frame it themselves.)
    if (live.ui && live.shown && live.shown.i === live.want && live.shown.gen === live.gen && !(live.busy && !live.playing) && !live.leaving && !live.booting && !live.reframeT && !live.zoomOn()) reframe(ms);
    // alloc-rare: a dock glide begins or lands: once per glide, not per step
    clearTimeout(dock.fit); dock.fit = setTimeout(() => restPass(fitRest), 60);
  }
  // (The card's fit lays the chrome out again as a task between frames (rest-pass.js), never in the timer's own turn.)
  function fitRest() { if (live.ui) live.onResize(); }
  // A slide whose data card does not fit (phoneTextCap, lowData) comes in closed, its handle showing, never folded to its header
  // behind Show; the next slide that fits brings it back. (After the pass that asked: dockTo lays the cards out again.)
  function autoDock(shut) {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const key = `${live.gen}:${live.want}`, d = live.ui.data, ms = d.classList.contains('pz-hide') || d.hidden ? 0 : 380;
    // (Never while the reader's finger or a fold is moving the card: their pull opens the readings, it never closes the card.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (shut && dock.to === 0 && dock.autoKey !== key && !dock.drag && !d.classList.contains('pz-sliding') && !('folding' in d.dataset)) { dock.autoKey = key; dock.auto = true; queueMicrotask(() => live.ui && dockTo(1, ms)); }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    else if (!shut && dock.auto && dock.to === 1) { dock.auto = false; queueMicrotask(() => live.ui && dockTo(0, ms)); }
  }
  // A phone on its side: a table card's title that ends clear of the deck's tab stands level with it, the tab in the corner beside
  // it, not under it (the six site rows of Sites 10 at 667 x 375 lost their last row to the tab's height). Decided once a slide,
  // and given up for good on the slide should the fitted title reach the tab (then fitted again under it). True while it stands beside.
  let besideKey = '', besideNo = '';
  function tabBeside() {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const pn = live.ui.panel, key = `${live.gen}:${live.want}`, tb = pn.classList.contains('tabbed') && pn.querySelector(':scope > .pz-tabname'), t1 = pn.querySelector(':scope > .pz-ph > .pz-h');
    let on = false;
    if (tb && t1 && besideNo !== key) {
      const rg = document.createRange(); rg.selectNodeContents(t1);
      const clear = readBox(rg).right <= readBox(tb).left - 8;
      if (clear) { on = true; besideKey = key; } else if (besideKey === key) { besideNo = key; besideKey = ''; }
    }
    pn.classList.toggle('tab-beside', on);
    return on;
  }
  // The cards never scroll: when a card's contents are taller or wider than the card, their zoom (--pz-fit) drops until they fit.
  // The height is summed from the children's own boxes (a slide-up does not change a box's height), never read from
  // scrollHeight: WebKit keeps an entry shift's overflow there after the shift has eased away, so the words fitted
  // once at their size and then, on the next layout, shrank. (So a card is judged by where its contents come to rest.)
  const RAIL = '.pz:not(.stack):not(.low) .pz-data.pz-beside';   // (styles/app.css: the tiles stacked beside the instrument)
  function overflowOf(el) {
    const cvs = [...el.querySelectorAll('canvas.trace-gl, canvas.wgl')].map((c) => [c, c.style.display, (c.style.display = 'none')]); try {   // (read with the GPU's picture canvases out of the layout, put back below: trace-gl is laid wider than its box and cut by clip-path, wgl hangs an 18 px pad, and scrollWidth and scrollHeight counted both, so cards with a slider or chart zoomed their words to the floor, Mac 5 Nov 2026)
    const cs = readStyle(el), z = readMetric(el, 'offsetHeight') ? readBox(el).height / readMetric(el, 'offsetHeight') : 1;
    let used = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0), n = 0;
    // (An instrument with its tiles beside it shares one row with them: the row is counted once, at its taller side.)
    // (Only while the tool shows beside the tiles: folded, the tiles stand in their row alone, counted like any part.)
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const rail = el.matches(RAIL), pair = rail && [...el.querySelectorAll(':scope > .pz-tool')].some((c) => readStyle(c).display !== 'none'), side = pair && el.querySelector(':scope > .pz-tiles');
    // (A wide screen's summary table clips what is wider than it, so the card's own scrollWidth never sees it: read from the table, in the
    // card's pixels. The fit then zooms the card until every column is in view. A phone's rows are a grid that fits its width by itself.)
    const wideTable = !live.ui.root.classList.contains('stack');
    const bigText = parseFloat(readStyle(live.ui.root).getPropertyValue('--ts')) > 1.001;   // (only a larger text setting can outgrow a phone's columns)
    let sideways = 0;
    for (const c of el.children) {
      if (c === side) continue;
      const s = readStyle(c);
      if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed') continue;
      if (s.maxHeight === '0px') continue;   // (a folded part, a phone's closed tool: its hidden contents are not overflow)
      const cz = parseFloat(s.zoom) || 1;
      if (wideTable && c.classList.contains('pz-table')) sideways = Math.max(sideways, (readMetric(c, 'scrollWidth') - readMetric(c, 'clientWidth')) * cz);
      // (A phone's grid rows fit their width at the standard text size; at a large one a reading on the reference row can outgrow its
      // column, which the table's clip hides from the card, so the first row's readings are measured and the fit zooms for them.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      else if (bigText && c.classList.contains('pz-table')) for (const td of c.querySelectorAll('tbody tr:first-child td.num')) sideways = Math.max(sideways, (readMetric(td, 'scrollWidth') - readMetric(td, 'clientWidth') - 1) * cz);
      // (A part with a height cap clips by design, and mid-fold its clipped contents are not overflow either: counting them
      // shrank the card while a phone's tool folded, and the shrunk fit then stuck.)
      // (A line's glyphs or a pinned button reaching a pixel or two past its part is not overflow: counted, it shrank every
      // phone instrument card by the fit loop's full eight steps, its words to 0.86.)
      // (The tiles' numbers each have a GPU picture that reaches past its tile, and its size follows the number: the tiles' own
      // scroll height is no overflow either. Counted, a number changing in a drag zoomed the whole card down to half, 7 Nov.)
      // (A card's header grows with its words; only its Show chip's tap area reaches past it, and that is no overflow: counted,
      // it shrank a phone's folded data card to half, its chip to 19 px.)
      const clip = s.maxHeight !== 'none' || c.classList.contains('pz-dh') || c.classList.contains('pz-tiles') ? 0 : Math.max(0, readMetric(c, 'scrollHeight') - readMetric(c, 'clientHeight') - 3);
      // A protected time chart eases to its allocated height. Fit against its destination, so the old height
      // during that ease cannot shrink the card's words and start another fit/resize cycle.
      const chartH = el.classList.contains('pz-flowfit') && c.matches('.pz-tool[data-kind="flowtime"]') ? parseFloat(el.style.getPropertyValue('--ft-room')) : 0;
      used += (chartH || Math.max(readBox(c).height, side && c.classList.contains('pz-tool') ? readBox(side).height : 0) / z) + ((parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0) + clip) * cz;
      n++;
    }
    used += (parseFloat(cs.rowGap) || 0) * Math.max(0, n - 1);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    return { v: used - readMetric(el, 'clientHeight'), h: Math.max(readMetric(el, 'scrollWidth') - readMetric(el, 'clientWidth'), sideways) };
  } finally { for (const [c, d] of cvs) c.style.display = d; } }
  // What a card's fit depends on: its box, its words (digits alike, so a number that eases fits as before) and which parts show.
  // (The readings' plate being out or tucked is not in it, and neither is the data card's live text, only the slide: the card's box is fixed once fitted.)
  // A card whose signature is unchanged keeps its fit without being measured again (measuring forces layouts mid-animation).
  // (A card holding the quick check grows as its answers ease open and shut; it was fitted with every answer open, so its own
  // height is left out (the window's stands in): refitting mid-ease cut the easing short and jolted the words' size.)
  // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
  const fitSig = (el) => `f${fontGen()}|${readMetric(el, 'clientWidth')}x${el.querySelector('.pz-check') ? `q${innerWidth}x${innerHeight}` : readMetric(el, 'clientHeight')}|${el.className.replace(/ ?\b(?:tool-open|pz-sliding|pz-zoomable)\b/g, '')}|${el.style.maxHeight}|${document.documentElement.style.cssText}|${el.style.getPropertyValue('--pz-reach')},${el.style.getPropertyValue('--pz-fkrow')}|${[...el.children].map((c) => (c.hidden ? 0 : c.className + (c.classList.contains('pz-tool') || readStyle(c).maxHeight !== 'none' ? ':' + readMetric(c, 'offsetHeight') : ''))).join()}|${el === live.ui?.data ? `s${live.want}` : (el.querySelector('.pzv') ? wordsOf(el) : el.textContent).replace(/\d/g, '0')}`;
  const fitDone = new WeakMap(), smOf = new WeakMap();
  // A card that ends its fit with words still cut off is recorded by slide and card (degrade 'card-clipped:<slide>:<card>', the ?perf paste),
  // once per fit, never while the cards move (a part mid-slide is not where it rests). The fit's own floor and the capped parts it ignores
  // are why a card can still clip; nothing said so before. PC-2.
  const clipSeen = new WeakMap(), clipQ = new Set();
  let clipAsk = 0;
  const clipSoon = (el) => {
    clipQ.add(el);
    if (clipAsk) return;
    const u = live.ui;
    clipAsk = restPass(() => {
      clipAsk = 0;
      const els = [...clipQ]; clipQ.clear();
      if (live.ui !== u || !u || live.cardMoving()) return;
      for (const c of els) {
        if (c.hidden || c.classList.contains('pz-hide') || 'gone' in c.dataset || 'folding' in c.dataset) continue;
        const key = `${live.want}|${fitSig(c)}`;
        if (clipSeen.get(c) === key) continue;
        clipSeen.set(c, key);
        const o = overflowOf(c), w = clippedBy(c);
        if (o.v > 1 || o.h > 1 || isClipped(w)) {
          const why = `card-clipped:${live.slides[live.want]?.id ?? live.want}:${c === live.ui.text ? 'text' : c === live.ui.data ? 'data' : 'panel'}`;
          if (!degraded.clipped.includes(why)) degraded.clipped.push(why);
          degrade(why);
        }
      }
    });
  };
  // A narrow summary table's column heads are 12 px, never smaller: a row whose columns are too narrow for the words in one line
  // sets them upright (tr.th-up, turned to read from the bottom), one way for the whole row. (The phone and upright-tablet layouts read it.)
  // On an upright iPad a head fits when its word keeps 3 px clear of its column's edges, so two neighbours are never closer than 6 px: an
  // iPad mini's nine columns had WHVP and FHVP, SAAG and PROT., touching. A phone's rule is as it was: the word inside its column.
  const headFits = (th) => { const b = readBox(th), g = document.createRange(), m = live.ui.root.classList.contains('tab') ? 2.5 : -0.5; g.selectNodeContents(th); return [...readRects(g)].every((q) => !q.width || (q.left >= b.left + m && q.right <= b.right - m)); };
  function fitHeadRow(tr) {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const ths = [...tr.querySelectorAll('th.num')];
    if (!ths.length || !readBox(tr).width) return;
    tr.classList.remove('th-up');
    if (!ths.every(headFits)) tr.classList.add('th-up');
  }
  // (Fitted again when the row's width settles or the web fonts arrive: a fit made mid-layout or in a fallback font would stay too small.)
  let headRO = null;
  function fitHeads(el) {
    if (!headRO) {
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      headRO = new ResizeObserver((es) => { for (const e of es) fitHeadRow(e.target); });
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      onFontsLoaded(() => restPass(() => document.querySelectorAll('.pz-table thead tr').forEach(fitHeadRow)));
    }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    for (const tr of el.querySelectorAll('.pz-table thead tr')) { headRO.observe(tr); fitHeadRow(tr); }
  }
  // An equation never runs past its card: one wider than its box is set smaller (--eq-k, the share of its size that fits).
  // (Measured at the card's final zoom; the math is a block of its own, so its box is the room the card gives it.)
  function fitEquations(el) {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    for (const box of el.querySelectorAll('.pz-eq')) {
      box.style.removeProperty('--eq-k');
      let k = 1;
      for (let n = 0; n < 4; n++) {
        const w = readMetric(box, 'clientWidth'), over = readMetric(box, 'scrollWidth') - w;
        if (!w || over <= 0.5) break;
        k = Math.max(0.4, k * (w / (w + over)) * 0.99);
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        box.style.setProperty('--eq-k', k.toFixed(3));
      }
    }
  }
  // (An equation typeset before the math font arrives is wider or narrower than it ends up: onFonts drops every card's fit, and fitCards fits its equations again.)
  // A phone on its side: its data card's lettering never under 12 px on the screen (critique I1, 17 Oct: it had zoomed to 8 px,
  // Varices 7, TIPS 3 and 11, Stiffness 4 and 8, Circuit 5). A card too tall for its room first stands its tiles tighter (.pz-lt:
  // less padding, the numbers a step smaller; .pz-lt2: smaller again, the names and units at their size), then zooms only as far as
  // its smallest lettering allows, then comes in closed at the right, its edge and handle showing, as an upright phone's does
  // (autoDock; never folded to its header behind Show). Brought back, or opened fully, it zooms to fit as a last resort: the
  // reader asked for it, over the figure. Returns the smallest zoom the fit may take.
  // (One probe for the caption size, built with the presenter and moved in and out of the card being fitted: no node made per fit.)
  const smProbe = h('span', { style: 'position:absolute;visibility:hidden;font-size:var(--pz-sm, 12px)' });
  const capProbe = h('span', { style: 'position:absolute;visibility:hidden;font-size:var(--s-cap)' });
  function lowData(el) {
    const pr = capProbe; el.append(pr);
    const cap = parseFloat(readStyle(pr).fontSize) || 12; pr.remove();
    const floor = cap > 12 ? Math.ceil(12 / cap * 1000) / 1000 : 1;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const fits = () => { const o = overflowOf(el); return o.v <= 1 && o.h <= 1; };
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const chosen = el.classList.contains('tool-open') && el.dataset.openFor === String(live.want);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const done = (shut, z) => { autoDock(shut); return z; };
    el.classList.remove('pz-lt', 'pz-lt2');
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    for (const c of ['pz-lt', 'pz-lt2']) { if (fits()) return done(false, floor); el.classList.add(c); }
    if (chosen) return 0.5;
    if (fits()) return done(false, floor);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    if (floor < 1) { el.style.setProperty('--pz-fit', String(floor)); const ok = fits(); el.style.removeProperty('--pz-fit'); if (ok) return done(false, floor); }
    return done(!!el.querySelector(':scope > :not(.pz-dh):not(.pz-grip):not(.pz-lip)'), 0.5);
  }
  // A wide screen too short for its cards, an iPad on its side or a short Mac window (.pz.short, layout): a card too tall for its room
  // first stands tighter (.pz-lt: less padding, its tiles and table rows closer; .pz-lt2: a table's row on one line), then zooms only
  // as far as its smallest lettering stays 12 px on the screen (glitch hunt, 22 Oct: cards zoomed to half there, about 300 pieces of
  // text down to 7 px). Returns the smallest zoom the fit may take for that. (A card that still does not fit zooms further only as a
  // last resort, fitCards, rather than run out of its card.)
  function shortFit(el) {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const fits = () => { const o = overflowOf(el); return o.v <= 1 && o.h <= 1; };
    el.classList.remove('pz-lt', 'pz-lt2');
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    for (const c of ['pz-lt', 'pz-lt2']) { if (fits()) break; el.classList.add(c); }
    return textFloor(el);
  }
  // The smallest zoom that keeps a card's smallest lettering at 12 px on the screen (1 when it is already at or under that).
  function textFloor(el) {
    const px = minText(el);
    return px > 12 && isFinite(px) ? Math.ceil(12 / px * 1000) / 1000 : 1;
  }
  // The words' card (a wide screen): the smallest zoom its smallest lettering allows at 12 px on the screen, at least a half (1 where there is
  // none to give: the usual text size), and its height at a zoom (css px, held to no cap), for the pair that is too tall (layout).
  function wordsFloor() {
    const ts = live.ui.text.style, sv = ts.getPropertyValue('--pz-fit');
    ts.removeProperty('--pz-fit');
    const px = minText(live.ui.text);
    if (sv) ts.setProperty('--pz-fit', sv);
    return px > 12 && isFinite(px) ? Math.max(0.5, Math.ceil(12 / px * 1000) / 1000) : 1;
  }
  function wordsHeightAt(z) {
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const ts = live.ui.text.style, sv = [ts.maxHeight, ts.getPropertyValue('--pz-fit'), ts.getPropertyValue('--pz-z')];
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    ts.maxHeight = 'none'; ts.removeProperty('--pz-z'); ts.setProperty('--pz-fit', String(z));
    const v = readMetric(live.ui.text, 'offsetHeight');
    ts.maxHeight = sv[0]; if (sv[1]) ts.setProperty('--pz-fit', sv[1]); else ts.removeProperty('--pz-fit'); if (sv[2]) ts.setProperty('--pz-z', sv[2]);
    return v;
  }
  // The smallest lettering in a card as it reaches the screen: its font size times every zoom on its way (the card's own, its parts',
  // the interface's), or an SVG's drawn scale. (As tests/e2e/text-floor.mjs measures it.)
  // (zoomed: only the lettering the card's fit (--pz-fit) can change. A data card's instrument is never zoomed (styles/app-05-presenter-cards.css: .pz-data > .pz-tool[data-kind] { zoom: 1 }); the fit
  // shortens only its pictures. Its own lettering held the floor at the 12 px its words already stand at, so the fit stopped at 0.82 with the pictures still 54 px too tall, 19 Nov 2026.)
  function minText(el, zoomed = false) {
    let min = Infinity;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      const e = n.parentElement;
      if (zoomed && e?.closest('.pz-tool[data-kind]')) continue;
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (!e || !n.textContent.trim() || !readRects(e).length) continue;
      const fs = parseFloat(readStyle(e).fontSize);
      if (!fs) continue;
      let k = 1;
      if (e instanceof SVGElement) { const m = readCTM(e); if (m) k = Math.hypot(m.a, m.b); }
      else for (let a = e; a; a = a.parentElement) k *= parseFloat(readStyle(a).zoom) || 1;
      min = Math.min(min, fs * k);
    }
    return min;
  }
  // The room a data card's instrument has for its pictures (--pz-room, px): the card's height cap less its padding and every other part it holds (the header, its gaps).
  // Every instrument sizes its picture against it, not against the window: a window-share budget (path's 0.55 of the height) ignored where the card stands under
  // the words, so the pictures ran 10 to 74 px past the card on a short Mac and an iPad (19 Nov 2026). Not the instrument's own height: it never enters its own budget.
  const roomSeen = new WeakMap();
  function toolRoom(el) {
    if (el !== live.ui.data) return;
    const tool = el.querySelector(':scope > .pz-tool[data-kind]');
    const cap = parseFloat(el.style.maxHeight) || parseFloat(readStyle(el).maxHeight);
    if (!tool || !(cap > 0) || live.ui.root.classList.contains('stack') || readStyle(tool).display === 'none') {
      if (roomSeen.delete(el)) { el.style.removeProperty('--pz-room'); live.ui.tools?.refit(); }
      return;
    }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const cs = readStyle(el), z = readMetric(el, 'offsetHeight') ? readBox(el).height / readMetric(el, 'offsetHeight') : 1, parts = [];
    let rows = 0;
    for (const c of el.children) {
      const s = readStyle(c);
      if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed') continue;
      rows++;
      if (c !== tool) parts.push(readBox(c).height / z + ((parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0)) * (parseFloat(s.zoom) || 1));
    }
    const room = toolRoomOf({ cap, rows, parts, gap: parseFloat(cs.rowGap) || 0, pad: ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((a, k) => a + (parseFloat(cs[k]) || 0), 0) });
    if (roomSeen.get(el) === room) return;
    roomSeen.set(el, room);
    el.style.setProperty('--pz-room', `${room}px`);
    live.ui.tools?.refit();   // (a picture drawn by the page's own code, the path card, lays out again for the room it has now)
  }
  function fitFlowTime(el) {
    if (el !== live.ui.data) return;
    const chart = el.querySelector(':scope > .pz-tool[data-kind="flowtime"] > .pz-flowtime');
    const eligible = chart && el.classList.contains('tool-only') && live.ui.root.classList.contains('pz-wide') && !live.ui.root.classList.contains('stack') && !live.ui.root.classList.contains('low');
    el.classList.toggle('pz-flowfit', !!eligible);
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const clear = () => { el.style.removeProperty('--ft-room'); el.style.removeProperty('--ft-card'); };
    if (!eligible) { clear(); return; }
    // Measure at full width, without the previous fit. The chart's own height never enters its budget.
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const cs = readStyle(el), px = (v) => parseFloat(v) || 0;
    const z = readMetric(el, 'offsetWidth') ? readBox(el).width / readMetric(el, 'offsetWidth') : 1;
    const f = Math.max(px(readStyle(chart).fontSize), 12 / (z || 1));
    let chrome = px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth), n = 0;
    for (const c of el.children) {
      const s = readStyle(c);
      if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed') continue;
      const cz = parseFloat(s.zoom) || 1;
      chrome += (c === chart.parentElement ? 0 : readBox(c).height / (z || 1)) + (px(s.marginTop) + px(s.marginBottom)) * cz;
      n++;
    }
    chrome += px(cs.rowGap) * Math.max(0, n - 1);
    const room = parseFloat(cs.maxHeight) - chrome - 1;
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    const h = flowTimeHeight(readMetric(chart, 'clientWidth'), f, room, chart.dataset.lines.split(','), px(readStyle(chart).getPropertyValue('--band-room'))).height;
    if (h == null) { el.classList.remove('pz-flowfit'); clear(); }
    // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
    else { el.style.setProperty('--ft-room', `${h.toFixed(2)}px`); el.style.setProperty('--ft-card', `${(h + chrome).toFixed(2)}px`); }
  }
  // The least the data card's fit may be (17 Nov 2026, the tester: its labels fell to 10.3 px at 1440 x 780): its smallest lettering as it reaches the screen at a fit of 1 shrinks no further than 12 px; a card
  // whose lettering is not above 12 px at a fit of 1 keeps the old floor, half.
  function dataFloor(el) {
    const L = minText(el, true);
    return L > 12 ? Math.max(0.5, Math.ceil(12 / L * 1000) / 1000) : 0.5;
  }
  function fitCards(...els) {
    live.shuffle?.park();   // (no card is measured through the shuffle's own transform)
    try { fitEach(els); } finally { live.shuffle?.resume(); }
  }
  function fitEach(els) {
    let refit = false;
    for (const el of els) {
      if (!el || el.hidden || 'folding' in el.dataset) continue;   // (a part mid-fold: the card keeps the fit it will rest with)
      // (A readings card of tiles alone, while a what-if slider or a compare button moves its numbers: its size is the one it came in with.
      // A tile that measured taller for a moment (a number changing its length, a rating's word) was read as overflow, the card zoomed down
      // to half and the tiles shrank in the middle of a drag, Circuit "Cirrhosis raises the resistance" on a Mac, 7 Nov. A resize, a turn or a new
      // slide deletes the fit first (fitDone), so they still fit it afresh.)
      if (el === live.ui?.data && el.classList.contains('tiles-only') && !el.querySelector(':scope > .pz-tool') && fitDone.has(el) && live.cardsStill()) continue;
      const sig = fitSig(el);
      if (fitDone.get(el) === sig) { clipSoon(el); continue; }
      const was = parseFloat(el.style.getPropertyValue('--pz-fit')) || 1;
      el.style.removeProperty('--pz-fit'); el.style.removeProperty('--pz-z');
      // (The stacked card is fitted with its readings' card tucked, against the tucked cap, whatever state it is in: the instrument holds
      // one size open or tucked, and nothing the fit reads comes from the fit before it. Its readings' travel (--pz-d) is measured at each trial
      // fit, so the tucked card nets its readings out exactly, and once more at the fit it ends with.)
      const split = el === live.ui.data && splitSheet(el);
      const wasOpen = split && el.classList.contains('tool-open'), wasU = split ? el.style.getPropertyValue('--pz-u') : '';
      if (split) { el.classList.remove('tool-open'); if (wasU) el.style.setProperty('--pz-u', '0'); }
      const ovOf = (e) => { if (split) measureUnder(e); return overflowOf(e); };
      // (A tablet's narrow data card: its own grid changes, which a container query on the card cannot do.)
      if (el.classList.contains('pz-data')) el.classList.toggle('pz-narrow', readMetric(el, 'offsetWidth') > 0 && readMetric(el, 'offsetWidth') < 420);
      // (A tile's name in full when it fits on one line in its tile, else its short form: Liver flow, Protein ...)
      // (All read in one layout, then written: the tiles' columns are equal shares of the row, so one tile's short name never
      // changes another's room. Read and written tile by tile, each read laid the card out again.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const allNames = [...el.querySelectorAll('.pz-tiles .pzt-k')];
      for (const k of allNames) k.classList.remove('wrap');
      const names = [...el.querySelectorAll('.pz-tiles .pzt-k[data-s]')];
      for (const k of names) k.classList.remove('short');
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const shorts = names.filter((k) => { const t = k.parentElement, cs = readStyle(t), room = readMetric(t, 'clientWidth') - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); return room > 0 && readMetric(k, 'scrollWidth') > room + 0.5; });
      for (const k of shorts) k.classList.add('short');
      // (A name still wider than its tile in its short form (or with none) wraps onto a second line, balanced, rather than run out of the tile
      // on both sides: "Liver blood flow, % of healthy" had clipped into its neighbour on a Mac at 1024. Read once more, after the short forms.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const wraps = allNames.filter((k) => { const t = k.parentElement, cs = readStyle(t), room = readMetric(t, 'clientWidth') - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); return room > 0 && readMetric(k, 'scrollWidth') > room + 0.5; });
      for (const k of wraps) k.classList.add('wrap');
      // (A scale bar's cut-off numbers stay inside the bar, and where two would come within 8 px of each other the bar shows none of
      // them: sweep batch 03, 0.1 and 1.5 sat 6 px apart and read as one, and a lone survivor read as a mystery value (critique D2,
      // 17 Oct). The coloured bands still show where the cut-offs fall.)
      // (Every bar's numbers read in one layout and then written. A number is centred on its cut-off (translate −50 %); .lo sets it
      // to start there (0) and .hi to end there (−100 %), a shift of half its width, worked out rather than measured again.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const bars = [...el.querySelectorAll('.pz-tiles .pzt-bar')].map((bar) => ({ bar, ls: [...bar.querySelectorAll('.pzb-l')] }));
      for (const { ls } of bars) for (const l of ls) l.classList.remove('lo', 'hi', 'off');
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      for (const b of bars) { b.B = readBox(b.bar); b.rs = b.ls.map((l) => readBox(l)); }
      for (const { B, ls, rs } of bars) {
        let end = -Infinity, clash = false;
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        ls.forEach((l, i) => {
          const r = rs[i];
          if (!r.width) return;
          let left = r.left, right = r.right;
          if (r.left < B.left) { l.classList.add('lo'); left += r.width / 2; right += r.width / 2; } else if (r.right > B.right) { l.classList.add('hi'); left -= r.width / 2; right -= r.width / 2; }
          if (left < end + 8) clash = true; else end = right;
        });
        if (clash) for (const l of ls) l.classList.add('off');
      }
      // (A row of tiles whose bars show no cut-off number keeps no empty row for them under the bars: on a phone that row stood empty
      // under HVPG's bar (5 and 10 too close to number) and, the tiles one height, under WHVP's and FHVP's too, Sites 3 on an iPhone,
      // 20 Oct, where the stacked cards ran into the words. Decided by the bars' widths only, so a tile never resizes as its numbers change.)
      // (Widths only, which the numbers' classes above do not change: the bars' and numbers' read before, then each row written.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const rowW = new Map(bars.map((b) => [b.bar, b]));
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      for (const row of el.querySelectorAll('.pz-tiles')) {
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        const rb = [...row.querySelectorAll('.pzt-bar')].map((b) => rowW.get(b));
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        if (!rb.length || rb.some((b) => !b?.B.width)) continue;
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        row.classList.toggle('pzb-nonum', !rb.some((b) => b.ls.some((l, i) => !l.classList.contains('off') && b.rs[i].width)));
      }
      fitHeads(el);
      // (CRD-1, bible review 19 Nov 2026: the instrument's room is taken here, after the tile names' short and wrapped forms, the bars' numbers and the head rows have been decided: it used to be taken
      // first, so a name that wrapped afterwards made the header a line taller than the room assumed and the instrument ran that line past its card.)
      fitFlowTime(el);
      toolRoom(el);
      // (A quick check is fitted with every answer open: its words keep one size however many are revealed.)
      const all = el.querySelector('.pz-check'); all?.classList.add('pzc-all', 'pzc-still');
      // (A phone's words never fit below 12 px: the card's height cap leaves them that room, phoneTextCap.)
      // (A phone's words, upright or on its side, and an upright iPad's: two fixed sizes, Regular or Compact (card-type.js), the whole
      // card at once, so its title always reads larger than its words and its buttons never larger (Mohammad, 19 Oct: "Two fixed
      // sizes"; the title had stepped down first and the buttons not at all, so all of them met at 12 to 14 px). Only a slide that
      // does not fit even at Compact goes further, to 12 px on the screen, and on its side, where no cap keeps that room, past it as a
      // last resort rather than run out of its card.)
      const small = el === live.ui.text && (phone() || live.ui.root.classList.contains('low'));
      const lowFloor = el === live.ui.data && live.ui.root.classList.contains('low') ? lowData(el) : 0;
      const shortFloor = !small && !lowFloor && live.ui.root.classList.contains('short') ? shortFit(el) : 0;
      if (!shortFloor && !lowFloor) el.classList.remove('pz-lt', 'pz-lt2');   // (a card left tight by a shorter window)
      // (A summary table on a wide screen, too wide or too tall for its card, also zooms only as far as its lettering stays 12 px at first,
      // the compact layout's rule, before it may go past that as a last resort rather than scroll: it never scrolls.)
      const tableFloor = !small && !lowFloor && !shortFloor && el === live.ui.panel && !live.ui.root.classList.contains('stack') && el.querySelector(':scope > .pz-table') ? textFloor(el) : 0;
      const ln = small || el === live.ui.text ? el.querySelector('.pz-line, p') : null, lb = ln ? parseFloat(readStyle(ln).fontSize) : 0;
      const sidePhone = innerHeight <= SIDEWAYS_MAX_H && innerWidth > innerHeight;
      const floor = lb > 12 ? Math.ceil(12 / lb * 1000) / 1000 : (el === live.ui.text ? 1 : dataFloor(el));   // (the words on every device stop at 12 px on the screen, at the deck size; the data card's lettering too, below)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const mins = [lowFloor || floor];
      if (shortFloor > mins[0]) mins.unshift(shortFloor);   // (the compact layout's 12 px first; past it only as a last resort)
      else if (tableFloor > mins[0]) mins.unshift(tableFloor);
      // (A phone on its side: the outline panel keeps its 12 px; its layout makes the room, styles/app-05-presenter-cards.css: card-type.js fitMins.)
      const sideways = el === live.ui.panel && sidePhone && !!el.querySelector(':scope > .pz-outline, :scope > .pz-visual > .pz-outline');
      if (sideways) mins.splice(0, mins.length, ...fitMins(mins, shortFloor || tableFloor || textFloor(el), true));
      let k = 1, over = 1;   // (over: the largest fit tried that still overflowed)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const fits = () => { const o = ovOf(el); return o.v <= 1 && o.h <= 1 ? null : o; };
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (small && fits()) { k = over = Math.max(COMPACT, floor); el.style.setProperty('--pz-fit', String(k)); }   // (Compact; over: no search back up past it)
      for (const kMin of mins) {
        for (let n = 0; n < 8 && k > kMin; n++) {
          const o = fits();
          if (!o) break;
          over = k;
          k = Math.max(kMin, k * Math.min(0.97, (readMetric(el, 'clientHeight') / (readMetric(el, 'clientHeight') + Math.max(o.v, 0))) ** 0.9, (readMetric(el, 'clientWidth') / (readMetric(el, 'clientWidth') + Math.max(o.h, 0))) ** 0.9));
          // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
          el.style.setProperty('--pz-fit', k.toFixed(3));
        }
        if (!fits()) break;
      }
      // (The steps above scale by how far the card overflows, but smaller words wrap into fewer lines, so a step overshoots:
      // a phone's words that fit at 0.62 came in at 0.5, under 12 px. Once a fit fits, the largest that still fits is found
      // between it and the last that did not.)
      if (k < over && !fits()) for (let n = 0; n < 6 && over - k > 0.005; n++) {
        const m = (k + over) / 2;
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        el.style.setProperty('--pz-fit', m.toFixed(3));
        if (fits()) over = m; else k = m;
      }
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (k < 1) el.style.setProperty('--pz-fit', k.toFixed(3));
      // (A fit within a hair of the last one keeps the last one, when the card still fits with it: a phone's words had flipped
      // between 0.850 and 0.851 with every pass, moving the card a pixel and restyling the whole page about twice a second.)
      if (was !== k && Math.abs(was - k) < 0.01) {
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        if (was < 1) el.style.setProperty('--pz-fit', was.toFixed(3)); else el.style.removeProperty('--pz-fit');
        const o = ovOf(el);
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        if (o.v > 1 || o.h > 1) { if (k < 1) el.style.setProperty('--pz-fit', k.toFixed(3)); else el.style.removeProperty('--pz-fit'); }
      }
      // (Parts whose words keep their size (styles/app.css: zoom var(--pz-z)) let the fit shorten only their pictures; when even
      // the shortest pictures leave the card too full, a large text setting, the words then zoom down too, to half at most.)
      // (Never past the 12 px floor: the card's small size, --pz-sm, zoomed, stays at least 11.5 px.)
      // (Its small size read with a probe once per look of the card and the screen, not on every fit.)
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      const smKey = `${el.className}|${live.ui.root.className}|${innerWidth}x${innerHeight}|${devicePixelRatio}|${document.documentElement.style.cssText}|${app.style.cssText}|${live.ui.root.style.cssText}|${el.style.cssText.replace(/--pz-(fit|z):[^;]*;?/g, '')}`;
      let sm = smOf.get(el);
      // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
      if (sm?.k !== smKey) { const pr = smProbe; el.append(pr); sm = { k: smKey, v: parseFloat(readStyle(pr).fontSize) || 12 }; pr.remove(); smOf.set(el, sm); }
      sm = sm.v;
      const zMin = Math.max(0.5, Math.min(1, WORDS_MIN_PX / sm));   // (12 px, the standing floor for every card's lettering: it was 11.5, which put a tile's unit at 11.6 px on an iPhone on its side, sweep 18 Nov)
      for (let n = 0, z = 1; n < 8 && z > zMin; n++) {
        const o = ovOf(el);
        if (o.v <= 1 && o.h <= 1) break;
        z = Math.max(zMin, z * Math.min(0.97, (readMetric(el, 'clientHeight') / (readMetric(el, 'clientHeight') + Math.max(o.v, 0))) ** 0.9, (readMetric(el, 'clientWidth') / (readMetric(el, 'clientWidth') + Math.max(o.h, 0))) ** 0.9));
        // alloc-rare: the card layout and fit: run on a slide, resize, fold or dock change, in a rest pass between frames, never per frame
        el.style.setProperty('--pz-z', z.toFixed(3));
      }
      fitEquations(el);
      // (Closed again with no transition, so the answers start hidden and the card rests at its closed height.)
      // (7d, play-test 16 Nov 2026: a centred card that grows as an answer opens re-centres, so everything moved 26 px. Its height with every answer open is kept, --pz-open-h, and the CSS
      // hangs its top at the place that height centres on (.pz-panel.pz-grows), so an answer opening only lengthens it downward: the top and everything above the answer stay still.)
      if (el.classList.contains('pz-panel')) { if (all) el.style.setProperty('--pz-open-h', `${readMetric(el, 'offsetHeight')}px`); else el.style.removeProperty('--pz-open-h'); el.classList.toggle('pz-grows', !!all); }
      if (all) { all.classList.remove('pzc-all'); void readMetric(all, 'offsetHeight'); all.classList.remove('pzc-still'); }
      if (split) {
        measureUnder(el);   // (once, at the fit it ends with)
        if (wasOpen) el.classList.add('tool-open');
        if (wasU) el.style.setProperty('--pz-u', wasU);
        live.ui.lipMO?.takeRecords();
      }
      fitDone.set(el, fitSig(el));   // (as it rests once fitted: a folding part's height is part of it)
      clipSoon(el);
      if (el === live.ui.data) refit = true;
    }
    if (refit) live.ui.tools?.refit();   // (the chart in the data card draws at the zoom the fit left, not one it tried on the way)
  }
  return { GRIP, LIP, LOW_M, SHORT_H, TEXT_CARD, autoDock, capOf, dock, dockHalt, dockPaint, dockRest, dockTo, dockVec, fitCards, fitDone, fitSig, insetL, liftTo, lipOn, measureUnder, minText, overflowOf, phone, pillKind, placeLip, riseShift, slideTell, slideUnder, slip, splitSheet, stopUnder, tabBeside, tabUp, underU, visualOf, wideSheet, words, wordsFloor, wordsGlide, wordsHeightAt };
}
