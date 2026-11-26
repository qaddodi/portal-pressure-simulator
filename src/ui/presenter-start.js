// Start and stop
// (moved out of presenter.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { throwStop } from './card-throw.js';
import { createCardZoom, tapTracker } from './card-zoom.js';
import { caught } from './caught.js';
import { DECK_ALIAS, withOverview } from './decks.js';
import { D_SMALL, D_SURFACE, EASE_ARRIVE, easeIn } from './ease.js';
import { createFigureKey, figureKeyReady } from './figure-key.js';
import { cancelFrame } from './frame.js';
import { readAnims, readBox, readMetric, readRects, readStyle } from './layout-snap.js';
import { fadeMs as fadeLen, reduceMotionMQ as reduce } from './motion.js';
import { bigTiles } from './presenter-cards.js';
import { createTools } from './presenter-tools.js';
import { cancelRest } from './rest-pass.js';
import { createScopeLens } from './scope-lens.js';
import { glideOpacity } from './script-glide.js';
import { sheetPanes } from './sheet-glass.js';
import { figureHooks } from './slide-ext.js';
import { instrumentOf } from './slide-instrument.js';
import { createScope } from './slide-txn.js';
import { store, replaceParams, setViewKey } from './store.js';
import { oneLadder } from './teach-extras.js';
import { h, icon, setCanvasBoost, themeChanged, toast } from './util.js';
import { animRunning } from './glass-clock.js';   // (a fade held on the glass's clock is still under way)

