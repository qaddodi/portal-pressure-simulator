// Presenter talk: the circulation in cirrhosis, wide arteries, a fast heart, a low arterial pressure and a full blood volume, and what a
// liter of blood lost does to it and to the portal pressure (the slide fields are described at the top of decks.js). One vitals monitor
// carries the whole talk; the drugs that change this circulation are in Lowering portal pressure, and the transfusion in the bleed talk.
// The old Blood volume talk is these last two slides, and keeps working by its old id (decks.js DECK_ALIAS).
// Each slide's volume runs in with the patient settled after it.

const H = { kind: 'hemorrhage', mL: 1000 };
const VITALS = { kind: 'vitals', show: ['hr', 'map', 'co'] };

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;

export const HYPERDYNAMIC = {
  id: 'hyperdynamic', level: 'foundation', title: 'The circulation in cirrhosis', minutes: 8,
  objectives: [
    'Describe the hyperdynamic circulation: a higher cardiac output, a faster heart and a lower arterial pressure than in health',
    'Explain how splanchnic vasodilation adds inflow to the portal system',
    'Link arterial underfilling to salt and water retention',
    'Say what a liter of blood lost does to the arterial and the portal pressure',
  ],
  checks: [
    ['Why does the mean arterial pressure fall in cirrhosis although the cardiac output rises?', 'The systemic resistance falls by more: nitric oxide and other vasodilators open the arteries.'],
    ['How does splanchnic vasodilation raise the portal pressure?', 'Wide gut arteries pour more blood into the portal veins, and more inflow through a high resistance keeps the pressure up.'],
    ['Why does the blood volume rise in cirrhosis although the arteries seem underfilled?', 'The kidneys keep sodium and water in answer to the low effective arterial volume, but the extra fluid sits in the wide splanchnic bed and the peritoneum.'],
    ['Why does the portal pressure fall during a variceal bleed?', 'Less blood volume means less inflow into the portal system.'],
  ],
  summary: 'Why cirrhosis raises the cardiac output and the heart rate and lowers the arterial pressure, how the wide gut arteries feed the portal pressure, and what a liter of blood lost does to both.',
  slides: [
    {
      id: 'rest', preset: 'healthy', cam: 'fit', tool: VITALS,
      eq: [mi('MAP') + mo('=') + mi('CO') + mo('×') + mi('SVR'), 'Mean arterial pressure: cardiac output times systemic vascular resistance'],
      kicker: 'Health', title: 'A healthy circulation at rest',
      line: 'At rest a healthy heart pumps {co} at {hr}. The mean arterial pressure is {map}, and the vessels hold {bv} of blood.',
      notes: 'The mean arterial pressure is the cardiac output times the systemic vascular resistance (strictly, the pressure drop from the aorta to the right atrium). The arterioles set the resistance; the heart sets the output. Keep these numbers in mind: every slide that follows changes them. The strip over them is a schematic rhythm timed to the model\'s heartbeat, not a modelled ECG.',
      ask: ['If the cardiac output rises and the mean arterial pressure falls, what has happened to the systemic resistance?', 'It has fallen, by more than the output rose.'],
    },
    {
      id: 'dilate', preset: 'cirr-comp', params: {}, days: 365, ramp: { cirrhosis: [0.4, 0.85] }, lapse: { seconds: 10, from: 'Compensated', to: 'Decompensated' }, cam: 'fit', lens: 'flow', tool: VITALS,
      kicker: 'Cirrhosis', site: 'sin', title: 'Cirrhosis opens the arteries',
      line: 'Nitric oxide and other vasodilators open the arteries. A year on, the heart beats at {hr} and pumps {co}, yet the mean arterial pressure has fallen to {map}.',
      notes: 'In cirrhosis the gut and the systemic arteries make and meet more vasodilators, nitric oxide first among them, and respond less to vasoconstrictors. The arterial pressure falls, the baroreflex speeds the heart, and the cardiac output rises: the hyperdynamic circulation that AASLD describes once portal hypertension is clinically significant. Colored by flow, the figure shows more blood moving through the wide gut arteries. (AASLD 2024.)',
      ask: ['Name the three findings of the hyperdynamic circulation.', 'A higher cardiac output, a faster heart rate and a lower arterial pressure than in health.'],
    },
    {
      id: 'resist', cam: 'fit', lens: 'flow', tool: VITALS,
      eq: [mi('MAP') + mo('=') + mi('CO') + mo('×') + mi('SVR'), 'Mean arterial pressure: cardiac output times systemic vascular resistance'],
      kicker: 'Cirrhosis', site: 'sin', title: 'More output, less resistance',
      line: 'Output rises to {co}, yet the mean arterial pressure is {map}. More flow at less pressure means the arteries\' resistance has fallen by even more.',
      notes: 'Rearranged, SVR = MAP ÷ CO. In health that is about 93 ÷ 5; in this case about 82 ÷ 6.6, roughly a third lower. An output that climbs while the pressure falls is the signature of wide arteries, as in sepsis or pregnancy, and the opposite of heart failure, where the output is low and the arteries tight. Both numbers can still sit inside their normal ranges (4 to 8 L/min, and a mean pressure of 65 mmHg or more): what counts is the change from this patient\'s own healthy circulation, not a cut-off.',
      ask: ['A patient with cirrhosis has a mean arterial pressure of 75 mmHg and a cardiac output of 7 L/min. Is the heart failing?', 'No. An output that is up while the pressure is down means low systemic resistance, the hyperdynamic circulation.'],
    },
    {
      id: 'volume', cam: 'fit', lens: 'flow', tool: VITALS, data: 'tiles', tiles: ['bv', 'pv'], key: ['bv'], delta: 'rest',
      kicker: 'Cirrhosis', site: 'sin', title: 'Underfilled arteries make the kidneys hold salt',
      line: 'Wide arteries read as underfilled, so the kidneys keep sodium and water. The blood volume reaches {bv}, and fluid collects in the belly as ascites, {asc}.',
      notes: 'The fall in effective arterial blood volume switches on renin, aldosterone, the sympathetic nerves and vasopressin. The kidneys keep sodium and water and the plasma volume grows, yet the arteries stay underfilled, because the extra volume sits in the wide splanchnic bed and leaks into the peritoneum. At the end of this road, the renal arteries clamp down: hepatorenal syndrome (AASLD 2024, Figure 2). The model raises the blood volume with the disease; it does not model the kidneys.',
      ask: ['Why does the blood volume rise in cirrhosis although the arteries seem underfilled?', 'The kidneys keep sodium and water in answer to the low effective arterial volume, but the extra fluid sits in the wide splanchnic bed and the peritoneum.'],
    },
    {
      id: 'forward', cam: 'portal', terms: ['pv'], tool: VITALS, data: 'tiles', tiles: ['bv', 'pv'], key: ['pv'], delta: 'rest',
      whatIf: { label: 'Gut arteriole tone', param: 'splanchnicTone', min: 0.6, max: 1.6, step: 0.05, ends: ['Dilated', 'Constricted'] },
      kicker: 'Cirrhosis', site: 'sin', title: 'Wide gut arteries keep the portal pressure up',
      line: 'Wide gut arteries pour more blood into the [portal vein](pv) and hold its pressure at {pv}. The slider tightens or widens them: tighter lowers the pressure, as beta-blockers do.',
      notes: 'Portal pressure is portal inflow times the resistance it meets. The resistance rises first, in the scarred liver; once the gradient reaches about 10 mmHg, collaterals and splanchnic vasodilation follow, and the extra inflow pushes the pressure higher still (AASLD 2024, Figure 2). The slider changes the tone of the gut arterioles: dilated adds inflow, constricted takes it away.',
      ask: ['Two parts make the portal pressure. Name them.', 'The resistance to portal flow (the liver and the collaterals) and the portal inflow from the gut arteries.'],
    },
    {
      id: 'full', preset: 'cirr-decomp', cam: 'route', terms: ['pv'], tool: VITALS, data: 'tiles', tiles: ['pv'], key: ['pv'],
      vignette: 'A 49-year-old woman with MASH cirrhosis has ascites on spironolactone and furosemide, large esophageal varices and an albumin of 2.8 g/dL.',
      kicker: 'Losing blood', site: 'sin', title: 'The volume behind the portal pressure',
      line: 'The vessels hold {bv} of blood, and the [portal vein](pv) pressure is {pv}. What fills the circulation fills the portal system too.',
      notes: 'Cirrhosis widens the splanchnic and systemic arteries, and the kidneys keep salt and water to fill them, so the blood volume is larger than in health. The portal pressure depends on the resistance of the liver and on how much blood flows in. Volume changes the second.',
      ask: ['Name the two things that set the portal pressure.', 'The resistance to portal flow and the portal inflow.'],
    },
    {
      id: 'loss', action: H,
      question: 'What will a liter lost do to the portal pressure?', cam: 'route', tool: VITALS, data: 'tiles', tiles: ['pv'], key: ['pv'], delta: 'full',
      kicker: 'Losing blood', site: 'sin', title: 'A liter lost lowers the portal pressure',
      line: 'A liter lost drops the mean arterial pressure to {map} and speeds the heart to {hr}. Less volume means less inflow, so the portal pressure falls to {pv}.',
      notes: 'Lost volume lowers the cardiac output and the splanchnic inflow, so the whole portal profile sinks. The heart rate and the arterial pressure show the loss first; the hemoglobin lags for hours, as fluid moves into the vessels (the Acute variceal bleeding talk plays this beat by beat, with the transfusion target of 7 to 8 g/dL). A healthy circulation copes better with the same liter, because its arteries can still tighten.',
      ask: ['Why does the portal pressure fall during a bleed?', 'Less volume means less inflow into the portal system.'],
    },
    {
      // (The relation chart before the summary: the model's cirrhosis from mild to severe, each point settled for a year, the cardiac output and
      // the mean arterial pressure read against the HVPG. The ring is decompensated cirrhosis.)
      id: 'relation', preset: 'cirr-decomp', cam: 'fit',
      tool: { kind: 'curve', x: 'hvpg', xCuts: [10], patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0.3, to: 1, step: 0.05, days: 365, lines: ['co', 'map'] },
      kicker: 'Summary', site: 'sin', title: 'The output climbs and the arterial pressure falls with the HVPG',
      line: 'As the HVPG climbs the heart pumps more, and the arterial pressure falls. At {hvpg}, decompensated cirrhosis pumps {co} at a mean arterial pressure of {map}.',
      notes: 'Each point is the model\'s cirrhosis from mild to severe, settled for a year: the cardiac output and the mean arterial pressure, read against the HVPG. The output rises from about 5.0 to 7.0 L/min and the mean arterial pressure falls from about 92 to 80 mmHg; the heart rate rises with them, from the low 60s to the low 90s a minute. The arteries dilate by more than the heart pumps harder, which is why the pressure falls while the output rises. AASLD 2024 describes this hyperdynamic state as systemic vasodilation with a higher cardiac output and sodium and water retention, once portal hypertension is clinically significant; the numbers on the chart are the model\'s, not the guideline\'s. The ring is decompensated cirrhosis. (AASLD 2024 Fig. 2.)',
      ask: ['The HVPG climbs in a patient with cirrhosis. Which way do the cardiac output and the mean arterial pressure move?', 'The output rises and the pressure falls: the arteries dilate by more than the heart pumps harder.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['co', 'hr', 'map', 'pv'], asc: false, vs: 'first', calm: ['co'], rowHead: 'Patient',
      of: [{ id: 'rest', kicker: 'Reference', title: 'Healthy' }, { preset: 'cirr-comp', kicker: 'Cirrhosis', title: 'Compensated' }, { preset: 'csph', kicker: 'Cirrhosis', title: 'CSPH' }, { id: 'dilate', kicker: 'Cirrhosis', title: 'Decompensated' },
        { id: 'loss', kicker: 'Bleed', title: 'A liter lost' }],
      kicker: 'Summary', title: 'The circulation from health to a bleed',
      line: 'As cirrhosis advances, the output and the heart rate climb while the arterial pressure falls. A liter lost then lowers the arterial and the portal pressure.',
      notes: 'The hyperdynamic circulation grows with the portal pressure: compensated cirrhosis shows little of it, decompensated cirrhosis all of it. It explains the low blood pressure of advanced cirrhosis, the salt and water retention behind ascites, and why a bleed lowers the portal pressure along with the blood pressure. Every drug that lowers the portal pressure also acts on this circulation.',
      ask: ['What does a liter of blood lost do to the portal pressure in cirrhosis, and why?', 'It lowers it, because less volume means less inflow into the portal system.'],
    },
  ],
};
