// Self-check rules over the screen report's figure part (screen/read-figure.js). Tests with a firing and a quiet case: tests/screen-rules.test.js.
import { registerRule } from './rules.js';

const TUBES = 'src/ui/stage-tubes.js';
const named = (v) => `${v.name} (${v.id})`;

export const checks = {
  'figure-colour-stale': ({ figure: p }) => (p.lens !== 'pressure' ? [] : p.vessels.filter((v) => v.colourFits === false).map((v) => ({ what: `Vessel ${named(v)}`, where: `coloured ${v.colour.join(' to ')} though its ends read ${v.pressure.join(' and ')} mmHg` }))),
  'figure-vessel-no-colour': ({ figure: p }) => p.vessels.filter((v) => !v.artery && !v.ghost && v.opacity > 0.05 && (!v.colour || !v.colour[0] || !v.colour[1])).map((v) => ({ what: `Vessel ${named(v)}`, where: 'shown with no end colours' })),
  'figure-vessel-width': ({ figure: p }) => p.vessels.filter((v) => v.opacity > 0.05 && !(v.width > 0)).map((v) => ({ what: `Vessel ${named(v)}`, where: `shown at width ${v.width}` })),
  'figure-pressure-missing': ({ figure: p }) => (p.lens !== 'pressure' ? [] : p.vessels.filter((v) => !v.artery && !v.ghost && v.colour && (!v.pressure || v.pressure.some((x) => !Number.isFinite(x)))).map((v) => ({ what: `Vessel ${named(v)}`, where: 'coloured with no model pressure at its ends', sev: 'warn' }))),
};

const META = {
  'figure-colour-stale': 'Under the pressure lens a vessel end is the ramp colour of its pressure in 0.5 mmHg steps (colormap.js pressureColor, held 0.4 mmHg: stage-geohold.js qHold). A colour from a pressure more than a bin or two away is a stale paint.',
  'figure-vessel-no-colour': 'A vein the GPU draws has its two end colours (setColPair); a shown vein with none draws black or not at all. Arteries take the artery colour and are left out.',
  'figure-vessel-width': 'A shown vessel has a width: a width that is not a number, or nothing, is a vessel the GPU draws as a hairline or not at all.',
  'figure-pressure-missing': 'Under the pressure lens every shown vein has a model pressure at both ends; none means the colour was painted from no frame.',
};
for (const [id, why] of Object.entries(META)) registerRule({ id, owner: TUBES, why, kind: 'state', check: (report) => (report.figure ? checks[id](report) : []) });
