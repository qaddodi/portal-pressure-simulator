// "Is the page still busy?", once (19 Nov 2026, DBG-2 of the bible review). Two probes used to answer it and disagreed: the gallery's `probeBusy` (presenter, view change, glide, prep
// classes, fonts, animations; no lobule) and the camera bench's `isBusy` (glide, lobule, presenter; no prep, fonts or animations), so a lobule specimen, a lobule packet replay or the
// Sweep could be read while the lobule camera still glided. Every waiter now asks this module: the gallery API, the packet, the Phone check, the camera bench and the harnesses.
// Reads no layout box (DOM queries and the animation list only; the page hands in layout-snap.js's readAnims, so the layout-read count stays with that file).
//
//   pageBusy(pps, doc, { anims, changing })   true while something is still arriving. `doc` null asks only the motion half (camera, view, lobule, presenter, `changing`): cheap, and
//                                              what a bench may ask every frame. With a document it also asks cards not yet styled, fonts and animations that will end.
//   waitQuiet(busy, opts)                      Promise<{ settled, ms }>: resolves once `busy()` has been false for quietMs (QUIET_MS by default), or after timeoutMs.
//   QUIET_MS, QUIET_LONG_MS, POLL_MS           the one quiet window (300 ms) and polling step; QUIET_LONG_MS (600) is the bug packet's: a replay reads a page that has been still longer.

export const QUIET_MS = 300;        // motion-scale: not a move (a wait's timing). nothing busy for this long counts as settled
export const QUIET_LONG_MS = 600;   // motion-scale: not a move (a wait's timing). the packet's wait before it reads or replays
export const POLL_MS = 100;         // motion-scale: not a move (a wait's timing). how often a wait asks

/**
 * Is anything still arriving? The presenter changing cards, the camera or the view change gliding, the lobule's camera, a card not yet styled, a running animation that will
 * end, fonts loading. pps: window.pps (or a stand-in); doc: the document, or null for the motion half only; anims(doc): the animation list; changing: frame.js inChange().
 */
export function pageBusy(pps, doc = null, { anims = () => [], changing = false } = {}) {
  try {
    if (changing) return true;
    const st = pps?.stage;
    // (A case or question card holds the talk until a tap lifts it: the presenter is busy by design while it stands, and the card standing whole is the landing.)
    const held = !!doc?.querySelector?.('.pz-case.on');   // (the slide's own cards are fitted unseen behind it, pz-prep: also the card standing, not motion)
    if (pps?.presenter?.busy?.() && !held) return true;
    if (st?.viewChanging?.() || st?.gliding?.()) return true;
    if (st?.lobuleSettled && st.lobuleSettled() === false) return true;
    if (st?.lobuleGlide?.()) return true;
    if (!doc) return false;
    if (doc.querySelector(held ? '.pz-load.on, .pz-cover, .action-card.ac-prep' : '.pz-load.on, .pz-cover, .pz.pz-prep, .pz-text[aria-busy="true"], .pz-data[aria-busy="true"], .action-card.ac-prep')) return true;
    if (doc.fonts && doc.fonts.status === 'loading') return true;
    // (The Doppler pane's marker glides to each new reading of the live model, always: a gallery page's own chrome and that marker are not motion to wait for.)
    const running = anims(doc)?.some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getTiming?.().iterations) && !a.effect?.target?.closest?.('[data-gallery], .dop-mark'));
    if (running) return true;
  } catch { /* (a page that cannot be asked is not held up) */ }
  return false;
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const sleepFor = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Resolves { settled, ms } once busy() has been false for quietMs, or { settled: false, ms } after timeoutMs. now and sleep are for tests. */
export async function waitQuiet(busy, { timeoutMs = 30000, quietMs = QUIET_MS, pollMs = POLL_MS, now = nowMs, sleep = sleepFor } = {}) {
  const t0 = now();
  let quiet = -1;
  for (;;) {
    const t = now();
    if (!busy()) { if (quiet < 0) quiet = t; if (t - quiet >= quietMs) return { settled: true, ms: Math.round(t - t0) }; } else quiet = -1;
    if (t - t0 >= timeoutMs) return { settled: false, ms: Math.round(t - t0) };
    await sleep(pollMs);
  }
}
