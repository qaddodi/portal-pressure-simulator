// Presenter talk: the three gradients side by side (the slide fields are described at the top of decks.js). HVPG is the wedged minus the free hepatic
// vein pressure, PPG the portal vein minus the IVC, and EUS-PPG the left portal vein minus the left hepatic vein, read by one needle through the stomach
// (the `eus` tile, fingerprint.js: the same two nodes the EUS-PPG animation reads, proc-anim.js MEASURES.eus). One idea runs through it: a gradient sees
// only the resistance that lies between its two readings. The slides run the same three readings through seven patients the model already has.
//
// Sources, checked 12 Nov 2026 against the files in guidelines/:
// AASLD 2024 portal hypertension (Hepatology 2024;79:1180): statement 3 (the HVPG is the gold standard in cirrhosis), 4 (CSPH is an HVPG of 10 mmHg or more),
// 5 (the HVPG may underestimate the portal pressure in some obese or NASH cirrhosis), Box 2 (the free hepatic vein and IVC pressures should be almost
// identical; if the free hepatic exceeds the IVC by more than 2 mmHg, a venogram rules out an obstruction), and the gastric varices text (a beta-blocker is not
// required after a TIPS once the portosystemic gradient is under 12 mmHg).
// Baveno VIII (J Hepatol 2026): 2.5 (in MASLD cACLD the HVPG may underestimate the true portal pressure gradient; an HVPG of 10 mmHg or more still carries risk),
// Table 3 (the right atrial pressure is measured to rule out a post-hepatic component; the immediate post-TIPS PPG is best read in a stable, non-sedated
// patient), RA8.18 and RA8.24 (the EUS-guided portal pressure gradient in PSVD or NCPF is a research question), 8.25 (Budd–Chiari is diagnosed on imaging).
// EASL 2025 vascular liver diseases: in PSVD and PVT the HVPG does not capture the presinusoidal component; an EUS-guided portosystemic gradient could
// overcome this, but it needs general anesthesia, which probably makes the estimate less reliable.
// The model's own results (not a guideline statement) are named in the notes: the needle's left portal vein lies beyond a main portal vein clot.

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;
const TRIO = ['hvpg', 'eus', 'ppg'];   // the three readings, on every patient's data card
const PROFILE = { kind: 'profile', spans: TRIO };   // the pressure from gut to heart, with a bracket and a pill for each gradient so the pair it subtracts can be seen
const CLOT = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'];

