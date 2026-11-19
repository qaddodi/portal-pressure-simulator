// The motion rules of the ?watch recorder (screen-report plan, step 2c): named judges over the last seconds of the screen, as plain JSON.
// Ported from scripts/frame-step.mjs and scripts/glitch-sweep.mjs (flash, stuck, label detached, number width jump) and from slide-cam.js
// (judgeSlideMove: the camera's straight path), with the owner's standing label rules added (a label fades between spots, never slides; the
// dim alpha is one value). Pure: no DOM, no clock, no imports of the page, so a unit test, the recorder and a packet replay in Node judge the
// same history the same way (replay.js).
//
// A history ({ v, samples, events, traces, vb, env }; history.js) holds:
//   samples  [{ t (ms), c: [zoom, x, y] | null, L: labels | null, K: cards | null, W: words | null }]   null = that source could not be read: unknown, not "none"
//            label  [key, x, y, w, h, alpha, anchorX?, anchorY?]  (page px, as the GPU drew it; the anchor is the thing it names)
//            card   [name, x, y, w, h, alpha]                      (as the glass drew it)
//            words  [text, data, panel, prep]                       (1 when that slide card holds its words, from the presenter's own cards, no layout: the .pz-text, .pz-data and .pz-panel are built; prep: the slide is still being fitted unseen)
//   events   [{ t, k: 'view' | 'hand' | 'num' | 'slide', ... }]      view: { to }; num: { id, text, w, cw, pt, pw, pcw } (a number changed: now and before, measured at rest)
//   traces   the slide camera's runs, frame by frame (stage.cameraTraces), for judgeSlideMove
// A finding is { rule, what, where, why, owner, at, t0, t1 } (the shape of the screen report's rules); `at` is the session clock, in seconds.
//
// The pop rules (card-pop, card-size-snap, glass-before-words, card-empty) were scripts/frame-step.mjs's card anomalies (opacity-jump, height-jump, glass-alone, bare-card, card-no-text), which only ran on
// software GL pictures; they judge the samples the recorder already keeps, so the owner's first rule (nothing pops, 17 Nov) has a live judge on a device. Built from the code, never seen live yet (docs/watch.md).
//
// Every rule is a false-alarm risk: each has a unit test with a case that must not fire (tests/watch-motion-rules.test.js).
import { judgeSlideMove } from '../slide-cam.js';
import { DIM_ALPHA } from '../label-explain.js';

/** Visible means this alpha or more (a dimmed label, DIM_ALPHA, is visible); gone means this or less. */
export const SHOWN = 0.6, GONE = 0.3;
/** A thing that drops from shown to gone and is back within this long flashed. */
export const FLASH_MS = 250;
/** A card or label held at one alpha part way for this long, at the end of the history, is stuck. */
export const STUCK_MS = 1500;
/** A label that moves this far (px, from its anchor) while shown, in a run of at least SLIDE_MIN_MS, slid; a jump this far in one step popped. */
export const SLIDE_PX = 12, JUMP_PX = 48, SLIDE_MIN_MS = 60;
/** A label that trails its anchor by more than this (px) while the camera moves, or sits further than the limit, is detached. */
export const LAG_PX = 14;
/** A card (or its glass) whose alpha changes by this much between two frames, with no frame missing, popped instead of fading. */
export const POP_ALPHA = 0.5;
/** Samples further apart than this are a page that was not drawing (a hidden tab, a stall): no step between them is a pop or a snap. */
export const POP_GAP_MS = 50;
/** A card's width or height that steps by this many px in one frame, and by 4 times either neighbouring step, snapped instead of gliding. */
export const SNAP_PX = 10, SNAP_RATIO = 4;
/** Glass or a card shown (alpha at least SHOWN_CARD) with no words for this long is an empty card. */
export const SHOWN_CARD = 0.3, EMPTY_MS = 100, EMPTY_FRAMES = 3;
/** The slide cards the words bit speaks for: the words index in a sample's W. */
export const WORD_CARDS = { 'pz-text': 0, 'pz-data': 1, 'pz-panel': 2 };

