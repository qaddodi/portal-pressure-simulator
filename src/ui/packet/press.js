// The pure half of packet/trigger.js (no page imports, so a Node test can drive it): the long press on the PREVIEW pill, the chord, and the preview-copy check.

export const HOLD_MS = 700, SLOP_PX = 12;

/** Is this the preview copy (or a local run)? The live site never offers the packet. */
export const isPreview = (loc = location) => /\/preview\//.test(loc.pathname) || /^(localhost|127\.0\.0\.1)$/.test(loc.hostname);

/** Alt+Shift+/ (code Slash, not typed into a field). Pure, for the tests. */
export function isChord(e) {
  if (!e || e.code !== 'Slash' || !e.shiftKey || !(e.altKey || e.ctrlKey) || e.metaKey) return false;
  const tag = String(e.target?.tagName || '').toLowerCase();
  return !(tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable);
}

/** The pill must not start a text selection, a callout or a scroll when held: iOS cancels the touch (pointercancel) as soon as it does, which is what ended the first version of this press. */
export const BADGE_CSS = '#preview-badge { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; touch-action: none; }';

/**
 * A long press on `badge`: fires `onHold` after holdMs of the finger staying put, and swallows the click that follows so the pill does not also reload the page.
 * The hold ends on lift (pointerup, touchend) or when the finger moves past `slop`. A `pointercancel` does NOT end it: iOS Safari sends one when it begins a text
 * selection or callout on a held pill, about half a second in, and the first version cancelled on it, so the hold never reached 0.7 s on an iPhone.
 * Returns the function that takes the listeners off. timers: { set, clear } for the tests.
 */
export function longPress(badge, onHold, { holdMs = HOLD_MS, slop = SLOP_PX, timers = { set: setTimeout, clear: clearTimeout } } = {}) {
  let t = null, x0 = 0, y0 = 0, fired = false;
  const stop = () => { if (t != null) { timers.clear(t); t = null; } };
  const point = (e) => e.touches?.[0] || e;
  const arm = (e) => { if (t != null) return; fired = false; const p = point(e); x0 = p.clientX; y0 = p.clientY; t = timers.set(() => { t = null; fired = true; onHold(); }, holdMs); };
  const move = (e) => { if (t == null) return; const p = point(e); if (Math.hypot(p.clientX - x0, p.clientY - y0) > slop) stop(); };
  const click = (e) => { if (fired) { fired = false; e.stopImmediatePropagation(); e.preventDefault(); } };
  const menu = (e) => e.preventDefault();   // (iOS and Android offer a callout on a long press)
  const sel = (e) => e.preventDefault();
  const on = [['pointerdown', arm], ['touchstart', arm], ['pointermove', move], ['touchmove', move], ['pointerup', stop], ['touchend', stop], ['click', click, true], ['contextmenu', menu], ['selectstart', sel]];
  for (const [n, f, c] of on) badge.addEventListener(n, f, c);
  return () => { stop(); for (const [n, f, c] of on) badge.removeEventListener(n, f, c); };
}

