// The gallery catalog: one plain list of every specimen (docs/card-gallery.md; plan: /mnt/project-files/card-gallery-plan/debug-page-recs.md).
// Pure data, no DOM: the gallery deck (deck.js), the page (page.js), the coverage test (tests/gallery-coverage.test.js) and the
// manual all read this one file. A new card kind, instrument option, visual, readout tile, trial or algorithm needs its
// specimen here in the same push; the coverage test fails until it has one.
//
// An entry:
//   { id: 'doppler/pv-color', kind: 'slide', section: 'Teaching cards', family: 'doppler', title: 'Portal vein, color',
//     slide: { preset, params, cam, tool, data, tiles, ... }, deck: 'record', note }
//   slide    the fields of a deck slide, exactly as a deck writes them (docs/deck-authoring-guide.md). The generated deck adds
//            id, kicker, title and line, and a preset ('healthy' unless the entry names one) so every specimen stands alone;
//            `carry: true` leaves the preset out (the specimen continues the one before, for a ghost or a change of state).
//   deck     which section of the gallery deck's outline holds it (DECK_SECTIONS).
//   `sid(id)` is the slide id a specimen gets; a slide field that names another slide ('delta', 'since') uses it.
// Other kinds (pane, pick, sheet, view, bench) come with the page's later steps; their `kind` is listed in KINDS.

import { TRIAL_IDS } from '../trials.js';
import { PATHS } from '../path-data.js';
import { LOOKS } from '../looks.js';
import { PRESETS } from '../../engine/scenario.js';
import { MAIN } from './catalog-main.js';

export const KINDS = ['slide', 'pane', 'pick', 'sheet', 'view', 'bench'];
export const SECTIONS = ['Teaching cards', 'Tests card', 'Structure cards', 'Sheets', 'Figure', 'Benches'];
/** The outline of the generated deck: key, name. */
export const DECK_SECTIONS = [['record', 'Recordings and measurements'], ['chart', 'Charts and models'], ['card', 'Cards and panels'], ['tiles', 'Readout tiles'], ['teach', 'The teaching card']];
/** The looks the page switches between (the app's own list). */
export const LOOK_IDS = LOOKS.map((l) => l.id);
/** The sizes the page and the manual shoot at (section 1.6 of the plan). */
export const DEVICES = [
  { id: 'mac', name: 'Mac 1440×900', w: 1440, h: 900 },
  { id: 'mac-short', name: 'Mac short 1440×780', w: 1440, h: 780 },
  { id: 'ipad', name: 'iPad landscape 1180×820', w: 1180, h: 820 },
  { id: 'ipad-portrait', name: 'iPad portrait 820×1180', w: 820, h: 1180 },
  { id: 'iphone', name: 'iPhone 390×844', w: 390, h: 844 },
  { id: 'iphone-landscape', name: 'iPhone sideways 844×390', w: 844, h: 390 },
];

/** The slide id a specimen gets in the gallery deck. */
export const sid = (id) => id.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

const S = (id, title, slide, o = {}) => ({ id, kind: 'slide', section: 'Teaching cards', family: id.split('/')[0], title, slide, deck: 'record', ...o });
const rec = (id, title, slide, o) => S(id, title, slide, { deck: 'record', ...o });
const chart = (id, title, slide, o) => S(id, title, slide, { deck: 'chart', ...o });
const card = (id, title, slide, o) => S(id, title, slide, { deck: 'card', ...o });
const tiles = (id, title, preset, keys, extra = {}) => S(`tiles/${id}`, title, { preset, cam: 'fit', data: 'tiles', tiles: keys, key: [keys[0]], ...extra }, { deck: 'tiles' });
const teach = (id, title, slide, o) => S(id, title, slide, { deck: 'teach', ...o });

const TIPS = { preset: 'cirr-decomp-tips', cam: 'liver', lens: 'velocity' };
const CRIT_ROWS = ['Each row is one rule, set as a ring.', 'A word in **bold** takes full ink.', 'A row can apply to the case with `lit`.'];

