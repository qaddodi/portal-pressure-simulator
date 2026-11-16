// The case card
// (moved out of presenter.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { tileKeys as cardKeys } from './card-tiles.js';
import { D_SURFACE, easeArrive } from './ease.js';
import { nb } from './glue.js';
import { readMetric, readStyle } from './layout-snap.js';
import { fadeMs as fadeLen, reduceMotionMQ as reduce } from './motion.js';
import { liveFp } from './presenter-cards.js';
import { trailReading } from './flow-time.js';
import { rich } from './presenter-words.js';
import { glideOpacity, glideStop, glideTranslate } from './script-glide.js';
import { figureHooks } from './slide-ext.js';
import { store } from './store.js';
import { tileShown } from './table-marks.js';
import { clamp, h } from './util.js';

export function createCase(st, live) {
  const { CATH_SETTLE_MS, announce, applyState, bedside, caseGone, cath, drawn, evKept, figureIn, host, lapseText, loading, morphTo, paintChrome, pushEnd, pushTo, releaseData, stage, stateReady, stopLapse, toAnatomy, until, view, waitCut } = st;
  // (Where its lines start: the state the slide opened on, its before state on a slide whose own patient has had it. Where they end, when the
  // slide's own state has it done (its scale then holds both); else the scale holds the start, and a fall from it.)
  function evStart(st) {
    if (!live.evg) return;
    const { spec, s, i } = live.evg, own = live.stateOf[i] === i ? live.states[i] : null, had = !!own?.before;
    const b = (had ? own.before.fp : st?.fp) || null;
    if (!b) return;
    const end = had ? own.fp : null, lines = spec.lines;
    const kept = live.procDoneAt === live.evg.i ? evKept.get(s) || null : null;
    live.evg.ft.set(spec, [b[lines[0]], b[lines[1]]], end ? [end[lines[0]], end[lines[1]]] : null, kept);
  }
  // What liveSet is handed at the change: it lets the model run its own course (no settling) and gives each reading to the graph, until the
  // graph's seconds have run; the tiles stop on the same reading the graph ends on.
  function evRun(s, i) {
    if (!live.evg || live.evg.s !== s || live.evg.i !== i) return null;
    const g = live.evg;
    g.ft.start();
    return {
      secs: g.ft.secs,
      sample(t, f) { if (live.evg !== g) return true; g.ft.push(t, f[g.spec.lines[0]], f[g.spec.lines[1]]); return t >= g.ft.secs; },
      end() { if (live.evg === g) { const k = g.ft.kept(); if (k) evKept.set(g.s, k); } },
    };
  }
  function evBack(s) { if (live.evg?.s === s) { live.evg.ft.reset(); evKept.delete(s); } }
  function paintLapse(s, d, n, done = false) {
    const el = live.ui?.text.querySelector('.pz-lapse');
    if (!el) return;
    el.style.setProperty('--k', (n ? d / n : 0).toFixed(3));
    const t = el.querySelector('.pzl-t > .pzv-t'), words = lapseText(s, d, n, done);
    if (t.textContent !== words) t.textContent = words;
    el.classList.toggle('done', done);
  }
  // (card-tiles.js: a chart over the days drops tiles for its own two lines on a laptop or tablet, a ladder its HVPG and PPG.)
  const tileKeys = (s) => cardKeys(s, live.phone());
  // The HVPG response tile (slide field hvpgResp: a slide id, or true for the slide before; card C3, 25 Oct): the percent fall in the
  // HVPG from that slide's, read live as the other tiles are (a compare button or a time-lapse moves it).
  function respFp(s, f) {
    if (!s?.hvpgResp || !f) return f;
    const i = live.slides.indexOf(s), base = i > 0 ? live.refOf({ delta: s.hvpgResp }, i)?.hvpg : null;
    return base > 0 && f.hvpg != null ? { ...f, hvpgFall: ((base - f.hvpg) / base) * 100, respFrom: base, respAt: tileShown('hvpg', f.hvpg) } : { ...f, hvpgFall: null, respFrom: null, respAt: null };
  }   // (a ladder already brackets the HVPG and PPG: tiles there would repeat them, rounded differently)
  // The words of a time-lapse slide state where the days end (Two lesions 3, play-test 16 Nov 2026: "ending at 21.2 mmHg" for ten seconds, then 18.6; Carvedilol 3:
  // "LSM 17.1 kPa, which meets ≥25 kPa"): their pills take the end state's number from the first frame, here when the end is ready if the line was typeset
  // before it was (presenter-question.js textIn types it from the end state when that is ready). Only the tiles and the chart move with the days.
  function chipsTo(s, f) {
    const line = s.line && f && live.ui?.text.querySelector('.pz-line');
    if (!line) return;
    const have = line.querySelectorAll('.pz-val'), to = h('p', {}, ...rich(s.line, s, f, !!store.get().params?.tips?.on)).querySelectorAll('.pz-val');
    if (!have.length || have.length !== to.length) return;
    have.forEach((el, k) => {
      const n = to[k];
      if (el.textContent !== n.textContent) el.textContent = n.textContent;
      if (el.className !== n.className) el.className = n.className;
      if (el.style.cssText !== n.style.cssText) el.style.cssText = n.style.cssText;
      if (el.dataset.rate !== n.dataset.rate) { if (n.dataset.rate) el.dataset.rate = n.dataset.rate; else delete el.dataset.rate; }
    });
  }
  function dataTo(s, f, ref, ms) {
    if (!live.ui) return;
    if (s.data) live.ui.tiles.paintTiles(respFp(s, f), tileKeys(s), s.key || [], ref, ms, store.get().params?.tips?.on, true);   // (live: held while the card moves, R19)
    live.ui.tools.pin(f); live.ui.scope?.pin(f);   // (an instrument's reading is the tiles' number, the scope view's too)
    // (and the catheter's callouts and its monitor, on a catheter slide whose compare buttons or time-lapse move the model)
    if (s.cath && cath.on && cath.fp) { cath.fp = f; if (s.monitor) live.mon?.set(s.monitor, f); }
    stage.siteFp?.(f);   // (and a callout's)
    figureHooks('update', f, s);   // (and a deck visuals package's, slide-ext.js)
  }
  const chartFp = (s, end, f, k) => (s.tool?.kind === 'flowtime' && s.tool.clock === 'days' && end.trail && s.tool.lines ? { ...f, ...trailReading(end.trail, s.tool.lines, k) } : f);
  async function playLapse(s, to, cut) {
    const end = await stateReady(live.stateOf[to]);
    if (!end || cut()) return;
    const days = s.days, d0 = store.get().frame?.day ?? 0, ref = live.refOf(s, to);
    live.lapseOn = true; live.lapseLeft = days;
    let seen = false;
    live.ui?.tools.progress(0, end.trail);
    chipsTo(s, end.fp);
    host.send({ type: 'lapse', days, speed: days / (s.lapse.seconds || 8), ramp: s.ramp || null, bedside: bedside(s) });
    pushTo(s, to, (s.lapse.seconds || 8) * 1000);
    paintChrome();
    figureHooks('lapse', s);   // (a deck visuals package's glow from the days' start: slide-ext.js)
    // (A cap: when no frame has moved the days on for three times the lapse's length, the worker has stalled or a message was lost;
    // the loop ends and the slide lands on its computed end, as for a finished lapse.)
    let dBest = -1, moveAt = performance.now();
    while (live.lapseOn && !cut()) {
      const fast = live.lapseLeft === 0;
      await waitCut(fast ? 60 : 150, cut);
      const fr = store.get().frame;
      // (A bedside lapse counts its days in lapseDay, which frames from before it started lack, and frames after it ended lack again.)
      if (fr?.lapseDay != null) seen = true;
      const d = clamp(bedside(s) ? fr?.lapseDay ?? (seen ? days : 0) : (fr?.day ?? d0) - d0, 0, days);
      if (live.lapseLeft) live.lapseLeft = days - d;
      paintLapse(s, d, days);
      live.ui?.tools.progress(d / days);
      // (Only once a day has run: before that the live figure is at the bedside, its numbers swinging with each beat, while
      // the card already shows the settled start.)
      // (The days' chart draws the worker's calmed trail, and its head prints the trail's number at this share of the days: the tiles take that same number for the chart's lines, so the two never part. The words stand at the end state.)
      // (The tiles show the days' number at once, never through the shown-state follower: the chart's head and the figure's pills print the same trail reading in the same
      // poll, and a follower's lag behind a fast time-lapse put the card 0.6 mmHg and 0.4 L behind them, and 0.9 L behind at the end: Ascites 3, play-test 16 Nov 2026.)
      if (fr?.metrics && d >= 1) dataTo(s, chartFp(s, end, liveFp(fr), d / days), ref, 0);
      if (d >= days && fr?.clock === 'hemo') break;
      if (d > dBest) { dBest = d; moveAt = performance.now(); } else if (performance.now() - moveAt > 3000 * (s.lapse.seconds || 8)) { live.degrade('lapse-stall'); break; }
    }
    if (!live.lapseOn || cut()) { stopLapse(); return; }
    live.lapseOn = false; paintChrome();
    pushEnd(s, to, fadeLen(600));
    paintLapse(s, days, days, true);
    live.ui?.tools.progress(1);
    // (The live days land a hair off the computed end: the last step eases there too.)
    live.shownState = -1;
    if (!await morphTo(end, cut, fadeLen(600), false)) return;
    live.shownState = live.stateOf[to];
    // A data card held through the days comes in now, already showing where they ended.
    const held = !!live.ui && 'hold' in live.ui.data.dataset;
    dataTo(s, end.fp, ref, held ? 0 : 700);
    if (held) releaseData();
  }
  // ── The case card ──
  // (caseLift: set while a case card is up; the first Next, swipe (on the card or anywhere) or tap on the card lifts it rather than changing the slide.)
  // The card goes up first; behind it the camera eases out to the whole patient, and only once it is still does the new patient
  // grow in, seen around the card (a camera move over a changing patient paints the organs whole every frame). The slide's words
  // are fitted unseen meanwhile; the tap lifts the card, the camera makes one eased zoom to the slide's own framing, and the
  // slide's cards come in once it has landed (see caseLifted, caseEnd).
  // The case card comes in and goes out on the frames (3 Nov 2026, "cards trailing behind": its CSS transition ran on the compositor a display
  // frame off the GPU glass drawn under it). Its class says where it ends (app.css .pz-case, .on); this writes the way there, inline, from
  // where it stands if it was still moving, and takes the inline values off once it has landed (the class holds them).
  const RISE_CASE = 14;   // (px: where a case card waits below its place, as app.css .pz-case)
  const caseFadeTokens = new WeakMap();
  function caseFade(c, on, ms) {
    // Replacing a fade resolves the previous glide's promise. Its continuation must not stop or clear the new fade.
    const token = {};   // alloc-rare: once when a case card begins or replaces a fade
    caseFadeTokens.set(c, token);
    if (ms <= 0) { glideStop(c); c.style.removeProperty('opacity'); c.style.removeProperty('translate'); return; }
    glideTranslate(c, 0, on ? RISE_CASE : 0, 0, on ? 0 : RISE_CASE, ms, easeArrive);
    glideOpacity(c, on ? 0 : 1, on ? 1 : 0, ms, easeArrive).then(() => { if (caseFadeTokens.get(c) === token && c.classList.contains('on') === on && on) { glideStop(c); c.style.removeProperty('opacity'); c.style.removeProperty('translate'); } });
  }
  // The glass card goes up, a case's or a question's: its words fitted before it enters, so it never resizes on screen.
  function cardUp(tag, ...words) {
    const c = live.ui.vcase, ms = fadeLen(D_SURFACE);   // (Reduce Motion: it fades, never pops)
    clearTimeout(live.caseHideT); live.caseHideT = 0;   // (the card is shown again: the timer of its last leaving has nothing left to hide)
    c.replaceChildren(h('span', { class: 'pz-site pz-case-tag' }, tag), ...words);
    const fading = c.classList.contains('on') ? false : c.style.opacity !== '' && c.style.opacity !== '0';   // (still fading out: it comes back from where it stands)
    for (const k of ['transform', 'transition']) c.style.removeProperty(k);   // (a card flung off last time comes back whole)
    if (!fading) for (const k of ['opacity', 'translate']) c.style.removeProperty(k);
    c.hidden = false; void readMetric(c, 'offsetWidth');
    // The words run 2.5x the teaching card's; on a short or narrow screen they ease down just enough to fit the card's room (set before it enters, so nothing resizes on screen).
    c.style.removeProperty('--case-k');
    for (let k = parseFloat(readStyle(c).getPropertyValue('--case-max')) || 2.5; k > 1.2 && readMetric(c, 'scrollHeight') > readMetric(c, 'clientHeight') + 1; k -= 0.1) c.style.setProperty('--case-k', k.toFixed(1));
    c.classList.add('on');
    caseFade(c, true, ms);
    // Lifting works from the moment the card is up: a tap, Next or a swipe anywhere fades it out at once, as a fling does, even
    // while the patient still loads behind it (the slide goes on into this same slide, its cards once loading ends). After
    // that Next and a swipe act as on any other slide.
    const card = live.caseCard = { c, ms, lifted: false, i: live.want };   // (i: the slide it came up for: slide-say.js, the reader's line)
    live.caseLift = () => caseGone(card);
    announce();   // (the card is the slide's first screen: the reader is told the slide now, not once its cards land)
    return card;
  }
  async function caseRun(s, si, st, cut, own = false, swapping = null) {
    // (A case may end on one short question of its own, caseQ, on its own line under the case: the card already holds the talk until it is
    // lifted, so the room has the pause to think.)
    const card = cardUp('Case', h('p', { class: 'pz-case-p' }, nb(s.vignette)), s.caseQ ? h('p', { class: 'pz-case-p pz-case-q' }, nb(s.caseQ)) : null);
    // (The figure dips as the card comes up, and stays dim while the camera backs out and the new patient is swapped in unseen: a dip, never a morph between two people.
    // Not figureOut: its loading arc would turn over the card's words. The way back is figureIn, below.)
    if (!own) view.classList.add('pz-out');
    await waitCut(card.ms, cut);
    if (cut()) return false;
    // The leaving slide's cards (faded out, still in place) no longer count for the framing: the wide view is the whole patient
    // around the case card. (The new slide's words set their own space again before the zoom to the slide: settleRun.)
    live.ui.safe.hidden = true;
    if (live.ui.data.classList.contains('pz-hide') && !live.ui.data.hidden) { clearTimeout(live.dataHideT); live.dataHideT = 0; live.ui.data.hidden = true; live.ui.tools.hide(); }
    // Behind the card: out of the liver, and out to the whole patient (unless the card was already lifted: the slide goes on from here).
    await toAnatomy(null, cut); if (cut()) return false;
    if (!card.lifted) {
      const gl = reduce.matches ? 300 : 1500;
      stage.fitSlow(gl);
      // (One move: the new patient starts as the camera is still, which the glide's own landing says (480 to 900 ms), not 1.5 s after it set off;
      // and at once when it was already the whole patient. Polled, so a card lifted or a newer slide is not waited behind.)
      await until(() => cut() || !stage.gliding(), gl + 600);
      await until(() => cut() || !stage.gliding(), 600); if (cut()) return false;
    }
    // Then, the camera still, the new patient eases in.
    live.liveOff = false; live.shownState = -1;
    // (A time-lapse's own start eases in as before, the days playing on from it; a new patient is swapped in under the dip and the figure comes back.)
    // (The slide's colours come in with its patient, unseen under the card: T1.)
    swapping?.();
    if (own) { if (!await morphTo(st, cut, fadeLen(1200))) return false; }
    else { applyState(st); await drawn(st); if (cut()) return false; figureIn(); }
    live.shownState = own ? -1 : si;   // (a time-lapse's own start is not a slide's state: the live figure plays the days from it)
    // (The fit follows what the new patient draws, a growing ascites or spleen: once the organs are back on their GPU copy, one
    // short ease takes it in, and none when it already fits.)
    if (!card.lifted) {
      await until(() => cut() || card.lifted || stage.organsSettled(), CATH_SETTLE_MS); if (cut()) return false;
      if (!card.lifted) stage.fitSlow(reduce.matches ? 300 : 900);
    }
    if (view.classList.contains('pz-out')) figureIn(); else loading(false);
    return !cut();
  }
  // A question card (slide field question): the case card's glass, tag and lift, with one question and no new patient. It comes up over the
  // figure as it stands: no camera retreat, no patient morph. The slide's cards wait behind it (the caseCard branches), the camera makes its
  // one move to the slide's framing as it lifts, and a slide that changes the model plays that change then (answerPlay, playLapse).
  async function questionRun(s, cut) {
    await waitCut(cardUp('Question', h('p', { class: 'pz-case-p' }, nb(s.question))).ms, cut);
    return !cut();
  }
  return { caseFade, caseFadeTokens, caseRun, dataTo, evBack, evRun, evStart, paintLapse, playLapse, questionRun, respFp, tileKeys };
}
