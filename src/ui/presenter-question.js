// The question card, the held answer and the cards that stay
// (moved out of presenter.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { SAAG_PORTAL, TP_HIGH, saagPortal, tpHigh } from '../engine/ascites-cuts.js';
import { NOT_MEASURABLE } from '../engine/pressure-cuts.js';
import { cardBack, cardChangedWhy, cardSnap, dataPlan, keepData, keepText, textPlan } from './card-keep.js';
import { THROW_STAGGER, throwBusy, throwHeld, throwLanded, throwLeaving } from './card-throw.js';
import { toolOnly } from './card-tiles.js';
import { causeFit } from './cause-fit.js';
import { chartBefore } from './chart-start.js';
import { SITE_TAGS, siteTag } from './decks.js';
import { D_SMALL, D_SURFACE, EASE_MOVE } from './ease.js';
import { listCase, nb } from './glue.js';
import { gpuProbe } from './gpu-probe.js';
import { createHvpgMonitor } from './hvpg-proc.js';
import { readAnims, readBox, readMetric, readStyle, readTiming } from './layout-snap.js';
import { afterMs, reduceMotionMQ as reduce } from './motion.js';
import { isResponse } from './nsbb-response.js';
import { dropCharts, liveFp, rail, tileVal, wedgeColumn } from './presenter-cards.js';
import { citeEl, diseaseNodes, equation, gateButtons, lensButtons, revealLine, rich, setFpAt, slideLens, toolButtons } from './presenter-words.js';
import { revealCount } from './reveal.js';
import { EXT, safe } from './slide-ext.js';
import { store } from './store.js';
import { COLS, CUT, NO_ASC, PRESS, TILE, dirAbs, dirRel, effOf, fpv, headOf, pressDp, rateAbs, sameHead } from './table-marks.js';
import { tableRoles } from './table-roles.js';
import { focusOf, sidesEl } from './teach-extras.js';
import { titleParts } from './title-units.js';
import { chartScale, createProfileStrip, createProfileTool, pillReadings } from './tool-profile.js';
import { traceWhen } from './trace-labels.js';
import { fadeShown, fmt, h, swapText, themeChanged } from './util.js';
import { bpText } from './vital-read.js';

