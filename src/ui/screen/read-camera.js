// The camera part of the screen report: the view, where the camera stands and what it is doing, and what its last moves did frame by frame.
// Built from the stage's own camera records (sources.js): cameraState (vt), cameraZoom, gliding / glideLeft / viewChanging / drifting / handMoved,
// cameraMoves (every glide the stage logged) and cameraTraces (slide-cam.js: one row of frames per slide move).
// THE ONE RULE: the judge is slide-cam.js's own `judgeSlideMove` (the one pps.cameraGate and the unit gate use), `nearView` is its tolerance, and the
// world rectangle the camera frames is cam-arc.js's `viewGeom`. Nothing here works a path out a second way. tests/screen-readers.test.js holds that.
import { viewGeom } from '../cam-arc.js';
import { judgeSlideMove, nearView } from '../slide-cam.js';

const r3 = (v) => Math.round(v * 1000) / 1000;
const r1 = (v) => Math.round(v * 10) / 10;
/** The moves that count for "one straight zoom": a glide the stage logged with a length (a dive or rise is the lobule's own, kind 'dive' / 'rise'). */
export const isGlide = (m) => (m.kind === 'glide' || m.kind === 'drift') && m.ms > 0 && !m.jump;

/**
 * src: { view: 'anatomy' | 'circuit' | 'lobule' | 'sinusoid', state: { k, x, y } | null, zoom: number | null, vb: { w, h, cx, cy } | null,
 *        moving: { gliding, viewChanging, drifting, following, left, ms, hand }, moves: [{ t, ms, kind, k0, k1, x0, y0, x1, y1, zoom, pan, slide, ... }],
 *        traces: [slide-cam traces], now: ms (the page's clock, for ages) }
 * Returns JSON: { view, state, world, zoom, moving, moves, traces }, traces each with the judge's failures in `fails`.
 */
export function readCamera(src) {
  const vt = src.state ? { k: r3(src.state.k), x: r1(src.state.x), y: r1(src.state.y) } : null;
  const vbOf = (tr) => tr?.vb || src.vb || { w: 1, h: 0, cx: 0, cy: 0 };   // (as cam-gate.js's vbOf)
  const g = vt && src.vb ? viewGeom(src.state, src.vb) : null;
  const m = src.moving || {};
  const traces = (src.traces || []).map((tr) => {
    // (A copy: the judge writes the stalls it finds into the trace it is given, and a second read must not list them twice.)
    const t = { ...tr, stalls: [] }, fails = judgeSlideMove(t, vbOf(tr));
    const fr = t.frames || [];
    return {
      at: r1(tr.t0 ?? 0), press: tr.press == null ? null : r1(tr.press), end: tr.end || 'running', ms: tr.plan?.ms ?? 0,
      from: tr.plan ? viewRow(tr.plan.from) : null, to: tr.plan ? viewRow(tr.plan.to) : null,
      frames: fr.length, stalls: t.stalls.slice(0, 8), held: (tr.held || []).length, blocked: [...new Set((tr.blocked || []).map((b) => b.who))],
      after: tr.after || null, fails,
    };
  });
  const moves = (src.moves || []).slice(-12).map((mv) => ({
    at: r1(mv.t ?? 0), kind: mv.kind || '', ms: Math.round(mv.ms || 0), slide: !!mv.slide, zoom: r3(mv.zoom || 0), pan: r1(mv.pan || 0),
    k: mv.k0 != null ? [r3(mv.k0), r3(mv.k1)] : null,
    restart: !!mv.restart, why: mv.why || null,
  }));
  return {
    view: src.view || null, state: vt, zoomLog: src.zoom == null ? null : r3(src.zoom),
    world: g ? { cx: r1(g.cx), cy: r1(g.cy), w: r1(g.w) } : null,
    moving: { gliding: !!m.gliding, viewChanging: !!m.viewChanging, drifting: !!m.drifting, following: !!m.following, handMoved: !!m.hand, leftMs: Math.round(m.left || 0), ms: Math.round(m.ms || 0) },
    moves, traces,
  };
}
const viewRow = (v) => ({ k: r3(v.k), x: r1(v.x), y: r1(v.y) });

/** Two views the camera planned to, within slide-cam's own near tolerance (so a refit that lands where the move did is not "a second move"). */
export const sameLanding = (a, b, vb) => nearView(a, b, vb);

/** The part as sentences. */
export function cameraText(p, { detail = 'summary' } = {}) {
  const v = p.state ? `k ${p.state.k}, centre ${p.state.x},${p.state.y}` : 'unknown';
  const out = [`Camera: ${p.view || 'view unknown'}, ${v}${p.world ? `, framing ${p.world.w} units wide around ${p.world.cx},${p.world.cy}` : ''}.`];
  const mv = p.moving;
  if (mv.gliding || mv.viewChanging || mv.drifting || mv.following) {
    out.push(`Moving: ${[mv.gliding && 'a glide', mv.viewChanging && 'a view change', mv.drifting && 'a slow push', mv.following && 'following a card'].filter(Boolean).join(', ')}${mv.leftMs ? `, ${mv.leftMs} of ${mv.ms} ms left` : ''}.`);
  } else out.push('At rest.');
  if (mv.handMoved) out.push('The view was placed by hand, and nothing has framed it since.');
  const last = p.traces.at(-1);
  if (last) out.push(`Last slide move: ${last.ms} ms, ${last.frames} frames, ${last.end}${last.fails.length ? `, FAILED: ${last.fails.join('; ')}` : ', passes the judge'}.`);
  if (detail === 'full') for (const t of p.traces.slice(0, -1)) out.push(`Earlier slide move at ${t.at}: ${t.ms} ms, ${t.end}${t.fails.length ? `, FAILED: ${t.fails.join('; ')}` : ''}.`);
  return out.join('\n');
}
