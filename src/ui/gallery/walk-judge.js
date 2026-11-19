// The judges the Phone check runs at each stop (walk-exec.js re-exports them). Pure: no page, so tests/gallery-walk.test.js loads it in node.

/** The judges at a stop: the shared fit rules (pps.gallery.check, which parks the Shuffle before it reads) and the self-check rules over pps.screen (docs/screen-report.md). Each is optional.
 *  One judge per question: the screen report's own `fit-*` findings are left out here, because pps.gallery.check() is the same judging (fit-rules.js) of the same cards and a stop would otherwise
 *  list every fit problem twice (B2 of the 19 Nov review). Every other rule family comes from the screen report. */
export async function judgeHere(pps, api) {
  const out = { problems: [], findings: [] };
  try { out.problems = api?.check?.().problems || []; } catch { /* (no card up: nothing to fit) */ }
  try { const r = await pps?.screen?.({ detail: 'summary' }); out.findings = (r?.findings || []).filter((f) => !(api?.check && isFitRule(f.rule))); } catch { /* (the report part that failed is in the report's own errors) */ }
  return out;
}
/** A `fit-*` rule of the registry (rules-fit.js): the family pps.gallery.check() judges too. Without a gallery check at hand (api.check) the screen's fit findings stay. */
export const isFitRule = (rule) => /^fit-/.test(String(rule || ''));
