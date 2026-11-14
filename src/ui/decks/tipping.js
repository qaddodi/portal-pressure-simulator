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
  id: 'tipping', level: 'advanced', title: 'What precipitates decompensation in compensated cirrhosis', minutes: 8,
  sections: [['Starting point', ['Starting point']], ['Second hits', ['Second hit', 'Infection', 'Surgery']], ['Prevention', ['Oral health', 'After the first']]],
  objectives: [
    'Name the second hits that push a compensated patient with CSPH into decompensation',
    'Say why infection matters in CSPH and where its effect is unclear',
    'State the HVPG at which abdominal surgery carries a higher risk',
    'Explain what dental care and long-term antibiotics can and cannot prevent',
  ],
  summary: 'A man with CSPH can stay compensated for years, until a second hit precipitates decompensation: a liver injury, an infection or surgery. What each does, what dental care may prevent, and why no long-term antibiotic is started after the first decompensation only to prevent the next.',
  checks: [
    ['Which events can precipitate decompensation in a compensated patient with CSPH?', 'A second liver injury (alcohol-related hepatitis, acute viral hepatitis, an HBV flare, autoimmune hepatitis or drug-induced injury), a bacterial infection, and surgery, especially major surgery (Baveno VIII 3.7, 3.10, 3.13).'],
    ['What HVPG is associated with a higher short-term mortality after abdominal surgery, and what may be considered before major surgery?', 'An HVPG ≥16 mmHg in a candidate for non-hepatic abdominal surgery (Baveno VIII Table 3). A preoperative TIPS may be considered before major surgery, on weak evidence (3.20).'],
    ['A man with cirrhosis has just had his first episode of ascites. Should he start a long-term antibiotic to prevent the next decompensation?', 'No. Long-term primary antibiotic prophylaxis is not recommended after the first decompensating event (Baveno VIII 4.12, strong).'],
    ['A man with CSPH has an HVPG of 12 mmHg and no ascites. After a flare of hepatitis B his HVPG is 17 mmHg and he has ascites. Which lever moved?', 'Intrahepatic resistance. The flare added acute injury to a fibrotic liver, and the same portal inflow meeting a higher resistance gave a higher gradient.'],
  ],
  slides: [
    {
      id: 'stable', preset: 'csph', cam: 'fit', data: 'tiles', tiles: TILES, key: ['hvpg'],
      vignette: 'A 56-year-old man has cirrhosis from hepatitis C, cured two years ago. He has had no ascites, variceal bleeding or hepatic encephalopathy. His platelets are 90,000/µL and he has small esophageal varices.',
      kicker: 'Starting point', site: 'sin', title: 'With CSPH, a second hit can precipitate decompensation',
      line: 'His HVPG is {hvpg}, which is {>=10 mmHg}. He has no ascites today, but a second hit can precipitate ascites, variceal bleeding or overt hepatic encephalopathy.',
      notes: 'CSPH means the portal pressure is high enough for varices and decompensation to develop: an HVPG ≥10 mmHg. This man is compensated: no ascites, no variceal bleeding, no overt hepatic encephalopathy. Compensated cirrhosis with CSPH can stay stable for years; a further insult to the liver or the circulation often precipitates decompensation. The next slides cover what Baveno VIII names: a second liver injury, an infection and surgery, then the mouth and the antibiotic question.',
      ask: ['What does an HVPG of 11 mmHg tell you about a man with no ascites?', 'He has CSPH, so he is at risk of decompensation, but he is still compensated today.'],
    },
    {
      id: 'injury', preset: 'csph', params: {}, days: 14, ramp: { cirrhosis: [0.6, 0.8], albumin: [4, 3.4] }, lapse: { seconds: 8, from: 'Compensated', to: 'Two weeks after the flare' },
      cam: 'fit', terms: ['sin'], data: 'tiles', tiles: TILES, key: ['hvpg'], delta: 'stable',
      tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'asc'], keepTiles: true, title: 'HVPG and ascites over two weeks' },
      kicker: 'Second hit', site: 'sin', title: 'A second liver injury raises the HVPG and brings on ascites',
      line: 'A hepatitis B flare raises resistance in his already fibrotic sinusoids. Two weeks later, his HVPG is {hvpg} and {asc} of ascites has formed.',
      notes: 'Baveno VIII 3.7: a superimposed acute liver injury (alcohol-related hepatitis, acute viral hepatitis, an HBV flare, autoimmune hepatitis or drug-induced liver injury) can precipitate decompensation or acute-on-chronic liver failure in compensated cirrhosis. In the model the injury is more fibrosis and a falling serum albumin over two weeks. Sinusoidal resistance rises, the same portal inflow meets it at a higher pressure, and with a lower oncotic pressure, fluid leaves the sinusoids and accumulates as ascites. The model does not distinguish a viral flare from alcohol-related or drug-induced injury.',
      ask: ['A compensated man with CSPH has a flare of hepatitis B. Why can he develop ascites within weeks?', 'The injury raises sinusoidal resistance and lowers the serum albumin, so the portal pressure rises and ascites accumulates.'],
    },
    {
      id: 'injury-card', cam: 'fit', terms: ['sin'], tool: { kind: 'criteria', title: 'A second liver injury', short: 'Second injury', ticks: false, lead: 'Any one of these.', rule: 'Baveno VIII 3.7',
        rows: ['**Alcohol-related hepatitis**', '**Acute viral hepatitis** (HEV, HAV, HBV) or an **HBV flare**', '**Autoimmune hepatitis**', '**Drug-induced** liver injury'],
        verdict: 'Each can precipitate decompensation or ACLF.' }, data: 'tiles', tiles: TILES, key: ['hvpg'], delta: 'stable',
      kicker: 'Second hit', site: 'sin', title: 'A second liver injury can precipitate decompensation in compensated cirrhosis',
      line: 'Any one of these injuries can precipitate decompensation or ACLF in a man with compensated cirrhosis.',
      notes: 'Baveno VIII 3.7. The same man as the slide before, two weeks after the flare. The card lists the second injuries the guideline names: alcohol-related hepatitis, acute viral hepatitis or an HBV flare, autoimmune hepatitis and drug-induced liver injury.',
      ask: ['Name two second liver injuries that can precipitate decompensation in compensated cirrhosis.', 'Two of these: alcohol-related hepatitis, acute viral hepatitis or an HBV flare, autoimmune hepatitis, drug-induced liver injury (Baveno VIII 3.7).'],
    },
    {
      id: 'infection', preset: 'csph', params: { splanchnicTone: 0.6, systemicTone: 0.6 }, cam: 'fit', tool: VITALS, data: 'tiles', tiles: ['hvpg', 'map'], key: ['map'], delta: 'stable',
      kicker: 'Infection', site: 'sin', title: 'Bacterial infection causes vasodilation and raises the portal pressure', cite: 'Baveno VIII 3.10',
      line: 'Back in the first patient, a bacterial infection causes arterial vasodilation. His heart rate rises to {hr}, his blood pressure falls to {map} and the HVPG rises to {hvpg}.',
      notes: 'Baveno VIII 3.10: a bacterial infection in compensated cirrhosis with CSPH can precipitate decompensation or ACLF, and so worsen the natural history. Infection dilates the splanchnic and systemic arteries. Splanchnic inflow into the portal vein increases, the heart rate rises to maintain the blood pressure, and the HVPG rises. The model has no infection and no inflammation: it shows only the vasodilation, as a lower arterial tone, and the model\'s reflexes keep the MAP >65 mmHg. A real infection can take the MAP lower and cause AKI, which the model does not show.',
      ask: ['What does a bacterial infection do to the circulation of a man with CSPH?', 'It causes arterial vasodilation, so the heart rate rises, the MAP falls, and the portal inflow and the HVPG rise.'],
    },
    {
      id: 'nocsph', cam: 'fit', data: 'tiles', tiles: ['hvpg', 'map'], key: ['hvpg'],
      tool: { kind: 'criteria', title: 'Infection and cirrhosis', short: 'Infection', ticks: false, lead: 'It depends on the portal pressure.', rule: 'Baveno VIII 3.10, 3.11',
        rows: [['**With CSPH** (≥10 mmHg): infection can precipitate decompensation or ACLF', 'hvpg', '>=', 10], '**Without CSPH**: the effect of infection on the course is unclear'],
        verdict: 'He has CSPH, so infection can precipitate decompensation.' },
      kicker: 'Infection', site: 'sin', title: 'Infection can precipitate decompensation with CSPH; without CSPH its effect is unclear',
      line: 'Baveno VIII ties infection to decompensation in patients with CSPH. In compensated cirrhosis without CSPH, its effect on the course is unclear.',
      notes: 'Baveno VIII 3.10 covers patients with CSPH: a bacterial infection can precipitate decompensation or ACLF. Baveno VIII 3.11 says the prognostic impact of infections in compensated cirrhosis without CSPH is unclear (LoE 5). The first patient has an HVPG of 12 mmHg, so the first rule applies to him. The model keeps the vasodilated state of the last slide.',
      ask: ['Does a bacterial infection precipitate decompensation in a compensated patient without CSPH?', 'Its effect on the course is unclear (Baveno VIII 3.11); the evidence that it precipitates decompensation is in patients with CSPH (3.10).'],
    },
    {
      id: 'surgery', preset: 'csph', params: {}, cam: 'fit', data: 'tiles', tiles: ['hvpg', 'map'], key: ['hvpg'],
      whatIf: { label: 'Cirrhosis', param: 'cirrhosis', min: 0.5, max: 0.8, step: 0.05, ends: ['Milder', 'Worse'] },
      tool: { kind: 'criteria', title: 'Before abdominal surgery', short: 'Before surgery', lead: 'The risk after surgery rises with the HVPG.', rule: 'Baveno VIII 3.13, 3.20',
        rows: [['**HVPG ≥16 mmHg**: higher short-term mortality after abdominal surgery', 'hvpg', '>=', 16], '**Major surgery** can precipitate decompensation or ACLF'],
        verdict: 'Before major surgery: a preoperative TIPS may be considered (weak).' },
      kicker: 'Surgery', site: 'sin', title: 'The higher the HVPG, the riskier the surgery',
      line: 'Surgery, especially major surgery, can precipitate decompensation. After abdominal surgery, short-term mortality is higher once the HVPG is {>=16 mmHg}.',
      notes: 'Baveno VIII 3.13: surgery, especially major surgery, can precipitate decompensation or ACLF in compensated cirrhosis with CSPH, and the risk rises with the severity of portal hypertension. Table 3 (a statement of an earlier report that remains valid): in candidates for non-hepatic abdominal surgery, an HVPG ≥16 mmHg is associated with a higher short-term mortality after the operation. Baveno VIII 3.20, part b: a preoperative TIPS may be considered before major surgery to reduce the risk of postoperative decompensation (low-quality evidence, weak recommendation). The slider increases the fibrosis, so the HVPG rises toward 16 mmHg; it also produces some ascites, as in patients.',
      ask: ['At what HVPG does short-term mortality after abdominal surgery rise, and what can be considered before major surgery?', 'An HVPG ≥16 mmHg (Baveno VIII Table 3). A preoperative TIPS may be considered, on weak evidence (3.20).'],
    },
    {
      id: 'mouth', preset: 'csph', params: {}, cam: 'fit', data: 'tiles', tiles: TILES, key: ['hvpg'],
      tool: { kind: 'criteria', title: 'Oral health and the liver', short: 'Dental care', ticks: false, rule: 'Baveno VIII 3.12, 3.23',
        rows: ['**Periodontal disease** is associated with a higher risk of decompensation', '**Regular dental care** may lower the risk (weak recommendation)'] },
      kicker: 'Oral health', site: 'sin', title: 'Periodontal disease is associated with decompensation, and dental care may help',
      line: 'Periodontal disease is associated with a higher risk of decompensation in compensated cirrhosis. Regular dental and periodontal care may lower the risk, but the recommendation is weak.',
      notes: 'Baveno VIII 3.12: periodontal disease is associated with a higher risk of decompensation in compensated cirrhosis (LoE 4, new). Baveno VIII 3.23: regular dental and periodontal care may decrease the risk (LoE 3, weak recommendation, 81% agreement). The panel lists whether preventing infections, including oral and dental health, changes the rate of decompensation as a question for research. The model has no oral cavity, so the values are unchanged.',
      ask: ['What does Baveno VIII say about dental care in compensated cirrhosis?', 'Periodontal disease is associated with a higher risk of decompensation, and regular dental and periodontal care may lower it (weak recommendation).'],
    },
    {
      id: 'antibiotic', preset: 'csph', params: {}, days: 150, ramp: { cirrhosis: [0.6, 0.85], albumin: [4, 2.8] }, lapse: { seconds: 8, from: 'Compensated', to: 'Five months on' },
      cam: 'fit', data: 'tiles', tiles: TILES, key: ['asc'], delta: 'stable',
      tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'asc'], keepTiles: true, title: 'HVPG and ascites over five months' },
      kicker: 'After the first', site: 'sin', title: 'After the first decompensation, long-term antibiotics are not given to prevent the next',
      line: 'Five months later, {asc} of ascites has formed. The next slide gives the Baveno VIII advice for him now.',
      notes: 'Baveno VIII 4.12: after the first decompensating event, long-term primary antibiotic prophylaxis is not recommended to prevent further decompensation (LoE 2, strong recommendation, new). The statement is about a long-term antibiotic given to prevent further decompensation. It does not stop the usual treatment of an infection when one occurs. In the model fibrosis progresses and the serum albumin falls over five months, and the first ascites forms.',
      ask: ['A man has had his first ascites. Should he start a long-term antibiotic to prevent further decompensation?', 'No. Long-term primary antibiotic prophylaxis is not recommended after the first decompensating event (Baveno VIII 4.12, strong).'],
    },
    {
      id: 'antibiotic-card', cam: 'fit', tool: { kind: 'criteria', title: 'After the first decompensation', short: 'After the first', ticks: false, lead: 'To prevent further decompensation.', rule: 'Baveno VIII 4.12',
        rows: ['Long-term **primary antibiotic prophylaxis**: not recommended'] }, data: 'tiles', tiles: TILES, key: ['asc'], delta: 'stable',
      kicker: 'After the first', site: 'sin', title: 'No long-term antibiotic to prevent further decompensation',
      line: 'Baveno VIII does not recommend long-term primary prophylaxis to prevent further decompensation. Infections are still treated, and other indications, such as secondary SBP prophylaxis, still apply.',
      notes: 'Baveno VIII 4.12: after the first decompensating event, long-term primary antibiotic prophylaxis is not recommended to prevent further decompensation (LoE 2, strong recommendation). The same man as the slide before, five months on. The statement covers only that preventive use: it does not stop the treatment of an infection, and it leaves other indications for prophylaxis, such as secondary prophylaxis after an episode of SBP, as they are.',
      ask: ['Does a man with his first ascites start a long-term antibiotic to prevent the next decompensation?', 'No. It is not recommended (Baveno VIII 4.12, strong). An infection is still treated when it occurs.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'asc', 'map', 'hr'], asc: false, vs: 'first', rowHead: 'State',
      of: [{ id: 'stable', kicker: 'Start', title: 'Compensated, CSPH' }, { id: 'injury', kicker: 'Second hit', title: 'Two weeks after a hepatitis B flare' }, { id: 'infection', kicker: 'Infection', title: 'Vasodilation' }, { id: 'antibiotic', kicker: 'First decompensation', title: 'Five months on' }],
      kicker: 'Summary', title: 'What precipitates decompensation',
      line: 'A second liver injury, an infection or surgery can precipitate decompensation with CSPH. Dental care may help. No long-term antibiotic is started just to prevent the next decompensation.',
      notes: 'Decompensation in compensated cirrhosis with CSPH often follows a second hit. Baveno VIII names a superimposed liver injury (3.7), a bacterial infection (3.10) and surgery, especially major surgery (3.13). The risk of surgery rises with the HVPG, and an HVPG ≥16 mmHg carries a higher short-term mortality (Table 3). Regular dental care may lower the risk (3.12, 3.23). After the first decompensating event, long-term primary antibiotic prophylaxis is not recommended to prevent further decompensation (4.12); other indications are unchanged.',
      ask: ['Name three events that can precipitate decompensation in a compensated patient with CSPH.', 'A second liver injury, a bacterial infection and surgery, especially major surgery.'],
    },
  ],
};
