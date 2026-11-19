// The paths the phone check walks (19 Nov 2026; "a script to run on my phone that finds everything", then "too slow"). Pure data, no DOM, no page import except the
// catalog and the deck list: the on-device runner (walk.js, walk-exec.js, phone-check-panel.js) and any Node rig (tests/gpu-journey.js, the headless layout
// sweep) read the same list and bring their own executor. A journey is what a person does in one sitting: it starts from the bare figure, never closes the card
// it opened between steps (a Tests pane is changed with the card open, a structure card by tapping the next vessel), and ends by putting everything away so the
// runner can see what the page kept.
//
// journey  { id, title, priority, steps: [step] }        priority: 1 is walked first (the crash paths), higher later; the runner drops the tail when time is up
// step     { op, label, judge?, ...fields }               judge: false = a stop on the way (a camera move between two views): memory is read, nothing else judged
//   { op: 'preset', id }                  a patient (pps.loadPreset)
//   { op: 'view', to }                    'anatomy' | 'circuit' | 'lobule' | 'sinusoid', through the stage's own call (camera-grid.js appMove)
//   { op: 'pane', pane }                  the Tests card on that pane, the card left open (pps.dock.show)
//   { op: 'camera', k, x, y, ms? }        the camera to a world position (stage.setCamera): the catheter-tip zoom the iPhone's 304 MB reading was taken at
//   { op: 'organ', organ }                FibroScan's organ buttons
//   { op: 'pick', sel, details? }         a tap on a structure (pps.store selection); details taps the card's name
//   { op: 'clear' }                       everything put away (Escape, selection, dock, compare)
//   { op: 'slide', deck, at }             a talk on slide `at` (0 is the outline, as pps.presenter.start takes it): opened when none is, a jump when one is
//   { op: 'talk-end' }                    the talk closed
//   maxShare (any step)                   this step's own gate: the share of the envelope it must stay under (the node path walker's: tip zoom with a pane open 75%)
//   { op: 'entry', id }                   a gallery specimen (pps.gallery.open): a teaching card of one family, as the gallery deck plays it
import { CATALOG } from './catalog.js';
import { DECKS, withOverview } from '../decks.js';
import { procedureSlides } from './benches/procedures.js';

/** The twelve moves between the four views, as one walk of 12 steps (every ordered pair once). */
export const VIEW_ROUTE = Object.freeze(['circuit', 'lobule', 'sinusoid', 'anatomy', 'lobule', 'circuit', 'anatomy', 'sinusoid', 'circuit', 'sinusoid', 'lobule', 'anatomy']);
/** The Tests card's panes in the dock's order, and the order of a person going back through them. */
export const PANES = Object.freeze(['profile', 'scope', 'hvpg', 'doppler', 'endoscopy', 'abdomen', 'fibroscan', 'readouts', 'trials']);
export const HVPG_PAIR = Object.freeze({ deck: 'hvpg', from: 5, to: 6, cycles: 4 });   // (the slide numbers the presenter shows: the outline is 1)
export const DECKS_PER_JOURNEY = 8;                                                      // (deck spots are cut into journeys of this many decks, so the time limit can drop the tail)

const S = (op, label, o = {}) => ({ op, label, ...o });
const NAME = { anatomy: 'Anatomy', circuit: 'Circuit', lobule: 'Lobule', sinusoid: 'Sinusoid' };

/** How much GPU a slide asks for, by what it puts up: instruments, a procedure, the catheter, the lobule. Higher is heavier. Pure. */
export function heaviness(slide) {
  if (!slide) return 0;
  let w = 0;
  const kind = slide.tool && typeof slide.tool === 'object' ? slide.tool.kind : slide.tool;
  if (kind) w += { doppler: 4, hvpg: 3, stent: 4, lumen: 3, scope: 4, fibroscan: 3, wall: 3, abdomen: 3, reading: 2, trace: 2, profile: 2, curve: 2, flowtime: 2 }[kind] ?? 1;
  if (slide.procedure) w += 4;
  if (slide.cath || slide.tool?.catheter) w += 3;
  if (/^(lobule|sinusoid)/.test(String(slide.cam || '')) || slide.view === 'lobule' || slide.view === 'sinusoid') w += 3;
  if (slide.scales) w += 1;
  if (slide.lapse || slide.ramp) w += 1;
  if (slide.data === 'tiles') w += 1;
  if (slide.visual && slide.visual !== 'outline') w += 1;
  return w;
}

