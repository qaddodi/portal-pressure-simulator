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
//   mark                     { edges, label, seg? }: a ring and a callout on the figure; on a stent,
//                            seg ('proximal' | 'mid' | 'distal' | 'site', the third holding its narrowing) lights and points at that third only
//   eq                       [MathML, legend?]: an equation under the title (see mi, mo, sub and frac)
//   kicker, site, title, line, causes
//                            the words (site: a level of ladder.js SITES; it colours the kicker). The title stands alone without
//                            the kicker, and the line is a sentence of its own. In the line, {braces} mark the one value to set
//                            in a pill (else the first value with a unit; pill: false for none); bold: extra key terms to bold
//   rail                     true: the six levels with this slide's site marked; 'all': every level named
//   data                     'tiles': the tiles (tiles: which, key: what to highlight, delta: true or a slide id to show each
//                            tile's change from that state; a slide that changes the same patient (no preset) counts from the
//                            slide before unless it says delta: false). The pressure chart is tool { kind: 'profile' }, Gut to heart,
//                            the one chart on every card; an older deck's data: 'ladder' (with brackets, block, ladderFrom and
//                            ladderFromLabel) shows that profile instead (teach-extras.js oneLadder)
//   tool                     an instrument in the data card, reading the live model (presenter-tools.js): { kind: 'doppler',
//                            vessel, gate?, points? } (gate: on a stent, the third it samples, 'proximal' | 'mid' (default) | 'distal' | 'site';
//                            points: true calls out the stent's velocity at all three points on the figure, the sampled one in green), { kind: 'scope' }, { kind: 'fibroscan' }, { kind: 'trace', range: 'talk' | 'beats' },
//                            { kind: 'abdomen' }, { kind: 'wall' } (the varix in cross-section); title? names the card; waves: true
//                            names a hepatic vein Doppler's a, S and D. With data too, the tool sits above the tiles
//                            (on a phone it folds away behind a Show button; open: true keeps it open there and folds the tiles instead)
//   lens                     the vessel colours on that slide: 'velocity', 'flow', 'direction', 'heat' (congestion), 'drop'
//                            (pressure drop), 'delta' (change from healthy), 'oxygen' (oxygen saturation) or 'origin' (blood origin), with a key under the line; pressure when absent
//   sites                    readings on the figure: 'pv', 'ivc', 'ra', 'web' (pressures; web: the IVC below a web), 'rLiver', 'rColl' (the circuit's resistors), 'split' (portal blood to liver and shunts)
//   cath                     the HVPG catheter instead of a camera: 'route', 'free', 'wedge', 'result' or 'blocked'
//   monitor                  the catheter's pressure monitor (Measure › HVPG's tracing) under the slide's words: 'free', 'wedge' or 'result'
//   tick                     a few words for what happened at this slide's time point, over its line, at 45°, on a talk trace (else its title)
//   when                     the time point under that line, in words, when the days so far would repeat the one before (a drug started at the same visit)
//   lapse                    { seconds, from?, to? }: the slide's days (ramp: { param: [from, to] } eased over them; a dotted param names a nested one, 'fibrosis.R.post') play on the
//                            live figure as a time-lapse, from the slide before's state (from/to: words for the
//                            start and end in place of a day counter, e.g. 'Fasting' and 'After a meal'; keep the
//                            days at least the seconds, or the live clock runs sub-day and skips the ramp; clock: 'seconds'
//                            plays the ramp over the seconds on the bedside clock instead, so a Doppler keeps recording, e.g. a meal)
//   visual                   over the dimmed figure: 'ladders' (each row's Gut to heart profile, six in a grid), 'table' (cols, asc: SAAG and protein columns, note: a text column's heading or several, vs: 'first' to show arrows against the first row,
//                            foot: one sentence after the legend, which is built from the table; a row's ref: true keeps its numbers, its vs: a slide id
//                            compares it with that row instead, its note: the text column's words, or an array of them), 'scale' (scale), 'quadrant'
//                            (SAAG × protein) or 'walls' (gut capillary wall vs sinusoid); of: the rows, slide ids or { id | preset, name, title, note, blank: [columns] }
//   compare                  [{ label, params, own? }]: buttons that switch the live model between treatments in real
//                            time (params: each option's full set of the switched keys; own: the slide's own state);
//                            or [{ label, preset }, { label, own: true }]: buttons that ease the live model to another
//                            patient (a preset, computed with the slide's states) and back to the slide's own state;
//                            or [{ label, slide }, { label, own: true }]: the same, to another slide's state in the deck (a time point);
//                            or [{ label, lens, own? }]: buttons that switch the figure's lens, the model untouched;
//                            or [{ label, gate, own? }]: buttons that move a stent Doppler's gate (see tool), the model untouched
//   scales                   the scale switch: an Anatomy / Lobule / Sinusoid pill that flips the figure to other scales of the same patient
//                            and back; the slide opens on its own scale (its cam), and every slide does again on Next, Back or a jump.
//                            ['lobule', 'anatomy:fit']: the scales offered, each with where it lands; or one view per scale,
//                            { anatomy: { cam, kMax, clear, labels, mark, marks, sites, glow }, lobule: { cam: 'lobule:triad', zoom, glow,
//                            callout, layers }, sinusoid: {} }: where its camera goes and what it calls out (the slide's own call-outs stay at
//                            its own scale). Sinusoid only on a pressure-lens slide; never on a question, catheter, Doppler, calipers or Circuit
//                            slide (scale-switch.js; guide 5.10). Built-in slides list it in tests/deck-adopted.js
//   caveat                   one short sentence in small print under the line, where the model differs from patients
//   notes, ask               speaker notes, and [question, expected answer] for the room
//   whatIf                   { label, param, min, max, step?, ends?: [low, high], unit? }: a slider that drags one parameter
//                            (a dotted path, e.g. 'tips.d', or an array of paths moved together, e.g. both lobes' fibrosis)
//                            of the live model; the figure and the data card follow it
//   procedure                'tips' | 'brto' | 'bato', or { kind, auto: true }: a Play button on the teaching card plays that catheter
//                            procedure on the figure (proc-anim.js; auto: as the slide lands, going forward), and the live model takes
//                            the change when it ends, as a compare button does. Opt-in: a built-in slide uses it only when
//                            tests/deck-adopted.js lists it. A patient who already has the result has it taken back first, and the play puts it back
//   hold                     true (opt-in, tests/deck-adopted.js): a question slide keeps back what would name its answer (the Gut to heart
//                            chart's red blocks and brackets, the Doppler strip's direction, pattern and note, the tiles' rating words);
//                            the next slide, its answer, lets them ease in once it has landed (presenter.js holdAnswer)
//   opt-in visuals (deck visuals packages; a built-in slide uses one only when tests/deck-adopted.js lists it; docs/deck-authoring-guide.md 5.9, 6.4, 7):
//                            figure: spot, normalOutline, ripple, lens 'system' | 'since' (since, sinceLabel), calipers,
//                            lapseGlow ['bowel'] (those organs glow from the time-lapse's start, while the slide is up), steps (with glowSeq), span, zone,
//                            mark { organ } and {tokens} in a mark's label, '@sets' in glow/spot/edges;
//                            words: cite; card: tool kinds 'profile' (from, fromLabel), 'flows', 'curve', 'causes',
//                            'plane', 'lumen', 'fluid', Doppler mode/calipers/pair, bands on trace and flowtime;
//                            panels: visual 'plane', table col 'wave', focusRow
//
// Deck fields: id, level, title, minutes, summary, objectives (3 to 4 short learning objectives), slides, and sections
// ([name, [kickers]], three to five) when its kicker groups are more than five, and checks ([[question, answer]], three
// or four), the closing quick check.
// Every deck opens with an "Outline and objectives" slide built from its kicker groups and objectives
// (withOverview below); a deck never writes that slide itself.

