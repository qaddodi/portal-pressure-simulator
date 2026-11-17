// The stent cards' looks (src/ui/tool-stent.js, 16 Nov 2026): the side view of a TIPS or DIPS and the staircase of where its pressure goes.
// New entries, so no stylesheet rule is behind them: the colours are the app's own tokens (the stent's metal, the veins' colours, the
// flow and ramp colours the figure uses), the words' size is the builder's font-size attribute (12 px on screen, as the cross-section's).
import { tok, mix } from './dsl.js';

const halo = { stroke: tok('surface'), width: 3, join: 'round' };
const stroke = (t) => ({ base: { fill: 'none', stroke: t === 'text-3' ? mix('srgb', tok(t), 70, 'transparent') : tok(t), width: 4.5, cap: 'butt', join: 'round' } });
const dot = (t) => ({ base: { fill: mix('srgb', tok(t), 70, 'transparent') } });

const area = (t) => ({ base: { fill: mix('srgb', tok(t), 16, 'transparent'), stroke: 'none' } });
const line = (t) => ({ base: { fill: 'none', stroke: tok(t), width: 2, cap: 'round', join: 'round' } });
const dotOn = (t) => ({ base: { fill: tok(t), stroke: tok('surface'), width: 1.4 } });

export const STENT = {
  // the vein stubs either side, open ended: a faint fill in the vein's colour and its two walls running up to the stent
  'stent.vein.p': { base: { fill: mix('srgb', tok('tour-portal'), 14, 'transparent') } },
  'stent.vein.h': { base: { fill: mix('srgb', tok('tour-sys'), 14, 'transparent') } },
  'stent.vein.wall': { base: { fill: 'none', stroke: mix('srgb', tok('text-3'), 70, 'transparent'), width: 1.2, cap: 'round' } },
  // the lumen, filled by the piece's own gradient (the figure's velocity colours), edged in the stent metal; the cover tinted over the stretch it covers
  'stent.lumen': { base: { stroke: tok('stent-metal'), width: 1, join: 'round' } },
  'stent.graft': { base: { fill: tok('dev-graft'), fillOpacity: 0.28, stroke: 'none' } },
  // the device as the figure draws it (app-02-controls.css .stent-wire, .stent-glint, .stent-gold): rings of the bare stretch and of the covered one, a glint, the gold band and tab
  'stent.wire.backBare': { base: { fill: 'none', stroke: tok('dev-stent-wire'), width: 1.6, cap: 'round', join: 'round', strokeOpacity: 0.5 } },
  'stent.wire.backCov': { base: { fill: 'none', stroke: tok('dev-stent-wire'), width: 1.3, cap: 'round', join: 'round', strokeOpacity: 0.12 } },
  'stent.wire.frontBare': { base: { fill: 'none', stroke: tok('dev-stent-wire'), width: 1.8, cap: 'round', join: 'round' } },
  'stent.wire.frontCov': { base: { fill: 'none', stroke: tok('dev-stent-wire'), width: 1.4, cap: 'round', join: 'round', strokeOpacity: 0.92 } },
  'stent.wire.glint': { base: { fill: 'none', stroke: tok('dev-stent-glint'), width: 0.7, cap: 'round', join: 'round', strokeOpacity: 0.7 } },
  'stent.wire.band': { base: { fill: 'none', stroke: tok('dev-stent-gold'), width: 3.8, cap: 'round', join: 'round' } },
  'stent.wire.tab': { base: { fill: 'none', stroke: tok('dev-stent-gold'), width: 2.8, cap: 'round', join: 'round' } },
  // no stent: the outline it would have, dashed
  'stent.ghost': { base: { fill: 'none', stroke: tok('text-3'), width: 1.4, dash: [4.6, 3.2], join: 'round' } },
  // dimension lines (the narrowing's length and lumen), and the flow's arrow
  'stent.dim': { base: { fill: 'none', stroke: tok('text-2'), width: 1.25, cap: 'round', join: 'round' } },
  'stent.arrow': { base: { fill: tok('text-2') } },
  // the Doppler's three points: a tick, the number under it, and a band behind the slide's own third
  'stent.gate.tick': { base: { fill: 'none', stroke: tok('text-2'), width: 1.5, cap: 'round' } },
  'stent.gate.band': { base: { fill: mix('srgb', tok('accent'), 14, 'transparent') } },
  // the flow's streaks, carried along the lumen
  'stent.flow': { base: { fill: 'none', stroke: mix('srgb', tok('text'), 55, 'transparent'), width: 1.6, cap: 'round' } },
  // the colour key's strip (a gradient of its own)
  'stent.key.bar': { base: { stroke: mix('srgb', tok('text-3'), 50, 'transparent'), width: 0.8 } },
  'stent.num': { base: { fill: tok('text'), weight: 700, halo, baseline: 'central' } },
  'stent.word': { base: { fill: tok('text-2'), weight: 600, halo, baseline: 'central' } },
  'stent.cap': { base: { fill: tok('text-3'), weight: 500, halo, baseline: 'central' } },
  // ── where the pressure goes (stent-drop-pic.js): the staircase, each part's stretch of it in its colour, and the key's dots, words and numbers ──
  // the line of pressure left, its area, and one thick stroke over the line where each part takes it: the veins outside the stent (light grey), its tract (the stent's slate), its way in and out (the reversed-flow orange),
  // the friction along it (the accent), the narrowing's jet (violet)
  'stent.drop.line': { base: { fill: 'none', stroke: tok('text-2'), width: 1.5, cap: 'round', join: 'round' } },
  'stent.drop.area': { base: { fill: mix('srgb', tok('text-3'), 12, 'transparent'), stroke: 'none' } },
  // the stent's two ends and the PPG's level, dotted; the baseline (the IVC's)
  'stent.drop.guide': { base: { fill: 'none', stroke: mix('srgb', tok('text-3'), 70, 'transparent'), width: 1, dash: [2.4, 2.8], cap: 'butt' } },
  'stent.drop.base': { base: { fill: 'none', stroke: mix('srgb', tok('text-3'), 55, 'transparent'), width: 1 } },
  'stent.drop.s.out': stroke('text-3'), 'stent.drop.s.tract': stroke('stent-metal'), 'stent.drop.s.ends': stroke('flow-reversed'), 'stent.drop.s.wall': stroke('accent'), 'stent.drop.s.jet': stroke('ramp-violet'),
  'stent.key.dot.tract': dot('stent-metal'),
  'stent.key.dot.ends': dot('flow-reversed'),
  'stent.key.dot.wall': dot('accent'),
  'stent.key.dot.jet': dot('ramp-violet'),
  'stent.key.dot.out': { base: { fill: mix('srgb', tok('text-3'), 55, 'transparent'), stroke: mix('srgb', tok('text-3'), 70, 'transparent'), width: 1 } },
  'stent.key.text': { base: { weight: 500, fill: tok('text-2'), halo, baseline: 'central' } },
  'stent.lab': { base: { weight: 700, fill: tok('text'), halo, baseline: 'central' } },
  'stent.mark.text': { base: { weight: 600, fill: tok('text'), halo, baseline: 'central' } },
  // ── the traces along the stent (stent-trace-pic.js) ──
  // the lumen with its veins, the five sites' dashed lines, a numbered badge on each, a panel's baseline, its area, its line and a dot where each site reads
  'stent.tr.lumen': { base: { stroke: mix('srgb', tok('text-3'), 80, 'transparent'), width: 1, join: 'round' } },
  'stent.tr.site': { base: { fill: 'none', stroke: mix('srgb', tok('text-3'), 70, 'transparent'), width: 1, dash: [2.4, 2.8], cap: 'butt' } },
  'stent.tr.badge': { base: { fill: tok('text'), stroke: tok('surface'), width: 1.2 } },
  'stent.tr.badgeNum': { base: { fill: tok('surface'), weight: 700, baseline: 'central' } },
  'stent.tr.axis': { base: { fill: 'none', stroke: mix('srgb', tok('text-3'), 28, 'transparent'), width: 1 } },
  'stent.tr.zero': { base: { fill: 'none', stroke: mix('srgb', tok('text-3'), 70, 'transparent'), width: 1.2 } },
  'stent.tr.title': { base: { fill: tok('text-2'), weight: 600, halo, baseline: 'central' } },
  'stent.tr.area.pressure': area('accent'), 'stent.tr.area.energy': area('flow-reversed'), 'stent.tr.area.velocity': area('ramp-violet'),
  'stent.tr.line.pressure': line('accent'), 'stent.tr.line.energy': line('flow-reversed'), 'stent.tr.line.velocity': line('ramp-violet'),
  'stent.tr.dot.pressure': dotOn('accent'), 'stent.tr.dot.energy': dotOn('flow-reversed'), 'stent.tr.dot.velocity': dotOn('ramp-violet'),
};
