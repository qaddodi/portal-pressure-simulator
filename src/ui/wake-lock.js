// Keeps the screen awake while a talk (or projector mode) is up (A24, 13 Nov 2026). A presenter who stops on one slide for a long question
// should not find the laptop or iPad dimmed and locked. Uses the Screen Wake Lock API where the browser has it (Safari 16.4+, Chrome, Edge,
// Firefox 126+); elsewhere it does nothing and the screen behaves as before.
//
// The browser lets the lock go whenever the page is hidden (a tab switch, a locked phone), so it is asked for again when the page returns.
// A request can be refused (low battery, a power-saving mode, an iframe without the permission): that is counted and the talk goes on.

import { caught } from './caught.js';

let want = false, sentinel = null, asking = false, listening = false, refused = '';

const api = () => (typeof navigator !== 'undefined' && navigator.wakeLock && typeof navigator.wakeLock.request === 'function' ? navigator.wakeLock : null);

async function grab() {
  const wl = api();
  if (!want || sentinel || asking || !wl || document.hidden) return;
  asking = true;
  try {
    const s = await wl.request('screen');
    if (!want) { s.release().catch(() => {}); return; }   // (the talk ended while the browser was answering)
    sentinel = s;
    refused = '';
    s.addEventListener('release', () => { if (sentinel === s) sentinel = null; });   // (the browser let go: the page was hidden; it is asked again on return)
  } catch (e) {
    refused = e?.name || 'refused';
    caught('wake-lock:request', e);   // (not allowed now: the screen may sleep as it always did)
  } finally { asking = false; }
}

function onVisible() { if (!document.hidden) grab(); }

/** Holds (on = true) or lets go of (false) the screen lock. Safe to call again with the same value. */
export function keepAwake(on) {
  want = !!on;
  if (want) {
    if (!listening) { listening = true; document.addEventListener('visibilitychange', onVisible); }
    grab();
  } else if (sentinel) {
    const s = sentinel; sentinel = null;
    s.release().catch(() => {});
  }
}

/** For the "Before the talk" check card (D2): can this browser hold the screen awake, and does it now? */
export function awakeState() {
  return { supported: !!api(), held: !!sentinel && !sentinel.released, wanted: want, refused };
}
