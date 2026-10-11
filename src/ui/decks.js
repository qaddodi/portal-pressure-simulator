// The Presenter's built-in presentations: projector-first slide decks on the live model.
// A slide is one idea: a big headline, one line, at most four causes, and a figure that explains it.
// The model state of every slide is computed off screen before it is shown (presenter.js), each from
// the slide before, so forward, back and jump always show the same numbers.
//
// Slide fields:
//   id                       names the slide for a summary's rows
//   preset, presetDays, params, action, days
//                            the model state, applied to the slide before's (preset → params → action → days)
//   view                     'anatomic' (default) or 'circuit'
//   cam                      'fit', a region of REGIONS, [x0, y0, x1, y1] (anatomy world units),
//                            'lobule', 'lobule:triad' | 'lobule:sinusoid' | 'lobule:central' (zoom: × the lobule's
//                            framing), or 'sinusoid'
//   labels                   the stations named on the anatomy (none when absent)
//   tint                     ['imv']: TARGETS keys whose station label takes its colour though the line never names it
//   layers                   ['zones']: the lobule's zone bands on (a lobule slide shows none otherwise)
//   mark                     { edges, label }: a ring and a callout on the figure (hidden until a quiz is answered)
//   eq                       [MathML, legend?]: an equation under the title (see mi, mo, sub and frac)
//   kicker, site, title, line, causes
//                            the words (site: a level of ladder.js SITES; it colours the kicker). The title stands alone without
//                            the kicker, and the line is a sentence of its own. In the line, {braces} mark the one value to set
//                            in a pill (else the first value with a unit; pill: false for none); bold: extra key terms to bold
//   rail                     true: the six levels with this slide's site marked; 'all': every level named
//   data                     'ladder': the pressure ladder and tiles; 'tiles': tiles only (tiles: which, key: what
//                            to highlight, delta: true or a slide id to show each tile's change from that state; a slide that
//                            changes the same patient (no preset) counts from the slide before unless it says delta: false;
//                            brackets: { hvpg | ppg: 'misleads' | 'works' } colours the ladder's bracket red or green, its number in it)
//   tool                     an instrument in the data card, reading the live model (presenter-tools.js): { kind: 'doppler',
//                            vessel }, { kind: 'scope' }, { kind: 'fibroscan' }, { kind: 'trace', range: 'talk' | 'beats' },
//                            { kind: 'abdomen' }, { kind: 'wall' } (the varix in cross-section); title? names the card; waves: true
//                            names a hepatic vein Doppler's a, S and D. With data too, the tool sits above the tiles
//                            (on a phone it folds away behind a Show button; open: true keeps it open there and folds the tiles instead)
//   sites                    readings on the figure: 'pv', 'ivc', 'ra', 'web' (pressures; web: the IVC below a web), 'rLiver', 'rColl' (the circuit's resistors), 'split' (portal blood to liver and shunts)
//   cath                     the HVPG catheter instead of a camera: 'route', 'free', 'wedge', 'result' or 'blocked'
//   monitor                  the catheter's pressure monitor (Measure › HVPG's tracing) under the slide's words: 'free', 'wedge' or 'result'
//   tick                     a few words for what happened at this slide's time point, under its line on a talk trace (else its title)
//   lapse                    { seconds, from?, to? }: the slide's days (ramp: { param: [from, to] } eased over them) play on the
//                            live figure as a time-lapse, from the slide before's state (from/to: words for the
//                            start and end in place of a day counter, e.g. 'Fasting' and 'After a meal'; keep the
//                            days at least the seconds, or the live clock runs sub-day and skips the ramp)
//   visual                   over the dimmed figure: 'ladders', 'table' (cols, asc: SAAG and protein columns, note: a text column's heading or several, vs: 'first' to show arrows against the first row,
//                            foot: one sentence after the legend, which is built from the table; a row's ref: true keeps its numbers, its vs: a slide id
//                            compares it with that row instead, its note: the text column's words, or an array of them), 'scale' (scale), 'quadrant'
//                            (SAAG × protein) or 'walls'; of: the rows, slide ids or { id | preset, name, title, note, blank: [columns] }
//   compare                  [{ label, params, own? }]: buttons that switch the live model between treatments in real
//                            time (params: each option's full set of the switched keys; own: the slide's own state)
//   quiz                     quiz mode (Q) asks this before the answer shows (the camera waits at the whole figure)
//   caveat                   one short sentence in small print under the line, where the model differs from patients
//   notes, ask               speaker notes, and [question, expected answer] for the room
//
// Deck fields: id, level, title, minutes, summary, objectives (3 to 4 short learning objectives), slides, and sections
// ([name, [kickers]], three to five) when its kicker groups are more than five.
// Every deck opens with an "Outline and objectives" slide built from its kicker groups and objectives
// (withOverview below); a deck never writes that slide itself.