export const GRADIENTS = {
  id: 'gradients', level: 'advanced', title: 'HVPG, PPG and EUS-PPG compared', minutes: 15,
  summary: 'How the HVPG, the PPG and the EUS-PPG are measured, then the three in seven patients: cirrhosis, MASLD, schistosomiasis, a portal vein clot, Budd–Chiari, heart failure and after a TIPS.',
  sections: [['Three readings', ['Three readings']], ['How each is read', ['How HVPG is read', 'How EUS-PPG is read', 'How PPG is read']], ['Where they agree and miss', ['They agree', 'HVPG misses']], ['When a reading fails', ['Reading fails', 'After a TIPS']], ['Which to read', ['Which to read', 'Summary']]],
  objectives: [
    'Describe how each gradient is measured and which two pressures it subtracts',
    'Predict which gradient misses the resistance in each patient',
    'Say when no gradient helps: Budd–Chiari and heart failure',
    'Choose the reading that answers the question',
  ],
  checks: [
    ['Which two pressures does each of the three gradients subtract, and how is each read?', 'HVPG: wedged minus free hepatic vein, by a balloon catheter from the neck. EUS-PPG: left portal vein minus left hepatic vein, by one needle through the stomach. PPG: portal vein minus IVC, the portal vein read directly by a needle through the skin and the liver, the IVC by a catheter from the neck.'],
    ['A patient with varices has an HVPG of 3 mmHg and a PPG of 16 mmHg. Where does the resistance lie, and what would EUS-PPG read?', 'Before the sinusoids, as in schistosomiasis or porto-sinusoidal vascular disorder. EUS-PPG would read close to the PPG, because the needle sits in the portal vein.'],
    ['A portal vein clot leaves both the HVPG and the EUS-PPG near normal. Why?', 'Both read beyond the clot: the wedge reads the sinusoids and the needle reads the left portal vein inside the liver. Only a reading upstream of the clot shows the pressure.'],
    ['The HVPG, EUS-PPG and PPG are all <2 mmHg, yet the portal vein pressure is 20 mmHg. What do you read next?', 'The IVC and right atrial pressures. In right heart failure every station is high, so the gradients cancel it out.'],
    ['After a TIPS the PPG falls from 17 to 9 mmHg. Is the target met?', 'Yes. AASLD 2024 gives <12 mmHg as the gradient at which a beta-blocker is no longer required after a TIPS.'],
  ],
  slides: [
    {
      id: 'span', preset: 'csph', lens: 'drop', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], tool: PROFILE, data: 'tiles', tiles: TRIO, key: TRIO,
      kicker: 'Three readings', title: 'A gradient sees only the resistance between its two readings',
      line: 'HVPG spans the sinusoids, from wedged to free. EUS-PPG spans the liver, from the left portal vein to the left hepatic vein. PPG spans the portal vein to the IVC.',
      notes: 'HVPG is the wedged minus the free hepatic vein pressure: the drop across the sinusoids (AASLD 2024 Box 2). PPG is the portal vein minus the IVC, so it takes in everything between the confluence and the heart; it is measured directly during a TIPS or by a transhepatic or transjugular needle into a portal branch. EUS-PPG is the pressure in the left portal vein minus the pressure in the left hepatic vein, read by one needle through the stomach wall: it spans the portal tracts, the sinusoids and the central veins of the left lobe, but not the portal vein outside the liver. A resistance that lies outside a gradient\'s two readings does not change that gradient. All three are read here on the same patient, who has cirrhosis with clinically significant portal hypertension. The cut-offs are the HVPG\'s 5 and 10 mmHg for HVPG and EUS-PPG, and 6 and 12 mmHg for the PPG.',
      ask: ['A resistance lies in the portal vein trunk, before the liver. Which gradient does it raise?', 'The PPG only. The HVPG spans the sinusoids and EUS-PPG starts inside the liver, so both lie beyond it.'],
    },
    {
      id: 'how-hvpg-free', preset: 'csph', cath: 'free', tool: { kind: 'hvpg', catheter: true },
      kicker: 'How HVPG is read', title: 'HVPG, step 1: the free pressure in an open hepatic vein',
      terms: { 'hepatic vein': 'hv' },
      line: 'A balloon catheter from the neck sits in the right hepatic vein. With the balloon down, its tip reads the free pressure, {fhvp}.',
      notes: 'A balloon catheter goes in through the right internal jugular vein, down the SVC and the IVC into a hepatic vein, usually the right. With the tip free in the vein, 2 to 4 cm from the IVC, it reads the free hepatic venous pressure (FHVP), once the tracing is stable and in triplicate. Deep sedation is avoided because it disturbs the readings. The free pressure should lie within about 2 mmHg of the IVC pressure (AASLD 2024 Box 2). This is the same patient as the other slides in this talk, who has cirrhosis with clinically significant portal hypertension.',
      ask: ['What does the free pressure read, and how close should it lie to the IVC pressure?', 'The pressure of the open hepatic vein, within about 2 mmHg of the IVC.'],
    },
    {
      id: 'how-hvpg-wedge', preset: 'csph', cutouts: ['sinusoid'], cath: 'wedge', tool: { kind: 'hvpg', catheter: true },
      kicker: 'How HVPG is read', site: 'sin', title: 'HVPG, step 2: with the balloon up, the wedged pressure reads the sinusoids',
      terms: { sinusoids: 'whvp' },
      line: 'The balloon stops the flow, so the still blood ahead settles at the pressure of the feeding sinusoids. The wedged pressure is {whvp}.',
      notes: 'With the balloon inflated, flow in the hepatic vein stops and the still column of blood carries the pressure of the sinusoids that feed it, the wedged hepatic venous pressure (WHVP). A little contrast confirms the wedge: it stays still with no washout through collaterals. The WHVP is read once the tracing is stable, after at least 1 minute. In cirrhosis the sinusoids no longer communicate freely with each other, so the WHVP closely matches the portal pressure.',
      ask: ['What does the balloon change, and what does the catheter then read?', 'It stops the flow, so the still blood ahead settles at the sinusoidal pressure.'],
    },
    {
      id: 'how-hvpg', preset: 'csph', cath: 'result', tool: { kind: 'hvpg', catheter: true },
      kicker: 'How HVPG is read', site: 'sin', title: 'HVPG, step 3: the wedged pressure less the free pressure',
      eq: [mi('HVPG') + mo('=') + '<mi class="eq-wedge">WHVP</mi>' + mo('−') + '<mi class="eq-hv">FHVP</mi>'],
      line: 'The drop across the sinusoids is the difference of the two readings. Here the HVPG is {hvpg}.',
      notes: 'The HVPG is the wedged minus the free hepatic venous pressure, the drop across the sinusoids (AASLD 2024 Box 2). Subtracting the free pressure, not the right atrial one, cancels the abdominal pressure that tense ascites adds to both readings. A reading of 1 to 5 mmHg is normal, 6 to 9 is subclinical portal hypertension, and ≥10 mmHg is clinically significant portal hypertension (AASLD 2024 statement 4).',
      ask: ['Why subtract the free pressure rather than the right atrial pressure?', 'The free pressure carries the same abdominal and venous pressure as the wedge, so subtracting it cancels them.'],
    },
    {
      id: 'how-eus', preset: 'csph', procedure: 'eus', cam: 'liver', data: 'tiles', tiles: ['eus', 'ppg'], key: ['eus'],
      kicker: 'How EUS-PPG is read', site: 'sin', title: 'EUS-PPG: one needle through the stomach, into two veins',
      line: 'An echoendoscope in the stomach guides a needle into the left portal vein, then the left hepatic vein. EUS-PPG is {eus}.',
      notes: 'Press Next to step through it: the scope in, the portal vein, the hepatic vein, and the gradient. A linear echoendoscope in the proximal stomach images the left lobe through the wall. A 25-gauge needle crosses into the left portal vein and a compact manometer on its hub reads the pressure once it settles (the mean of three). The needle comes back into the scope and crosses the left lobe into the left hepatic vein for the second reading. EUS-PPG is the portal minus the hepatic vein pressure, from one needle in one session, and it is read on the HVPG\'s cut-offs. EASL 2025 says it needs general anesthesia, which probably makes the estimate less reliable, and Baveno VIII lists the EUS-guided gradient in PSVD and NCPF as a research question (RA8.18, RA8.24). It is done in expert centers and is not a standard test.',
      ask: ['Which two veins does the EUS needle enter, and from where?', 'The left portal vein, then the left hepatic vein, both through the wall of the stomach.'],
    },
    {
      id: 'how-ir-ivc', preset: 'csph', procedure: 'irivc', cam: 'liver', data: 'tiles', tiles: ['ivc'], key: ['ivc'],
      kicker: 'How PPG is read', title: 'PPG by IR, step 1: a catheter from the neck reads the IVC',
      line: 'A catheter goes in through the neck, down the SVC and through the right atrium into the IVC at the hepatic veins. The IVC pressure is {ivc}.',
      notes: 'Press Next to step through it: the catheter in, then the IVC reading. Through the right internal jugular vein the catheter goes down the SVC and through the right atrium into the IVC, to the level where the hepatic veins open into it. The tip reads the IVC pressure once it settles. Baveno VIII Table 3 advises measuring the right atrial pressure to rule out a post-hepatic component, and the same catheter can read it a little higher up. This reading is the second half of the PPG, which is the portal vein pressure less the IVC pressure (AASLD 2024).',
      ask: ['Why does the PPG need an IVC reading?', 'The PPG is the portal vein pressure less the IVC pressure, so the IVC reading is the half that is subtracted.'],
    },
    {
      id: 'how-ir-pv', preset: 'csph', procedure: 'irpv', cam: 'liver', data: 'tiles', tiles: ['pv', 'ppg'], key: ['ppg'],
      kicker: 'How PPG is read', site: 'sin', title: 'PPG by IR, step 2: a needle through the skin reads the portal vein directly',
      eq: [mi('PPG') + mo('=') + '<msub class="eq-pv"><mi>P</mi><mtext>portal vein</mtext></msub>' + mo('−') + '<msub class="eq-ivc"><mi>P</mi><mtext>IVC</mtext></msub>'],
      line: 'Under ultrasound a needle crosses the skin and the liver into the portal vein, and a catheter reads it. The PPG is {ppg}.',
      notes: 'Press Next to step through it: the needle in, the portal vein reading, then the gradient. This is a second approach, separate from the neck. Under ultrasound a needle goes through the skin and the liver into a branch of the right portal vein (percutaneous transhepatic), a wire and a catheter follow it into the main portal vein, and the tip reads the portal vein pressure directly. AASLD 2024 says direct portal pressure measurements can be done by endoscopic ultrasound or by percutaneous access, while the portal pressure is more commonly judged indirectly by the wedged hepatic pressure. The PPG is this reading less the IVC reading of the first step, so it takes in everything between the portal vein and the heart and does not depend on the sinusoids being the site of the resistance. A PPG ≥6 mmHg is portal hypertension and ≥12 mmHg carries the bleeding risk. The reading is best taken in a stable, non-sedated patient (Baveno VIII Table 3).',
      ask: ['Which two pressures make the PPG, and how does each approach reach its vein?', 'The portal vein pressure, read through the skin and the liver, less the IVC pressure, read by a catheter from the neck.'],
    },
    {
      id: 'agree', lens: 'drop', terms: ['sin'], cam: 'liver', tool: PROFILE, data: 'tiles', tiles: TRIO, key: TRIO,
      kicker: 'They agree', site: 'sin', title: 'In cirrhosis all three gradients agree',
      line: 'The resistance sits in the [sinusoids](sin), inside the span of all three. HVPG is {hvpg}, EUS-PPG {eus} and PPG {ppg}.',
      notes: 'In cirrhosis the resistance is in the sinusoids, which lie between the wedge and the free hepatic vein, so the HVPG sees all of it. The portal pressure gradient and the EUS-PPG span the sinusoids too, so they read the same band. This is why the HVPG is the gold standard in cirrhosis (AASLD 2024 statement 3), with clinically significant portal hypertension at ≥10 mmHg (statement 4). The PPG reads a little above the HVPG here because it also includes the small drop in the hepatic vein and the IVC, and EUS-PPG falls between the two. Agreement of EUS-PPG with the HVPG in cirrhosis is good in early series, but the HVPG remains the reference.',
      ask: ['In cirrhosis, why does the HVPG see the whole portal gradient?', 'Because the resistance lies in the sinusoids, between the wedge and the free hepatic vein.'],
    },
    {
      id: 'masld', preset: 'masld-csph', lens: 'drop', terms: ['pv'], cam: 'liver', tool: PROFILE, data: 'tiles', tiles: TRIO, key: ['hvpg', 'ppg'],
      vignette: 'A 52-year-old man with obesity and MASLD cirrhosis has small esophageal varices on EGD and no ascites. His platelets are 82,000/µL.',
      kicker: 'HVPG misses', site: 'sin', title: 'In obese MASLD cirrhosis the HVPG can read under the true gradient',
      line: 'Part of the resistance sits in the portal tracts, before the wedge. HVPG is {hvpg}, while EUS-PPG reads {eus} and the PPG {ppg}.',
      notes: 'In MASLD cirrhosis part of the resistance sits before the sinusoids, in the portal venules and the perisinusoidal scar, where the wedge cannot read it. The HVPG then reads a few mmHg under the true portal pressure gradient: Baveno VIII 2.5 and AASLD 2024 statement 5 both say so for obese and MASLD or NASH cirrhosis. An HVPG ≥10 mmHg still marks a higher risk of decompensation (Baveno VIII 2.5), so a reading just <10 mmHg does not rule out clinically significant portal hypertension in this patient. A portal vein reading, by PPG or by EUS-PPG, is not held short by the presinusoidal part.',
      ask: ['An obese patient with MASLD cirrhosis has an HVPG of 9 mmHg and small varices. What does the HVPG possibly miss?', 'Resistance before the sinusoids. The true gradient may be higher, so the HVPG does not rule out clinically significant portal hypertension.'],
    },
    {
      id: 'presin', preset: 'schisto', lens: 'drop', terms: ['pv'], cam: 'liver', tool: PROFILE, data: 'tiles', tiles: TRIO, key: ['hvpg', 'eus'],
      vignette: 'A 30-year-old man from Egypt has esophageal varices and a large spleen. His liver tests are near normal and he has no ascites.',
      kicker: 'HVPG misses', site: 'presin', title: 'In schistosomiasis the HVPG misses what both portal readings find',
      line: 'The resistance lies in the portal tracts, before the wedge. HVPG is {hvpg}, yet EUS-PPG reads {eus} and the PPG {ppg}.',
      notes: 'Schistosomiasis puts the resistance in the portal tracts. The sinusoids are spared, so the wedged and the free hepatic vein pressures are close and the HVPG stays low although the portal pressure is high. EUS-PPG starts in the left portal vein, upstream of the portal tracts, so it spans the resistance and reads close to the PPG. EASL 2025 says the HVPG does not capture the presinusoidal component in portosystemic vascular disorder and portal vein thrombosis, and that an EUS-guided gradient could overcome this, but it needs general anesthesia, which probably makes the estimate less reliable. Baveno VIII lists the EUS-guided gradient in PSVD and NCPF as a research question (RA8.18, RA8.24), so it is not a standard test. Porto-sinusoidal vascular disorder gives the same pattern in the model.',
      ask: ['Why does EUS-PPG see the resistance in schistosomiasis when the HVPG does not?', 'Its needle reads the left portal vein, upstream of the portal tracts, while the wedge reads only the sinusoids.'],
    },
    {
      id: 'pvt', preset: 'pvt-chronic', lens: 'drop', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, tool: PROFILE, data: 'tiles', tiles: TRIO, key: ['eus', 'ppg'],
      vignette: 'A 38-year-old man with a JAK2-positive myeloproliferative neoplasm has splenomegaly and esophageal varices. His liver tests are normal and he has no ascites.',
      kicker: 'HVPG misses', site: 'pre', title: 'A portal vein clot hides the pressure from the EUS needle too',
      line: 'The needle reaches the left portal vein, beyond the clot. EUS-PPG reads {eus} and HVPG {hvpg}; only the PPG, {ppg}, sees the clot.',
      notes: 'The clot sits in the main portal vein, outside the liver. The wedge reads the sinusoids, beyond the clot, and the EUS needle reads the left portal vein inside the liver, also beyond the clot. In the model both stay near normal; only the PPG, read in the portal vein upstream of the clot, shows the pressure. This is the model\'s result and not a guideline statement: a cavernoma that reconstitutes the intrahepatic portal branches keeps their pressure low. EASL 2025 says the HVPG does not reflect the portal hypertension of portal vein thrombosis. In practice Doppler ultrasound or CT finds the clot, and nobody needles a cavernoma for a pressure; the clot is used here to show that where a needle sits matters as much as which gradient it takes.',
      ask: ['Why does a clot in the main portal vein leave both the HVPG and the EUS-PPG normal?', 'Both readings lie beyond the clot: the wedge reads the sinusoids and the needle reads the left portal vein inside the liver.'],
    },
    {
      id: 'bc', preset: 'budd-chiari', lens: 'drop', cam: 'hepatic', labels: ['RHV', 'RA'], mark: { edges: CLOT, label: 'Clot in hepatic veins', free: true }, tool: PROFILE, data: 'tiles', tiles: ['pv', 'ppg'], key: ['ppg'],
      vignette: 'A 29-year-old woman taking oral contraceptives has had 2 months of right upper quadrant pain and now has tense ascites.',
      kicker: 'Reading fails', site: 'post', title: 'In Budd–Chiari no catheter or needle can read through the hepatic veins',
      line: 'All three hepatic veins are clotted. HVPG and EUS-PPG cannot be taken; the PPG, read to the IVC, is {ppg}.',
      notes: 'The hepatic veins are clotted, so a balloon catheter cannot be wedged and a needle cannot read a patent hepatic vein. If a stump is reached, both readings lie behind the clot, so the wedged and free pressures are both high and the gradient is near zero: a number that hides the portal hypertension. The PPG, read from the portal vein to the IVC below the clot, shows it. Budd–Chiari is diagnosed on imaging, by the blocked lumen or hepatic vein collaterals with no patent hepatic vein, and a biopsy is not needed when imaging confirms it (Baveno VIII 8.25, 8.26). EUS-PPG has not been studied in Budd–Chiari; the model shows what a needle that reached the clotted vein would read.',
      ask: ['Why can the HVPG not be taken in Budd–Chiari, and which gradient still reads?', 'The catheter cannot enter the clotted veins. The PPG, portal vein minus IVC, still reads.'],
    },
    {
      id: 'rhf', preset: 'rhf', lens: 'drop', cam: 'heart', labels: ['RHV', 'IVCS', 'RA'], tool: PROFILE, data: 'tiles', tiles: TRIO, key: TRIO,
      vignette: 'A 66-year-old man with severe tricuspid regurgitation has swollen legs, an enlarged liver that pulses, and ascites.',
      kicker: 'Reading fails', site: 'cardiac', title: 'In right heart failure every pressure is high and every gradient is small',
      line: 'The right atrial pressure is {ra}, and it holds the portal vein up with it. HVPG, EUS-PPG and PPG all stay small.',
      notes: 'In right heart failure every station from the portal vein to the right atrium is high, so every difference between two of them is small. Each gradient subtracts the shared pressure away. Baveno VIII Table 3 advises measuring the right atrial pressure to rule out a post-hepatic component, and AASLD 2024 Box 2 expects the free hepatic vein and IVC pressures to be almost identical; a free hepatic pressure >2 mmHg above the IVC calls for a venogram. Read the absolute pressures as well as the gradients.',
      ask: ['The three gradients are all small but the portal vein pressure is 20 mmHg. Which pressure do you read next?', 'The right atrial and IVC pressures: if they are high too, the whole system is held up from the heart.'],
    },
    {
      id: 'tips', preset: 'cirr-decomp', params: { tips: { on: true, d: 8 } }, days: 30, lens: 'drop', cam: 'liver', mark: { edges: ['TIPS'], label: 'Stent', kind: 'treat' }, tool: PROFILE, data: 'tiles', tiles: TRIO, key: ['ppg'],
      vignette: 'A 56-year-old man with decompensated cirrhosis has rebled from large esophageal varices despite banding and a beta-blocker.',
      kicker: 'After a TIPS', site: 'sin', title: 'After a TIPS the PPG across the stent is the gradient with a target',
      line: 'A covered 8 mm stent brings the PPG to {ppg} (<12 mmHg). HVPG falls to {hvpg} and EUS-PPG to {eus}.',
      notes: 'A TIPS is a stent from a hepatic vein to the portal vein, so portal blood has a low-resistance path back to the heart. After it, the PPG is the gradient with a target: <12 mmHg (AASLD 2024: a beta-blocker is not required after a TIPS once the portosystemic gradient is <12 mmHg). Baveno VIII Table 3 adds that the immediate post-TIPS PPG may be changed by anesthesia, vasoactive drugs or hemodynamic instability, so a reading in a stable, non-sedated patient better reflects the long-term value. In the model the HVPG and EUS-PPG fall with the PPG. No guideline file names EUS-PPG as a way to check a TIPS.',
      ask: ['After a TIPS, which gradient is read against a target of <12 mmHg?', 'The portosystemic pressure gradient across the stent, the PPG.'],
    },
    {
      id: 'choose', cam: 'liver',
      tool: { kind: 'criteria', title: 'Which gradient to read', short: 'Which to read', ticks: false, lead: 'Match the reading to where the resistance lies.',
        rows: ['**HVPG** in cirrhosis, to stage it and follow treatment', '**PPG** when the resistance lies before the wedge', '**EUS-PPG** a research option in PSVD or NCPF', '**Neither** in Budd–Chiari or heart failure: read the absolute pressures'],
        verdict: 'Start with the HVPG: use the PPG if resistance is not sinusoidal.' },
      kicker: 'Which to read', title: 'Match the gradient to where the resistance lies',
      line: 'The HVPG is the standard in cirrhosis. Where the resistance lies elsewhere the PPG is the reading to trust, and EUS-PPG is still being studied.',
      notes: 'The HVPG is the gold standard in cirrhosis (AASLD 2024 statement 3). Where the resistance lies before the sinusoids, as in portal vein thrombosis and porto-sinusoidal vascular disorder, EASL 2025 says the HVPG misses the presinusoidal component; a direct portal reading finds it. An EUS-guided gradient could overcome the limit, but EASL 2025 notes that it needs general anesthesia, which probably makes it less reliable, and Baveno VIII lists it as a research question (RA8.18, RA8.24). In Budd–Chiari the diagnosis rests on imaging, and in heart failure the right atrial pressure is the first reading.',
      ask: ['A patient has varices and a normal HVPG with normal liver tests. Which reading do you take?', 'A portal vein reading, the PPG, because the HVPG cannot see resistance before the wedge.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'eus', 'ppg'], asc: false, note: 'Reading to trust', rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', note: 'Normal', ref: true },
        { id: 'agree', kicker: 'Sinusoidal', title: 'Cirrhosis', note: 'Any of the three' },
        { id: 'masld', kicker: 'Sinusoidal', title: 'MASLD cirrhosis', note: 'PPG or EUS-PPG' },
        { id: 'presin', kicker: 'Presinusoidal', title: 'Schistosomiasis', note: 'PPG or EUS-PPG' },
        { id: 'pvt', kicker: 'Pre-hepatic', title: 'Portal vein thrombosis', note: 'PPG, upstream of the clot' },
        { id: 'bc', kicker: 'Post-hepatic', title: 'Budd–Chiari', note: 'PPG', blank: ['hvpg', 'eus'] },
        { id: 'rhf', kicker: 'Cardiac', title: 'Right heart failure', note: 'The absolute pressures' },
        { id: 'tips', kicker: 'Treated', title: 'After a TIPS', note: 'PPG across the stent' }],
      kicker: 'Summary', title: 'Each gradient reads true only when the resistance lies between its readings',
      line: 'HVPG misses resistance before the wedge, EUS-PPG misses a clot before its needle, and both are blank in Budd–Chiari. The PPG finds all but heart failure.',
      notes: 'Read across a row: the three gradients for one patient, with the portal vein pressure that they come from. The HVPG and the EUS-PPG agree with the PPG when the resistance lies inside the liver between their readings (cirrhosis, and partly MASLD cirrhosis). In schistosomiasis the HVPG misses the resistance and the EUS-PPG and PPG find it. A clot in the main portal vein lies before both the wedge and the needle, so only a reading upstream of the clot shows it. In Budd–Chiari neither the catheter nor the needle can enter the clotted veins. In right heart failure every gradient is small although every pressure is high, so the right atrial and IVC pressures decide. After a TIPS the PPG across the stent is read against a target of <12 mmHg. Sources: AASLD 2024; Baveno VIII 2.5, Table 3, RA8.18; EASL 2025.',
      ask: ['Which patient has a high portal pressure but three small gradients?', 'The patient with right heart failure: the pressure is held up from the heart, so every difference is small.'],
    },
  ],
};
