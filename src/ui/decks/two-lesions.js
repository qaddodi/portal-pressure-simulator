// Presenter talk: two lesions in one circulation (the slide fields are described at the top of decks.js). One man with cirrhosis and
// CSPH gets a portal vein clot, then constrictive pericarditis on top of it, then loses each in turn (the clot recanalizes, the
// pericardium is stripped and the retained fluid is diuresed), and the talk ends on how the two lesions interact: the clot raises the
// PPG and lowers the HVPG, congestion lifts every pressure and lowers both gradients, and together the PPG ends near where it began
// while the HVPG reads normal.
//
// Every number on a slide is the engine's (live pills and tiles). The congestion is the Constrictive pericarditis preset's own:
// `pericardial: 0.9` and 1,150 mL of retained salt and water (the `retain` action, worker-core.js; a preset's `volume`), taken out
// again at the end by the same action with a negative volume. The order of the two lesions does not change the numbers
// (checked 14 Nov 2026: clot then congestion and congestion then clot settle to the same readings), and taking them out in either
// order returns the first patient (tests/two-lesions.test.js holds these).
//
// Sources, checked 14 Nov 2026 against guidelines/: Baveno VIII (J Hepatol 2026) panel 9, PVT in cirrhosis: 9.11 (upper GI endoscopy at
// diagnosis), 9.16 (screen for PVT with HCC surveillance), 9.19 and 9.20 (anticoagulation, at least 6 months and long-term use
// considered whether or not the vein recanalizes); AASLD 2024 portal hypertension, the HVPG technique list, item 12 (also record the
// IVC pressure at the hepatic vein outlet and the right atrial pressure); EASL 2025 vascular liver disease (a hemodynamic study when
// constrictive pericarditis is suspected; liver stiffness reads congestion). The engine's HVPG and PPG responses to the two lesions
// are the model's own; no guideline gives them.

const CLOT = { thrombus: { PV_TRUNK: 1 } };
const SQUEEZE = { pericardial: 0.9 };
const FLUID = 1150;