/** The camera segment after a view change: it begins within this long of the change and the hand must not touch it. */
export const VIEW_LEAD_MS = 250, VIEW_SPAN_MS = 4000;
/** A mid-move stop (a waypoint at the fit) of this long counts; the camera at rest for REST_MS has finished its move. */
export const STOP_MS = 100, REST_MS = 250;

/** What each rule says and which file to open first. */
export const RULE_INFO = {
  flash: { why: 'Nothing may blink: a card or label that is shown, gone and back within a quarter second is a glitch (17 Nov: nothing pops in or out)', owner: 'src/ui/label-gl.js' },
  'stuck-mid': { why: 'A card or label held part way through a fade is a fade that never finished', owner: 'src/ui/glass-clock.js' },
  'label-slide': { why: 'Labels fade between spots, never slide or jump (18 Nov)', owner: 'src/ui/stage-label-solve.js' },
  'label-detached': { why: 'A label must keep up with the thing it names while the figure moves', owner: 'src/ui/label-gl.js' },
  'label-dim-alpha': { why: 'A dimmed label rests at one alpha, DIM_ALPHA (label-explain.js), in one place', owner: 'src/ui/label-explain.js' },
  'number-width-jump': { why: 'A number that changes must not change width while its card holds still: figures are tabular', owner: 'src/ui/count-roll.js' },
  'card-pop': { why: 'Nothing pops in or out: a card goes from gone to shown by a fade, never in one frame (17 Nov 22:01: appearance and disappearance of anything must never glitch)', owner: 'src/ui/glass-clock.js' },
  'card-size-snap': { why: 'Cards size exactly to their content with a glide, never a snap (17 Nov)', owner: 'src/ui/card.js' },
  'glass-before-words': { why: 'Never show a card before it is fully loaded and styled: the glass does not show before its words (17 Nov 22:01)', owner: 'src/ui/presenter-cards.js' },
  'card-empty': { why: 'A card is never shown with nothing in it (17 Nov 22:01)', owner: 'src/ui/presenter-cards.js' },
  'camera-straight': { why: 'The camera zooms straight from any view to any view: one way, one line, no stop at the fit (18 Nov)', owner: 'src/ui/stage-glide.js' },
  'camera-slide': { why: 'A slide\'s camera move is one plan on one even path, judged by slide-cam.js judgeSlideMove', owner: 'src/ui/slide-cam.js' },
};

const sec = (t) => `${(t / 1000).toFixed(1)} s`;
const r1 = (v) => Math.round(v * 10) / 10;
const finding = (rule, what, where, t0, t1 = t0) => ({ rule, what, where, why: RULE_INFO[rule].why, owner: RULE_INFO[rule].owner, at: sec(t0), t0: Math.round(t0), t1: Math.round(t1) });

/** Per key, the alpha at each sample (0 where the source was read and the key was not in it, NaN where the source was not read). */
export function alphaSeries(samples, field, aIndex) {
  const N = samples.length, out = new Map();
  samples.forEach((s, i) => {
    const list = s[field];
    if (!list) return;
    for (const e of list) {
      let r = out.get(e[0]);
      if (!r) { r = { key: e[0], a: new Array(N).fill(NaN), at: new Array(N).fill(null) }; out.set(e[0], r); }
      r.a[i] = e[aIndex]; r.at[i] = e;
    }
  });
  // (known samples where the key is absent are 0)
  for (const r of out.values()) samples.forEach((s, i) => { if (s[field] && Number.isNaN(r.a[i])) r.a[i] = 0; });
  return out;
}

/** The camera's move between two samples, in px-equivalents (pan, plus 400 per unit of log zoom: the sweep's measure). */
export function camMoved(a, b) {
  const p = a && a.c, q = b && b.c;
  if (!p || !q) return 0;
  return Math.hypot(q[1] - p[1], q[2] - p[2]) + Math.abs(Math.log(q[0] / p[0])) * 400;
}

