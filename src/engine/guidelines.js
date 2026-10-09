// Guideline lens (next-level blueprint E2): places the patient on the Baveno VII rules, with AASLD 2024
// where it says the same thing or words it differently, using only readings the dock already shows
// (liver stiffness, platelets, HVPG, varices, ascites, bleeding). Pure: no DOM, so it can be tested.
// Illustrative and read from the model, never patient advice.

const B7 = 'Baveno VII', AASLD = 'AASLD 2024';

// The rules as About the model lists them: [topic, criterion, sources].
export const GUIDE_TABLE = [
  ['Advanced chronic liver disease (cACLD)', 'Rule of five: liver stiffness < 10 kPa rules it out; 10–15 kPa suggests it; > 15 kPa is highly suggestive', B7],
  ['Decompensation', 'Overt ascites (or ascites needing diuretics), variceal bleeding or overt encephalopathy. Ascites seen only on ultrasound is not decompensation', `${B7}; ${AASLD}`],
  ['CSPH by HVPG', 'HVPG ≥ 10 mmHg; 5–9 mmHg is subclinical portal hypertension', `${B7}; ${AASLD}`],
  ['CSPH without HVPG', 'Rule in: stiffness ≥ 25 kPa, or varices at endoscopy. Rule out: stiffness ≤ 15 kPa and platelets ≥ 150. Probable (> 60 %): 20–25 kPa with platelets < 150, or 15–20 kPa with platelets < 110', `${B7}; ${AASLD} (rule in, rule out)`],
  ['Screening endoscopy', 'Can be avoided with stiffness < 20 kPa and platelets > 150; not needed to start an NSBB already indicated for CSPH', `${B7}; ${AASLD}`],
  ['NSBB to prevent decompensation', 'Compensated cirrhosis with CSPH: non-selective beta blocker, carvedilol preferred', `${B7}; ${AASLD}`],
  ['High-risk varices', 'Large varices, or small with red wale signs: NSBB (preferred) or band ligation', `${B7}; ${AASLD}`],
  ['NSBB with ascites', 'Reduce or stop with systolic pressure < 90 mmHg, sodium < 130 mmol/L or acute kidney injury', B7],
  ['Acute variceal bleeding', 'Vasoactive drug, antibiotic, endoscopy within 12 h, restrictive transfusion (Hb 7–8 g/dL). Pre-emptive TIPS when HVPG > 20 mmHg at the bleed (or by Child–Pugh)', `${B7}; ${AASLD}`],
];

const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

/**
 * The lens for one moment.
 * m: frame metrics; p: scenario params; hvpg: the HVPG the dock shows (null when a case hides it and it
 * has not been measured).
 * Returns { applies, stage, notes, inputs, rules }, each rule
 * { id, title, state: 'yes' | 'no' | 'maybe' | 'na', verdict, rule, reason, src }.
 * `state` is the finding, not a color: 'yes' means the rule is met.
 */
