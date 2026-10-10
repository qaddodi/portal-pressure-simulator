// Presenter talk: pre-hepatic portal hypertension, a clot in the portal or splenic vein with a normal liver
// (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;

export const PREHEPATIC = {
  id: 'prehepatic', level: 'core', title: 'Pre-hepatic portal hypertension', minutes: 7,
  objectives: [
    'Recognise acute portal vein thrombosis on Doppler',
    'Explain why the HVPG is normal and the PPG is high',
    'Describe a cavernoma and its varices with a soft liver',
    'Spot left-sided portal hypertension from a splenic vein clot',
  ],
  summary: 'A clot before the liver: acute portal vein thrombosis on Doppler, the normal HVPG and high PPG, the cavernoma months later, and splenic vein thrombosis with gastric varices.',
  slides: [
    {
      id: 'clot', preset: 'pvt-acute', cam: 'portal', labels: ['CONF'], tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'],
      kicker: 'Acute thrombosis', site: 'pvt', title: 'A clot in the portal vein',
      line: 'No signal on Doppler in the main portal vein. Behind the clot the pressure climbs to about 20 mmHg.',
      notes: 'Acute portal vein thrombosis presents with abdominal pain, sometimes fever, or is found on a scan. Look for a cause: a myeloproliferative neoplasm (test for JAK2), an inherited thrombophilia, local inflammation (pancreatitis, appendicitis, diverticulitis), abdominal surgery or cirrhosis. Contrast CT confirms the clot and shows whether it reaches the superior mesenteric vein, where bowel ischaemia is the danger. Without cirrhosis, anticoagulation starts at once and continues for at least six months; the earlier it starts, the more often the vein reopens.',
      ask: ['What is the first treatment for acute portal vein thrombosis in a patient without cirrhosis?', 'Anticoagulation, started at once and given for at least six months.'],
    },
    {
      id: 'cath', cath: 'result', data: 'ladder', key: ['hvpg', 'ppg'], tiles: ['hvpg', 'ppg'],
      kicker: 'Acute thrombosis', site: 'pvt', title: 'The HVPG misses it',
      eq: [mi('PPG') + mo('=') + sub(mi('P'), 'portal vein') + mo('−') + sub(mi('P'), 'IVC'), 'Portal pressure gradient: the whole fall from the portal vein to the IVC'],
      line: 'The block is before the liver, so the wedged and free hepatic pressures stay normal: HVPG 2 mmHg. The PPG, 18 mmHg, finds it.',
      notes: 'The wedged catheter reads the sinusoids, which sit downstream of the clot, so the HVPG is normal however high the portal vein pressure. The PPG compares the portal vein itself with the IVC and catches the block; it needs a direct portal vein reading (transhepatic, at TIPS, or by EUS). In practice the diagnosis is made on imaging, and the catheter is rarely needed. A normal HVPG with varices is the clue that the block is not in the sinusoids.',
      ask: ['Varices, a large spleen and an HVPG of 3 mmHg. What does the HVPG tell you?', 'The block is not sinusoidal: look before the sinusoids, in the portal vein or the portal tracts.'],
    },
    {
      id: 'cavernoma', preset: 'pvt-chronic', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Occluded portal vein' }, data: 'tiles', tiles: ['varix', 'spleen', 'plt'], key: ['varix'],
      kicker: 'Months later', site: 'pvt', title: 'A cavernoma',
      line: 'Small collaterals grow around the blocked vein and carry some blood to the liver. Varices form and the spleen enlarges.',
      notes: 'Cavernous transformation is a web of collaterals around the occluded portal vein, seen within weeks to months. It does not carry enough blood to bring the portal pressure down, so varices, a large spleen and low platelets follow. Screen for varices with endoscopy and treat them as in cirrhosis: a non-selective beta-blocker or banding. Long-term anticoagulation is advised when a thrombophilia persists. Large collaterals around the bile duct can narrow it (portal cholangiopathy).',
      ask: ['A child bleeds from varices with normal liver tests. What is the likely cause?', 'Chronic portal vein thrombosis with a cavernoma, often from umbilical vein catheterisation or sepsis in infancy.'],
    },
    {
      id: 'liver', cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'hvpg'], key: ['lsm'], delta: false,
      kicker: 'Months later', site: 'pvt', title: 'The liver itself is normal',
      line: 'Stiffness about 5 kPa and a normal HVPG. Varices with a soft liver point to a block before the sinusoids.',
      notes: 'The liver tissue is spared, so the stiffness, albumin and clotting are usually normal and the patient rarely decompensates. A soft liver with varices and a large spleen means pre-hepatic or presinusoidal disease: portal vein thrombosis, schistosomiasis or porto-sinusoidal vascular disorder. Doppler or CT tells the first from the others. Spleen stiffness stays high, because it follows the portal vein pressure.',
      ask: ['Varices, platelets of 70 and a stiffness of 5 kPa. What two causes do you consider first?', 'Portal vein thrombosis and a presinusoidal block such as schistosomiasis.'],
    },
    {
      id: 'svt', preset: 'svt', cam: 'splenic', mark: { edges: ['SV_CONF'], label: 'Clot in the splenic vein' }, data: 'tiles', tiles: ['pv', 'gv', 'plt'], key: ['gv'],
      kicker: 'Splenic vein thrombosis', site: 'pvt', title: 'Left-sided portal hypertension',
      line: 'A clot in the splenic vein raises the pressure on the left only. The portal vein stays normal while gastric varices fill.',
      notes: 'Splenic vein thrombosis (sinistral portal hypertension) usually follows pancreatitis or a pancreatic tumour, which sit beside the vein. Blood from the spleen escapes through the short gastric veins, so the varices are in the gastric fundus, often without esophageal varices. The portal vein pressure and the HVPG are normal. When the gastric varices bleed, splenectomy, or embolisation of the splenic artery, removes their inflow and cures them.',
      ask: ['Isolated gastric varices after pancreatitis. What is the cause and the cure?', 'Splenic vein thrombosis; splenectomy or splenic artery embolisation.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'ppg', 'plt'], fine: true, asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'clot', kicker: 'Portal vein', title: 'Acute thrombosis' }, { id: 'cavernoma', kicker: 'Portal vein', title: 'Cavernoma' }, { id: 'svt', kicker: 'Splenic vein', title: 'Splenic vein thrombosis' }],
      kicker: 'Summary', title: 'A clot before the liver',
      foot: 'From the model, against normal (top row: pressures in mmHg). ↑ above normal, ↑↑ well above, ↓ below, • normal. The HVPG stays normal in all three; the PPG rises only when the portal vein itself is blocked. Hover or tap a cell for its value. Pick a row to go back to it.',
      notes: 'Pre-hepatic block raises the pressure upstream of the liver and leaves the sinusoids alone: the HVPG is normal, the stiffness is normal and the liver works. The portal vein clot raises the PPG; the splenic vein clot leaves even the portal vein normal and shows only on the left, in the spleen and the gastric fundus. Treat the clot with anticoagulation, the varices as in cirrhosis, and the splenic vein clot that bleeds with splenectomy.',
      ask: ['Which pressure reading is normal in every pre-hepatic block?', 'The HVPG, because the sinusoids are downstream of the clot.'],
    },
  ],
};