/** The two slides of a deck that put the most on the screen, as presenter indexes (the outline is 0): the heaviest slide and the one after it. null for an empty deck. */
export function heaviestPair(deck) {
  const slides = withOverview(deck)?.slides;
  if (!slides?.length) return null;
  let best = 1, w = -1;
  for (let i = 1; i < slides.length; i++) { const h = heaviness(slides[i]); if (h > w) { w = h; best = i; } }
  const at = Math.min(best, Math.max(1, slides.length - 2));   // (room for the slide after it; a one-slide deck sits on its only slide)
  return slides.length > 2 ? [at, at + 1] : [Math.min(1, slides.length - 1)];
}

function viewsJourney() {
  const steps = [S('preset', 'Patient: decompensated cirrhosis', { id: 'cirr-decomp', judge: false }), S('view', `Start in ${NAME.anatomy}`, { to: 'anatomy', judge: false })];
  let at = 'anatomy';
  for (const to of VIEW_ROUTE) { steps.push(S('view', `${NAME[at]} to ${NAME[to]}`, { to, from: at, judge: to === 'anatomy' || to === 'circuit' })); at = to; }
  return { id: 'views', title: 'Views: every move between the four', priority: 1, steps };
}

function panesJourney() {
  const steps = [S('clear', 'Start from the bare figure', { judge: false }), S('view', 'Anatomy', { to: 'anatomy', judge: false }), S('preset', 'Patient: CSPH', { id: 'csph', judge: false })];
  for (const p of PANES) steps.push(S('pane', `Tests card: ${p}`, { pane: p }));
  // (The crash of 18 Nov: Tests card on the IR pane of a TIPS patient, then Doppler.)
  steps.push(S('preset', 'Patient: decompensated cirrhosis with a TIPS', { id: 'cirr-decomp-tips', judge: false }));
  for (const p of ['hvpg', 'doppler', 'profile', 'hvpg', 'doppler']) steps.push(S('pane', `Tests card, TIPS patient: ${p}`, { pane: p }));
  steps.push(S('preset', 'Patient: decompensated cirrhosis', { id: 'cirr-decomp', judge: false }));
  for (const p of [...PANES].reverse()) steps.push(S('pane', `Tests card, back through: ${p}`, { pane: p }));
  steps.push(S('organ', 'FibroScan: spleen', { organ: 'spleen', judge: false }));
  steps.push(S('clear', 'Close the Tests card', { judge: false }));
  return { id: 'panes', title: 'Tests card: every pane in a row, in Anatomy', priority: 1, steps };
}

/** The catheter-tip zoom (the camera the 18 Nov bug packet was taken at: k 4, x -1500, y -330) with the IR pane open, then into the lobule from there and back. */
export const TIP_CAMERA = Object.freeze({ k: 4, x: -1500, y: -330 });
function tipJourney() {
  const steps = [S('clear', 'Start from the bare figure', { judge: false }), S('view', 'Anatomy', { to: 'anatomy', judge: false }), S('preset', 'Patient: CSPH', { id: 'csph', judge: false }),
    S('pane', 'Tests card: IR (HVPG)', { pane: 'hvpg' }), S('camera', 'Zoomed close on the catheter tip, IR pane open', { ...TIP_CAMERA, maxShare: 0.75 }),
    S('pane', 'Tip zoom, Doppler pane', { pane: 'doppler', maxShare: 0.75 }), S('pane', 'Tip zoom, IR pane again', { pane: 'hvpg', maxShare: 0.75 }),
    S('view', 'From the tip zoom into the Lobule', { to: 'lobule', from: 'anatomy' }), S('view', 'Back to Anatomy', { to: 'anatomy', from: 'lobule' }), S('clear', 'Close the Tests card', { judge: false })];
  return { id: 'tip-zoom', title: 'Catheter-tip zoom with the IR pane open, then into the lobule', priority: 1, steps };
}

function structureJourneys(catalog) {
  const picks = catalog.filter((e) => e.kind === 'pick' && !e.details);
  const anat = picks.filter((e) => (e.view || 'anatomic') !== 'lobule'), lob = picks.filter((e) => e.view === 'lobule');
  const out = [];
  const walk = (list, view) => {
    const steps = [S('clear', 'Start from the bare figure', { judge: false }), S('view', NAME[view], { to: view, judge: false })];
    let preset = null;
    for (const e of list) {
      if (e.preset && e.preset !== preset) { preset = e.preset; steps.push(S('preset', `Patient: ${e.preset}`, { id: e.preset, judge: false })); }
      steps.push(S('pick', e.title, { sel: e.sel, id: e.id }));
      if (/^structure\/(tips|organ-liver|portal-vein)$/.test(e.id)) steps.push(S('pick', `${e.title}, Details face`, { sel: e.sel, details: true, id: `${e.id}-details` }));
    }
    steps.push(S('clear', 'Close the card', { judge: false }));
    return steps;
  };
  if (anat.length) out.push({ id: 'structure', title: 'Structure cards: tap one vessel or organ after another', priority: 2, steps: walk(anat, 'anatomy') });
  if (lob.length) out.push({ id: 'structure-lobule', title: 'Structure cards: the lobule\'s parts, one after another', priority: 2, steps: walk(lob, 'lobule') });
  return out;
}

