// Self-check rules over the screen report's camera part (screen/read-camera.js). The path rules are slide-cam.js's own judge (judgeSlideMove, run by the
// reader on each recorded move), so the app, pps.cameraGate and these agree on what a bad move is: the judge's failures are sorted into four rules by
// what they say. The last three read the stage's move log. Tests with a firing and a quiet case: tests/screen-rules.test.js.
import { isGlide } from '../screen/read-camera.js';
import { registerRule } from './rules.js';

const SLIDE = 'src/ui/slide-cam.js';
const when = (t) => `${(t.at / 1000).toFixed(1)} s`;
const PATH = /jumps \d+(\.\d+)?%|goes back|turns back|overshoots|straight line|does not land|changes on a move/;
const LATE = /starts \d+ ms/;
const SECOND = /second move after|second slide move/;
/** The judge's failures, each with its move. */
const judged = (p) => p.traces.flatMap((t) => t.fails.filter((f) => f !== 'no frames').map((f) => ({ t, f })));

export const checks = {
  'camera-path': ({ camera: p }) => judged(p).filter(({ f }) => PATH.test(f)).map(({ t, f }) => ({ what: `Slide camera move of ${t.ms} ms (${t.end})`, where: f, at: when(t) })),
  'camera-late-start': ({ camera: p }) => judged(p).filter(({ f }) => LATE.test(f)).map(({ t, f }) => ({ what: `Slide camera move of ${t.ms} ms (${t.end})`, where: f, at: when(t), sev: 'warn' })),
  'camera-second-move': ({ camera: p }) => judged(p).filter(({ f }) => SECOND.test(f)).map(({ t, f }) => ({ what: `Slide camera move of ${t.ms} ms (${t.end})`, where: f, at: when(t) })),
  'camera-refused-write': ({ camera: p }) => p.traces.filter((t) => t.blocked.length).map((t) => ({ what: `Slide camera move of ${t.ms} ms`, where: `writes refused from ${t.blocked.join(', ')}`, at: when(t), sev: 'warn' })),
  'camera-two-moves-one-press': ({ camera: p }) => {
    const by = new Map(), out = [];
    for (const t of p.traces) if (t.press != null) (by.get(t.press) || by.set(t.press, []).get(t.press)).push(t);
    for (const list of by.values()) if (list.length > 1) out.push({ what: `${list.length} slide moves for one press`, where: list.map((t) => `${t.ms} ms at ${when(t)}`).join(', '), at: when(list[1]) });
    return out;
  },
  'camera-stop-between': ({ camera: p }) => {
    const g = p.moves.filter(isGlide), out = [];
    for (let i = 1; i < g.length; i++) {
      const end = g[i - 1].at + g[i - 1].ms, gap = g[i].at - end;
      // (a gap of 0 to 400 ms: the first has landed, the second begins; an overlap (gap < 0) is one move taking over, the way a slide's things happen at once)
      if (gap >= 0 && gap <= 400 && g[i - 1].zoom > 0.05 && g[i].zoom > 0.05 && g[i].slide === g[i - 1].slide) out.push({ what: `Two glides in a row, ${g[i - 1].ms} ms then ${g[i].ms} ms`, where: `the second begins ${Math.round(gap)} ms after the first lands (zoom ${g[i - 1].zoom}, then ${g[i].zoom})`, at: `${(g[i].at / 1000).toFixed(1)} s`, sev: 'warn' });
    }
    return out;
  },
};

const META = {
  'camera-path': [SLIDE, 'A slide move is one straight glide on one quintic curve: no turn back, no overshoot, no jump, lands on its plan (slide-cam.js judgeSlideMove, the judge pps.cameraGate uses).'],
  'camera-late-start': [SLIDE, 'A slide move starts at once: within 120 ms of the ask and 900 ms of the press (judgeSlideMove). Untimed in a hidden or throttled page.'],
  'camera-second-move': [SLIDE, 'One slide change is one move: no glide after the landing (a refit with a different framing means the plan\'s framing was wrong).'],
  'camera-refused-write': [SLIDE, 'While a slide move runs the camera has one writer; another writer is refused and named, and should not have tried.'],
  'camera-two-moves-one-press': [SLIDE, 'One press is one move: a second slide move for the same press is a stop on the way (Mohammad, 18 Nov 2026: the camera zooms straight from any view to any view, no waypoint).'],
  'camera-stop-between': ['src/ui/stage-glide.js', 'A glide that ends and another that begins a moment later is a stop at a waypoint (the fit) on the way between two views: the camera zooms straight from any view to any view (18 Nov 2026).'],
};
for (const [id, [owner, why]] of Object.entries(META)) registerRule({ id, owner, why, kind: 'state', check: (report) => (report.camera ? checks[id](report) : []) });
