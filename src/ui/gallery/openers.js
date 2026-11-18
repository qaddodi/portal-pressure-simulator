// Opening a specimen that is not a teaching-card slide: a Tests pane, a structure card, a sheet, a figure view (plan 1.2 to 1.5).
// Each opener uses the app's own controls (window.pps), never a copy of the card. Step 2 of the gallery fills these in.

/** kind → async (entry, pps) => void. */
export const OPENERS = {};

/** Brings the app to the state a specimen describes. A kind with no opener says so in the page's toast instead of doing nothing. */
export async function openEntry(entry, pps) {
  const fn = OPENERS[entry.kind];
  if (!fn) { const { toast } = await import('../util.js'); toast(`No opener yet for ${entry.kind} specimens.`); return; }
  await fn(entry, pps);
}
