// Three kinds of slide change, three motions (first-principles item 14, 11 Nov 2026).
//   new patient   a slide that loads a preset: the figure dips in brightness, the patient is changed unseen, and the figure comes back as someone else
//                 (an eased opacity change of the figure layer, never a cut, never a morph between two people)
//   time passing  a slide with a time-lapse (lapse): its days play on the live figure, as built
//   same patient treated (params, an action, a procedure): the model eases to the slide's state, as before
// (lap: the slide plays its time-lapse; pre: it plays a procedure from the state before it. Both keep their own ways in.)
export function freshPatient(s, lap, pre) { return !!s?.preset && !lap && !pre; }
// Which of the three a slide change is, for tests and the talk's notes.
export function changeKind(s, lap, pre) {
  if (freshPatient(s, lap, pre)) return 'patient';
  if (lap || s?.lapse) return 'time';
  return s?.params || s?.action || s?.procedure ? 'treat' : 'same';
}