import { CIRCULATION } from './decks/circulation.js?v=332d10da14';
import { SITES } from './decks/sites.js?v=cc4bcea256';
import { HVPG } from './decks/hvpg.js?v=06c6e9c575';
import { ASCITES } from './decks/ascites.js?v=c693f9ae84';
import { VARICES } from './decks/varices.js?v=688bd59fa1';
import { TREATMENT } from './decks/treatment.js?v=8c750815ac';
import { STIFFNESS } from './decks/stiffness.js?v=559db93be0';
import { ONE_YEAR } from './decks/one-year.js?v=71c67e65ca';
import { LOBULE } from './decks/lobule.js?v=14ba594142';
import { SHUNTS } from './decks/shunts.js?v=c867794f65';
import { TAP } from './decks/tap.js?v=f7a5695d72';
import { CIRCUIT } from './decks/circuit.js?v=25877f3594';
import { DOPPLER } from './decks/doppler.js?v=ad89820ca5';
import { ENDOSCOPY } from './decks/endoscopy.js?v=6ee6cee43c';
import { PREHEPATIC } from './decks/prehepatic.js?v=fb84364dfe';
import { RIGHT_HEART } from './decks/right-heart.js?v=b7ffb5c7c6';
import { BLEED } from './decks/variceal-bleed.js?v=d3aedae7e3';
import { TWO_INFLOWS } from './decks/two-inflows.js?v=2a19a5fc63';
import { PVT_CIRRHOSIS } from './decks/pvt-cirrhosis.js?v=56e75f171c';
import { SPLEEN } from './decks/spleen.js?v=e28f76d43e';
import { NCPH } from './decks/ncph.js?v=130a263894';
import { OUTFLOW } from './decks/outflow.js?v=aa768a524b';
import { RECOMPENSATION } from './decks/recompensation.js?v=0d5b3fb564';

// Regions of the anatomy plate the camera frames (world units, x 300-1120, y 0-920).
export const REGIONS = {
  route: [380, 30, 900, 690],       // portal vein to heart
  liver: [360, 170, 830, 490],
  portal: [520, 360, 930, 710],     // confluence, trunk, splenic vein, SMV
  hepatic: [410, 40, 800, 340],     // hepatic veins, IVC, right atrium
  heart: [440, -20, 800, 300],
  varices: [540, -20, 980, 360],
  gej: [710, 120, 920, 480],        // lower esophagus, the gastroesophageal junction and the coronary vein feeding it
  feeder: [620, 110, 930, 600],     // the varices down the coronary vein to the portal confluence
  spleen: [840, 240, 1120, 580],
  rectum: [560, 600, 1020, 960],    // inferior mesenteric to the rectal and iliac veins
  wall: [380, 330, 760, 880],       // paraumbilical vein and the abdominal wall
  fundus: [740, 220, 1110, 690],    // fundal varices, the gastrorenal shunt, the left renal vein
  splenic: [660, 230, 1110, 640],   // splenic vein to the confluence, the spleen, the fundus
};

export const LEVELS = { foundation: 'Foundation', core: 'Core', advanced: 'Advanced' };

