// The healthy patient at the bedside, at rest: the model run with its beat and its breath until the shown readings (the means over a breath and a
// beat) have settled, once per page, from the same start the live model has.
//
// Why: the quiet settle every patient is loaded with has no beat and no breath, and the model with them sits a little higher in its venous side (the
// portal pressure about 0.3 mmHg, the right atrium 0.5; nonlinear compliance and the pump's filling pattern: the mean of a swing is not the settled
// value). The "Healthy" reference the page compares every reading with was the settled one while the live model, shown as means, climbed from it to
// the bedside's over its first minute: Healthy at rest read 7.9, then 8.1, with a resistance of 2.7 against a reference of 2.5 (16 Nov 2026). The
// reference is now this model's own rest, and the live model starts from it, so a healthy patient at rest holds still and equals its reference.

import { Engine } from './engine.js';

// (The means have settled by 40 s. 20 ms steps land within 0.02 mmHg of the bedside clock's 4 ms; coarser ones drift the baroreflex's slow state off by 0.06 mmHg and more.)
const RUNS = [[0.02, 40]];
let kept = null;

/** { eng, snap, P, Q }: a healthy model run at the bedside for 40 s (its readings are the shown means), its snapshot and its mean pressures and flows. Made once. */
export function healthyAtBedside() {
  if (!kept) {
    const eng = new Engine();
    for (const [dt, secs] of RUNS) for (let t = 0; t < secs - 1e-9; t += dt) eng.step(dt);
    kept = { eng, snap: eng.snapshot(), P: Float64Array.from(eng.Pf), Q: Float64Array.from(eng.Qf), vit: { COf: eng.COf, pvQm: eng.pvQm, pvVm: eng.pvVm, vitM: [...eng.vitM], vitM1: [...eng.vitM1] } };   // (and the means: a snapshot holds the instant's pressures, and the vitals' and the portal flow's averages start over from them)
  }
  return kept;
}

/** A new healthy model, standing at its bedside rest: the clock at zero, no events (as a load starts them over). */
export function restingEngine() {
  const e = new Engine();
  const h = healthyAtBedside();
  e.restore(h.snap);
  // (A restore keeps the instant's pressures and flows as the shown ones; the shown means start from the rest's, so a reading before the first step, and the means
  // that begin there, are the rest, not one phase of the beat.)
  e.P.set(h.P); e.Pf.set(h.P); e.Q.set(h.Q); e.Qf.set(h.Q);
  Object.assign(e, { ...h.vit, vitM: [...h.vit.vitM], vitM1: [...h.vit.vitM1] });   // (the vitals' two-breath averages, the cardiac output's filter and the portal flow's mean: engine.js relaxHidden takes the same)
  e.t = 0; e.day = 0;
  e.eventLog = []; e.newEvents = []; e.eventCount = 0;
  return e;
}
