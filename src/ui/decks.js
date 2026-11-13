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
//   zoomTiles (deck field)   false: a tiles-only data card does not zoom on tap (default: it does, wide screens; an instrument card always does)
//   keepPinch (deck field)   true: a view the learner pinched, dragged or zoomed stays when a card changes size (Next, Back, Fit, a turn frame it again)
//   cam                      'fit', a region of REGIONS, [x0, y0, x1, y1] (anatomy world units), a list of regions
//                            (['portal', 'spleen']: their union), or by name { on: ['PV_TRUNK', 'spleen'], near?: region }
//                            (what the names point at: vessels, organs, term targets, stations, '@sets'; cam-frame.js).
//                            On a Circuit slide: a Circuit region (cam-frame.js CIRC_REGIONS) or a box in circuit units; `zone` is its default.
//                            'lobule', 'lobule:triad' | 'lobule:sinusoid' | 'lobule:central' (zoom: × the lobule's
//                            framing), or 'sinusoid'
//   labels                   the stations named on the anatomy (none when absent)
//   tint                     ['imv']: TARGETS keys whose station label takes its colour though the line never names it
//   layers                   ['zones']: the lobule's zone bands on (a lobule slide shows none otherwise)
//   mark                     { edges, label, seg? }: a ring and a callout on the figure; on a stent,
//                            seg ('proximal' | 'mid' | 'distal' | 'site', the third holding its narrowing) lights and points at that third only
//   stented                  ['RHV_IVC']: veins the slide shows with a stent in them (a vein the model has no device for, as a hepatic vein
//                            or the IVC): the mesh is drawn over the middle of each on the figure, unrolled from its heart end, and a
//                            cross-section tool on the same vein shows the stent's ring. The slide's mark names it ("Stent").
//   eq                       [MathML, legend?]: an equation under the title (see mi, mo, sub and frac)
//   kicker, site, title, line, causes
//                            the words (site: a level of ladder.js SITES; it colours the kicker). The title stands alone without
//                            the kicker, and the line is a sentence of its own. In the line, {braces} mark the one value to set
//                            in a pill (else the first value with a unit; pill: false for none); bold: extra key terms to bold
//   relax                    days lived at the slide's preset and params before its ramp or days, so the slow organs (the spleen, the platelets) settle to a
//                            scar that params set worse or better than the preset's; without it the first months of a ramp run them there (a dip in the platelets)
//   rail                     true: the six levels with this slide's site marked; 'all': every level named
//   data                     'tiles': the tiles (tiles: which, key: what to highlight, delta: true or a slide id to show each
//                            tile's change from that state; a slide that changes the same patient (no preset) counts from the
//                            slide before unless it says delta: false). The pressure chart is tool { kind: 'profile' }, Gut to heart,
//                            the one chart on every card; its brackets are the tool's `spans` option, on any slide of any deck: any of 'hvpg', 'eus',
//                            'ppg' ([] draws none, with no WHVP or FHVP tag on the figure's labels either, so students read the raw pressures
//                            before the gradients are named; left out: HVPG and PPG, as before); an older deck's data: 'ladder' (with brackets, block, ladderFrom and
//                            ladderFromLabel) shows that profile instead (teach-extras.js oneLadder)
//   tool                     an instrument in the data card, reading the live model (presenter-tools.js): { kind: 'doppler',
//                            vessel, gate?, points? } (gate: on a stent, the third it samples, 'proximal' | 'mid' (default) | 'distal' | 'site';
//                            points: true calls out the stent's velocity at all three points on the figure, the sampled one in green), { kind: 'scope', air?, red?, readings? } (air: mmHg of air in the lumen, 0 to 20, seen view-only; red: true | false, the red wale marks; readings: true, three pressure rows), { kind: 'fibroscan' }, { kind: 'trace', range: 'talk' | 'beats', deltaLabel? } (deltaLabel: on the beats card, the name of where the patient stood before, the slide's delta: 'before the bleed'),
//                            { kind: 'abdomen' }, { kind: 'wall' } (the varix in cross-section),
//                            { kind: 'vitals', show? } (a monitor: the EKG strip over hr, map, co, hb), { kind: 'hvpg' } (the catheter's tracing, played on arrival; catheter: true follows the slide's cath instead and stays from one step to the next); title? names the card; waves: true
//                            names a hepatic vein Doppler's a, S and D. With data too, the tool sits above the tiles
//                            (on a phone it folds away behind a Show button; open: true keeps it open there and folds the tiles instead)
//   lens                     the vessel colours on that slide: 'velocity', 'flow', 'direction', 'heat' (congestion), 'drop'
//                            (pressure drop), 'delta' (change from healthy), 'oxygen' (oxygen saturation), 'origin' (blood origin) or 'firstpass' (gut blood the liver cleaned against blood that went round it), with a key under the line; pressure when absent
//   sites                    readings on the figure: 'pv', 'ivc', 'ra', 'web' (pressures; web: the IVC below a web), 'rLiver', 'rColl' (the circuit's resistors), 'split' (portal blood to liver and shunts)
//   cath                     the HVPG catheter instead of a camera: 'route', 'free', 'wedge', 'result' or 'blocked'
//   monitor                  the catheter's pressure monitor (Measure › HVPG's tracing) under the slide's words: 'free', 'wedge' or 'result'
//                            (the built-in talks put it in the data card instead: tool { kind: 'hvpg', catheter: true } on a slide with that cath)
//   tick                     a few words for what happened at this slide's time point, over its line, at 45°, on a talk trace (else its title)
//   when                     the time point under that line, in words, when the days so far would repeat the one before (a drug started at the same visit)
//   lapse                    { seconds, from?, to? }: the slide's days (ramp: { param: [from, to] } eased over them; a dotted param names a nested one, 'fibrosis.R.post') play on the
//                            live figure as a time-lapse, from the slide before's state (from/to: words for the
//                            start and end in place of a day counter, e.g. 'Fasting' and 'After a meal'; keep the
//                            days at least the seconds, or the live clock runs sub-day and skips the ramp; clock: 'seconds'
//                            plays the ramp over the seconds on the bedside clock instead, so a Doppler keeps recording, e.g. a meal)
//   graph                    a time-lapse slide's graph on its teaching card (lapse-graph.js): the first two of its tiles, day by day, over the bar. Names its two lines
//                            when it has no tiles (['map', 'co']; the keys are flow-time.js LINE); false for none (a slide whose own record is the graph, or a chart tool)
//                            On a slide that plays a TIPS, BRTO or BATO (procedure) the same field names the two lines its procedure graph draws live after the stent (event-graph.js)
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
//                            or [{ label, tool: { red: false }, own? }]: buttons that change the options of the slide's instrument (the scope's), the model untouched
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
//                            of the live model; the figure and the data card follow it. With tool in place of param ({ label, tool: 'air', min, max, step?, unit? })
//                            it moves one option of the slide's instrument (the scope's air pressure) and the model is left alone
//   response                 true (opt-in, tests/deck-adopted.js): three buttons on the teaching card (Non-responder, Usual responder, Strong responder) that change how strongly this
//                            patient's portal pressure answers a beta-blocker on the live model (nsbbGain 0, 1, 1.6; nsbb-response.js). The drug comes from the slide's params; the
//                            slide's own nsbbGain (none, 1 or 1.6) marks its button. Not with compare; pair it with hvpgResp to show the fall
//   strain                   true or { label?: 'Hold to strain' } (opt-in, tests/deck-adopted.js): a button on the teaching card that works only while it is held: pressed, the
//                            engine's Valsalva builds (30 mmHg of chest and belly pressure over 1.5 s); let go, it falls back over 1.5 s and the data card follows. It lets go on
//                            leaving the slide, and by itself after 30 s. Never with a time-lapse, a procedure or a catheter on the slide
//   procedure                'tips' | 'brto' | 'bato' | 'rex', or { kind, auto: true, target }: (target: { kind: 'brto', target: 'C6' } plugs the splenorenal shunt in place of the gastrorenal one, Baveno VIII 6.12; { kind: 'tips', target: 'C1a' } coils the coronary vein before the stent, Baveno VIII 5.41) a Play button on the teaching card plays that catheter
//                            procedure (or, for 'rex', the Meso-Rex graft, which grows along its path) on the figure (proc-anim.js; auto: as the slide lands, going forward), and the live model takes
//                            the change when it ends, as a compare button does. Opt-in: a built-in slide uses it only when
//                            tests/deck-adopted.js lists it. A patient who already has the result has it taken back first, and the play puts it back
//   hold                     true (opt-in, tests/deck-adopted.js): a question slide keeps back what would name its answer (the Gut to heart
//                            chart's red blocks and brackets, the Doppler strip's direction, pattern and note, the tiles' rating words);
//                            the next slide, its answer, lets them ease in once it has landed (presenter.js holdAnswer)
//   scopeLens: true | false  the scope ring on the varices (scope-lens-rule.js): on by itself where the slide shows them (cam varices,
//                            bleed, gej, fundus; labels VAR; calipers varix; a mark on C1a or C1b) unless its tool is the scope; true or false decides.
//                            A tap on the ring opens the live scope view beside the figure (scope-lens.js).
//   opt-in visuals (deck visuals packages; a built-in slide uses one only when tests/deck-adopted.js lists it; docs/deck-authoring-guide.md 5.9, 6.4, 7):
//                            figure: spot, normalOutline, ripple, lens 'system' | 'since' (since, sinceLabel), calipers,
//                            lapseGlow ['bowel'] (those organs glow from the time-lapse's start, while the slide is up), steps (with glowSeq), span, zone,
//                            mark { organ } and {tokens} in a mark's label, '@sets' in glow/spot/edges;
//                            words: cite; card: tool kinds 'profile' (from, fromLabel), 'flows', 'curve', 'causes', 'course',
//                            'plane', 'lumen', 'fluid', Doppler mode/calipers/pair, bands on trace and flowtime;
//                            panels: visual 'plane', table col 'wave', focusRow
//
// Deck fields: id, level, title, minutes, summary, objectives (3 to 4 short learning objectives), slides, and sections
// ([name, [kickers]], three to five) when its kicker groups are more than five, and checks ([[question, answer]], three
// or four), the closing quick check.
// Every deck opens with an "Outline and objectives" slide built from its kicker groups and objectives
// (withOverview below); a deck never writes that slide itself.

