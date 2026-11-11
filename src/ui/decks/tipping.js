// Presenter talk: what tips a compensated patient with CSPH into decompensation. One man follows the talk: a second liver injury,
// an infection, surgery, the mouth and, after the first decompensation, the antibiotic question.
//
// Sources, checked against guidelines/baveno-viii-2026.pdf on 11 Nov 2026:
// - 3.7: superimposed acute liver injury (alcohol-related hepatitis, acute viral hepatitis HEV/HAV/HBV, HBV flares, autoimmune hepatitis,
//   drug-induced liver injury) can precipitate decompensation and/or ACLF in compensated cirrhosis/cACLD (LoE 2).
// - 3.10: bacterial infections in compensated cirrhosis/cACLD with CSPH can precipitate decompensation and/or ACLF (LoE 2);
//   3.11: the prognostic impact of infections without CSPH is unclear (LoE 5).
// - 3.12: periodontal disease goes with a higher risk of decompensation (LoE 4); 3.23: regular dental and periodontal care may decrease
//   the risk (LoE 3, weak).
// - 3.13: surgery, especially major surgery, can precipitate decompensation and/or ACLF in compensated cirrhosis with CSPH, the risk
//   rising with the severity of portal hypertension (LoE 3). Table 3 (statements of earlier reports that remain valid): in candidates
//   for non-hepatic abdominal surgery, an HVPG ≥16 mmHg goes with a higher short-term mortality. 3.20b: preoperative TIPS may be
//   considered before major surgery (LoE 4, weak).
// - 4.12: after the first decompensating event, long-term primary antibiotic prophylaxis is not recommended to prevent further
//   decompensation (LoE 2, strong).
// The model has no infection and no surgery. The infection slide shows what an infection does to the circulation (wider arteries,
// a faster heart, a lower MAP, more portal inflow) by lowering the splanchnic and systemic tone; the MAP stays above 65 mmHg, which the
// notes say. (The infection lever of the 11 Nov review, item 40, was not built.) The second injury is drawn as a worse scar and a
// lower albumin over two weeks, the surgery slide as the HVPG rule with a slider on the scar.

const VITALS = { kind: 'vitals', show: ['hr', 'map', 'co'] };
const TILES = ['hvpg', 'asc'];