// The opening slide of every deck: the outline (its kicker groups, in order, Summary aside) and its objectives,
// over the first slide's patient, which the first slide then keeps (so the figure does not change between them).
const MODEL = ['preset', 'presetDays', 'params', 'action', 'days'];
export function withOverview(d) {
  if (!d?.slides?.length || d.slides[0].visual === 'outline') return d;
  const [first, ...rest] = d.slides, keep = !first.lapse && !first.ramp;
  // The talk's sections: its own (sections: [[name, [kickers]]]), else its kicker groups when there are three to
  // five; each slide then carries its place (sec: [n, of]) for the running head. Fewer groups: the slide titles.
  const groups = [...new Set(d.slides.map((s) => s.kicker).filter((k) => k && k !== 'Summary'))];
  const secs = d.sections || (groups.length >= 3 && groups.length <= 5 ? groups.map((g) => [g, [g]]) : null);
  const outline = secs ? secs.map(([n]) => n) : d.slides.filter((s) => s.kicker !== 'Summary').map((s) => s.title);
  const place = (s) => { const k = secs ? secs.findIndex(([, ks]) => ks.includes(s.kicker)) : -1; return k >= 0 ? { ...s, sec: [k + 1, secs.length] } : s; };
  const open = { id: 'outline', visual: 'outline', outline, objectives: d.objectives || [], kicker: d.title, title: 'Outline and objectives',
    notes: 'Set out the plan of the talk and what the audience should be able to do by the end.',
    ...(keep ? Object.fromEntries(MODEL.filter((k) => first[k] !== undefined).map((k) => [k, first[k]])) : {}) };
  const firstNow = keep ? Object.fromEntries(Object.entries(first).filter(([k]) => !MODEL.includes(k))) : first;
  return { ...d, slides: [open, place(firstNow), ...rest.map(place)] };
}

export const DECKS = [CIRCULATION, SITES, HVPG, ASCITES, VARICES, TREATMENT];

DECKS.push(STIFFNESS, ONE_YEAR, TAP, CIRCUIT, LOBULE, SHUNTS);
DECKS.push(DOPPLER, ENDOSCOPY);
DECKS.push(PREHEPATIC, RIGHT_HEART, BLEED);
DECKS.push(TWO_INFLOWS, PVT_CIRRHOSIS, SPLEEN, NCPH, OUTFLOW, RECOMPENSATION);

// The unified menu lists the presentations by topic, in teaching order, under a short title (32 characters or fewer).
export const TOPICS = [
  ['foundations', 'Foundations', [['circulation', 'The portal circulation'], ['circuit', 'Portal pressure as a circuit'], ['two-inflows', 'The liver\'s two inflows'], ['hvpg', 'HVPG and PPG']]],
  ['causes', 'Causes', [['sites', 'Sites and causes'], ['prehepatic', 'Pre-hepatic PH'], ['ncph', 'Presinusoidal PH'], ['right-heart', 'The right heart and the liver'], ['outflow', 'Hepatic venous outflow block'], ['lobule', 'Inside the lobule']]],
  ['measuring', 'Measuring', [['doppler', 'Doppler of the portal system'], ['stiffness', 'Stiffness, spleen and platelets'], ['one-year', 'A year of compensated cirrhosis']]],
  ['complications', 'Complications', [['varices', 'Collaterals and varices'], ['endoscopy', 'Endoscopy and the varix'], ['variceal-bleed', 'Acute variceal bleeding'], ['ascites', 'How ascites forms'], ['tap', 'Paracentesis and albumin'], ['spleen', 'The spleen: size and treatment'], ['pvt-cirrhosis', 'Portal vein clot in cirrhosis'], ['recompensation', 'Decompensation and recovery']]],
  ['treatment', 'Treatment', [['treatment', 'Lowering portal pressure'], ['shunts', 'Spontaneous shunts and TIPS']]],
];
for (const [topic, , list] of TOPICS) for (const [id, short] of list) { const d = DECKS.find((x) => x.id === id); if (d) Object.assign(d, { topic, short }); }
