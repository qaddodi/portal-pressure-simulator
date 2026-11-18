// Registers the figure, labels and camera readers with the screen report (registry.js). Imported by plugins.js. Each `read(ctx)` takes its records
// from the stage through sources.js and hands them to the pure reader (read-figure.js, read-labels.js, read-camera.js); each `text` is the part's lines.
import { registerReader } from './registry.js';
import { cameraLines, readCamera } from './read-camera.js';
import { figureLines, readFigure } from './read-figure.js';
import { labelsLines, readLabels } from './read-labels.js';
import { cameraSource, cardBoxesOf, figureSource, labelSource } from './sources.js';

registerReader({ id: 'camera', owner: 'src/ui/slide-cam.js', order: 20, read: (ctx) => (ctx.pps?.stage ? readCamera(cameraSource(ctx.pps)) : null), text: (p, ctx) => cameraLines(p, ctx) });
registerReader({ id: 'labels', owner: 'src/ui/stage-label-solve.js', order: 50, read: (ctx) => (ctx.pps?.stage ? readLabels(labelSource(ctx.pps, { boxes: cardBoxesOf(ctx) })) : null), text: (p, ctx) => labelsLines(p, ctx) });
registerReader({ id: 'figure', owner: 'src/ui/stage-tubes.js', order: 60, read: (ctx) => (ctx.pps?.stage ? readFigure(figureSource(ctx.pps)) : null), text: (p, ctx) => figureLines(p, ctx) });
