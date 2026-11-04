// Quality tiers chosen by the frame deadline (R07, 2 Nov 2026: "adapt to deadline pressure, including during continuous interaction").
//
// The older Adapt to frame rate (stage.js adaptStep, off by default) steps once a move has ended, from a baseline it learns from the
// move's own quick frames: a move that is slow all through teaches it that slow is normal. This one judges every frame of a move as it
// runs, against the fixed target interval (frame.js frameBudget: 8.333 ms at 120 Hz, never the observed cadence), so a pinch, a glide or a
// dive responds while the hand is still on it.
// - Platform cadence and the app's work are kept apart: a frame missed its deadline when its interval ran past 1.5 frames; it was
//   heavy when the app's own script took over 70 % of the frame, or the render graph ran past its envelope (gpu-budget.js, R06).
// - Fast down: 3 of the last 6 moving frames missed or heavy, and 250 ms since the last change: one tier lower.
// - Slow up: 1.5 s of moving frames with no miss and light script (under 45 % of the frame): one tier higher. A still page never moves
//   the tier, so a scene keeps the tier it found until its own frames show it can do better.
// - Tiers are preallocated (veins-gl prepLow: the targets at the top tier's size, made between frames at the first sign of pressure),
//   so a step allocates nothing. They lower only the vessel layer's moving frames (the zoom frames veins-gl lowPass draws); the view a
//   move stops at is always drawn at Full, and labels, text, cards and readings are on their own layers: never lowered.
// tierLog() keeps the last changes, each with why and the registry's size then. ?perf shows the tier with the budget.

import { onFrameEnd, frameBudget } from './frame.js';
import { overBudget as graphOver, budget } from './gpu-budget.js';
import { caught } from './caught.js';

export const TIERS_ON = true;   // (switch deleted; kept for stage.js until its own pass)
/** The tiers' share of the vessel layer's width and height on a moving frame (0: Full). 0.71 is half the pixels, 0.5 a quarter. */
// (No 0.85 step: its targets, made up front at the top tier's size, held 98 MB at 8 MP to save 28 % of the pixels; the top step is now 0.71, whose
// targets hold 69 MB. The render graph reads over its memory envelope with them, and that reads as pressure that steps the tier down.)
export const TIERS = [0, 0.71, 0.5];
export const TIER_TOP = 0.71;
const DOWN_OF = 6, DOWN_N = 3, DOWN_GAP = 250, UP_CALM = 1500;

let tier = 0, changedAt = -Infinity, calmSince = 0, warned = false;
const ring = new Uint8Array(DOWN_OF);
let ringAt = 0;
// The change log: LOG_MAX kept entries, written in place as a ring (a step allocates nothing). An entry keeps the numbers of its reason;
// tierLog() (a read, never a frame) turns them into the text.
const LOG_MAX = 20;
const WHY_MISS = 0, WHY_HEAVY = 1, WHY_CALM = 2;
const log = [];
for (let i = 0; i < LOG_MAX; i++) log.push({ at: 0, from: 0, to: 0, kind: 0, n: 0, gap: 0, b: 0, script: 0, over: false, mb: 0 });
let logAt = 0, logN = 0;
const warmSubs = new Set();

/** The tier now (0: Full). */
export const sceneTier = () => tier;
/** The vessel layer's share on a moving frame now (0: Full). */
// Settings › Sharp while moving (PR-06): on, a move is drawn at Full like a still page, whatever the frames cost. Off (the default) is the tiers above.
let sharp = false;
try { sharp = localStorage.getItem('pps.sharp') === '1'; } catch { /* storage unavailable: tiers stay on */ }
export const sharpMoving = () => sharp;
export const setSharpMoving = (on) => { sharp = !!on; };
export const tierK = () => (sharp ? 0 : TIERS[tier]);
const whyOf = (e) => (e.kind === WHY_CALM ? `${UP_CALM} ms of frames on time with light script`
  : `${e.n} of ${DOWN_OF} frames ${e.kind === WHY_MISS ? `missed (${e.gap.toFixed(1)} ms at a ${e.b.toFixed(1)} ms frame)` : `heavy (script ${e.script.toFixed(1)} ms${e.over ? ', render graph over its envelope' : ''})`}`);
/** The last tier changes, oldest first: { at, from, to, why, mb }. A fresh array of fresh objects (the ring is not handed out). */
export function tierLog() {
  const out = [];
  for (let i = 0; i < logN; i++) {
    const e = log[(logAt - logN + i + LOG_MAX) % LOG_MAX];
    out.push({ at: e.at, from: e.from, to: e.to, why: whyOf(e), mb: e.mb });
  }
  return out;
}
/** fn() at the first sign of pressure (once a page): make the tiers' targets between frames. */
export function onTierWarm(fn) { warmSubs.add(fn); if (warned) fn(); return () => warmSubs.delete(fn); }

function setTier(t, now, kind, n, gap, b, script, over) {
  if (t === tier) return;
  let mb = 0;
  try { mb = budget().mb; } catch (e) { caught('adapt-tier:45', e); /* the registry is off */ }
  const e = log[logAt];
  e.at = Math.round(now); e.from = tier; e.to = t; e.kind = kind; e.n = n; e.gap = gap; e.b = b; e.script = script; e.over = over; e.mb = mb;
  logAt = (logAt + 1) % LOG_MAX; if (logN < LOG_MAX) logN++;
  tier = t; changedAt = now; calmSince = now;
  ring.fill(0);
}

/** Judges one frame (from watchFrames; exported for tests): gap (ms since the last, 0 if the page was still), script (ms). */
export function judgeFrame({ now, gap, script }) {
  if (!(gap > 0)) { calmSince = now; return; }   // (a frame after a still page: not part of a move)
  const b = frameBudget();
  const miss = gap > b * 1.5, heavy = script > b * 0.7 || graphOver();
  ring[ringAt] = miss || heavy ? 1 : 0; ringAt = (ringAt + 1) % DOWN_OF;
  if (miss || heavy) {
    calmSince = now;
    if (!warned) { warned = true; for (const f of warmSubs) setTimeout(f, 0); }
    let n = 0; for (let i = 0; i < DOWN_OF; i++) n += ring[i];
    if (n >= DOWN_N && now - changedAt >= DOWN_GAP && tier < TIERS.length - 1) {
      setTier(tier + 1, now, miss ? WHY_MISS : WHY_HEAVY, n, gap, b, script, miss ? false : graphOver());
    }
    return;
  }
  if (script > b * 0.45) { calmSince = now; return; }
  if (tier > 0 && now - calmSince >= UP_CALM && now - changedAt >= UP_CALM) setTier(tier - 1, now, WHY_CALM, 0, 0, 0, 0, false);
}

onFrameEnd(judgeFrame);   // (the cheap end-of-frame signal: no per-part tracing switched on for it)