export const TWO_LESIONS = {
  id: 'two-lesions', level: 'advanced', title: 'Two lesions, one circulation', minutes: 10,
  objectives: [
    'Predict how a portal vein clot changes the HVPG and the PPG in cirrhosis',
    'Predict how a raised right atrial pressure changes the FHVP, the WHVP and both gradients',
    'Explain why the two lesions together can leave the PPG where it was and the HVPG normal',
    'Name the two extra pressures and the image to get when the gradients do not fit the patient',
  ],
  checks: [
    ['In cirrhosis with CSPH, a portal vein clot appears and the HVPG falls from 11 to 8 mmHg. Has the portal hypertension improved?', 'No. The catheter reads the sinusoids, and the clot lies upstream of them. The PPG rises.'],
    ['The right atrial pressure rises from 4 to 16 mmHg in a man with cirrhosis. What happens to the FHVP, and why does it matter?', 'It rises with the right atrium, and the WHVP follows. Every absolute pressure is higher, but the gradient does not show the congestion.'],
    ['A man with cirrhosis has an HVPG of 4 mmHg and a PPG of 13 mmHg. Which two lesions do you look for?', 'A portal vein clot, which raises the PPG, and a raised right atrial pressure, which lowers both gradients.'],
    ['Which two pressures does AASLD 2024 add to the FHVP and WHVP?', 'The IVC pressure at the hepatic vein outlet and the right atrial pressure.'],
  ],
  summary: 'One man with cirrhosis and CSPH gets a portal vein clot, then constrictive pericarditis, then loses each lesion in turn. The clot raises the PPG and lowers the HVPG, congestion lowers both gradients, and together they leave the HVPG normal and the PPG where it began.',
  slides: [
    {
      id: 'base', preset: 'csph', cam: 'route', labels: ['CONF', 'RHV', 'RA'], data: 'tiles', tiles: ['hvpg', 'ppg'], key: ['hvpg', 'ppg'],
      vignette: 'A 58-year-old man with MASLD cirrhosis has platelets of 90,000/µL and a liver stiffness of 24 kPa. He has no ascites and has never bled.',
      kicker: 'Cirrhosis alone', site: 'sin', title: 'In plain cirrhosis the HVPG and the PPG agree',
      line: 'The HVPG is {hvpg} and the PPG is {ppg}. The portal vein runs at {pv} and the right atrium at {ra}.',
      notes: 'This is the reference patient, and every later reading is set against it. All the resistance sits in the sinusoids, so the wedged pressure sees the portal pressure and the two gradients move together. Two lesions can break that, one upstream of the sinusoids and one downstream of the hepatic veins. The talk adds a portal vein clot, then constrictive pericarditis, then takes each away.',
      ask: ['Where does the resistance sit in this man?', 'In the sinusoids. That is why the HVPG tracks the PPG.'],
    },
    {
      id: 'clot', params: CLOT, days: 90, lapse: { seconds: 8 }, cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], clot: true }, tool: { kind: 'flowtime', clock: 'days', lines: ['ppg', 'hvpg'], keepTiles: true, title: 'The PPG and the HVPG over three months' }, data: 'tiles', tiles: ['hvpg', 'ppg'], key: ['hvpg', 'ppg'], delta: 'base',
      kicker: 'Add a clot', site: 'pre', title: 'A portal vein clot raises the PPG and lowers the HVPG',
      line: 'The main portal vein occludes. The PPG rises to {ppg}, while the HVPG falls to {hvpg}: the catheter reads the sinusoids, and the clot lies upstream of them.',
      notes: 'The clot adds a second site of resistance before the liver, and the wedge catheter cannot see it. The portal vein pressure behind the clot climbs and the PPG with it, while the WHVP falls because less portal blood reaches the sinusoids. In cirrhosis the thrombus is often partial and found on surveillance imaging; Baveno VIII 9.16 screens for it at the same visit as HCC surveillance. Only a direct portal pressure shows the clot. In the model a complete clot lowers the HVPG; a partial clot with collaterals, as in most patients, leaves it nearer where it was.',
      ask: ['Cirrhosis, a new portal vein clot, and a lower HVPG. What does the PPG do?', 'It rises. The HVPG cannot see a lesion upstream of the sinusoids.'],
    },
    {
      id: 'varices', cam: 'varices', data: 'tiles', tiles: ['varix', 'plt'], key: ['varix'], delta: 'base',
      kicker: 'Add a clot', site: 'pre', title: 'The varices grow while the HVPG falls',
      line: 'Behind the clot the portal pressure is {pv}. The varices reach {varix} and the platelets fall to {plt}, with a lower HVPG than before.',
      notes: 'A lower HVPG does not mean a lower risk. The varices follow the pressure upstream of the clot, and the spleen and platelets follow the portal pressure, not the wedge. Baveno VIII 9.11 asks for upper GI endoscopy at diagnosis of PVT in cirrhosis, and the HVPG is no reason to skip it.',
      ask: ['A new portal vein clot lowers the HVPG. May the screening endoscopy wait?', 'No. The varices follow the pressure upstream of the clot (Baveno VIII 9.11).'],
    },
    {
      id: 'both', params: SQUEEZE, action: { kind: 'retain', mL: FLUID }, days: 60, lapse: { seconds: 8 }, lens: 'heat', cam: 'hepatic', labels: ['RHV', 'IVCS', 'RA'], sites: ['ra'], tool: { kind: 'flowtime', clock: 'days', lines: ['pv', 'hvpg'], keepTiles: true, title: 'Portal pressure and the HVPG over two months' }, data: 'tiles', tiles: ['ra', 'hvpg'], key: ['ra'], delta: 'clot',
      kicker: 'Add congestion', site: 'cardiac', title: 'Constriction lifts every pressure and lowers the HVPG further',
      line: 'Pericardial constriction raises the right atrium to {ra}. The FHVP follows to {fhvp}, the WHVP to {whvp}, and the HVPG falls to {hvpg}.',
      notes: 'The same pericardial constraint and retained fluid as the model\'s constrictive pericarditis patient. The right atrial pressure raises the FHVP one for one, and the WHVP, the sinusoidal pressure, rises with it, so the congestion is in the absolute pressures and the HVPG does not show it. Cardiac output falls and so does portal inflow, which is why both gradients fall in the model. Ascites and liver stiffness rise with the congestion. A mosaic pattern on imaging, a raised jugular venous pressure and Kussmaul sign point to the heart; when constriction is suspected, EASL 2025 asks for a hemodynamic study.',
      ask: ['Which pressure does a raised right atrial pressure lift first?', 'The FHVP, one for one. The WHVP follows, so the gradient does not show it.'],
    },
    {
      id: 'unclot', params: { thrombus: { PV_TRUNK: 0 } }, days: 90, lapse: { seconds: 8 }, cam: 'portal', labels: ['CONF'], tool: { kind: 'flowtime', clock: 'days', lines: ['ppg', 'pv'], keepTiles: true, title: 'The PPG and portal pressure over three months' }, data: 'tiles', tiles: ['ppg', 'ra'], key: ['ppg'], delta: 'both',
      kicker: 'Take them out', site: 'pre', title: 'Recanalizing the vein lowers the PPG and leaves the congestion',
      line: 'With the vein open, portal flow returns to {pvFlow} and the PPG falls to {ppg}. The right atrium stays at {ra}, so the portal vein still runs at {pv}.',
      notes: 'The vein is open, and the congestion is not touched. The pressures that came from the heart stay where they were: the FHVP, the WHVP and the portal vein pressure all remain high, and the ascites with them. Baveno VIII 9.20 keeps anticoagulation for ≥6 months and considers long-term use, whether or not the vein recanalizes (9.19 sets who is anticoagulated). Open on imaging does not mean stop.',
      ask: ['The portal vein is open at 6 months. Is anticoagulation stopped on that basis?', 'No. Baveno VIII 9.20: ≥6 months, and consider long-term use whether or not the vein recanalizes.'],
    },
    {
      id: 'unsqueeze', params: { pericardial: 0 }, action: { kind: 'retain', mL: -FLUID }, days: 90, lapse: { seconds: 8 }, lens: 'heat', cam: 'hepatic', labels: ['RHV', 'IVCS', 'RA'], sites: ['ra'], tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'asc'], keepTiles: true, title: 'The HVPG and ascites over three months' }, data: 'tiles', tiles: ['ra', 'hvpg'], key: ['hvpg'], delta: 'base',
      kicker: 'Take them out', site: 'cardiac', title: 'Without either lesion, the cirrhosis shows its full gradient',
      line: 'After pericardiectomy and diuresis the right atrium is back to {ra}, and the HVPG to {hvpg}. The cirrhosis was there all along, and the lesions hid it.',
      notes: 'The same man as the first slide, with both lesions gone. The heart and the clot each lowered the HVPG, so for months it understated his portal hypertension. Once both are treated, the number returns to where cirrhosis alone puts it. A gradient that dropped when a lesion arrived says little about the cirrhosis underneath.',
      ask: ['A man\'s HVPG rises after a pericardiectomy. Is the cirrhosis worse?', 'No. The constriction was hiding it. The HVPG returns to what the cirrhosis sets.'],
    },
    {
      id: 'together', params: { ...CLOT, ...SQUEEZE }, action: { kind: 'retain', mL: FLUID }, days: 90, lens: 'heat', cam: 'route', labels: ['CONF', 'RHV', 'RA'], sites: ['pv', 'ra'], data: 'tiles', tiles: ['hvpg', 'ppg'], key: ['hvpg', 'ppg'],
      compare: [{ label: 'Both', own: true }, { label: 'Clot only', short: 'Clot', slide: 'clot' }, { label: 'Congestion only', short: 'Heart', slide: 'unclot' }, { label: 'Cirrhosis only', short: 'Neither', slide: 'base' }],
      kicker: 'Together', site: 'cardiac', title: 'Together, the HVPG reads normal and the PPG reads as it did before',
      line: 'The clot pushes the PPG up and congestion pulls it down, so it reads {ppg}, close to {ppg@base} before either. The HVPG reads {hvpg}, with the portal vein at {pv}.',
      notes: 'Put both lesions back and press the buttons. The clot raises the PPG and lowers the HVPG; congestion lowers both gradients; together the HVPG is normal and the PPG sits near where cirrhosis alone put it, while the portal vein pressure and the ascites are the highest of the four. Neither gradient flags the problem. What does is the absolute pressures: the portal vein, the FHVP and the right atrium. The two lesions act at opposite ends of the liver, so they add on the pressures and partly cancel on the gradients.',
      ask: ['With both lesions the PPG is unchanged from the cirrhosis alone. Is the portal pressure the same?', 'No. The portal vein pressure is far higher. The two lesions cancel on the PPG, which is a difference, not a level.'],
    },
    {
      id: 'measure', cam: 'route', labels: ['CONF', 'RHV', 'RA'], sites: ['pv', 'ra'], data: 'tiles', tiles: ['fhvp', 'ra'], key: ['ra'],
      kicker: 'Together', site: 'cardiac', title: 'When the gradients do not fit, image the vein and read the right side',
      line: 'Image the portal vein, read the FHVP and the IVC and right atrial pressures beside the gradients, and look for a cause when the right atrium is high.',
      causesHead: 'What to get', causes: ['Portal vein imaging, with HCC surveillance', 'IVC pressure at the hepatic vein outlet', 'Right atrial pressure', 'Echocardiography, then a hemodynamic study if constriction is suspected'],
      notes: 'Baveno VIII 9.16 screens for PVT in cirrhosis at the same time as HCC surveillance. AASLD 2024 asks, in its HVPG technique list, for the IVC pressure at the hepatic vein outlet and the right atrial pressure beside the FHVP and WHVP: an FHVP more than 2 mmHg above the IVC calls for venography to rule out obstruction between the two. EASL 2025 asks for a hemodynamic study when constrictive pericarditis is suspected. None of the three is in the HVPG.',
      ask: ['Which two pressures does AASLD 2024 add to the FHVP and WHVP?', 'The IVC pressure at the hepatic vein outlet and the right atrial pressure.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'ppg', 'ra', 'asc'], asc: false, vs: 'first', rowHead: 'Patient',
      of: [{ id: 'base', kicker: 'Reference', title: 'Cirrhosis', ref: true }, { id: 'clot', kicker: 'Clot', title: 'Cirrhosis and clot' }, { id: 'unclot', kicker: 'Congestion', title: 'Cirrhosis and congestion' }, { id: 'together', kicker: 'Both', title: 'Clot and congestion' }],
      kicker: 'Summary', title: 'The two lesions move the gradients in different ways, and hide the cirrhosis together',
      line: 'The clot raises the PPG and lowers the HVPG. Congestion lowers both. Together, the gradients mislead and the absolute pressures do not.',
      notes: 'Four states of the same man, each against the first row. The clot is upstream of the liver and congestion is downstream, so the gradients across the liver move in opposite ways for the PPG and the same way for the HVPG, while the portal vein pressure and the ascites climb with each. A gradient measures the difference across the liver; it does not say how high the whole circuit sits.',
      ask: ['Which reading rises with both lesions and with either: the HVPG, the PPG or the portal vein pressure?', 'The portal vein pressure. Both gradients can fall or stay put.'],
    },
  ],
};
