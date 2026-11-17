// One clock for a card's words and its glass (Mohammad, 17 Nov 2026: "there is definitely a sync issue between text showing up and
// glass/cards showing up on multiple things including alerts, cards, test cards, etc. need to fix at root").
//
// Why they parted. A card's glass is drawn by the page, in the figure's canvas, in the scheduler's frame (glass-gl.js); its words, its edge and
// everything else on it are the page's, and its fade (a CSS transition, a CSS animation, an el.animate()) is run by the browser's compositor,
// on a clock of its own. The glass worked out each frame where that fade stood (glass-motion.js clockAt), but the two clocks agree only while
// every frame is on time: the frames in which a card comes in or goes out are the busiest the page has (the card built, laid out, its glyphs
// and charts drawn), and over a long one the compositor ran the words' fade on while the glass stood where the last frame left it. The words
// came in, or went, ahead of their frost. A new card's fade also started at the frame the page showed it, while its glass waited for the page
// to be read and for its first draw: the words had already begun to show.
//
// The one clock. Every fade or move of a glass card (an animation of its opacity or its translation, on the card, on anything that holds it up
// to its layer, or on an element its words lie in beside the glass) is taken off the browser's clock the moment the glass sees it (paused) and
// is set here, once a frame, from the scheduler's frame time (frame.js easeNow: the clock card-throw.js moves a slide's cards by), just before
// the glass is drawn from that same time. The words and the frost are then the same number in the same frame, and a long frame holds both
// where they were, as a slide change's throw always has. It starts on the glass's first frame with the card, never before, so the words wait
// for their frost; at its end the animation is finished as the browser would (its finish and transitionend events, its fill), and anything
// that waits on it carries on.
//
// It is given back to the browser, from where it stands, whenever the glass is not there to draw it: the glass off (no WebGL, Blur effect
// off, a dive, a lost context), the card gone from the glass's list, or no frame of the glass for STALE_MS (a hidden page, a glass asleep by
// a fault). A card is never left held.

/** Animations this clock holds, in any glass's clock (animRunning). */
const OWNED = new WeakSet();
/** How long (ms) an animation may wait for the glass's next frame before it is given back to the browser. */
export const STALE_MS = 400;

/** Whether an animation is under way: running on the browser's clock, or held on the glass's (playState 'paused' then). Every check
 *  "is this card still moving" asks this, not playState === 'running', or a card fading on the glass's clock read as still. */
export const animRunning = (an) => !!an && (an.playState === 'running' || OWNED.has(an));
/** Whether the glass's clock holds this animation now. */
export const heldOnGlass = (an) => !!an && OWNED.has(an);

/** An animation's end (ms of its own time: delay, its iterations, end delay) from the timing it was given, or NaN when it has none (it
 *  repeats for ever, or its duration is not a number). */
export function endOf(t) {
  if (!t) return NaN;
  const dur = typeof t.duration === 'number' ? t.duration : NaN, it = t.iterations ?? 1;
  if (!(dur >= 0) || !Number.isFinite(dur) || !Number.isFinite(it)) return NaN;
  return Math.max(0, (+t.delay || 0) + dur * Math.max(0, it) + (+t.endDelay || 0));
}

/**
 * Whether the glass may take `an` onto its clock: one the browser runs now (not one a script already holds: a pull's paused animation,
 * num-move.js), on the document's timeline, that ends, at a rate that is not 0, and whose keyframes (`kf`, glass-motion.js compileKeyframes)
 * fade or move the element in a way the glass follows (not `bad`).
 */
const NEVER = () => false, NO_OPTS = { driven: NEVER, timeline: undefined };
export function ownable(an, kf, o = NO_OPTS) {
  const driven = o.driven || NEVER, timeline = o.timeline;
  if (!an || OWNED.has(an) || driven(an)) return false;
  if (!kf || kf.bad || !(kf.hasO || kf.hasT)) return false;
  if (an.playState !== 'running') return false;
  if (timeline !== undefined && an.timeline != null && an.timeline !== timeline) return false;
  const rate = an.playbackRate;
  if (!Number.isFinite(rate) || rate === 0) return false;
  let t;
  try { t = an.effect?.getTiming?.() || null; } catch { t = null; }
  return endOf(t) > 0;
}

