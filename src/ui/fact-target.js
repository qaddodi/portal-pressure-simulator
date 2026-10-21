// Treat › Changes › About this patient: where on the figure each preset fact is set, so its row can take you there
// (review U14). A key from activeInterventions (inspector.js) → a selection, or null when the fact lives elsewhere
// (a drug or diuretic is in the Treat card itself; tones and the arterial buffer are Advanced physiology). Pregnancy is
// on every heart card.

const ORGAN = {
  cirrhosis: 'liver', splenicRx: 'spleen', balloonEso: 'varices', balloonGas: 'gastric', C5: 'gastric',
  tr: 'heart', contractility: 'heart', pericardial: 'heart', gestation: 'heart',
};
const EDGE = { tips: 'TIPS', dips: 'DIPS', portocaval: 'S_PC', dsrs: 'S_DSR', mesocaval: 'S_MC', C6: 'C6', meal: 'A_SMA' };   // (a meal: the gut's artery it opens)

/** The selection a patient fact opens, or null. */
export function factTarget(key) {
  if (ORGAN[key]) return { type: 'organ', id: ORGAN[key] };
  if (EDGE[key]) return { type: 'edge', id: EDGE[key] };
  if (key.startsWith('fib:')) return { type: 'organ', id: 'liver' };
  const m = /^(sten|thr|occ|cs):(.+)$/.exec(key);
  return m ? { type: 'edge', id: m[2] } : null;
}
