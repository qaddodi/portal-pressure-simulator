// The figure, labels and camera parts, as the screen report's registry takes them: each reader (reads the stage through sources.js and answers the
// part's JSON), its text form, and the self-check rules that judge it. One file lists them, so adding a part is one entry here and a test.
//   registerParts2a(api)   api = { registerReader({ id, owner, read(ctx), text(part, opts) }), registerRule(rule) }, the screen report's registry
import { cameraText } from './read-camera.js';
import { figureText } from './read-figure.js';
import { labelsText } from './read-labels.js';
import { cameraSource, figureSource, labelSource } from './sources.js';
import { readCamera } from './read-camera.js';
import { readFigure } from './read-figure.js';
import { readLabels } from './read-labels.js';
import { cameraRules } from '../selfcheck/rules-camera.js';
import { figureRules } from '../selfcheck/rules-figure.js';
import { labelRules } from '../selfcheck/rules-labels.js';

/** ctx: { pps, boxes? } (boxes: the cards' client-px boxes the report already took, so the cards are measured once). */
export const readers2a = [
  { id: 'figure', owner: 'src/ui/stage-tubes.js', read: (ctx) => readFigure(figureSource(ctx.pps)), text: figureText },
  { id: 'labels', owner: 'src/ui/stage-label-solve.js', read: (ctx) => readLabels(labelSource(ctx.pps, { boxes: ctx.boxes })), text: labelsText },
  { id: 'camera', owner: 'src/ui/slide-cam.js', read: (ctx) => readCamera(cameraSource(ctx.pps)), text: cameraText },
];
export const rules2a = [...labelRules, ...cameraRules, ...figureRules];

export function registerParts2a(api) {
  for (const r of readers2a) api.registerReader(r);
  for (const r of rules2a) api.registerRule(r);
  return { readers: readers2a.map((r) => r.id), rules: rules2a.map((r) => r.id) };
}