/** flash: shown (alpha >= SHOWN), gone (<= GONE) for FLASH_MS or less, shown again. Cards and labels. */
export function flash(h) {
  const out = [], S = h.samples;
  for (const [field, kind] of [['L', 'label'], ['K', 'card']]) {
    for (const r of alphaSeries(S, field, field === 'L' ? 5 : 5).values()) {
      const a = r.a;
      for (let i = 1; i < a.length - 1; i++) {
        if (!(a[i - 1] >= SHOWN) || !(a[i] <= GONE)) continue;
        let j = i; while (j < a.length && a[j] <= GONE) j++;
        if (j < a.length && a[j] >= SHOWN && S[j].t - S[i].t <= FLASH_MS) {
          out.push(finding('flash', `${kind} "${r.key}"`, `${r1(a[i - 1])} to ${r1(a[i])} for ${Math.round(S[j].t - S[i].t)} ms, then back to ${r1(a[j])}`, S[i].t, S[j].t));
        }
        i = j;
      }
    }
  }
  return out;
}

/** stuck-mid: at the end of the history a card or label sits at one alpha between gone and shown for STUCK_MS or more (a dimmed label at DIM_ALPHA is at rest). */
export function stuckMid(h) {
  const out = [], S = h.samples, N = S.length;
  if (N < 3) return out;
  for (const [field, kind] of [['L', 'label'], ['K', 'card']]) {
    for (const r of alphaSeries(S, field, 5).values()) {
      const end = r.a[N - 1];
      if (!(end > 0.05 && end < 0.95)) continue;
      if (kind === 'label' && Math.abs(end - DIM_ALPHA) <= 0.03) continue;
      let i = N - 1; while (i > 0 && Math.abs(r.a[i - 1] - end) < 0.01) i--;
      if (S[N - 1].t - S[i].t >= STUCK_MS) out.push(finding('stuck-mid', `${kind} "${r.key}"`, `held at alpha ${r1(end * 100) / 100} for ${(Math.round((S[N - 1].t - S[i].t) / 100) / 10)} s, part way through a fade`, S[i].t, S[N - 1].t));
    }
  }
  return out;
}

/** label-dim-alpha: a label that rests (the same alpha for STUCK_MS) at an alpha that is neither 0, DIM_ALPHA nor 1. Stuck-mid names the same cases for other alphas, so this one names only the near misses of the dim value. */
export function labelDimAlpha(h) {
  const out = [], S = h.samples, N = S.length;
  if (N < 3) return out;
  for (const r of alphaSeries(S, 'L', 5).values()) {
    const end = r.a[N - 1];
    if (!(end > 0.4 && end < 0.9) || Math.abs(end - DIM_ALPHA) <= 0.03) continue;
    let i = N - 1; while (i > 0 && Math.abs(r.a[i - 1] - end) < 0.01) i--;
    if (S[N - 1].t - S[i].t >= STUCK_MS) out.push(finding('label-dim-alpha', `label "${r.key}"`, `rests at alpha ${Math.round(end * 100) / 100}, not ${DIM_ALPHA}`, S[i].t, S[N - 1].t));
  }
  return out;
}

/**
 * label-slide: a label that is shown (both samples) moves from where it stands against its anchor (or, with no anchor and the camera still,
 * against the screen) by SLIDE_PX over a run of SLIDE_MIN_MS or more: it slid instead of fading. One step of JUMP_PX or more is a jump.
 */
