// The before / after scrub's plan (N9, scrub.js): which slides have one, and its words. Pure, so a test can read it with no page.

/** Whether slide i can be scrubbed, and between which slides' states: { ia, ib, from, to } (the slide whose state is 0 and the slide whose state is 1,
 *  and their names for the two ends), or null. Only a slide that says so (delta true or a slide id; lens 'since', its `since` or the slide before)
 *  and whose patient really differs from the one before; a time-lapse, a procedure or a catheter has a motion of its own. */
export function scrubSpec(slides, stateOf, i) {
  const s = slides[i];
  if (!s || s.visual || i < 1 || s.lapse || s.procedure || s.cath) return null;
  let ref = -1;
  if (typeof s.delta === 'string') ref = slides.findIndex((x, j) => j < i && x.id === s.delta);
  else if (s.delta === true) ref = i - 1;
  if (ref < 0 && s.lens === 'since') ref = s.since ? slides.findIndex((x, j) => j < i && x.id === s.since) : i - 1;
  if (ref < 0) return null;
  const ia = stateOf[ref], ib = stateOf[i];
  if (!(ia >= 0) || !(ib >= 0) || ia === ib) return null;
  const name = (x) => x.sinceLabel || x.kicker || x.tick || 'Before';
  return { ia, ib, from: s.sinceLabel || (ref === i - 1 ? 'Before' : name(slides[ref])), to: s.scrubLabel || 'This slide' };
}

/** The scrub's plan for the card-keep key: a card with a scrub is never kept for another slide's (each starts at 1). */
export const scrubKey = (sp, i) => (sp ? `${i}:${sp.ia}>${sp.ib}` : '');

/** The words at a place on the slider: the ends, or "n% of the way". */
export const scrubWords = (k, sp) => (k <= 0 ? sp.from : k >= 1 ? sp.to : `${Math.round(k * 100)}% of the way to this slide`);
