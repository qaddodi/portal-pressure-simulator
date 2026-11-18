// What the charts part needs from the page, loaded where the page's globals exist (the app: screen/index.js; a node rig that has booted the page): the painter's own
// functions for reading a chart (svg-gl.js) and the page's formatters for a number (the tile table, the words' pill). Importing this file arms the charts reader.
import { lookOfPiece, wordsOf, geoOf, transformOf, moveAt } from '../svg-gl.js';
import { tileVal } from '../presenter-cards.js';
import { TILE, tileOf, tileShown } from '../table-marks.js';
import { valueText } from '../callout-math.js';
import { setPainter } from '../selfcheck/chart-reader.js';
import { setChartDeps } from './read-charts.js';

setPainter({ lookOfPiece, wordsOf, geoOf, transformOf, moveAt });
export const TILE_NAMES = Object.freeze(Object.fromEntries(Object.keys(TILE).map((k) => [k, tileOf(k).n || tileOf(k).t])));
export const FORMATS = Object.freeze({ tile: (k, f) => tileVal(k, f[k], f), word: (k, f) => [valueText(k, f, false), valueText(k, f, true)], value: (k, f) => tileShown(k, f[k]) });
setChartDeps({ formats: FORMATS, tileNames: TILE_NAMES });