import { responseButtons } from './nsbb-response.js';
import { CIRCULATION } from './decks/circulation.js';
import { SITES } from './decks/sites.js';
import { HVPG } from './decks/hvpg.js';
import { ASCITES } from './decks/ascites.js';
import { VARICES } from './decks/varices.js';
import { TREATMENT } from './decks/treatment.js';
import { STIFFNESS } from './decks/stiffness.js';
import { LOBULE } from './decks/lobule.js';
import { SHUNTS } from './decks/shunts.js';
import { TIPS_DOPPLER } from './decks/tips-doppler.js';
import { CIRCUIT } from './decks/circuit.js';
import { DOPPLER } from './decks/doppler.js';
import { ENDOSCOPY } from './decks/endoscopy.js';
import { PREHEPATIC } from './decks/prehepatic.js';
import { BLEED } from './decks/variceal-bleed.js';
import { TWO_INFLOWS } from './decks/two-inflows.js';
import { NCPH } from './decks/ncph.js';
import { OUTFLOW } from './decks/outflow.js';
import { RECOMPENSATION } from './decks/recompensation.js';
import { WHERE } from './decks/where.js';
import { PREGNANCY_DECK } from './decks/pregnancy.js';
import { ENCEPHALOPATHY } from './decks/encephalopathy.js';
import { CAUSE_TREATED } from './decks/cause-treated.js';
import { NEXT_BLEED } from './decks/next-bleed.js';
import { GASTRIC } from './decks/gastric-varices.js';
import { HYPERDYNAMIC } from './decks/hyperdynamic.js';
import { CHOOSE_TREATMENT } from './decks/choose-treatment.js';
import { TEN_YEARS } from './decks/ten-years.js';
import { MESO_REX } from './decks/rex.js';
import { MASLD } from './decks/masld.js';
import { KIDNEY } from './decks/kidney.js';
import { TIPPING } from './decks/tipping.js';
import { DAY } from './decks/day.js';
import { LANDMARK_TRIALS } from './decks/landmark-trials.js';
import { CARVEDILOL } from './decks/carvedilol.js';
import { ALBUMIN_DECK } from './decks/albumin.js';
import { BUDD_CHIARI } from './decks/budd-chiari.js';
import { GRADIENTS } from './decks/gradients.js';

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
  bleed: [640, 60, 1030, 600],      // the lower esophagus down to the bottom of the stomach: the tear, the blood falling and the pool it makes
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
  const withResponse = (s) => (s.response && !s.compare ? { ...s, compare: responseButtons(s) } : s);   // (the beta-blocker response control: nsbb-response.js)
  const place = (s0) => { const s = withResponse(s0); const k = secs ? secs.findIndex(([, ks]) => ks.includes(s.kicker) || (s.id && ks.includes(s.id))) : -1; return k >= 0 ? { ...s, sec: [k + 1, secs.length] } : s; };
  const open = { id: 'outline', visual: 'outline', outline, objectives: d.objectives || [], kicker: d.title, title: 'Outline and objectives',
    notes: 'The outline of the talk and its learning objectives.',
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
  const name = SITE_TAGS[s.site];
  // (A kicker that already says the level, "Pre-hepatic" or "Intrahepatic · presinusoidal", is not said twice.)
  return name && !(s.kicker || '').toLowerCase().includes(name.toLowerCase()) ? { site: s.site === 'pvt' ? 'pre' : s.site, name } : null;
}

