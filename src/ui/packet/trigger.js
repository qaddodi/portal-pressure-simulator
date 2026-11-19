// The three ways to ask "What's wrong here?" in the app (preview copy only, never the live site): a chord on a keyboard, a long press on the orange PREVIEW pill on a
// phone, and `pps.packet.open()` (the gallery's Tools button calls it; so can a console or a headless run). Loaded lazily by main.js, with ?pkt applied after boot.
//
//   Alt+Shift+/   (Option+Shift+? on a Mac): Shift+? alone is the keyboard-shortcuts help, so the chord adds Alt.
//   hold the pill 0.7 s, or Settings > What's wrong here? (no gesture needed): the packet sheet; a short tap still reloads onto the newest build, as before.
//   pps.packet.build(note)   -> the packet object      pps.packet.text(note)   -> the text to paste      pps.packet.open()   -> the sheet
//   pps.packet.parse(text), pps.packet.apply(x)      -> read a packet; put the extras of a state on this page (what a replay in the browser does)
//   pps.packet.ready  (a promise: booted, and the link's ?pkt part applied)      pps.packet.settled({ timeoutMs, quietMs })  -> { settled, ms } once nothing is arriving
//                                                    (the headless replay, scripts/packet-headless.mjs, waits on these two)

import { packetNow } from './sources.js';
import { openPacketSheet } from './sheet.js';
import { packetText, parsePacket } from './packet.js';
import { applyFromAddress, applyExtras } from './state.js';
import { HOLD_MS, SLOP_PX, isPreview, isChord, longPress, BADGE_CSS } from './press.js';
import { probeBusy } from '../gallery/api.js';
import { readAnims } from '../layout-snap.js';

export { HOLD_MS, SLOP_PX, isPreview, isChord, longPress };

export function installPacketTrigger({ pps = window.pps, win = window, doc = document } = {}) {
  if (!isPreview(win.location) || pps.packet) return null;
  const say = (t) => pps.toast?.(t);
  const build = (note = '') => packetNow(pps, { note, win, doc });
  const open = () => openPacketSheet({ build, doc, say });
  pps.packet = { build, text: async (note) => packetText(await build(note)), open, parse: parsePacket, apply: (x) => applyExtras(x, pps, { doc }), isPreview: true };
  win.addEventListener('keydown', (e) => { if (isChord(e)) { e.preventDefault(); e.stopImmediatePropagation(); open(); } }, true);
  const badge = doc.getElementById('preview-badge');
  if (badge) { const st = doc.createElement('style'); st.textContent = BADGE_CSS; doc.head.append(st); longPress(badge, open); }
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
