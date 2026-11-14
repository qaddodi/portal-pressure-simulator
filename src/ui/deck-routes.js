// Short routes through the longest decks (14 Nov 2026).
//
// A route is a chosen subset of one deck's slides, played in the deck's own order. It copies nothing: a route names slide ids, so the
// slides, their ids, the handout figures (brand/handout/<deck>/<slide id>.webp) and every old link stay as they are. The presenter
// offers the routes on the outline slide ("How long do you have?") and a link opens one with ?script=<deck>&route=<route id>.
//
//   id        the route's name in a link (?route=), unique in its deck
//   name      what the button says (32 characters or fewer)
//   about     one line under the name
//   slides    the slide ids on the route, in the deck's order. The outline and the quick check are always on it.
//   goals     which of the deck's objectives the route covers, as indexes (default: all of them)
//   checks    which of the deck's quick-check questions it asks, as indexes (default: all of them)
//   over      { slideId: { delta } }: where a slide's "since" ghost points on this route, when the slide it points at is not on it
//
// A route that drops a slide must not leave a slide that leans on it. tests/deck-routes.test.js fails a route whose slide points at a
// slide that is not on the route (a change ghost, a line value {x@id}, a table row, a chart's start) or reads the ghost of a state the
// listener never saw (a skipped slide that changes the patient between two slides on the route).

export const ROUTES = {
  ascites: [
    { id: 'forms', name: 'Mechanism and paracentesis',
      about: 'Sinusoidal pressure and lymph, then the SAAG and the ascitic protein.',
      slides: ['start', 'fill', 'saag', 'walls', 'hf', 'bc', 'map'], goals: [0, 1], checks: [0, 1] },
    { id: 'treat', name: 'Treating ascites',
      about: 'Tense ascites, LVP with albumin, diuretics, refractory ascites and TIPS.',
      slides: ['tense', 'lvp', 'back', 'diuretics', 'refractory', 'path-asc', 'tips', 'relation', 'summary'], goals: [2, 3], checks: [2, 3, 4] },
  ],
  'ten-years': [
    { id: 'turning', name: 'The turning points',
      about: 'Year 0 to the transplant evaluation: carvedilol, ascites, the bleed, TIPS and encephalopathy.',
      slides: ['d0', 'd90', 'ascites', 'bleed', 'bands', 'rebleed', 'tips', 'he', 'he-answer', 'list'],
      over: { ascites: { delta: 'd90' }, bleed: { delta: 'ascites' } } },
  ],
  prehepatic: [
    { id: 'short', name: 'The short version',
      about: 'One slide for each idea, with and without cirrhosis.',
      slides: ['clot', 'cath', 'anticoag', 'cavernoma', 'base', 'gradients', 'carv', 'pvt-anticoag'] },
    { id: 'acute', name: 'PVT without cirrhosis',
      about: 'The acute clot, recanalization on anticoagulation, then the cavernoma.',
      slides: ['clot', 'cath', 'anticoag', 'anticoag-lumen', 'cavernoma', 'liver', 'relation'], goals: [0, 1, 2], checks: [0, 1, 3] },
    { id: 'cirrhosis', name: 'PVT in cirrhosis',
      about: 'The HVPG stays flat, and anticoagulation starts without delay.',
      slides: ['base', 'gradients', 'carv', 'untreated', 'pvt-anticoag', 'pvt-anticoag-lumen', 'course'], goals: [1, 3], checks: [0, 1, 2] },
  ],
  'variceal-bleed': [
    { id: 'first', name: 'The first bleed',
      about: 'Shock, drugs and transfusion, banding, then the preemptive TIPS.',
      slides: ['before', 'tear', 'minutes', 'oct', 'blood', 'band', 'path', 'tips'], checks: [0, 1, 2] },
    { id: 'fails', name: 'When the bleeding comes back',
      about: 'Treatment failure, the covered stent or balloon as a bridge, and the rescue TIPS.',
      slides: ['controlled', 'rebleed', 'failure', 'path2', 'bridge', 'rescue'], goals: [3], checks: [3] },
  ],
};

/** The routes of a built-in deck (a script of the instructor's has none). */
export const routesOf = (d) => (d && !d.mine && ROUTES[d.id]) || [];
export const routeOf = (d, id) => (id ? routesOf(d).find((r) => r.id === id) || null : null);

/** Slides a talk shows: the outline and the quick check count, as the presenter's counter does. */
const extras = (d) => 1 + (d.checks?.length ? 1 : 0);
export const wholeSize = (d) => d.slides.length + extras(d);
export const routeSize = (d, r) => r.slides.length + extras(d);
/** About how long: the deck's minutes in proportion to the slides it keeps (at least 1). */
export const routeMinutes = (d, r) => Math.max(1, Math.round((d.minutes || 0) * routeSize(d, r) / wholeSize(d)));

/** What the outline slide lists: the whole talk first, then each route. */
export function routeChoices(d) {
  const rs = routesOf(d);
  if (!rs.length) return null;
  return [{ id: '', name: 'The whole talk', about: '', n: wholeSize(d), minutes: d.minutes || 0 },
    ...rs.map((r) => ({ id: r.id, name: r.name, about: r.about, n: routeSize(d, r), minutes: routeMinutes(d, r) }))];
}

/** The indexes of a route's slides in the presenter's slide list (outline first, quick check last), in order. */
export function routeIndices(slides, route) {
  const on = new Set(route.slides);
  return slides.flatMap((s, i) => (s.visual === 'outline' || s.visual === 'check' || on.has(s.id) ? [i] : []));
}

/** The first index on the route at or after i (the last one when none follows): a link to a slide the route skips opens the next one. */
export const routeAtOrAfter = (keep, i) => keep.find((k) => k >= i) ?? keep[keep.length - 1];
