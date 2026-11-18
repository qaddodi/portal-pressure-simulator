// Starting a procedure or a measurement from a card while the lobule or the sinusoid is open (free use, not a slide): the way out lands on the run's first shot
// in the one zoom, never on the whole figure first and then the camera in (Mohammad, 18 Nov 2026: "we have to be able to zoom from anywhere to anywhere between
// views"). Slides do the same through presenter toAnatomy (cathRise, procRise); this is the four cards' one write of the view, R08.
import { store, setViewKey } from './store.js';
import { procFirstShot } from './proc-anim.js';

/** The anatomy for a run whose camera opens with `shot` ({ shot, route, opt } as procFirstShot answers, or a procedure kind's name). */
export function leaveFor(stage, shot) {
  const st = store.get(), f = typeof shot === 'string' ? procFirstShot(shot) : shot;
  if (st.lobule && f && stage?.riseToVT && stage.cathShot) stage.riseToVT(() => stage.cathShot(f.shot, { ...f.opt, route: f.route }));
  if (st.lobule || st.view !== 'anatomic') setViewKey('anatomy');   // (one legal write: the lobule and the sinusoid close and the view is the anatomy, R08)
}