export function labelSlide(h) {
  const out = [], S = h.samples;
  const labels = alphaSeries(S, 'L', 5);
  for (const r of labels.values()) {
    let run = null;
    const flush = () => { if (run && run.d >= SLIDE_PX && S[run.i1].t - S[run.i0].t >= SLIDE_MIN_MS) out.push(finding('label-slide', `label "${r.key}"`, `slid ${Math.round(run.d)} px over ${Math.round(S[run.i1].t - S[run.i0].t)} ms at alpha ${r1(run.a)}, instead of fading`, S[run.i0].t, S[run.i1].t)); run = null; };
    for (let i = 1; i < S.length; i++) {
      const p = r.at[i - 1], q = r.at[i];
      if (!p || !q || !(p[5] >= GONE) || !(q[5] >= GONE)) { flush(); continue; }
      const anchored = p[6] != null && q[6] != null;
      if (!anchored && camMoved(S[i - 1], S[i]) > 0.05) { flush(); continue; }   // (the camera moves it: with no anchor there is no telling)
      const dx = anchored ? (q[1] - q[6]) - (p[1] - p[6]) : q[1] - p[1], dy = anchored ? (q[2] - q[7]) - (p[2] - p[7]) : q[2] - p[2];
      const d = Math.hypot(dx, dy);
      if (d >= JUMP_PX) { flush(); out.push(finding('label-slide', `label "${r.key}"`, `jumped ${Math.round(d)} px in one frame at alpha ${r1(q[5])}, instead of fading`, S[i - 1].t, S[i].t)); continue; }
      if (d > 0.2) { if (run) { run.d += d; run.i1 = i; run.a = Math.min(run.a, q[5]); run.quiet = 0; } else run = { i0: i - 1, i1: i, d, a: q[5], quiet: 0 }; }
      else if (run && ++run.quiet >= 2) flush();
    }
    flush();
  }
  return out;
}

/** label-detached: a label that stands still against its moving anchor, for two frames running, or sits far from its anchor. */
export function labelDetached(h) {
  const out = [], S = h.samples, vw = h.env?.vw || 1000;
  const lim = labelLimit(vw);
  for (const r of alphaSeries(S, 'L', 5).values()) {
    let run = null; const flush = () => { if (run && run.n >= 2 && run.da - run.dl >= LAG_PX) out.push(finding('label-detached', `label "${r.key}"`, `does not keep up with its anchor (moved ${Math.round(run.dl)} px while the anchor moved ${Math.round(run.da)} px over ${run.n} frames)`, S[run.i0].t, S[run.i1].t)); run = null; };
    let far = false;
    for (let i = 1; i < S.length; i++) {
      const p = r.at[i - 1], q = r.at[i];
      if (!p || !q || p[6] == null || q[6] == null || p[5] < 0.5 || q[5] < 0.5) { flush(); continue; }
      const dl = Math.hypot(q[1] - p[1], q[2] - p[2]), da = Math.hypot(q[6] - p[6], q[7] - p[7]);
      if (da > 0.5 && camMoved(S[i - 1], S[i]) > 0.01 && dl < 0.4 * da) { if (run) { run.n++; run.i1 = i; run.dl += dl; run.da += da; } else run = { i0: i - 1, i1: i, n: 1, dl, da }; } else flush();
      const dist = Math.hypot(q[1] - q[6], q[2] - q[7]);
      if (dist > lim && !far) { far = true; out.push(finding('label-detached', `label "${r.key}"`, `sits ${Math.round(dist)} px from its anchor (limit ${Math.round(lim)})`, S[i].t)); } else if (dist <= lim) far = false;
    }
    flush();
  }
  return out;
}

/** number-width-jump: a number changed to one of the same length and its width moved by 1 px or more while its card held its width.
 *  A 'num' event carries the number before (pt, pw, pcw) and after (text, w, cw), both measured at rest. */
export function numberWidthJump(h) {
  const out = [];
  for (const e of h.events || []) {
    if (e.k !== 'num' || e.pt == null || e.pt === e.text || e.pt.length !== e.text.length) continue;
    if (Math.abs(e.w - e.pw) >= 1 && Math.abs(e.cw - e.pcw) < 0.5) out.push(finding('number-width-jump', `number "${e.pt}" to "${e.text}" (${e.id})`, `${e.pw} to ${e.w} px wide while its card held ${e.cw} px`, e.t));
  }
  return out;
}