export const CATALOG = [
  // ── Doppler ──
  rec('doppler/pv-spectrum', 'Portal vein, spectrum', { preset: 'healthy', cam: 'portal', tool: { kind: 'doppler', vessel: 'PV_TRUNK' } }),
  rec('doppler/pv-color', 'Portal vein, color map', { preset: 'healthy', cam: 'portal', tool: { kind: 'doppler', vessel: 'PV_TRUNK', mode: 'color' } }),
  rec('doppler/pv-variance', 'Portal vein, variance map', { preset: 'healthy', cam: 'portal', tool: { kind: 'doppler', vessel: 'PV_TRUNK', mode: 'variance' } }),
  rec('doppler/hv-waves', 'Hepatic vein with its a, S, v and D waves', { preset: 'healthy', cam: 'hepatic', tool: { kind: 'doppler', vessel: 'RHV_IVC', waves: true } }),
  rec('doppler/pair-calipers', 'Portal vein paired with the hepatic vein, calipers on', { preset: 'rhf', cam: 'route', tool: { kind: 'doppler', vessel: 'PV_TRUNK', pair: true, calipers: true } }),
  rec('doppler/artery', 'Hepatic artery', { preset: 'healthy', cam: 'liver', tool: { kind: 'doppler', vessel: 'A_HEP' } }),
  rec('doppler/reversed', 'Reversed portal flow', { preset: 'cirr-hepatofugal', cam: 'portal', tool: { kind: 'doppler', vessel: 'PV_TRUNK' } }),
  rec('doppler/no-flow', 'No portal flow', { preset: 'pvt-acute', cam: 'portal', tool: { kind: 'doppler', vessel: 'PV_TRUNK' } }),
  rec('doppler/splenic', 'Splenic vein at the hilum', { preset: 'csph', cam: 'splenic', tool: { kind: 'doppler', vessel: 'V_SPL' } }),
  rec('doppler/ivc', 'Inferior vena cava', { preset: 'healthy', cam: 'hepatic', tool: { kind: 'doppler', vessel: 'IVCS_RA' } }),
  rec('doppler/varix', 'Esophageal varix', { preset: 'cirr-decomp', cam: 'varices', tool: { kind: 'doppler', vessel: 'C1b' } }),
  rec('doppler/paraumbilical', 'Paraumbilical vein', { preset: 'cirr-decomp', cam: 'wall', tool: { kind: 'doppler', vessel: 'C3' } }),
  rec('doppler/scope-probe', 'Gastric varix read from the endoscope', { preset: 'gastric-varix', cam: 'splenic', tool: { kind: 'doppler', vessel: 'C2', probe: 'scope' } }),
  rec('doppler/eus-glue', 'Gastric varix read from the endoscope, glue played', { preset: 'gastric-varix', params: { occluded: { C2: true } }, cam: 'splenic', procedure: 'eusglue', tool: { kind: 'doppler', vessel: 'C2', probe: 'scope' }, data: 'tiles', tiles: ['gv'] }),
  rec('doppler/tips-proximal', 'TIPS, proximal gate', { ...TIPS, tool: { kind: 'doppler', vessel: 'TIPS', gate: 'proximal', points: true } }),
  rec('doppler/tips-mid', 'TIPS, mid gate', { ...TIPS, tool: { kind: 'doppler', vessel: 'TIPS', gate: 'mid', points: true } }),
  rec('doppler/tips-distal', 'TIPS, distal gate', { ...TIPS, tool: { kind: 'doppler', vessel: 'TIPS', gate: 'distal', points: true } }),
  rec('doppler/tips-site', 'Stenosed TIPS, gate at the narrowing', { ...TIPS, params: { stenosis: { TIPS: 0.65 } }, tool: { kind: 'doppler', vessel: 'TIPS', gate: 'site', points: true } }),
  rec('doppler/aliasing', 'Aliasing: the velocity scale fixed at ±150 cm/s', { ...TIPS, tool: { kind: 'doppler', vessel: 'TIPS', scale: 150 } }),
  rec('doppler/aliasing-baseline', 'Aliasing with the baseline moved up', { ...TIPS, tool: { kind: 'doppler', vessel: 'TIPS', scale: 150, baseline: 0.3 } }),
  rec('doppler/ghost-before', 'Portal vein before a TIPS (the ghost starts here)', { preset: 'cirr-decomp', cam: 'portal', tool: { kind: 'doppler', vessel: 'PV_TRUNK' } }),
  rec('doppler/ghost', 'Portal vein after a TIPS, the earlier reading as a ghost', { carry: true, params: { tips: { on: true } }, days: 30, cam: 'portal', tool: { kind: 'doppler', vessel: 'PV_TRUNK', delta: sid('doppler/ghost-before') } }),

  // ── Pressure traces, vitals, HVPG ──
  rec('trace/beats', 'Pressure beat by beat, with the EKG and the HVPG lane', { preset: 'csph', params: { respiration: false }, cam: 'portal', tool: { kind: 'trace', range: 'beats' } }),
  rec('trace/beats-plain', 'Pressure beat by beat, EKG and HVPG lane off', { preset: 'csph', cam: 'portal', tool: { kind: 'trace', range: 'beats', ekg: false, hvpgLane: false } }),
  rec('trace/beats-delta', 'Pressure beat by beat with the earlier state named', { preset: 'cirr-decomp', params: { respiration: false }, cam: 'varices', data: 'tiles', tiles: ['pv', 'varix'], tool: { kind: 'trace', range: 'beats', deltaLabel: 'before the bleed' } }),
  rec('trace/talk', 'Pressure at every slide so far', { carry: true, cam: 'fit', tool: { kind: 'trace', range: 'talk' } }),
  rec('trace/talk-since', 'The talk chart from one slide on, the clot band named', { carry: true, cam: 'fit', tool: { kind: 'trace', range: 'talk', since: sid('doppler/ghost-before'), gap: 'clot', title: 'The course on one chart' } }),
  rec('trace/talk-milestones', 'The HVPG alone, with milestones named', { carry: true, cam: 'fit', milestone: 'Gallery', tool: { kind: 'trace', range: 'talk', style: 'milestones', bands: ['carvedilol'] } }),
  rec('vitals/default', 'Vital signs: heart rate, blood pressure, hemoglobin', { preset: 'cirr-decomp', cam: 'fit', tool: { kind: 'vitals' } }),
  rec('vitals/output', 'Vital signs: heart rate, blood pressure, cardiac output', { preset: 'cirr-decomp', cam: 'fit', tool: { kind: 'vitals', show: ['hr', 'map', 'co'] } }),
  rec('vitals/hold', 'Vital signs with the hold rail', { preset: 'cirr-decomp', cam: 'fit', tool: { kind: 'vitals', show: ['map', 'hr'], hold: true } }),
  rec('vitals/alarm', 'Vital signs after a large bleed, alarm red', { preset: 'cirr-decomp', cam: 'bleed', action: { kind: 'hemorrhage', mL: 1300 }, tool: { kind: 'vitals', show: ['hr', 'map', 'hb'], rail: 'hb' } }),
  rec('hvpg/free', 'HVPG catheter, free pressure', { preset: 'csph', cath: 'free', cam: 'liver', tool: { kind: 'hvpg', catheter: true } }),
  rec('hvpg/wedge', 'HVPG catheter, balloon wedged', { preset: 'csph', cath: 'wedge', cam: 'liver', tool: { kind: 'hvpg', catheter: true } }),
  rec('hvpg/result', 'HVPG catheter, result', { preset: 'csph', cath: 'result', cam: 'liver', tool: { kind: 'hvpg', catheter: true } }),
  rec('hvpg/card', 'HVPG tracing as a data card, no catheter', { preset: 'csph', cam: 'liver', tool: { kind: 'hvpg' } }),
  rec('reading/hvpgcath', 'Measurement monitor: HVPG catheter', { preset: 'csph', cam: 'liver', procedure: 'hvpgcath', tool: { kind: 'reading' } }),
  rec('reading/eus', 'Measurement monitor: EUS-PPG', { preset: 'schisto', cam: 'liver', procedure: 'eus', tool: { kind: 'reading' } }),
  rec('reading/irivc', 'Measurement monitor: IR IVC then portal vein', { preset: 'csph', cam: 'liver', procedure: { kind: 'irivc', then: 'irpv' }, tool: { kind: 'reading' } }),
  rec('reading/tipsgrad', 'Measurement monitor: gradient after a TIPS', { preset: 'cirr-decomp-tips', cam: 'liver', procedure: 'tipsgrad', tool: { kind: 'reading' } }),

  // ── Organs and bedside ──
  rec('fibroscan/liver', 'Liver stiffness, FibroScan', { preset: 'csph', cam: 'liver', tool: { kind: 'fibroscan' } }),
  rec('fibroscan/spleen', 'Spleen stiffness', { preset: 'csph', cam: 'spleen', tool: { kind: 'fibroscan', organ: 'spleen' } }),
  rec('fibroscan/no-spleen', 'Spleen stiffness with no spleen to read', { preset: 'healthy', cam: 'spleen', params: { splenicRx: 2 }, tool: { kind: 'fibroscan', organ: 'spleen' } }),
  rec('scope/varix', 'Endoscopy, a large varix', { preset: 'cirr-decomp', cam: 'gej', tool: { kind: 'scope', open: true } }),
  rec('scope/insufflation', 'Endoscopy with insufflation pressure and readings', { preset: 'cirr-decomp', cam: 'gej', tool: { kind: 'scope', open: true, readings: true, air: 10 } }),
  rec('scope/no-wale', 'Endoscopy with the red wale marks hidden', { preset: 'cirr-decomp', cam: 'gej', tool: { kind: 'scope', open: true, red: false } }),
  rec('abdomen/ascites', 'The abdomen with its ascites', { preset: 'cirr-decomp', cam: 'fit', tool: { kind: 'abdomen' } }),
  rec('wall/varix', 'The varix wall in cross-section', { preset: 'cirr-decomp', cam: 'varices', tool: { kind: 'wall' } }),
  rec('lumen/clot', 'Portal vein lumen, clot', { preset: 'pvt-acute', cam: 'portal', tool: { kind: 'lumen' } }),
  rec('lumen/narrowing', 'Stented TIPS lumen, cut at the narrowing', { ...TIPS, params: { stenosis: { TIPS: 0.65 } }, tool: { kind: 'lumen', vessel: 'TIPS', site: 'distal' } }),
  rec('lumen/stent-proximal', 'Stent lumen, cut proximal', { ...TIPS, tool: { kind: 'lumen', vessel: 'TIPS', site: 'proximal' } }),
  rec('lumen/stent-mid', 'Stent lumen, cut mid', { ...TIPS, tool: { kind: 'lumen', vessel: 'TIPS', site: 'mid' } }),
  rec('lumen/stent-distal', 'Stent lumen, cut distal', { ...TIPS, tool: { kind: 'lumen', vessel: 'TIPS', site: 'distal' } }),
  rec('lumen/left-portal', 'Left portal vein with its own name', { preset: 'healthy', cam: 'liver', tool: { kind: 'lumen', vessel: 'PVH_L', name: 'Left portal' } }),

  // ── Charts and models ──
  chart('profile/default', 'Gut to heart, default brackets', { preset: 'csph', cam: 'route', key: ['hvpg', 'ppg'], tool: { kind: 'profile' } }),
  chart('profile/spans', 'Gut to heart with the EUS-PPG span', { preset: 'schisto', cam: 'liver', key: ['hvpg', 'eus'], tool: { kind: 'profile', spans: ['hvpg', 'eus', 'ppg'] } }),
  chart('profile/from', 'Gut to heart with the earlier state dotted', { preset: 'cirr-decomp-tips', cam: 'liver', key: ['ppg'], tool: { kind: 'profile', from: sid('doppler/ghost-before'), fromLabel: 'Before' }, delta: sid('doppler/ghost-before') }),
  chart('profile/block-pvt', 'Gut to heart, red block at the portal vein', { preset: 'pvt-chronic', cam: 'portal', key: ['hvpg', 'ppg'], tool: { kind: 'profile' } }),
  chart('profile/block-hepatic', 'Gut to heart, red block after the liver', { preset: 'budd-chiari', cam: 'hepatic', key: ['fhvp', 'hvpg'], tool: { kind: 'profile' } }),
  chart('profile/hold', 'Gut to heart with the answer held back', { preset: 'csph', cam: 'route', key: ['hvpg', 'ppg'], tool: { kind: 'profile', hold: true } }),
  chart('flowtime/meal', 'Portal pressure and flow around a meal', { preset: 'cirr-decomp', days: 8, ramp: { meal: [0, 1] }, lapse: { seconds: 6, from: 'Fasting', to: 'After a meal', clock: 'seconds' }, cam: 'portal', tool: { kind: 'flowtime', clock: 'meal', lines: ['pv', 'pvFlow'], keepTiles: true, title: 'Portal pressure and flow around a meal' }, data: 'tiles', tiles: ['pvFlow', 'lsm'] }),
  chart('flowtime/days', 'Two model lines over the days', { preset: 'csph', days: 180, ramp: { cirrhosis: [0.6, 0.85] }, cam: 'fit', lens: 'flow', tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'varix'], title: 'HVPG and varix over the days' }, data: 'tiles', tiles: ['hvpg', 'varix'] }),
  chart('flowtime/keep-tiles', 'Two model lines with the tiles kept', { preset: 'csph', days: 60, ramp: { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] }, cam: 'fit', tool: { kind: 'flowtime', clock: 'days', lines: ['sin', 'asc'], keepTiles: true, title: 'Sinusoids and ascites over two months' }, data: 'tiles', tiles: ['sin', 'asc'], key: ['asc'] }),
  chart('flowtime/given', 'A given line (weight) beside a model line', { preset: 'cirr-comp', params: { cirrhosis: 0.45 }, days: 365, ramp: { cirrhosis: [0.45, 0.35] }, cam: 'liver', tool: { kind: 'flowtime', clock: 'days', lines: ['wt', 'lsm'], given: { wt: 12 }, title: 'Body weight and LSM over the year' }, data: 'tiles', tiles: ['lsm', 'plt'] }),
  chart('flowtime/bands', 'Two lines with a treatment band', { preset: 'csph', days: 120, ramp: { cirrhosis: [0.6, 0.7] }, params: { drugs: { carvedilol: true } }, cam: 'fit', tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'pv'], bands: ['carvedilol'], title: 'HVPG and portal pressure on carvedilol' } }),
  chart('flowtime/scales', 'Two lines with their own fixed scales', { preset: 'cirr-decomp', days: 300, cam: 'varices', tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'varix'], title: 'HVPG and varix over ten months', view: { scales: { hvpg: [0, 20, 5], varix: [0, 8, 2] } } } }),
  chart('curve/one-line', 'One setting against one reading', { preset: 'cirr-decomp-tips', cam: 'tips', view: 'circuit', lens: 'flow', tool: { kind: 'curve', param: 'tips.d', from: 6, to: 12, step: 1, lines: ['ppg', 'liver'] } }),
  chart('curve/relation', 'Reading against reading (relation chart)', { preset: 'cirr-decomp', cam: 'varices', tool: { kind: 'curve', x: 'hvpg', xCuts: [10], cuts: 'ticks', patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0.3, to: 1, step: 0.05, days: 365, lines: ['varix', 'wall'] } }),
  chart('curve/against', 'Two sweeps on one scale', { preset: 'csph', view: 'circuit', cam: 'route', tool: { kind: 'curve', x: 'pvFlow', param: 'splanchnicTone', from: 0.6, to: 1.6, step: 0.1, lines: ['ppg'], against: { label: 'Healthy liver', params: { cirrhosis: 0 }, own: 'Cirrhosis' } } }),
  chart('curve/against-pair', 'Two drugs against the first reading, response zone', { preset: 'cirr-decomp', cam: 'liver', tool: { kind: 'curve', x: 'hvpg', param: 'cirrhosis', from: 0.5, to: 1, step: 0.05, lines: ['hvpg'], gap: true, label: 'HVPG before the drug', against: [{ label: 'Carvedilol', params: { drugs: { propranolol: false, carvedilol: true } }, pair: true, own: 'No change' }, { label: 'Propranolol', params: { drugs: { propranolol: true, carvedilol: false } }, pair: true }], zone: { fall: 10, under: 12, label: 'Response' } } }),
  chart('curve/what-if', 'The ring moved by a what-if slider', { preset: 'cirr-decomp-tips', params: { tips: { on: true } }, view: 'circuit', lens: 'flow', cam: 'tips', tool: { kind: 'curve', param: 'tips.d', from: 6, to: 12, step: 1, lines: ['ppg', 'liver'] }, whatIf: { label: 'Stent width', param: 'tips.d', min: 6, max: 12, step: 1, unit: 'mm' } }),
  chart('curve/scope-air', 'Insufflation against what the endoscope sees', { preset: 'cirr-decomp', cam: 'gej', tool: { kind: 'curve', param: 'scope.air', from: 0, to: 20, step: 1, lines: ['seen', 'across'], cuts: [5] } }),
  chart('curve/unit-label', 'A sweep with its own label and unit', { preset: 'csph', cam: 'route', tool: { kind: 'curve', param: 'cirrhosis', label: 'Fibrosis', unit: '% of severe', from: 0, to: 1, step: 0.1, days: 365, patient: { preset: 'healthy' }, lines: ['hvpg', 'ppg'], oneScale: true } }),
  chart('curve/clot-axis', 'Relation chart on the clot, both lines on one scale', { preset: 'pvt-acute', cam: 'portal', tool: { kind: 'curve', x: 'clot', xFrom: 0, xTo: 100, xCuts: [50], patient: { preset: 'healthy' }, param: 'thrombus.PV_TRUNK', from: 0, to: 1, step: 0.05, lines: ['ppg', 'hvpg'], oneScale: true } }),
  chart('curve/dots', 'Relation chart with other patients as dots, the ring left off', { preset: 'schisto', cam: 'fit', tool: { kind: 'curve', x: 'lsm', xCuts: [10], patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0, to: 1, step: 0.1, days: 365, lines: ['ppg', 'spleen'], ring: false, dots: [{ preset: 'csph', name: 'Cirrhosis, CSPH' }] } }),
  chart('curve/walk', 'Relation chart with a walk through its dots', { preset: 'cirr-comp', cam: 'liver', tool: { kind: 'curve', x: 'lsm', xCuts: [15, 25], cuts: [10], patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0.4, to: 1, step: 0.05, days: 365, lines: ['hvpg', 'plt'], walk: true, dots: [{ preset: 'cirr-comp', name: 'Compensated' }, { preset: 'csph', name: 'CSPH' }] } }),
  chart('curve/points', 'A curve through hand-picked states (a bleed and its repair)', { preset: 'cirr-decomp', cam: 'portal', tool: { kind: 'curve', x: 'bv', lines: ['pv', 'map'], points: [{ action: { kind: 'hemorrhage', mL: 1500 } }, { action: { kind: 'hemorrhage', mL: 500 } }, { action: [] }, { action: [{ kind: 'infuse', fluid: 'prbc' }] }] } }),
  chart('curve/styles', 'Two line styles, a reading name and tick cut-offs', { preset: 'gastric-varix', cam: 'fundus', tool: { kind: 'curve', x: 'hvpg', param: 'cirrhosis', from: 0.5, to: 1, step: 0.0625, days: 120, lines: ['gv'], reading: 'Varix', cuts: 'ticks', styles: ['GRS open', 'GRS closed'], against: [{ label: 'Fundal', params: { occluded: { C5: true } }, own: 'Fundal', dash: true }, { label: 'Esophageal', of: 'varix', params: { occluded: { C5: true } }, dash: true }] } }),
  chart('course/after-lvp', 'Ascites day by day after a paracentesis', { preset: 'cirr-decomp', cam: 'fit', tool: { kind: 'course', reading: 'asc', from: { preset: 'cirr-decomp', params: { diuretics: false }, days: 120, ramp: { albumin: [2.8, 2.4] } }, event: { params: { albumin: 2.74 }, action: { kind: 'paracentesis', mL: 6500 } }, wait: 14, after: 28, then: [{ name: 'Diuretics', params: { diuretics: true } }, { name: 'Diuretics + TIPS', params: { diuretics: true, tips: { on: true } } }], words: { event: 'LVP', before: 'Tense ascites', start: 'Treatment starts', rise: 'Refills', axis: 'Weeks after LVP', label: 'Ascites, liters', title: 'Ascites after LVP', short: 'After LVP' } } }),
  chart('flows/inflow', 'Where portal blood comes from', { preset: 'healthy', cam: 'portal', lens: 'origin', tool: { kind: 'flows', of: 'inflow' }, data: 'tiles', tiles: ['pvFlow', 'pv'] }),
  chart('flows/split', 'Where portal blood goes: the liver and each bypass', { preset: 'cirr-decomp', cam: 'wall', tool: { kind: 'flows' }, data: 'tiles', tiles: ['liver'] }),
  chart('flows/split-healthy', 'Where portal blood goes in a healthy patient', { preset: 'healthy', cam: 'fit', tool: { kind: 'flows' }, data: 'tiles', tiles: ['liver'] }),
  chart('shift/rest', 'The circulation at rest (shift)', { preset: 'healthy', cam: 'fit', tool: { kind: 'shift' }, data: 'tiles', tiles: ['hr', 'map'] }),
  chart('shift/cirrhosis', 'The circulation in decompensated cirrhosis (shift)', { preset: 'cirr-decomp', cam: 'fit', tool: { kind: 'shift' }, data: 'tiles', tiles: ['hr', 'map'] }),
  chart('menu/full', 'Treatment menu, every option for this patient', { preset: 'cirr-decomp', cam: 'fit', tool: { kind: 'menu' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'] }),
  chart('menu/rows', 'Treatment menu, a chosen few', { preset: 'cirr-decomp', cam: 'fit', tool: { kind: 'menu', rows: ['carvedilol', 'tips8'] } }),
  chart('menu/clot', 'Treatment menu for a thrombosed trunk', { preset: 'pvt-chronic', cam: 'fit', tool: { kind: 'menu' } }),
  chart('stent/lumen-loss', 'The stent: lumen and the pressure it loses', { ...TIPS, params: { tips: { on: true, d: 10 } }, days: 30, tool: { kind: 'stent', vessel: 'TIPS', show: ['lumen', 'loss'], to: 'ppg' }, data: 'tiles', tiles: ['tipsFlow', 'tipsDp'], key: ['tipsDp'] }),
  chart('stent/lumen', 'The stent: the lumen alone', { ...TIPS, params: { tips: { on: true, d: 10 } }, days: 30, tool: { kind: 'stent', vessel: 'TIPS', show: ['lumen'] } }),
  chart('stent/loss', 'The stent: the pressure loss alone', { ...TIPS, params: { tips: { on: true, d: 10 } }, days: 30, tool: { kind: 'stent', vessel: 'TIPS', show: ['loss'], to: 'ppg' } }),
  chart('evgraph/tips', 'Procedure graph after a TIPS', { preset: 'cirr-decomp', cam: 'liver', lens: 'flow', procedure: 'tips', tool: { kind: 'evgraph', title: 'PPG and sinusoidal flow after TIPS' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'] }),
  chart('evgraph/brto', 'Procedure graph after BRTO', { preset: 'gastric-varix', params: { occluded: { C5: true } }, cam: 'fundus', lens: 'flow', procedure: 'brto', tool: { kind: 'evgraph', title: 'PPG and fundal varix after shunt occlusion' }, data: 'tiles', tiles: ['gv', 'varix', 'ppg'], graph: ['ppg', 'gv'] }),
  chart('evgraph/bato', 'Procedure graph after BATO', { preset: 'gastric-varix', params: { occluded: { C5: true } }, cam: 'fundus', lens: 'flow', procedure: 'bato', tool: { kind: 'evgraph', title: 'PPG and fundal varix after obliteration' }, data: 'tiles', tiles: ['gv', 'varix', 'ppg'], graph: ['ppg', 'gv'] }),
  chart('evgraph/rex', 'Meso-Rex bypass played on the figure', { preset: 'pvt-chronic', params: { rex: true }, procedure: 'rex', cam: [500, 330, 900, 700], lens: 'origin', data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'] }),

  // ── Cards and panels ──
  card('path/patient', 'A flowchart with the patient\'s own facts', { preset: 'csph', cam: 'route', tool: { kind: 'path', of: 'ladder', short: 'Stages', patient: { s: 1, rc: false } } }),
  card('criteria/plain', 'Criteria: a list of things to check', { preset: 'healthy', cam: 'fit', tool: { kind: 'criteria', title: 'A list to check', short: 'List', ticks: false, lead: 'Each one on its own.', rows: CRIT_ROWS } }),
  card('criteria/ordered', 'Criteria: in order, numbered rings', { preset: 'healthy', cam: 'fit', tool: { kind: 'criteria', title: 'In this order', short: 'Order', ticks: false, ordered: true, lead: 'In this order.', rows: ['**First** step', '**Second** step', { text: 'Reduce or occlude the stent only if it persists', lit: true }] } }),
  card('criteria/live', 'Criteria: live rows met by this patient', { preset: 'cirr-decomp', cam: 'fit', tool: { kind: 'criteria', title: 'Rows the model reads', short: 'Live rows', lead: 'Every one of these.', rows: [['**HVPG** ≥10 mmHg', 'hvpg', '>=', 10], ['No **ascites**', 'asc', '<', 0.15], ['**Platelets** >20,000/µL', 'plt', '>', 20]] } }),
  card('criteria/live-unmet', 'Criteria: the same live rows, not met', { preset: 'healthy', cam: 'fit', tool: { kind: 'criteria', title: 'Rows the model reads', short: 'Live rows', lead: 'Every one of these.', rows: [['**HVPG** ≥10 mmHg', 'hvpg', '>=', 10], ['No **ascites**', 'asc', '<', 0.15], ['**Platelets** >20,000/µL', 'plt', '>', 20]] } }),
  card('criteria/cut-and', 'Criteria: cut-offs, a second condition, the case column', { preset: 'cirr-comp', cam: 'liver', notes: 'Baveno VIII 1.15, 1.16', tool: { kind: 'criteria', title: 'Stiffness and platelets', short: 'Stiffness', ticks: false, rule: 'Baveno VIII 1.15, 1.16', rows: [{ text: 'CSPH ruled out', cut: '≤15 kPa', and: 'platelets ≥150,000/µL', note: 'LSM 13, platelets 160', met: true, lit: true }, { text: 'CSPH ruled in', cut: '≥25 kPa', note: 'not met', met: false }] } }),
  card('criteria/verdict', 'Criteria: a verdict line at the foot', { preset: 'cirr-decomp', cam: 'fit', tool: { kind: 'criteria', title: 'Look first for', short: 'Precipitants', ticks: false, rows: ['**Infection** or **GI bleeding**', '**Constipation** or missed **lactulose**', '**Sedatives** or **opioids**'], verdict: 'Treating them comes first.' } }),
  card('criteria/zones', 'Criteria: zones and a key with a hatched swatch', { preset: 'healthy', cam: 'liver', notes: 'Baveno VIII 1.15, 1.16, 1.19', tool: { kind: 'criteria', title: 'Baveno VIII at a first visit', short: 'First visit', ticks: false, lead: 'Fasting LSM + CBC.', rule: 'Baveno VIII 1.15, 1.16, 1.19', zones: 'first-visit', key: [{ text: '**Hatched:** can skip EGD', swatch: 'hatch' }, '**Indeterminate:** ANTICIPATE ≥75% or SSM >55 kPa = CSPH', '**MASLD, BMI ≥30:** ANTICIPATE-NASH, not 25 kPa'] } }),
  card('trial/predesci-arm', 'A trial card with the patient at their arm', { preset: 'csph', params: { drugs: { propranolol: true } }, cam: 'fit', lens: 'since', tool: { kind: 'trial', id: 'predesci', at: 'predesci', facts: { decompensated: false } }, data: 'tiles', tiles: ['hvpg'] }),
  card('forest/four', 'Hazard and odds ratios from four trials', { preset: 'healthy', cam: 'fit', tool: { kind: 'forest', ids: ['predesci', 'lvtips', 'transfusion', 'rifaximin'] } }),
  card('saag/map', 'SAAG against total protein, with an extra cause', { preset: 'cirr-decomp', cam: 'fit', tool: { kind: 'saag', extra: [{ name: 'Peritoneal carcinomatosis', saag: 0.6, tp: 4.2 }] } }),
  card('saag/own', 'SAAG with this patient named', { preset: 'rhf', cam: 'sinusoid', tool: { kind: 'saag', own: 'hf' }, data: 'tiles', tiles: ['saag', 'tp'], key: ['tp'] }),
  card('fluid/balance', 'Fluid balance: lymph formation against lymph drained', { preset: 'cirr-decomp', cam: 'liver', tool: { kind: 'fluid' }, data: 'tiles', tiles: ['asc', 'liver'] }),
  card('fluid/forces', 'Fluid balance with the forces across the wall', { preset: 'cirr-decomp', cam: 'sinusoid', tool: { kind: 'fluid', forces: true }, data: 'tiles', tiles: ['sin'] }),
  card('fluid/window', 'Fluid balance, the day card', { preset: 'cirr-decomp', cam: 'liver', tool: { kind: 'fluid', window: true }, data: 'tiles', tiles: ['asc', 'liver'] }),
  card('fluid/window-forces', 'Fluid balance, the day card with the forces', { preset: 'cirr-decomp', cam: 'sinusoid', tool: { kind: 'fluid', window: true, forces: true }, data: 'tiles', tiles: ['sin'] }),
  card('plane/csph', 'The stiffness and platelets plane', { preset: 'cirr-comp', cam: 'liver', tool: { kind: 'plane', plane: 'csph' }, data: 'tiles', tiles: ['ssm', 'hvpg'], key: ['ssm', 'hvpg'] }),
  card('plane/hvpg-ppg', 'The HVPG and PPG plane', { preset: 'pvt-chronic', cam: 'portal', tool: { kind: 'plane', plane: 'hvpg-ppg' }, data: 'tiles', tiles: ['hvpg', 'ppg'] }),
  card('plane/trail', 'The stiffness plane with a trail of earlier cases', { preset: 'cirr-comp', cam: 'liver', tool: { kind: 'plane', plane: 'csph', trail: [{ slide: sid('plane/csph'), name: 'Earlier case' }] }, data: 'tiles', tiles: ['ssm', 'hvpg'] }),
  card('visual/table', 'Summary table of several patients', { cam: 'fit', visual: 'table', cols: ['pv', 'whvp', 'fhvp', 'ra', 'hvpg', 'ppg'], asc: true, of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { preset: 'csph', title: 'Clinically significant' }, { preset: 'budd-chiari', title: 'Budd–Chiari syndrome' }, { preset: 'rhf', title: 'Right heart failure' }] }),
  card('visual/table-wave', 'Summary table with a Doppler wave column', { cam: 'fit', visual: 'table', cols: ['pv', 'hvpg', 'ppg'], asc: false, wave: 'PV_TRUNK', of: [{ preset: 'healthy', title: 'Healthy', ref: true }, { preset: 'cirr-hepatofugal', title: 'Hepatofugal flow' }] }),
  card('visual/ladders', 'Six Gut to heart charts in one grid', { cam: 'fit', visual: 'ladders', of: [{ preset: 'pvt-chronic', name: 'Portal vein thrombosis' }, { preset: 'schisto', name: 'Schistosomiasis' }, { preset: 'csph', name: 'Cirrhosis' }, { preset: 'sos', name: 'Sinusoidal obstr. synd.' }, { preset: 'budd-chiari', name: 'Budd–Chiari syndrome' }, { preset: 'rhf', name: 'Right heart failure' }] }),
  card('visual/scale', 'One number on a banded axis, a row per patient', { cam: 'fit', visual: 'scale', scale: { key: 'lsm', max: 40, low: 'No CSPH', marks: [[15, 'Indeterminate'], [25, 'CSPH']], sub: ['hvpg', 'plt'], rules: ['If platelets are ≥150', 'Low platelets point to CSPH', 'Whatever the platelets'] }, of: [{ preset: 'healthy', name: 'Healthy' }, { preset: 'cirr-comp', name: 'Compensated cirrhosis' }, { preset: 'csph', name: 'Compensated, CSPH' }] }),
  card('visual/quadrant', 'SAAG and protein quadrants', { cam: 'fit', visual: 'quadrant', of: [{ preset: 'cirr-decomp', name: 'Cirrhosis' }, { preset: 'rhf', name: 'Right heart failure' }, { preset: 'budd-chiari', name: 'Budd–Chiari syndrome' }] }),
  card('visual/walls', 'The gut capillary wall and the sinusoid wall', { cam: 'fit', visual: 'walls' }),
  card('visual/plane', 'A plane panel: flow against pressure', { cam: 'route', visual: 'plane', plane: 'flow-ppg', of: [{ preset: 'healthy', name: 'Healthy' }, { preset: 'csph', name: 'Cirrhosis with CSPH', short: 'CSPH' }] }),
  card('visual/allpatients', 'Every patient on one chart', { cam: 'fit', visual: 'allpatients', cohort: [{ name: 'One patient', c: 's1', slides: [sid('plane/csph')], pace: true }], chartFoot: ['LSM is liver stiffness in kPa, Plt platelets in ×10³/µL.'] }),

  // ── Teaching card variants ──
  teach('teaching/words-only', 'Words only: kicker, title and line', { preset: 'healthy', cam: 'fit' }),
  teach('teaching/vignette', 'With a case vignette', { preset: 'csph', cam: 'route', vignette: 'A 52-year-old man with hepatitis C cirrhosis comes to his first hepatology visit. He has never bled or had ascites, and his platelets are 90,000/µL.', key: ['hvpg'], data: 'tiles', tiles: ['hvpg', 'plt'] }),
  teach('teaching/equation', 'With an equation (MathML)', { preset: 'healthy', cam: 'route', eq: ['<mi>HVPG</mi><mo>=</mo><mi class="eq-wedge">WHVP</mi><mo>−</mo><mi class="eq-hv">FHVP</mi>'], data: 'tiles', tiles: ['whvp', 'fhvp', 'hvpg'], key: ['hvpg'] }),
  teach('teaching/terms', 'With term pills and a cut-off pill', { preset: 'csph', cam: 'route', terms: ['pv', 'sin'], line: 'The [portal vein](pv) and the [sinusoids](sin): clinically significant portal hypertension starts at {>=10 mmHg}.' }),
  teach('teaching/cite', 'With a source line', { preset: 'csph', cam: 'liver', cite: 'Baveno VIII 1.15, 1.16', notes: 'Baveno VIII 1.15, 1.16' }),
  teach('teaching/compare', 'With compare buttons', { preset: 'csph', cam: 'route', data: 'tiles', tiles: ['hvpg', 'ppg'], compare: [{ label: 'Healthy', preset: 'healthy' }, { label: 'This patient', own: true }] }),
  teach('teaching/what-if', 'With a what-if slider', { preset: 'cirr-decomp-tips', cam: 'tips', data: 'tiles', tiles: ['ppg', 'liver'], whatIf: { label: 'Stent width', param: 'tips.d', min: 6, max: 12, step: 1, unit: 'mm' } }),
  teach('teaching/response-before', 'The HVPG fall: the state before the drug', { preset: 'csph', cam: 'liver', tool: { kind: 'hvpg' }, data: 'tiles', tiles: ['map', 'hr'] }),
  teach('teaching/response', 'The HVPG fall tile and response buttons', { carry: true, params: { drugs: { carvedilol: true } }, cam: 'liver', tool: { kind: 'hvpg' }, data: 'tiles', tiles: ['map', 'hr'], key: ['hvpgFall'], delta: sid('teaching/response-before'), hvpgResp: sid('teaching/response-before'), response: true }),
  teach('teaching/strain', 'Hold to strain', { preset: 'csph', cam: 'fit', strain: true, data: 'tiles', tiles: ['pv', 'map'], key: ['pv'] }),
  teach('teaching/question', 'A question card in front of the slide', { carry: true, params: { drugs: { carvedilol: true } }, cam: 'liver', question: 'Which lever does carvedilol pull?', data: 'tiles', tiles: ['hvpg', 'map'] }),
  teach('teaching/case', 'A case card with a question and compare buttons', { preset: 'schisto', cam: 'liver', caseQ: 'Will carvedilol add much to propranolol here?', vignette: 'A 38-year-old woman from the Senegal River region has a large spleen and large esophageal varices on EGD. Her liver tests are normal, and she has never bled.', data: 'tiles', tiles: ['pv', 'hvpg'], compare: [{ label: 'Propranolol', params: { drugs: { propranolol: true, carvedilol: false } } }, { label: 'Carvedilol', own: true, params: { drugs: { propranolol: false, carvedilol: true } } }] }),
  teach('teaching/steps', 'Step markers in the words', { preset: 'healthy', cam: 'fit', lens: 'system', steps: true, glowSeq: 550, glow: [['V_INT', 'V_SPL', 'V_IMV'], ['PVH_R', 'PVH_L']], line: 'Blood flows from the splanchnic veins {#1} into the portal vein {#2}.' }),
  teach('teaching/lapse', 'A time-lapse over days', { preset: 'csph', days: 60, ramp: { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] }, lapse: { seconds: 9 }, cam: 'fit', data: 'tiles', tiles: ['sin', 'asc'], key: ['asc'], delta: true }),
  teach('teaching/mark', 'A mark on one vessel', { preset: 'pvt-chronic', cam: 'portal', mark: { edges: ['PV_TRUNK'], label: 'Clot' }, data: 'tiles', tiles: ['pv', 'whvp'] }),
  teach('teaching/marks', 'Marks on the figure: a vessel and an organ', { preset: 'budd-chiari', cam: 'hepatic', marks: [{ edges: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], label: 'Clot in hepatic veins', free: true }, { organ: 'caudate', label: 'Caudate lobe', kind: 'note' }], data: 'tiles', tiles: ['fhvp', 'hvpg'] }),
  teach('teaching/scope-tile', 'The endoscopy readout tile', { preset: 'cirr-decomp', cam: 'gej', scopeTile: true, data: 'tiles', tiles: ['hvpg'] }),
  teach('teaching/lobule', 'Lobule view with a callout', { preset: 'schisto', cam: 'lobule:triad', callout: { at: 'triad', label: 'Resistance' }, terms: { 'portal venules': 'lobule:triad' }, data: 'tiles', tiles: ['pv', 'hvpg'] }),
];

// ── Readout tiles: one slide for each group of four, every tile key the app has (table-marks.js TILE) ──
export const TILE_GROUPS = [
  ['pressure-a', 'Pressures: portal, wedged, free, HVPG', 'csph', ['pv', 'whvp', 'fhvp', 'hvpg']],
  ['pressure-b', 'Pressures: IVC, right atrium, EUS, PPG', 'schisto', ['ivc', 'ra', 'eus', 'ppg']],
  ['effects', 'Effects: sinusoid, varix, fundal varix, ascites', 'cirr-decomp', ['sin', 'varix', 'gv', 'asc']],
  ['flow', 'Flow: liver, shunted, portal flow, portal velocity', 'cirr-decomp', ['liver', 'shunt', 'pvFlow', 'pvVel']],
  ['ascitic', 'Ascitic fluid and albumin: SAAG, protein, serum albumin, encephalopathy risk', 'cirr-decomp', ['saag', 'tp', 'salb', 'he']],
  ['clot', 'The clot, the spleen and the blood count', 'pvt-chronic', ['clot', 'spleen', 'plt', 'pv']],
  ['stiffness', 'Stiffness: liver, spleen, platelets, spleen length', 'csph', ['lsm', 'ssm', 'plt', 'spleen']],
  ['pressure-heart', 'Blood pressure: MAP, systolic, perfusion pressure, heart rate', 'cirr-decomp', ['map', 'sbp', 'rpp', 'hr']],
  ['blood', 'Blood: hemoglobin, hemoglobin after a transfusion, output, volume', 'cirr-decomp', ['hb', 'hbTo', 'co', 'bv']],
  ['tips-a', 'TIPS: flow, gradient, velocity, lumen', 'cirr-decomp-tips', ['tipsFlow', 'tipsDp', 'tipsVel', 'tipsLumen']],
  ['tips-b', 'TIPS: local narrowing, bench, and the DIPS flow and gradient', 'cirr-decomp-tips', ['tipsLocalPct', 'tipsBench', 'dipsFlow', 'dipsDp']],
  ['dips', 'DIPS: velocity, lumen, local narrowing, bench', 'budd-chiari', ['dipsVel', 'dipsLumen', 'dipsLocalPct', 'dipsBench']],
];
for (const [id, title, preset, keys] of TILE_GROUPS) CATALOG.push(tiles(id, title, preset, keys, id === 'dips' ? { params: { dips: { on: true } }, days: 60 } : {}));
// An example of a tile highlighted by `key`, and one with `delta` (the change from the slide before).
CATALOG.push(S('tiles/delta', 'Tiles showing their change from the slide before', { preset: 'cirr-decomp', cam: 'fit', data: 'tiles', tiles: ['pv', 'hvpg', 'asc'], key: ['hvpg'], delta: sid('tiles/pressure-a') }, { deck: 'tiles' }));

// ── Algorithms and trials: one specimen each, read from the app's own lists so a new one cannot be missed ──
const PATH_SHORT = { 'first-visit': 'First visit', bleed: 'Bleeding', gastric: 'Gastric varices', ascites: 'Ascites', stopcarv: 'Stop carvedilol', holdcarv: 'Hold carvedilol', secprop: 'Secondary prophylaxis', psvdscope: 'PSVD scope', pvtocc: 'Portal vein thrombosis', pvtdur: 'Anticoagulation length', aasld: 'AASLD', psvdscore: 'PSVD score', recomp: 'Recompensation', pvtgrid: 'Thrombosis grid', ladder: 'Stages' };
for (const of of Object.keys(PATHS)) CATALOG.push(card(`path/${of}`, `Flowchart: ${PATH_SHORT[of] || of}`, { preset: 'cirr-decomp', cam: 'fit', tool: { kind: 'path', of, short: PATH_SHORT[of] || of } }));
for (const id of TRIAL_IDS) CATALOG.push(card(`trial/${id}`, `Trial: ${id}`, { preset: 'healthy', cam: 'fit', tool: { kind: 'trial', id } }));

CATALOG.push(...MAIN);

export const byId = Object.fromEntries(CATALOG.map((e) => [e.id, e]));
export const families = () => [...new Set(CATALOG.map((e) => e.family))];
export const presetIds = () => PRESETS.map((p) => p.id);
