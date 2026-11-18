// The ?watch recorder (screen-report plan step 2c): keeps the last seconds of what the app draws, as numbers, and judges them with the motion rules.
//
// What it costs: nothing without ?watch (start.js is never loaded). With it, once per frame the scheduler ran (onFrameEnd: it asks for no frame
// of its own, so a resting page stays at rest), it copies numbers the app already keeps: the camera's view, the GPU labels' last picture, the
// glass's last drawn cards. It reads no layout (AGENTS.md: no layout read in a frame); the boxes of a changed number are read at rest, in a rest
// pass (sources.js). The rules run about once a second in a rest pass, never in a frame. A DOM write happens only when a finding is new (the dot).
//
// Pure of the page: the clock, the frame hook, the rest pass and the sources are handed in, so tests/watch-recorder.test.js runs it in Node.
//   sources: { cam(): [k, x, y] | null, labels(): [[key, x, y, w, h, alpha, ax?, ay?]] | null, cards(): [[name, x, y, w, h, alpha]] | null,
//              traces(): slide camera traces (closed or open) | null, vb(): view units | null }
import { exportHistory } from './history.js';
import { judgeMotion, MOTION_RULES } from './motion-rules.js';

export const KEEP_MS = 20000, MIN_GAP_MS = 16, JUDGE_MS = 1000, COOLDOWN_MS = 4000, MAX_FINDINGS = 60;

export function createWatch({ now = () => performance.now(), onFrames, rest = (fn) => fn(), sources = {}, env = () => ({}), rules = MOTION_RULES, onFinding = null, keepMs = KEEP_MS, judgeMs = JUDGE_MS } = {}) {
  const t0 = now(), startedAt = new Date().toISOString();
  let samples = [], events = [], traces = [], vb = null, last = -1e9, lastJudge = t0, stop = null, on = false;
  const found = [], said = new Map();   // (findings so far, and when each rule+what was last reported)
  const read = (fn) => { try { const v = fn ? fn() : null; return v === undefined ? null : v; } catch { return null; } };   // (an unreadable source is null: unknown, not none)

  function sample(t) {
    samples.push({ t: t - t0, c: read(sources.cam), L: read(sources.labels), K: read(sources.cards) });
    const cut = t - t0 - keepMs;
    if (samples[0].t < cut) { let i = 0; while (i < samples.length && samples[i].t < cut) i++; samples = samples.slice(i); events = events.filter((e) => e.t >= cut); traces = traces.filter((x) => x.at >= cut); }
  }
  function frame() {
    const t = now();
    if (t - last >= MIN_GAP_MS) { last = t; sample(t); }
    if (t - lastJudge >= judgeMs) { lastJudge = t; rest(judge); }
  }
  /** Notes an event (a view change, a hand on the screen, a number that changed): { k, ...data }, stamped now. */
  function event(k, data = {}) { events.push({ t: now() - t0, k, ...data }); }
  function takeTraces() {
    const list = read(sources.traces) || [];
    const v = read(sources.vb); if (v) vb = v;
    for (const tr of list) {
      if (!tr || !tr.end) continue;   // (open runs are judged when they close)
      const key = tr.t0;
      if (traces.some((x) => x.key === key)) continue;
      const frames = tr.frames;
      if (!frames || !frames.length) continue;
      traces.push({ key, at: tr.t0 - t0, why: tr.why, end: tr.end, plan: tr.plan && { from: tr.plan.from, to: tr.plan.to, ms: tr.plan.ms }, frames, after: tr.after || null, press: tr.press != null ? tr.press - t0 : null, t0: tr.t0 - t0, vb: tr.vb || vb, steps: tr.steps || null, stalls: tr.stalls || [], blocked: (tr.blocked || []).length });
    }
  }
  /** The history the rules read, as the objects (not rounded). */
  function raw() { return { samples, events, traces, vb, env: env() || {}, startedAt }; }
  /** Judges the last seconds now; reports each new finding once (and again after COOLDOWN_MS). Returns the new findings. */
  function judge() {
    takeTraces();
    const fresh = [];
    for (const f of judgeMotion(raw(), rules)) {
      const key = `${f.rule}|${f.what}`, prev = said.get(key);
      if (prev != null && now() - prev < COOLDOWN_MS) continue;
      said.set(key, now()); fresh.push(f); found.push(f);
      if (found.length > MAX_FINDINGS) found.shift();
    }
    for (const f of fresh) { try { onFinding?.(f); } catch { /* the dot is a bonus */ } }
    return fresh;
  }
  function start() { if (on) return api; on = true; stop = onFrames ? onFrames(frame) : null; return api; }
  function end() { on = false; if (stop) stop(); stop = null; }
  const api = {
    start, stop: end, event, judge, sample: () => sample(now()), raw,
    get on() { return on; },
    /** The last `seconds` as plain JSON (history.js); the bug packet and the Node replay read it. */
    history: ({ seconds = 10, maxBytes } = {}) => { takeTraces(); return exportHistory(raw(), { seconds, ...(maxBytes ? { maxBytes } : null) }); },
    /** The findings so far, newest last (each once). */
    findings: () => found.slice(),
    clear() { found.length = 0; said.clear(); },
  };
  return api;
}
