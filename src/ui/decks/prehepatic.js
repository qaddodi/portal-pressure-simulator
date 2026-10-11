// Presenter talk: pre-hepatic portal hypertension, a clot in the portal or splenic vein with a normal liver
// (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;

export const PREHEPATIC = {
  id: 'prehepatic', level: 'core', title: 'Pre-hepatic portal hypertension', minutes: 7,
  objectives: [
    'Recognize acute portal vein thrombosis on Doppler',
    'Explain why the HVPG is normal and the PPG is high',
    'Describe a cavernoma and its varices with a soft liver',
    'Spot left-sided portal hypertension from a splenic vein clot',
  ],
  summary: 'A clot before the liver: acute portal vein thrombosis on Doppler, the normal HVPG and high PPG, the cavernoma months later, and splenic vein thrombosis with gastric varices.',
  slides: [
    {
      id: 'clot', preset: 'pvt-acute', cam: 'portal', labels: ['CONF'], terms: { 'portal pressure': 'pv' }, tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'],
      kicker: 'Acute thrombosis', site: 'pvt', title: 'An acute clot stops portal flow on Doppler',
      line: 'Portal pressure rises steeply behind the clot. Contrast CT confirms it and shows whether it extends into the superior mesenteric vein, where the risk is bowel ischemia.',
      notes: 'Acute portal vein thrombosis presents with abdominal pain, sometimes fever, or is found on a scan. Look for a cause: a myeloproliferative neoplasm (test for JAK2), an inherited thrombophilia, local inflammation (pancreatitis, appendicitis, diverticulitis), abdominal surgery or cirrhosis. Contrast CT confirms the clot and shows whether it reaches the superior mesenteric vein, where bowel ischemia is the danger: persistent pain, bloody diarrhea, a rising lactate or organ failure mean urgent CT and surgical review. Without cirrhosis, anticoagulation starts at once and continues for at least six months; the earlier it starts, the more often the vein reopens.',
      ask: ['What does Doppler show in an acute portal vein clot?', 'No flow in the trunk; a fresh clot can be nearly anechoic, so the missing color signal matters more than the gray scale.'],
    },
    {
      id: 'cath', cath: 'result', data: 'ladder', key: ['hvpg', 'ppg'], tiles: ['hvpg', 'ppg'],
      kicker: 'Acute thrombosis', site: 'pvt', title: 'HVPG is normal with a portal vein clot',
      eq: [mi('PPG') + mo('=') + sub(mi('P'), 'portal vein') + mo('−') + sub(mi('P'), 'IVC'), 'Portal pressure gradient: the whole fall from the portal vein to the IVC'],
      line: 'The clot is before the liver, so wedged and free pressures stay normal and the HVPG is {hvpg}. The PPG of {ppg} shows the block.',
      notes: 'The wedged catheter reads the sinusoids, which sit downstream of the clot, so the HVPG is normal however high the portal vein pressure. The PPG compares the portal vein itself with the IVC and catches the block; it needs a direct portal vein reading (transhepatic, at TIPS, or by EUS). In practice the diagnosis is made on imaging, and the catheter is rarely needed. A normal HVPG with varices is the clue that the block is not in the sinusoids.',
      ask: ['Varices, a large spleen and an HVPG of 3 mmHg. What does the HVPG tell you?', 'The block is not sinusoidal: look before the sinusoids, in the portal vein or the portal tracts.'],
    },
    {
      id: 'cavernoma', preset: 'pvt-chronic', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Occluded portal vein' }, data: 'tiles', tiles: ['varix', 'spleen', 'plt'], key: ['varix'],
      kicker: 'Months later', site: 'pvt', title: 'Months later, collaterals grow around the clot',
      line: 'Small collaterals grow around the blocked vein and carry some blood to the liver. Varices form and the spleen enlarges.',
      notes: 'Cavernous transformation is a web of collaterals around the occluded portal vein, seen within weeks to months. It does not carry enough blood to bring the portal pressure down, so varices, a large spleen and low platelets follow. Screen for varices with endoscopy and treat them as in cirrhosis: a non-selective beta-blocker or banding. Long-term anticoagulation is advised when a thrombophilia persists. Large collaterals around the bile duct can narrow it (portal cholangiopathy). In children the clot often follows umbilical vein catheterization or sepsis in infancy.',
      ask: ['A child bleeds from varices with normal liver tests. What is the likely cause?', 'Chronic portal vein thrombosis with a cavernoma: varices with a normal liver point to a block before the sinusoids.'],
    },
    {
      id: 'liver', cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'hvpg'], key: ['lsm'], delta: false,
      kicker: 'Months later', site: 'pvt', title: 'The liver itself is normal',
      line: 'Stiffness {lsm} and a normal HVPG. Varices with a soft liver point to a block before the sinusoids.',
      notes: 'The liver tissue is spared, so the stiffness, albumin and clotting are usually normal and the patient rarely decompensates. A soft liver with varices and a large spleen means pre-hepatic or presinusoidal disease: portal vein thrombosis, schistosomiasis or porto-sinusoidal vascular disorder. Doppler or CT tells the first from the others. Spleen stiffness stays high, because it follows the portal vein pressure.',
      ask: ['Varices, platelets of 70 and a stiffness of 5 kPa. What two causes do you consider first?', 'Portal vein thrombosis and a presinusoidal block such as schistosomiasis.'],
    },
    {
      id: 'svt', preset: 'svt', cam: 'splenic', mark: { edges: ['SV_CONF'], label: 'Clot in the splenic vein' }, data: 'tiles', tiles: ['pv', 'gv', 'plt'], key: ['gv'],
      kicker: 'Splenic vein thrombosis', site: 'pvt', title: 'A splenic vein clot raises the pressure on the left only',
      line: 'Splenic blood drains out through the short gastric veins, so varices form in the gastric fundus, often with no esophageal varices. Portal vein pressure and HVPG stay normal.',
      notes: 'Splenic vein thrombosis (sinistral portal hypertension) usually follows pancreatitis or a pancreatic tumor, which sit beside the vein. Blood from the spleen escapes through the short gastric veins, so the varices are in the gastric fundus, often without esophageal varices. The portal vein pressure and the HVPG are normal. When the gastric varices bleed, splenectomy, or embolization of the splenic artery, removes their inflow and cures them.',
      ask: ['Isolated gastric varices after pancreatitis. What is the cause and the cure?', 'Splenic vein thrombosis; splenectomy or splenic artery embolization, which removes the inflow that fills the varices.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'ppg', 'plt'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'clot', kicker: 'Portal vein', title: 'Acute thrombosis' }, { id: 'cavernoma', kicker: 'Portal vein', title: 'Cavernoma' }, { id: 'svt', kicker: 'Splenic vein', title: 'Splenic vein thrombosis' }],
      kicker: 'Summary', title: 'HVPG in pre-hepatic block',
      line: 'The HVPG stays normal in all three; the PPG rises only when the portal vein itself is blocked.',
      notes: 'Pre-hepatic block raises the pressure upstream of the liver and leaves the sinusoids alone: the HVPG is normal, the stiffness is normal and the liver works. The portal vein clot raises the PPG; the splenic vein clot leaves even the portal vein normal and shows only on the left, in the spleen and the gastric fundus. Treat the clot with anticoagulation, the varices as in cirrhosis, and the splenic vein clot that bleeds with splenectomy.',
      ask: ['Which pressure reading is normal in every pre-hepatic block?', 'The HVPG, because the sinusoids are downstream of the clot.'],
    },
  ],
};
