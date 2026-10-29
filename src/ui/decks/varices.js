// Presenter talk: collaterals and varices (the slide fields are described at the top of decks.js).
// Gastric varices have their own talk. The first four slides share the HVPG and varix tiles; the flow colours (the second lens) run over the first three.

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;
const frac = (n, d) => `<mfrac><mrow>${n}</mrow><mrow>${d}</mrow></mfrac>`;

export const VARICES = {
  id: 'varices', level: 'core', title: 'Collaterals and varices', minutes: 14,
  sections: [['How collaterals form', ['Collaterals']], ['Esophageal varices', ['Varices']], ['Other routes', ['Other collaterals']], ['Heart failure', ['Heart failure']]],
  summary: 'Six months of progression, then the esophageal varices and the other collateral routes. Ends with why heart failure rarely causes varices.',
  objectives: ['Name the main portosystemic collaterals and where they form', 'Relate varix size and HVPG to bleeding risk', 'Explain why heart failure rarely produces varices'],
  checks: [
    ['Name three places where portosystemic collaterals open.', 'Any three of: the gastroesophageal junction, the umbilicus, the rectum and the retroperitoneum, including splenorenal and gastrorenal shunts.'],
    ['How does the risk of a variceal bleed change with the HVPG?', 'Varices rarely bleed below an HVPG of about 12 mmHg; above it the risk rises with the gradient, the varix size and red signs.'],
    ['Why are varices rare in heart failure?', 'Portal and systemic pressures are both high, so the PPG stays low and nothing drives blood into collaterals.'],
    ['On a beta-blocker the HVPG falls from 16 to 11 mmHg. Is the bleeding risk gone?', 'Much lower, not gone: the fall is >10% and <12 mmHg, a good response, but varices can still bleed <12, so the drug continues.'],
  ],
  slides: [
    {
      id: 'collat', lens: 'flow', preset: 'csph', cam: 'fit', glow: [{ id: 'lgv', soft: true }], data: 'tiles', tiles: ['hvpg', 'varix'],
      kicker: 'Collaterals', site: 'sin', title: 'Collaterals open where portal and systemic veins meet',
      vignette: 'A 59-year-old man with alcohol-associated cirrhosis keeps drinking. His platelets are 88,000/µL, and endoscopy shows small esophageal varices.',
      line: 'Collaterals open at the gastroesophageal junction, the umbilicus, the rectum and the retroperitoneum, some by reopening old channels and some as new vessels.',
      notes: 'Portosystemic collaterals open where the portal and systemic venous beds meet: at the gastroesophageal junction (left gastric and short gastric veins to the azygos), the umbilicus (paraumbilical veins), the rectum (superior to middle and inferior rectal veins), the retroperitoneum (veins of Retzius), and through splenorenal and gastrorenal shunts. They form by reopening existing channels and by new vessel growth, driven by the portal-to-systemic gradient. Even large ones do not relieve portal hypertension: splanchnic inflow rises to fill them. On the figure, colored by flow, the vessels that carry little blood in health fill as the collaterals open.',
      ask: ['Name four places where portosystemic collaterals form.', 'The gastroesophageal junction, the umbilicus, the rectum, the retroperitoneum (and splenorenal and gastrorenal shunts).'],
    },
    {
      id: 'lapse', lens: 'flow', days: 180, ramp: { cirrhosis: [0.6, 0.85] }, lapse: { seconds: 10, cam: 'varices' }, cam: 'fit', calipers: ['varix'], tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'varix'], title: 'HVPG and varix over the days' }, data: 'tiles', tiles: ['hvpg', 'varix'], delta: true,
      kicker: 'Collaterals', site: 'sin', title: 'Varices grow as the gradient climbs',
      line: 'Over six months the HVPG climbs from {hvpg@collat} to {hvpg}, and small varices become large.',
      notes: 'The time-lapse runs the model\'s disease clock for 180 days while the cirrhosis advances; in patients this takes years, and about 1 in 10 small varices become large each year. As the gradient rises, collateral flow grows (by the end about three quarters of the portal blood is shunted) and the varices enlarge. The congested spleen enlarges and holds back platelets (hypersplenism): a low platelet count with a stiff liver suggests clinically significant portal hypertension. Baveno VIII\'s scope-sparing rule: screening endoscopy can be skipped when liver stiffness is below 20 kPa and platelets are 150 or more.',
      ask: ['Over six months the HVPG climbs. What happens to the varices?', 'They grow from small to large as the gradient rises, and more portal blood is shunted through collaterals.'],
    },
    {
      id: 'eso', lens: 'flow', cam: 'varices', spot: ['@esophageal'], labels: ['LGV', 'VAR', 'AZY'], terms: ['lgv', 'azy', 'varix'], mark: { edges: ['C1a', 'C1b'], label: 'Esophageal varices', kind: 'note' }, data: 'tiles', tiles: ['hvpg', 'varix'], key: ['varix'],
      kicker: 'Varices', site: 'sin', title: 'Esophageal varices drain to the azygos vein',
      line: 'Colored by flow, the left gastric vein and the short gastric veins fill the esophageal varices, which drain to the azygos vein.',
      notes: 'Gastroesophageal varices are the collaterals that matter most, because they bleed. Blood runs from the left gastric (coronary) and short gastric veins through veins in the wall of the lower esophagus to the azygos system. Both layers enlarge: the palisade veins in the lamina propria, which the scope sees, and the submucosal veins beneath them. The left gastric vein is also called the coronary vein. At endoscopy small varices are under 5 mm and large ones are 5 mm or more; red wale marks are thin spots in the wall. About half of patients have varices when cirrhosis is diagnosed. On the figure, colored by flow, the varices and the azygos vein carry blood they barely carry in health.',
      ask: ['Into which systemic vein do esophageal varices drain?', 'The azygos vein.'],
    },
    {
      id: 'burst', terms: ['varix'], cam: [690, -10, 890, 170], kMax: 4.5, labels: ['VAR'], tool: { kind: 'wall' }, dataTitle: 'Wall stress', data: 'tiles', tiles: ['hvpg', 'varix'], key: ['hvpg'],
      kicker: 'Varices', site: 'sin', title: 'Bleeding risk rises steeply from an HVPG of about 12',
      eq: [mi('σ') + mo('=') + frac(mi('P') + mo('⋅') + mi('r'), mi('w')), 'Laplace: σ wall stress · P pressure across the varix wall · r radius · w wall thickness'],
      line: 'Wall stress rises with the pressure across the wall and with the radius, and falls with the wall\'s thickness, so large, thin-walled varices under high pressure rupture.',
      notes: 'By Laplace\'s law the stress in a varix wall rises with the pressure across it and its radius, and falls with the thickness of its wall. Varices rarely bleed below an HVPG of 12 mmHg. Large size, red wale marks and poor liver function (Child–Pugh B or C) predict bleeding: about 10 to 15% of patients with varices bleed each year, and a bleed carries a 6-week mortality of about 15 to 20%. Large varices are treated with a non-selective beta-blocker or banding.',
      ask: ['Two patients have 6 mm varices: one is Child–Pugh A without red signs, the other Child–Pugh C with red wale marks. Who is more likely to bleed, and why?', 'The Child–Pugh C patient: red wale marks show a thinner wall, and poor liver function goes with a higher pressure and worse clotting.'],
    },
    {
      // (Three views, one per Next: the paraumbilical vein, then the rectal varices, then both routes together, which a jump or Back opens on.)
      id: 'umbilical', preset: 'cirr-decomp', cam: 'wall', labels: ['LPV'], terms: ['lpv', 'pv'], marks: [{ edges: ['C3'], label: 'Paraumbilical vein', kind: 'note' }], tool: { kind: 'flows' }, data: 'tiles', tiles: ['liver'],
      beats: [
        { cam: 'rectum', labels: [], terms: [], marks: [{ edges: ['C4'], label: 'Rectal varices', kind: 'note' }] },
        { cam: [380, 330, 1020, 960], labels: ['LPV'], terms: ['lpv', 'pv'], marks: [{ edges: ['C3'], label: 'Paraumbilical vein', kind: 'note' }, { edges: ['C4'], label: 'Rectal varices', kind: 'note' }] },
      ],
      kicker: 'Other collaterals', site: 'sin', title: 'Other collaterals: the paraumbilical and rectal routes',
      line: 'The paraumbilical vein from the left portal vein and the rectal veins both carry portal blood past the liver to systemic veins.',
      notes: 'The paraumbilical veins run in the falciform ligament from the left portal vein to the abdominal wall. When they enlarge, dilated veins radiating from the umbilicus form a caput medusae, and a venous hum may be heard over them (Cruveilhier–Baumgarten). The flow runs away from the umbilicus, unlike the upward flow of IVC obstruction. The superior rectal vein drains to the portal system and the middle and inferior rectal veins to the systemic, so rectal varices form where they meet; hemorrhoids are vascular cushions and are no more common in portal hypertension. The retroperitoneal veins of Retzius and spontaneous splenorenal shunts carry portal blood to the IVC and the renal veins. These collaterals rarely bleed, but large ones divert portal blood, and the ammonia it carries from the gut, past the liver and raise the risk of encephalopathy.',
      ask: ['How do the abdominal wall veins tell portal hypertension from IVC obstruction?', 'In portal hypertension the flow radiates away from the umbilicus; in IVC obstruction it runs upward below it.'],
    },
    {
      id: 'nograd', preset: 'rhf', cam: 'varices', labels: ['AZY'], glow: ['azy'], data: 'tiles', tiles: ['ppg', 'varix'], key: ['ppg'],
      kicker: 'Heart failure', site: 'cardiac', title: 'Why varices are rare in heart failure',
      vignette: 'A 73-year-old man with severe TR has ascites, leg edema and a raised JVP. Screening endoscopy shows no varices.',
      line: 'Collaterals need a gradient from the portal to the systemic veins, and in heart failure both are high, so the PPG is {ppg} and varices are rare.',
      notes: 'Portosystemic collaterals open only where portal pressure exceeds systemic venous pressure. In right heart failure and constrictive pericarditis the systemic veins are as high as the portal vein, so the gradient that drives collateral flow is missing. In Budd–Chiari syndrome the resistance lies between the liver and the heart: the portal pressure is high, while the veins the collaterals drain into (the azygos, the right atrium) stay normal, so a gradient opens and varices form.',
      ask: ['Why do varices form in Budd–Chiari syndrome but rarely in heart failure?', 'In Budd–Chiari the resistance lies between the liver and the heart, so the veins the collaterals drain into (the azygos, the right atrium) stay normal and a gradient opens; in heart failure those veins are high too.'],
    },
    {
      // (The relation chart before the summary: the model's cirrhosis from mild to severe, each point settled for a year, the varix
      // and its wall stress read against the HVPG. CSPH and the Varices slide's patient are points; the ring is decompensated cirrhosis.)
      id: 'relation', preset: 'cirr-decomp', cam: 'varices', labels: ['VAR'],
      tool: { kind: 'curve', x: 'hvpg', xCuts: [10], cuts: 'ticks', patient: { preset: 'healthy' }, param: 'cirrhosis', from: 0.3, to: 1, step: 0.05, days: 365, lines: ['varix', 'wall'],
        dots: [{ slide: 'collat', name: 'CSPH' }] },
      kicker: 'Summary', site: 'sin', title: 'Varices grow once the HVPG passes 10',
      line: 'Below an HVPG of 10 mmHg the varix stays a normal vein. Above it the varix and its wall stress climb together: at {hvpg}, the varix is {varix}.',
      notes: 'Each point is the model\'s cirrhosis settled for a year, the varix diameter and its wall stress (as a share of the stress at which it tears) read against the HVPG. Collaterals form once the gradient reaches about 10 mmHg (AASLD 2024 Fig. 2), and the varix then widens with it. The wall stress rises faster than the size, because by Laplace\'s law it grows with the pressure across the wall and with the radius together (AASLD 2024 p. 1193). Red wale marks show from about 70% of the tear point. The amber 2.5 and red 5 on the left scale are the small and large varix cut-offs, in mm. The ring is decompensated cirrhosis; the point is CSPH, the first slide\'s patient. (AASLD 2024 Fig. 2, p. 1193.)',
      ask: ['Why does the wall stress climb faster than the varix diameter?', 'Wall stress grows with the pressure across the wall times the radius, so both rising together multiply.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'varix'], asc: false, note: 'Risk of a bleed', rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', note: 'None', ref: true }, { preset: 'cirr-comp', site: 'sin', kicker: 'Sinusoidal', title: 'Compensated cirrhosis', note: 'None yet: no varices' },
        { id: 'collat', kicker: 'Sinusoidal', title: 'CSPH', note: 'Rising: small varices can grow' }, { id: 'burst', kicker: 'Sinusoidal', title: 'Decompensated cirrhosis', note: 'Highest: large varices' }],
      kicker: 'Summary', title: 'Gradient, varix size and bleeding risk',
      line: 'Varices appear with clinically significant portal hypertension and grow as the gradient climbs, and their size decides how likely a bleed is.',
      notes: 'Read from top to bottom, the gradient and the varix grow together. Varices are a sign of clinically significant portal hypertension, so none are expected before it, a small varix appears with it, and a large one follows as the gradient climbs. Large varices carry the highest risk of a first bleed: in the natural-history studies AASLD 2024 quotes, about 15% of large varices bled within a year. Red wale marks and a higher Child–Pugh class raise the risk further.',
      ask: ['Which varices count as high risk?', 'Medium or large varices, and varices of any size with red wale marks or in a patient with Child–Pugh C cirrhosis (AASLD 2024).'],
    },
  ],
};
