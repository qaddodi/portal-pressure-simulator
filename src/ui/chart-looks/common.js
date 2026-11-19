// The roles every chart shares, so a set of charts looks drawn by one hand (bible review 19 Nov 2026, LOOK-8): the axis was drawn seven ways (the third ink, the
// border colour at 80%, the --axis token at 1.5:1, 28% of the third ink; 1 to 2 px). An axis is a line a reader needs: the third ink (5 to 6:1 on a card in
// every look), 1.25 px. A chart's `.axis` entry spreads AXIS; tests/chart-axis-role.test.js keeps it.
import { tok } from './dsl.js';

/** The axis line of every chart: no fill, the third ink, 1.25 px. */
export const AXIS = { fill: 'none', stroke: tok('text-3'), width: 1.25 };
