// Presenter talk: Endoscopy and the varix (Core). Slide fields as documented at the top of decks.js.
// Endoscopy is of the esophagus only; gastric varices stay on the anatomy (the varices deck).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;
const frac = (n, d) => `<mfrac><mrow>${n}</mrow><mrow>${d}</mrow></mfrac>`;
const BANDS = [{ kind: 'band' }, { kind: 'band' }, { kind: 'band' }];
// (params: {} makes the sequence settle the patient after the action, so the pressures show the new volume.)
const UNITS = [{ kind: 'infuse', fluid: 'prbc' }, { kind: 'infuse', fluid: 'prbc' }, { kind: 'infuse', fluid: 'prbc' }, { kind: 'infuse', fluid: 'prbc' }];

export const ENDOSCOPY = {
  id: 'endoscopy', level: 'core', title: 'Endoscopy and the varix', minutes: 12,
  objectives: [
    'Know who needs a screening endoscopy and who can skip it.',
    'Grade varices by size and red signs, and explain why large ones burst.',
    'Manage a variceal bleed: octreotide, restrictive transfusion and banding.',
    'Explain why banding needs a beta-blocker beside it.',
  ],
  summary: 'One patient seen through the scope: screening, growing and large varices, wall tension, a bleed, transfusion, octreotide and band ligation.',
  slides: [
    {
      id: 'screen', preset: 'cirr-comp', cam: 'varices', labels: ['VAR', 'AZY'], tool: { kind: 'scope' },
      data: 'tiles', tiles: ['hvpg'], key: ['hvpg'],
      kicker: 'Endoscopy', site: 'sin', title: 'Screening endoscopy',
      line: 'Screening finds varices before they bleed. In compensated cirrhosis the esophagus is often still normal.',
      notes: 'Baveno VII: a patient with a liver stiffness under 20 kPa and platelets over 150 can skip the screening endoscopy, because the chance of varices needing treatment is very low; stiffness and platelets are then repeated every year. Patients with clinically significant portal hypertension who take carvedilol do not need a screening endoscopy either, since the drug prevents decompensation whatever the varices. Those who cannot take a beta-blocker are scoped.',
      ask: ['Which compensated patients can skip a screening endoscopy?', 'Liver stiffness under 20 kPa with platelets over 150 (Baveno VII).'],
    },
    {
      id: 'grow', days: 180, ramp: { cirrhosis: [0.4, 0.6] }, lapse: { seconds: 10 }, cam: 'varices', labels: ['VAR'], tool: { kind: 'scope' },
      data: 'tiles', tiles: ['hvpg'], key: ['hvpg'], delta: true,
      kicker: 'Endoscopy', site: 'sin', title: 'Varices six months on',
      line: 'Once the HVPG reaches 10 mmHg or more, blue columns rise in the lower esophagus. Small varices are under 5 mm.',
      notes: 'Varices form once the HVPG reaches 10 mmHg or more, the threshold of clinically significant portal hypertension, and grow by about a tenth a year in patients who have them. They start in the lower esophagus, where the palisade veins lie superficial in the lamina propria. Small varices are under 5 mm and flatten with air; large ones are over 5 mm and do not.',
      ask: ['At what HVPG do varices form?', 'About 10 mmHg.'],
    },
    {
      id: 'large', preset: 'cirr-decomp', cam: 'varices', labels: ['VAR'], mark: { edges: ['C1a', 'C1b'], label: 'Large varices', kind: 'note' }, tool: { kind: 'scope' },
      data: 'tiles', tiles: ['hvpg'], key: ['hvpg'],
      kicker: 'Endoscopy', site: 'sin', title: 'Large varices',
      line: 'Varices over 5 mm fill the lumen and do not flatten with air. Red wale marks show where the wall has thinned.',
      notes: 'The size, the red signs (red wale marks, cherry-red spots) and the Child–Pugh class predict the first bleed. Large varices, or small ones with red signs or in Child–Pugh C, need prophylaxis: a non-selective beta-blocker (carvedilol preferred) or band ligation. In decompensated cirrhosis the beta-blocker also lowers the risk of further decompensation.',
      ask: ['Name two endoscopic findings that predict a first bleed.', 'Size over 5 mm and red signs (red wale marks or cherry-red spots).'],
    },
    {
      id: 'tension', cam: [690, -10, 890, 170], kMax: 4.5, labels: ['VAR'], tool: { kind: 'wall' },
      data: 'tiles', tiles: ['varix', 'pv'], key: ['varix'],
      kicker: 'Why varices burst', site: 'sin', title: 'Wall tension',
      eq: [mi('T') + mo('=') + frac('<mi mathvariant="normal">Δ</mi><mi>P</mi>' + mo('·') + mi('r'), mi('w')), 'T wall tension · ΔP pressure in the varix minus the lumen · r radius · w wall thickness'],
      line: 'Tension rises with pressure and radius and falls with wall thickness. A large, thin-walled varix at high pressure bursts.',
      notes: 'Laplace\'s law explains why size and red signs matter: a wide varix with a thin wall carries much more tension at the same pressure. A variceal pressure gradient over about 12 mmHg is needed to bleed. Coughing, lifting and retching raise the pressure in the varix for seconds, and bleeds often follow such a strain. Lowering the pressure (beta-blockers) or the radius (banding) lowers the tension.',
      ask: ['Using Laplace\'s law, name two ways to lower the tension in a varix wall.', 'Lower the pressure in it, or its radius.'],
    },
    {
      id: 'bleed', params: {}, action: [{ kind: 'hemorrhage', mL: 1000 }], cam: 'varices', labels: ['VAR'],
      data: 'tiles', tiles: ['map', 'pv', 'hvpg'], key: ['map', 'pv'], delta: true,
      kicker: 'Variceal bleeding', site: 'sin', title: 'A variceal bleed',
      line: 'A liter is lost. The blood pressure falls, and the portal pressure falls with the volume.',
      notes: 'Suspected variceal bleeding is treated before the scope confirms it: octreotide at once, ceftriaxone, and careful volume replacement; endoscopy within 12 hours once the patient is stable. The portal pressure falls with the lost volume, which is part of why many bleeds stop for a while on their own, and why they restart when the volume returns.',
      ask: ['Why does portal pressure fall during a bleed?', 'Less blood volume means less splanchnic inflow and lower venous pressures.'],
    },
    {
      id: 'transfuse', params: {}, action: UNITS, cam: 'varices', labels: ['VAR'],
      data: 'tiles', tiles: ['pv', 'hvpg', 'map'], key: ['pv'], delta: true,
      kicker: 'Variceal bleeding', site: 'sin', title: 'Over-transfusion',
      line: 'Replacing all of the lost volume brings the portal pressure back up, and with it the risk of a new bleed. Transfuse to a hemoglobin of 7 to 8 g/dL.',
      notes: 'A restrictive transfusion strategy, a threshold of 7 g/dL and a target of 7 to 9, lowered rebleeding and death compared with a liberal one in the trial by Villanueva and colleagues. Over-transfusion raises the portal pressure back to where it was before the bleed. Patients with heart disease or ongoing massive bleeding are the exceptions.',
      ask: ['What hemoglobin is the target in variceal bleeding?', '7 to 8 g/dL (restrictive transfusion).'],
    },
    {
      id: 'oct', params: { drugs: { octreotide: true } }, cam: 'portal', labels: ['SMV', 'CONF'], tool: { kind: 'scope' },
      data: 'tiles', tiles: ['hvpg'], key: ['hvpg'], delta: true,
      kicker: 'Variceal bleeding', site: 'sin', title: 'Octreotide first',
      line: 'Started as soon as a variceal bleed is suspected, it cuts splanchnic inflow and lowers the portal pressure before the scope.',
      notes: 'Octreotide, a somatostatin analogue, is given as a 50 µg bolus, then 50 µg an hour for 2 to 5 days. It blocks the gut\'s vasodilating peptides and the rise in portal flow after a meal or a transfusion. With banding it controls most acute bleeds. Ceftriaxone 1 g a day is given with it, because infection triggers bleeding and rebleeding.',
      ask: ['Which vasoactive drug is started when a variceal bleed is suspected?', 'Octreotide.'],
    },
    {
      id: 'band', params: { drugs: { octreotide: false } }, action: BANDS, cam: 'varices', labels: ['VAR'], mark: { edges: ['C1a', 'C1b'], label: 'Banded varices', kind: 'treat' }, tool: { kind: 'scope' },
      data: 'tiles', tiles: ['hvpg'], key: ['hvpg'], delta: true,
      kicker: 'Endoscopy', site: 'sin', title: 'Band ligation',
      line: 'The ligated columns thrombose and shrink. With that outflow closed, the HVPG rises slightly.',
      notes: 'Banding is repeated every 2 to 4 weeks until the varices are gone, then the esophagus is checked at 6 months and yearly. It treats the varix, not the pressure: new varices form unless the pressure is lowered too, so a non-selective beta-blocker is added for secondary prophylaxis. Post-banding ulcers can bleed a week or two later. In patients at high risk (Child–Pugh C under 14 points, or B over 7 with active bleeding at endoscopy), a pre-emptive TIPS within 72 hours improves survival.',
      ask: ['Why combine banding with a beta-blocker after a bleed?', 'Banding removes the varices, not the high pressure that makes new ones; the beta-blocker lowers it.'],
    },
    {
      // (No varix column: the bleed's volume loss shrinks the varix, which would read as better.)
      id: 'summary', visual: 'table', cols: ['hvpg', 'pv'], asc: false, note: 'What to do', rowHead: 'On the scope',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', note: 'Nothing', ref: true }, { id: 'screen', title: 'No varices', note: 'Carvedilol if CSPH' }, { id: 'grow', title: 'Small varices', note: 'Carvedilol' },
        { id: 'large', title: 'Large varices', note: 'Carvedilol or banding' }, { id: 'bleed', title: 'Bleeding varix', note: 'Octreotide, then banding' },
        { id: 'band', title: 'After the bleed', note: 'Banding and a beta-blocker' }],
      kicker: 'Summary', title: 'What the scope decides',
      line: 'The size of the varices and whether they bleed set the treatment; the HVPG says how high the risk runs.',
      notes: 'The scope grades the varices and treats a bleed; the pressure decides whether they form and return. Every step on this list pairs a treatment of the varix with a treatment of the pressure.',
      ask: ['Large varices, and carvedilol is tolerated. Is banding needed too?', 'No: either alone is primary prophylaxis; banding is for those who cannot take a beta-blocker.'],
    },
  ],
};
