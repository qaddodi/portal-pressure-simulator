// Presenter talk: measuring portal pressure: HVPG and PPG (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;

export const HVPG = {
  id: 'hvpg', level: 'core', title: 'Measuring HVPG and PPG', minutes: 15,
  summary: 'How the HVPG is measured and interpreted, where it misleads, and when to measure the PPG instead.',
  objectives: ['Describe how the free and wedged hepatic venous pressures are recorded', 'Calculate the HVPG, state its 5 and 10 mmHg cut-offs, and state where the bleeding risk climbs', 'Recognize when the HVPG misleads', 'Use the portal pressure gradient (PPG) when it does'],
  checks: [
    ['How is the HVPG calculated?', 'Wedged hepatic venous pressure minus free hepatic venous pressure (WHVP − FHVP).'],
    ['At which HVPG levels does the risk rise?', 'An HVPG >5 mmHg is portal hypertension, ≥10 mmHg is CSPH, and from about 12 mmHg the risk of variceal bleeding rises steeply.'],
    ['When does the HVPG miss a high portal pressure, and what do you measure instead?', 'When the resistance is prehepatic or presinusoidal, as in portal vein thrombosis or schistosomiasis. Measure the PPG, portal vein minus IVC pressure.'],
    ['WHVP is 21, FHVP 20 and right atrial pressure 19 mmHg. The HVPG is 1 mmHg. Is the portal pressure normal?', 'No. Every pressure is elevated because the right atrial pressure is transmitted back to the liver, so the gradient is small while the portal pressure is >20 mmHg.'],
  ],
  slides: [
    {
      id: 'route', preset: 'csph', cath: 'route',
      kicker: 'Measuring portal pressure', title: 'Access through the right internal jugular vein',
      vignette: 'A 57-year-old man with alcohol-associated cirrhosis has platelets of 90,000/µL and a liver stiffness measurement (LSM) of 24 kPa. He has never had ascites or variceal bleeding, and he is referred for HVPG measurement.',
      terms: { 'right atrium': 'ra', IVC: 'ivc', 'hepatic vein': 'hv' },
      line: 'A balloon catheter is advanced from the right internal jugular vein through the superior vena cava, the right atrium and the IVC into a hepatic vein.',
      notes: 'Under local anesthetic and ultrasound guidance the right internal jugular vein is punctured, and a balloon catheter is passed under fluoroscopy through the right atrium into the IVC and on into a hepatic vein, usually the right. The transducer is zeroed at the mid-axillary line and each measurement is taken in triplicate; deep sedation is avoided because it alters the measurements. A transjugular liver biopsy can be obtained in the same session.',
      ask: ['Why the right internal jugular vein?', 'It gives a straight path through the right atrium and the IVC into the hepatic veins.'],
    },
    {
      id: 'free', cath: 'free', tool: { kind: 'hvpg', catheter: true },
      kicker: 'Measuring portal pressure', title: 'The FHVP is recorded with the tip free in the hepatic vein',
      terms: { 'hepatic vein pressure': 'fhvp', IVC: 'ivc' },
      line: 'The free hepatic vein pressure (FHVP), 2 to 4 cm from the IVC, is within about 2 mmHg of it. Subtracting it cancels the raised intra-abdominal pressure of ascites.',
      notes: 'The free hepatic venous pressure (FHVP) is recorded with the tip free in the hepatic vein, 2 to 4 cm from its ostium in the IVC. It should be within about 2 mmHg of the IVC pressure; a larger difference suggests malposition of the tip or an occluded hepatic vein. Subtracting the FHVP rather than the right atrial pressure cancels the intra-abdominal pressure that tense ascites adds to both readings.',
      ask: ['Why subtract the FHVP rather than the right atrial pressure?', 'The FHVP carries the same intra-abdominal and extrahepatic venous pressure as the wedged pressure, so subtracting it cancels them.'],
    },
    {
      id: 'wedge', cutouts: ['sinusoid'], cath: 'wedge', tool: { kind: 'hvpg', catheter: true },
      kicker: 'Measuring portal pressure', title: 'The wedged pressure reflects sinusoidal pressure',
      terms: { sinusoids: 'whvp' },
      line: 'Balloon inflation stops flow, so the static column of blood equilibrates with the pressure of the upstream sinusoids. Record it once the tracing is stable, after ≥1 minute.',
      notes: 'With the balloon inflated, flow in the hepatic vein stops and the static column of blood transmits the pressure of the upstream sinusoids. A small contrast injection confirms the wedge: the contrast stays in place, with no washout through collaterals. The wedged hepatic venous pressure (WHVP) is recorded once stable, after at least 1 minute, on the last 20 to 30 seconds of the tracing. In cirrhosis the sinusoids no longer communicate freely with each other, so the WHVP closely matches the portal pressure.',
      ask: ['How do you confirm adequate wedging?', 'Inject a small amount of contrast: it stays in the vein with no washout, and the tracing loses its pulsatility.'],
    },
    {
      id: 'hvpg', cath: 'result', tool: { kind: 'hvpg', catheter: true },
      kicker: 'Measuring portal pressure', site: 'sin', title: 'HVPG measures the pressure drop across the sinusoids',
      eq: [mi('HVPG') + mo('=') + '<mi class="eq-wedge">WHVP</mi>' + mo('−') + '<mi class="eq-hv">FHVP</mi>'],
      line: 'In this case the HVPG is {hvpg}, which is {>=10 mmHg}: clinically significant portal hypertension.',
      notes: 'The hepatic venous pressure gradient is the pressure drop across the sinusoids. In this case the HVPG is about 12 mmHg, which is clinically significant. An HVPG of 1 to 5 mmHg is normal, and 6 to 9 mmHg is subclinical portal hypertension. From 10 mmHg varices and decompensation become possible, and the risk rises with the gradient; Baveno VIII advises a nonselective beta-blocker (NSBB), preferably carvedilol, at this stage to prevent decompensation. From about 12 mmHg the risk of variceal bleeding rises steeply, although varix size, red wale signs and liver function determine the bleeding risk: 12 mmHg is not a cut-off, and varices can bleed below it. Before nonhepatic abdominal surgery, an HVPG ≥16 mmHg is associated with higher short-term postoperative mortality (Baveno VIII Table 3). In acute variceal bleeding, an HVPG ≥20 mmHg is one of the criteria for preemptive TIPS (Baveno VIII 5.31). In MASLD cirrhosis the HVPG can underestimate the directly measured portal pressure, because part of the resistance is presinusoidal, so an HVPG just <10 mmHg does not exclude CSPH. On an NSBB, a fall of ≥10% from baseline, or to ≤12 mmHg, is clinically relevant (Baveno VIII Table 3, stated for primary prophylaxis). Noninvasively, an LSM ≥25 kPa by VCTE rules in CSPH; an LSM ≤15 kPa with platelets ≥150,000/µL rules it out. Sources: AASLD 2024 3 and 4; Baveno VIII Table 3.',
      ask: ['On carvedilol, the HVPG falls from 18 to 13 mmHg. Is that a response?', 'Yes. It fell by >10% from baseline, which Baveno VIII calls clinically relevant on an NSBB, and it is close to 12 mmHg.'],
    },
    {
      id: 'presin', lens: 'drop', terms: ['lobule:triad', 'lobule:sinusoid'], preset: 'schisto', cam: 'lobule:triad', callout: { at: 'triad', label: 'Resistance' }, tool: { kind: 'profile' }, key: ['pv', 'whvp', 'hvpg'],
      kicker: 'Where HVPG misleads', site: 'presin', title: 'Normal HVPG, high portal pressure',
      vignette: 'A 34-year-old woman who grew up by the Nile has had variceal bleeding. Her liver tests are normal, she has splenomegaly, and her HVPG was normal.',
      line: 'In schistosomiasis the resistance is in the portal tracts, upstream of the sinusoids. The HVPG is {hvpg:0} and the portal pressure {pv}.',
      notes: 'The WHVP reflects only the pressure downstream of the resistance. In presinusoidal disease (schistosomiasis, porto-sinusoidal vascular disorder, early primary biliary cholangitis) the sinusoids are near normal, so the WHVP and the HVPG are normal or only mildly elevated and underestimate the portal pressure. A normal HVPG in a patient with varices or splenomegaly points to a presinusoidal or prehepatic cause. The large pressure drop is in the portal venules, upstream of the wedged position.',
      ask: ['A 30-year-old man from Egypt has varices and a normal HVPG. What is the likely cause?', 'Schistosomiasis: presinusoidal resistance that the WHVP does not reflect.'],
    },
    {
      id: 'ppg', lens: 'drop', terms: ['pv', 'sin'], preset: 'pvt-chronic', cam: 'route', labels: [], sites: ['pv', 'ivc'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, tool: { kind: 'profile' }, key: ['pv', 'ivc'],
      kicker: 'Where HVPG misleads', site: 'pre', title: 'The PPG detects resistance the HVPG misses',
      eq: [mi('PPG') + mo('=') + '<msub class="eq-pv"><mi>P</mi><mtext>portal vein</mtext></msub>' + mo('−') + '<msub class="eq-ivc"><mi>P</mi><mtext>IVC</mtext></msub>'],
      line: 'Imaging shows the thrombus. The HVPG stays normal because the thrombus lies upstream of the sinusoids; a direct portal vein measurement would show a PPG of {ppg}.',
      notes: 'Portal pressure can be measured directly: during TIPS, through a needle into a portal branch (transhepatic or transjugular), or by an endoscopic ultrasound-guided needle. A PPG >5 mmHg is portal hypertension, as for the HVPG, and after TIPS the target is a PPG <12 mmHg. In the model the portal pressure is measured at the confluence, upstream of the thrombus, so the PPG is high while the HVPG, measured downstream, is normal. The large pressure drop is at the thrombus, not in the sinusoids. In practice Doppler ultrasound or CT makes the diagnosis, and a cavernoma is not punctured for a pressure measurement; portal vein thrombosis is used here because it shows the discrepancy between the two gradients most clearly. At the bedside the HVPG misleads in presinusoidal disease such as PSVD or schistosomiasis, with varices and a normal WHVP.',
      ask: ['A patient with varices has a normal HVPG and a patent portal vein. Which measurement detects the resistance, and where is it obtained?', 'The PPG, measured in the portal vein itself (at TIPS, transhepatically, or by an EUS-guided needle), upstream of the resistance.'],
    },
    {
      // (EUS-PPG, played step by step as the TIPS is on the shunts talk: proc-anim.js MEASURES.eus. A measurement, so the model does not
      // change; the callouts read the live left portal and left hepatic veins.)
      id: 'eus', preset: 'schisto', procedure: 'eus', cam: 'liver', tool: { kind: 'reading' }, data: 'tiles', tiles: ['hvpg', 'ppg'], key: ['ppg'],
      kicker: 'Where HVPG misleads', site: 'presin', title: 'EUS-PPG measures the portal vein pressure directly',
      line: 'Back in the woman with schistosomiasis, an EUS-guided transgastric needle measures the portal and hepatic veins. The gradient is near the PPG of {ppg}; the HVPG is {hvpg}.',
      notes: 'Press Next to step through it: echoendoscope placement, the portal vein, the hepatic vein and the gradient. A linear echoendoscope in the proximal stomach images the left lobe; a 25-gauge needle is advanced into the left portal vein, then into the left hepatic vein, each measured with a compact manometer, and the EUS-PPG is the left portal vein pressure minus the left hepatic vein pressure, from one needle in one session. Because the portal vein itself is measured, the EUS-PPG captures the presinusoidal resistance the WHVP misses, here schistosomiasis, and porto-sinusoidal vascular disorder the same way. It needs no catheter, no radiation and no contrast, and varices can be treated or a liver biopsy obtained in the same session. It is interpreted against the HVPG cut-offs. In early series it agrees well with the HVPG in cirrhosis, but the EUS-PPG is not yet a guideline standard, and it is performed in expert centers under sedation, which can lower the measurements.',
      ask: ['Why can the EUS-PPG detect a pressure the HVPG misses?', 'It measures the portal vein itself, upstream of a presinusoidal resistance; the WHVP reflects only the sinusoids.'],
    },
    {
      // (The three gradients of the patient the EUS slide just measured, on the ladder: the EUS-PPG is taught on the slide before, so its bracket stands here.)
      id: 'eus-ladder', lens: 'drop', terms: ['lobule:triad'], cam: 'lobule:triad', callout: { at: 'triad', label: 'Resistance' }, tool: { kind: 'profile', spans: ['hvpg', 'eus', 'ppg'] }, key: ['hvpg', 'eus'],
      kicker: 'Where HVPG misleads', site: 'presin', title: 'The EUS-PPG spans the resistance that the wedge leaves out',
      line: 'The HVPG is {hvpg:0}. The EUS-PPG starts in the portal vein, upstream of the resistance, and reads {eus:0}, close to the PPG of {ppg:0}.',
      notes: 'The same patient, with the three gradients side by side. The HVPG is the wedged minus the free hepatic venous pressure, so it spans the sinusoids only. The EUS-PPG is the left portal vein minus the left hepatic vein pressure, so it starts upstream of the portal tracts and spans the resistance; the PPG spans the portal vein to the IVC. Baveno VIII lists the EUS-guided gradient in PSVD and NCPF as a research question (RA8.18, RA8.24), so it is not a standard test.',
      ask: ['The HVPG is 3 mmHg and the EUS-PPG 15 mmHg in the same patient. Where does the resistance lie?', 'Between the left portal vein and the wedge, in the portal tracts. The EUS-PPG spans it and the HVPG does not.'],
    },
    {
      id: 'heart', lens: 'heat', preset: 'rhf', cam: 'heart', labels: ['RHV', 'IVCS', 'RA'], tool: { kind: 'profile' }, data: 'tiles', tiles: ['whvp', 'fhvp', 'ra'], key: ['fhvp', 'ra', 'hvpg'],
      kicker: 'Where HVPG misleads', site: 'cardiac', title: 'In right heart failure every pressure is high',
      line: '[Wedged](whvp) {whvp} and [free](fhvp) {fhvp} hepatic venous pressures are both high, so the HVPG is normal. The elevated FHVP points to a cardiac cause.',
      notes: 'The HVPG is a difference, so it cancels whatever pressure the WHVP and FHVP share. In right heart failure and constrictive pericarditis every pressure from the portal vein to the right atrium is elevated: the HVPG and the PPG are normal, but the absolute pressures are not. Always record the FHVP and the right atrial pressure as well. The same pattern with a normal right atrial pressure points to resistance between the hepatic veins and the heart, such as an IVC web. The figure shows congestion in every vein from the right atrium back to the splanchnic circulation.',
      ask: ['WHVP 21, FHVP 20, right atrial pressure 19 mmHg. What is the HVPG, and where is the lesion?', 'HVPG 1 mmHg, normal. The cause is cardiac: every pressure is elevated.'],
    },
    {
      id: 'bc', terms: ['hv', 'ivc'], preset: 'budd-chiari', cath: 'blocked',
      kicker: 'Where HVPG misleads', site: 'post', title: 'In Budd–Chiari the catheter often cannot enter the hepatic veins',
      line: 'The hepatic veins or the IVC above them are thrombosed or webbed. If a wedge is achieved, both readings lie upstream of the resistance, so the HVPG is near zero.',
      notes: 'In Budd–Chiari syndrome the hepatic veins, or the IVC above them, are thrombosed or webbed. The catheter often cannot enter the vein, or enters only a stump. If a wedge is achieved, both the wedged and the free readings lie upstream of the resistance, so the HVPG is near zero and misleading. Doppler ultrasound, CT or MR venography make the diagnosis; venography shows a spider-web of collaterals. Treatment is stepwise: anticoagulation, angioplasty or a stent for short stenoses, TIPS, then liver transplantation. Often only a hepatic vein stump remains.',
      ask: ['Why can the HVPG not be measured here, and what shows the lesion instead?', 'The catheter cannot enter the thrombosed veins; Doppler ultrasound and CT or MR venography show the occlusion.'],
    },
    {
      id: 'plane', visual: 'plane', plane: 'hvpg-ppg',
      of: [{ preset: 'healthy', name: 'Healthy' }, { id: 'hvpg', name: 'Cirrhosis' }, { id: 'presin', name: 'Schistosomiasis' }, { id: 'ppg', name: 'Portal vein thrombosis', short: 'PVT' }, { id: 'heart', name: 'Heart failure' }],
      kicker: 'Where HVPG misleads', title: 'The HVPG and PPG together separate five patients',
      line: 'Schistosomiasis and portal vein thrombosis raise the PPG and leave the HVPG low. Cirrhosis raises both. In right heart failure every pressure is high, but neither gradient rises.',
      notes: 'Each point is one patient from this talk, plotted with the HVPG on the x-axis and the PPG on the y-axis, with the app\'s cut-offs (HVPG 5 and 10 mmHg, PPG 6 and 12 mmHg). The HVPG 10 line marks clinically significant portal hypertension (CSPH: an HVPG of 10 mmHg or more, Baveno VIII and AASLD 2024), and an HVPG to its right is CSPH, whatever the PPG. The PPG 12 line marks the bleeding risk and the post-TIPS target (<12 mmHg); it is not a CSPH cut-off. Schistosomiasis and portal vein thrombosis plot high on the PPG with a low HVPG, because the WHVP reflects only the pressure downstream of the resistance. The EUS-PPG measures the portal gradient in such a patient with one transgastric needle into the portal and the hepatic vein. Budd–Chiari is not plotted: the catheter cannot enter the thrombosed veins, so there is no HVPG to plot. Cirrhosis raises both gradients. In right heart failure every pressure rises together, so both gradients stay low although the absolute pressures are high.',
      ask: ['A patient has varices and an HVPG of 3 mmHg. Which measurement do you obtain next?', 'The PPG, measured in the portal vein; it is high when the resistance is prehepatic, presinusoidal or in the hepatic veins.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'whvp', 'fhvp', 'ivc', 'ra', 'hvpg', 'ppg'], asc: false, note: 'What the HVPG shows', rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', note: 'Normal', ref: true }, { id: 'hvpg', kicker: 'Sinusoidal', title: 'Cirrhosis', note: 'Reliable' }, { id: 'presin', kicker: 'Presinusoidal', title: 'Schistosomiasis', note: 'Normal despite the resistance' },
        { id: 'ppg', kicker: 'Pre-hepatic', title: 'Portal vein thrombosis', note: 'Normal despite the resistance' }, { id: 'heart', kicker: 'Cardiac', title: 'Right heart failure', note: 'Normal, all pressures high' }, { id: 'bc', kicker: 'Post-hepatic', title: 'Budd–Chiari', note: 'Cannot be measured', blank: ['whvp', 'fhvp', 'hvpg'] }],
      kicker: 'Summary', title: 'When the HVPG is reliable',
      line: 'The HVPG tracks the PPG only when the resistance is in the sinusoids or small central veins. Elsewhere, measure the PPG (directly or by EUS) and the absolute pressures.',
      notes: 'The HVPG is reliable when the resistance lies between the wedged and the free hepatic venous positions: in the sinusoids, as in cirrhosis, the most common cause, or in the small central veins, as in sinusoidal obstruction syndrome, where an HVPG ≥10 mmHg supports the diagnosis. In cirrhosis it is the standard for diagnosis, prognosis and monitoring treatment. It is normal with prehepatic and presinusoidal resistance, and near zero when the WHVP and FHVP rise together (post-hepatic, cardiac). The PPG and the absolute pressures complete the picture. The model\'s pressures for Budd–Chiari are those upstream of the resistance.',
      ask: ['Which measurements locate the level of resistance?', 'The HVPG with the FHVP and the right atrial pressure, and the PPG when it can be measured.'],
    },
  ],
};
