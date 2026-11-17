// The time-lapse and the procedure's graph
// (moved out of presenter.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { clotWords } from './callout-math.js';
import { CATH_END, cathLegs } from './cath-arrival.js';
import { attrSoon, runSoon } from './class-soon.js';
import { nb } from './glue.js';
import { liveText } from './live-text.js';
import { fadeMs as fadeLen, reduceMotionMQ as reduce } from './motion.js';
import { liveFp } from './presenter-cards.js';
import { LOBULE_CAM, PRESSURE_KEY, abChoice, keyNodes, lensSpec, slideLens } from './presenter-words.js';
import { procBlocked, procOffered, specOf } from './proc-anim.js';
import { expandIds } from './slide-ext.js';
import { store, setViewKey } from './store.js';
import { liveSettled, shownSig } from './table-marks.js';
import { clamp, fmt, h, paintRange } from './util.js';

export function createLapse(st, live) {
  const { CC, NEVER, cath, cathFrame, cathStop, cathTrack, clearPill, dataTo, figureOut, host, liveSet, morphTo, nextFrame, paintChrome, procAtOf, procHeld, procKind, procRingOf, procStop, procTarget, procThen, pushEnd, stage, stateReady, toAnatomy, viewSettled, waitCut, xKey } = st;
  const procBack = () => { live.procQueued = false; if (!procHeld() || live.shown?.i !== live.want || !live.procRun.back()) return false; procTarget(); return true; };
  // (A slide's steps: the procedure's, then its reading's if it has one, one more step on the same card.)
  const procSteps = (s) => [...(specOf(procKind(s))?.steps || [['play', procKind(s), '', procKind(s)]]), ...(procThen(s) ? specOf(procThen(s)).steps : [])];
  function procEl(s, i, st) {
    const kind = procKind(s), P = specOf(kind), p = st?.params || store.get().params, m = st ? null : store.get().frame?.metrics;
    // (BRTO and BATO only on a patient with gastric varices, or one who has had it already, so it plays from just before.)
    if (P && !procOffered(kind, p, m)) return null;
    const why = !P ? 'Unknown procedure.' : P.had(p) ? '' : procBlocked(kind, p, m);
    // The steps as a line of words, each after its number in the slides' own step circle ({#n}, as the Circulation slides number
    // theirs), the one on show lit: progress, never buttons (his ask, 29 Oct: Next plays them). The callout on the figure carries the
    // same number. One the patient cannot have shows dimmed with why.
    const steps = procSteps(s), cur = procAtOf(i), ring = procRingOf(i);
    // (A procedure whose steps carry a short line, st0[8] (EUS coils and glue), lists them all at once, one under the other: number, word and its line, the
    // steps played at full ink and the one on show lit. His ask, 10 Nov 2026, "do it except 10": nobody hovers in a lecture, so the sentence is on the card
    // from the start, at its full size. The long caption stays the title. On a phone's stacked card (.pz.stack) it is the one-line row again with the
    // lines hidden, so that card does not grow; TIPS, BRTO and BATO have none and keep the row.)
    const list = steps.length > 0 && steps.every((x) => x[8]);
    return h('p', { class: `pz-procs${list ? ' pz-procs-list' : ''}`, role: 'list', 'aria-label': `${P?.name || kind}, step by step: Next plays each step`, ...(why ? { 'data-why': why, title: why } : {}) },
      ...steps.flatMap((st0, k) => [k ? ' ' : null, h('span', { class: `pz-proc${k === cur ? ' on' : ''}${k < cur ? ' done' : ''}${k === ring ? ' at' : ''}`, role: 'listitem', 'aria-label': `Step ${k + 1}: ${st0[1]}${list ? `, ${st0[8]}` : ''}`, title: why || st0[2] },
        h('span', { class: 'pz-step', 'aria-hidden': 'true' }, String(k + 1)), nb(` ${st0[1]}`),
        list ? h('span', { class: 'pz-proc-line' }, ` ${st0[8]}`) : null)]).filter(Boolean));
  }
  // Out: the readings go, the balloon goes down and the catheter fades (at once when the figure is fading anyway).
  async function cathOut(fading, cut) {
    if (!cath.on) return;
    cath.beside = false;   // (the tracing no longer sets the balloon: it goes down with the catheter)
    if (!fading) {
      cath.show = []; cath.ring = null; cath.follow = false; cath.probeT0 = 0;
      cathTrack('balloon', 0, 400); cathTrack('column', 0, 400); cathTrack('opacity', 0, 650);
      await waitCut(reduce.matches ? 0 : 700, cut || NEVER);
    } else await figureOut(cut);
    cathStop();
  }
  // ── The catheter beside a tracing card. A slide whose data card is the HVPG catheter's tracing (tool: { kind: 'hvpg' }) with no catheter of its own
  // (no cath: step, so the slide's camera stays where it is) shows the catheter on the figure all the same, in the right hepatic vein, with its balloon
  // up while the tracing says "balloon up" (wedge pressure) and down for the free pressure: the card's own balloon (tool-hvpg.js watch) is the figure's.
  // The figure's labels stay on (keep) and the readings stay on the card, so nothing here touches a label. A slide in the lobule has no hepatic vein in view.
  const beside = (s) => s?.tool?.kind === 'hvpg' && !s.tool.catheter && !s.cath && !s.visual && !LOBULE_CAM.test(s.cam || '') && (s.view || 'anatomic') === 'anatomic';
  function cathBeside(b) {
    if (!cath.beside) {
      if (cath.on) return;   // (a procedure's or a catheter slide's own catheter is on the figure)
      cath.on = true; cath.beside = true; cath.keep = true; cath.t0 = performance.now(); cath.fp = null; cath.show = []; cath.cam = null;
      Object.assign(cath.v, { u: 0, balloon: 0, column: 0, opacity: 0 }); cath.ring = CC.free;
      cathFrame();
      cathTrack('opacity', 1, 400); cathTrack('u', 1, 1800);   // (in from the neck along the route, as it does on the catheter slides, the view where it is)
    }
    const v = cath.v;
    v.balloon = b;
    if (b >= 0.999) { cath.ring = CC.wedge; if (v.column < 1 && !cath.tr.column) cathTrack('column', 1, 1400); }   // (the still column fills once the balloon is up)
    else { cath.ring = CC.free; delete cath.tr.column; v.column = 0; }
  }
  // (What the tools hand a tracing card of a slide that has the catheter beside it: the card's balloon moves the figure's, and a card stood up starts the catheter.)
  const besideHook = { move: (v) => { if (cath.beside) cathBeside(v); }, start: (v) => { if (cath.beside || !cath.on) cathBeside(v); } };
  async function cathTo(mode, fp, cut, instant = false) {
    await toAnatomy(null, cut);
    if (store.get().view !== 'anatomic') { setViewKey('anatomy'); await viewSettled(cut, stage); }
    if (cut()) return;
    cath.beside = false; cath.keep = false;   // (a catheter kept from a tracing card's slide is this slide's own now)
    // (Not arrived at by Next: it stands where the journey would leave it, fading in where it was gone, and the camera makes the one glide, cath-arrival.js.)
    if (instant) {
      const end = CATH_END[mode] || CATH_END.route, was = cath.on && cath.v.opacity > 0.5;
      cath.tr = {}; Object.assign(cath.v, { u: 1, balloon: end.balloon, column: end.column, opacity: was ? 1 : 0 }); cath.show = [...end.show]; cath.ring = end.ring ? CC[end.ring] : null; cath.follow = false;
    }
    if (!cath.on) { cath.on = true; cath.t0 = performance.now(); cath.ostium = mode === 'blocked'; cathFrame(); }
    cath.fp = fp;
    const v = cath.v, ms = (m) => (reduce.matches ? 0 : m);
    if (instant) {
      if (!cath.on || v.opacity < 1) cathTrack('opacity', 1, 650);
      const leg = cathLegs(mode, 1, true)[0], at = ms(leg === 'route' ? 1300 : 1500);
      stage.cathFocus(leg, at, leg === 'tip' ? { both: true } : undefined); cath.cam = leg;
      await waitCut(at, cut); return;
    }
    // In along the route from wherever the tip is, the view following it down.
    if (v.u < 0.999) {
      cath.show = []; cath.ring = null;
      if (!stage.cathFocus('route', ms(1200), { near: true })) return;
      cath.cam = 'route';
      await waitCut(ms(1000), cut); if (cut()) return;
      const t = 3800 * (1 - v.u);
      cath.follow = true; cathTrack('u', 1, t);
      await waitCut(ms(t + 100), cut); cath.follow = false; if (cut()) return;
    }
    if (mode === 'route') {
      cath.show = []; cath.ring = null; cathTrack('balloon', 0, 500); cathTrack('column', 0, 500);
      if (cath.cam !== 'route') { stage.cathFocus('route', ms(1300)); cath.cam = 'route'; await waitCut(ms(1300), cut); }
      return;
    }
    // The tip close up (again each slide: the data card may have come or gone).
    stage.cathFocus('tip', ms(cath.cam === 'tip' ? 700 : 1500), { both: true }); 
    await waitCut(ms(cath.cam === 'tip' ? 700 : 1500), cut); cath.cam = 'tip';
    if (cut()) return;
    if (mode === 'blocked') {
      cath.show = ['occ']; cath.ring = null; cath.probeT0 = performance.now();
      await waitCut(ms(3800), cut); if (cut()) return;
      cath.show = ['abort']; cath.ring = CC.bad;
      return;
    }
    if (mode === 'free') { cath.show = ['f']; cath.ring = CC.free; cathTrack('balloon', 0, 500); cathTrack('column', 0, 500); return; }
    // Wedge: the balloon goes up just behind the tip, flow stops, the still column fills toward the sinusoids.
    if (v.balloon < 0.999) { cath.show = ['f']; cath.ring = CC.free; cathTrack('balloon', 1, 1800); await waitCut(ms(1900), cut); if (cut()) return; }
    cath.ring = CC.wedge;
    // The still column fills first and the pressure holds on its plateau; only then does the WHVP callout ease in,
    // and for the result slide the HVPG bracket follows it.
    if (v.column < 0.999) { cath.show = ['f']; cathTrack('column', 1, 1800); await waitCut(ms(1900), cut); if (cut()) return; await waitCut(ms(600), cut); if (cut()) return; }
    if (!cath.show.includes('w')) { cath.show = ['f', 'w']; if (mode === 'result') { await waitCut(ms(1500), cut); if (cut()) return; } }
    if (mode === 'result') { cath.show = ['sum']; cath.ring = null; }
  }
  const clotMarks = (marks, params) => marks.flatMap((m) => { if (!m.clot) return [m]; const t = clotWords(params?.thrombus?.[m.edges[0]]); return t ? [{ ...m, label: t }] : []; });
  const markFocus = (marks) => (marks.length ? { ...marks[0], marks } : null);
  // The veins a slide shows stented (its `stented`, edge ids or '@sets'): the figure draws the mesh over them and the cross-section its ring.
  // They land with the slide's marks; leaving a slide takes with it only those the next slide does not stent too, so a stent that stays stays.
  const stentedOf = (s) => (!s.visual && Array.isArray(s.stented) ? [...expandIds(s.stented)].filter((id) => typeof id === 'string') : []);
  const stentedKept = (s) => { const next = stentedOf(s); return (store.get().stented || []).filter((id) => next.includes(id)); };
  const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge({ ...(a[k] || {}) }, v) : v; return a; };
  function abSlow() { live.abGen++; }
  // The new treatment takes effect on the live figure at real time (a faster clock would make the Doppler and tracings
  // sweep faster while it settles); the ladder and tiles follow it.
  function abPick(s, i, k) {
    if (!live.deck || live.shown?.i !== i || live.slides[i] !== s) return;
    live.ui?.text.querySelectorAll('.pz-abb').forEach((b, j) => b.setAttribute('aria-pressed', String(j === k)));
    const c = abChoice(s.compare, k);
    if (c.kind === 'lens') { lensPick(c.lens, s); return; }
    if (c.kind === 'gate') { store.set({ dopGate: c.gate }); return; }
    if (c.kind === 'tool') { live.ui.tools.option(c.tool); return; }
    // (A treatment button pressed while the slide's time-lapse still plays ends the lapse first: two clocks must not drive the model.)
    if (live.lapseOn) stopLapse();
    // (So does a procedure, which glides home: the button's patient is shown as the slide frames it.)
    procStop(true);
    if (c.kind === 'state') { livePatient(s, i, s.compare[k]); return; }
    // (A button that changes parameters brings its words too, like one that switches the patient: its title and line, its pills read from the
    // state its readings settle at. One presenter for the configuration, the pressed state, the words and the pills: variantWords.)
    // (Only a row where some button speaks: a row of plain parameter buttons keeps the slide's words and the pills it came in with.)
    const wordy = s.compare.some((o) => o.title || o.line);
    liveSet(s, i, c.patch).then((settled) => {
      const fr = store.get().frame;
      if (!wordy || !settled || live.shown?.i !== i || live.slides[i] !== s || !fr?.metrics) return;
      live.variantWords?.(s, i, s.compare[k], { fp: liveFp(fr), params: store.get().params });
    });
  }
  const slideAt = (id) => live.slides.findIndex((x) => x.id === id);   // (a time-point button's slide, { label, slide })
  async function livePatient(s, i, o) {
    const g = ++live.abGen, mine = () => g === live.abGen && live.shown?.i === i && live.slides[i] === s && !!live.deck;
    const st = await stateReady(o.preset ? live.extraOf.get(xKey(o)) : live.stateOf[o.slide ? slideAt(o.slide) : i]);
    if (!st || !mine()) return;
    live.liveOff = true;
    live.variantWords?.(s, i, o, st);   // (the words follow the patient: presenter-question.js variantWords)
    const ref = live.refOf(s, i);
    let easing = true;
    (async () => {
      while (easing && mine()) {
        await waitCut(150, () => !mine());
        const fr = store.get().frame;
        if (easing && fr?.metrics && mine()) dataTo(s, liveFp(fr), ref, 280);
      }
    })();
    const done = await morphTo(st, () => !mine(), fadeLen(1200), false);
    easing = false;
    if (done && mine()) { dataTo(s, st.fp, ref, 280); abSlow(); }
  }
  // The slide's colour key on the figure (null: none); another lens fades the old key out, the new one in.
  function paintKey(k, s = null) {
    live.keyNow = k ? [k, s] : null;
    if (!live.ui) return;
    live.ui.text.classList.toggle('pz-keyed', !!k);
    live.ui.figKey.set(!!k, () => {
      live.ui.fk.replaceChildren(...(k ? keyNodes(k, s) : []));
      // (The key's words can arrive after the fit below, once the old key has faded: fitted again for its own words, not the old ones.)
      queueMicrotask(() => { if (live.ui) clearPill(); });
      live.ui.fk.classList.toggle('grad', !!k && typeof (lensSpec(k, s) || PRESSURE_KEY)[1] === 'function');
      { const [nm, bar, lo, hi] = lensSpec(k, s) || PRESSURE_KEY; live.ui.fk.setAttribute('aria-label', `Vessels colored by ${nm}${typeof bar === 'function' ? `, ${lo} to ${hi}` : ''}`); }
    });
    clearPill();   // (the words make room for the docked key's row, or give it back)
  }
  // A lens button ({ label, lens }): the figure crossfades to that lens and the key under the line follows; the model is untouched.
  function lensPick(l, s = null) {
    const lens = slideLens({ lens: l });
    if (store.get().colorMode !== lens) store.set({ colorMode: lens });
    paintKey(lens, s);
  }
  const LIVE_EASE = 1200, LIVE_SET = { type: 'setParams', params: null, settle: false, ease: LIVE_EASE }, LIVE_RUN = { type: 'run', running: true, clock: 'hemo', speed: 1 };
  // (The keys a what-if slide watches: the same for the slide until the screen changes shape, so made once for each.)
  const LIVE_KEYS = new WeakMap();
  function liveKeys(s) {
    const ph = live.phone(), c = LIVE_KEYS.get(s);
    if (c && c.ph === ph) return c.keys;
    // alloc-rare: made once for a slide, again only if the screen changes shape
    const keys = [...new Set([...live.tileKeys(s), ...(s.key || []), ...(s.tool?.kind === 'profile' ? ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg'] : [])])];
    // alloc-rare: made once for a slide, again only if the screen changes shape
    LIVE_KEYS.set(s, { ph, keys });
    return keys;
  }
  // A what-if slider (whatIf: { label, param, min, max, step, ends?, unit? }) drags one parameter of the live model
  // (or several together: param an array of paths, e.g. both lobes' fibrosis); the figure, the ladder and the tiles follow
  // it as with the buttons. It starts at the slide's own value (the first path's), and the slide's computed state comes
  // back whenever the slide is shown again.
  // With tool in place of param ({ label, tool: 'air', min, max, step, unit }) it moves one option of the slide's instrument and
  // leaves the model alone (no worker message, no live clock): it starts at the slide's own tool.air, and the instrument is
  // set to the slide's options again whenever the slide is shown.
  function whatIfEl(s, i, st) {
    const w = s.whatIf, paths = [].concat(w.param).map((p) => (p ? p.split('.') : []));   // (a tool slider has no param)
    const v0 = +(w.tool ? s.tool?.[w.tool] ?? w.min : paths[0].reduce((o, k) => o?.[k], st?.params) ?? w.min);
    const patchOf = (x) => paths.reduce((a, path) => merge(a, path.reduceRight((o, k) => ({ [k]: o }), x)), {});
    const input = h('input', { type: 'range', min: w.min, max: w.max, step: w.step ?? (w.max - w.min) / 20, value: v0, 'aria-label': `What if: ${w.label}` });
    // (A label that already names the unit, "Weeks pregnant", shows the bare number: "24", not "24 weeks".)
    const bare = !!w.unit && w.label.toLowerCase().startsWith(w.unit.toLowerCase());
    const fmtV = (x) => (w.unit ? `${fmt(x, w.step >= 1 ? 0 : 1)}${bare ? '' : ` ${w.unit}`}` : '');
    // The value sits in a box as wide as the widest it can take (live-text.js), so the words' row never reflows as a digit comes or goes.
    const out = liveText('output', 'pzi-v', [w.min, (w.min + w.max) / 2, w.max, v0].map(fmtV));
    // The tiles' scale bar made draggable: a dot for now, and a ring where the slide started, which stays behind as the learner
    // drags, so the distance moved shows (Mohammad's pick B, 17 Oct).
    const frac = (x) => (x - w.min) / (w.max - w.min);
    const track = h('div', { class: 'range-wrap', style: { '--s': String(clamp(frac(v0), 0, 1)) } }, h('span', { class: 'sl-start', 'aria-hidden': 'true' }), input);
    const paint = (x) => { paintRange(input, frac(x)); out.set(fmtV(x)); if (w.unit) attrSoon(input, 'aria-valuetext', fmtV(x)); };   // (a screen reader says "24 weeks", not 24: SHELL-13)
    let raf = 0;
    // (The frame's step and the task after it, made once with the slider: a drag's inputs ask for them and make no closure.)
    const sliderLive = () => liveSet(s, i, patchOf(+input.value));
    const sliderFrame = () => { raf = 0; runSoon(sliderLive); };
    input.addEventListener('input', () => {
      live.handOn = true;   // (before anything else: the instrument's option below leaves liveOff alone)
      paint(+input.value);
      if (w.tool) { live.ui?.tools.option({ [w.tool]: +input.value }); return; }   // (an instrument's option: the model is left alone)
      // (Paced to the frames, but the model change and what it wakes run in a task of their own straight after the frame: runSoon.)
      if (!raf) raf = nextFrame(sliderFrame);
    });
    // (A finished drag hands the arrow keys back to the slides.)
    input.addEventListener('pointerup', () => input.blur());
    paint(v0);
    return h('div', { class: 'pz-wi', role: 'group', 'aria-label': `What if: ${w.label}` },
      h('span', { class: 'pzi-l' }, h('span', { class: 'pzi-k' }, 'What if'), w.label),
      h('div', { class: 'pzi-t' }, w.ends ? h('span', { class: 'pzi-e' }, w.ends[0]) : null, track, w.ends ? h('span', { class: 'pzi-e' }, w.ends[1]) : null),
      w.unit ? out.el : null);
  }
  function stopLapse() { if (!live.lapseOn) return; live.lapseOn = false; host.send({ type: 'lapse', days: 0 }); live.shownState = -1; paintChrome(); }
  // A hold-to-strain button (strain: true, or { label }; Mohammad's pick, features item 42, 11 Nov 2026): a button that works only while it is held.
  // Pressed, it starts the engine's Valsalva (the chest and belly pressure builds over 1.5 s to 30 mmHg); let go, it falls back over 1.5 s, and
  // the readings follow the live model all the while, as a what-if slider's do. The press ends with the slide: leaving it, a lost pointer, a blur
  // or a hidden page lets go, so the model is never left straining. The engine lets go by itself after 30 s.
  const STRAIN_ON = { type: 'action', action: { kind: 'strain', on: true } }, STRAIN_OFF = { type: 'action', action: { kind: 'strain', on: false } };
  let strainHeld = false, strainGen = 0;
  function strainHold(s, i, on) {
    if (on === strainHeld || !live.deck || live.shown?.i !== i || live.slides[i] !== s) return;
    strainHeld = on;
    if (!on) { host.send(STRAIN_OFF); return; }
    // (A treatment button's rule: two clocks must not drive the model, so a time-lapse or a procedure in play ends first.)
    if (live.lapseOn) stopLapse();
    procStop(true);
    live.liveOff = true; live.handOn = true;
    host.send(LIVE_RUN); host.send(STRAIN_ON);
    strainFollow(s, i);
  }
  // The data card follows the model while the button is held, and until the readings have rested after it is let go (liveSet's rule).
  async function strainFollow(s, i) {
    const g = ++strainGen, ref = live.refOf(s, i), keys = liveKeys(s), mine = () => g === strainGen && live.shown?.i === i && !!live.deck;
    let sig = null, still = performance.now(), freed = 0;
    for (const t0 = performance.now(); mine();) {
      await waitCut(150, () => !mine());
      const fr = store.get().frame, now = performance.now();
      if (fr?.metrics && mine()) {
        const f = liveFp(fr), k = shownSig(f, keys);
        dataTo(s, f, ref, 280);
        if (k !== sig) { sig = k; still = now; }
      }
      if (strainHeld) { freed = 0; continue; }
      if (!freed) freed = now;
      if (liveSettled(now - freed, now - still)) break;
    }
    if (mine()) abSlow();
  }
  const onHidden = () => { if (document.hidden) strainStop(); };
  function strainStop() { if (strainHeld) { strainHeld = false; host.send(STRAIN_OFF); } }
  function strainEl(s, i) {
    const label = typeof s.strain?.label === 'string' && s.strain.label.trim() ? s.strain.label.trim() : 'Hold to strain';
    const b = h('button', { type: 'button', class: 'pz-abb pz-strain-b', 'aria-pressed': 'false', 'aria-label': `${label}: press and hold, let go to recover`, title: 'Press and hold' }, label);
    let down = false;
    const press = () => { if (down) return; down = true; b.setAttribute('aria-pressed', 'true'); strainHold(s, i, true); };
    const release = () => { if (!down) return; down = false; b.setAttribute('aria-pressed', 'false'); strainHold(s, i, false); };
    b.addEventListener('pointerdown', (e) => { if (e.button) return; try { b.setPointerCapture(e.pointerId); } catch { /* (no capture: the leave and cancel events below let go) */ } press(); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) b.addEventListener(ev, release);
    b.addEventListener('contextmenu', (e) => e.preventDefault());   // (a long press on a phone must not open a menu while the button is held)
    b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(); } });
    b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') release(); });
    return h('div', { class: 'pz-ab pz-strain', role: 'group', 'aria-label': 'Strain on the live model' }, b);
  }
  // Next during a time-lapse runs the days that are left in about 600 ms (the clock speeds up, the ramp is unchanged) and stops on its end.
  function skipLapse() {
    if (!live.lapseOn || live.lapseLeft < 1) return;
    host.send(bedside(live.slides[live.want]) ? { type: 'lapseFast', ms: 600 } : { type: 'run', speed: Math.max(1, live.lapseLeft / 0.6) });
    live.lapseLeft = 0; paintChrome();
    if (live.push?.i === live.want) pushEnd(live.slides[live.want], live.want, 600);   // (the push runs out with the days, from wherever it has reached)
  }
  // (A bedside time-lapse, lapse.clock 'seconds': the ramp plays on the seconds clock, so an instrument such as the Doppler keeps recording.)
  const bedside = (s) => s?.lapse?.clock === 'seconds';
  const lapseWords = (n) => (n >= 60 && n % 30 === 0 ? `${n / 30} months` : `${n} days`);
  const lapseText = (s, d, n, done) => (s.lapse.to ? (done ? s.lapse.to : `${s.lapse.from} → ${s.lapse.to}`) : done ? `${lapseWords(n)} later` : `Day ${Math.round(d)} of ${n}`);
  // The counter under the words: its box is as wide as the widest it says (the last day, or the words after it), so the bar beside it keeps one width
  // as the days run and the words change (live-text.js).
  const lapseRow = (s) => h('div', { class: 'pz-lapse' }, h('span', { class: 'pzl-bar' }, h('i')),
    liveText('span', 'pzl-t', [lapseText(s, 0, s.days, false), lapseText(s, s.days, s.days, false), lapseText(s, s.days, s.days, true)], lapseText(s, 0, s.days, false)).el);
  const evKept = new WeakMap();
  function evDrop() { live.evg = null; }   // (the graph is the data card's tool's: it lives with the card)
  return { LIVE_EASE, LIVE_RUN, LIVE_SET, abPick, abSlow, bedside, beside, besideHook, cathOut, cathTo, clotMarks, evDrop, evKept, lapseRow, lapseText, liveKeys, markFocus, merge, onHidden, paintKey, procBack, procEl, procSteps, skipLapse, stentedKept, stentedOf, stopLapse, strainEl, strainStop, whatIfEl };
}
