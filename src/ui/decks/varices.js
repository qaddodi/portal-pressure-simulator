// Presenter talk: collaterals and varices (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;
const frac = (n, d) => `<mfrac><mrow>${n}</mrow><mrow>${d}</mrow></mfrac>`;

export const VARICES = {
  id: 'varices', level: 'core', title: 'Collaterals and varices', minutes: 14,
  sections: [['How collaterals form', ['Collaterals']], ['Esophageal and gastric varices', ['Varices', 'Gastric varices']], ['Other routes', ['Left-sided portal hypertension', 'Other collaterals']], ['Heart failure', ['Heart failure']]],
  summary: 'Six months of progression, then the varices and other collateral routes. Ends with why heart failure rarely causes varices.',
  objectives: ['Name the main portosystemic collaterals and where they form', 'Relate varix size and HVPG to bleeding risk', 'Recognise left-sided portal hypertension and gastric varices', 'Explain why heart failure rarely produces varices'],
  slides: [
    {
      id: 'collat', preset: 'csph', cam: 'fit', data: 'tiles', tiles: ['hvpg', 'varix', 'spleen', 'plt'],
      kicker: 'Collaterals', site: 'sin', title: 'Portosystemic collaterals',
      line: 'Where portal and systemic veins meet, small connecting veins open and swell, carrying portal blood around the liver.',
      notes: 'Portosystemic collaterals open where the portal and systemic venous beds meet: at the gastroesophageal junction (left gastric and short gastric veins to the azygos), the umbilicus (paraumbilical veins), the rectum (superior to middle and inferior rectal veins), the retroperitoneum (veins of Retzius), and through splenorenal and gastrorenal shunts. They form by reopening existing channels and by new vessel growth, driven by the portal-to-systemic gradient. Even large ones do not relieve portal hypertension: splanchnic inflow rises to fill them.',
      ask: ['Name four places where portosystemic collaterals form.', 'The gastroesophageal junction, the umbilicus, the rectum, the retroperitoneum (and splenorenal and gastrorenal shunts).'],
    },
    {
      id: 'lapse', days: 180, ramp: { cirrhosis: [0.6, 0.85] }, lapse: { seconds: 10 }, cam: 'fit', tool: { kind: 'trace' }, data: 'tiles', tiles: ['hvpg', 'varix', 'spleen', 'plt'], delta: true,
      kicker: 'Collaterals', site: 'sin', title: 'Varices grow over six months',
      line: 'HVPG climbs from about 12 to {17 mmHg}, small varices become large, the spleen enlarges and the platelets fall.',
      notes: 'The time-lapse runs the model\'s disease clock for 180 days while the cirrhosis advances. As the gradient rises, collateral flow grows (by the end about three quarters of the portal blood is shunted) and the varices enlarge. The congested spleen enlarges and holds back platelets (hypersplenism): a low platelet count with a stiff liver suggests clinically significant portal hypertension. Baveno VII advises that screening endoscopy can be skipped when liver stiffness is below 20 kPa and platelets are above 150.',
      ask: ['When can screening endoscopy be skipped in compensated cirrhosis?', 'Liver stiffness below 20 kPa and platelets above 150 (Baveno VII).'],
    },
    {
      id: 'eso', cam: 'varices', labels: ['LGV', 'VAR', 'AZY'], terms: ['lgv', 'azy'], mark: { edges: ['C1a', 'C1b'], label: 'Esophageal varices', kind: 'note' }, data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'],
      kicker: 'Varices', site: 'sin', title: 'Esophageal varices',
      line: 'The left gastric vein carries portal blood up to the lower esophagus. The submucosal veins of the lower esophagus swell and drain to the azygos.',
      notes: 'Gastroesophageal varices are the collaterals that matter most, because they bleed. Blood runs from the left gastric (coronary) and short gastric veins through veins in the wall of the lower esophagus to the azygos system. At endoscopy small varices are under 5 mm and large ones over 5 mm; red wale marks are thin spots in the wall. About half of patients have varices when cirrhosis is diagnosed.',
      ask: ['Into which systemic vein do esophageal varices drain?', 'The azygos vein.'],
    },
    {
      id: 'burst', cam: [690, -10, 890, 170], kMax: 4.5, labels: ['VAR'], tool: { kind: 'wall' }, data: 'tiles', tiles: ['varix', 'hvpg'], key: ['hvpg'],
      kicker: 'Varices', site: 'sin', title: 'Bleeding risk at 12 mmHg or more',
      eq: [mi('T') + mo('=') + frac(mi('P') + mo('⋅') + mi('r'), mi('w')), 'Laplace: T wall tension · P pressure in the varix · r radius · w wall thickness'],
      line: 'Large, thin-walled varices under high pressure are the ones that rupture. This varix measures {varix}.',
      notes: 'By Laplace\'s law the tension in a varix wall rises with the pressure inside it and its radius, and falls with the thickness of its wall. Varices do not bleed below an HVPG of 12 mmHg. Large size, red wale marks and poor liver function (Child–Pugh B or C) predict bleeding: about 10 to 15% of patients with varices bleed each year, and a bleed carries a 6-week mortality of about 15 to 20%. Large varices are treated with a non-selective beta-blocker or banding.',
      ask: ['Name three predictors of variceal bleeding.', 'Large size, red wale marks, Child–Pugh B or C (and an HVPG of 12 or more).'],
    },
    {
      id: 'fundal', preset: 'gastric-varix', cam: 'fundus', labels: ['GV', 'LRV'], terms: { 'Gastric veins': 'gv', 'left renal vein': 'lrv' }, mark: { edges: ['C5'], label: 'Gastrorenal shunt', kind: 'note' }, data: 'tiles', tiles: ['gv', 'varix'], key: ['gv'],
      kicker: 'Gastric varices', site: 'sin', title: 'Fundal varices and the gastrorenal shunt',
      line: 'Gastric veins swell in the fundus of the stomach and drain into the left renal vein through a gastrorenal shunt.',
      notes: 'Isolated fundal varices (IGV1) and those running from the esophagus along the greater curve (GOV2) usually drain through a spontaneous gastrorenal shunt to the left renal vein. They bleed less often than esophageal varices, but more heavily. They are treated with cyanoacrylate glue at endoscopy, by blocking the shunt from below (balloon-occluded retrograde transvenous obliteration, BRTO), or with TIPS. A large shunt also steals portal blood from the liver and raises the risk of encephalopathy.',
      ask: ['Which procedure blocks a gastrorenal shunt from below?', 'BRTO: balloon-occluded retrograde transvenous obliteration, through the left renal vein.'],
    },
    {
      id: 'svt', preset: 'svt', cam: 'splenic', labels: ['SV', 'CONF', 'GV'], terms: ['sv', 'pv', 'spleen', 'gv'], mark: { edges: ['SV_CONF'], label: 'Clot' }, data: 'tiles', tiles: ['pv', 'gv', 'spleen'], key: ['pv', 'gv'],
      kicker: 'Left-sided portal hypertension', site: 'pre', title: 'Splenic vein thrombosis',
      line: 'A clot in the splenic vein raises the pressure on the left only. The portal vein stays normal; the spleen swells and gastric varices form.',
      notes: 'Sinistral (left-sided) portal hypertension. Splenic blood goes around the clot through the short gastric and gastroepiploic veins, giving isolated gastric varices with a normal portal pressure and a normal liver; esophageal varices are uncommon. Pancreatitis and pancreatic cancer are the usual causes. Removing the inflow cures it: splenectomy, or splenic artery embolization.',
      ask: ['Gastric varices, a large spleen and normal liver tests after pancreatitis. Diagnosis and cure?', 'Splenic vein thrombosis; splenectomy, or splenic artery embolization.'],
    },
    {
      id: 'umbilical', preset: 'cirr-decomp', cam: 'wall', labels: ['LPV'], terms: ['lpv'], mark: { edges: ['C3'], label: 'Paraumbilical vein', kind: 'note' }, data: 'tiles', tiles: ['shunt', 'liver'],
      kicker: 'Other collaterals', site: 'sin', title: 'Paraumbilical collaterals',
      line: 'The paraumbilical vein reopens from the left portal vein to the veins of the abdominal wall. Dilated wall veins can radiate from the navel: the caput medusae.',
      notes: 'The paraumbilical veins run in the falciform ligament from the left portal vein to the abdominal wall. When they enlarge, blood flows away from the liver through them; dilated veins radiating from the umbilicus form a caput medusae, and a venous hum may be heard over them (Cruveilhier–Baumgarten). The flow runs away from the umbilicus, unlike the upward flow of IVC obstruction. These collaterals rarely bleed, but a large one steals portal blood from the liver.',
      ask: ['How do the abdominal wall veins tell portal hypertension from IVC obstruction?', 'In portal hypertension the flow radiates away from the umbilicus; in IVC obstruction it runs upward below it.'],
    },
    {
      id: 'rectal', cam: 'rectum', mark: { edges: ['C4'], label: 'Rectal varices', kind: 'note' },
      kicker: 'Other collaterals', site: 'sin', title: 'Rectal varices and shunts behind the gut',
      line: 'The superior rectal vein (portal) meets the middle and inferior rectal veins (systemic). Retroperitoneal and splenorenal shunts open too.',
      notes: 'Rectal varices are portosystemic collaterals; hemorrhoids are vascular cushions and are no more common in portal hypertension. Rectal varices bleed occasionally. The retroperitoneal veins of Retzius and spontaneous splenorenal shunts carry portal blood to the IVC and the renal veins. Together, large spontaneous shunts divert portal blood, and the ammonia it carries from the gut, past the liver, and raise the risk of encephalopathy.',
      ask: ['Are hemorrhoids a sign of portal hypertension?', 'No: rectal varices are; hemorrhoids are no more common in portal hypertension.'],
    },
    {
      id: 'nograd', preset: 'rhf', cam: 'varices', labels: ['AZY'], glow: ['azy'], data: 'tiles', tiles: ['ppg', 'varix'], key: ['ppg'],
      kicker: 'Heart failure', site: 'cardiac', title: 'Why varices are rare in heart failure',
      line: 'Collaterals need a gradient from the portal to the systemic veins. In heart failure both are high, so the PPG is {ppg} and varices are rare.',
      notes: 'Portosystemic collaterals open only where portal pressure exceeds systemic venous pressure. In right heart failure and constrictive pericarditis the systemic veins are as high as the portal vein, so the gradient that drives collateral flow is missing. In Budd–Chiari syndrome the block lies between the liver and the IVC: the portal pressure is high and the IVC normal, so varices do form.',
      ask: ['Why do varices form in Budd–Chiari syndrome but rarely in heart failure?', 'In Budd–Chiari the IVC is normal, so there is a portal-to-systemic gradient; in heart failure there is none.'],
    },
  ],
};