function hvpgJourney(decks) {
  const d = decks.find((x) => x.id === HVPG_PAIR.deck);
  if (!d) return null;
  const a = HVPG_PAIR.from - 1, b = HVPG_PAIR.to - 1, steps = [S('clear', 'Start from the bare figure', { judge: false })];
  for (let c = 1; c <= HVPG_PAIR.cycles; c++) {
    steps.push(S('slide', `HVPG deck, slide ${HVPG_PAIR.from}${c > 1 ? ` (again, ${c})` : ''}`, { deck: d.id, at: a }));
    steps.push(S('slide', `HVPG deck, slide ${HVPG_PAIR.to}${c > 1 ? ` (again, ${c})` : ''}`, { deck: d.id, at: b }));
  }
  steps.push(S('talk-end', 'Close the talk', { judge: false }));
  return { id: 'hvpg-5-6', title: `HVPG deck: slide ${HVPG_PAIR.from} to ${HVPG_PAIR.to} and back, ${HVPG_PAIR.cycles} times`, priority: 1, steps };
}

function procedureJourney(decks) {
  const steps = [S('clear', 'Start from the bare figure', { judge: false })];
  const have = new Set(decks.map((d) => d.id));
  for (const g of procedureSlides(decks)) {
    const picked = new Map();
    for (const e of g.entries) { if (!have.has(e.deckId)) continue; const l = picked.get(e.deckId) || []; if (l.length < 2) l.push(e); picked.set(e.deckId, l); }
    let n = 0;
    for (const l of picked.values()) {
      for (const e of l) steps.push(S('slide', `${g.label}: ${e.deckTitle}, slide ${e.index + 1}`, { deck: e.deckId, at: e.index }));
      steps.push(S('talk-end', 'Close the talk', { judge: false }));
      if (++n >= 2) break;
    }
  }
  return steps.length > 1 ? { id: 'procedures', title: 'Procedure slides: TIPS, BRTO, BATO, EUS, Meso-Rex, the catheter', priority: 2, steps } : null;
}

function deckJourneys(decks) {
  const spots = [];
  for (const d of decks) { const p = heaviestPair(d); if (p) spots.push({ d, p }); }
  const out = [];
  for (let i = 0; i < spots.length; i += DECKS_PER_JOURNEY) {
    const chunk = spots.slice(i, i + DECKS_PER_JOURNEY);
    const steps = [S('clear', 'Start from the bare figure', { judge: false })];
    for (const { d, p } of chunk) {
      for (const at of p) steps.push(S('slide', `${d.title || d.id}, slide ${at + 1}`, { deck: d.id, at }));
      steps.push(S('talk-end', 'Close the talk', { judge: false }));
    }
    const n = out.length + 1;
    out.push({ id: `decks-${n}`, title: `Decks, heaviest two slides of each (${n} of ${Math.ceil(spots.length / DECKS_PER_JOURNEY)})`, priority: 3, steps });
  }
  return out;
}

function tourJourney(catalog) {
  const seen = new Set(), steps = [S('clear', 'Start from the bare figure', { judge: false })];
  for (const e of catalog) {
    if (e.kind !== 'slide' || seen.has(e.family)) continue;
    seen.add(e.family);
    steps.push(S('entry', `Card family ${e.family}: ${e.title}`, { id: e.id }));
  }
  steps.push(S('clear', 'Close everything', { judge: false }));
  return seen.size ? { id: 'tour', title: 'One card of every teaching-card family', priority: 4, steps } : null;
}

/** Every journey, in the order they are walked (priority, then the order here). Each call builds fresh objects. */
export function buildJourneys({ catalog = CATALOG, decks = DECKS } = {}) {
  const list = [viewsJourney(), panesJourney(), tipJourney(), hvpgJourney(decks), ...structureJourneys(catalog), procedureJourney(decks), ...deckJourneys(decks), tourJourney(catalog)].filter(Boolean);
  return list.map((j, i) => ({ ...j, order: i })).sort((a, b) => a.priority - b.priority || a.order - b.order).map(({ order, ...j }) => j);
}

/** The steps in all journeys. */
export const stepCount = (journeys) => journeys.reduce((n, j) => n + j.steps.length, 0);
