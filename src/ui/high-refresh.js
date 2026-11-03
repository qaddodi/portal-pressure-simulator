// High Refresh (120 Hz recs P1; 2 Nov 2026, Mohammad: "make this game engine 120hz"): a page in a browser tab can be held to 60 frames a
// second on a 120 Hz touch screen (Safari on iPad gives a page's frames at 60 unless "Prefer Page Rendering Updates near 60fps" is turned
// off; several Android browsers do the same for windowed pages). Full screen is the most reliable way past that hold, so on a touch device
// that can show an element full screen, the first tap or key goes full screen (it needs the person's own input), once a visit: leaving
// full screen is the person's choice and is kept. The page looks the same, without the browser's bars.
// iPhone Safari cannot show a page full screen (only video): there the Feature Flag, or the app added to the Home Screen, is the way.

import { caught } from './caught.js';
/** Whether this device should go full screen for its refresh: a touch screen. */
export function wantsFullscreen(nav = globalThis.navigator, doc = globalThis.document) {
  if (!doc) return false;
  const can = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
  if (!can) return false;
  return (nav?.maxTouchPoints || 0) > 1 && !/iPhone|iPod/.test(nav?.userAgent || '');
}

export function startHighRefresh() {
  if (!wantsFullscreen()) return;
  let asked = false;
  try { asked = sessionStorage.getItem('pps.hiRefresh') === '1'; } catch (e) { caught('high-refresh:19', e); /* storage unavailable */ }
  if (asked) return;
  const el = document.documentElement;
  const go = (e) => {
    if (asked || document.fullscreenElement || document.webkitFullscreenElement) return;
    if (e.type === 'keydown' && (e.metaKey || e.ctrlKey || e.altKey)) return;
    asked = true;
    try { sessionStorage.setItem('pps.hiRefresh', '1'); } catch (e) { caught('high-refresh:26', e); /* storage unavailable */ }
    removeEventListener('pointerup', go, true); removeEventListener('keydown', go, true);
    try {
      const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.();
      p?.catch?.(() => { /* refused: the page stays as it is */ });
    } catch (e) { caught('high-refresh:31', e); /* refused */ }
  };
  addEventListener('pointerup', go, { capture: true, passive: true });
  addEventListener('keydown', go, { capture: true, passive: true });
}
