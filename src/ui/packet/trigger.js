// The three ways to ask "What's wrong here?" in the app (preview copy only, never the live site): a chord on a keyboard, a long press on the orange PREVIEW pill on a
// phone, and `pps.packet.open()` (the gallery's Tools button calls it; so can a console or a headless run). Loaded lazily by main.js, with ?pkt applied after boot.
//
//   Alt+Shift+/   (Option+Shift+? on a Mac): Shift+? alone is the keyboard-shortcuts help, so the chord adds Alt.
//   hold the pill 0.7 s: the packet sheet; a short tap still reloads onto the newest build, as before.
//   pps.packet.build(note)   -> the packet object      pps.packet.text(note)   -> the text to paste      pps.packet.open()   -> the sheet
//   pps.packet.parse(text), pps.packet.apply(x)      -> read a packet; put the extras of a state on this page (what a replay in the browser does)
//   pps.packet.ready  (a promise: booted, and the link's ?pkt part applied)      pps.packet.settled({ timeoutMs, quietMs })  -> { settled, ms } once nothing is arriving
//                                                    (the headless replay, scripts/packet-headless.mjs, waits on these two)

import { packetNow } from './sources.js';
import { openPacketSheet } from './sheet.js';
import { packetText, parsePacket } from './packet.js';
import { applyFromAddress, applyExtras } from './state.js';
import { probeBusy } from '../gallery/api.js';
import { readAnims } from '../layout-snap.js';

export const HOLD_MS = 700, SLOP_PX = 12;

/** Is this the preview copy (or a local run)? The live site never offers the packet. */
export const isPreview = (loc = location) => /\/preview\//.test(loc.pathname) || /^(localhost|127\.0\.0\.1)$/.test(loc.hostname);

/** Alt+Shift+/ (code Slash, not typed into a field). Pure, for the tests. */
export function isChord(e) {
  if (!e || e.code !== 'Slash' || !e.shiftKey || !(e.altKey || e.ctrlKey) || e.metaKey) return false;
  const tag = String(e.target?.tagName || '').toLowerCase();
  return !(tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable);
}

/**
 * A long press on `badge`: fires `onHold` after holdMs of the finger staying put, and swallows the click that follows so the pill does not also reload the page.
 * Returns the function that takes the listeners off. timers: { set, clear } for the tests.
 */
export function longPress(badge, onHold, { holdMs = HOLD_MS, slop = SLOP_PX, timers = { set: setTimeout, clear: clearTimeout } } = {}) {
  let t = null, x0 = 0, y0 = 0, fired = false;
  const stop = () => { if (t != null) { timers.clear(t); t = null; } };
  const down = (e) => { fired = false; x0 = e.clientX; y0 = e.clientY; stop(); t = timers.set(() => { t = null; fired = true; onHold(); }, holdMs); };
  const move = (e) => { if (t != null && Math.hypot(e.clientX - x0, e.clientY - y0) > slop) stop(); };
  const click = (e) => { if (fired) { fired = false; e.stopImmediatePropagation(); e.preventDefault(); } };
  const menu = (e) => e.preventDefault();   // (iOS and Android offer a callout on a long press)
  badge.addEventListener('pointerdown', down); badge.addEventListener('pointermove', move); badge.addEventListener('pointerup', stop); badge.addEventListener('pointercancel', stop); badge.addEventListener('pointerleave', stop);
  badge.addEventListener('click', click, true); badge.addEventListener('contextmenu', menu);
  return () => { stop(); for (const [n, f, c] of [['pointerdown', down], ['pointermove', move], ['pointerup', stop], ['pointercancel', stop], ['pointerleave', stop], ['click', click, true], ['contextmenu', menu]]) badge.removeEventListener(n, f, c); };
}

export function installPacketTrigger({ pps = window.pps, win = window, doc = document } = {}) {
  if (!isPreview(win.location) || pps.packet) return null;
  const say = (t) => pps.toast?.(t);
  const build = (note = '') => packetNow(pps, { note, win, doc });
  const open = () => openPacketSheet({ build, doc, say });
  pps.packet = { build, text: async (note) => packetText(await build(note)), open, parse: parsePacket, apply: (x) => applyExtras(x, pps, { doc }), isPreview: true };
  win.addEventListener('keydown', (e) => { if (isChord(e)) { e.preventDefault(); e.stopImmediatePropagation(); open(); } }, true);
  const badge = doc.getElementById('preview-badge');
  if (badge) longPress(badge, open);
  const booted = new Promise((ok) => { if (pps.store.get().booted) ok(); else { const off = pps.store.on('booted', (v) => { if (v) { off?.(); ok(); } }); } });
  pps.packet.ready = booted.then(() => applyFromAddress(pps, { hash: win.location.hash, doc })).then((skipped) => { if (skipped?.length) console.warn('[packet] not applied:', skipped.join('; ')); return skipped || []; }, (e) => { console.warn('[packet] state link:', e); return [String(e?.message || e)]; });   // alloc-rare: once at boot
  pps.packet.settled = settled(pps, doc);
  return pps.packet;
}

/** Resolves { settled, ms } once nothing has been arriving for quietMs (the gallery's own probe: presenter, camera, cards still styling, fonts, running animations). One timer while waiting. */
export function settled(pps, doc = document) {
  return ({ timeoutMs = 60000, quietMs = 600, pollMs = 100 } = {}) => new Promise((done) => {
    const t0 = performance.now();
    let quiet = -1;
    const tick = () => {
      const t = performance.now();
      if (!probeBusy(pps, doc, readAnims)) { if (quiet < 0) quiet = t; if (t - quiet >= quietMs) return done({ settled: true, ms: Math.round(t - t0) }); } else quiet = -1;
      if (t - t0 >= timeoutMs) return done({ settled: false, ms: Math.round(t - t0) });
      setTimeout(tick, pollMs);
    };
    tick();
  });
}
