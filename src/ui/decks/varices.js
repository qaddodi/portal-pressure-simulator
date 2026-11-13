// Presenter talk: collaterals and varices (the slide fields are described at the top of decks.js).
// Gastric varices have their own talk. The first four slides share the HVPG and varix tiles; the flow colours (the second lens) run over the first three.

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;
const frac = (n, d) => `<mfrac><mrow>${n}</mrow><mrow>${d}</mrow></mfrac>`;

export const VARICES = {
  id: 'varices', level: 'core', title: 'Collaterals and varices', minutes: 14,
  sections: [['How collaterals form', ['Collaterals']], ['Esophageal varices', ['Varices']], ['Other routes', ['Other collaterals']], ['Heart failure', ['Heart failure']]],
  summary: 'Six months of progression, then the esophageal varices, carvedilol at CSPH, and the other collateral routes. Ends with why heart failure rarely causes varices.',
  objectives: ['Name the main portosystemic collaterals and where they form', 'Relate varix size and HVPG to bleeding risk', 'Start carvedilol at clinically significant portal hypertension (CSPH) to prevent decompensation, not only bleeding', 'Explain why heart failure rarely produces varices'],
  checks: [
    ['Name three places where portosystemic collaterals open.', 'Any three of: the gastroesophageal junction, the umbilicus, the rectum and the retroperitoneum, including splenorenal and gastrorenal shunts.'],
    ['How does the risk of a variceal bleed change with the HVPG?', 'Varices rarely bleed at an HVPG <12 mmHg; above it the risk rises with the gradient, varix size and red wale marks.'],
    ['Why are varices rare in heart failure?', 'Portal and systemic venous pressures are both high, so the PPG stays low and there is no gradient to drive collateral flow.'],
    ['On a nonselective beta-blocker (NSBB) the HVPG falls from 16 to 11 mmHg. Is the bleeding risk gone?', 'Much lower, not gone: the fall is >10% and to <12 mmHg, a good response, but varices can still bleed at <12 mmHg, so the NSBB continues.'],
  ],
  slides: [
    {
      id: 'collat', lens: 'flow', preset: 'csph', cam: 'gej', glow: [{ id: 'lgv', soft: true }], data: 'tiles', tiles: ['hvpg', 'varix'],
      // (Four sites, three views: the junction, then the three below it, then all four on the whole plate, which a jump or Back opens on.)
      marks: [{ edges: ['C1a', 'C1b'], label: 'Gastroesophageal junction', kind: 'note' }],
      beats: [
        { cam: { on: ['C3', 'C4', 'C7'] }, marks: [{ edges: ['C3'], label: 'Umbilicus', kind: 'note' }, { edges: ['C4'], label: 'Rectum', kind: 'note' }, { edges: ['C7'], label: 'Retroperitoneum', kind: 'note' }] },
        { cam: 'fit', marks: [{ edges: ['C1a', 'C1b'], label: 'Gastroesophageal junction', kind: 'note' }, { edges: ['C3'], label: 'Umbilicus', kind: 'note' }, { edges: ['C4'], label: 'Rectum', kind: 'note' }, { edges: ['C7'], label: 'Retroperitoneum', kind: 'note' }] },
      ],
      kicker: 'Collaterals', site: 'sin', title: 'Collaterals open where portal and systemic veins meet',
      vignette: 'A 59-year-old man with alcohol-associated cirrhosis continues to drink. His platelet count is 90,000/µL, and EGD shows small esophageal varices.',
      line: 'Collaterals open at the gastroesophageal junction, the umbilicus, the rectum and the retroperitoneum, some by recanalization of existing channels and some by neoangiogenesis.',
      notes: 'Portosystemic collaterals open where the portal and systemic venous beds meet: at the gastroesophageal junction (left gastric and short gastric veins to the azygos), the umbilicus (paraumbilical veins), the rectum (superior to middle and inferior rectal veins), the retroperitoneum (veins of Retzius), and through splenorenal and gastrorenal shunts. They form by recanalization of existing channels and by neoangiogenesis, driven by the portal pressure gradient. Even large collaterals do not relieve portal hypertension, because splanchnic inflow rises to fill them. On the flow view, vessels that carry little blood in health fill as the collaterals open.',
      ask: ['Name four places where portosystemic collaterals form.', 'The gastroesophageal junction, the umbilicus, the rectum, the retroperitoneum (and splenorenal and gastrorenal shunts).'],
    },
    {
      id: 'lapse', lens: 'flow', days: 180, ramp: { cirrhosis: [0.6, 0.85] }, lapse: { seconds: 10, cam: 'varices' }, cam: 'fit', calipers: ['varix'], tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'varix'], title: 'HVPG and varix over the days' }, data: 'tiles', tiles: ['hvpg', 'varix'], delta: true,
      kicker: 'Collaterals', site: 'sin', title: 'Varices grow as the gradient climbs',
      line: 'Over six months, years compressed in the model, the HVPG climbs from {hvpg@collat} to {hvpg}, and small varices become large.',
      notes: 'The time-lapse runs the model\'s disease clock for 180 days while the cirrhosis advances; in patients this takes years, and about 1 in 10 small varices become large each year. As the gradient rises, collateral flow increases (by the end about two thirds of portal flow is shunted) and the varices enlarge. Congestive splenomegaly sequesters platelets (hypersplenism): thrombocytopenia with a high liver stiffness measurement (LSM) suggests CSPH. Baveno VIII\'s endoscopy-sparing rule: screening endoscopy can be avoided when LSM is <20 kPa and the platelet count is ≥150,000/µL.',
      ask: ['Over six months the HVPG climbs. What happens to the varices?', 'They grow from small to large as the gradient rises, and more portal flow is shunted through collaterals.'],
    },
    {
      id: 'eso', lens: 'flow', cam: 'varices', spot: ['@esophageal'], labels: ['LGV', 'VAR', 'AZY'], terms: ['lgv', 'azy', 'varix'], mark: { edges: ['C1a', 'C1b'], label: 'Esophageal varices', kind: 'note' }, data: 'tiles', tiles: ['hvpg', 'varix'], key: ['varix'],
      kicker: 'Varices', site: 'sin', title: 'Esophageal varices drain to the azygos vein',
      line: 'The left gastric vein is the main feeder of esophageal varices, which drain to the azygos vein; the short gastric veins mostly feed fundal varices.',
      notes: 'Gastroesophageal varices are the collaterals that matter most, because they bleed. Blood runs mainly from the left gastric (coronary) vein through veins in the wall of the lower esophagus to the azygos system. Both layers enlarge: the palisade veins in the lamina propria, which are seen at endoscopy, and the submucosal veins beneath them. The left gastric vein is also called the coronary vein. At endoscopy small varices are <5 mm and large ones ≥5 mm; red wale marks are areas of wall thinning. About half of patients have varices when cirrhosis is diagnosed. On the flow view, the varices and the azygos vein carry flow they barely carry in health.',
      ask: ['Into which systemic vein do esophageal varices drain?', 'The azygos vein.'],
    },
    {
      id: 'burst', terms: ['varix'], cam: [690, -10, 890, 170], kMax: 4.5, labels: ['VAR'], tool: { kind: 'wall' }, dataTitle: 'Wall stress', data: 'tiles', tiles: ['hvpg', 'varix'], key: ['hvpg'],
      kicker: 'Varices', site: 'sin', title: 'Bleeding risk rises steeply from an HVPG of about 12 mmHg',
      eq: [mi('σ') + mo('=') + frac(mi('P') + mo('⋅') + mi('r'), mi('w')), 'Laplace: σ wall stress · P transmural pressure · r radius · w wall thickness'],
      line: 'Wall stress rises with transmural pressure and radius and falls with wall thickness: large, thin-walled varices rupture, rarely at an HVPG <12 mmHg.',
      notes: 'By Laplace\'s law, variceal wall stress rises with the transmural pressure and the radius and falls with wall thickness. Varices rarely bleed at an HVPG <12 mmHg. Large size, red wale marks and poor hepatic function (Child–Pugh B or C) predict bleeding: about 5% of small varices and 15% of large ones bleed each year, and an acute variceal bleed carries a 6-week mortality of about 10 to 15% (AASLD 2024). Large varices are treated with an NSBB or endoscopic variceal ligation (EVL).',
      ask: ['Two patients have 6 mm varices: one is Child–Pugh A without red wale marks, the other Child–Pugh C with red wale marks. Who is more likely to bleed, and why?', 'The Child–Pugh C patient: red wale marks indicate a thinner wall, and Child–Pugh C goes with a higher portal pressure and impaired hemostasis.'],
    },
    {
      // (Baveno VIII 3.15 after PREDESCI: a nonselective beta-blocker, carvedilol preferred, for CSPH itself, to prevent decompensation.
      // The first slide's patient again, now on carvedilol; the response tile reads the fall from her HVPG there.)
      id: 'predesci', preset: 'csph', params: { drugs: { carvedilol: true } }, cam: 'liver', glow: ['liver'], tool: { kind: 'hvpg' }, data: 'tiles', tiles: ['map', 'hr'], key: ['hvpgFall'], hvpgResp: 'collat', delta: 'collat',   // (no varix tile: it follows the pressure at once in the model, as a drug does not; put 'varix' back once the slow varix lag is in the engine)
      kicker: 'Varices', site: 'sin', title: 'Carvedilol at CSPH prevents decompensation, not only bleeding',
      line: 'An NSBB is now given for CSPH itself, to prevent ascites and other decompensation, not only for large varices. Carvedilol lowers his HVPG from {hvpg@collat} to {hvpg}.',
      notes: 'This is the largest change in practice of the last decade. In PREDESCI, patients with compensated cirrhosis and CSPH (HVPG ≥10 mmHg) but no high-risk varices were given propranolol or carvedilol, or placebo: the beta-blocker lowered decompensation or death, mostly by preventing ascites. Baveno VIII therefore recommends a nonselective beta-blocker, carvedilol preferred, for compensated cirrhosis with CSPH (3.15), and a patient who takes one needs no screening endoscopy, because what it finds would not change treatment (3.18). Carvedilol starts at 6.25 mg/day and is increased to 12.5 mg/day if the systolic blood pressure stays >90 mmHg. Without CSPH an NSBB does not prevent decompensation and is not used for it. The model shows the HVPG response; the fall in decompensation is a trial result the model does not simulate. A beta-blocker does not shrink varices within days, so the varix is not shown here; in the model it follows the pressure at once.',
      ask: ['A man with compensated cirrhosis has CSPH and only small varices. Does he need an NSBB?', 'Yes: carvedilol, to prevent decompensation, not only bleeding. On carvedilol he needs no screening endoscopy.'],
    },
    {
      // (Three views, one per Next: the paraumbilical vein, then the rectal varices, then both routes together, which a jump or Back opens on.)
      id: 'umbilical', preset: 'cirr-decomp', cam: 'wall', labels: ['LPV'], terms: ['lpv', 'pv'], marks: [{ edges: ['C3'], label: 'Paraumbilical vein', kind: 'note' }], tool: { kind: 'flows' }, data: 'tiles', tiles: ['liver'],
      beats: [
        { cam: 'rectum', labels: [], terms: [], marks: [{ edges: ['C4'], label: 'Rectal varices', kind: 'note' }] },
        { cam: [380, 330, 1020, 960], labels: ['LPV'], terms: ['lpv', 'pv'], marks: [{ edges: ['C3'], label: 'Paraumbilical vein', kind: 'note' }, { edges: ['C4'], label: 'Rectal varices', kind: 'note' }] },
      ],
      kicker: 'Other collaterals', site: 'sin', title: 'The paraumbilical and rectal veins also decompress the portal system',
      line: 'The paraumbilical vein, arising from the left portal vein, and the rectal veins carry portal flow around the liver to systemic veins.',
      notes: 'The paraumbilical veins run in the falciform ligament from the left portal vein to the abdominal wall. When they enlarge, dilated veins radiating from the umbilicus form a caput medusae, and a venous hum may be heard over them (Cruveilhier–Baumgarten). Flow runs away from the umbilicus, unlike the cephalad flow of IVC obstruction. The superior rectal vein drains to the portal system and the middle and inferior rectal veins to the systemic, so rectal varices form where they meet; hemorrhoids are vascular cushions and are no more common in portal hypertension. The retroperitoneal veins of Retzius and spontaneous splenorenal shunts carry portal blood to the IVC and the renal veins. These collaterals rarely bleed, but large ones divert portal flow, with its gut-derived ammonia, around the liver and raise the risk of hepatic encephalopathy (HE).',
      ask: ['How do the abdominal wall veins distinguish portal hypertension from IVC obstruction?', 'In portal hypertension flow radiates away from the umbilicus; in IVC obstruction it runs cephalad below it.'],
    },
    {
      id: 'nograd', preset: 'rhf', cam: 'varices', labels: ['AZY'], glow: ['azy'], tool: { kind: 'profile' }, data: 'tiles', tiles: ['varix'], key: ['ppg'],
      compare: [{ label: 'Heart failure', short: 'Heart', own: true }, { label: 'Budd–Chiari', short: 'Budd–Chiari', preset: 'budd-chiari' }],
      kicker: 'Heart failure', site: 'cardiac', title: 'Varices are rare in heart failure because there is no portal pressure gradient',
      vignette: 'A 73-year-old man with severe TR has ascites, leg edema and an elevated JVP. Screening EGD shows no varices.',
      line: 'Collaterals need a portal pressure gradient, and in heart failure portal and systemic venous pressures are both high, so the PPG is {ppg} and varices are rare.',
      notes: 'Portosystemic collaterals open only where portal pressure exceeds systemic venous pressure. In right heart failure and constrictive pericarditis systemic venous pressure is as high as portal pressure, so there is no gradient to drive collateral flow. In Budd–Chiari syndrome the resistance lies between the liver and the heart: portal pressure is high, while the systemic veins that receive collateral flow (the azygos, the right atrium) stay at normal pressure, so a gradient forms and varices develop.',
      ask: ['Why do varices form in Budd–Chiari syndrome but rarely in heart failure?', 'In Budd–Chiari the resistance lies between the liver and the heart, so the systemic veins that receive collateral flow (the azygos, the right atrium) stay at normal pressure and a gradient forms; in heart failure their pressure is high too.'],
    },
    {
      // (The relation chart before the summary: the model's cirrhosis from mild to severe, each point settled for a year, the varix
      // and its wall stress read against the HVPG. CSPH and the Varices slide's patient are points; the ring is decompensated cirrhosis.)
      id: 'relation', preset: 'cirr-decomp', cam: 'varices', labels: ['VAR'],
      tool: { kind: 'curve', x: 'hvpg', xCuts: [10], cuts: 'ticks', patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0.3, to: 1, step: 0.05, days: 365, lines: ['varix', 'wall'],
        dots: [{ slide: 'collat', name: 'CSPH' }] },
      kicker: 'Summary', site: 'sin', title: 'Varices grow once the HVPG exceeds 10 mmHg',
      line: 'At an HVPG <10 mmHg the vein keeps a normal caliber. Above it, varix size and wall stress climb together: at {hvpg}, the varix is {varix}.',
      notes: 'Each point is the model\'s cirrhosis settled for a year, the varix diameter and its wall stress (as a fraction of the rupture stress) read against the HVPG. Collaterals form once the gradient reaches about 10 mmHg (AASLD 2024 Fig. 2), and the varix then widens with it. The wall stress rises faster than the size, because by Laplace\'s law it grows with the transmural pressure and the radius together (AASLD 2024 p. 1193). Red wale marks appear from about 70% of the rupture stress. The amber 2.5 and red 5 on the left scale are the small and large varix cut-offs, in mm. The ring is decompensated cirrhosis; the point is CSPH, the first slide\'s patient. (AASLD 2024 Fig. 2, p. 1193.) One model patient per point; real patients vary far more.',
      ask: ['Why does the wall stress climb faster than the varix diameter?', 'Wall stress is proportional to transmural pressure × radius, so the two rising together multiply.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'varix'], asc: false, note: 'Bleeding risk', rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', note: 'None', ref: true }, { preset: 'cirr-comp', site: 'sin', kicker: 'Sinusoidal', title: 'Compensated, no CSPH', note: 'None yet: no varices' },
        { id: 'collat', kicker: 'Sinusoidal', title: 'Compensated, CSPH', note: 'Rising: small varices can grow' }, { id: 'burst', kicker: 'Sinusoidal', title: 'Large varices', note: 'Highest: large varices' }],
      kicker: 'Summary', title: 'Gradient, varix size and bleeding risk',
      line: 'Varices appear with CSPH and grow as the gradient climbs, and their size largely determines the risk of a first bleed.',
      notes: 'Read from top to bottom, the gradient and the varix grow together. Varices are a sign of clinically significant portal hypertension, so none are expected before it, small varices appear with it, and large varices follow as the gradient climbs. Large varices carry the highest risk of a first bleed: in the natural-history studies AASLD 2024 quotes, about 15% of large varices bled within a year. Red wale marks and a higher Child–Pugh class raise the risk further.',
      ask: ['Which varices count as high risk?', 'Medium or large varices, and varices of any size with red wale marks or in a patient with Child–Pugh C cirrhosis (AASLD 2024).'],
    },
  ],
};