/** The label's limit from its anchor (px): the one number label-detached and the retired glitch sweep judge by. */
export const labelLimit = (vw) => Math.max(280, 0.36 * Math.min(vw || 1000, 1400));

const gapOk = (S, i) => S[i].t - S[i - 1].t <= POP_GAP_MS;

/** card-pop: a card (its glass) goes from gone to shown, or shown to gone, in one frame: it popped instead of fading (opacity-jump of frame-step.mjs). */
export function cardPop(h) {
  const out = [], S = h.samples;
  for (const r of alphaSeries(S, 'K', 5).values()) {
    for (let i = 1; i < S.length; i++) {
      if (!gapOk(S, i) || !(r.a[i] >= 0) || !(r.a[i - 1] >= 0)) continue;
      const d = r.a[i] - r.a[i - 1];
      if (Math.abs(d) >= POP_ALPHA) out.push(finding('card-pop', `card "${r.key}"`, `${d > 0 ? 'appeared' : 'vanished'} in one frame (alpha ${r1(r.a[i - 1])} to ${r1(r.a[i])} in ${Math.round(S[i].t - S[i - 1].t)} ms), not a fade`, S[i - 1].t, S[i].t));
    }
  }
  return out;
}

/** card-size-snap: a shown card's width or height jumps in one frame, far more than the frames either side of it: it snapped to its content instead of gliding (height-jump, width-jump). */
export function cardSizeSnap(h) {
  const out = [], S = h.samples, N = S.length;
  const byKey = new Map();
  S.forEach((s, i) => { if (s.K) for (const e of s.K) { let m = byKey.get(e[0]); if (!m) byKey.set(e[0], (m = new Array(N).fill(null))); m[i] = e; } });
  for (const [key, at] of byKey) {
    for (const [idx, what] of [[4, 'height'], [3, 'width']]) {
      const step = (i) => (i >= 1 && i < N && at[i] && at[i - 1] && gapOk(S, i) && at[i][5] > 0.05 && at[i - 1][5] > 0.05 ? Math.abs(at[i][idx] - at[i - 1][idx]) : 0);
      for (let i = 2; i < N - 1; i++) {
        const d = step(i);
        if (d >= SNAP_PX && d >= SNAP_RATIO * Math.max(step(i - 1), step(i + 1), 1)) out.push(finding('card-size-snap', `card "${key}"`, `${what} ${Math.round(at[i - 1][idx])} to ${Math.round(at[i][idx])} px in one frame (${Math.round(S[i].t - S[i - 1].t)} ms), not a glide`, S[i - 1].t, S[i].t));
      }
    }
  }
  return out;
}

/** The runs of samples where `bad(sample)` holds that last EMPTY_FRAMES samples and EMPTY_MS: [{ i0, i1 }]. */
function runs(S, bad) {
  const out = [];
  let i = 0;
  while (i < S.length) {
    if (!bad(S[i])) { i++; continue; }
    let j = i; while (j + 1 < S.length && bad(S[j + 1])) j++;
    if (j - i + 1 >= EMPTY_FRAMES && S[j].t - S[i].t >= EMPTY_MS) out.push({ i0: i, i1: j });
    i = j + 1;
  }
  return out;
}
const alphaOf = (s, name) => { const e = s.K && s.K.find((k) => k[0] === name); return e ? e[5] : 0; };

