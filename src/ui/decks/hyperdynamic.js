// Presenter talk: the hyperdynamic circulation of cirrhosis, wide arteries, a fast heart, a low arterial pressure and a
// full blood volume, and what propranolol, carvedilol and terlipressin do to it (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;

export const HYPERDYNAMIC = {
  id: 'hyperdynamic', level: 'foundation', title: 'The hyperdynamic circulation', minutes: 8,
  objectives: [
    'Describe the hyperdynamic circulation: a higher cardiac output, a faster heart and a lower arterial pressure than in health',
    'Explain how splanchnic vasodilation adds inflow to the portal system',
    'Link arterial underfilling to salt and water retention',
    'Predict what propranolol, carvedilol and terlipressin do to the circulation',
  ],
  checks: [
    ['Why does the mean arterial pressure fall in cirrhosis although the cardiac output rises?', 'The systemic resistance falls by more: nitric oxide and other vasodilators open the arteries.'],
    ['How does splanchnic vasodilation raise the portal pressure?', 'Wide gut arteries pour more blood into the portal veins, and more inflow through a high resistance keeps the pressure up.'],
    ['When should carvedilol be reduced or stopped?', 'When the systolic pressure stays under 90 mmHg or the mean arterial pressure under 65 mmHg, or with HRS-AKI.'],
  ],
  summary: 'Why cirrhosis raises the cardiac output and the heart rate and lowers the arterial pressure, how the wide gut arteries feed the portal pressure, and what beta-blockers and terlipressin change.',
  slides: [
    {
      id: 'rest', preset: 'healthy', cam: 'fit', data: 'tiles', tiles: ['co', 'hr', 'map', 'bv'], key: ['co', 'map'],
      eq: [mi('MAP') + mo('=') + mi('CO') + mo('×') + mi('SVR'), 'Mean arterial pressure: cardiac output times systemic vascular resistance'],
      kicker: 'Health', title: 'A resting circulation',
      line: 'At rest a healthy heart pumps {co} at {hr}. The mean arterial pressure is {map}, and the vessels hold {bv} of blood.',
      notes: 'The mean arterial pressure is the cardiac output times the systemic vascular resistance (strictly, the pressure drop from the aorta to the right atrium). The arterioles set the resistance; the heart sets the output. Keep these four numbers in mind: every slide that follows changes them.',
      ask: ['If the cardiac output rises and the mean arterial pressure falls, what has happened to the systemic resistance?', 'It has fallen, by more than the output rose.'],
    },
    {
      id: 'dilate', preset: 'cirr-comp', params: {}, days: 365, ramp: { cirrhosis: [0.4, 0.85] }, lapse: { seconds: 10, from: 'Compensated', to: 'Decompensated' }, cam: 'fit',
      data: 'tiles', tiles: ['co', 'hr', 'map'], key: ['map'], delta: 'rest',
      cite: 'AASLD 2024',
      kicker: 'Cirrhosis', site: 'sin', title: 'Cirrhosis opens the arteries',
      line: 'As cirrhosis advances, nitric oxide and other vasodilators open the splanchnic and systemic arteries. A year on, the mean arterial pressure has fallen to {map}, while the heart beats at {hr} and pumps {co}.',
      notes: 'In cirrhosis the gut and the systemic arteries make and meet more vasodilators, nitric oxide first among them, and respond less to vasoconstrictors. The arterial pressure falls, the baroreflex speeds the heart, and the cardiac output rises: the hyperdynamic circulation that AASLD describes once portal hypertension is clinically significant. The tiles compare with the healthy circulation at the start of the talk.',
      ask: ['Name the three findings of the hyperdynamic circulation.', 'A higher cardiac output, a faster heart rate and a lower arterial pressure than in health.'],
    },
    {
      id: 'resist', cam: 'fit', data: 'tiles', tiles: ['map', 'co'], key: ['map', 'co'], delta: 'rest',
      eq: [mi('MAP') + mo('=') + mi('CO') + mo('×') + mi('SVR'), 'Mean arterial pressure: cardiac output times systemic vascular resistance'],
      kicker: 'Cirrhosis', site: 'sin', title: 'More output, less resistance',
      line: 'The output has risen to {co}, yet the mean arterial pressure is {map}, lower than in health. With more flow and less pressure, the resistance of the arteries must have fallen by even more.',
      notes: 'Rearranged, SVR = MAP ÷ CO. In health that is about 93 ÷ 5; in this case about 82 ÷ 6.6, roughly a third lower. An output that climbs while the pressure falls is the signature of wide arteries, as in sepsis or pregnancy, and the opposite of heart failure, where the output is low and the arteries tight. Both numbers can still sit inside their normal ranges (4 to 8 L/min, and a mean pressure of 65 mmHg or more): what counts is the change from this patient\'s own healthy circulation, not a cut-off.',
      ask: ['A patient with cirrhosis has a mean arterial pressure of 75 mmHg and a cardiac output of 7 L/min. Is the heart failing?', 'No. An output that is up while the pressure is down means low systemic resistance, the hyperdynamic circulation.'],
    },
    {
      id: 'volume', cam: 'fit', data: 'tiles', tiles: ['bv', 'asc'], key: ['bv'], delta: 'rest',
      caveat: 'The model raises the blood volume with the disease; it does not model the kidneys.',
      cite: 'AASLD 2024',
      kicker: 'Cirrhosis', site: 'sin', title: 'Underfilled arteries make the kidneys hold salt',
      line: 'Wide arteries hold more blood than the body has, so they read as underfilled. The kidneys keep sodium and water: the blood volume reaches {bv}, and fluid collects in the belly as ascites, {asc}.',
      notes: 'The fall in effective arterial blood volume switches on renin, aldosterone, the sympathetic nerves and vasopressin. The kidneys keep sodium and water and the plasma volume grows, yet the arteries stay underfilled, because the extra volume sits in the wide splanchnic bed and leaks into the peritoneum. At the end of this road, the renal arteries clamp down: hepatorenal syndrome (AASLD 2024, Figure 2).',
      ask: ['Why does the blood volume rise in cirrhosis although the arteries seem underfilled?', 'The kidneys keep sodium and water in answer to the low effective arterial volume, but the extra fluid sits in the wide splanchnic bed and the peritoneum.'],
    },
    {
      id: 'forward', cam: 'portal', terms: ['pv'], data: 'tiles', tiles: ['pv', 'map', 'pvFlow'], key: ['pv'],
      whatIf: { label: 'Gut arteriole tone', param: 'splanchnicTone', min: 0.6, max: 1.6, step: 0.05, ends: ['Dilated', 'Constricted'] },
      cite: 'AASLD 2024',
      kicker: 'Cirrhosis', site: 'sin', title: 'Wide gut arteries keep the portal pressure up',
      line: 'Wide gut arteries pour more blood into the [portal vein](pv), which keeps its pressure at {pv} even as collaterals open. Dilating them further raises it; tightening them brings it down, the target of beta-blockers.',
      notes: 'Portal pressure is portal inflow times the resistance it meets. The resistance rises first, in the scarred liver; once the gradient reaches about 10 mmHg, collaterals and splanchnic vasodilation follow, and the extra inflow pushes the pressure higher still (AASLD 2024, Figure 2). The slider changes the tone of the gut arterioles: dilated adds inflow, constricted takes it away.',
      ask: ['Two parts make the portal pressure. Name them.', 'The resistance to portal flow (the liver and the collaterals) and the portal inflow from the gut arteries.'],
    },
    {
      id: 'propranolol', params: { drugs: { propranolol: true } }, cam: 'portal', data: 'tiles', tiles: ['hr', 'co', 'hvpg'], key: ['hr'], delta: true,
      cite: 'AASLD 2024',
      kicker: 'Drugs', site: 'sin', title: 'Propranolol slows the heart and the inflow',
      line: 'Propranolol slows the heart to {hr} and lowers the output to {co} by blocking beta-1. Blocking beta-2 lets the gut arteries constrict, so less blood reaches the portal veins and the HVPG falls to {hvpg}.',
      notes: 'Non-selective beta-blockers lower the portal pressure by cutting portal and collateral inflow: beta-1 blockade lowers the cardiac output and beta-2 blockade leaves the splanchnic arteries to alpha-adrenergic constriction (AASLD 2024). A selective beta-1 blocker such as metoprolol does not do the second half, so it is not used for portal hypertension. The heart rate shows the dose; it does not show the portal response.',
      ask: ['Why is metoprolol not used to lower portal pressure?', 'It blocks only beta-1; the beta-2 blockade that constricts the gut arteries is missing.'],
    },
    {
      id: 'carvedilol', params: { drugs: { propranolol: false, carvedilol: true } }, cam: 'portal', data: 'tiles', tiles: ['hvpg', 'map', 'hr'], key: ['hvpg', 'map'], delta: 'dilate',
      compare: [{ label: 'Propranolol', short: 'Prop.', params: { drugs: { propranolol: true, carvedilol: false } } }, { label: 'Carvedilol', short: 'Carv.', own: true, params: { drugs: { propranolol: false, carvedilol: true } } }],
      cite: 'Baveno VIII 4.6; AASLD 2024',
      kicker: 'Drugs', site: 'sin', title: 'Carvedilol lowers the pressure more, and the blood pressure too',
      line: 'Carvedilol adds alpha-1 blockade, which relaxes the liver\'s own vessels: the HVPG falls further, to {hvpg}. The mean arterial pressure falls too, to {map}; reduce or stop it if the mean stays under {<65 mmHg}.',
      notes: 'Carvedilol blocks beta-1, beta-2 and alpha-1 receptors and releases nitric oxide in the liver, so it lowers the intrahepatic resistance as well as the inflow, and it lowers the HVPG more than propranolol (AASLD 2024). The same vasodilation lowers the arterial pressure in a circulation that is already low. Baveno VIII 4.6: reduce or stop carvedilol or a classic beta-blocker if the systolic pressure stays under 90 mmHg or the mean under 65 mmHg, or with HRS-AKI, and restart it once that resolves. The tiles compare with the patient before any drug; the buttons switch between the two drugs.',
      ask: ['A patient on carvedilol has a blood pressure of 84/50 mmHg (mean about 61). What do you do?', 'Reduce or stop the carvedilol, and restart it once the pressure recovers.'],
    },
    {
      id: 'terli', params: { drugs: { carvedilol: false, terlipressin: true } }, cam: 'portal', data: 'tiles', tiles: ['map', 'hvpg', 'hr'], key: ['map'], delta: 'dilate',
      cite: 'Baveno VIII 6.18, 6.19',
      kicker: 'Drugs', site: 'sin', title: 'Terlipressin tightens the arteries',
      line: 'Terlipressin, a vasopressin analogue, constricts the splanchnic and systemic arteries. The mean arterial pressure rises to {map} and the HVPG falls to {hvpg}. With albumin, it treats HRS-AKI, where the kidneys fail from this underfilling.',
      notes: 'Terlipressin reverses the hyperdynamic circulation for as long as it runs: the arterial pressure rises, the heart slows and the splanchnic inflow falls. Baveno VIII 6.18 and 6.19: in HRS-AKI give terlipressin with albumin, preferably as a continuous infusion starting at 2 to 3 mg a day, which causes fewer adverse effects; norepinephrine is the alternative. Outside the US terlipressin is also used for variceal bleeding; in the US octreotide takes that place.',
      ask: ['Why does terlipressin help the kidneys in hepatorenal syndrome?', 'It constricts the wide splanchnic and systemic arteries, which raises the arterial pressure and the effective arterial volume, so the kidneys are perfused again.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['co', 'hr', 'map', 'hvpg'], asc: false, vs: 'first', calm: ['co'], rowHead: 'Patient',
      of: [{ id: 'rest', kicker: 'Reference', title: 'Healthy' }, { preset: 'cirr-comp', kicker: 'Cirrhosis', title: 'Compensated' }, { preset: 'csph', kicker: 'Cirrhosis', title: 'CSPH' }, { id: 'dilate', kicker: 'Cirrhosis', title: 'Decompensated' },
        { id: 'propranolol', kicker: 'Drug', title: 'Propranolol', vs: 'dilate' }, { id: 'carvedilol', kicker: 'Drug', title: 'Carvedilol', vs: 'dilate' }, { id: 'terli', kicker: 'Drug', title: 'Terlipressin', vs: 'dilate' }],
      kicker: 'Summary', title: 'The circulation from health to decompensation',
      line: 'As cirrhosis advances, the output and the heart rate climb while the arterial pressure falls. Beta-blockers lower the output and the HVPG; terlipressin raises the arterial pressure.',
      notes: 'The hyperdynamic circulation grows with the portal pressure: compensated cirrhosis shows little of it, decompensated cirrhosis all of it. It explains the low blood pressure of advanced cirrhosis, the salt and water retention behind ascites, and why every drug that lowers the portal pressure also acts on the systemic circulation.',
      ask: ['Which drug in this talk raises the arterial pressure, and which lowers it most?', 'Terlipressin raises it; carvedilol lowers it most.'],
    },
  ],
};
