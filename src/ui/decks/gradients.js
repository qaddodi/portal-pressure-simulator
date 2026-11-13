// Presenter talk: the three gradients side by side (the slide fields are described at the top of decks.js). HVPG is the wedged minus the free hepatic
// vein pressure, PPG the portal vein minus the IVC, and EUS-PPG the left portal vein minus the left hepatic vein, read by one needle through the stomach
// (the `eus` key, fingerprint.js: the same two nodes the EUS-PPG animation reads, proc-anim.js MEASURES.eus). One idea runs through it: a gradient sees
// only the resistance that lies between its two readings.
//
// Rebuilt 13 Nov 2026 (Option A of /mnt/project-files/gradients-deck-recs, Mohammad: "Yes I love it. Do it"). Two instruments, each with one job, and
// no tiles:
//   the tracing card (tool { kind: 'reading' }, tool-reading.js): HOW a gradient is read. One monitor for the HVPG, the EUS needle, the PPG by IR and
//     the PPG through a TIPS, following the slide's procedure step by step: blank until the tip is parked, a plateau for each reading as it is taken,
//     then the gradient. Every step plays once and holds.
//   the span ruler (tool { kind: 'spans' }, tool-spans.js): WHAT a gradient sees. Where the pressure is lost between the portal vein and the IVC, and
//     each gradient as a bracket between its two readings; one that does not cover the resistance says so ("Misses"), one that cannot be taken is hatched.
// The how-slides and the first comparison stand on the opening slide's patient (no preset of their own), so the catheter never goes out and in again.
//
// Sources, checked 12 Nov 2026 against the files in guidelines/:
// AASLD 2024 portal hypertension (Hepatology 2024;79:1180): statement 3 (the HVPG is the gold standard in cirrhosis), 4 (CSPH is an HVPG of 10 mmHg or more),
// 5 (the HVPG may underestimate the portal pressure in some obese or NASH cirrhosis), Box 2 (the free hepatic vein and IVC pressures should be almost
// identical; if the free hepatic exceeds the IVC by more than 2 mmHg, a venogram rules out an obstruction), the direct portal pressure by EUS or percutaneous
// access (p. 1186), and the gastric varices text (a beta-blocker is not required after a TIPS once the portosystemic gradient is under 12 mmHg).
// Baveno VIII (J Hepatol 2026): 2.5 (in MASLD cACLD the HVPG may underestimate the true portal pressure gradient; an HVPG of 10 mmHg or more still carries risk),
// Table 3 (the right atrial pressure is measured to rule out a post-hepatic component; the immediate post-TIPS PPG is best read in a stable, non-sedated
// patient), RA8.18 and RA8.24 (the EUS-guided portal pressure gradient in PSVD or NCPF is a research question), 8.25 and 8.26 (Budd–Chiari is diagnosed on imaging).
// EASL 2025 vascular liver diseases: in PSVD and PVT the HVPG does not capture the presinusoidal component; an EUS-guided portosystemic gradient could
// overcome this, but it needs general anesthesia, which probably makes the estimate less reliable.

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;
const RULER = { kind: 'spans' };   // the span ruler: the pressure lost along the way, and each gradient's two readings as a bracket under it
const TRACE = { kind: 'reading' };   // the tracing card: the slide's measurement drawn as it is taken
const CLOT = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'];
const TRIO = ['hvpg', 'eus', 'ppg'];   // the ruler's readings, in its card's header row (card-tiles.js headKeys)

