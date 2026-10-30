// Deck visuals, package G. Instruments: V19, V20, V21, V27, V29 (review/deck-visuals-recs.md §9).
// What this package adds to slides, registered for slide-ext.js (see its header for each part's shape). A deck that sets
// none of its fields is unchanged.
//
//   tool: { kind: 'lumen', vessel: 'PV_TRUNK', site?, name? }   V19: the vessel in cross-section, its clot, narrowing or stent (tool-lumen.js);
//                                                     site: where a stent is cut ('proximal' | 'mid' | 'distal'); name: the words in the
//                                                     circle above the % (default: the vessel's short name, "Distal TIPS" for a stent)
//   tool: { kind: 'fluid' }                          V27: lymph made against lymph drained (tool-fluid.js); forces: true adds
//                                                    the forces across the sinusoid wall, caveat: true the no-kidneys line
//                                                    window: true draws the capacity window instead (per day: lymph made, the
//                                                    lymphatics as a window filled to what they carry, overflow − taken back)
// And on the Doppler (doppler.js configure, its own options, read on every slide that shows it):
//   tool: { kind: 'doppler', mode: 'color' | 'variance' }   V20: the display mode (the next slide is Spectrum unless it names one)
//   tool: { kind: 'doppler', calipers: true }        V21: peak and trough marked on the trace, the pulsatility index between them
//   tool: { kind: 'doppler', pair: true }            V29: the right hepatic vein's trace under the portal vein's (or the main
//                                                    portal vein's under a hepatic vein's), beat for beat

import { createLumen, lumenName } from './tool-lumen.js?v=5596b3ca39';
import { createFluid } from './tool-fluid.js?v=2930867b9f';

export default {
  tools: {
    lumen: { make: () => createLumen(), title: (t) => `The ${lumenName(t.vessel || 'PV_TRUNK')}, in cross-section`, short: () => 'Cross-section' },
    fluid: { make: () => createFluid(), title: (t) => (t?.window ? 'Fluid balance · mL/day' : 'Fluid balance: lymph made and drained'), short: (t) => (t?.window ? 'Fluid balance · mL/day' : 'Fluid balance') },
  },
};