import { CIRCULATION } from './decks/circulation.js?v=81083b0906';
import { SITES } from './decks/sites.js?v=d921674c99';
import { HVPG } from './decks/hvpg.js?v=2b95017b10';
import { ASCITES } from './decks/ascites.js?v=5b8b08ea75';
import { VARICES } from './decks/varices.js?v=893a946598';
import { TREATMENT } from './decks/treatment.js?v=a4b72913c6';
import { STIFFNESS } from './decks/stiffness.js?v=9350d9589d';
import { ONE_YEAR } from './decks/one-year.js?v=16dec5b7e8';
import { LOBULE } from './decks/lobule.js?v=b5474f658b';
import { SHUNTS } from './decks/shunts.js?v=e655bb6f84';
import { TIPS_DOPPLER } from './decks/tips-doppler.js?v=85ee5c729f';
import { TAP } from './decks/tap.js?v=1c015291d2';
import { CIRCUIT } from './decks/circuit.js?v=c1f4d54f37';
import { DOPPLER } from './decks/doppler.js?v=dbd76f9f63';
import { ENDOSCOPY } from './decks/endoscopy.js?v=fe82b43220';
import { PREHEPATIC } from './decks/prehepatic.js?v=bbb8e52395';
import { RIGHT_HEART } from './decks/right-heart.js?v=76c355aca4';
import { BLEED } from './decks/variceal-bleed.js?v=aae9176624';
import { TWO_INFLOWS } from './decks/two-inflows.js?v=c654aeaa46';
import { PVT_CIRRHOSIS } from './decks/pvt-cirrhosis.js?v=735b69cc21';
import { SPLEEN } from './decks/spleen.js?v=419f925c34';
import { NCPH } from './decks/ncph.js?v=20b7cd7155';
import { OUTFLOW } from './decks/outflow.js?v=1994618183';
import { RECOMPENSATION } from './decks/recompensation.js?v=8101aaecd6';
import { WHERE } from './decks/where.js?v=9ae29bcc6c';
import { PREGNANCY_DECK } from './decks/pregnancy.js?v=1972ca68b8';
import { BETA_BLOCKERS } from './decks/beta-blockers.js?v=764f3d0eea';
import { ENCEPHALOPATHY } from './decks/encephalopathy.js?v=b9c1426e63';
import { CAUSE_TREATED } from './decks/cause-treated.js?v=f2ee45fb1a';
import { NEXT_BLEED } from './decks/next-bleed.js?v=6f687c2dc9';
import { GASTRIC } from './decks/gastric-varices.js?v=fc839d2a3e';
import { READ_DOPPLER } from './decks/read-doppler.js?v=ad80c00190';
import { HYPERDYNAMIC } from './decks/hyperdynamic.js?v=51b99b5f43';
import { CHOOSE_TREATMENT } from './decks/choose-treatment.js?v=95fb1b25c1';
import { BLOOD_VOLUME } from './decks/blood-volume.js?v=34877ec912';
import { FIRST_VISIT } from './decks/first-visit.js?v=61860a515d';
import { REFRACTORY_BLEED } from './decks/refractory-bleed.js?v=ed66780198';
import { TRANSPLANT_DOPPLER } from './decks/transplant-doppler.js?v=c310965e72';
import { TEN_YEARS } from './decks/ten-years.js?v=00f5f01a0c';
import { TIPS_JOURNEY } from './decks/tips-journey.js?v=8485cd867e';

