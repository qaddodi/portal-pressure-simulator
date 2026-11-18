// The debug benches of the card gallery (preview only; docs/card-gallery.md, plan section 2.8). One entry per bench; each bench is its own lazy module
// whose default export is { id, title, mount(root, ctx) } and which returns a dispose function (or { dispose }) from mount. The list below is the one list:
// it registers every bench with the page (registry.js registerBench, so the rail shows them) and the unit test reads it.
//
//   id          group        what it is for
//   camera      Camera       from-view x to-view grid: play any move, hold to loop, and a straight-path check (the 18 Nov "no waypoint" rule)
//   slow        Motion       slow motion and frame step on the test clock (src/test-clock.js speed), for "it popped" and "it flickered"
//   procedures  Camera       each procedure's slides with Next and Back (TIPS, BRTO, BATO, Rex, EUS, the HVPG catheter)
//   memory      Memory       repeat a move N times while the GPU estimate, peak, contexts and heap are read (the iPhone tab kills)
//   flags       Diagnostics  every ?perf ?fps ?offgpu ?budget ?lap ?inputs flag as a toggle, and the copyable reports
//   looks       Data         the colour tokens and chart looks of the five looks, as swatches (no GPU, no screenshots)
//   words       Data         every string the cards can show, per slide, as one copyable text for wording review
//   model       Data         each patient's settled numbers (snapshots.js) next to the live model's
//   glyphs      Diagnostics  the GPU text atlas as a picture (the black-box-behind-a-label class of bugs)
//
// Rules for a bench (docs/card-gallery.md): no requestAnimationFrame (frameFor), no per-frame DOM writes, layout reads through layout-snap.js and only
// on a tap, a timer is a setTimeout chain (never setInterval), and dispose undoes every timer, listener and clock change.
import { registerBench } from '../registry.js';

export const BENCHES = [
  { id: 'camera', title: 'Camera moves', group: 'Camera', order: 10, blurb: 'Every view to every view. Tap to play a move, hold to loop it; each move is checked for a straight path.', load: () => import('./camera-grid.js') },
  { id: 'slow-motion', title: 'Slow motion', group: 'Motion', order: 20, blurb: 'Run the whole page and the model at a quarter or a tenth of speed, or one frame at a time.', load: () => import('./slow-motion.js') },
  { id: 'procedures', title: 'Procedures', group: 'Camera', order: 30, blurb: 'TIPS, BRTO, BATO, Rex, EUS and the HVPG catheter, one Next at a time.', load: () => import('./procedures.js') },
  { id: 'memory-loop', title: 'Memory loop', group: 'Memory', order: 40, blurb: 'Repeat a move and watch the GPU estimate, its peak, the contexts and the heap.', load: () => import('./memory-loop.js') },
  { id: 'flags', title: 'Diagnostics switches', group: 'Diagnostics', order: 50, blurb: 'The ?perf, ?fps, ?offgpu, ?budget, ?lap and ?inputs flags as toggles, and the copyable reports.', load: () => import('./flags.js') },
  { id: 'looks-table', title: 'Looks table', group: 'Data', order: 60, blurb: 'Colour tokens and the resolved chart looks for each of the five looks.', load: () => import('./looks-table.js') },
  { id: 'words-dump', title: 'Words dump', group: 'Data', order: 70, blurb: 'Every string the decks show, as one copyable text, with a guideline-wording check.', load: () => import('./words-dump.js') },
  { id: 'model-table', title: 'Model table', group: 'Data', order: 80, blurb: 'Each patient\'s settled numbers next to the live model\'s.', load: () => import('./model-table.js') },
  { id: 'glyph-atlas', title: 'Glyph atlas', group: 'Diagnostics', order: 90, blurb: 'The GPU text atlas as a picture.', load: () => import('./glyph-atlas.js') },
];

/** Registers one bench with the page: its module is read in when the bench opens, and dispose waits for a mount that is still loading. */
export function registerLazy(b) {
  return registerBench({
    id: b.id, title: b.title, group: b.group, order: b.order, summary: b.blurb,
    mount(root, ctx) {
      let off = null, gone = false;
      b.load().then((m) => { if (!gone) off = m.default.mount(root, ctx); }).catch((err) => { console.error(`[gallery] ${b.id}:`, err); });   // alloc-rare: a bench opening
      return () => { gone = true; (typeof off === 'function' ? off : off?.dispose)?.call(off); };
    },
  });
}

for (const b of BENCHES) registerLazy(b);
