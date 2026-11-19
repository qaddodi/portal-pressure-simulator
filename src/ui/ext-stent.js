// The stent cards (16 Nov 2026), registered for slide-ext.js: the TIPS's or DIPS's side view and the staircase of where its pressure goes (tool-stent.js).
//   tool: { kind: 'stent', vessel: 'TIPS' | 'DIPS', show: ['lumen'] | ['loss'] | ['lumen', 'loss'], to?: 'ppg', max?: mmHg, gate?: 'proximal' | 'mid' | 'distal' | 'site' }
//     show      the pictures, top to bottom (default the side view); a slide gives its tiles beside them (tipsFlow, tipsDp, tipsVel, tipsLumen, tipsLocalPct, ppg)
//     to        'ppg': the staircase starts at the PPG and the veins outside the stent take their share (default: it starts at the stent's own drop)
//     max       the staircase's top in mmHg, the same on every slide that compares (default: the next multiple of 4 over the PPG, at least 8)
//     gate      the Doppler third this slide reads, a band behind it on the side view
import { createStent, stentTitle } from './tool-stent.js';

export default {
  tools: {
    stent: { make: () => createStent(), title: (t) => stentTitle(t), short: (t) => (Array.isArray(t?.show) && !t.show.includes('lumen') ? 'Pressure loss' : 'Stent') },
  },
};