// Regions of the anatomy plate the camera frames (world units, x 300-1120, y 0-920).
export const REGIONS = {
  route: [380, 30, 900, 690],       // portal vein to heart
  liver: [344, 166, 862, 522],      // the liver over every cirrhosis and congestion (x 352 to 845, y 176 to 514; 20 Oct)
  portal: [520, 360, 930, 710],     // confluence, trunk, splenic vein, SMV
  gut: [360, 360, 1070, 1020],      // the portal system and the stretched small bowel (down to y 966), with its glow's reach around it
  hepatic: [410, 40, 800, 340],     // hepatic veins, IVC, right atrium
  dips: [450, 220, 760, 480],       // the DIPS tract, portal bifurcation up through the caudate lobe to the IVC
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
  // The talk's sections: its own (sections: [[name, [kickers or slide ids]]], ids for a talk under one kicker), else its
  // kicker groups when there are three to five; each slide then carries its place (sec: [n, of]) for the running head.
  // Fewer groups: the slide titles.
  const groups = [...new Set(d.slides.map((s) => s.kicker).filter((k) => k && k !== 'Summary'))];
  const secs = d.sections || (groups.length >= 3 && groups.length <= 5 ? groups.map((g) => [g, [g]]) : null);
  const outline = secs ? secs.map(([n]) => n) : d.slides.filter((s) => s.kicker !== 'Summary').map((s) => s.title);
  const place = (s) => { const k = secs ? secs.findIndex(([, ks]) => ks.includes(s.kicker) || (s.id && ks.includes(s.id))) : -1; return k >= 0 ? { ...s, sec: [k + 1, secs.length] } : s; };
  const open = { id: 'outline', visual: 'outline', outline, objectives: d.objectives || [], kicker: d.title, title: 'Outline and objectives',
    notes: 'Set out the plan of the talk and what the audience should be able to do by the end.',
    ...(keep ? Object.fromEntries(MODEL.filter((k) => first[k] !== undefined).map((k) => [k, first[k]])) : {}) };
  // A first slide that opens with a case keeps its patient too, so it loads that patient afresh behind the case card.
  const firstNow = keep && !first.vignette ? Object.fromEntries(Object.entries(first).filter(([k]) => !MODEL.includes(k))) : first;
  // The closing quick check (checks: [[question, answer]]): over the last slide's patient, which it keeps.
  const check = d.checks?.length ? [{ id: 'check', visual: 'check', checks: d.checks, kicker: 'Quick check', title: 'Check what you remember',
    line: 'Answer each question in your head, then tap it to see the answer.' }] : [];
  return { ...d, slides: [open, place(firstNow), ...rest.map(place), ...check] };
}

