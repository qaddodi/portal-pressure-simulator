// Self-check rules over the screen report's labels part (screen/read-labels.js). Each is a pure function of that part: it says the rule, what and where,
// why the rule exists, and the file that owns the fix. A rule asks only about labels at rest: while the stage says the labels are still moving
// (part.settled === false: riding the camera, a solve running) a label under a card or off the edge is on its way, not wrong, and no rule judges it.
// Each rule has a unit test with a case that must fire and one that must not (tests/screen-rules-labels.test.js).
import { LABEL_DIM } from '../screen/read-labels.js';
import { defineRule, finding } from './make-finding.js';

const SOLVE = 'src/ui/stage-label-solve.js';
const at = (r) => `at ${r.box[0]},${r.box[1]}`;
const label = (r) => `Label "${r.text || r.key}" (${r.key})`;
const rest = (p) => p.settled !== false;   // (null: the stage cannot say; the rule then judges)
const pct = (v) => `${Math.round(v * 100)}%`;
const shownRows = (p) => p.items.filter((r) => r.state !== 'hidden');

export const labelRules = [
  defineRule({
    id: 'label-under-card', on: 'labels', owner: SOLVE, sev: 'error',
    why: 'Labels stay clear of every open card (Mohammad, 17 Nov 2026): a card never hides a name.',
    check: (p) => (!rest(p) ? [] : shownRows(p).flatMap((r) => r.under.filter((u) => u.share >= 0.02).map((u) => finding({
      rule: 'label-under-card', what: label(r), where: `${at(r)}, ${pct(u.share)} of it under the ${u.card}`,
      why: 'Labels stay clear of every open card (17 Nov 2026)', owner: SOLVE })))),
  }),
  defineRule({
    id: 'label-off-screen', on: 'labels', owner: SOLVE, sev: 'error',
    why: 'A label is whole on the stage: none stands past its edge.',
    check: (p) => (!rest(p) ? [] : shownRows(p).filter((r) => r.off > 1).map((r) => finding({
      rule: 'label-off-screen', what: label(r), where: `${at(r)}, ${r.off} px past the stage's edge (${p.stage.w}×${p.stage.h})`,
      why: 'A label is whole on the stage', owner: SOLVE }))),
  }),
  defineRule({
    id: 'label-overlap', on: 'labels', owner: SOLVE, sev: 'warn',
    why: 'Two labels never lie over each other: the solver keeps a ring of spots so each can be read.',
    check: (p) => {
      if (!rest(p)) return [];
      const seen = new Set(), out = [];
      for (const r of shownRows(p)) for (const k of r.overlaps) {
        const id = r.key < k ? `${r.key}|${k}` : `${k}|${r.key}`;
        if (seen.has(id)) continue; seen.add(id);
        const o = p.items.find((x) => x.key === k);
        if (!o || o.state === 'hidden') continue;
        out.push(finding({ rule: 'label-overlap', what: label(r), where: `${at(r)}, over "${o.text || o.key}" (${k}) at ${o.box[0]},${o.box[1]}`, why: 'Two labels never lie over each other', owner: SOLVE, sev: 'warn' }));
      }
      return out;
    },
  }),
  defineRule({
    id: 'label-dim-alpha', on: 'labels', owner: 'src/ui/label-gl.js', sev: 'error',
    why: `A label a slide or the explainer steps back sits at one dim, ${LABEL_DIM * 100}% (--label-dim, styles/tokens.css), in every place; a label at rest is 100% or that, never part way.`,
    check: (p) => {
      if (!rest(p)) return [];
      const out = [];
      for (const r of p.items) {
        if (r.state === 'hidden') continue;
        if (r.state === 'fading') out.push(finding({ rule: 'label-dim-alpha', what: label(r), where: `${at(r)}, stuck at ${pct(r.alpha)} (neither ${pct(LABEL_DIM)} dim nor 100%) while nothing moves`, why: 'A label at rest is shown or dim, never part way', owner: 'src/ui/label-gl.js' }));
        else if (r.dimmed && r.state !== 'dim') out.push(finding({ rule: 'label-dim-alpha', what: label(r), where: `${at(r)}, stepped back by a slide but drawn at ${pct(r.alpha)}, not ${pct(LABEL_DIM)}`, why: 'The dim is one alpha in one place (--label-dim)', owner: 'styles/tokens.css --label-dim, src/ui/label-gl.js' }));
        else if (!r.dimmed && r.state === 'dim' && r.alphaFrom === 'gpu') out.push(finding({ rule: 'label-dim-alpha', what: label(r), where: `${at(r)}, drawn at ${pct(r.alpha)} though no slide or explainer dimmed it`, why: 'Only a slide or the explainer dims a label', owner: 'src/ui/label-gl.js' }));
      }
      return out;
    },
  }),
  defineRule({
    id: 'label-detached', on: 'labels', owner: 'src/ui/label-place.js', sev: 'warn',
    why: 'A label that stands apart from its point has a leader to it (label-place needsLeader: a gap over 12 px), so it is never a name floating free.',
    check: (p) => (!rest(p) ? [] : shownRows(p).filter((r) => r.detached).map((r) => finding({
      rule: 'label-detached', what: label(r), where: `${at(r)}, ${r.gap} px from its point with no leader`, why: 'A label apart from its point has a leader', owner: 'src/ui/label-place.js needsLeader, src/ui/stage-label-layer.js', sev: 'warn' }))),
  }),
  defineRule({
    id: 'label-clipped-by-canvas', on: 'labels', owner: 'src/ui/label-gl.js', sev: 'warn',
    why: 'The GPU draws each label whole: its picture lies inside the label canvas.',
    check: (p) => shownRows(p).filter((r) => r.clipped).map((r) => finding({
      rule: 'label-clipped-by-canvas', what: label(r), where: `${at(r)}, its picture runs past the label canvas`, why: 'Each label is drawn whole', owner: 'src/ui/label-gl.js', sev: 'warn' })),
  }),
];
