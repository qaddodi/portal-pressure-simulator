// The gallery deck: every teaching-card specimen of the catalog as one slide of a deck the real presenter plays
// (Present > Testing on the preview copy; the ?gallery page opens the same slides one at a time). Pure data, no DOM.
// A specimen that no longer matches the slide format fails checkDeck in tests/gallery-coverage.test.js.

import { CATALOG, DECK_SECTIONS, sid } from './catalog.js';

export const FAMILY_NAME = {
  doppler: 'Doppler', trace: 'Pressure trace', vitals: 'Vital signs', hvpg: 'HVPG catheter', reading: 'Measurement monitor', fibroscan: 'FibroScan', scope: 'Endoscopy',
  abdomen: 'Abdomen', wall: 'Varix wall', lumen: 'Lumen', profile: 'Gut to heart', flowtime: 'Over time', curve: 'Curve', course: 'Course', flows: 'Flows', shift: 'Shift',
  menu: 'Treatment menu', stent: 'Stent', evgraph: 'Procedure graph', criteria: 'Criteria', trial: 'Trial', forest: 'Forest plot', saag: 'SAAG', fluid: 'Fluid balance',
  plane: 'Plane', visual: 'Panel', path: 'Flowchart', tiles: 'Readout tiles', teaching: 'Teaching card',
};

/** The slide a specimen becomes. `carry` leaves the preset out so the slide continues the patient before it. */
export function specimenSlide(e) {
  const { carry, ...f } = e.slide;
  const s = { id: sid(e.id), kicker: FAMILY_NAME[e.family] || e.family, title: e.title, line: `Gallery specimen ${e.id}.`, ...f };
  if (!carry && !s.preset) s.preset = 'healthy';
  if (!s.cam) s.cam = 'fit';
  return s;
}

/** The deck: sections from DECK_SECTIONS, slides in the catalog's order within each. */
export function galleryDeck(catalog = CATALOG) {
  const specs = catalog.filter((e) => e.kind === 'slide');
  const slides = [], sections = [];
  for (const [key, name] of DECK_SECTIONS) {
    const mine = specs.filter((e) => e.deck === key);
    if (!mine.length) continue;
    sections.push([name, mine.map((e) => sid(e.id))]);
    for (const e of mine) slides.push(specimenSlide(e));
  }
  return {
    id: 'gallery', level: 'advanced', title: 'Gallery: every card', minutes: Math.max(10, Math.round(slides.length / 2)),
    summary: 'Every data card, panel and teaching-card variant the presenter has, one slide each. Testing only.',
    objectives: ['See each card kind in its usual states', 'Compare a card across the five looks and every device size', 'Find the real slides that use a card'],
    checks: [
      ['Where does each slide of this deck come from?', 'From the gallery catalog, src/ui/gallery/catalog.js: one entry per specimen.'],
      ['What fails when a new card kind has no specimen?', 'The gallery coverage test, tests/gallery-coverage.test.js.'],
    ],
    sections, slides,
  };
}