export const DECKS = [CIRCULATION, SITES, HVPG, ASCITES, VARICES, TREATMENT];

DECKS.push(STIFFNESS, CIRCUIT, LOBULE, SHUNTS);
DECKS.push(DOPPLER, ENDOSCOPY, TIPS_DOPPLER);
DECKS.push(PREHEPATIC, BLEED);
DECKS.push(TWO_INFLOWS, NCPH, OUTFLOW, RECOMPENSATION);
DECKS.push(WHERE);
DECKS.push(PREGNANCY_DECK);
DECKS.push(ENCEPHALOPATHY, CAUSE_TREATED);
DECKS.push(NEXT_BLEED);
DECKS.push(GASTRIC);
DECKS.push(HYPERDYNAMIC);
DECKS.push(CHOOSE_TREATMENT);
DECKS.push(TEN_YEARS);
DECKS.push(MESO_REX);
DECKS.push(MASLD);
DECKS.push(KIDNEY);
DECKS.push(TIPPING);
DECKS.push(DAY);
DECKS.push(LANDMARK_TRIALS);
DECKS.push(CARVEDILOL);
DECKS.push(ALBUMIN_DECK);
DECKS.push(BUDD_CHIARI);
DECKS.push(GRADIENTS);

// Old links and bookmarks: a talk that was merged into another, or renamed, still opens by its old id (?script=<old id>, a shared
// c/deck-<old id>.html page), at slide 1 of the deck that took its slides. The self-running tour became the Sites presentation, the
// bleeding lecture the treatment one, the refractory bleed the acute variceal bleed, blood volume the circulation in cirrhosis, propranolol or carvedilol lowering portal pressure, Read the Doppler the
// Doppler of the portal system, the portal vein clot in cirrhosis the portal vein clots talk, the right heart and the liver the one after the sinusoids, the first visit the stiffness one, A TIPS from start to finish the TIPS and shunts one, a year of compensated cirrhosis the first year of the ten-year patient, Paracentesis and albumin the ascites one, the spleen talk the stiffness one (its splenectomy slide lives in Gastric varices), Doppler after a liver transplant the Doppler one.
export const DECK_ALIAS = { 'where-block': 'sites', bleed: 'treatment', 'refractory-bleed': 'variceal-bleed', 'blood-volume': 'hyperdynamic', 'beta-blockers': 'treatment', 'read-doppler': 'doppler', 'pvt-cirrhosis': 'prehepatic', 'right-heart': 'outflow', 'tips-journey': 'shunts', 'first-visit': 'stiffness', 'one-year': 'ten-years', tap: 'ascites', spleen: 'stiffness', 'transplant-doppler': 'doppler' };

