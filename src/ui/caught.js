// Every error the app catches and goes on from, counted in one place (bugs-recs 5, 2 Nov 2026). An empty catch hid real failures (a
// GL call refused, storage full, a deck that would not read): each now names itself here. Nothing is shown to the person; under ?perf
// the first of each kind is written to the console, and pps.caught() lists them all (counts and the last message) for a device report.

const PERF = typeof location !== 'undefined' && /[?&]perf\b/.test(location.search || '');
const log = new Map();   // tag -> { n, last }

/** Counts a caught error under `tag` (its file and place). Cheap: no stack, no allocation after the first of a tag. */
export function caught(tag, e) {
  let r = log.get(tag);
  if (!r) { r = { n: 0, last: '' }; log.set(tag, r); if (PERF) console.warn(`caught (${tag}):`, e); }   // alloc-rare: the first catch of each tag (a record for it, and under ?perf its one console line)
  r.n++;
  r.last = e?.message ?? String(e);   // alloc-rare: only for a caught value with no message; String() of a string is that string
}
/** What has been caught since the page opened, by tag. */
export const caughtNow = () => Object.fromEntries([...log].map(([k, v]) => [k, { ...v }]));
if (typeof window !== 'undefined') { window.pps = window.pps || {}; window.pps.caught = caughtNow; }
