// The stent cards (16 Nov 2026), registered for slide-ext.js: the TIPS's or DIPS's side view and the bar of where its pressure goes (tool-stent.js).
//   tool: { kind: 'stent', vessel: 'TIPS' | 'DIPS', show: ['lumen'] | ['loss'] | ['lumen', 'loss'], to?: 'ppg', max?: mmHg, gate?: 'proximal' | 'mid' | 'distal' | 'site' }
//     show      the pictures, top to bottom (default the side view); a slide gives its tiles beside them (tipsFlow, tipsDp, tipsVel, tipsLumen, tipsLocalPct, ppg)
//     to        'ppg': the bar runs on past the stent to the PPG, the part outside the stent hatched (default: the stent's own drop)
//     max       the bar's scale in mmHg, the same on every slide that compares (default 16)
//     gate      the Doppler third this slide reads, a band behind it on the side view
import { createStent, stentTitle } from './tool-stent.js';

export default {
  tools: {
    stent: { make: () => createStent(), title: (t) => stentTitle(t), short: (t) => (Array.isArray(t?.show) && !t.show.includes('lumen') ? 'Pressure loss' : 'Stent') },
  },
};