// The site tag by a slide's title: the level of its block (its site), on the slides of a deck that teaches more than one
// level, so the learner always knows which type of portal hypertension the slide is about. A deck about cirrhosis alone
// (every site sinusoidal) carries none, nor does a slide whose level rail already marks the block, or a visual.
export const SITE_TAGS = { pre: 'Pre-hepatic', pvt: 'Pre-hepatic', presin: 'Presinusoidal', sin: 'Sinusoidal', postsin: 'Postsinusoidal', post: 'Post-hepatic', cardiac: 'Cardiac' };
export function siteTag(deck, s) {
  if (!s?.site || s.rail || s.visual || !deck?.slides?.some((x) => x.site && x.site !== 'sin')) return null;
  return SITE_TAGS[s.site] ? { site: s.site === 'pvt' ? 'pre' : s.site, name: SITE_TAGS[s.site] } : null;
}

export const DECKS = [CIRCULATION, SITES, HVPG, ASCITES, VARICES, TREATMENT];

DECKS.push(STIFFNESS, ONE_YEAR, TAP, CIRCUIT, LOBULE, SHUNTS);
DECKS.push(DOPPLER, ENDOSCOPY, TIPS_DOPPLER);
DECKS.push(PREHEPATIC, RIGHT_HEART, BLEED);
DECKS.push(TWO_INFLOWS, PVT_CIRRHOSIS, SPLEEN, NCPH, OUTFLOW, RECOMPENSATION);
DECKS.push(WHERE);
DECKS.push(PREGNANCY_DECK);
DECKS.push(BETA_BLOCKERS);
DECKS.push(ENCEPHALOPATHY, CAUSE_TREATED);
DECKS.push(NEXT_BLEED);
DECKS.push(GASTRIC);
DECKS.push(READ_DOPPLER);
DECKS.push(HYPERDYNAMIC);
DECKS.push(CHOOSE_TREATMENT);
DECKS.push(BLOOD_VOLUME);
DECKS.push(FIRST_VISIT);
DECKS.push(REFRACTORY_BLEED);
DECKS.push(TRANSPLANT_DOPPLER);
DECKS.push(TEN_YEARS);
DECKS.push(TIPS_JOURNEY);