export const GRADIENTS = {
  id: 'gradients', level: 'advanced', title: 'HVPG, PPG and EUS-PPG compared', minutes: 15,
  summary: 'How the HVPG, the EUS-PPG and the PPG are measured, and what each detects in cirrhosis, MASLD, porto-sinusoidal vascular disorder, Budd–Chiari syndrome, right heart failure and after a TIPS.',
  sections: [['How each is read', ['Three readings', 'How HVPG is read', 'How EUS-PPG is read', 'How PPG is read']], ['Where they agree and miss', ['They agree', 'HVPG misses']], ['When a reading fails', ['Reading fails']], ['After a TIPS', ['After a TIPS']], ['Summary', ['Summary']]],
  objectives: [
    'Describe how each gradient is measured and which two pressures it subtracts',
    'Predict which gradient misses the resistance in each patient',
    'Recognize when no gradient helps: Budd–Chiari syndrome and right heart failure',
    'Interpret the post-TIPS PPG against its target',
  ],
  checks: [
    ['Which two pressures does each of the three gradients subtract, and how is each measured?', 'HVPG: WHVP minus FHVP, by a transjugular balloon catheter. EUS-PPG: left portal vein minus left hepatic vein pressure, by one EUS-guided transgastric needle. PPG: portal vein minus IVC pressure, the portal vein by percutaneous transhepatic puncture and the IVC by a transjugular catheter.'],
    ['A patient with varices has an HVPG of 3 mmHg and a PPG of 16 mmHg. Where does the resistance lie, and what would EUS-PPG read?', 'Presinusoidal, as in porto-sinusoidal vascular disorder or schistosomiasis. The EUS-PPG would be close to the PPG, because the needle is in the portal vein.'],
    ['A man with porto-sinusoidal vascular disorder has an HVPG of 3 mmHg. Which measurement shows his portal hypertension?', 'The PPG or the EUS-PPG: both start in the portal vein, before the resistance.'],
    ['The HVPG, EUS-PPG and PPG are all <2 mmHg, yet the portal vein pressure is 20 mmHg. What do you measure next?', 'The IVC and right atrial pressures. In right heart failure every pressure from the portal vein to the right atrium is elevated, so each gradient subtracts out the shared pressure.'],
    ['After TIPS placement the PPG falls from 17 to 9 mmHg. Is the target met?', 'Yes. AASLD 2024 gives <12 mmHg as the gradient at which a nonselective beta-blocker (NSBB) is no longer required after a TIPS.'],
  ],
  slides: [
    {
      id: 'where', preset: 'csph', lens: 'drop', cam: 'route', labels: ['CONF', 'LPV', 'RHV', 'LHV', 'IVCS'], tool: { ...RULER, empty: true },
      kicker: 'Three readings', title: 'Each gradient is the difference between two pressures measured at different sites',
      line: 'HVPG spans the sinusoids. EUS-PPG spans the liver, from the left portal vein to the left hepatic vein. PPG spans the portal vein to the IVC.',
      notes: 'HVPG is the wedged hepatic venous pressure (WHVP) minus the free hepatic venous pressure (FHVP): the pressure drop across the sinusoids (AASLD 2024 Box 2). EUS-PPG is the left portal vein minus the left hepatic vein pressure, measured with one EUS-guided needle through the gastric wall: it spans the portal tracts, the sinusoids and the central veins of the left lobe, but not the extrahepatic portal vein. PPG is the portal vein minus the IVC pressure, so it includes all resistance between the portal vein and the heart. A resistance outside a gradient\'s two measurement points does not change that gradient. The card shows the five measurement sites, and each gradient as a bracket between its two; the drops along the way appear once the pressures are measured. In this case the patient has cirrhosis with clinically significant portal hypertension (CSPH), and the next four slides measure him. The cut-offs are the HVPG\'s 5 and 10 mmHg for HVPG and EUS-PPG, and 6 and 12 mmHg for the PPG.',
      ask: ['A resistance lies in the extrahepatic portal vein. Which gradient does it raise?', 'The PPG only. The HVPG spans the sinusoids and the EUS-PPG starts at the intrahepatic left portal vein, so both lie downstream of it.'],
    },
    {
      // (The how-slides carry no preset of their own: they stand on the opening slide's patient. A preset on each made every slide a new state, and the catheter went out and in again on each Next.)
      id: 'how-hvpg', procedure: 'hvpgcath', cam: 'liver', tool: TRACE,
      kicker: 'How HVPG is read', site: 'sin', title: 'HVPG: the wedged minus the free hepatic venous pressure',
      eq: [mi('HVPG') + mo('=') + '<mi class="eq-wedge">WHVP</mi>' + mo('−') + '<mi class="eq-hv">FHVP</mi>'],
      line: 'A transjugular balloon catheter measures the free, then, with the balloon inflated, the wedged hepatic venous pressure. The difference is the HVPG.',
      notes: 'Press Next to step through it: catheter placement, the free pressure, the wedged pressure and the HVPG. The tracing card stays blank until the tip is in position, then draws each pressure as it is measured. A balloon catheter is advanced from the right internal jugular vein through the SVC and the IVC into a hepatic vein, usually the right. With the tip free in the vein, 2 to 4 cm from the IVC, it measures the free hepatic venous pressure (FHVP) once the tracing is stable, in triplicate; the FHVP should lie within about 2 mmHg of the IVC pressure. Deep sedation is avoided because it disturbs the readings. With the balloon inflated, flow stops and the static column of blood equilibrates with the upstream sinusoidal pressure, the wedged hepatic venous pressure (WHVP), recorded after at least 1 minute once the tracing is stable. A little contrast confirms the wedge. The HVPG is the WHVP minus the FHVP, the pressure drop across the sinusoids (AASLD 2024 Box 2). Subtracting the FHVP, not the right atrial pressure, cancels the intra-abdominal pressure that tense ascites adds to both. An HVPG of 1 to 5 mmHg is normal, 6 to 9 is subclinical portal hypertension, and ≥10 mmHg is clinically significant portal hypertension (AASLD 2024 statement 4).',
      ask: ['What does balloon occlusion change, and why subtract the FHVP rather than the right atrial pressure?', 'It stops flow, so the static column of blood equilibrates with the sinusoidal pressure. The FHVP carries the same intra-abdominal and extrahepatic venous pressure as the WHVP, so subtracting it cancels them.'],
    },
    {
      id: 'how-eus', procedure: 'eus', cam: 'liver', tool: TRACE,
      kicker: 'How EUS-PPG is read', site: 'sin', title: 'EUS-PPG: one transgastric needle, two venous pressures',
      eq: [mi('EUS-PPG') + mo('=') + '<msub class="eq-pv"><mi>P</mi><mtext>left portal vein</mtext></msub>' + mo('−') + '<msub class="eq-hv"><mi>P</mi><mtext>left hepatic vein</mtext></msub>'],
      line: 'An echoendoscope in the proximal stomach guides a 25-gauge needle into the left portal vein, then the left hepatic vein. The difference is the EUS-PPG.',
      notes: 'Press Next to step through it: echoendoscope placement, the portal vein, the hepatic vein and the gradient. A linear echoendoscope in the proximal stomach images the left lobe through the gastric wall. A 25-gauge needle is advanced into the left portal vein, and a compact manometer on its hub records the pressure once stable (the mean of three). The needle is withdrawn into the echoendoscope and advanced across the left lobe into the left hepatic vein for the second measurement. EUS-PPG is the portal minus the hepatic vein pressure, from one needle in one session, and it is interpreted on the HVPG cut-offs. EASL 2025 says it needs general anesthesia, which probably makes the estimate less reliable, and Baveno VIII lists the EUS-guided gradient in PSVD and NCPF as a research question (RA8.18, RA8.24). It is done in expert centers and is not a standard test.',
      ask: ['Which two veins does the EUS needle enter, and from where?', 'The left portal vein, then the left hepatic vein, both punctured through the gastric wall.'],
    },
    {
      id: 'how-ppg', procedure: { kind: 'irivc', then: 'irpv' }, cam: 'liver', tool: TRACE,
      kicker: 'How PPG is read', site: 'sin', title: 'PPG: the portal vein minus the IVC pressure',
      eq: [mi('PPG') + mo('=') + '<msub class="eq-pv"><mi>P</mi><mtext>portal vein</mtext></msub>' + mo('−') + '<msub class="eq-ivc"><mi>P</mi><mtext>IVC</mtext></msub>'],
      line: 'A transjugular catheter measures the IVC pressure. A percutaneous transhepatic needle then measures the portal pressure directly. The difference is the PPG.',
      notes: 'Press Next to step through it: catheter placement and the IVC measurement, then the puncture, the portal vein measurement and the gradient. From the right internal jugular vein the catheter is advanced through the SVC and the right atrium into the IVC, to the level of the hepatic vein ostia, and the tip records the IVC pressure once stable. Baveno VIII Table 3 advises measuring the right atrial pressure to rule out a post-hepatic component, and the same catheter can measure it a little higher up. The second access is separate: under ultrasound guidance a needle is passed through the skin and the liver into a branch of the right portal vein (percutaneous transhepatic), a wire and a catheter follow it into the main portal vein, and the tip records the portal vein pressure directly. AASLD 2024 says direct portal pressure measurements can be done by endoscopic ultrasound or by percutaneous access, while the portal pressure is more commonly estimated indirectly by the WHVP. The PPG is the portal vein minus the IVC pressure, so it does not depend on the sinusoids being the site of the resistance. A PPG ≥6 mmHg is portal hypertension and ≥12 mmHg marks the risk of variceal bleeding. The measurement is best taken in a stable, nonsedated patient (Baveno VIII Table 3).',
      ask: ['Which two pressures make up the PPG, and how is each vessel accessed?', 'The portal vein pressure, by percutaneous transhepatic puncture, minus the IVC pressure, by a transjugular catheter.'],
    },
    {
      id: 'agree', lens: 'drop', terms: ['sin'], cam: 'liver', tool: RULER, data: 'tiles', tiles: TRIO, key: TRIO,
      kicker: 'They agree', site: 'sin', title: 'In cirrhosis the three gradients agree',
      line: 'The resistance is in the [sinusoids](sin), within all three spans. The HVPG is {hvpg}, the EUS-PPG {eus} and the PPG {ppg}.',
      notes: 'The measurements just taken, side by side. In cirrhosis the resistance is sinusoidal, between the wedged and free hepatic venous positions, so the HVPG captures all of it. The PPG and the EUS-PPG span the sinusoids as well, so all three fall in the same range. This is why the HVPG is the gold standard in cirrhosis (AASLD 2024 statement 3), with clinically significant portal hypertension at ≥10 mmHg (statement 4). The PPG is slightly higher than the HVPG because it also includes the small drop along the portal vein and from the hepatic vein to the IVC, and the EUS-PPG falls between the two. Agreement of EUS-PPG with the HVPG in cirrhosis is good in early series, but the HVPG remains the reference.',
      ask: ['In cirrhosis, why does the HVPG reflect the whole portal pressure gradient?', 'Because the resistance is sinusoidal, between the wedged and free hepatic venous positions.'],
    },
    {
      // (The preset's HVPG is 10.9, still CSPH: this slide's own setting moves part of the resistance before the wedge, so the HVPG reads <10 while the PPG is ≥12 and the miss changes the call.)
      id: 'masld', preset: 'masld-csph', params: { cirrhosis: 0.5, fibrosis: { R: { pre: 5 }, L: { pre: 5 } } }, lens: 'drop', cam: 'liver', tool: RULER, data: 'tiles', tiles: TRIO, key: ['hvpg', 'ppg'],
      vignette: 'A 52-year-old man with obesity and MASLD cirrhosis has small esophageal varices on EGD and no ascites. His platelets are 82,000/µL.',
      kicker: 'HVPG misses', site: 'sin', title: 'In obese MASLD cirrhosis the HVPG can read <10 mmHg with a PPG ≥12 mmHg',
      line: 'Part of the resistance is presinusoidal, in the portal tracts, upstream of the wedged position. The HVPG is {hvpg}, the EUS-PPG {eus} and the PPG {ppg}.',
      notes: 'In MASLD cirrhosis part of the resistance is presinusoidal, in the portal venules and the perisinusoidal fibrosis, which the WHVP does not capture. The HVPG then underestimates the true portal pressure gradient by a few mmHg: Baveno VIII 2.5 and AASLD 2024 statement 5 both say so for obese and MASLD or NASH cirrhosis. In this case the HVPG is <10 mmHg while the PPG is >12 mmHg, so the HVPG alone would classify him as free of CSPH. An HVPG ≥10 mmHg still marks a higher risk of decompensation (Baveno VIII 2.5), and an HVPG just <10 mmHg does not rule out CSPH in this case. A direct portal pressure measurement, by PPG or EUS-PPG, includes the presinusoidal component.',
      ask: ['An obese patient with MASLD cirrhosis has an HVPG of 9 mmHg and small varices. What may the HVPG miss?', 'Presinusoidal resistance. The true gradient may be higher, so the HVPG does not rule out CSPH.'],
    },
    {
      id: 'psvd-q', preset: 'psvd', procedure: 'hvpgcath', cam: 'liver', tool: TRACE,
      vignette: 'A 45-year-old man with HIV, treated years ago with didanosine, has bled from esophageal varices. His liver tests are near normal.',
      kicker: 'HVPG misses', site: 'presin', title: 'He bled from varices, yet his HVPG is normal',
      line: 'The same balloon catheter measures his FHVP and WHVP. The difference is small despite variceal bleeding.',
      notes: 'Press Next to take the measurements, as on the HVPG slide. The tracing looks normal: the FHVP and WHVP are a few mmHg apart. Porto-sinusoidal vascular disorder (PSVD) is portal hypertension without cirrhosis; drugs such as didanosine and azathioprine, HIV, immunodeficiency and thrombophilia are linked to it. The next slide shows where his resistance lies.',
      ask: ['A man who bled from varices has a normal HVPG and near normal liver tests. What do you suspect?', 'Presinusoidal resistance, as in porto-sinusoidal vascular disorder: the WHVP does not capture it.'],
    },
    {
      id: 'psvd', lens: 'drop', terms: ['lobule:triad'], cam: 'lobule:triad', callout: { at: 'triad', label: 'Resistance' }, tool: RULER, data: 'tiles', tiles: TRIO, key: ['hvpg', 'eus'],
      kicker: 'HVPG misses', site: 'presin', title: 'In porto-sinusoidal vascular disorder the resistance is presinusoidal',
      line: 'The HVPG is {hvpg}. The EUS-PPG and PPG start in the portal vein, upstream of the resistance: {eus} and {ppg}.',
      notes: 'PSVD puts the resistance in the portal tracts. The sinusoids are spared, so the WHVP and FHVP are close and the HVPG stays low although the portal pressure is high. The EUS-PPG starts in the left portal vein, upstream of the portal tracts, so it spans the resistance and is close to the PPG. EASL 2025 says the HVPG does not capture the presinusoidal component in PSVD and portal vein thrombosis, and that an EUS-guided gradient could overcome this, but it needs general anesthesia, which probably makes the estimate less reliable. Baveno VIII lists the EUS-guided gradient in PSVD and NCPF as a research question (RA8.18, RA8.24), so it is not a standard test. Schistosomiasis gives the same pattern.',
      ask: ['Why does EUS-PPG see the resistance in PSVD when the HVPG does not?', 'Its needle measures the left portal vein, upstream of the portal tracts, while the WHVP reflects only sinusoidal pressure.'],
    },
    {
      id: 'bc', preset: 'budd-chiari', cath: 'blocked', lens: 'drop', mark: { edges: CLOT, label: 'Hepatic vein thrombosis', free: true }, tool: RULER, data: 'tiles', tiles: ['ppg'], key: ['ppg'],
      vignette: 'A 29-year-old woman with OCP use has had 2 months of right upper quadrant pain and now has tense ascites.',
      kicker: 'Reading fails', site: 'post', title: 'In Budd–Chiari syndrome the catheter cannot enter the hepatic veins',
      line: 'The HVPG and EUS-PPG cannot be measured. The PPG, portal vein minus IVC pressure, is {ppg}.',
      notes: 'The hepatic veins are thrombosed, so a balloon catheter cannot be wedged and there is no patent hepatic vein for the EUS needle. If a stump is catheterized, both measurements are upstream of the thrombus, so the WHVP and FHVP are both high and the gradient is near zero: a number that hides the portal hypertension. The PPG, from the portal vein to the IVC, shows it. Budd–Chiari syndrome is diagnosed on imaging, by the occluded lumen or hepatic vein collaterals with no patent hepatic vein, and a biopsy is not needed when imaging confirms it (Baveno VIII 8.25, 8.26). EUS-PPG has not been studied in Budd–Chiari.',
      ask: ['Why can the HVPG not be measured in Budd–Chiari syndrome, and which gradient can?', 'The catheter cannot enter the thrombosed hepatic veins. The PPG, portal vein minus IVC pressure, can still be measured.'],
    },
    {
      id: 'rhf', preset: 'rhf', procedure: 'hvpgcath', cam: 'route', sites: ['pv', 'ra'], tool: TRACE,
      vignette: 'A 66-year-old man with severe tricuspid regurgitation has leg edema, pulsatile hepatomegaly and ascites.',
      kicker: 'Reading fails', site: 'cardiac', title: 'In right heart failure the FHVP and WHVP are both high',
      line: 'The right atrial pressure is {ra}, and it raises every venous pressure upstream. The HVPG, WHVP minus FHVP, stays small.',
      notes: 'Press Next to take the measurements. In right heart failure every pressure from the portal vein to the right atrium is elevated, so the FHVP is high and the WHVP only slightly higher: every difference between two of them is small. Each gradient subtracts out the shared pressure. Baveno VIII Table 3 advises measuring the right atrial pressure to rule out a post-hepatic component, and AASLD 2024 Box 2 expects the free hepatic vein and IVC pressures to be almost identical; an FHVP >2 mmHg above the IVC pressure calls for a venogram. Interpret the absolute pressures as well as the gradients.',
      ask: ['The three gradients are all small but the portal vein pressure is 20 mmHg. Which pressure do you measure next?', 'The right atrial and IVC pressures: if they are elevated too, the elevation is transmitted from the right heart.'],
    },
    {
      id: 'tips', preset: 'cirr-decomp', params: { tips: { on: true, d: 8 } }, days: 30, procedure: 'tipsgrad', cam: 'liver', mark: { edges: ['TIPS'], label: 'Stent', kind: 'treat' }, tool: TRACE,
      vignette: 'A 56-year-old man with decompensated cirrhosis has rebled from large esophageal varices despite EVL and an NSBB.',
      kicker: 'After a TIPS', site: 'sin', title: 'After a TIPS the portosystemic gradient is measured against its target',
      line: 'The catheter measures the portal pressure through the covered 8 mm stent, then the IVC pressure. The target after a TIPS is {<12 mmHg}.',
      notes: 'Press Next to take the measurement. A TIPS is a low-resistance portosystemic channel from the portal vein to a hepatic vein. After it, the PPG is the gradient with a target: <12 mmHg (AASLD 2024: an NSBB is not required after a TIPS once the portosystemic gradient is <12 mmHg). The catheter is advanced through the stent into the portal vein, then withdrawn to the IVC, measuring at each. Baveno VIII Table 3 adds that the immediate post-TIPS PPG may be changed by anesthesia, vasoactive drugs or hemodynamic instability, so a measurement in a stable, nonsedated patient better reflects the long-term value. No guideline names EUS-PPG or the HVPG as a way to check a TIPS.',
      ask: ['After a TIPS, which gradient is measured against a target of <12 mmHg?', 'The portosystemic pressure gradient across the stent, the PPG.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'eus', 'ppg'], asc: false, note: 'Read', rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', note: 'Normal', ref: true },
        { id: 'agree', kicker: 'Sinusoidal', title: 'Cirrhosis', note: 'Any of the three' },
        { id: 'masld', kicker: 'Sinusoidal', title: 'MASLD cirrhosis', note: 'PPG or EUS-PPG', missPart: ['hvpg'] },
        { id: 'psvd', kicker: 'Presinusoidal', title: 'PSVD', note: 'PPG or EUS-PPG', miss: ['hvpg'] },
        { id: 'bc', kicker: 'Post-hepatic', title: 'Budd–Chiari', note: 'PPG; imaging makes the diagnosis', blank: ['hvpg', 'eus'] },
        { id: 'rhf', kicker: 'Cardiac', title: 'Right heart failure', note: 'The right atrial pressure' },
        { id: 'tips', kicker: 'Treated', title: 'After a TIPS', note: 'PPG across the stent, <12 mmHg' }],
      kicker: 'Summary', title: 'Each gradient is accurate only when the resistance lies between its two measurement points',
      line: 'The HVPG misses presinusoidal resistance. No catheter enters a thrombosed hepatic vein. In right heart failure, interpret the absolute pressures.',
      notes: 'Read across a row: the three gradients for one patient. The HVPG and the EUS-PPG agree with the PPG when the resistance lies inside the liver between their measurement points (cirrhosis). In MASLD cirrhosis the HVPG misses the presinusoidal part of the resistance, and in PSVD it misses all of it; the EUS-PPG and the PPG start in the portal vein and capture it. In Budd–Chiari syndrome neither the catheter nor the needle can enter the thrombosed veins, and imaging makes the diagnosis. In right heart failure every gradient is small although every pressure is high, so the right atrial and IVC pressures decide. After a TIPS the PPG across the stent is read against a target of <12 mmHg. Sources: AASLD 2024; Baveno VIII 2.5, Table 3, RA8.18; EASL 2025.',
      ask: ['Which patient has a high portal pressure but three small gradients?', 'The patient with right heart failure: the elevation is transmitted from the right heart, so every difference is small.'],
    },
  ],
};
