// Self-check rules over the screen report's figure part (screen/read-figure.js). Unit tests with a firing and a quiet case: tests/screen-rules-figure.test.js.
import { defineRule, finding } from './make-finding.js';

const TUBES = 'src/ui/stage-tubes.js';
const named = (v) => `${v.name} (${v.id})`;

export const figureRules = [
  defineRule({
    id: 'figure-colour-stale', on: 'figure', owner: TUBES, sev: 'error',
    why: 'Under the pressure lens a vessel end is the ramp colour of its pressure in 0.5 mmHg steps (colormap.js pressureColor, held 0.4 mmHg: stage-geohold.js qHold). A colour from a pressure more than a bin or two away is a stale paint.',
    check: (p) => (p.lens !== 'pressure' ? [] : p.vessels.filter((v) => v.colourFits === false).map((v) => finding({
      rule: 'figure-colour-stale', what: `Vessel ${named(v)}`, where: `coloured ${v.colour.join(' to ')} though its ends read ${v.pressure.join(' and ')} mmHg`, why: 'The vessel colour follows its pressure', owner: TUBES }))),
  }),
  defineRule({
    id: 'figure-vessel-no-colour', on: 'figure', owner: TUBES, sev: 'error',
    why: 'A vein the GPU draws has its two end colours (setColPair); a shown vein with none draws black or not at all. Arteries take the artery colour and are left out.',
    check: (p) => p.vessels.filter((v) => !v.artery && !v.ghost && v.opacity > 0.05 && (!v.colour || !v.colour[0] || !v.colour[1])).map((v) => finding({
      rule: 'figure-vessel-no-colour', what: `Vessel ${named(v)}`, where: 'shown with no end colours', why: 'Every shown vein has its colour pair', owner: TUBES })),
  }),
  defineRule({
    id: 'figure-vessel-width', on: 'figure', owner: TUBES, sev: 'error',
    why: 'A shown vessel has a width: a width that is not a number, or nothing, is a vessel the GPU draws as a hairline or not at all.',
    check: (p) => p.vessels.filter((v) => v.opacity > 0.05 && !(v.width > 0)).map((v) => finding({
      rule: 'figure-vessel-width', what: `Vessel ${named(v)}`, where: `shown at width ${v.width}`, why: 'A shown vessel has a width', owner: TUBES })),
  }),
  defineRule({
    id: 'figure-pressure-missing', on: 'figure', owner: TUBES, sev: 'warn',
    why: 'Under the pressure lens every shown vein has a model pressure at both ends; none means the colour was painted from no frame.',
    check: (p) => (p.lens !== 'pressure' ? [] : p.vessels.filter((v) => !v.artery && !v.ghost && v.colour && (!v.pressure || v.pressure.some((x) => !Number.isFinite(x)))).map((v) => finding({
      rule: 'figure-pressure-missing', what: `Vessel ${named(v)}`, where: 'coloured with no model pressure at its ends', why: 'The pressure lens paints from the model', owner: TUBES, sev: 'warn' }))),
  }),
];
