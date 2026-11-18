// The motion rules (src/ui/watch/motion-rules.js) in the registry, as 'series' rules: they judge the ?watch recorder's frames, oldest first.
// The registry hands a series rule an array of frames; the recorder's events (a view change, a hand on the screen, a number that changed), the
// slide camera's traces and the view units ride on that array as properties (events, traces, vb, env), so one input carries the whole history.
import { registerRule } from './rules.js';
import { MOTION_RULES } from '../watch/motion-rules.js';

/** The history object the motion rules read, from the array a series rule is given (or an object that already is one). */
export function historyOf(input, ctx = {}) {
  if (Array.isArray(input)) return { samples: input, events: input.events || [], traces: input.traces || [], vb: input.vb || null, env: input.env || (ctx && ctx.env) || {} };
  return input;
}
/** Frames as the registry takes them: the samples with the rest of the history attached. */
export function framesOf(h) { return Object.assign(h.samples.slice(), { events: h.events || [], traces: h.traces || [], vb: h.vb || null, env: h.env || {} }); }

for (const r of MOTION_RULES) registerRule({ id: r.id, owner: r.owner, why: r.why, kind: 'series', check: (input, ctx) => r.judge(historyOf(input, ctx)) });