export function guidelineLens(m, p, hvpg) {
  const lsm = m.lsm, plt = m.spleen.platelets, vx = m.varix, asc = m.ascites.grade;
  const varices = vx.d >= 2.5, large = vx.d >= 5, red = varices && vx.redWale;
  const bleeding = !!m.bleeding && (m.bleeding.site === 'VAR' || m.bleeding.site === 'GV');
  const nsbb = !!(p.drugs?.carvedilol || p.drugs?.propranolol), nsbbName = p.drugs?.carvedilol ? 'carvedilol' : 'propranolol';
  // The rules are written for chronic liver disease. A block before or after the sinusoids (a clot, a
  // presinusoidal fibrosis, an outflow block, the heart) raises portal pressure without it.
  const sinFib = Math.max(p.fibrosis?.R?.sin ?? 1, p.fibrosis?.L?.sin ?? 1);
  const applies = p.cirrhosis >= 0.1 || sinFib >= 1.5;
  const congested = m.fhvp > 8;
  const inputs = [
    ['Liver stiffness', `${r1(lsm)} kPa`], ['Platelets', `${Math.round(plt)} ×10⁹/L`],
    ['HVPG', hvpg == null ? 'not measured' : `${r1(hvpg)} mmHg`],
    ['Varices', varices ? `${vx.grade.code}${red ? ', red wale' : ''}` : 'none'],
    ['Ascites', asc ? `grade ${asc}` : 'none'],
  ];
  const notes = [];
  if (!applies) {
    notes.push(m.ppg >= 6
      ? 'These rules are for chronic liver disease. This patient’s portal hypertension does not come from the sinusoids, so stiffness and platelets can mislead: read the gradients (HVPG, PPG) instead.'
      : 'No chronic liver disease in this patient, so the rules do not apply.');
  }
  if (congested) notes.push(`The free hepatic vein pressure is ${r1(m.fhvp)} mmHg: a congested liver is stiff without fibrosis, so the stiffness rules overcall.`);

  // Ascites that needs diuretics counts, whatever its grade today: decompensation is not undone by treatment.
  const diur = !!p.diuretics, decomp = asc >= 2 || bleeding || diur;
  const csphHvpg = hvpg != null && hvpg >= 10;
  const ruleIn = lsm >= 25 || varices;
  const ruleOut = lsm <= 15 && plt >= 150;
  const probable = (lsm >= 20 && plt < 150) || (lsm >= 15 && plt < 110);
  const csph = csphHvpg || ruleIn || decomp;
  const rules = [];
  const add = (id, title, state, verdict, reason, src) => rules.push({ id, title, state: applies || id === 'hvpg' ? state : 'na', verdict: applies || id === 'hvpg' ? verdict : 'Does not apply', rule: GUIDE_TABLE.find((r) => r[0] === title)?.[1] ?? '', reason, src });

  add('acld', 'Advanced chronic liver disease (cACLD)', lsm > 15 ? 'yes' : lsm >= 10 ? 'maybe' : 'no',
    lsm > 15 ? 'Highly suggestive' : lsm >= 10 ? 'Suggestive' : 'Ruled out',
    `Stiffness ${r1(lsm)} kPa.`, [B7]);
  add('decomp', 'Decompensation', decomp ? 'yes' : 'no', decomp ? 'Decompensated' : 'Compensated',
    bleeding ? 'Varices are bleeding now.' : diur && asc < 2 ? `On diuretics for ascites (grade ${asc} now): once decompensated, always counted.` : asc >= 2 ? `Ascites grade ${asc}: overt.` : asc === 1 ? 'Ascites grade 1 is seen only on ultrasound: still compensated.' : 'No ascites, no bleeding.', [B7, AASLD]);
  add('hvpg', 'CSPH by HVPG', hvpg == null ? 'na' : hvpg >= 10 ? 'yes' : hvpg >= 5 ? 'maybe' : 'no',
    hvpg == null ? 'Not measured' : hvpg >= 10 ? 'CSPH' : hvpg >= 5 ? 'Subclinical' : 'Normal',
    hvpg == null ? 'Measure the HVPG to use the reference standard.' : `HVPG ${r1(hvpg)} mmHg.${applies ? '' : ' HVPG reads the sinusoids only: a block before them leaves it normal.'}`, [B7, AASLD]);
  add('csph', 'CSPH without HVPG', ruleIn || decomp ? 'yes' : ruleOut ? 'no' : probable ? 'maybe' : 'na',
    ruleIn || decomp ? 'Ruled in' : ruleOut ? 'Ruled out' : probable ? 'Probable' : 'Grey zone',
    decomp && !ruleIn ? 'Decompensation implies it.' : varices ? `Varices at endoscopy (${vx.grade.code}).` : `Stiffness ${r1(lsm)} kPa, platelets ${Math.round(plt)}.${!ruleIn && !ruleOut && !probable ? ' Neither rule is met: an HVPG would settle it.' : ''}`,
    [B7, AASLD]);
  add('scope', 'Screening endoscopy', decomp ? 'yes' : csph ? 'na' : lsm < 20 && plt > 150 ? 'no' : 'yes',
    decomp ? 'Indicated' : csph ? 'Not needed for NSBB' : lsm < 20 && plt > 150 ? 'Can be avoided' : 'Indicated',
    decomp ? 'Decompensated: screen for varices.' : csph ? 'CSPH already calls for an NSBB; scope if it cannot be given.' : `Stiffness ${r1(lsm)} kPa, platelets ${Math.round(plt)}.`, [B7, AASLD]);
  add('nsbb', 'NSBB to prevent decompensation', decomp ? 'na' : csph ? 'yes' : 'no',
    decomp ? 'See ascites and bleeding' : csph ? (nsbb ? `On ${nsbbName}` : 'Indicated') : 'Not indicated',
    decomp ? 'Already decompensated.' : csph ? (p.drugs?.propranolol && !p.drugs?.carvedilol ? 'CSPH. Carvedilol is preferred: it lowers HVPG more.' : 'CSPH in compensated cirrhosis.') : 'No CSPH yet.', [B7, AASLD]);
  add('hrv', 'High-risk varices', large || red ? 'yes' : varices ? 'no' : 'na',
    large || red ? (nsbb ? `On ${nsbbName}` : 'Treat') : varices ? 'Small, low risk' : 'No varices',
    large ? `Varices ${vx.grade.code}: large.` : red ? 'Small, with red wale signs.' : varices ? 'Small, without red wale signs.' : 'None at endoscopy.', [B7, AASLD]);
  add('asc', 'NSBB with ascites', asc >= 2 && nsbb ? (m.map < 65 ? 'yes' : 'no') : 'na',
    asc >= 2 && nsbb ? (m.map < 65 ? 'Reduce or stop' : 'Continue') : 'Not on NSBB with ascites',
    asc >= 2 && nsbb ? `MAP ${Math.round(m.map)} mmHg${m.map < 65 ? ' (systolic likely below 90).' : '.'}` : 'Applies on an NSBB with overt ascites.', [B7]);
  add('bleed', 'Acute variceal bleeding', bleeding ? 'yes' : 'na',
    bleeding ? (hvpg != null && hvpg > 20 ? 'Pre-emptive TIPS' : 'Bleeding') : 'Not bleeding',
    bleeding ? (hvpg == null ? 'Bleeding now. HVPG not measured.' : `Bleeding now. HVPG ${r1(hvpg)} mmHg${hvpg > 20 ? ': above 20, high risk of failure.' : '.'}`) : 'No active variceal bleeding.', [B7, AASLD]);

  const stage = !applies ? (m.ppg >= 6 ? 'Portal hypertension without chronic liver disease' : 'No chronic liver disease')
    : bleeding ? 'Acute variceal bleeding'
      : decomp ? 'Decompensated cirrhosis'
        : lsm < 10 && !csph ? 'cACLD ruled out'
          : csph ? 'cACLD with CSPH'
            : ruleOut ? 'cACLD, CSPH ruled out'
              : probable ? 'cACLD, CSPH probable' : 'cACLD, CSPH uncertain';
  return { applies, stage, notes, inputs, rules };
}
