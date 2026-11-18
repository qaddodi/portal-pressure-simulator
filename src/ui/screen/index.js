// pps.screen(): what is on the screen, as plain data and as text, from the app's own records (plan screen-report-recs). main.js reads this module in only when
// pps.screen() is called (a console, the bug packet, a test); the live app never loads it otherwise.
//
//   await pps.screen(opts)          the JSON report (see build.js); opts: { detail: 'summary' | 'full', only: 'cards' | [...], rules: false | ids, as: 'text' }
//   await pps.screen.text(report?)  the text form of a report (a fresh one when none is handed); about 2 KB for the summary
//   await pps.screen({ as: 'text' }) the same text
// node and headless: import buildScreen from './build.js' and hand it your own io (see registry.js for ctx).
import { readBox, readRects, readStyle, readMetric, readCTM } from '../layout-snap.js';
import { buildScreen, stableReport } from './build.js';
import { screenText } from './text.js';
import './chart-deps.js';   // (arms the charts part: the painter's functions and the page's formatters, which need the page's globals)

export { buildScreen, stableReport, screenText };
/** The app's layout reads: layout-snap.js's, so the off-GPU layout-read allowance is untouched. */
export const APP_IO = { box: readBox, rects: readRects, style: readStyle, metric: readMetric, ctm: readCTM };

export function screen(opts = {}) {
  const report = buildScreen({ pps: window.pps, io: APP_IO, doc: document, win: window, ...opts });
  return opts.as === 'text' ? screenText(report, opts) : report;
}
/** The text of a report handed in (an object with a version), else of a fresh one built from the options handed in. */
export function text(arg) {
  return arg && arg.v ? screenText(arg) : screen({ ...arg, as: 'text' });
}
