// Screen-reader announcements through the page's polite live region (#live). Messages closer together than
// the gap are not dropped: the newest one waiting is spoken once the gap has passed, so the last word (a
// patient loaded, a reading changed) always reaches the listener without a burst of chatter.

export const LIVE_GAP = 3000;

/** An announcer over injectable clock, timer and writer (unit tests drive it without a page). */
export function createAnnouncer({ now = () => Date.now(), later = (fn, ms) => setTimeout(fn, ms), write, gap = LIVE_GAP }) {
  let last = -Infinity, pending = null, timer = false;
  const speak = (msg) => { last = now(); write(msg); };
  return function announce(msg) {
    if (!msg) return;
    const wait = last + gap - now();
    if (wait <= 0 && !timer) { speak(msg); return; }
    pending = msg;
    if (!timer) { timer = true; later(() => { timer = false; const m = pending; pending = null; if (m) speak(m); }, Math.max(0, wait)); }
  };
}

export const announce = createAnnouncer({ write: (msg) => { const el = document.getElementById('live'); if (el) el.textContent = msg; } });
