// Presenter talk: the circulation in cirrhosis, wide arteries, a fast heart, a low arterial pressure and a full blood volume, and what a
// liter of blood lost does to it and to the portal pressure (the slide fields are described at the top of decks.js). One vitals monitor
// carries the whole talk; the drugs that change this circulation are in Lowering portal pressure, and the transfusion in the bleed talk.
// The old Blood volume talk is these last two slides, and keeps working by its old id (decks.js DECK_ALIAS).
// Each slide's volume runs in with the patient settled after it.

const H = { kind: 'hemorrhage', mL: 1000 }, UNIT = { kind: 'infuse', fluid: 'prbc' };
const VITALS = { kind: 'vitals', show: ['hr', 'map', 'co'] };

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;

export const HYPERDYNAMIC = {
  id: 'hyperdynamic', level: 'foundation', title: 'The circulation in cirrhosis', minutes: 8,
  objectives: [
    'Describe the hyperdynamic circulation: a higher cardiac output, a faster heart and a lower arterial pressure than in health',
    'Explain how splanchnic vasodilation adds inflow to the portal system',
    'Link arterial underfilling to sodium and water retention',
    'Explain what a 1 L blood loss, and overtransfusion, do to the arterial and the portal pressure',
  ],
  checks: [
    ['Why does the mean arterial pressure fall in cirrhosis although the cardiac output rises?', 'The systemic vascular resistance falls by more: nitric oxide and other vasodilators dilate the arteries.'],
    ['How does splanchnic vasodilation raise the portal pressure?', 'Dilated splanchnic arteries increase portal venous inflow, and a higher inflow through a high resistance keeps the pressure high.'],
    ['Why does the blood volume rise in cirrhosis although the arteries seem underfilled?', 'The kidneys retain sodium and water in response to the low effective arterial blood volume, but the extra fluid sits in the dilated splanchnic circulation and the peritoneal cavity.'],
    ['Why does the portal pressure fall during variceal hemorrhage?', 'A lower blood volume means a lower portal inflow.'],
  ],
  summary: 'Why cirrhosis raises the cardiac output and the heart rate and lowers the arterial pressure, how splanchnic vasodilation raises the portal pressure, what a 1 L blood loss does to both, and why overtransfusion raises the portal pressure.',
  slides: [
    {
      id: 'rest', preset: 'healthy', cam: 'fit', tool: VITALS,
      eq: [mi('MAP') + mo('=') + mi('CO') + mo('×') + mi('SVR'), 'Mean arterial pressure: cardiac output times systemic vascular resistance'],
      kicker: 'Health', title: 'A healthy circulation at rest',
      line: 'At rest the cardiac output is {co} at a heart rate of {hr}. The blood pressure is {map}, with the MAP in parentheses, and the blood volume is {bv}.',
      notes: 'The mean arterial pressure is the cardiac output times the systemic vascular resistance (strictly, the pressure drop from the aorta to the right atrium). Every later slide changes these values. The strip above them is a schematic rhythm timed to the model\'s heart rate, not a modeled ECG.',
      ask: ['If the cardiac output rises and the mean arterial pressure falls, what has happened to the systemic resistance?', 'It has fallen, by more than the output rose.'],
    },
    {
      id: 'dilate', preset: 'cirr-comp', params: {}, days: 365, ramp: { cirrhosis: [0.4, 0.85] }, lapse: { seconds: 10, from: 'Compensated', to: 'Large varices' }, graph: false, cam: 'fit', lens: 'flow', tool: VITALS,
      kicker: 'Cirrhosis', site: 'sin', title: 'Cirrhosis causes arterial vasodilation',
      line: 'Nitric oxide and other vasodilators dilate the arteries. A year later, the heart rate is {hr} and the cardiac output {co}, yet the blood pressure has fallen to {map}.',
      notes: 'In cirrhosis the splanchnic and systemic arteries are exposed to more vasodilators, nitric oxide first among them, and respond less to vasoconstrictors. The arterial pressure falls, the baroreflex raises the heart rate, and the cardiac output rises: the hyperdynamic circulation that AASLD describes once portal hypertension is clinically significant. In the flow view, the figure shows a higher flow through the dilated splanchnic arteries. (AASLD 2024.)',
      ask: ['Name the three findings of the hyperdynamic circulation.', 'A higher cardiac output, a faster heart rate and a lower arterial pressure than in health.'],
    },
    {
      id: 'resist', cam: 'fit', lens: 'flow', tool: VITALS,
      eq: [mi('MAP') + mo('=') + mi('CO') + mo('×') + mi('SVR'), 'Mean arterial pressure: cardiac output times systemic vascular resistance'],
      kicker: 'Cirrhosis', site: 'sin', title: 'A higher cardiac output, a lower systemic vascular resistance',
      line: 'The cardiac output rises to {co}, yet the blood pressure is {map}. A higher flow at a lower pressure means the systemic vascular resistance has fallen by even more.',
      notes: 'Rearranged, SVR = MAP ÷ CO: about 93 ÷ 5 in health, and about 82 ÷ 6.6 in this case, roughly a third lower. A cardiac output that rises while the pressure falls is the signature of vasodilation, as in sepsis or pregnancy, and the opposite of heart failure, with its low output and vasoconstriction. Both values can still be within their normal ranges (4 to 8 L/min, and a MAP ≥65 mmHg): what counts is the change from baseline, not a cut-off.',
      ask: ['A patient with cirrhosis has a MAP of 75 mmHg and a cardiac output of 7 L/min. Is the heart failing?', 'No. An output above that of health with a low MAP means a low systemic vascular resistance (SVR): the hyperdynamic circulation.'],
    },
    {
      id: 'volume', cam: 'fit', lens: 'flow', tool: VITALS, data: 'tiles', tiles: ['bv', 'pv'], key: ['bv'], delta: 'rest',
      kicker: 'Cirrhosis', site: 'sin', title: 'Arterial underfilling drives renal sodium retention',
      line: 'Dilated arteries are sensed as underfilled, so the kidneys retain sodium and water. The blood volume reaches {bv}, and ascites begins to accumulate.',
      notes: 'The fall in effective arterial blood volume activates the renin–angiotensin–aldosterone system, the sympathetic nervous system and vasopressin. The kidneys retain sodium and water and the plasma volume expands, yet the arteries stay underfilled, because the extra volume sits in the dilated splanchnic circulation and leaks into the peritoneal cavity. At the end stage, renal vasoconstriction produces hepatorenal syndrome (AASLD 2024, Figure 2). The model raises the blood volume with the disease; it does not model the kidneys.',
      ask: ['Why does the blood volume rise in cirrhosis although the arteries seem underfilled?', 'The kidneys retain sodium and water in response to the low effective arterial blood volume, but the extra fluid sits in the dilated splanchnic circulation and the peritoneal cavity.'],
    },
    {
      id: 'forward', cam: 'portal', terms: ['pv'], tool: { kind: 'causes', metric: 'pv' }, data: 'tiles', tiles: ['bv', 'pv'], key: ['pv'], delta: 'rest',
      whatIf: { label: 'Splanchnic arteriolar tone', param: 'splanchnicTone', min: 0.6, max: 1.6, step: 0.05, ends: ['Dilated', 'Constricted'] },
      kicker: 'Cirrhosis', site: 'sin', title: 'Splanchnic vasodilation keeps the portal pressure high',
      line: 'Dilated splanchnic arteries increase inflow into the [portal vein](pv) and keep its pressure at {pv}. Splanchnic vasoconstriction lowers it, as nonselective beta-blockers do.',
      notes: 'The slider sets the splanchnic arteriolar tone: dilation adds portal inflow, constriction reduces it. Portal pressure is portal inflow × the resistance it meets. Intrahepatic resistance rises first, in the fibrotic liver; once the gradient reaches about 10 mmHg, collaterals and splanchnic vasodilation follow, and the extra inflow raises the pressure further (AASLD 2024, Figure 2). The waterfall starts at the normal portal pressure. Fibrosis is the largest step to the right, splanchnic vasodilation and the expanded blood volume add inflow, and the collaterals lower the pressure again, a step to the left. The last bar is the portal pressure in the tile.',
      ask: ['Two factors determine the portal pressure. Name them.', 'The resistance to portal flow (the liver and the collaterals) and the portal inflow from the splanchnic arteries.'],
    },
    {
      id: 'full', preset: 'cirr-decomp', cam: 'route', terms: ['pv'], tool: VITALS, data: 'tiles', tiles: ['pv'], key: ['pv'],
      vignette: 'A 49-year-old woman with MASH cirrhosis has ascites controlled on spironolactone and furosemide, large esophageal varices and a serum albumin of 2.8 g/dL. She could not tolerate a beta-blocker.',
      kicker: 'Hemorrhage', site: 'sin', title: 'Blood volume contributes to the portal pressure',
      line: 'The blood volume is {bv}, and the [portal vein](pv) pressure is {pv}. Volume that expands the circulation expands the portal system too.',
      notes: 'Cirrhosis dilates the splanchnic and systemic arteries, and the kidneys retain sodium and water to fill them, so the blood volume is larger than in health. The portal pressure depends on intrahepatic resistance and on portal inflow. Volume changes the second.',
      ask: ['Name the two things that set the portal pressure.', 'The resistance to portal flow and the portal inflow.'],
    },
    {
      id: 'loss', action: H,
      question: 'What will a liter of blood loss do to the portal pressure?', cam: 'route', tool: VITALS, data: 'tiles', tiles: ['pv'], key: ['pv'], delta: 'full',
      kicker: 'Hemorrhage', site: 'sin', title: 'A 1 L blood loss lowers the portal pressure',
      line: 'A 1 L blood loss lowers the blood pressure to {map} and raises the heart rate to {hr}. Less volume means less portal inflow: the portal pressure falls to {pv}.',
      notes: 'Blood loss lowers the cardiac output and the splanchnic inflow, so pressures fall along the whole portal system. The heart rate and the arterial pressure show the loss first; the hemoglobin lags for hours, until fluid shifts into the vessels (the Acute variceal bleeding talk shows this beat by beat, with the transfusion target of 7 to 8 g/dL). A healthy circulation tolerates the same 1 L better, because its arteries can still constrict.',
      ask: ['Why does the portal pressure fall during hemorrhage?', 'A lower blood volume means a lower portal inflow.'],
    },
    {
      // (Eight units after the liter lost: the blood volume ends about 400 mL past where she started.)
      id: 'over', action: [UNIT, UNIT, UNIT, UNIT, UNIT, UNIT, UNIT, UNIT],
      cam: 'route', ripple: true, tool: VITALS, data: 'tiles', tiles: ['pv', 'hb', 'bv'], key: ['pv'], delta: 'full',
      kicker: 'Hemorrhage', site: 'sin', title: 'Overtransfusion raises the portal pressure',
      line: 'Eight units of red cells overshoot her starting volume and raise the portal pressure to {pv}, above the prebleed {pv@full}. The hemoglobin target is 7 to 8 g/dL.',
      notes: 'This is why transfusion in variceal hemorrhage is restrictive: transfuse at a hemoglobin <7 g/dL and target 7 to 8 g/dL. In cirrhosis the dilated splanchnic circulation takes up the extra volume, so the portal inflow and pressure rise above their prebleed levels, and in the trials a liberal target brought more rebleeding and more deaths. Volume restitution after hemorrhage raises the portal pressure above its prebleed level (Kravetz, in portal hypertensive animals). Plasma given to correct coagulation tests adds volume of its own. Eight units is deliberately more than anyone would give: the hemoglobin and blood volume tiles show where it ends, a hemoglobin well above the target and a volume above baseline. The heart rate settles below baseline, a sign of volume overload. Patients with cardiovascular disease or ongoing massive hemorrhage may need more. (Baveno VIII 5.4.)',
      ask: ['Why not transfuse variceal hemorrhage to a hemoglobin of 10 g/dL?', 'Extra volume raises the portal pressure above its prebleed level, and a liberal target brought more rebleeding and death.'],
    },
    {
      // (The relation chart before the summary: the model's cirrhosis from mild to severe, each point settled for a year, the cardiac output and
      // the mean arterial pressure read against the HVPG. The ring is decompensated cirrhosis.)
      id: 'relation', preset: 'cirr-decomp', cam: 'fit',
      tool: { kind: 'curve', x: 'hvpg', xCuts: [10], patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0.3, to: 1, step: 0.05, days: 365, lines: ['co', 'map'] },
      kicker: 'Summary', site: 'sin', title: 'The cardiac output rises and the arterial pressure falls as the HVPG rises',
      line: 'As the HVPG rises, the cardiac output rises and the arterial pressure falls. At {hvpg}, in decompensated cirrhosis, the cardiac output is {co} at a blood pressure of {map}.',
      notes: 'Each point is the model\'s cirrhosis from mild to severe, settled for a year: the cardiac output and the mean arterial pressure, read against the HVPG. The output rises from about 5.0 to 7.0 L/min and the mean arterial pressure falls from about 92 to 80 mmHg; the heart rate rises with them, from about 63 to 94/min. The systemic vascular resistance falls by more than the cardiac output rises, which is why the pressure falls while the output rises. AASLD 2024 describes this hyperdynamic state as systemic vasodilation with a higher cardiac output and sodium and water retention, once portal hypertension is clinically significant; the numbers on the chart are the model\'s, not the guideline\'s. The ring is decompensated cirrhosis. (AASLD 2024 Fig. 2.) One model patient per point; real patients vary far more.',
      ask: ['The HVPG climbs in a patient with cirrhosis. Which way do the cardiac output and the mean arterial pressure move?', 'The cardiac output rises and the MAP falls: the systemic vascular resistance falls by more than the output rises.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['co', 'hr', 'map', 'pv'], asc: false, vs: 'first', calm: ['co'], rowHead: 'Patient',
      of: [{ id: 'rest', kicker: 'Reference', title: 'Healthy' }, { preset: 'cirr-comp', kicker: 'Cirrhosis', title: 'Compensated' }, { preset: 'csph', kicker: 'Cirrhosis', title: 'CSPH' }, { id: 'dilate', kicker: 'Cirrhosis', title: 'Large varices' },
        { id: 'loss', kicker: 'Hemorrhage', title: '1 L blood loss' }, { id: 'over', kicker: 'Hemorrhage', title: 'Eight units transfused' }],
      kicker: 'Summary', title: 'The circulation from health to a bleed',
      line: 'As cirrhosis advances, the cardiac output and the heart rate rise while the arterial pressure falls. A 1 L blood loss then lowers the arterial and the portal pressure.',
      notes: 'The hyperdynamic circulation increases with the portal pressure: compensated cirrhosis shows little of it, decompensated cirrhosis all of it. It explains the low blood pressure of advanced cirrhosis, the sodium and water retention behind ascites, and why hemorrhage lowers the portal pressure along with the blood pressure. Every drug that lowers the portal pressure also acts on this circulation.',
      ask: ['What does a 1 L blood loss do to the portal pressure in cirrhosis, and why?', 'It lowers it, because a lower blood volume means a lower portal inflow.'],
    },
  ],
};
