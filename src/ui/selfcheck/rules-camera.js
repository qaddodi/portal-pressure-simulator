// Self-check rules over the screen report's camera part (screen/read-camera.js). The path rules are slide-cam.js's own judge (judgeSlideMove, run by the
// reader on each recorded move), so the app, pps.cameraGate and these agree on what a bad move is. The two rules below the judge read the stage's move log.
// Unit tests with a firing and a quiet case: tests/screen-rules-camera.test.js.
import { isGlide } from '../screen/read-camera.js';
import { defineRule, finding } from './make-finding.js';

const SLIDE = 'src/ui/slide-cam.js';
const when = (t) => `${(t.at / 1000).toFixed(1)} s`;
/** The part of a failure's text that names the rule it belongs to, so a finding's id says what went wrong. */
const kindOf = (f) => (/second move after|second slide move/.test(f) ? 'camera-second-move' : /starts \d+ ms/.test(f) ? 'camera-late-start' : /jumps \d+%|goes back|turns back|overshoots|straight line|does not land/.test(f) ? 'camera-path' : 'camera-move');

export const cameraRules = [
  defineRule({
    id: 'camera-move-judged', on: 'camera', owner: SLIDE, sev: 'error',
    why: 'A slide move is one straight glide on one quintic curve: no turn back, no overshoot, lands on its plan, starts at once (slide-cam.js judgeSlideMove, the judge pps.cameraGate uses).',
    check: (p) => p.traces.flatMap((t) => t.fails.filter((f) => f !== 'no frames').map((f) => finding({
      rule: kindOf(f), what: `Slide camera move of ${t.ms} ms (${t.end})`, where: f, why: 'The slide camera is one straight glide (16 Nov 2026 rewrite)', owner: SLIDE, at: when(t) }))),
  }),
  defineRule({
    id: 'camera-refused-write', on: 'camera', owner: SLIDE, sev: 'warn',
    why: 'While a slide move runs the camera has one writer; another writer is refused and named, and should not have tried.',
    check: (p) => p.traces.filter((t) => t.blocked.length).map((t) => finding({
      rule: 'camera-refused-write', what: `Slide camera move of ${t.ms} ms`, where: `writes refused from ${t.blocked.join(', ')}`, why: 'One writer holds the camera during a slide move', owner: t.blocked.join(', '), at: when(t), sev: 'warn' })),
  }),
  defineRule({
    id: 'camera-two-moves-one-press', on: 'camera', owner: SLIDE, sev: 'error',
    why: 'One press is one move: a second slide move for the same press is a stop on the way (Mohammad, 18 Nov 2026: the camera zooms straight from any view to any view, no waypoint).',
    check: (p) => {
      const by = new Map(), out = [];
      for (const t of p.traces) if (t.press != null) (by.get(t.press) || by.set(t.press, []).get(t.press)).push(t);
      for (const list of by.values()) if (list.length > 1) out.push(finding({ rule: 'camera-two-moves-one-press', what: `${list.length} slide moves for one press`, where: list.map((t) => `${t.ms} ms at ${when(t)}`).join(', '), why: 'One press is one straight move', owner: SLIDE, at: when(list[1]) }));
      return out;
    },
  }),
  defineRule({
    id: 'camera-stop-between', on: 'camera', owner: 'src/ui/stage-glide.js', sev: 'warn',
    why: 'A glide that ends and another that begins a moment later, one after the other, is a stop at a waypoint (the fit) on the way between two views: the camera zooms straight from any view to any view (18 Nov 2026).',
    check: (p) => {
      const g = p.moves.filter(isGlide), out = [];
      for (let i = 1; i < g.length; i++) {
        const end = g[i - 1].at + g[i - 1].ms, gap = g[i].at - end;
        // (a gap of 0 to 400 ms: the first has landed, the second begins; an overlap (gap < 0) is one move taking over, the way a slide's things happen at once)
        if (gap >= 0 && gap <= 400 && g[i - 1].zoom > 0.05 && g[i].zoom > 0.05 && g[i].slide === g[i - 1].slide) out.push(finding({ rule: 'camera-stop-between', what: `Two glides in a row, ${g[i - 1].ms} ms then ${g[i].ms} ms`, where: `the second begins ${Math.round(gap)} ms after the first lands (zoom ${g[i - 1].zoom}, then ${g[i].zoom})`, why: 'The camera goes straight from view to view', owner: 'src/ui/stage-glide.js', at: `${(g[i].at / 1000).toFixed(1)} s`, sev: 'warn' }));
      }
      return out;
    },
  }),
];