/** glass-before-words: the teaching card's glass (pz-shade) is shown while none of the slide's cards holds words and the slide is not being fitted unseen: glass alone, the frost with nothing on it (glass-alone, bare-card). */
export function glassBeforeWords(h) {
  const out = [], S = h.samples;
  for (const { i0, i1 } of runs(S, (s) => s.K && s.W && !s.W[3] && s.W[0] === 0 && s.W[1] === 0 && s.W[2] === 0 && alphaOf(s, 'pz-shade') >= SHOWN_CARD)) {
    out.push(finding('glass-before-words', 'the teaching card\'s glass', `shown (alpha ${r1(alphaOf(S[i1], 'pz-shade'))}) for ${Math.round(S[i1].t - S[i0].t)} ms with no words in any card: the glass before its words`, S[i0].t, S[i1].t));
  }
  return out;
}

/** card-empty: a slide card (words, data or top card) is shown with no words in it (card-no-text). */
export function cardEmpty(h) {
  const out = [], S = h.samples;
  for (const [name, at] of Object.entries(WORD_CARDS)) {
    for (const { i0, i1 } of runs(S, (s) => s.K && s.W && !s.W[3] && s.W[at] === 0 && alphaOf(s, name) >= SHOWN_CARD)) {
      out.push(finding('card-empty', `card "${name}"`, `shown (alpha ${r1(alphaOf(S[i1], name))}) for ${Math.round(S[i1].t - S[i0].t)} ms with nothing in it`, S[i0].t, S[i1].t));
    }
  }
  return out;
}

/** The camera segments after each view change (the hand not on the screen): { t0, t1, rows: [[t, k, x, y]...] }, from the first moving sample to rest. */
export function viewSegments(h) {
  const S = h.samples, out = [], views = (h.events || []).filter((e) => e.k === 'view');
  for (let v = 0; v < views.length; v++) {
    const te = views[v].t, next = views[v + 1] ? views[v + 1].t : Infinity, lim = Math.min(te + VIEW_SPAN_MS, next);
    let i0 = -1;
    for (let i = 1; i < S.length; i++) {
      if (S[i].t < te - 50) continue;
      if (S[i].t > te + VIEW_LEAD_MS) break;
      if (S[i].c && S[i - 1].c && camMoved(S[i - 1], S[i]) > 0.3) { i0 = i - 1; break; }
    }
    if (i0 < 0) continue;
    // (the move ends where the camera has stood still for REST_MS; a shorter stop is part of the move, which cameraStraight names)
    let i1 = i0 + 1, lastMove = i0 + 1, rest = false;
    for (let i = i0 + 1; i < S.length && S[i].t <= lim; i++) {
      i1 = i;
      if (camMoved(S[i - 1], S[i]) >= 0.05) lastMove = i;
      else if (S[i].t - S[lastMove].t >= REST_MS) { rest = true; break; }
    }
    i1 = lastMove;
    const cut = !rest || S[i1].t >= next;   // (a move another change took over, or one that does not come to rest: not judged)
    if (i1 - i0 < 6 || cut || (h.events || []).some((e) => e.k === 'hand' && e.t >= te - 100 && e.t <= S[i1].t)) continue;
    out.push({ t0: S[i0].t, t1: S[i1].t, to: views[v].to, rows: S.slice(i0, i1 + 1).map((s) => [s.t - S[i0].t, s.c[0], s.c[1], s.c[2]]) });
  }
  return out;
}

