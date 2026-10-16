// Presenter talk: blocked outflow from the liver, in the hepatic veins (Budd–Chiari syndrome) and in the central
// veins (sinusoidal obstruction syndrome), what the catheter can read in each, and how the outflow is reopened
// (the slide fields are described at the top of decks.js).

export const OUTFLOW = {
  id: 'outflow', level: 'advanced', title: 'Hepatic venous outflow block', minutes: 11,
  objectives: [
    'Name the causes of hepatic vein thrombosis and of sinusoidal obstruction',
    'Explain why the caudate lobe enlarges when the hepatic veins clot',
    'Explain why the wedge works in sinusoidal obstruction but not with clotted hepatic veins',
    'Outline the stepwise treatment of hepatic vein thrombosis',
  ],
  summary: 'Budd–Chiari syndrome and sinusoidal obstruction syndrome: a liver that cannot drain, what the catheter can and cannot read, and the stepwise reopening of the outflow.',
  slides: [
    {
      id: 'bcs', terms: ['ivc', 'ra'], preset: 'budd-chiari', cam: 'hepatic', mark: { edges: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'], label: 'Clots' }, tool: { kind: 'abdomen' }, data: 'tiles', tiles: ['pv', 'asc'], key: ['asc'],
      kicker: 'Hepatic veins', site: 'post', title: 'In Budd–Chiari syndrome the hepatic veins clot',
      line: 'A block anywhere from the small [hepatic veins](hv) to where the IVC enters the right atrium traps blood in the liver. The liver swells, portal pressure rises to {pv} and ascites forms.',
      causesHead: 'Look for', causes: ['Myeloproliferative neoplasm', 'Thrombophilia', 'Pregnancy or the pill'],
      notes: 'Budd–Chiari syndrome is a block to hepatic venous outflow anywhere from the small hepatic veins to the entry of the IVC into the right atrium, without heart disease. It presents with abdominal pain, a large tender liver and ascites, suddenly or over months. Most patients have at least one prothrombotic condition, often more than one: a myeloproliferative neoplasm (the commonest), antiphospholipid syndrome, inherited thrombophilia, paroxysmal nocturnal hemoglobinuria, pregnancy or the contraceptive pill; and JAK2 is tested even when the blood count is normal.',
      ask: ['A young woman has a tender liver and sudden ascites. Her blood count is normal. Which test still looks for the commonest cause?', 'JAK2 V617F, then CALR if it is negative: a myeloproliferative neoplasm is the commonest cause even with a normal count.'],
    },
    {
      id: 'caudate', cam: 'liver', terms: ['ivc', 'caudate'], mark: { edges: ['CAUD'], label: 'Caudate veins', kind: 'note' },
      kicker: 'Hepatic veins', site: 'post', title: 'The caudate lobe still drains',
      line: 'Short caudate veins run straight into the IVC, below the clots, so the caudate lobe keeps its outflow and enlarges while the rest of the liver congests.',
      notes: 'The caudate lobe drains through several short veins directly into the IVC, so it escapes a block of the three main hepatic veins. Over weeks it enlarges while the rest of the liver shrinks. On imaging, caudate hypertrophy with patchy enhancement and no visible hepatic veins is characteristic; a large caudate can in turn compress the IVC.',
      ask: ['Why does the caudate lobe enlarge in Budd–Chiari syndrome?', 'Its veins drain straight into the IVC, below the block, so it keeps its outflow and grows.'],
    },
    {
      id: 'nowedge', terms: ['hv'], cam: 'hepatic', tool: { kind: 'doppler', vessel: 'RHV_IVC' }, data: 'ladder', key: ['ppg'], tiles: ['hvpg', 'ppg'], brackets: { hvpg: 'misleads', ppg: 'works' },
      kicker: 'Hepatic veins', site: 'post', title: 'No hepatic vein to wedge',
      line: 'Doppler shows absent or reversed hepatic vein flow, intrahepatic collaterals and a large caudate lobe. At venography the veins cannot be entered, or they show a spider-web pattern, so the HVPG cannot be measured. Portal pressure is {pv}.',
      notes: 'Doppler ultrasound is the first test: absent or reversed flow in the hepatic veins, intrahepatic collaterals and a large caudate lobe. CT or MR shows the extent and the state of the IVC. At venography the hepatic veins either cannot be entered or show a spider-web pattern of collaterals, so the HVPG cannot be measured in the usual way.',
      ask: ['What is the first imaging test for suspected Budd–Chiari syndrome?', 'Doppler ultrasound of the hepatic veins and the IVC: it is quick, at the bedside, and shows absent or reversed flow.'],
    },
    {
      id: 'open', terms: ['hv'], params: { thrombus: { RHV_IVC: 0 } }, days: 60, lapse: { seconds: 7 }, cam: 'hepatic', mark: { edges: ['RHV_IVC'], label: 'Stent', kind: 'treat' }, data: 'tiles', tiles: ['pv', 'asc'], key: ['asc'], delta: 'bcs',
      kicker: 'Opening the outflow', site: 'post', title: 'One open hepatic vein is enough',
      line: 'Angioplasty and a stent reopen the right hepatic vein. Two months later the portal pressure is {pv} and the ascites has gone.',
      notes: 'Treatment is stepwise. Every patient is anticoagulated, unless it is contraindicated, and the cause is treated. A short narrowing of a hepatic vein or of the IVC is opened by angioplasty, usually with a stent, and one good hepatic vein can drain the whole liver, as here. Patients who still worsen go on to a shunt, and those with liver failure to transplantation.',
      ask: ['When is angioplasty enough, and when is a shunt chosen?', 'Angioplasty, with a stent if the vein narrows again, for a short stenosis; a TIPS or DIPS when no vein can be opened or the patient does not improve.'],
    },
    {
      id: 'dips', preset: 'budd-chiari', params: { dips: { on: true } }, days: 60, cam: 'dips', terms: ['pv', 'ivc', 'caudateLobe'], mark: { edges: ['DIPS'], label: 'DIPS', kind: 'treat' }, data: 'tiles', tiles: ['pv', 'asc', 'liver'], key: ['pv'], delta: 'bcs',
      kicker: 'Opening the outflow', site: 'post', title: 'When no vein opens, a DIPS drains the liver into the IVC',
      line: 'A direct intrahepatic portosystemic shunt (DIPS) runs from the portal vein through the caudate lobe straight into the IVC, bypassing the blocked veins. Two months later the portal pressure is {pv} and the ascites has nearly gone.',
      notes: 'A standard TIPS runs from a hepatic vein to the portal vein, so when all three hepatic veins are blocked the stent is placed from the IVC through the liver to the portal vein instead (a direct intrahepatic portosystemic shunt). The portal vein becomes the liver\'s outflow, and the congestion and ascites resolve. Like any shunt it diverts portal blood from the liver, so encephalopathy is watched for.',
      ask: ['Why can a standard TIPS not be placed when all three hepatic veins are blocked?', 'It needs a hepatic vein to start from; the stent goes from the IVC instead.'],
    },
    {
      id: 'sos', preset: 'sos', params: { fibrosis: { R: { post: 32 }, L: { post: 32 } } }, cam: 'lobule:central', callout: { at: 'cv', label: 'Block: central veins' }, terms: { 'central veins': 'lobule:central' }, data: 'tiles', tiles: ['asc', 'hvpg'], key: ['asc'],
      kicker: 'Sinusoidal obstruction', site: 'postsin', title: 'Chemotherapy injures the sinusoid lining',
      line: 'Debris from the injured lining blocks the central veins, and within weeks the liver swells and ascites collects.',
      causesHead: 'Causes', causes: ['Stem cell transplant conditioning', 'Oxaliplatin', 'Thiopurines', 'Pyrrolizidine alkaloids'],
      notes: 'Sinusoidal obstruction syndrome (veno-occlusive disease) starts in the sinusoidal endothelium, injured by conditioning with busulfan, cyclophosphamide or total body irradiation, by oxaliplatin, by thiopurines or by pyrrolizidine alkaloids in herbal teas. It presents with jaundice, painful hepatomegaly, ascites and weight gain, usually within three weeks of a transplant, although late forms occur.',
      ask: ['Two weeks after a stem cell transplant a patient has gained 5 kg and has a tender liver. What is the likely diagnosis?', 'Sinusoidal obstruction syndrome: weight gain, a tender liver and the timing after conditioning fit it.'],
    },
    {
      id: 'soswedge', cath: 'result', data: 'ladder', key: ['whvp', 'hvpg'], tiles: ['hvpg', 'ppg'], brackets: { hvpg: 'works' },
      kicker: 'Sinusoidal obstruction', site: 'postsin', title: 'In sinusoidal obstruction the HVPG can be measured',
      line: 'The hepatic veins are open, and the block sits upstream of the free reading, so the wedged pressure rises: the HVPG is {hvpg}. After a transplant, a gradient above 10 mmHg strongly supports the diagnosis.',
      notes: 'In sinusoidal obstruction a transjugular catheter can enter the hepatic veins and wedge, and the obstruction lies between the wedged and the free readings, so the HVPG rises. After a stem cell transplant an HVPG above 10 mmHg strongly supports the diagnosis. A transjugular liver biopsy can be taken at the same time, without crossing the liver capsule, which matters with low platelets and ascites.',
      ask: ['Why can the wedge be read here but not when the hepatic veins are clotted?', 'Here the veins are open, so the catheter can wedge, and the block lies between the wedge and the free reading.'],
    },
    {
      id: 'recover', params: { fibrosis: { R: { post: 1 }, L: { post: 1 } } }, days: 30, lapse: { seconds: 6 }, cam: 'lobule:central', terms: { 'central veins': 'lobule:central' }, data: 'tiles', tiles: ['asc', 'hvpg'], key: ['asc'], delta: 'sos',
      kicker: 'Sinusoidal obstruction', site: 'postsin', title: 'Most patients recover',
      line: 'As the lining heals the central veins clear; over the following weeks the ascites drains away and the HVPG falls to {hvpg}.',
      notes: 'Mild and moderate disease resolves with careful fluid balance, diuretics and pain relief. Severe disease, with kidney or lung failure, carries a high mortality, and defibrotide is the treatment for it. Prevention matters: gentler conditioning where possible, and ursodeoxycholic acid in many centers.',
      ask: ['Which drug treats severe sinusoidal obstruction syndrome?', 'Defibrotide, which protects the injured sinusoidal lining.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'whvp', 'fhvp', 'hvpg', 'ppg', 'asc'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'bcs', kicker: 'Hepatic veins', title: 'Hepatic vein clots', blank: ['whvp', 'fhvp', 'hvpg'] }, { id: 'open', kicker: 'Hepatic veins', title: 'One vein stented' },
        { id: 'dips', kicker: 'Hepatic veins', title: 'DIPS' }, { id: 'sos', kicker: 'Central veins', title: 'Sinusoidal obstruction' }, { id: 'recover', kicker: 'Central veins', title: 'Recovered' }],
      kicker: 'Summary', title: 'Budd–Chiari versus sinusoidal obstruction syndrome',
      line: 'In Budd–Chiari the catheter cannot wedge a clotted vein. In sinusoidal obstruction the hepatic veins are open and the HVPG rises. Both improve once outflow is restored.',
      notes: 'With clotted hepatic veins the wedged and free readings are taken behind the same block, so the HVPG is meaningless; the PPG and imaging make the diagnosis. With blocked central veins the hepatic veins are open, the block sits between the two readings, and the HVPG is raised. Reopening one hepatic vein, or a shunt to the IVC, drains the liver.',
      ask: ['Where is the block in sinusoidal obstruction syndrome, relative to the wedge?', 'Between the wedged and the free readings, in the central veins, so the HVPG rises.'],
    },
  ],
};