export function createStart(st, live) {
  const { claimLane, patientHistory, restartTraces, NO_KEEP, PW_K, abSlow, all, app, camFollow, camFollowOk, caseShut, cathStop, cellReady, cellTap, closeHome, coverDown, deckTab, dock, dockHalt, dockTo, dockTouch, evDrop, fitDone, foldTouch, go, host, inkOf, insets, layout, loadPreset, measureUnder, nextFrame, onFonts, onHidden, onResize, paintZoom, placeLip, prepare, procStop, projectorOff, projectorOn, pview, reframe, riseShift, setLabels, sizeNow, slidePrep, slideUnder, slip, splitSheet, stage, stashCards, stopLapse, stopUnder, strainStop, testingLoad, toggleBlack, underU, until, view, viewSettled, wait, waitCut, wake, wideSheet, wrap, zoneCam, zoomBehind, zoomCredit, zoomFolds, zoomOn, zoomReady, zoomSettled, zoomToggle } = st;
  // ── Start and stop ──
  function build() {
    const tiles = bigTiles();
    const text = h('section', { class: 'pz-text stage-blocker' });
    const dhT = h('span', {}, 'The patient');
    const tools = createTools({ host, stage });
    // On a phone an instrument above tiles folds away (the tiles keep the reading), so the figure is not a strip between
    // two cards; the button opens it, and it stays open for the rest of the talk.
    // The card is fitted once, as it will rest, before the part moves, and keeps that fit until the part is still: its words,
    // tiles and pictures hold their size through the whole open and close. (Fitted as the part eased or followed the finger,
    // the card measured itself against a cap meant for the other state; an iPhone's Doppler card shrank to half mid-pull, then
    // grew back once open.)
    // (A phone's sheet holds what is under the instrument: its tiles.)
    const partOf = () => (data.classList.contains('tool-lead') || (data.classList.contains('pz-sheet') && !data.classList.contains('tool-only')) ? tiles.el : tools.el);
    const setFold = (open) => {
      if (zoomOn() && !zoomFolds()) return;   // (a zoomed card too: the zoom fits the stack again as they move, zoomFollow; not while it glides in or back)
      // (Upright: fitted at rest as it will be, then the readings' card slides there from wherever it stood, slideUnder.)
      if (splitSheet(data)) {
        const u0 = underU(data);
        // (The view as the readings rest now, to follow from: camFollow. Already following (a finger let go), it follows on.)
        const vNow = !stage.following?.() && (u0 === 0 || u0 === 1) && camFollowOk() ? stage.viewNow?.() : null;
        stopUnder();
        // (The handle's own 24 px step to its open or tucked place, placeLip, is not made here: the readings' slide carries the handle all the
        // way, so that step ran against it as a second move and the handle jumped 24 px at the start and wobbled back while the card slid:
        // Mohammad, 3 Nov 2026, "jitter when a card tucks and untucks".)
        live.lipStep = null;
        // alloc-rare: a card is built or tapped open: once per tap, not per frame
        data.classList.toggle('tool-open', open); fold.setAttribute('aria-expanded', String(open)); fold.textContent = open ? 'Hide' : 'Show';
        // alloc-rare: a card is built or tapped open: once per tap, not per frame
        data.dataset.openFor = String(live.want);
        delete data.dataset.folding; fitDone.delete(data); layout();
        measureUnder(data);
        if (!stage.following?.() && !(vNow && camFollow(vNow, open))) foldReframe();
        data.dataset.folding = '';
        slideUnder(u0, open ? 1 : 0);
        clearTimeout(foldT); foldT = setTimeout(foldStill, reduce.matches ? 0 : 450);
        return;
      }
      // alloc-rare: a card is built or tapped open: once per tap, not per frame
      const p = partOf(), cs = readStyle(p), from = ['maxHeight', 'opacity', 'marginTop', 'marginBottom'].map((n) => [n, cs[n]]);
      p.style.transition = 'none'; for (const [n] of from) p.style[n] = '';
      // alloc-rare: a card is built or tapped open: once per tap, not per frame
      data.classList.toggle('tool-open', open); fold.setAttribute('aria-expanded', String(open)); fold.textContent = open ? 'Hide' : 'Show';
      // alloc-rare: a card is built or tapped open: once per tap, not per frame
      data.dataset.openFor = String(live.want);   // (the slide it was tapped on: kept open there, layout and phoneTextCap)
      delete data.dataset.folding; fitDone.delete(data); layout();
      // (Then back to where the part stood, from which it eases to its rest.)
      data.dataset.folding = '';
      for (const [n, v] of from) p.style[n] = v;
      readBox(p); p.style.transition = ''; for (const [n] of from) p.style[n] = '';
      clearTimeout(foldT); foldT = setTimeout(foldStill, reduce.matches ? 0 : 450);
    };
    // The camera starts for the room the cards will leave as the readings' card starts to move, in step with it (Mohammad, 30 Oct, iPhone:
    // "The view still snaps/jumps when I untuck a stacked card"). Framed once the card had come to rest (foldStill, 450 ms or more after the
    // tap), the readings' card slid over the figure and stopped, and only then did the figure move off from under it. Framed here, between
    // the layout and the slide: the card stands as it will rest (its class set, not yet sliding) and its handle is placed at its foot, so the
    // camera reads the room it will have. foldStill's own refit then finds the camera already headed there (frameBox and fitSlow leave a
    // glide to the same view alone). (Not while a slide comes in or goes, a dock moves the card (dockTo frames for where it goes), a zoomed
    // card (it frames itself) or a resize still settling.)
    const foldReframe = () => {
      if (!live.shown || live.shown.i !== live.want || live.shown.gen !== live.gen || (live.busy && !live.playing) || live.leaving || dock.to !== 0 || dock.lvl !== 0 || zoomOn() || live.reframeT) return;
      placeLip();
      reframe(400);
    };
    let foldT = 0;
    const foldStill = () => {
      clearTimeout(foldT);
      if (!('folding' in data.dataset)) return;
      if (data.classList.contains('pz-sliding') || readAnims(partOf()).some(animRunning)) { foldT = setTimeout(foldStill, 100); return; }   // (still easing: a slow frame)
      stage.followEnd?.();   // (at rest: the view stands at the framing for where it rests, and the refit below finds it there)
      delete data.dataset.folding; fitDone.delete(data); onResize();
    };
    const fold = h('button', { class: 'pz-fold', type: 'button', 'aria-expanded': 'false', onclick: () => setFold(!data.classList.contains('tool-open')) }, 'Show');
    // The corner icon that zooms the instrument's card (Mac and iPad landscape; shown by styles/app.css .pz-zbtn only where the card has room to grow).
    const zbtn = h('button', { class: 'pz-zbtn', type: 'button', 'aria-label': 'Enlarge this card', 'aria-expanded': 'false', title: 'Enlarge', onclick: () => zoomToggle() }, icon('fullscreen'), icon('shrink'));
    // A phone's sheet under the card (.pz-sheet, dockVec): its edge carries the handle. A tap steps through the three states, as the
    // card's own pulls and pushes do: partly open, fully open, closed to its edge at the top, partly open again.
    const lip = h('button', { class: 'pz-lip stage-blocker', type: 'button', hidden: true, 'data-safe-rest': '', 'aria-label': 'Show the rest of the card', onclick: () => {
      if (performance.now() - (dock.tapAt || 0) < 700) return;   // (a touch that already opened the closed card, dockTouch)
      // (On a zoomed card the handle rides with it: a tap brings the readings out or tucks them away there, the zoom fitted to the stack as they go;
      // not while the card glides in or back.)
      if (zoomOn()) { if (zoomFolds() && wideSheet(data)) setFold(!data.classList.contains('tool-open')); return; }
      // (Upright: partly open, fully open, partly open (its readings' card tucked away), closed, partly open again.)
      const split = splitSheet(data);
      // (A tap while the readings are still sliding turns the slide round, it does not step on to "closed": a second tap on Hide while the
      // card was still moving put the whole card away, content and all: Mohammad, 3 Nov 2026, iPhone.)
      if (split && data.classList.contains('pz-sliding')) { setFold(!data.classList.contains('tool-open')); return; }
      if (dock.to === 1) { dock.auto = false; dockTo(0); }
      else if (wideSheet(data)) setFold(!data.classList.contains('tool-open'));   // (Mac and iPad landscape: the handle only brings the readings out or tucks them away)
      else if (data.classList.contains('tool-open')) { if (split) { dock.down = live.want; setFold(false); } else { dock.auto = false; dockTo(1); } }
      else if (split && dock.down === live.want) { dock.auto = false; dockTo(1); }
      else setFold(true);
    } });
    const data = h('section', { class: 'pz-data stage-blocker pz-hide', 'data-safe': 'right', 'data-safe-rest': '', 'data-safe-waits': '', 'data-gone': '', hidden: true, 'aria-label': 'The numbers' },
      h('div', { class: 'pz-dh' }, dhT, tiles.head, fold, zbtn), tools.el, tiles.el, h('span', { class: 'pz-grip', 'aria-hidden': 'true' }));
    const foldHs = foldTouch(data, fold, setFold, partOf, (on) => { if (on) { clearTimeout(foldT); data.dataset.folding = ''; } else foldT = setTimeout(foldStill, reduce.matches ? 0 : 450); }, lip);
    const dockHs = dockTouch(data, lip);
    const cardTouch = [foldHs, dockHs];   // (fold first: it stops the dock drag when it takes a move, as on the card)
    // (Shown with the sheet only, and kept at the card's foot as the card grows or shrinks, a part easing open included.)
    // (Shown with a card already standing (its sheet came on in the pass that let the cards in, or a move was cut short and they came in as it
    // ended), a handle that was display: none starts from its out look, pz-lip-in, and eases in with the card's own fade: it came up at
    // full strength at once, ahead of the cards.)
    const lipSync = () => {
      const was = lip.hidden;
      lip.hidden = data.hidden || !data.classList.contains('pz-sheet');
      const enter = was && !lip.hidden && !data.classList.contains('pz-hide');
      if (enter) lip.classList.add('pz-lip-in');
      placeLip();
      if (enter) { void readMetric(lip, 'offsetWidth'); lip.classList.remove('pz-lip-in'); }
    };
    const lipMO = new MutationObserver(lipSync);
    lipMO.observe(data, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    // (Not while the readings' card slides: each frame's --pz-u already places it, lipMO, from the slide's own sums.)
    const lipRO = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!data.classList.contains('pz-sliding')) placeLip(); }) : null;
    lipRO?.observe(data, { box: 'border-box' });
    // A part that has finished folding or unfolding: fit the card again from full size (a fit taken mid-fold kept the tiles small).
    data.addEventListener('transitionend', (e) => { if (e.propertyName === 'max-height' && e.target.parentElement === data) { if ('folding' in data.dataset) foldStill(); else { fitDone.delete(data); onResize(); } } });
    const veil = h('div', { class: 'pz-veil' }), panel = h('section', { class: 'pz-panel stage-blocker', hidden: true });
    const prog = h('div', { class: 'pz-prog', 'aria-hidden': 'true' }, h('i'));
    const bar = h('div', { class: 'pz-bar stage-blocker', role: 'toolbar', 'aria-label': 'Presenter' });
    bar.addEventListener('focusin', wake);
    const blackEl = h('div', { class: 'pz-black', 'aria-hidden': 'true', onclick: () => toggleBlack(false) });
    // The shade sits under the corner credit (both at figure level, the credit later), the slide over both.
    // (An iPhone's credit: one 12 px line at the teaching card's foot, the same on every slide; styles/app.css .pz-cred.)
    const shade = h('div', { class: 'pz-shade' }, deckTab(), h('span', { class: 'pz-sitetab', hidden: true }), h('span', { class: 'pz-cred', 'aria-hidden': 'true' }, wrap.querySelector('.stage-credit')?.textContent.trim() || ''));
    // What the figure frames itself clear of: the words, the glass and its shadow.
    const safe = h('div', { class: 'pz-safe', 'aria-hidden': 'true', hidden: true });
    // (Once faded out, its spinner stops (idle) until it is shown again: it had turned, unseen, for the whole talk.)
    const idle = (e) => { if (e.target === load && e.propertyName === 'opacity' && !load.classList.contains('on')) load.classList.add('idle'); };
    const load = h('div', { class: 'pz-load idle', 'aria-hidden': 'true', ontransitionend: idle, ontransitioncancel: idle }, h('i'));
    const jump = h('nav', { class: 'pz-jump stage-blocker', hidden: true, 'aria-label': 'Slides' });
    const vcase = h('section', { class: 'pz-case stage-blocker', hidden: true, onclick: () => { if (performance.now() - live.caseDragAt > 400) live.caseLift?.(); } });
    // The slide's colour key, small on the figure (src/ui/figure-key.js fades it in; its words are set by figKey). The figure's labels keep clear of it (stage-blocker).
    const fk = h('div', { class: 'pz-fk stage-blocker', role: 'img', hidden: true, 'data-empty': '', 'aria-hidden': 'true' });
    // One announcement per slide for a screen reader ("Slide 3 of 12: its title"), not the whole card and panel read out each
    // time they are rewritten (they carry no live region of their own).
    const say = h('p', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    // The slide's scale switch (slide field scales): Anatomy, Lobule, Sinusoid, as Explore's pill. It comes and goes with the
    // teaching card; the figure's labels keep clear of it, and on a phone the camera frames above it (data-safe, set in placeScales).
    const scl = h('div', { class: 'pz-scales stage-blocker pz-leave', role: 'group', 'aria-label': 'Scale', hidden: true });
    // The zoom's veil sits over the words and the figure and under the card, its handle and the controls: a tap on it puts the card back.
    const zscrim = h('div', { class: 'pz-zscrim', 'aria-hidden': 'true', onclick: () => zoom.close().then(paintZoom) });
    // (A cell of the six ladders zoomed to the middle (cellOpen): the page behind the panel is dimmed by this veil, the panel's own by the one in its grid.
    // The scale is read at the element: a cell sits in the panel's fit zoom, which the card does not.)
    const pscrim = h('div', { class: 'pz-pscrim', 'aria-hidden': 'true', onclick: () => zoom.close().then(paintZoom) });
    // (The veil for the teaching card zoomed as the main card: at the figure's level, just under its glass (the shade), zoomOpen.)
    const fscrim = h('div', { class: 'pz-fscrim', 'aria-hidden': 'true' });
    const zoom = createCardZoom({ card: data, along: [lip], scrim: zscrim, app, area: () => readBox(wrap),
      scale: (el) => (el && el !== data && readMetric(el, 'offsetWidth') ? readBox(el).width / readMetric(el, 'offsetWidth') : readBox(wrap).width / (readMetric(wrap, 'clientWidth') || 1)) || 1,
      reduce: () => reduce.matches, boost: setCanvasBoost, hold: zoomCredit, settled: zoomSettled,
      // (The words' card stays up while the card is zoomed; its words, and its deck tab on the card's edge (the shade holds the tab), are cut away under the card, card-zoom.js, and it rests at slip.base's rise meanwhile.)
      camera: { open: () => !!stage.zoomOpen?.(), at: (s, x, y, dx, dy) => stage.zoomAt?.(s, x, y, dx, dy), end: () => stage.zoomEnd?.(), sharp: (on) => stage.zoomSharp?.(on) }, scene: () => (live.shuffle?.active() ? [] : [text, shade]), behind: zoomBehind });   // (a shuffled pair: only the card in front is zoomed, the one behind is never enlarged)
    tapTracker(data, { ok: () => (zoomReady() && !(live.shuffle?.active() && live.shuffle.front() !== 'data')) || zoom.up, onTap: () => zoomToggle() });   // (a shuffled pair, the instrument behind: a tap on its strip brings it forward, card-shuffle.js; the zoom is for the card in front)
    tapTracker(text, { ok: () => zoomReady() || zoom.up, onTap: () => zoomToggle('text') });   // (a tap on the teaching card is the same zoom as on the data card: both come into view together, 5 Nov 2026)
    tapTracker(panel, { ok: () => cellReady() || zoom.up, onTap: cellTap });
    const root = h('div', { class: 'pz' }, safe, veil, load, fk, text, zscrim, data, lip, panel, vcase, prog, scl, bar, jump, blackEl, say);
    root.classList.add('pz-page'); shade.classList.add('pz-page');   // (the teaching card as one page: card-page.js)
    root.classList.add('pz-throw'); shade.classList.add('pz-throw');   // (Next and Back throw the cards: app.css .pz-throw)
    veil.after(pscrim);   // (above the page's veil, under everything else)
    wrap.insertBefore(shade, wrap.querySelector('.stage-credit'));
    shade.before(fscrim);
    // The teaching card's glass is the card itself: it leaves and arrives with the words, never resizing in view.
    // (Except while the words turn over on it (pz-turn, glassTurn): then the glass stays and only the words go.)
    const shadeMO = new MutationObserver(() => shade.classList.toggle('pz-leave', text.classList.contains('pz-leave') && !shade.classList.contains('pz-turn')));
    shadeMO.observe(text, { attributes: true, attributeFilter: ['class'] });
    wrap.append(root);
    // The scope view on the figure (scope-lens.js): the ring on the varices of a slide that shows them, and its lens, kept clear of the cards.
    const scope = createScopeLens({ stage, store, root, avoid: () => [text, shade, data, lip, panel, vcase, prog, scl, bar, fk] });
    // (It comes in with the teaching card, in the card's own fade, once the card is fitted (pz-prep gone), and leaves with it.)
    const figKey = createFigureKey({ el: fk, app, watch: [text, root, vcase], ready: () => figureKeyReady(text, root, vcase) });   // (figure-key.js: with the teaching card, and while the case card holds the slide)
    // The cards' frosted glass drawn on the GPU under them while it can be (stage.cardGlass, glass-gl.js); else the browser's.
    // (The split readings sheet's glass is its two pseudo-elements', read by sheetPanes; every other card's is its own box.)
    // (Not the teaching card's shade: on an iPhone, moved between the browser's blur and the GPU's as the figure came and went (a fade, the
    // lobule), it lost its outline, tabs and credit and kept only the glass, Safari dropping its own layer's picture (Mohammad, 1 Nov
    // 2026, at 25a4f68f, and a layer of its own did not keep it). It keeps the browser's blur, as it had until that day.)
    // (1 Nov 2026, evening: the shade is on the GPU glass again, as every other card, now that no glass ever goes back to the browser's blur
    // (app.css: where the figure's canvas cannot take it, the shade turns solid; no backdrop-filter is declared anywhere) and the shade keeps one
    // layer of its own throughout, so the swap that lost its picture on an iPhone no longer happens.)
    // alloc-rare: a card is built or tapped open: once per tap, not per frame
    const glass = stage.glass?.add(() => [shade, data, vcase, bar, scl, fk], { card: true, watch: [root, shade], before: shade, low: (e) => e === shade, read: (g) => (g === data || g.dataset?.ghost === 'data' ? sheetPanes(g) : undefined), with: (g) => (g === shade ? [text] : null), bare: () => [panel], shift: riseShift, cut: (g) => live.shuffle?.cutOf(g) || null })   // (cut: a shuffled pair's card behind is drawn down to its strip only: card-shuffle.js) || null;
    return { root, shade, safe, load, text, data, lip, lipRO, lipMO, shadeMO, cardTouch, setFold, zoom, zbtn, pscrim, zscrim, fscrim, partOf, vcase, fk, figKey, glass, dhT, tiles, tools, veil, panel, prog, scl, bar, black: blackEl, jump, say, scope };
  }
  function coverUp(what = '') {
    live.booting = true;
    document.documentElement.classList.add('pz-covered');   // (the slide's cards come in under the cover unseen: their words never show through the loader's own, 17 Nov 2026)
    clearTimeout(live.coverT); live.coverT = setTimeout(() => coverDown(true), 12000);   // (never left up)
    if (!live.cover) { live.cover = h('div', { class: 'pz-cover', role: 'status' }, h('i', { 'aria-hidden': 'true' }), h('span', {}, what ? [what, h('small', {}, 'Preparing the slides')] : 'Preparing the slides')); document.body.append(live.cover); void readMetric(live.cover, 'offsetWidth'); }   // (the cue says what is opening: a wait of seconds on a slow machine is a loading, not a blank)
    // (A deck link opened cold: the loading cover is still up, and it lifts onto this one. This cover is on at once, not faded in, so the
    // loading cover never lifts onto the plain app's bars and an empty figure for the length of a fade.)
    const cold = document.documentElement.dataset.boot === 'hold';
    if (cold) live.cover.classList.add('cut');
    live.cover.classList.add('on');
    // alloc-rare: boot cover: once per load
    if (cold) { void readMetric(live.cover, 'offsetWidth'); nextFrame(() => nextFrame(() => live.cover?.classList.remove('cut'))); }
    return wait(fadeLen(300));
  }
  // The slides' fonts, every subset they draw from (Latin, Latin Extended, Greek for μ or Δ), are loaded under the start's cover:
  // a subset is otherwise fetched on its first use, and its words show in a stand-in font first, then swap and change size.
  const fontsIn = () => (document.fonts?.load
    ? Promise.race([Promise.all(['400 16px Inter', '600 16px Inter', '600 32px "Source Serif 4"'].map((f) => document.fonts.load(f, 'Aāαἀ').catch(() => {}))), wait(1500)])
    : null);
  // Everything the audience's slides will change, kept so Esc, ✕ or Finish can put the viewer's own settings back (the patient and clock too, see putHealthy).
  async function capture() {
    const st = store.get(), { snap } = await host.request('snapshot');
    return { snap, history: patientHistory?.save() ?? null, params: structuredClone(st.params), presetId: st.presetId, view: st.view, lobule: st.lobule, sinusoid: st.sinusoid, mode: st.mode,
      selection: st.selection, details: st.details, compareSnap: st.compareSnap, compareView: st.compareView, colorMode: st.colorMode,
      lobuleLayers: st.lobuleLayers, running: st.running, speed: st.speed, lapse: st.lapse, clock: st.clock, hvpgMeasured: st.hvpgMeasured, lastHVPG: st.lastHVPG,
      labelK: stage.labelScale(), cam: stage.cameraState() };
  }
  let startGen = 0;
  async function start(id, at = 0, opts = null) {
    // (The slide a start lands on never plays its case card: it was skipped only while the start's cover was up, and the cover
    // gives up after 12 s, so on a slow machine a deep link sat on a case card waiting for a tap no one knew to give.)
    live.noCase = true;
    const startMine = ++startGen;   // (B14: a start overtaken by a newer one does not install its deck over it)
    // (A talk still fading out is ended by this start, not by its own fade's end, which would otherwise run its restore under
    // the new talk; a return to healthy still under way stops where it is: motion review round 2, RF5.)
    live.leaving = null; healthyGen++;
    // (An old id opens the deck that took its slides, at slide 1: the slide number it was linked with means nothing there.)
    const aliased = typeof id === 'string' && Object.hasOwn(DECK_ALIAS, id);
    const want0 = aliased ? 0 : Math.max(0, (parseInt(at, 10) || 0));
    const d = typeof id === 'object' ? id : all().find((x) => x.id === (aliased ? DECK_ALIAS[id] : id));
    if (!d && typeof id === 'string' && id.startsWith('test-') && !live.TESTING.length && !opts?.waited) return testingLoad.then(() => start(id, at, { ...opts, waited: true }));   // (a ?script= link to the preview's test deck, asked before it loaded)
    if (!d?.slides?.length) { toast('That presentation could not be found.', 'bad'); return; }
    claimLane(d.mine ? '@mine' : d.id);   // (the deck being opened keeps the lane its states are computed on: no row the pointer crosses meanwhile queues another deck's before it, solve-lane.js)
    // The start is one composed reveal: a calm cover fades over the screen, the projector layout, the first patient and
    // the first slide are all set up under it, and the cover fades away once nothing behind it is still moving.
    const up = Promise.all([coverUp(d.title), fontsIn()]);
    // Starting another deck while one runs keeps the state from before the first.
    const before = live.deck ? live.saved : await capture();
    await up;
    if (startMine !== startGen) return;
    if (live.deck) stopNow(false);
    claimLane(d.mine ? '@mine' : d.id);   // (stopNow let the lane go with the old talk)
    live.lastAt = -1;
    live.saved = before;
    if (live.saved && !live.saved.cards) live.saved.cards = stashCards?.();
    live.deck = d; live.slides = (d.mine ? d.slides : withOverview(d).slides).map(oneLadder).map(zoneCam).map(instrumentOf);   // (the old ladder card's slides show the Gut to heart profile)
    live.shown = null; live.entering = null; live.shownState = -1; live.black = false; app.classList.remove('pz-blacked');
    closeHome?.();
    const st0 = store.get();
    if (!live.layersBefore) live.layersBefore = { ...st0.lobuleLayers };
    stage.setKeyStops?.(false);   // (the figure is read-only here: no Tab stops on it)
    store.set({ presenting: true, selection: null, details: null, compareSnap: null, colorMode: 'pressure', presentLabels: [], focus: null, stented: [], ...(st0.mode !== 'explore' ? { mode: 'explore' } : {}) });
    if (st0.view !== 'anatomic' && !st0.lobule) setViewKey('anatomy');
    projectorOn();
    app.classList.add('presenting'); themeChanged();   // (.app.presenting restyles the labels: label-theme.js)
    document.getElementById('stage')?.dispatchEvent(new PointerEvent('pointerleave'));   // a hover lit as the deck starts clears
    getSelection()?.removeAllRanges?.();
    app.classList.toggle('pz-hi', live.hiCon);
    app.style.setProperty('--pz-wk', String(PW_K[live.pzWidth]));
    live.sess?.dispose(); live.sess = createScope();
    live.ui = build();
    live.dataOn = live.textOn = null; live.keepNow = NO_KEEP; live.keepSnap = null; live.keepBad = []; live.keepArgs = null;   // (no card on screen yet)
    setLabels();
    prepare();
    addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onHidden);   // (a held strain lets go with the page)
    inkOf();   // (N2: the pen and spotlight listen from the talk's start, so a press and hold on the iPad finds them)
    live.sizeSeen = sizeNow();
    live.wrapRO ||= typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (live.ui && sizeNow() !== live.sizeSeen) onResize({ type: 'resize' }); }) : null;
    live.wrapRO?.observe(wrap);
    document.fonts?.addEventListener('loadingdone', onFonts);   // (a font arriving late changes the words' size: the cards are fitted again)
    go(Math.min(want0, live.slides.length - 1));
    wake();
  }
  function stop(restore = true) {
    if (!live.deck || live.leaving || document.documentElement.hasAttribute('data-embed')) return;   // (?embed: a talk in an iframe stays on its last slide; a new talk still replaces it, start() ends the old one itself)
    const els = live.ui ? [live.ui.root, live.ui.shade].filter((el) => el?.animate) : [];
    if (!els.length) { stopNow(restore); chromeIn(); return; }   // (Reduce Motion too: these are fades only, which it keeps)
    for (const el of els) el.inert = true;
    const me = live.leaving = Promise.all(els.map((el) => glideOpacity(el, 1, 0, D_SMALL, easeIn)));   // (on the eases' clock: the card and its glass fade in one frame)
    me.then(() => { if (live.leaving !== me) return; stopNow(restore); chromeIn(); });
  }
  function chromeIn() {
    for (const el of app.querySelectorAll('.topbar, .vdock, .stage-bar, #zoomPill, .toolbar')) {
      if (readRects(el).length) el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE });
    }
  }
  function stopNow(restore = true) {
    live.leaving = null;
    if (!live.deck) return;
    claimLane(null);
    live.ink?.dispose(); live.ink = null;
    pview.end();
    live.sess?.dispose(); live.sess = null; live.colT = live.refitT = live.reframeT = live.turnT = live.glassT = 0; live.swapNow = false;   // (R03: this talk's timers stop with it, none left to act on the next)
    if (live.cover) coverDown(true);
    strainStop(); stopLapse(); procStop(); cathStop(); abSlow(); live.liveOff = false; live.handOn = false;   // (before deck is cleared: stopping a time-lapse repaints the bar)
    live.txn?.end(); live.txn = null;
    slidePrep.cancel(); clearTimeout(live.prepT); live.prepT = 0;   // (recs §6: the preparation stops with the deck; nothing it started publishes after)
    live.deck = null; live.shown = null; live.entering = null; live.want = 0; live.gen++;   // (gen: a slide move still in flight is cut where it is, even if another talk starts before it notices)
    for (const w of live.waiters) w.res(null);
    live.waiters = [];
    removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onHidden);
    live.wrapRO?.disconnect();
    document.fonts?.removeEventListener('loadingdone', onFonts);
    live.fitRO?.disconnect(); live.clearRO?.disconnect(); live.fitKids = []; live.clearFor = null; clearTimeout(live.clearT); cancelRest(live.fitRaf); cancelRest(live.paneRaf);
    store.set({ presenting: false, sinusoidWash: false, presentLabels: null, presentTerms: null, presentNames: false, presentGrads: null, focus: null, stented: [], lobuleCallout: null, presentFp: null }); stage.setSites(null); stage.setGlow(null); stage.pinOrgans(null); delete app.dataset.lit;
    figureHooks('clear');
    live.hushed = false; live.lastCam = null; clearTimeout(live.hushInT); app.classList.remove('pz-hush', 'pz-hush-in', 'pz-held'); live.heldNow = false; live.holdEase = false;
    cancelFrame(slip.raf); slip.d = null; slip.h0 = null; stage.followEnd?.();
    clearTimeout(live.dataHideT); live.dataHideT = 0; clearTimeout(live.widthT); live.widthT = 0; live.widthOwn = false;   // (a panel width asked in the talk's last 240 ms: never applied after it, setPanelWidth)
    clearTimeout(live.idleT); clearTimeout(dock.fit); dockHalt(); dock.lvl = 0; dock.to = 0; dock.drag = false; dock.auto = false; dock.autoKey = '';
    // (The throws let go of with the cards: a card out of sight, held or pinned at an inline 0, was kept by card-throw.js's sets after its talk,
    // with the readings' pictures it carried; a talk that began meanwhile saw its move still running on a card that was gone.)
    if (live.ui) for (const el of [live.ui.text, live.ui.shade, live.ui.data, live.ui.panel]) throwStop(el);
    caseShut();   // (R02: a case card left up is shut with its talk here; a move of that talk that ends later no longer does it, transition)
    if (live.pageHeld) { clearTimeout(live.pageHeld.t); live.pageHeld = null; }
    live.pull = null; live.pageForce = false; live.bare = false; live.throwDir = ''; live.throwD = 0;
    live.dataOn = live.textOn = null; live.keepNow = NO_KEEP; live.keepSnap = null; live.keepBad = []; live.keepArgs = null;
    live.pillW = 0; live.ui?.zoom.reset(); live.ui?.tools.dispose(); live.mon?.dispose(); live.mon = null; evDrop(); live.ui?.scope?.dispose(); live.ui?.tiles?.dispose(); live.ui?.figKey.dispose(); live.ui?.glass?.remove(); live.ui?.lipRO?.disconnect(); live.ui?.lipMO?.disconnect(); live.ui?.shadeMO?.disconnect(); live.ui?.root.remove(); live.ui?.shade.remove(); live.ui?.fscrim.remove(); live.ui = null; app.classList.remove('pz-blacked');
    view.classList.remove('pz-out');
    insets.reset();   // (and a room held through the last slide change is never written back after the talk: inset-hold.js)
    stage.lobuleHold?.(false);   // (a way out of the lobule left unfinished: the lobule follows the free space again)
    stage.setProjection(false); live.labelsFor = '';
    document.documentElement.style.setProperty('--label-k', String(stage.labelEff())); document.documentElement.style.setProperty('--label-scale', String(stage.labelScale()));
    dispatchEvent(new Event('pps:labelscale'));
    if (document.fullscreenElement) document.exitFullscreen?.();
    app.classList.remove('presenting', 'pz-hi'); themeChanged();   // (and pz-held, taken off above)
    stage.setKeyStops?.(true);
    app.style.removeProperty('--pz-wk');
    projectorOff();
    dispatchEvent(new Event('pps:occ'));
    if (restore && live.saved) putHealthy(live.saved);
    if (restore) { live.saved = null; if (live.layersBefore) store.set({ lobuleLayers: live.layersBefore }); live.layersBefore = null; }
    // (The talk is over: a reload, or a tab the phone discarded and brings back, must not start it again from the link that opened it.)
    if (restore) { try { const u = new URL(location.href); if (u.searchParams.has('script')) { u.searchParams.delete('script'); u.searchParams.delete('slide'); history.replaceState(null, '', u.pathname + u.search + u.hash); } } catch (e) { caught('presenter:5785', e); /* no history here */ } }
  }
  // When the show ends, the app returns to the patient the viewer started from (16 Nov 2026; it was the healthy preset): that patient and
  // clock, anatomy view framed to fit, tools and cards closed, nothing from the last slide left on. The viewer's own settings (theme, label size, the
  // lobule layers they chose) stay as they were. The figure dims softly while the patient changes, as between slides, so nothing pops.
  // (A talk started meanwhile takes over: healthyGen moves on, and this return stops at its next step, the figure easing back
  // to full rather than staying dimmed or turning healthy under the new talk; motion review round 2, RF5.)
  let healthyGen = 0;
  async function putHealthy(b) {
    const ms = fadeLen(D_SURFACE);   // (Reduce Motion too: the figure dims while the patient changes, never an instant swap)
    const me = ++healthyGen, gone = () => me !== healthyGen && (view.style.opacity = '', true);
    if (ms) { view.style.transition = `opacity ${ms}ms var(--ease)`; view.style.opacity = '.22'; await waitCut(ms, gone); if (gone()) return; }
    const st = store.get();
    store.set({ mode: 'explore', colorMode: 'pressure', selection: null, details: null, compareSnap: null, compareView: 'B', hvpgMeasured: false, lastHVPG: null, lapse: 0, speed: 1 });
    if (st.sinusoid) { stage.exitSinusoid(); await waitCut(fadeLen(1000), gone); if (gone()) return; }   // (one glide out of the sinusoid and the lobule, stage.exitSinusoid)
    if (store.get().lobule) { setViewKey('anatomy'); await until(() => gone() || stage.lobuleSettled(), 2600); await waitCut(80, gone); if (gone()) return; }
    if (b.lobuleLayers) store.set({ lobuleLayers: b.lobuleLayers });
    if (store.get().view !== 'anatomic') { setViewKey('anatomy'); if (!reduce.matches) await viewSettled(gone, stage); if (gone()) return; }
    // The patient the viewer had before the talk comes back, with the model's clock (16 Nov 2026, play-test: Esc, the ✕ or Finish dropped a viewer who had
    // picked Decompensated cirrhosis onto Healthy at 0:03). Every way a talk ends goes through here (stop). Only a viewer with no snapshot
    // (a talk opened on a link, before any patient was captured) lands on the healthy preset.
    if (b.snap && b.params) {
      host.send({ type: 'restore', snap: b.snap });
      replaceParams(structuredClone(b.params));
      if (b.history) patientHistory?.load(b.history);   // (the History list and the undo stack come back with the patient: the slides' own changes were never the viewer's)
      store.set({ presetId: b.presetId, presetLoading: false, historyTick: (store.get().historyTick || 0) + 1, speed: b.speed || 1, lastHVPG: b.lastHVPG ?? null, hvpgMeasured: !!b.hvpgMeasured });
      host.send({ type: 'run', running: b.running !== false, clock: b.clock || 'hemo', speed: b.speed || 1 });
      restartTraces?.();   // (the Over time and Doppler traces held the talk's last patient: they start over with the viewer's own, as a patient pick does)
    } else {
      host.send({ type: 'run', running: true, clock: 'hemo', speed: 1 });
      await loadPreset?.('healthy');
    }
    if (gone()) return;
    stage.fitSlow(reduce.matches ? 0 : 700);
    if (ms) { await wait(260); view.style.opacity = ''; await wait(ms + 60); if (me === healthyGen) view.style.transition = ''; }
  }
  return { start, stop };
}