/** camera-straight: after a view change the camera's one move goes one way on one line and does not stop part way (the fit is no waypoint). */
export function cameraStraight(h) {
  const out = [];
  if (!h.vb) return out;
  for (const seg of viewSegments(h)) {
    const rows = seg.rows, f = rows[0], l = rows[rows.length - 1];
    const tr = { plan: { from: { k: f[1], x: f[2], y: f[3] }, to: { k: l[1], x: l[2], y: l[3] }, ms: l[0] }, frames: rows, end: 'moved' };
    for (const fail of judgeSlideMove(tr, h.vb, { clock: false, lateMs: Infinity, gapMs: Infinity })) out.push(finding('camera-straight', `the camera on the change to ${seg.to || 'a view'}`, fail, seg.t0, seg.t1));
    // a stop part way: the move's middle, where a waypoint at the fit would hold it
    const zl = Math.log(l[1] / f[1]), total = Math.hypot(l[2] - f[2], l[3] - f[3]) + Math.abs(zl) * 400;
    if (total > 20) {
      let run = 0, from = 0;
      for (let i = 1; i < rows.length; i++) {
        const d = Math.hypot(rows[i][2] - rows[i - 1][2], rows[i][3] - rows[i - 1][3]) + Math.abs(Math.log(rows[i][1] / rows[i - 1][1])) * 400;
        const done = (Math.hypot(rows[i][2] - f[2], rows[i][3] - f[3]) + Math.abs(Math.log(rows[i][1] / f[1])) * 400) / total;
        if (d < 0.05 && done > 0.1 && done < 0.9) { if (!run) from = rows[i - 1][0]; run += rows[i][0] - rows[i - 1][0]; if (run >= STOP_MS) { out.push(finding('camera-straight', `the camera on the change to ${seg.to || 'a view'}`, `stops part way (${Math.round(done * 100)}% of the move) for ${Math.round(run)} ms`, seg.t0 + from, seg.t0 + rows[i][0])); break; } } else run = 0;
      }
    }
  }
  return out;
}

/** camera-slide: the slide camera's recorded runs, judged by judgeSlideMove as pps.cameraGate judges them (timing fails are left out of a throttled page). */
export function cameraSlide(h) {
  const out = [];
  for (const tr of h.traces || []) {
    if (!tr.vb && !h.vb) continue;
    const frames = tr.frames || [], gaps = frames.slice(1).map((f, i) => f[0] - frames[i][0]).sort((a, b) => a - b);
    const slow = (gaps.length > 2 && gaps[gaps.length >> 1] > 400) || gaps.filter((g) => g >= 900 && g <= 1150).length >= 2;
    for (const fail of judgeSlideMove(tr, tr.vb || h.vb, { lateMs: 120, pressMs: 900 })) {
      if (slow && /after (the press|it was asked)/.test(fail)) continue;
      out.push(finding('camera-slide', `slide camera move (${tr.why || 'slide'})`, fail, tr.at ?? 0));
    }
  }
  return out;
}

/** The rules, in the order they run: { id, kind: 'series', judge(history) -> findings }. */
export const MOTION_RULES = [
  { id: 'flash', kind: 'series', judge: flash },
  { id: 'stuck-mid', kind: 'series', judge: stuckMid },
  { id: 'label-slide', kind: 'series', judge: labelSlide },
  { id: 'label-detached', kind: 'series', judge: labelDetached },
  { id: 'label-dim-alpha', kind: 'series', judge: labelDimAlpha },
  { id: 'number-width-jump', kind: 'series', judge: numberWidthJump },
  { id: 'card-pop', kind: 'series', judge: cardPop },
  { id: 'card-size-snap', kind: 'series', judge: cardSizeSnap },
  { id: 'glass-before-words', kind: 'series', judge: glassBeforeWords },
  { id: 'card-empty', kind: 'series', judge: cardEmpty },
  { id: 'camera-straight', kind: 'series', judge: cameraStraight },
  { id: 'camera-slide', kind: 'series', judge: cameraSlide },
].map((r) => ({ ...r, ...RULE_INFO[r.id] }));

/** Every rule over one history: the findings, in time order. A rule that throws is reported as a finding of its own, never swallowed. */
export function judgeMotion(h, rules = MOTION_RULES) {
  const out = [];
  for (const r of rules) {
    try { out.push(...r.judge(h)); } catch (e) { out.push({ rule: r.id, what: 'the rule itself', where: `threw: ${e && e.message ? e.message : e}`, why: r.why || '', owner: 'src/ui/watch/motion-rules.js', at: '0.0 s', t0: 0, t1: 0 }); }
  }
  return out.sort((a, b) => a.t0 - b.t0 || a.rule.localeCompare(b.rule));
}
