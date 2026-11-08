// "Is the view moving?" answered once (implicit-state-machines.md M2). Every motion source feeds one pure test:
//   hand: a finger or mouse drag, a pinch (one or two pointers), a fling, a wheel zoom or a trackpad pinch (stage-gestures.js gestureOn)
//   glide: a camera glide (vtGliding), a presenter's move (camMove) or a change between the views still landing (viewXf)
//   panning: the one-finger pan's class, kept as a second witness of the hand
// The kept boxes of the callouts, probes and the scan are not read again while it is true. Before this, only the pan's class and the glides
// counted, so a pinch, a wheel zoom and a fling read their boxes every watch and a callout could re-place mid-gesture.
// (No runtime switch: rules-lint allows no new ones. `rec` false is the old test, kept for the unit test's table.)
// Pure: no DOM, no clock, no allocation. The labels keep their own predicates (stage-labels.js) until the labels thread folds them in.
// src: { glide(), cam(), view(), hand(), panning() } functions over the owner's own state; rec: false for the old test.
export function viewMovingOf(src, rec = true) {
  if (src.glide() || src.cam() || src.panning()) return true;
  return rec && (src.hand() || src.view());
}
