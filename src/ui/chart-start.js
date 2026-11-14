// Where a days chart starts (the flow-time chart, tool { kind: 'flowtime', clock: 'days' }). A slide that changes the patient at once (a
// clot, a drug, a tap: params or an action, no ramp, no new patient) plays its days from the state the change leaves, so a chart drawn
// from the model's first day alone starts after the change, on the acute value: the Two lesions clot slide showed the PPG at 28 falling
// to 19 and the HVPG climbing, the opposite of what the slide teaches against the patient before (14 Nov 2026). The chart then starts
// at the readings of the state before the slide (drawn at day 0, the change a step at the very left), as view.since always did for a slide
// that named one. A slide with its own `view.since` keeps it; a ramp or a new patient (preset) has its own first day and needs none.
// Pure, so the presenter and the unit test read the same rule.

const MODEL = ['preset', 'presetDays', 'params', 'action', 'days'];

/** The slide's chart's lines at the state it starts from: { key: value } for the slide `i`, or null when the chart starts at its own first day.
 *  slides: the deck's slides; stateOf[i]: the index of the slide whose state slide i shows; states[k].fp: that state's readings. */
export function chartBefore(slides, stateOf, states, i) {
  const s = slides[i], t = s?.tool;
  if (!t || t.kind !== 'flowtime' || !t.lines) return null;
  let j = -1;
  if (t.view?.since) j = slides.findIndex((x, k) => k <= i && x.id === t.view.since);
  else if (t.clock === 'days' && i > 0 && stepChange(s)) j = i - 1;
  const fp = j >= 0 ? states[stateOf[j]]?.fp : null;
  return fp ? Object.fromEntries(t.lines.map((k) => [k, fp[k]])) : null;
}

/** Whether the slide changes the patient at once and then lets the days run (no ramp, no new patient). */
export function stepChange(s) {
  return MODEL.some((k) => s[k]) && !s.ramp && !s.preset && !s.lapse?.ramp && !!(s.params || s.action);
}
