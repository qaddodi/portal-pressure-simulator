// What Send feedback adds to the draft (laptop-heat quick item Q3, 31 Oct 2026): the page's frame rate and the browser's backdrop blurs on
// screen, as plain text in the email body the person reads, edits and sends themselves. Heat reports then arrive with the two numbers that
// say where it comes from: how many frames the page really runs, and which glass fell back to the browser's blur (blur-gauge.js). Nothing
// is sent by the app; the body is built here, on the page, when the button is pressed.
import { scanBlurs, blurText } from './blur-gauge.js';
import { caught } from './caught.js';

/** "Frames: 60 a second (stage 60, shown 4, dock 2)": the page's scheduled frames a second and its busiest surfaces (frame.js perf()). */
export function framesLine(p) {
  if (!p || !Number.isFinite(p.fps)) return 'Frames: not measured';
  const top = Object.entries(p.surfaces || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${n}`);
  return `Frames: ${p.fps} a second${top.length ? ` (${top.join(', ')} callbacks a second)` : ''}`;
}

/**
 * The extra lines of the feedback draft: frames, then the backdrop blurs the browser draws now and why (at most `limit` listed).
 * `perf`: frame.js perf; `blurWhy`: stage.blurWhy; never throws (a failure leaves the draft as it was).
 */
export function feedbackDiagnostics({ perf, blurWhy, root = globalThis.document, win = globalThis.window, limit = 8 } = {}) {
  const out = [];
  try { out.push(framesLine(perf?.())); } catch (e) { caught('feedback-diag:20', e); /* a measuring aid only */ }
  try {
    const rows = scanBlurs(root, (el) => blurWhy?.(el) ?? null, win);
    out.push(blurText(rows, root.querySelectorAll('[data-gl]').length, limit));
  } catch (e) { caught('feedback-diag:24', e); /* a measuring aid only */ }
  return out;
}