export const TIPPING = {
  id: 'tipping', level: 'advanced', title: 'What tips a compensated patient over', minutes: 8,
  sections: [['Starting point', ['Starting point']], ['Second hits', ['Second hit', 'Infection', 'Surgery']], ['Prevention', ['Mouth', 'After the first']]],
  objectives: [
    'Name the second hits that push a compensated patient with CSPH into decompensation',
    'Say why infection matters in CSPH and where its effect is unclear',
    'State the HVPG at which abdominal surgery carries more risk',
    'Explain what dental care and long-term antibiotics can and cannot prevent',
  ],
  summary: 'A man with CSPH stays compensated until a second hit lands: a liver injury, an infection or surgery. What each does, what dental care may prevent, and why long-term antibiotics are not given after the first decompensation.',
  checks: [
    ['Which events can tip a compensated patient with CSPH into decompensation?', 'A second liver injury (alcohol-related hepatitis, acute viral hepatitis, an HBV flare, autoimmune hepatitis or drug-induced injury), a bacterial infection, and surgery, especially major surgery (Baveno VIII 3.7, 3.10, 3.13).'],
    ['An HVPG of what level goes with a higher short-term mortality after abdominal surgery, and what may be considered before major surgery?', 'An HVPG ≥16 mmHg in a candidate for non-hepatic abdominal surgery (Baveno VIII Table 3). A preoperative TIPS may be considered before major surgery, on weak evidence (3.20).'],
    ['A man with cirrhosis has just had his first episode of ascites. Should he start a long-term antibiotic to prevent the next decompensation?', 'No. Long-term primary antibiotic prophylaxis is not recommended after the first decompensating event (Baveno VIII 4.12, strong).'],
    ['A man with CSPH has an HVPG of 12 mmHg and no ascites. After a flare of hepatitis B his HVPG is 17 mmHg and he has ascites. Which lever moved?', 'The resistance in the liver. The flare added injury to scarred sinusoids, and the same portal inflow crossing a higher resistance gave a higher gradient.'],
  ],
  slides: [
    {
      id: 'stable', preset: 'csph', cam: 'fit', data: 'tiles', tiles: TILES, key: ['hvpg'],
      vignette: 'A 56-year-old man has cirrhosis from hepatitis C, cured two years ago. He has had no ascites, bleeding or confusion. His platelets are 90,000/µL and his varices are small.',
      kicker: 'Starting point', site: 'sin', title: 'With CSPH, a compensated patient stays stable only until a second hit',
      line: 'His HVPG is {hvpg}, which is {>=10 mmHg}. He has no ascites today, but a second hit can push him into ascites, bleeding or confusion.',
      notes: 'CSPH means the portal pressure gradient is high enough for varices and decompensation to follow, an HVPG of 10 mmHg or more. This man is compensated: no ascites, no variceal bleeding, no overt encephalopathy. Compensated cirrhosis with CSPH is stable until something else lands on the liver or the circulation. The next slides cover what Baveno VIII names: a second liver injury, an infection and surgery, then the mouth and the antibiotic question.',
      ask: ['What does an HVPG of 11 mmHg tell you about a man with no ascites?', 'He has CSPH, so he is at risk of decompensation, but he is still compensated today.'],
    },
    {
      id: 'injury', preset: 'csph', params: {}, days: 14, ramp: { cirrhosis: [0.6, 0.8], albumin: [4, 3.4] }, lapse: { seconds: 8, from: 'Compensated', to: 'Two weeks after the flare' },
      cam: 'fit', terms: ['sin'], data: 'tiles', tiles: TILES, key: ['hvpg'], delta: 'stable',
      tool: { kind: 'criteria', title: 'A second liver injury', short: 'Second injury', ticks: false, lead: 'Any one of these.', rule: 'Baveno VIII 3.7',
        rows: ['**Alcohol-related hepatitis**', '**Acute viral hepatitis** (HEV, HAV, HBV) or an **HBV flare**', '**Autoimmune hepatitis**', '**Drug-induced** liver injury'],
        verdict: 'Each can precipitate decompensation or ACLF.' },
      kicker: 'Second hit', site: 'sin', title: 'A second liver injury raises the HVPG and brings on ascites',
      line: 'A flare of hepatitis B adds injury to his scarred sinusoids. Two weeks on, his HVPG is {hvpg} and {asc} of ascites has formed.',
      notes: 'Baveno VIII 3.7: a superimposed acute liver injury (alcohol-related hepatitis, acute viral hepatitis, an HBV flare, autoimmune hepatitis or drug-induced liver injury) can precipitate decompensation or acute-on-chronic liver failure in compensated cirrhosis. In the model the injury is a worse scar and a falling albumin over two weeks. The resistance in the sinusoids rises, the same inflow crosses it at a higher pressure, and with less albumin the fluid leaves the vessels and collects as ascites. The model does not tell a viral flare from an alcohol or drug injury.',
      ask: ['A compensated man with CSPH has a flare of hepatitis B. Why can he develop ascites within weeks?', 'The injury raises the resistance in the sinusoids and lowers the albumin, so the portal pressure rises and fluid collects.'],
    },
    {
      id: 'infection', preset: 'csph', params: { splanchnicTone: 0.6, systemicTone: 0.6 }, cam: 'fit', tool: VITALS, data: 'tiles', tiles: ['hvpg', 'map'], key: ['map'], delta: 'stable',
      kicker: 'Infection', site: 'sin', title: 'An infection widens the arteries and raises the portal pressure', cite: 'Baveno VIII 3.10',
      line: 'Back in the first man, an infection widens his arteries. His heart rate climbs to {hr}, the MAP falls to {map} and the HVPG rises to {hvpg}.',
      notes: 'Baveno VIII 3.10: a bacterial infection in compensated cirrhosis with CSPH can precipitate decompensation or ACLF, and so worsen the natural history. An infection widens the splanchnic and systemic arteries. The gut sends more blood into the portal vein, the heart speeds up to keep the pressure, and the HVPG rises. The model has no infection and no inflammation: it shows only the wider arteries, drawn as a lower arterial tone, and the reflexes in the model hold the MAP above 65 mmHg. A real infection can take the MAP lower than this and injure the kidneys, which the model does not show.',
      ask: ['What does a bacterial infection do to the circulation of a man with CSPH?', 'It widens the arteries, so the heart speeds up, the MAP falls and the portal inflow and the HVPG rise.'],
    },
    {
      id: 'nocsph', cam: 'fit', data: 'tiles', tiles: ['hvpg', 'map'], key: ['hvpg'],
      tool: { kind: 'criteria', title: 'Infection and cirrhosis', short: 'Infection', ticks: false, lead: 'It depends on the portal pressure.', rule: 'Baveno VIII 3.10, 3.11',
        rows: [['**With CSPH**: infection can precipitate decompensation or ACLF', 'hvpg', '>=', 10], '**Without CSPH**: the effect of infection on the course is unclear'],
        verdict: 'He has CSPH, so an infection can tip him over.' },
      kicker: 'Infection', site: 'sin', title: 'Infection is known to tip patients with CSPH, and unclear without it',
      line: 'Baveno VIII ties infection to decompensation in patients with CSPH. In compensated cirrhosis without CSPH, its effect on the course is unclear.',
      notes: 'Baveno VIII 3.10 covers patients with CSPH: a bacterial infection can precipitate decompensation or ACLF. Baveno VIII 3.11 says the prognostic impact of infections in compensated cirrhosis without CSPH is unclear (LoE 5). The first man has an HVPG of 12 mmHg, so the first rule applies to him. The model keeps the infected state of the last slide.',
      ask: ['Does a bacterial infection tip a compensated patient without CSPH into decompensation?', 'Its effect on the course is unclear (Baveno VIII 3.11); the evidence that it tips a patient over is for patients with CSPH (3.10).'],
    },
    {
      id: 'surgery', preset: 'csph', params: {}, cam: 'fit', data: 'tiles', tiles: ['hvpg', 'map'], key: ['hvpg'],
      whatIf: { label: 'Cirrhosis', param: 'cirrhosis', min: 0.5, max: 0.8, step: 0.05, ends: ['Milder', 'Worse'] },
      tool: { kind: 'criteria', title: 'Before abdominal surgery', short: 'Before surgery', lead: 'The higher the HVPG, the higher the risk.', rule: 'Baveno VIII 3.13, 3.20',
        rows: [['**HVPG** at non-hepatic abdominal surgery', 'hvpg', '>=', 16], '**Major surgery** can precipitate decompensation or ACLF'],
        verdict: 'A preoperative TIPS may be considered before major surgery (weak).' },
      kicker: 'Surgery', site: 'sin', title: 'The higher the HVPG, the riskier the surgery',
      line: 'Surgery, especially major surgery, can tip him over. After abdominal surgery, short-term mortality is higher once the HVPG is {>=16 mmHg}.',
      notes: 'Baveno VIII 3.13: surgery, especially major surgery, can precipitate decompensation or ACLF in compensated cirrhosis with CSPH, and the risk rises with the severity of portal hypertension. Table 3 (a statement of an earlier report that remains valid): in candidates for non-hepatic abdominal surgery, an HVPG of 16 mmHg or more goes with a higher short-term mortality after the operation. Baveno VIII 3.20, part b: a preoperative TIPS may be considered before major surgery to reduce the risk of postoperative decompensation (low-quality evidence, weak recommendation). The slider makes the scar worse, so the HVPG climbs toward the 16 mmHg line; it also brings on some ascites, as it does in the patients.',
      ask: ['At what HVPG does short-term mortality after abdominal surgery rise, and what can be considered before major surgery?', 'An HVPG ≥16 mmHg (Baveno VIII Table 3). A preoperative TIPS may be considered, on weak evidence (3.20).'],
    },
    {
      id: 'mouth', preset: 'csph', params: {}, cam: 'fit', data: 'tiles', tiles: TILES, key: ['hvpg'],
      tool: { kind: 'criteria', title: 'The mouth and the liver', short: 'Dental care', ticks: false, rule: 'Baveno VIII 3.12, 3.23',
        rows: ['**Periodontal disease** goes with a higher risk of decompensation', '**Regular dental care** may lower the risk (weak recommendation)'] },
      kicker: 'Mouth', site: 'sin', title: 'Gum disease goes with decompensation, and dental care may help',
      line: 'Periodontal disease goes with more decompensation in compensated cirrhosis. Regular dental and periodontal care may lower the risk, but the recommendation is weak.',
      notes: 'Baveno VIII 3.12: periodontal disease is associated with a higher risk of decompensation in compensated cirrhosis (LoE 4, new). Baveno VIII 3.23: regular dental and periodontal care may decrease the risk (LoE 3, weak recommendation, 81% agreement). The panel lists whether preventing infections, including oral and dental health, changes the rate of decompensation as a question for research. The model has no mouth, so the numbers stay where they were.',
      ask: ['What does Baveno VIII say about dental care in compensated cirrhosis?', 'Periodontal disease goes with a higher risk of decompensation, and regular dental and periodontal care may lower it (weak recommendation).'],
    },
    {
      id: 'antibiotic', preset: 'csph', params: {}, days: 150, ramp: { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] }, lapse: { seconds: 8, from: 'Compensated', to: 'Five months on' },
      cam: 'fit', data: 'tiles', tiles: TILES, key: ['asc'], delta: 'stable',
      tool: { kind: 'criteria', title: 'After the first decompensation', short: 'After the first', ticks: false, lead: 'To prevent further decompensation.', rule: 'Baveno VIII 4.12',
        rows: ['Long-term **primary antibiotic prophylaxis**: not recommended'] },
      kicker: 'After the first', site: 'sin', title: 'After the first decompensation, long-term antibiotics do not prevent the next',
      line: 'Five months on, ascites has formed: {asc}. A long-term antibiotic to prevent his next decompensation is not recommended.',
      notes: 'Baveno VIII 4.12: after the first decompensating event, long-term primary antibiotic prophylaxis is not recommended to prevent further decompensation (LoE 2, strong recommendation, new). The statement is about a long-term antibiotic given to prevent further decompensation. It does not stop the usual treatment of an infection when one occurs. In the model the scar worsens and the albumin falls over five months, and the first ascites forms.',
      ask: ['A man has had his first ascites. Should he start a long-term antibiotic to prevent further decompensation?', 'No. Long-term primary antibiotic prophylaxis is not recommended after the first decompensating event (Baveno VIII 4.12, strong).'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'asc', 'map', 'hr'], asc: false, vs: 'first', rowHead: 'State',
      of: [{ id: 'stable', kicker: 'Start', title: 'Compensated, CSPH' }, { id: 'injury', kicker: 'Second hit', title: 'Two weeks after a hepatitis B flare' }, { id: 'infection', kicker: 'Infection', title: 'Wider arteries' }, { id: 'antibiotic', kicker: 'First decompensation', title: 'Five months on' }],
      kicker: 'Summary', title: 'What tips a compensated patient over',
      line: 'A second liver injury, an infection and surgery tip a patient with CSPH. Dental care may help, and long-term antibiotics are not given after the first decompensation.',
      notes: 'Compensated cirrhosis with CSPH is stable until a second hit lands. Baveno VIII names a superimposed liver injury (3.7), a bacterial infection (3.10) and surgery, especially major surgery (3.13). The risk of surgery rises with the HVPG, and an HVPG of 16 mmHg or more carries a higher short-term mortality (Table 3). Regular dental care may lower the risk (3.12, 3.23). After the first decompensating event, long-term antibiotic prophylaxis is not recommended (4.12).',
      ask: ['Name three events that tip a compensated patient with CSPH into decompensation.', 'A second liver injury, a bacterial infection and surgery, especially major surgery.'],
    },
  ],
};
