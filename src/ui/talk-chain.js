// The talk so far, as the talk chart reads it: every state up to slide i, once each (moved out of presenter-question.js so a unit test can build the
// chain of every deck's slide and judge the chart's layout on it: tests/talk-fit.test.js).
// Each state carries its time point (the deck's days so far) and what happened there (the first tick among its slides, else its title),
// and its slide's id and its state's params (for a deck visuals package's chart).
// (since: a slide's id, the trace's tool.since: the chart starts at that slide's state and counts its days from there, so a
// deck that moves on to a new patient charts only that patient's course.)
import { traceWhen } from './trace-labels.js';

/** The time point of state k, its days counted from slide index f0 + 1: "Day 30", "Month 10", "Year 2". */
export function whenOf(slides, k, f0 = -1) {
  const d = slides.slice(f0 + 1, k + 1).reduce((a, s) => a + (s.days || 0), 0);
  return d && d % 365 === 0 ? `Year ${d / 365}` : d <= 200 ? `Day ${d}` : `Month ${Math.round(d / 30.4)}`;
}

/** slides: the deck's; stateOf[j]: the slide whose state slide j shows; states[k].fp / .params: that state's readings. → [{ n, title, tick, mile, when, day, fp, id, params }] */
export function talkChain(slides, stateOf, states, i, since) {
  let before = null;
  const f0 = since ? slides.findIndex((x, j) => j <= i && x.id === since) : -1, k0 = f0 >= 0 ? stateOf[f0] : -1;
  return [...new Set(stateOf.slice(0, i + 1))].filter((k) => k >= k0 && slides[k]?.visual !== 'outline').map((k) => {
    const w = whenOf(slides, k, k0);
    const p = {
      n: k + 1, title: slides[k].title, tick: slides.find((x, j) => stateOf[j] === k && x.tick)?.tick || slides[k].title,
      mile: slides.find((x, j) => stateOf[j] === k && x.milestone)?.milestone, when: traceWhen(slides[k].when, w, before), day: w,
      fp: states[k]?.fp, id: slides[k].id, params: states[k]?.params,
    };
    before = w;
    return p;
  });
}