// The unified menu lists the eleven core presentations by topic, in teaching order, and the other twenty under "More talks", by topic
// order; search still finds all 31. Each has a short title (32 characters or fewer); the third name is the deck's short name in the tab
// at each slide card's top right corner (presenter.js deckTab; 20 or fewer).
export const TOPICS = [
  ['foundations', 'Foundations', [['circulation', 'The portal circulation', 'Circulation'], ['circuit', 'Portal pressure as a circuit', 'Circuit']]],
  ['causes', 'Causes', [['sites', 'Sites and causes', 'Sites and causes']]],
  ['measuring', 'Measuring', [['hvpg', 'Measuring HVPG and PPG', 'HVPG and PPG'], ['doppler', 'Doppler of the portal system', 'Doppler'], ['stiffness', 'Stiffness and the first visit', 'Stiffness']]],
  ['complications', 'Complications', [['varices', 'Collaterals and varices', 'Varices'], ['variceal-bleed', 'Acute variceal bleeding', 'Variceal bleed'], ['ascites', 'Ascites and its treatment', 'Ascites'], ['encephalopathy', 'Encephalopathy and shunting', 'Encephalopathy']]],
  ['treatment', 'Treatment', [['next-bleed', 'Preventing the next bleed', 'Next bleed']]],
  ['more', 'More talks', [
    ['two-inflows', 'Dual hepatic blood supply', 'Dual supply'], ['hyperdynamic', 'The circulation in cirrhosis', 'Hyperdynamic'],
    ['prehepatic', 'Portal vein thrombosis', 'PVT'], ['ncph', 'Presinusoidal PH', 'Presinusoidal PH'], ['outflow', 'Postsinusoidal and posthepatic', 'Postsinusoidal'], ['lobule', 'Inside the lobule', 'Lobule'], ['where-resistance', 'Where is the resistance?', 'Find the resistance'],
    ['endoscopy', 'The varix and insufflation', 'Insufflation'], ['gastric-varices', 'Gastric varices', 'Gastric varices'], ['recompensation', 'Decompensation and recovery', 'Recompensation'], ['pregnancy', 'Cirrhosis in pregnancy', 'Pregnancy'], ['ten-years', 'One patient, ten years', 'Ten years'], ['kidney', 'The kidney in cirrhosis', 'Kidney'], ['carvedilol', 'Carvedilol, start to finish', 'Carvedilol'], ['albumin', 'Albumin: when to give it', 'Albumin'], ['budd-chiari', 'Budd–Chiari syndrome', 'Budd–Chiari'],
    ['masld', 'MASLD and portal hypertension', 'MASLD'],
    ['treatment', 'Lowering portal pressure', 'Lowering pressure'], ['choose-treatment', 'Choose the treatment', 'Choose treatment'], ['cause-treated', 'Treating the cause', 'Treating the cause'], ['shunts', 'TIPS and shunts', 'TIPS and shunts'], ['tips-doppler', 'Doppler after TIPS', 'TIPS Doppler'],
    ['meso-rex', 'Pediatric PVT: Meso-Rex bypass', 'Rex bypass'],
    ['tipping', 'Precipitants of decompensation', 'Precipitants'],
    ['day', 'A day in the portal vein', 'Portal day'],
    ['landmark-trials', 'Landmark trials replayed', 'Landmark trials'],
    ['gradients', 'HVPG, PPG and EUS-PPG compared', 'Compare gradients']]],
];
for (const [topic, , list] of TOPICS) for (const [id, short, head] of list) { const d = DECKS.find((x) => x.id === id); if (d) Object.assign(d, { topic, short, head }); }
