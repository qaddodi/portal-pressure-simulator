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
// - Performance mode Quality (frame.js perfMode) never steps down. ?tiers=0: off (Full always, as before).
// tierLog() keeps the last changes, each with why and the registry's size then. ?perf shows the tier with the budget.

import { onFrameEnd, frameBudget, perfMode } from './frame.js?v=8c8f2f530e';
import { overBudget as graphOver, budget } from './gpu-budget.js?v=f3506e8647';

const SEARCH = typeof location !== 'undefined' ? location.search || '' : '';
export const TIERS_ON = !/[?&]tiers=0\b/.test(SEARCH);
/** The tiers' share of the vessel layer's width and height on a moving frame (0: Full). 0.71 is half the pixels, 0.5 a quarter. */
export const TIERS = [0, 0.85, 0.71, 0.5];
export const TIER_TOP = 0.85;
const DOWN_OF = 6, DOWN_N = 3, DOWN_GAP = 250, UP_CALM = 1500;

let tier = 0, changedAt = -Infinity, calmSince = 0, warned = false;
const ring = new Uint8Array(DOWN_OF);
let ringAt = 0;
const log = [];
const warmSubs = new Set();

/** The tier now (0: Full). */
export const sceneTier = () => tier;
/** The vessel layer's share on a moving frame now (0: Full). */
export const tierK = () => TIERS[tier];
/** The last tier changes: { at, from, to, why, mb }. */
export const tierLog = () => log.slice();
/** fn() at the first sign of pressure (once a page): make the tiers' targets between frames. */
export function onTierWarm(fn) { warmSubs.add(fn); if (warned) fn(); return () => warmSubs.delete(fn); }

function setTier(t, now, why) {
  if (t === tier) return;
  let mb = 0;
  try { mb = budget().mb; } catch { /* the registry is off */ }
  log.push({ at: Math.round(now), from: tier, to: t, why, mb });
  if (log.length > 20) log.shift();
  tier = t; changedAt = now; calmSince = now;
  ring.fill(0);
}

/** Judges one frame (from watchFrames; exported for tests): gap (ms since the last, 0 if the page was still), script (ms). */
export function judgeFrame({ now, gap, script }) {
  if (perfMode() === 'quality') { if (tier) setTier(0, now, 'performance mode Quality'); return; }
  if (!(gap > 0)) { calmSince = now; return; }   // (a frame after a still page: not part of a move)
  const b = frameBudget();
  const miss = gap > b * 1.5, heavy = script > b * 0.7 || graphOver();
  ring[ringAt] = miss || heavy ? 1 : 0; ringAt = (ringAt + 1) % DOWN_OF;
  if (miss || heavy) {
    calmSince = now;
    if (!warned) { warned = true; for (const f of warmSubs) setTimeout(f, 0); }
    let n = 0; for (let i = 0; i < DOWN_OF; i++) n += ring[i];
    if (n >= DOWN_N && now - changedAt >= DOWN_GAP && tier < TIERS.length - 1) {
      setTier(tier + 1, now, `${n} of ${DOWN_OF} frames ${miss ? `missed (${gap.toFixed(1)} ms at a ${b.toFixed(1)} ms frame)` : `heavy (script ${script.toFixed(1)} ms${graphOver() ? ', render graph over its envelope' : ''})`}`);
    }
    return;
  }
  if (script > b * 0.45) { calmSince = now; return; }
  if (tier > 0 && now - calmSince >= UP_CALM && now - changedAt >= UP_CALM) setTier(tier - 1, now, `${UP_CALM} ms of frames on time with light script`);
}

if (TIERS_ON) onFrameEnd(judgeFrame);   // (the cheap end-of-frame signal: no per-part tracing switched on for it)
