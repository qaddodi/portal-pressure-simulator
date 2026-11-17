// The stent's outputs list (17 Nov 2026; the reviewer's section 7, /mnt/project-files/tips-geometry-mocks/tips-geometry-two-designs.html part 1): the pressures at their
// named sites, the flow, the local hydraulics and where the drop goes, each row a name and its number. One GPU picture of fixed rows (the numbers are words on pieces, so a
// value that follows a change is never a DOM write in a frame). The pressure references are named, never an HVPG: the portal-to-IVC gradient is the PPG, the stent's own
// drop is "Across the stent". Not computed here, on purpose: encephalopathy, ascites recurrence, a target gradient.
// createOutputsPic(sv) → { svg, words, paint(O, ex) }; O holds the numbers (see OUT_IN).
import { setGeo, setWords } from './svg-gl.js';
import { clamp } from './util.js';

export const OUT = { x0: 8, x1: 312, top: 14, rowH: 15, headH: 19, pad: 8 };
const TEN = Array.from({ length: 1000 }, (_, i) => (i / 10).toFixed(1));
const HUND = Array.from({ length: 1000 }, (_, i) => (i / 100).toFixed(2));
const INT = Array.from({ length: 1000 }, (_, i) => `${i}`);
const ten = (v) => TEN[clamp(Math.round(v * 10), 0, 999)];
const hund = (v) => HUND[clamp(Math.round(v * 100), 0, 999)];
const int = (v) => INT[clamp(Math.round(v), 0, 999)];
// a pressure may be below the IVC's (a negative one): its sign shows
const sten = (v) => (v < -0.05 ? `−${TEN[clamp(Math.round(-v * 10), 0, 999)]}` : ten(v));

/** The list: a group's name, then its rows [name, unit, how the number is made from O]. */
export const OUTPUT_ROWS = [
  ['Pressures, named sites', [
    ['Portal pressure (P1)', 'mmHg', (O) => sten(O.ivc + O.ppgTen / 10)],
    ['Systemic outflow (P5)', 'mmHg', (O) => sten(O.ivc)],
    ['Portal to IVC gradient (PPG)', 'mmHg', (O) => ten(O.ppgTen / 10)],
    ['Portal vein to right atrium', 'mmHg', (O) => sten(O.ivc + O.ppgTen / 10 - O.ra)],
  ]],
  ['Flow', [
    ['TIPS flow', 'L/min', (O) => hund(O.flow)],
  ]],
  ['Local hydraulics', [
    ['Mean velocity, narrowest place', 'cm/s', (O) => int(O.vWaist)],
    ['Mean velocity, open stent', 'cm/s', (O) => int(O.vOpen)],
    ['Doppler peak (scanner)', 'cm/s', (O) => int(O.vPeak)],
  ]],
  ['Where the drop goes', [   // (the staircase's parts, as the stent card prints them: across the stent is the sum of the last four, whole tenths shared as printedParts does)
    ['Outside the stent', 'mmHg', (O) => ten(O.outTen / 10)],
    ['Tract', 'mmHg', (O) => ten(O.tractTen / 10)],
    ['In and out', 'mmHg', (O) => ten(O.endsTen / 10)],
    ['Friction', 'mmHg', (O) => ten(O.wallTen / 10)],
    ['Jet', 'mmHg', (O) => ten(O.jetTen / 10)],
    ['Across the stent', 'mmHg', (O) => ten(O.dpTen / 10)],
  ]],
];

/** The picture's height: every group's head and rows. */
export const outputsH = () => OUT.top + OUTPUT_ROWS.reduce((h, [, rows]) => h + OUT.headH + rows.length * OUT.rowH, 0) + OUT.pad;

export function createOutputsPic(sv) {
  const rows = [], heads = [], words = [];
  let y = OUT.top;
  for (const [g, list] of OUTPUT_ROWS) {
    const head = sv('text', { 'data-look': 'stent.out.head', x: OUT.x0, y: y + OUT.headH / 2, 'text-anchor': 'start' });
    setWords(head, g); words.push(head);
    const rule = sv('rect', { 'data-look': 'stent.out.rule', x: OUT.x0, y: y + OUT.headH - 3, width: OUT.x1 - OUT.x0, height: 0.8 });
    heads.push(head, rule);
    y += OUT.headH;
    for (const [name, unit, fn] of list) {
      const n = sv('text', { 'data-look': 'stent.out.name', x: OUT.x0, y: y + OUT.rowH / 2, 'text-anchor': 'start' });
      const u = sv('text', { 'data-look': 'stent.out.unit', x: OUT.x1, y: y + OUT.rowH / 2, 'text-anchor': 'end' });
      const v = sv('text', { 'data-look': 'stent.out.val', x: OUT.x1 - 38, y: y + OUT.rowH / 2, 'text-anchor': 'end' });
      setWords(n, name); setWords(u, unit); words.push(n, u, v);
      rows.push({ n, u, v, fn });
      y += OUT.rowH;
    }
  }
  const kids = [...heads, ...rows.flatMap((r) => [r.n, r.v, r.u])];
  const svg = sv('svg', { class: 'gl-pic', viewBox: `0 0 320 ${outputsH()}`, role: 'img' }, ...kids);

  /** Writes the numbers O into the rows at the strength ex. */
  function paint(O, ex) {
    for (const e of kids) setGeo(e, 'opacity', ex);
    for (const r of rows) setWords(r.v, r.fn(O));
  }
  return { svg, words, paint };
}
