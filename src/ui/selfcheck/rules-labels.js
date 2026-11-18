// Self-check rules over the screen report's labels part (screen/read-labels.js), registered with the rules registry (selfcheck/rules.js). Each judges
// report.labels, a pure function of it. A rule asks only about labels at rest: while the stage says the labels are still moving (labels.settled === false:
// riding the camera, a solve running) a label under a card or off the edge is on its way, not wrong, and no rule judges it.
// Each rule has a test with a case that must fire and one that must not (tests/screen-rules.test.js).
import { LABEL_DIM } from '../screen/read-labels.js';
import { registerRule } from './rules.js';

const SOLVE = 'src/ui/stage-label-solve.js';
const at = (r) => `at ${r.box[0]},${r.box[1]}`;
const label = (r) => `Label "${r.text || r.key}" (${r.key})`;
const rest = (p) => !p || p.settled === false ? false : true;   // (null: the stage cannot say; the rule then judges)
const pct = (v) => `${Math.round(v * 100)}%`;
const shownRows = (p) => p.items.filter((r) => r.state !== 'hidden');

export const checks = {
  'label-under-card': ({ labels: p }) => (!rest(p) ? [] : shownRows(p).flatMap((r) => r.under.filter((u) => u.share >= 0.02).map((u) => ({ what: label(r), where: `${at(r)}, ${pct(u.share)} of it under the ${u.card}` })))),
  'label-off-screen': ({ labels: p }) => (!rest(p) ? [] : shownRows(p).filter((r) => r.off > 1).map((r) => ({ what: label(r), where: `${at(r)}, ${r.off} px past the stage's edge (${p.stage.w}×${p.stage.h})` }))),
  'label-overlap': ({ labels: p }) => {
    if (!rest(p)) return [];
    const seen = new Set(), out = [];
    for (const r of shownRows(p)) for (const k of r.overlaps) {
      const id = r.key < k ? `${r.key}|${k}` : `${k}|${r.key}`;
      if (seen.has(id)) continue; seen.add(id);
      const o = p.items.find((x) => x.key === k);
      if (!o || o.state === 'hidden') continue;
      out.push({ what: label(r), where: `${at(r)}, over "${o.text || o.key}" (${k}) at ${o.box[0]},${o.box[1]}`, sev: 'warn' });
    }
    return out;
  },
  'label-dim-alpha': ({ labels: p }) => {
    if (!rest(p)) return [];
    const out = [];
    for (const r of p.items) {
      if (r.state === 'hidden') continue;
      if (r.state === 'fading') out.push({ what: label(r), where: `${at(r)}, stuck at ${pct(r.alpha)} (neither ${pct(LABEL_DIM)} dim nor 100%) while nothing moves` });
      else if (r.dimmed && r.state !== 'dim') out.push({ what: label(r), where: `${at(r)}, stepped back by a slide but drawn at ${pct(r.alpha)}, not ${pct(LABEL_DIM)}` });
      else if (!r.dimmed && r.state === 'dim' && r.alphaFrom === 'gpu') out.push({ what: label(r), where: `${at(r)}, drawn at ${pct(r.alpha)} though no slide or explainer dimmed it` });
    }
    return out;
  },
  'label-detached': ({ labels: p }) => (!rest(p) ? [] : shownRows(p).filter((r) => r.detached).map((r) => ({ what: label(r), where: `${at(r)}, ${r.gap} px from its point with no leader`, sev: 'warn' }))),
  'label-clipped-by-canvas': ({ labels: p }) => (!p ? [] : shownRows(p).filter((r) => r.clipped).map((r) => ({ what: label(r), where: `${at(r)}, its picture runs past the label canvas`, sev: 'warn' }))),
};

const META = {
  'label-under-card': [SOLVE, 'Labels stay clear of every open card (Mohammad, 17 Nov 2026): a card never hides a name.'],
  'label-off-screen': [SOLVE, 'A label is whole on the stage: none stands past its edge.'],
  'label-overlap': [SOLVE, 'Two labels never lie over each other: the solver keeps a ring of spots so each can be read.'],
  'label-dim-alpha': ['src/ui/label-gl.js', `A label a slide or the explainer steps back sits at one dim, ${LABEL_DIM * 100}% (--label-dim, styles/tokens.css), in every place; a label at rest is 100% or that, never part way.`],
  'label-detached': ['src/ui/label-place.js', 'A label that stands apart from its point has a leader to it (label-place needsLeader: a gap over 12 px), so it is never a name floating free.'],
  'label-clipped-by-canvas': ['src/ui/label-gl.js', 'The GPU draws each label whole: its picture lies inside the label canvas.'],
};
for (const [id, [owner, why]] of Object.entries(META)) registerRule({ id, owner, why, kind: 'state', check: (report) => (report.labels ? checks[id](report) : []) });
