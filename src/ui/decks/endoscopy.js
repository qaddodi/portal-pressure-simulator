// Presenter talk: Endoscopy and the varix (Core). Slide fields as documented at the top of decks.js.
// Endoscopy is of the esophagus only; gastric varices stay on the anatomy (the varices deck).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;
const frac = (n, d) => `<mfrac><mrow>${n}</mrow><mrow>${d}</mrow></mfrac>`;
const BANDS = [{ kind: 'band' }, { kind: 'band' }, { kind: 'band' }, { kind: 'band' }];
// (params: {} makes the sequence settle the patient after the action, so the pressures show the new volume.)
const UNITS = [{ kind: 'infuse', fluid: 'prbc' }, { kind: 'infuse', fluid: 'prbc' }, { kind: 'infuse', fluid: 'prbc' }, { kind: 'infuse', fluid: 'prbc' }];

export const ENDOSCOPY = {
  id: 'endoscopy', level: 'core', title: 'Endoscopy and the varix', minutes: 12,
  objectives: [
    'Decide who needs a screening endoscopy and who can skip it',
    'Grade varices by size and red signs, and explain why large ones burst',
    'Manage a variceal bleed: octreotide, restrictive transfusion and banding',
    'Explain why banding needs a beta-blocker beside it',
  ],
  checks: [
    ['When is a varix called large?', 'Over 5 mm: it bulges into the lumen and does not flatten with air.'],
    ['To what hemoglobin do you transfuse in a variceal bleed?', '7 to 8 g/dL. More volume raises the portal pressure and the risk of rebleeding.'],
    ['Why does banding need a beta-blocker beside it?', 'Banding closes the varices but leaves the portal pressure unchanged, so new varices form.'],
  ],
  summary: 'One patient seen through the scope: screening, growing and large varices, wall tension, a bleed, transfusion, octreotide and band ligation.',
  slides: [
    {
      id: 'screen', preset: 'cirr-comp', cam: 'gej', labels: ['VAR', 'LGV'], tool: { kind: 'scope', open: true },
      data: 'tiles', tiles: ['hvpg'], key: ['hvpg'],
      cite: 'Baveno VIII 1.19',
      kicker: 'Endoscopy', site: 'sin', title: 'Not every patient needs a screening scope',
      vignette: 'A 49-year-old woman with MASH cirrhosis feels well. Her platelets are 159,000/µL, and her liver stiffness is 12.5 kPa. She takes no beta-blocker.',
      line: 'A scope is needed only when no beta-blocker is given and stiffness and platelets do not spare it. In compensated cirrhosis the esophagus is often still normal.',
      notes: 'Baveno VIII has two bedside rules, each for its own decision: stiffness of 15 kPa or less with platelets of 150 or more rules out CSPH, and stiffness under 20 kPa with platelets of 150 or more spares the screening scope. A patient with a liver stiffness under 20 kPa and platelets of 150 or more can skip the screening endoscopy, because the chance of varices needing treatment is very low; stiffness and platelets are then repeated every year. Patients with clinically significant portal hypertension who take carvedilol do not need a screening endoscopy either, since the drug prevents decompensation whatever the varices. Those who cannot take a beta-blocker are scoped, unless stiffness and platelets, or a spleen stiffness under 40 kPa, spare them.',
      ask: ['Which compensated patients can skip a screening endoscopy?', 'Those taking carvedilol for CSPH, and those with liver stiffness under 20 kPa and platelets of 150 or more (Baveno VIII).'],
    },
    {
      id: 'grow', terms: ['varix'], days: 180, ramp: { cirrhosis: [0.4, 0.6] }, lapse: { seconds: 10 }, cam: 'gej', labels: ['VAR', 'LGV'], tool: { kind: 'scope', open: true },
      data: 'tiles', tiles: ['hvpg'], key: ['hvpg'], delta: true,
      kicker: 'Endoscopy', site: 'sin', title: 'Small varices appear six months on',
      line: 'The HVPG has risen to {hvpg}, 10 mmHg or more (CSPH), so varices are more likely. Blue columns have risen in the lower esophagus; small varices are under 5 mm.',
      notes: 'Varices become possible once the HVPG reaches 10 mmHg, the threshold of clinically significant portal hypertension, and the risk rises with the gradient; below 10 they form less often, not never. Small varices become large in about one patient in ten each year. They start in the lower esophagus, where the palisade veins lie superficial in the lamina propria; deeper, the submucosal veins enlarge too. Small varices are under 5 mm and flatten with air; large ones are over 5 mm and do not.',
      ask: ['Below what HVPG are new varices uncommon?', '10 mmHg.'],
    },
    {
      id: 'large', terms: ['varix'], preset: 'cirr-decomp', cam: 'gej', labels: ['VAR', 'LGV'], mark: { edges: ['C1a'], label: 'Large varices', kind: 'note' }, calipers: ['varix'], tool: { kind: 'scope', open: true },
      data: 'tiles', tiles: ['hvpg'], key: ['hvpg'],
      compare: [{ label: 'CSPH', preset: 'csph' }, { label: 'Decompensated', own: true }],
      kicker: 'Endoscopy', site: 'sin', title: 'Size and red signs predict the first bleed',
      line: 'Varices over 5 mm bulge into the lumen and do not flatten with air; this one is {varix}. Red wale marks show where the wall has thinned.',
      notes: 'The size, the red signs (red wale marks, cherry-red spots) and the Child–Pugh class predict the first bleed. Large varices, or small ones with red signs or in Child–Pugh C, need prophylaxis: a non-selective beta-blocker (carvedilol preferred) or band ligation. With ascites and varices, Baveno VIII recommends a beta-blocker, carvedilol preferred, to prevent a first bleed and to lower the risk of ascites complications, reducing or stopping it if the systolic pressure stays below 90 mmHg, the mean below 65 mmHg, or kidney injury develops.',
      ask: ['Name two endoscopic findings that predict a first bleed.', 'Size over 5 mm and red signs (red wale marks or cherry-red spots).'],
    },
    {
      id: 'tension', terms: ['varix'], cam: [745, 170, 875, 335], kMax: 4.5, labels: ['VAR'], tool: { kind: 'wall', open: true },
      data: 'tiles', tiles: ['varix', 'pv'], key: ['varix'],
      kicker: 'Why varices burst', site: 'sin', title: 'Large, thin-walled varices are the ones that bleed',
      eq: [mi('T') + mo('=') + frac('<mi mathvariant="normal">Δ</mi><mi>P</mi>' + mo('·') + mi('r'), mi('w')), 'T wall tension · ΔP pressure in the varix minus the lumen · r radius · w wall thickness'],
      line: 'Tension rises with the pressure across the wall and the radius, and falls with wall thickness. This varix is {varix} across.',
      notes: 'Laplace\'s law explains why size and red signs matter: a wide varix with a thin wall carries much more tension at the same pressure. Varices rarely bleed below an HVPG of about 12 mmHg, and the risk climbs steeply above it. Lowering the pressure (beta-blockers) or the radius (banding) lowers the tension.',
      ask: ['Using Laplace\'s law, name two ways to lower the tension in a varix wall.', 'Lower the pressure in it, or its radius.'],
    },
    {
      id: 'bleed', params: {}, action: [{ kind: 'hemorrhage', mL: 1000 }], cam: 'feeder', labels: ['VAR', 'CONF'], ripple: true,
      data: 'tiles', tiles: ['map', 'pv', 'hvpg'], key: ['map', 'pv'], delta: true,
      kicker: 'Variceal bleeding', site: 'sin', title: 'A bleed lowers the portal pressure for a while',
      line: 'A liter is lost. The blood pressure falls to {map}, and the portal pressure to {pv} with the volume.',
      notes: 'Suspected variceal bleeding is treated before the scope confirms it: octreotide at once, ceftriaxone, and careful volume replacement; endoscopy within 12 hours, once the circulation is restored. The portal pressure falls with the lost volume, which is part of why many bleeds stop for a while on their own, and why they restart when the volume returns.',
      ask: ['Why does portal pressure fall during a bleed?', 'Less blood volume means less splanchnic inflow and lower venous pressures.'],
    },
    {
      id: 'oct', params: { drugs: { octreotide: true } }, cam: 'portal', labels: ['SMV', 'CONF'],
      data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'], delta: true,
      kicker: 'Variceal bleeding', site: 'sin', title: 'Octreotide starts before the scope',
      line: 'Give it before endoscopy, which should follow within 12 hours once the circulation is restored. It blunts the rise in portal flow after a meal or a transfusion. With banding, it controls most acute bleeds.',
      notes: 'Octreotide, a somatostatin analogue, is given as a 50 µg bolus, then 50 µg an hour for 2 to 5 days. It blocks the gut\'s vasodilating peptides and the rise in portal flow after a meal or a transfusion. With banding it controls most acute bleeds. Outside the US, terlipressin or somatostatin are used instead; terlipressin has the clearest survival benefit against placebo. Ceftriaxone 1 g a day is given with it, because infection triggers bleeding and rebleeding. Erythromycin 250 mg IV, 30 to 90 minutes before the scope unless the QT is long, clears the stomach, and endoscopy follows within 12 hours.',
      ask: ['In the US, which vasoactive drug is started when a variceal bleed is suspected?', 'Octreotide, from the first suspicion and for 2 to 5 days.'],
    },
    {
      id: 'transfuse', params: {}, action: UNITS, cam: 'feeder', labels: ['VAR', 'CONF'], ripple: true,
      data: 'tiles', tiles: ['pv', 'hvpg', 'map'], key: ['pv'], delta: true,
      cite: 'Baveno VIII 5.4',
      kicker: 'Variceal bleeding', site: 'sin', title: 'Over-transfusion raises the portal pressure again',
      line: 'Extra volume raises portal flow, and portal pressure climbs back to {pv}, raising the risk of rebleeding. Transfuse to a hemoglobin of 7 to 8 g/dL.',
      notes: 'A restrictive transfusion strategy (a threshold of 7 g/dL, with a target of 7 to 9 in the trial by Villanueva and colleagues) lowered rebleeding and death compared with a liberal one; Baveno VIII sets the target at 7 to 8, and AASLD at about 7. Over-transfusion raises the portal pressure back to where it was before the bleed. Patients with heart disease or ongoing massive bleeding are the exceptions.',
      ask: ['What hemoglobin is the target in variceal bleeding?', '7 to 8 g/dL (restrictive transfusion).'],
    },
    {
      id: 'band', action: BANDS, cam: 'gej', labels: ['VAR', 'LGV'], mark: { edges: ['C1a'], label: 'Banded varices', kind: 'treat' }, tool: { kind: 'scope', open: true },
      data: 'tiles', tiles: ['hvpg'], key: ['hvpg'], delta: true,
      kicker: 'Endoscopy', site: 'sin', title: 'After banding, the pressure stays high',
      line: 'The ligated columns thrombose and shrink. With that outflow closed, the HVPG may rise slightly.',
      notes: 'Banding is repeated every 2 to 4 weeks until the varices are gone, then the esophagus is checked 3 to 6 months later and every 6 to 12 months after that. It treats the varix, not the pressure: new varices form unless the pressure is lowered too, so a non-selective beta-blocker is added for secondary prophylaxis. Post-banding ulcers can bleed a week or two later. In patients at high risk (Child–Pugh C under 14 points, B over 7 with active bleeding at endoscopy, or an HVPG of 20 mmHg or more), a pre-emptive TIPS within 72 hours, ideally within 24, improves survival.',
      ask: ['Why combine banding with a beta-blocker after a bleed?', 'Banding removes the varices, not the high pressure that makes new ones; the beta-blocker lowers it.'],
    },
    {
      // (No varix column: the bleed's volume loss shrinks the varix, which would read as better.)
      id: 'summary', visual: 'table', cols: ['hvpg', 'pv'], asc: false, note: 'What to do', rowHead: 'On the scope',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', note: 'Nothing', ref: true }, { id: 'screen', title: 'No varices', note: 'Carvedilol if CSPH' }, { id: 'grow', title: 'Small varices', note: 'Carvedilol' },
        { id: 'large', title: 'Large varices', note: 'Carvedilol or banding' }, { id: 'bleed', title: 'Bleeding varix', note: 'Octreotide, then banding' },
        { id: 'band', title: 'After the bleed', note: 'Banding and a beta-blocker' }],
      kicker: 'Summary', title: 'Endoscopy findings and treatment',
      line: 'CSPH decides the beta-blocker; the scope grades the varices, decides on banding and treats a bleed.',
      notes: 'The scope grades the varices and treats a bleed; the pressure decides whether they form and return. Every step on this list pairs a treatment of the varix with a treatment of the pressure.',
      ask: ['Large varices, and carvedilol is tolerated. Is banding needed too?', 'No: either alone is primary prophylaxis; banding is for those who cannot take a beta-blocker.'],
    },
  ],
};