// The unified menu lists the presentations by topic, in teaching order, under a short title (32 characters or fewer); the
// third name is the deck's short name in the tab at each slide card's top right corner (presenter.js deckTab; 20 or fewer).
export const TOPICS = [
  ['foundations', 'Foundations', [['circulation', 'The portal circulation', 'Circulation'], ['circuit', 'Portal pressure as a circuit', 'Circuit'], ['two-inflows', 'The liver\'s two inflows', 'Two inflows'], ['hvpg', 'HVPG and PPG', 'HVPG and PPG'], ['hyperdynamic', 'The hyperdynamic circulation', 'Hyperdynamic']]],
  ['causes', 'Causes', [['sites', 'Sites and causes', 'Sites and causes'], ['prehepatic', 'Pre-hepatic PH', 'Pre-hepatic PH'], ['ncph', 'Presinusoidal PH', 'Presinusoidal PH'], ['right-heart', 'The right heart and the liver', 'Right heart'], ['outflow', 'Hepatic outflow obstruction', 'Outflow obstruction'], ['lobule', 'Inside the lobule', 'Lobule'], ['where-resistance', 'Where is the resistance?', 'Find the resistance']]],
  ['measuring', 'Measuring', [['doppler', 'Doppler of the portal system', 'Doppler'], ['read-doppler', 'Read the Doppler', 'Read the Doppler'], ['transplant-doppler', 'Doppler after a liver transplant', 'Transplant Doppler'], ['stiffness', 'Stiffness, spleen and platelets', 'Stiffness'], ['one-year', 'A year of compensated cirrhosis', 'One year'], ['first-visit', 'Stage at the first visit', 'First visit']]],
  ['complications', 'Complications', [['varices', 'Collaterals and varices', 'Varices'], ['endoscopy', 'Endoscopy and the varix', 'Endoscopy'], ['variceal-bleed', 'Acute variceal bleeding', 'Variceal bleed'], ['blood-volume', 'Blood volume and portal pressure', 'Blood volume'], ['ascites', 'How ascites forms', 'Ascites'], ['tap', 'Paracentesis and albumin', 'Paracentesis'], ['encephalopathy', 'Encephalopathy and shunting', 'Encephalopathy'], ['spleen', 'The spleen: size and treatment', 'Spleen'], ['gastric-varices', 'Gastric varices', 'Gastric varices'], ['pvt-cirrhosis', 'Portal vein clot in cirrhosis', 'PVT in cirrhosis'], ['recompensation', 'Decompensation and recovery', 'Recompensation'], ['pregnancy', 'Cirrhosis in pregnancy', 'Pregnancy'], ['ten-years', 'One patient, ten years', 'Ten years']]],
  ['treatment', 'Treatment', [['treatment', 'Lowering portal pressure', 'Lowering pressure'], ['beta-blockers', 'Propranolol or carvedilol', 'Beta-blockers'], ['next-bleed', 'Preventing the next bleed', 'Next bleed'], ['choose-treatment', 'Choose the treatment', 'Choose treatment'], ['cause-treated', 'Treating the cause', 'Treating the cause'], ['shunts', 'Spontaneous shunts and TIPS', 'Shunts and TIPS'], ['tips-journey', 'A TIPS from start to finish', 'TIPS journey'], ['tips-doppler', 'Doppler after TIPS', 'TIPS Doppler'], ['refractory-bleed', 'When the bleeding will not stop', 'Refractory bleed']]],
];
for (const [topic, , list] of TOPICS) for (const [id, short, head] of list) { const d = DECKS.find((x) => x.id === id); if (d) Object.assign(d, { topic, short, head }); }