/**
 * The glass's clock. `now()`: the frame's time (ms). Each animation taken is held (paused) where it is; `drive()`, once in each frame the glass
 * draws, starts the ones not started yet at this frame and sets every one's time to where it is at this frame; at its end it is finished.
 * `c`, when given with take(), is the glass's own record of that animation's clock (glass-motion.js clockOf): it is kept to the time set here
 * (`c.s` null, `c.c0` the time), so the glass reads the very time the page shows, and `c.own` says it is held.
 */
export function createRevealClock({ now }) {
  const own = new Map();   // (animation → { t0: the frame it started at, or null; c0: its time when taken; rate; end; ct: its time now; at: last frame driven; c })
  const keep = (r, ct) => { r.ct = ct; if (r.c) { r.c.s = null; r.c.c0 = ct; } };
  function free(an, r) {
    own.delete(an); OWNED.delete(an);
    if (r.c) r.c.own = false;
  }
  return {
    get size() { return own.size; },
    has: (an) => own.has(an),
    /** Takes `an` onto this clock, held where it stands until the next drive(). Returns whether it was taken. */
    take(an, c = null) {
      if (own.has(an)) return true;
      let t;
      try { t = an.effect?.getTiming?.() || null; } catch { t = null; }
      const end = endOf(t), rate = an.playbackRate;
      if (!(end > 0) || !Number.isFinite(rate) || rate === 0) return false;
      const c0 = Math.min(end, Math.max(0, Number(an.currentTime) || 0));
      try { an.pause(); an.currentTime = c0; } catch { return false; }
      const r = { t0: null, c0, rate, end, ct: c0, at: now(), c };   // alloc-rare: once per animation taken (a card's fade), never per frame
      own.set(an, r); OWNED.add(an);
      if (c) c.own = true;
      keep(r, c0);
      return true;
    },
    /** One frame: every animation held is set to this frame's time (started now if it has not started); those at their end are finished.
     *  Returns how many are still held. */
    drive() {
      if (!own.size) return 0;
      const t = now();
      for (const [an, r] of own) {
        // (Played, finished or cancelled by someone else (a cancel the page made, a card's own finish()): no longer this clock's.)
        let st;
        try { st = an.playState; } catch { st = 'idle'; }
        if (st !== 'paused') { free(an, r); continue; }
        if (r.t0 == null) r.t0 = t;
        r.at = t;
        let ct = r.c0 + (t - r.t0) * r.rate;
        const done = r.rate > 0 ? ct >= r.end : ct <= 0;
        ct = Math.min(r.end, Math.max(0, ct));
        if (done) {
          keep(r, ct);
          free(an, r);
          try { an.finish(); } catch { try { an.play(); } catch { /* (gone) */ } }
          continue;
        }
        if (ct !== r.ct) { try { an.currentTime = ct; } catch { free(an, r); continue; } }
        keep(r, ct);
      }
      return own.size;
    },
    /** Gives `an` back to the browser, running on from where it stands. */
    release(an) {
      const r = own.get(an);
      if (!r) return;
      free(an, r);
      try { if (an.playState === 'paused') an.play(); } catch { /* (gone) */ }
    },
    /** Gives back every animation `fn(an)` says to (its element no longer one of the glass's). */
    releaseIf(fn) { for (const an of [...own.keys()]) if (fn(an)) this.release(an); },   // alloc-rare: a read of the page, never per frame
    /** Gives every animation back (the glass gone, off or not drawing). */
    releaseAll() { for (const an of [...own.keys()]) this.release(an); },   // alloc-rare: the glass let go, never per frame
    /** Gives back those the glass has not driven for STALE_MS (no frame of it: a hidden page, a glass that stopped). Returns how many are left. */
    sweep(ms = STALE_MS) {
      const t = now();
      for (const [an, r] of [...own]) if (t - r.at > ms) this.release(an);   // alloc-rare: a timer's look, a few times a second at most while a card fades
      return own.size;
    },
    /** Forgets `an` without touching it (it was cancelled or removed: its events). */
    drop(an) { const r = own.get(an); if (r) free(an, r); },
    /** The time it is held at, or null. */
    timeOf: (an) => own.get(an)?.ct ?? null,
  };
}