export function createQuestion(st, live) {
  const { abPick, app, beside, besideHook, cardIn, cath, changes, dataTo, evAdopt, evDrop, getCalc, go, lapseRow, lastBeat, layout, layoutAtLanding, markLong, nextFrame, paintKey, paintScales, procEl, respFp, sinTiles, stage, stateReady, strainEl, throwCards, tileKeys, under, waitCut, whatIfEl, xKey } = st;
  // Next pressed while the words are still coming in: their entrance (a WAAPI move, above the CSS leave) is stopped where it has got
  // to, held there for one style read, and let go, so the leave starts from where the words are, never from full or after a jump.
  function wordsFreeze() {
    const a = live.turnAnim; live.turnAnim = null; live.turnIn = false;
    const t = live.ui.text;
    // (The page: the glass and the words are stopped together where their entrance has got to, and leave from there.)
    for (const [el, an] of [[t, a], [live.ui.shade, live.shadeAnim]]) {
      if (!an || an.playState === 'finished' || an.playState === 'idle') continue;
      const cs = readStyle(el), o = cs.opacity, tf = cs.transform;
      an.cancel();
      el.style.transition = 'none'; el.style.opacity = o; el.style.transform = tf;
      void readStyle(el).opacity;
      el.style.transition = ''; el.style.opacity = ''; el.style.transform = '';
    }
    live.shadeAnim = null;
  }
  // What is left, ms, of the longest fade still running on these cards (0 when none).
  const fadeLeft = (els) => els.reduce((m, el) => readAnims(el).reduce((n, a) => { const t = a.playState === 'running' && readTiming(a.effect); return t && Number.isFinite(t.endTime) ? Math.max(n, t.endTime - (t.localTime || 0)) : n; }, m), 0);
  // A slide's tiles can say how far each number moved: from the slide before (delta: true) or a named one. A slide that
  // changes the same patient (a drug, an action, days) counts from the slide before unless it says delta: false.
  const deltaOf = (s, i) => s.delta ?? (i > 0 && !s.preset && changes(s) ? true : null);
  const refOf = (s, i) => { const d = deltaOf(s, i); return (d === true ? live.states[live.stateOf[i - 1]]?.fp : typeof d === 'string' ? fpOf(d) : null) || null; };
  // The data card: the ladder and tiles, a slide's instrument (tool), or both (the tool above the tiles).
  const hasCard = (s) => !s.visual && (s.data === 'tiles' || !!s.tool);
  // A reading tool can show the earlier reading as a ghost (D3): tool.delta, else the slide's own delta.
  const GHOST = { fibroscan: ['lsm', 'kPa', 1], spleen: ['ssm', 'kPa', 1], doppler: ['pvVel', 'cm/s', 0] };
  function toolGhost(s, i) {
    const g = GHOST[s.tool.kind === 'fibroscan' && s.tool.organ === 'spleen' ? 'spleen' : s.tool.kind];
    if (!g || (s.tool.kind === 'doppler' && (s.tool.vessel || 'PV_TRUNK') !== 'PV_TRUNK')) return null;
    if (s.tiles?.includes(g[0])) return null;   // (a tile already gives the change and where it came from)
    const t = s.tool.delta != null ? { ...s, delta: s.tool.delta } : s, d = deltaOf(t, i), r = refOf(t, i);
    if (r?.[g[0]] == null) return null;
    // (The earlier reading only: the instrument's live reading jitters, so a computed change could disagree with it.)
    const from = d === true ? live.slides[live.stateOf[i - 1]] : live.slides.find((x) => x.id === d);
    return { label: s.tool.deltaLabel || (d === true && s.lapse?.from) || from?.kicker || 'Before', value: `${fmt(r[g[0]], g[2])} ${g[1]}` };
  }
  const fullTitle = (s) => s?.dataTitle || (s?.tool ? live.ui.tools.title(s.tool, s) : 'The patient');
  // A phone's card title is one short line beside Show: the long name's head, never broken into two lines or a hyphen.
  const SHORT_TITLE = { 'Pressure, portal vein to heart': 'Portal vein to heart', 'Endoscopy, the lower esophagus': 'Endoscopy', 'The varix wall, in cross-section': 'The varix wall',
    'Liver stiffness, FibroScan': 'FibroScan', 'HVPG, catheter tracing': 'HVPG tracing', 'Pressure, beat by beat': 'Beat by beat', 'Portal pressure and flow over time': 'Pressure and flow', 'Doppler, main portal vein': 'Doppler, portal vein',
    'Doppler, superior mesenteric vein': 'Doppler, SMV', 'Doppler, splenic vein, at the hilum': 'Doppler, splenic hilum', 'Doppler, right portal vein': 'Doppler, right PV', 'Doppler, left portal vein': 'Doppler, left PV',
    'Doppler, right hepatic vein': 'Doppler, right HV', 'Doppler, middle hepatic vein': 'Doppler, middle HV', 'Doppler, left hepatic vein': 'Doppler, left HV', 'Doppler, inferior vena cava': 'Doppler, IVC',
    'Doppler, paraumbilical vein': 'Doppler, umbilical v.', 'Two years on one chart': 'Two years', 'The course on one chart': 'The course', 'Pressure over the talk': 'Pressure so far',
    'Pressures over the year': 'The year' };
  // (A phone on its side takes the short title too: its long one wrapped there, at its hyphen, "CROSS-" over "SECTION". A title's
  // hyphen never breaks, on any screen: a non-breaking one. Critique I7, 17 Oct.)
  const cardTitle = (s) => {
    const t = fullTitle(s), small = live.phone() || (innerWidth > innerHeight && innerHeight <= 500);
    return (small && t.length > 20 ? SHORT_TITLE[t] || (s?.tool && live.ui.tools.short(s.tool, t, s)) || t.replace(/ over the (days|year|talk)$/, '').replace(/,.*$/, '') : t).replace(/-/g, '\u2011');
  };
  // (A unit in a title keeps its own case, in a span the style leaves alone: "mL/day", not "ML/DAY".)
  const unitSpans = (el) => { const p = titleParts(el.textContent); if (p.length < 2) return; el.textContent = ''; p.forEach((t, i) => { if (t) el.append(i % 2 ? h('span', { class: 'pz-unit' }, t) : t); }); };
  // The talk so far, for a pressure trace: every state up to slide i, once each.
  // Each carries its time point (the deck's days so far) and what happened there (the first tick among its slides, else its title),
  // and its slide's id and its state's params (for a deck visuals package's chart).
  // (since: a slide's id, the trace's tool.since: the chart starts at that slide's state and counts its days from there, so a
  // deck that moves on to a new patient charts only that patient's course.)
  const whenOf = (k, f0 = -1) => {
    const d = live.slides.slice(f0 + 1, k + 1).reduce((a, s) => a + (s.days || 0), 0);
    return d && d % 365 === 0 ? `Year ${d / 365}` : d <= 200 ? `Day ${d}` : `Month ${Math.round(d / 30.4)}`;
  };
  // (A state on the same day as the one before it, as a drug started at that visit, says so instead of repeating the day; a slide's `when` words it.)
  const chainTo = (i, since) => { let before = null; const f0 = since ? live.slides.findIndex((x, j) => j <= i && x.id === since) : -1, k0 = f0 >= 0 ? live.stateOf[f0] : -1; return [...new Set(live.stateOf.slice(0, i + 1))].filter((k) => k >= k0 && live.slides[k]?.visual !== 'outline').map((k) => { const w = whenOf(k, k0), p = { n: k + 1, title: live.slides[k].title, tick: live.slides.find((x, j) => live.stateOf[j] === k && x.tick)?.tick || live.slides[k].title, mile: live.slides.find((x, j) => live.stateOf[j] === k && x.milestone)?.milestone, when: traceWhen(live.slides[k].when, w, before), day: w, fp: live.states[k]?.fp, id: live.slides[k].id, params: live.states[k]?.params }; before = w; return p; }); };
  // The deck's short name in a tab at the card's top right corner (decks.js TOPICS; your own deck, its title when short):
  // a darker patch of the card's own glass, flush with its top and right edges, only its bottom left corner rounded. It sits in
  // the card's top padding, so it never meets the title. (Not read out on every slide: the outline and the slide list name the talk.)
  const deckTab = () => { const name = live.deck?.head || (live.deck?.title?.length <= 24 ? live.deck.title : ''); return name ? h('span', { class: 'pz-tabname', 'aria-hidden': 'true' }, name) : null; };
  function monitorFor(s, i) {
    live.mon ||= createHvpgMonitor();
    // Already up (the slide before measured too): it stays, and glides to its new place under the new words.
    const stay = live.mon.el.parentNode === live.ui.text && !live.ui.text.hidden, y0 = stay ? readBox(live.mon.el).top : 0;
    live.mon.el.classList.toggle('pz-stay', stay);
    // (Where it lands is read once, as the slide's words are placed (a microtask: after this pass has put it under them, before any
    // frame paints it there), never in a frame; the glide itself is a transform.)
    if (stay && !reduce.matches) queueMicrotask(() => {
      const dy = y0 - readBox(live.mon.el).top;
      if (Math.abs(dy) > 1) live.mon.el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: D_SURFACE, easing: EASE_MOVE, composite: 'add' });
    });
    nextFrame(() => live.mon.set(s.monitor, live.states[live.stateOf[i]]?.fp, cath.v.balloon));
    return live.mon.el;
  }
  // ── The question card ──
  // A slide can carry question: '...' (one short question, no choices, no answer line, nothing stored or scored). Stepped onto going
  // forward it is asked on the case card's glass (questionRun), over the figure as it stands, and the slide is its answer. A slide that
  // changes the model lands holding the state before it, the data card showing those numbers, and plays its change once the card is
  // lifted: its time-lapse, or the eased change a compare button would make (answerPlay), the numbers following. A slide whose answer is
  // a control the learner moves, or a visual, changes nothing. Jumped to, or gone back to, the slide shows as any other, with no card.
  // (Only going forward one step, never onto a slide that brings a patient, a case, a catheter or a live procedure.)
  const questionable = (s, to, ct) => !!live.ui && !live.booting && !live.noCase && typeof s.question === 'string' && !!s.question.trim() && !ct && !s.vignette && !s.preset && !s.procedure && to > 0 && to === live.lastAt + 1;
  function holdAnswer(on, instant = false) {
    if (!live.ui) return;
    live.heldNow = !!on;
    live.ui.data.toggleAttribute('data-held-now', !!instant);
    live.ui.data.toggleAttribute('data-held', live.heldNow);
    if (app.classList.contains('pz-held') !== live.heldNow) { app.classList.toggle('pz-held', live.heldNow); themeChanged(); }   // (.app.pz-held restyles the labels' alerts: label-theme.js)
    live.ui.tools.holdAnswer(live.heldNow, instant);
    // alloc-rare: once per instant answer, not per frame
    if (instant) nextFrame(() => nextFrame(() => live.ui?.data.removeAttribute('data-held-now')));
  }
  // (Held on this slide: its own hold, or an answer slide straight after a held one, held until it lands.)
  const answerAfter = (s, i) => !s.visual && !s.hold && !s.preset && i > 0 && !!live.slides[i - 1]?.hold && i === live.lastAt + 1;
  // A slide's cards come in: the teaching card and the data card, each built unseen (pz-prep) and laid out where it will rest. A card the slide
  // keeps from the one before (keepFor) is not built: the data card only follows the patient (dataKept), the words stay as they stand.
  function wordsIn(s, st, i, fresh = false, lap = false, now = st) {
    if (!live.ui) return;
    live.keepArgs = { s, st, i, fresh, lap, now };
    live.ui.scope?.slide(s);   // (the ring on the varices when the slide shows them; a lens left open closes)
    if (!live.keepNow.text) textIn(s, st, i);
    if (live.keepNow.data) dataKept(s, i, now); else dataIn(s, st, i, fresh, lap, now);
    layout();
    keepNote();   // (a kept card this layout changed is put back at once: nothing changed is ever painted)
  }
  // The teaching card's words (or a visual's panel) for slide i, and what stands with them: the scale switch, the level's tab.
  function textIn(s, st, i) {
    const { text, panel } = live.ui;
    evDrop();   // (the last slide's graph is let go)
    paintScales(s, i);
    // The slide's level (Presinusoidal, Cardiac...) is a tab in the glass's top left corner, the deck tab's mirror in the level's
    // colour (17 Oct), not a pill over the title: set with the words, gone on a visual slide.
    // (A slide with a level rail names its level on the rail, which a phone held upright hides: there the tab names it instead.)
    const railLvl = !s.visual && s.rail && s.rail !== 'all' && SITE_TAGS[s.site] ? { site: s.site === 'pvt' ? 'pre' : s.site, name: SITE_TAGS[s.site] } : null;
    const lvl = s.visual ? null : siteTag(live.deck, s) || railLvl, stab = live.ui.shade.querySelector('.pz-sitetab');
    if (stab) { fadeShown(stab, !!lvl?.site); stab.toggleAttribute('data-rail', !!lvl && lvl === railLvl); if (lvl?.site) { const site = lvl.site; if (stab.textContent === lvl.name) stab.dataset.site = site; else swapText(stab, lvl.name, () => { stab.dataset.site = site; }); } }   // (a new level's name and colour cross-fade in place)
    // (the panel's own is let go once its new content is in, so it never fades back in with the old; behind a case card the words
    // stay out, never shown for a moment while they are fitted, until the card is lifted: cardsIn)
    // (Thrown in, the words stay out until cardsIn throws them in: let go here, they faded in at rest first and then jumped to the side.)
    if (!live.caseCard && !live.bare && !(live.throwDir && !s.visual)) text.classList.remove('pz-leave');
    if (s.visual) {
      live.panelGoTok = null;   // (a panel still fading out from the last visual slide is taken back, not emptied)
      dropCharts(text); dropCharts(panel);
      text.hidden = true; text.replaceChildren(); paintKey(null);
      // A panel that was not there fades in (never pops): unhidden while still faded, then let go.
      if (panel.hidden) { panel.classList.add('pz-leave'); panel.hidden = false; void readMetric(panel, 'offsetWidth'); }
      panel.classList.toggle('fill', s.visual === 'ladders');
      panel.dataset.visual = s.visual;
      panel.style.setProperty('--pz-tu', s.visual === 'table' ? String(tableUnits(s)) : '');   // (a table's own width in body-text em, so its card fits it: app.css .pz-panel[data-visual="table"])
      const tab = s.visual !== 'outline' && deckTab();   // (the outline names the talk in full instead)
      panel.classList.toggle('tabbed', !!tab);
      panel.replaceChildren(...(tab ? [tab] : []), h('div', { class: 'pz-ph' }, s.visual === 'outline' ? h('h1', { class: 'pz-dtitle' }, nb(live.deck.title)) : null, h('h1', { class: 'pz-h' }, ...diseaseNodes(nb(s.title))), s.eq ? equation(s.eq) : null, s.line ? h('p', { class: 'pz-line' }, rich(s.line, s, st?.fp, !!st?.params?.tips?.on)) : null, sidesEl(s, h, (t) => rich(t, s, st?.fp, !!st?.params?.tips?.on)), s.caveat ? h('p', { class: 'pz-caveat' }, s.caveat) : null, citeEl(s)),
        live.visualOf(s, i));
      if (!live.ui.root.classList.contains('pz-prep')) cardIn(panel, 'pz-leave');   // (else once fitted: settle)
      live.ui.veil.classList.add('on');
    } else {
      dropCharts(text);
      // (A visual panel leaving for a words slide fades out first, as it faded in, then is emptied: it vanished in one frame. Owner, 15 Nov 2026.)
      if (!panel.hidden && panel.firstChild) {
        panel.classList.add('pz-leave');
        const tok = live.panelGoTok = {};
        setTimeout(() => { if (live.panelGoTok !== tok) return; live.panelGoTok = null; dropCharts(panel); panel.hidden = true; panel.replaceChildren(); panel.classList.remove('pz-leave'); }, afterMs(D_SMALL));   // (a visual slide meanwhile takes it back: panelGoTok)
      } else { dropCharts(panel); panel.hidden = true; panel.replaceChildren(); panel.classList.remove('pz-leave'); }
      live.ui.veil.classList.remove('on');
      text.hidden = false;
      const head = h('h1', { class: 'pz-h' }, ...diseaseNodes(nb(s.title)));
      const rv = revealCount(s), line = s.line ? h('p', { class: 'pz-line' }, ...(rv ? revealLine(s, st?.fp, !!st?.params?.tips?.on, Math.min(live.beat, lastBeat(i)) + 1) : rich(s.line, s, st?.fp, !!st?.params?.tips?.on))) : null;
      if (live.bare) for (const a of readAnims(text)) a.finish();   // (the old words' leave is finished before the new words go in: the box never shows them mid-fade)
      text.replaceChildren(...[head, s.eq ? equation(s.eq) : null, s.monitor ? monitorFor(s, i) : null,
          line, sidesEl(s, h, (t) => rich(t, s, st?.fp, !!st?.params?.tips?.on)), s.caveat ? h('p', { class: 'pz-caveat' }, s.caveat) : null, citeEl(s),
          s.compare ? h('div', { class: 'pz-ab', role: 'group', 'aria-label': lensButtons(s) ? 'Color the vessels by' : gateButtons(s) ? 'Sample the stent at' : toolButtons(s) ? 'Change the instrument\'s view' : s.compare.some((o) => o.params && 'fenestrae' in o.params) ? 'Open or close the fenestrae on the live model' : isResponse(s.compare) ? 'Change how well the beta-blocker works on the live model' : 'Switch treatment on the live model' },
            s.compare.map((o, k) => h('button', { type: 'button', class: 'pz-abb', 'aria-pressed': String(!!o.own), ...(o.short ? { 'data-full': o.label, 'data-short': o.short, 'aria-label': o.label, title: o.label } : {}), onclick: () => abPick(s, i, k) }, o.label))) : null,
          s.procedure ? procEl(s, i, st) : null,
          s.whatIf ? whatIfEl(s, i, st) : null,
          s.strain ? strainEl(s, i) : null,
          s.column ? wedgeColumn() : null,
          s.lapse && i > 0 ? lapseRow(s) : null,
          s.rail ? rail(s.rail === 'all' ? 'all' : s.site) : null,
          s.causes?.length ? h('p', { class: 'pz-causes' }, h('span', { class: 'pz-sub' }, s.causesHead || 'Causes'), nb(listCase(s.causes))) : null]);
      paintKey((slideLens(s) !== 'pressure' || lensButtons(s)) ? slideLens(s) : null, s);
      markLong(text, live.gen !== live.redrawn);   // (drawn again for a new text size: judged at its full size, as a fresh load does)
      [...text.children].forEach((c, k) => c.style.setProperty('--i', k));
      text.dataset.turn = live.turnNow || live.throwDir;   // (the way the new words come in: app.css; '' comes in from the card's edge with the glass, as before)
      live.turnIn = !!(live.turnNow || live.throwDir);   // (its box comes in by wordsTurnIn once the cards come in)
      text.classList.remove('pz-enter'); void readMetric(text, 'offsetWidth'); text.classList.add('pz-enter');
    }
    live.textOn = textPlan(s);
  }
  function dataIn(s, st, i, fresh, lap, now) {
    const { data } = live.ui;
    delete data.dataset.hold;
    if (hasCard(s)) {
      // (A time-lapse's numbers wait for its end; an instrument on the card plays the days, so that card comes in with the words.)
      if (lap && !s.tool && live.ui.root.classList.contains('pz-prep')) data.dataset.hold = '';
      data.classList.add('tiles-only');   // (every card: the old ladder card was the one without it)
      data.classList.toggle('under', under(s));
      data.toggleAttribute('data-sin-tiles', sinTiles(s));
      data.classList.toggle('has-tool', !!s.tool);
      data.classList.toggle('tool-only', toolOnly(s));   // (an instrument card is the instrument alone, one fixed size: its readings stand in its header row, no readings card behind it, no handle)
      // (The portal blood bar takes the card's full width, its tiles under it: beside them its column was too narrow for the
      // segments' names, a 320 px card left it about 120 px, tool-flows.js.)
      // (The fluid balance's capacity window too: its rows of numbers need the card's width; tool-fluid.js. And the criteria card: its rules
      // are sentences.)
      data.classList.remove('pz-beside'); data.removeAttribute('data-beside');   // (no tiles stand beside an instrument now: they are its header's readings)
      data.toggleAttribute('data-ladder', s.tool?.kind === 'profile');   // (Mac and iPad landscape: the Gut to heart chart is never zoomed by the fit, so a pair too tall for it lifts instead, slip.base; layout)
      data.classList.remove('pz-folds');   // (Mac and iPad landscape: folded behind Show only when the pair would not fit, set in layout)
      data.dataset.tn = tileKeys(s).length;   // (Mac and iPad landscape: every instrument with tiles has them stacked beside it; its own readings fold to a short list under its picture)
      data.classList.remove('tool-lead');   // (nothing folds away behind an instrument now)
      data.dataset.tool = live.ui.tools.sig(s.tool);
      live.ui.dhT.textContent = cardTitle(s); unitSpans(live.ui.dhT);
      // (A flow-time chart over a time-lapse starts empty and draws as it plays.)
      if (s.tool) showTool(s, i, lap, i === live.lastAt + 1); else live.ui.tools.hide();
      if (s.tool?.kind === 'evgraph') evAdopt(s, i, st);   // (forward: stepped onto from the slide before, so the HVPG card plays its tracing)
      if (s.tool) live.ui.tools.ghost(toolGhost(s, i));
      // (With a new patient the numbers are set at once, while the card is still out: it fades back in already showing them. So
      // too while the new cards wait, unseen, for the camera to land (bare): their count ran unseen beside the glide, a frame's
      // work each frame of it, and was over before they came in.)
      const ms = fresh || (live.bare && live.ui.root.classList.contains('pz-prep')) ? 0 : undefined;
      if (s.data) live.ui.tiles.paintTiles(respFp(s, now.fp), tileKeys(s), s.key || [], refOf(s, i), ms, now.params?.tips?.on);
      else live.ui.tiles.paintTiles(now.fp, [], [], null, 0, false);   // (an instrument alone: no readings of the last slide stay in its header row)
      live.ui.tools.pin(now.fp); live.ui.scope?.pin(now.fp);
      clearTimeout(live.dataHideT); live.dataHideT = 0;   // (a card shown again is not hidden by the timer of its last leaving, while it fades in or waits to)
      if (data.hidden) { data.hidden = false; data.classList.add('pz-hide'); void readMetric(data, 'offsetWidth'); }
      if (!live.ui.root.classList.contains('pz-prep')) cardIn(data, 'pz-hide', THROW_STAGGER);   // (else once fitted: settle)
      else data.dataset.prep = '1';
      delete data.dataset.gone;
    } else if (!data.hidden) {
      data.dataset.gone = '';
      data.classList.add('pz-hide'); delete data.dataset.colswap;
      // (The timer belongs to the fade that began first: a second leaving with no card shown between lets it run, and one shown between has cleared it.)
      live.dataHideT ||= setTimeout(() => { live.dataHideT = 0; if (data.classList.contains('pz-hide')) { data.hidden = true; live.ui?.tools.hide(); } }, D_SMALL + 20);
    }
    live.dataOn = planOf(s, i) ?? null;
    live.holdEase = answerAfter(s, i);
    holdAnswer(!s.visual && (!!s.hold || live.holdEase), true);
  }
  // (A days chart that starts from an earlier slide's state, tool.view.since: that state's readings of the chart's two lines, for its first day.)
  const viewBefore = (t, i) => chartBefore(live.slides, live.stateOf, live.states, i);   // (chart-start.js: the state before the change the slide makes at once, or the slide's own view.since)
  const showTool = (s, i, lap = false, forward = false) => live.ui.tools.show(s.tool, { slide: i, stateKey: live.stateOf[i], forward, before: viewBefore(s.tool, i), chain: chainTo(i, s.tool.kind === 'trace' ? s.tool.since : null), trail: live.states[live.stateOf[i]]?.trail ?? null, reveal: lap ? 0 : 1, ctx: ctxOf(s, i), balloon: s.cath ? cath.v.balloon : null, figure: beside(s) ? besideHook : null });
  // ── Cards that stay between slides ──
  // A slide change used to fade both cards out and build both again. When the next slide's data card is the same (the same instrument
  // and options, the same tiles, title and layout: card-keep.js dataPlan) it stays where it is, live, and only the words swap; when the
  // words are the same (textPlan) the data card swaps and the words stay. Chosen as the change begins (keepFor), from the plans of the cards
  // on screen (dataOn, textOn) and of the slide coming; every other change is as it always was.
  // The numbers of a kept data card ease to the slide's: with the same patient the tiles count, and with a new one the card follows the model as it
  // eases (followData), nothing jumping ahead of the figure. A kept card that the new slide's layout would change (its size, fit or fold) is not
  // kept after all: put back as it stood, it leaves and is built again as every card is (keepNote, keepFall).
  const NO_KEEP = { data: false, text: false, swap: false };
  let keepRun = false;   // (the kept data card, the same instrument from slide to slide (the HVPG catheter run included): whatever the new slide's layout does to it, it is never let go and built again)
  // What a data card is made of for slide i, or null (no card), or undefined (not yet known: a state its tiles' ring is counted from is still being computed).
  function planOf(s, i) {
    if (!hasCard(s)) return null;
    const d = deltaOf(s, i);
    if (d === true ? i > 0 && !live.states[live.stateOf[i - 1]] : typeof d === 'string' && !fpOf(d)) return undefined;
    return dataPlan(s, { keys: tileKeys(s), ref: !!refOf(s, i), title: cardTitle(s), ghost: s.tool ? toolGhost(s, i) : null, under: under(s), sin: sinTiles(s) });
  }
  // A card standing whole (not on its way in or out, not half folded or pulled) can be kept.
  const dataStands = () => { const d = live.ui.data; return !d.hidden && !throwLeaving(d) && !throwHeld(d) && !d.classList.contains('pz-hide') && !d.classList.contains('pz-sliding') && !['gone', 'prep', 'hold', 'colswap', 'folding'].some((k) => k in d.dataset); };
  const textStands = () => { const t = live.ui.text; return !t.hidden && !throwBusy(t) && !throwBusy(live.ui.shade) && !!t.childElementCount && !t.classList.contains('pz-leave') && !live.ui.root.classList.contains('pz-prep'); };
  // Which cards slide `to` keeps from the slide on screen (prev). A change cut short, a start, a slide drawn again for a new text size, a case card,
  // a catheter, a time-lapse or a question (card-keep.js) keep nothing.
  function keepFor(prev, s, to, swap, o) {
    live.keepSnap = null; live.keepBad = []; keepRun = false;
    if (!live.ui || !prev || live.booting || reduce.matches || live.caseLift || live.caseCard || o.again || !live.states[live.stateOf[to]] || (to > 0 && !live.states[live.stateOf[to - 1]])) return NO_KEEP;   // (the states a tile's ring and the readings come from must be in)
    const data = dataStands() && keepData({ from: live.dataOn, to: planOf(s, to), prev, next: s, swap, again: o.again });
    keepRun = !!data;   // (the same instrument stays mounted whatever the new slide's layout does to its size, fold or class: only its data changes)
    const text = textStands() && keepText({ from: live.textOn, to: textPlan(s), prev, next: s, swap, again: o.again });
    if (!data && !text) return NO_KEEP;
    live.keepSnap = { data: data ? cardSnap(live.ui.data) : null, text: text ? cardSnap(live.ui.text) : null };
    return { data, text, swap };
  }
  // Called after the layout passes with a card kept: one the layout changed is put back as it stood (nothing is painted changed) and noted,
  // and keepFall then lets it leave and builds it again.
  function keepNote() {
    if (!live.ui || !live.keepSnap) return;
    for (const k of ['data', 'text']) {
      if (k === 'data' && keepRun) continue;   // (the layout's size, fold or class stand as they are: a snap at worst, never the card leaving and coming back: Mohammad, 4 Nov 2026, "the card shouldn't hide and appear again; it's the same instrument and the data transitions")
      const sn = live.keepNow[k] && live.keepSnap[k];
      const why = sn ? cardChangedWhy(sn, k === 'data') : '';
      if (!why) continue;
      gpuProbe.note(`kept ${k} card let go: ${why}`);   // (so a ?perf copy says what changed)
      cardBack(sn);
      if (k === 'data') { clearTimeout(live.colT); live.colT = 0; }
      if (!live.keepBad.includes(k)) live.keepBad.push(k);
    }
  }
  // The data card kept: nothing is rebuilt. With the same patient the tiles take the slide's readings (their count eases) and the instrument is told
  // of the slide, as it is on every slide; with a new one the card waits for the model (followData).
  function dataKept(s, i, now) {
    if (live.keepNow.swap) return;
    if (s.tool) showTool(s, i);
    if (s.data) live.ui.tiles.paintTiles(respFp(s, now.fp), tileKeys(s), s.key || [], refOf(s, i), undefined, now.params?.tips?.on);
    live.ui.tools.pin(now.fp); live.ui.scope?.pin(now.fp);
  }
  // A kept data card with a new patient: its tiles and instrument ride the live model as it eases to the slide's state,
  // then land on the slide's own numbers.
  function followData(s, to, st, cut) {
    const ref = refOf(s, to);
    (async () => {
      while (!cut() && live.ui) {
        await waitCut(150, cut);
        if (cut() || !live.ui) return;
        // (The patient has landed, shownState set: the card takes the slide's own numbers and is done.)
        if (live.shownState === live.stateOf[to]) { if (s.tool) showTool(s, to); dataTo(s, st.fp, ref, 280); return; }
        const fr = store.get().frame;
        if (fr?.metrics) dataTo(s, liveFp(fr), ref, 280);
      }
    })();
  }
  // Each row of a table still computing fills in (its cells fade in) as its patient arrives. It is asked for by the table itself, as it is built, so
  // every way a table gets drawn (a slide landing, the card drawn again for a new text size, a kept panel) fills in, and a slide that is slow to
  // land (the model paused, a heavy figure) never leaves its cells blank for good. A table that has left the page is let go.
  const TABLE_WAIT_MS = 1500;   // motion-scale: not a move (a longest wait)
  function watchRows(el, s) {
    for (const k of new Set(rowIdx(s).filter((x) => !live.states[x]))) {
      // (R15: the rows are published at a safe boundary: not while the cards are still on their throws, then the layout they change is asked for once, R14.)
      stateReady(k).then(async (st) => {
        if (!st || !live.ui) return;
        if (live.thrown()) await Promise.all(throwCards().map((c) => c && throwLanded(c)));
        if (!live.ui || !el.isConnected) return;
        const t = summaryTable(s, k), sc = readMetric(el, 'scrollTop');
        el.replaceWith(t); t.scrollTop = sc;
        // (The new table is fitted as the one it replaces was: its head row set upright where the columns are narrow, the card zoomed to hold it.)
        live.fitDone.delete(live.ui.panel);
        if (!live.cardMoving()) layout(); else if (live.thrown()) layoutAtLanding();
      });
    }
  }
  const fpOf = (id) => { for (let i = 0; i < live.slides.length; i++) if (live.slides[i].id === id) return live.states[live.stateOf[i]]?.fp; return null; };
  setFpAt(fpOf);   // (for {key@slide} in the words: see liveVal)
  // What a deck visuals package's instrument, visual, column or figure hook gets for slide i (slide-ext.js): the slide, its
  // model state (snapshot, params, fingerprint), its extra work (st.extra, see stepOf), the live params (with any what-if slider
  // or compare button), other slides' fingerprints by id, the healthy fingerprint, and requests to the presenter's own
  // calculation worker (never the live model). P0.md in review/deck-visuals-build has the full list.
  function ctxOf(s, i) {
    const st = live.states[live.stateOf[i]] || null, d = live.deck;
    return {
      slide: s, index: i, deck: d, slides: live.slides, stage, store, app,
      state: st, snap: st?.snap ?? null, params: st?.params ?? null, fp: st?.fp ?? null,
      // (ref: the fingerprint the slide counts its changes from, its delta or its tool's; the beat-by-beat card draws where the patient stood)
      ref: s.tool || s.delta != null ? refOf(s.tool?.delta != null ? { ...s, delta: s.tool.delta } : s, i) : null,
      extra: live.states[i]?.extra ?? null,
      whenExtra: () => stateReady(i).then((x) => x?.extra ?? null),
      liveParams: () => store.get().params,
      fpOf, healthy: () => live.base,
      shown: () => live.deck === d && live.shown?.i === i,
      request: (type, payload = {}) => getCalc().request(type, payload),
      // (steps as stepOf makes them; from: the snapshot the first starts from, the slide's own by default. Resolves with each
      // step's { snap, params, fp, extra? }, or null when the worker failed.)
      run: (steps, from = st?.snap ?? null) => { const out = []; return getCalc().sequence(steps, from, (m) => { out[m.i] = { snap: m.snap, params: m.params, fp: m.fp, extra: m.extra, trail: m.trail }; }).then((end) => (end?.type === 'error' ? null : out)); },
    };
  }
  // A visual's rows: the deck's slides by id ('pvt', or { id, name } to name it), or { preset, name } patients that
  // no slide shows, computed after the slides.
  const rowAt = (o) => { const id = typeof o === 'string' ? o : o.id, i = id ? live.slides.findIndex((x) => x.id === id) : -1; return [i, i >= 0 ? live.stateOf[i] : live.extraOf.get(xKey(o))]; };
  const rowIdx = (s) => (s.of || []).map((o) => rowAt(o)[1]).filter((k) => k != null && k >= 0);
  function rowsOf(s) {
    return (s.of || []).map((o) => {
      const [i, k] = rowAt(o), sl = i >= 0 ? live.slides[i] : null, x = typeof o === 'object' ? o : {};
      if (k == null || k < 0) return null;
      const title = x.title ?? sl?.title ?? '';
      return { i, k, f: live.states[k]?.fp, kicker: x.kicker ?? sl?.kicker ?? '', title, name: x.name || title, short: x.short, site: x.site ?? sl?.site, note: x.note, blank: x.blank || [], miss: x.miss || [], missPart: x.missPart || [], ref: !!x.ref, vs: x.vs, key: x.key, calm: x.calm || [] };
    }).filter(Boolean);
  }
  // The six levels side by side (visual: 'ladders'), each patient's Gut to heart profile in a cell of its own, the healthy line named
  // on each and the resistance hatched red (one chart everywhere: Mohammad, 21 Oct, "Gut to heart is good, unify it"). Each cell's
  // first row names the site and the cause; no HVPG pill, its chart's bracket shows it (Mohammad, 21 Oct: "fit the name of the cause in
  // the first row ... and get rid of the HVPG, because it's on the graph!").
  // (A phone, upright or sideways, draws each case on one line instead, its readings with the red blocks, the stations named once over
  // them: Mohammad, 21 Oct, "for phone, we should just make it one line with the red block of course, similar to what we had before".
  // Two copies of the names, for a phone on its side's two columns.)
  // (The first row's cause steps down to fit beside the site, never under 12 px on the screen, never wrapped or cut. fitRow measures the
  // laid-out row, the site's width and the gap against the cause's own, not an estimate; a cause that still does not fit at 12 px goes
  // under the site, whole, so no case's cause runs out of its card: causeFit. Mohammad, 21 Oct: "SOS doesn't fit text wise".)
  // (A phone's row also holds the case's HVPG and PPG pills at its right end, which the cause keeps clear of: Mohammad, 23 Oct.)
  const fitRow = (k) => {
    const t = k?.querySelector('.pz-cell-t'), tag = k?.firstElementChild, pills = k?.querySelector('.pz-gpills');
    if (!t || !tag) return;
    t.style.removeProperty('font-size'); k.classList.remove('under');
    if (!readMetric(t, 'offsetWidth')) return;
    // (z: the row's zoom on the screen, so the floor is 12 px there; the room is what the row holds, less 1 px for the three widths' rounding)
    const z = Math.min(2, Math.max(0.5, readBox(k).width / readMetric(k, 'offsetWidth') || 1)), fs = parseFloat(readStyle(t).fontSize) || 12;
    const gap = parseFloat(readStyle(k).columnGap) || 0, room = readMetric(k, 'clientWidth') - readMetric(tag, 'offsetWidth') - gap - (readMetric(pills, 'offsetWidth') ? readMetric(pills, 'offsetWidth') + gap : 0) - 1;
    let fit = causeFit(fs, readMetric(t, 'offsetWidth'), room, 12 / z);
    // (Under the site it has the row to itself, as large as that holds, 12 px at least: with the pills at the row's right it is no longer
    // the stepped-down size of a cause squeezed beside them.)
    if (fit.under) fit = { ...causeFit(fs, readMetric(t, 'offsetWidth'), readMetric(k, 'clientWidth') - 1, 12 / z), under: true };
    if (fit.size !== fs) t.style.fontSize = `${fit.size.toFixed(2)}px`;
    k.classList.toggle('under', fit.under);
  };
  const rowRO = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => es.forEach((e) => fitRow(e.target.closest('.pz-cell-k')))) : null;
  // (A wide screen's chart in each cell is the data card's instrument, drawn once at the instrument's own size and scaled down as one piece to its cell
  // (Mohammad, 28 Oct, Sites 10: "each cell to be the instrument drawn exactly, scaled down"): the same layout, label places, plot shape and
  // relative type; chartScale. Its words never come under 12 px on the screen: where the scale would take them, the picture is drawn in
  // larger type by s and scaled by the same k. The holder takes the scaled height; styles/app.css .pz-cc.)
  const fitChart = (cc, P) => {
    const p = cc?.firstElementChild;
    if (!p) return;
    const s0 = parseFloat(cc.style.getPropertyValue('--lad-s')) || 1, W = readMetric(cc, 'clientWidth'), w0 = readMetric(p, 'offsetWidth'), f0 = (parseFloat(readStyle(p).fontSize) || 0) / s0;
    if (!(W > 0 && w0 > 0 && f0 > 0)) return;
    const { k, s } = chartScale(W, w0, f0), ks = k.toFixed(4), ss = s.toFixed(4);
    if (cc.style.getPropertyValue('--lad-k') !== ks) cc.style.setProperty('--lad-k', ks);
    // (The box stays the instrument's, so a new type size is no change of box: the chart is drawn again for it.)
    if (cc.style.getPropertyValue('--lad-s') !== ss) { cc.style.setProperty('--lad-s', ss); P.redraw(); }
  };
  const chartOf = new WeakMap();
  const chartRO = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => es.forEach((e) => { const c = chartOf.get(e.target); if (c) fitChart(c.cc, c.P); })) : null;
  function laddersGrid(s) {
    const grid = h('div', { class: 'pz-grid' });
    grid.append(h('div', { class: 'pz-grid-head', 'aria-hidden': 'true' }, createProfileStrip(true).el, createProfileStrip(true).el));
    for (const r of rowsOf(s)) {
      if (!r.f) continue;
      const P = createProfileTool(), S = createProfileStrip();
      P.configure({ kind: 'profile' }, { fp: r.f, healthy: () => live.base });
      S.set(r.f, () => live.base);
      // (A phone shows the case's HVPG and PPG as two pills at the right of this row, tinted as the chart's brackets rate them; a wide screen's
      // chart carries them, so there they stay hidden: styles/app.css .pz-gpills.)
      const k = h('div', { class: 'pz-cell-k' }, h('div', { class: 'pz-kick', 'data-site': r.site || 'none' }, headOf(r)),
        h('div', { class: 'pz-cell-t' }, r.name),   // (a row's `name` where its title is too long for the first row: Sites 10 "Sinusoidal obstr. synd.")
        h('div', { class: 'pz-gpills' }, pillReadings(r.f).map((q) => h('span', { class: 'pz-gpill', 'data-k': q.k, 'data-rate': q.rate }, h('span', { class: 'k' }, `${q.name} `), q.v))));
      rowRO?.observe(k); for (const c of k.children) rowRO?.observe(c);   // (and the site, the cause and the pills themselves: a font loading late widens them, not the row)
      const cc = h('div', { class: 'pz-cc' }, P.el);
      chartOf.set(cc, { cc, P }); chartOf.set(P.el, { cc, P });
      chartRO?.observe(cc); chartRO?.observe(P.el);   // (the room it has, and the instrument's own size, which follows the window)
      grid.append(h('div', { class: 'pz-cell' }, k, cc, S.el));
    }
    // (The panel's dimming while one cell is zoomed: out of the grid's flow, over the panel and under the cell that is zoomed; styles/app.css .pz-gscrim.)
    grid.append(h('div', { class: 'pz-gscrim', 'aria-hidden': 'true', onclick: () => live.ui?.zoom.close().then(live.paintZoom) }));
    return grid;
  }
  // Purpose-drawn arrows: a solid head on a shaft of real weight, one per symbol; a large change is two arrows side by side.
  // A thin dash means unchanged / normal. Drawn on one grid so they sit on the table's cap height. n: 2 / 1 up, -1 / -2 down, 0 the dash.
  // A change's arrow: one, two, or a level dash, drawn by the stylesheet as plain shapes (app.css .pz-ag: a clip path on a box of
  // its colour, no SVG), composited with the card's own layer.
  function arrowEl(n) {
    const el = document.createElement('span'), m = Math.abs(n);
    el.className = `pz-arr${n < 0 ? ' dn' : ''}${n === 0 ? ' zero' : ''}${m === 2 ? ' two' : ''}`;
    el.setAttribute('aria-hidden', 'true');
    const g = document.createElement('i');
    g.className = 'pz-ag';
    for (let k = 0; k < Math.max(1, m); k++) g.append(document.createElement('i'));
    el.append(g);
    return el;
  }
  // A cell that cannot be measured: a hollow ring, never the dash that means normal.
  const noneEl = () => h('span', { class: 'pz-nm', 'aria-hidden': 'true' }), NOT_MEASURABLE_LC = NOT_MEASURABLE.toLowerCase();
  // A cell whose patient is still being computed: empty (never "…": no ellipsis anywhere), said so to a screen reader; its numbers fade in
  // when the patient arrives (watchRows).
  // (R15: not blank, and the width of a number: a bar the size of a value, faint, so the row keeps its height and the column its width when the
  // number arrives; the screen reader still hears 'calculating'.)
  const pendEl = () => h('td', { class: 'num pend', 'aria-busy': 'true' }, h('span', { class: 'pz-pendbar', 'aria-hidden': 'true', style: { display: 'inline-block', width: '2.4em', height: '.55em', borderRadius: '.3em', background: 'currentColor', opacity: '0.22', verticalAlign: '-.05em' } }), h('span', { class: 'sr-only' }, 'calculating'));
  // A legend line with its symbols drawn as the table's own: arrows, the dash (•) and the ring (○).
  const withArrows = (t) => t.split(/(↑↑|↓↓|↑|↓|•|○)/).map((x) => (x === '↑↑' ? arrowEl(2) : x === '↓↓' ? arrowEl(-2) : x === '↑' ? arrowEl(1) : x === '↓' ? arrowEl(-1) : x === '•' ? arrowEl(0) : x === '○' ? noneEl() : x));
  const WORD = { 2: 'well above normal', 1: 'above normal', 0: 'normal', '-1': 'below normal', '-2': 'well below normal' };
  const WORDREL = { 2: 'much higher', 1: 'higher', 0: 'unchanged', '-1': 'lower', '-2': 'much lower' };
  const unitOf = (k) => (k === 'varix' || k === 'gv' ? ' mm' : k === 'asc' ? ' L' : k === 'liver' || k === 'shunt' ? '%' : k === 'hr' ? '/min' : k === 'res' ? ' mmHg per L/min' : PRESS.has(k) ? ' mmHg' : TILE[k]?.u ? ` ${TILE[k].u}` : '');
  const UNIT_WORDS = { press: 'pressures in mmHg', varix: 'varix diameter in mm', gv: 'fundal varix diameter in mm', asc: 'ascites in liters', liver: 'hepatic blood flow in % of normal', shunt: 'shunted blood in %', plt: 'platelets × 10³/µL',
    lsm: 'liver stiffness in kPa', ssm: 'spleen stiffness in kPa', hr: 'heart rate in beats/min', pvFlow: 'portal flow in L/min', res: 'intrahepatic resistance in mmHg per L/min', spleen: 'spleen length in cm', co: 'cardiac output in L/min', bv: 'blood volume in L' };
  const colExt = (k) => (!COLS[k] && Object.hasOwn(EXT.columns, k) ? EXT.columns[k] : null);
  // How wide a table wants to be, in em of its body text: the row names, each value column, a Doppler trace's column, the ascites pair
  // and each note column. The wide card is this wide (never wider than the reading width), so the columns stand close to their content.
  function tableUnits(s) {
    const cols = s.cols || [], notes = s.note ? [s.note].flat().length : 0;
    return 14 + cols.reduce((a, k) => a + (k === 'wave' ? 14 : 8), 0) + ((s.asc ?? !s.cols) ? 16 : 0) + (s.cols ? 0 : 56) + 14 * notes;
  }
  function summaryTable(s, arrived = -1) {
    const cols = s.cols || ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg'], ascCols = s.asc ?? !s.cols, rows = rowsOf(s);
    const perRow = rows.some((r) => r.vs), rel = s.vs === 'first' || perRow;
    const notes = s.note ? [s.note].flat() : [];
    // Pressures always in whole mmHg (the model is not that precise); litres, kPa and flow keep their decimal.
    const val = (k, f) => { const v = fpv(k, f); return v == null ? '—' : k === 'map' ? bpText(f?.sbp, f?.dbp, v) : PRESS.has(k) ? fmt(v, pressDp(k)) : k === 'res' ? fmt(v, 1) : tileVal(k, v); };
    const first = rows[0]?.f;
    // A row's 'vs' names a slide, or the key of a patient row no slide shows (the same liver without collaterals).
    const vsRow = (r) => rows.find((x) => x.key === r.vs || (x.i >= 0 && live.slides[x.i]?.id === r.vs));
    const refOfRow = (r) => (r.vs ? vsRow(r)?.f ?? fpOf(r.vs) : first);
    // (Lower-cased mid-sentence, but an acronym such as CSPH or TIPS stays as it is.)
    const lc = (t) => (/^[A-Z]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));
    const vsName = (r) => { const t = vsRow(r); return lc(t?.title || live.slides.find((x) => x.id === r.vs)?.title || ''); };
    // The reference row (the healthy patient, or the baseline) keeps its numbers, the anchor for the arrows.
    const isRef = (r, n) => !!r.ref || (rel && !r.vs && n === 0);
    // focusRow (V15, opt-in): lights one row; the others recede.
    const focus = focusOf(s);
    const cell = (k, r, n) => {
      if (r.blank.includes(k)) return h('td', { class: 'num blank', title: NOT_MEASURABLE }, noneEl(), h('span', { class: 'sr-only' }, NOT_MEASURABLE_LC));
      if (!r.f || (rel && !isRef(r, n) && !refOfRow(r))) return pendEl();
      if (k === 'spleen' && !(fpv(k, r.f) > 0)) return h('td', { class: 'num none' }, 'Removed');
      if (isRef(r, n)) return h('td', { class: 'num ref', 'data-rate': rel ? null : rateAbs(k, dirAbs(k, r.f)) }, val(k, r.f));
      const ref = refOfRow(r), d = rel ? (ref ? dirRel(k, r.f, ref) : 0) : dirAbs(k, r.f), v = val(k, r.f) + unitOf(k);
      // Against normal, the colour follows the arrows (amber above, red well above); against a baseline, better or worse,
      // except where a change is neither ('calm': a meal's small PPG rise, the HVPG's dip as a clot diverts portal flow).
      const calm = (s.calm || []).includes(k) || r.calm.includes(k);
      // (miss, missPart: a gradient that does not span this patient's resistance, or spans only part of it (the Gradients talk's summary): its arrow
      // dimmed, with an outlined tag that says so.)
      const miss = r.miss.includes(k) ? 'Misses' : r.missPart.includes(k) ? 'Misses part' : '';
      return h('td', { class: 'num dir' + (d ? '' : ' zero') + (rel ? ' rel' : '') + (miss ? ' miss' : ''), 'data-rate': rel ? null : rateAbs(k, d), 'data-eff': rel && !calm ? effOf(k, d) : null, title: miss ? `${v}, ${miss.toLowerCase()} the resistance` : v },
        arrowEl(d), miss ? h('span', { class: 'pz-miss', 'aria-hidden': 'true' }, miss) : null, h('span', { class: 'sr-only' }, `${rel ? WORDREL[d] : WORD[d]}, ${v}${miss ? `, ${miss.toLowerCase()} the resistance` : ''}`));
    };
    // A column a deck visuals package registers (slide-ext.js columns) for a key the table does not know: its heading, cut-off note,
    // unit words and cells are its own; a row not yet computed waits, and a row's blank columns show the ring, as the others do.
    const extCell = (k, r, n) => {
      if (r.blank.includes(k)) return h('td', { class: 'num blank', title: NOT_MEASURABLE }, noneEl(), h('span', { class: 'sr-only' }, NOT_MEASURABLE_LC));
      if (!r.f) return colExt(k).pend?.() ?? pendEl();
      const c = safe(() => colExt(k).cell({ ...r, state: live.states[r.k] ?? null, ref: refOfRow(r) ?? null, isRef: isRef(r, n) }, ctxOf(s, live.slides.indexOf(s))), null, `columns.${k}`);
      return c?.tagName === 'TD' ? c : h('td', { class: 'num' }, c ?? '—');
    };
    // Ascites as two columns, SAAG and protein, one arrow each; "None" spans both when there is no fluid.
    const ascCells = (r, n) => {
      if (!r.f) return [pendEl(), pendEl()];
      if (r.f.asc < NO_ASC) return [h('td', { class: 'num none', colspan: '2' }, 'None')];
      const hiS = saagPortal(r.f.saag), hiP = tpHigh(r.f.tp);
      if (isRef(r, n)) return [h('td', { class: 'num ref', 'data-rate': hiS ? 'hi' : null }, fmt(r.f.saag, 1)), h('td', { class: 'num ref' }, fmt(r.f.tp, 1))];
      return [h('td', { class: 'num dir', 'data-rate': hiS ? 'hi' : null, title: `SAAG ${fmt(r.f.saag, 1)} g/dL` }, arrowEl(hiS ? 1 : -1), h('span', { class: 'sr-only' }, `SAAG ${hiS ? `${SAAG_PORTAL} or more` : `under ${SAAG_PORTAL}`}, ${fmt(r.f.saag, 1)}`)),
        h('td', { class: 'num dir', title: `Protein ${fmt(r.f.tp, 1)} g/dL` }, arrowEl(hiP ? 1 : -1), h('span', { class: 'sr-only' }, `protein ${hiP ? `${TP_HIGH} or more` : `under ${TP_HIGH}`}, ${fmt(r.f.tp, 1)} g/dL`))];
    };
    // One legend, built from the table itself: what the arrows compare with, the reference row's units, the ring.
    const units = [...new Set(cols.map((k) => (PRESS.has(k) ? 'press' : k)).filter((k) => UNIT_WORDS[k]))].map((k) => UNIT_WORDS[k]);
    for (const k of cols) if (colExt(k)?.unit) units.push(colExt(k).unit);
    if (ascCols) units.push('SAAG and protein in g/dL');
    const refTitle = first ? lc(rows[0].title) : 'the baseline';
    const key = rel
      ? `↑ higher, ↓ lower than ${perRow ? 'the row named under each' : refTitle}; ↑↑ ↓↓ by ≥40%; • unchanged${cols.some((k) => k !== 'pvFlow') ? '. Green better, red worse' : ''}`
      : `↑ above normal, ↓ below; ↑↑ ↓↓ past the red cut-off of that column (tap a heading for it); • within normal`;
    const legend = [key, rows.some((r) => r.blank.length) ? `○ ${NOT_MEASURABLE_LC}` : '', units.length && rows.some((r, n) => isRef(r, n)) ? `Top row: ${units.join(', ')}` : '', s.foot || '']
      .filter(Boolean).map((x) => x.replace(/\.$/, '')).join('. ') + '.';
    // A heading's cut-offs: its tooltip on hover, and a line under the legend on a tap (a touch screen shows no tooltip).
    const cutLine = h('span', { class: 'pz-cutl' });
    const showCut = (k) => (e) => { if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') { e.preventDefault?.(); e.stopPropagation?.(); cutLine.replaceChildren(h('b', {}, `${COLS[k] || colExt(k)?.heading || k}: `), ...withArrows((CUT[k] ?? colExt(k)?.cut) + '.')); } };
    const cutTh = (k, label, cut) => h('th', { class: 'num', title: cut || null, ...(cut ? { tabindex: '0', onclick: showCut(k), onkeydown: showCut(k) } : {}) }, label);
    const go1 = (r) => (e) => { if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') { e.preventDefault?.(); go(r.i); } };
    // (long: seven rows or more; a class, not :has(), which made every table cell part of each restyle the page did)
    // (notecols: few enough columns that an upright tablet keeps each note in a column of its own under its heading, as on its side)
    const noteCols = notes.length && cols.length + (ascCols ? 2 : 0) + notes.length <= 4;
    // (A row under one with the same heading in the same site's colour is a continued row (pz-cont): the heading is printed once, over the first of
    // them, and the rest follow it under a lighter rule, so the learner reads "Nonselective beta-blocker" once, not twice. It stays in the
    // row for a screen reader (the phone's compact rows show the heading over the name in words too, no stroke). table-continued-rows.test.js)
    const el = h('div', { class: 'pz-table' + (rows.length >= 7 ? ' long' : '') + (noteCols ? ' notecols' : '') + (focus ? ' pzv-focused' : '') }, h('table', { style: { '--nc': String(cols.length + (ascCols ? 2 : 0)), '--nn': String(notes.length), '--asc-w': '0px' } },
      h('thead', {}, h('tr', {}, h('th', {}, s.rowHead || 'Level'), cols.map((k) => cutTh(k, COLS[k] || colExt(k)?.heading || k, CUT[k] ?? colExt(k)?.cut)),
        ascCols ? [cutTh('saag', h('abbr', { title: 'Serum-ascites albumin gradient' }, 'SAAG'), CUT.saag), cutTh('tp', h('abbr', { title: 'Ascitic fluid total protein' }, 'Prot.'), CUT.tp)] : null,
        notes.map((x) => h('th', { class: 'nh' }, x)))),
      h('tbody', {}, rows.map((r, n) => h('tr', { ...(r.i >= 0 ? { tabindex: '0', onclick: go1(r), onkeydown: go1(r), 'aria-description': 'Press Enter to go to this slide' } : {}),
          class: [r.i >= 0 ? '' : 'static', focus && (r.key === focus || (r.i >= 0 && live.slides[r.i]?.id === focus)) ? 'pzv-focus' : '', sameHead(rows[n - 1], r) ? 'pz-cont' : ''].filter(Boolean).join(' ') || null,
          'data-arrived': r.k === arrived || (rel && n > 0 && (r.vs ? vsRow(r)?.k : rows[0].k) === arrived) ? '' : null },
        h('th', { scope: 'row' }, h('span', { class: 'pz-kick', 'data-site': r.site || 'none' }, headOf(r)), h('span', { class: 'tw' }, h('span', { class: 'tn' }, nb(r.title)),
          r.vs ? h('span', { class: 'vs' }, `vs ${vsName(r)}`) : null)),
        cols.map((k) => (colExt(k) ? extCell(k, r, n) : cell(k, r, n))),
        ascCols ? ascCells(r, n) : null,
        notes.map((_, j) => h('td', { class: 'note' }, [r.note].flat()[j] || '')))))),
    h('p', { class: 'pz-foot' }, withArrows(legend), cutLine));
    watchRows(el, s);
    return tableRoles(el);   // (a phone's CSS makes its parts block and grid boxes: the roles are written out, PC-4)
  }
  return { NO_KEEP, TABLE_WAIT_MS, ctxOf, dataIn, dataStands, deckTab, fadeLeft, followData, holdAnswer, keepFor, keepNote, laddersGrid, planOf, questionable, refOf, rowIdx, rowsOf, summaryTable, textIn, wordsFreeze, wordsIn };
}
