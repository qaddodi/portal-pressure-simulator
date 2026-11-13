// Presenter talk: a clot in the portal vein, first in a patient with a normal liver and then in cirrhosis, from the scan that
// finds it to months of anticoagulation (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;

export const PREHEPATIC = {
  id: 'prehepatic', level: 'core', title: 'Portal vein thrombosis', minutes: 10,
  sections: [['PVT without cirrhosis', ['Acute thrombosis', 'Months later']], ['PVT in cirrhosis', ['PVT in cirrhosis', 'Before anticoagulation']], ['Anticoagulation in cirrhosis', ['Anticoagulation']]],
  objectives: [
    'Recognize acute portal vein thrombosis (PVT) on Doppler',
    'Explain why the HVPG is normal and the PPG is high',
    'Describe cavernous transformation and its varices with normal liver stiffness',
    'Start anticoagulation in cirrhosis without delaying it for variceal prophylaxis',
  ],
  checks: [
    ['Why is the HVPG normal in PVT?', 'The thrombus is prehepatic. The WHVP reflects the normal sinusoidal pressure downstream of it.'],
    ['Which measurement shows the resistance?', 'The PPG: portal vein pressure minus IVC pressure.'],
    ['What comes before anticoagulation in cirrhosis?', 'Prophylaxis of variceal bleeding, with carvedilol if tolerated; it must not delay anticoagulation.'],
    ['After six months of anticoagulation the PPG falls from 27 to 4 mmHg and the HVPG stays at 2 mmHg. What moved?', 'The portal vein recanalized, so the prehepatic resistance fell. The resistance was never sinusoidal, so the HVPG did not change.'],
  ],
  summary: 'Prehepatic resistance from PVT: acute thrombosis on Doppler, the normal HVPG and high PPG, cavernous transformation months later, and partial PVT in cirrhosis from diagnosis to 6 months of anticoagulation.',
  slides: [
    {
      id: 'clot', preset: 'pvt-acute', cam: 'portal', labels: ['CONF'], terms: { 'portal pressure': 'pv', 'superior mesenteric vein': 'smv' }, tool: { kind: 'doppler', vessel: 'PV_TRUNK', mode: 'color' }, data: 'tiles', tiles: ['pv'], key: ['pv'],
      whatIf: { label: 'Clot size', param: 'thrombus.PV_TRUNK', min: 0, max: 1, step: 0.05, ends: ['None', 'Occlusive'] },
      kicker: 'Acute thrombosis', site: 'pre', title: 'Acute occlusive PVT abolishes portal flow on Doppler',
      vignette: 'A 39-year-old woman with homozygous factor V Leiden who takes an OCP has had 4 days of constant periumbilical pain. Her liver tests and platelet count are normal.',
      caseQ: 'Will her HVPG be elevated?',
      line: 'Portal pressure rises steeply upstream of the thrombus; contrast CT confirms it and shows any extension into the superior mesenteric vein, which risks mesenteric ischemia.',
      notes: 'Source: Baveno VIII 9.2, 9.6 to 9.8. Acute portal vein thrombosis presents with abdominal pain, sometimes fever, or is found incidentally on imaging. Doppler ultrasound is the first-line test, and multiphase CT confirms the thrombus, assesses local factors and shows its extent (9.2). Look for a cause: a myeloproliferative neoplasm (test for JAK2), an inherited thrombophilia, local inflammation (pancreatitis, appendicitis, diverticulitis), abdominal surgery or cirrhosis (9.4, 9.5). When the thrombus extends into the superior mesenteric vein, look for clinical and radiological signs of intestinal ischemia (9.7). Without cirrhosis, recent PVT rarely resolves spontaneously, and recanalization is more likely the earlier anticoagulation starts, so therapeutic anticoagulation starts at once (9.6) and continues for at least 6 months (9.8).',
      ask: ['What does Doppler show in acute occlusive PVT?', 'No flow in the main portal vein; an acute thrombus can be nearly anechoic, so the absent color Doppler signal matters more than the grayscale image. Doppler is the first-line test and multiphase CT confirms it (Baveno VIII 9.2).'],
    },
    {
      // (The grade of the clot from the lumen left, Baveno VIII 9.3. The acute clot of the model fills the vein, so the remnant lumen is 0%: a case fact the chart
      // is given, not a model reading. tool-path.js.)
      id: 'path-pvtocc', preset: 'pvt-acute', cam: 'portal', labels: ['CONF'], glow: ['PV_TRUNK'],
      tool: { kind: 'path', of: 'pvtocc', short: 'Occlusion grade', patient: { rl: 0 } },
      kicker: 'Acute thrombosis', site: 'pre', title: 'CT grades the occlusion by the remnant lumen',
      line: 'On CT, occlusion is graded by the remnant portal lumen. Here no lumen remains, a complete occlusion; a remnant lumen {>=50%} would be minimal occlusion.',
      notes: 'Doppler suggests the thrombus and multiphase CT confirms it (Baveno VIII 9.2). By the VALDIG portal vein thrombosis criteria the degree of occlusion is then the percentage of remnant portal lumen (RL) relative to the largest diameter of the vein, read on CT or MRI in the portal venous phase, in a plane strictly perpendicular to the main portal vein (9.3). Minimal occlusion is an RL of 50% or more, partial occlusion an RL under 50% but not 0%, and complete occlusion an RL of 0%. In the model the acute thrombus fills the vein, so no lumen remains and the occlusion is complete; the percentage is read on imaging, and the model does not draw it. Drag Clot size on the previous slide to see the Doppler change as the lumen narrows.',
      ask: ['CT shows a remnant portal lumen of 40%. How is the occlusion graded?', 'Partial: the remnant lumen is <50% but not 0%. Minimal is ≥50%; complete is 0%.'],
    },
    {
      id: 'cath', cath: 'result', tool: { kind: 'profile' }, key: ['hvpg', 'ppg'],
      kicker: 'Acute thrombosis', site: 'pre', title: 'HVPG is normal in PVT',
      eq: [mi('PPG') + mo('=') + sub(mi('P'), 'portal vein') + mo('−') + sub(mi('P'), 'IVC')],
      line: 'The thrombus is prehepatic, so the wedged and free hepatic venous pressures (WHVP, FHVP) stay normal and the HVPG is {hvpg}; the PPG of {ppg} shows the resistance.',
      notes: 'The WHVP reflects sinusoidal pressure, downstream of the thrombus, so the HVPG is normal however high the portal venous pressure. The PPG (portal vein pressure minus IVC pressure) includes the prehepatic resistance; it needs direct portal vein pressure measurement (transhepatic, at TIPS, or by EUS). In practice the diagnosis is made on imaging, and a hemodynamic study is rarely needed. A normal HVPG with varices indicates that the resistance is not sinusoidal.',
      ask: ['Varices, splenomegaly and an HVPG of 3 mmHg. What does the HVPG tell you?', 'The resistance is not sinusoidal: look upstream, in the portal vein (prehepatic) or the portal tracts (presinusoidal).'],
    },
    {
      id: 'anticoag', lens: 'velocity', preset: 'pvt-acute', params: { anticoag: true }, days: 180, lapse: { seconds: 8 }, cam: 'portal', labels: ['CONF'],
      tool: { kind: 'flowtime', clock: 'days', lines: ['pv', 'ppg'], keepTiles: true, title: 'Portal pressure and PPG over six months' }, data: 'tiles', tiles: ['pv', 'ppg'], key: ['ppg'], delta: 'clot',
      compare: [{ label: 'Anticoagulation', own: true }, { label: 'No anticoagulation', short: 'None', preset: 'pvt-acute', params: {}, days: 180 }],
      kicker: 'Acute thrombosis', site: 'pre', title: 'Early anticoagulation can recanalize the portal vein',
      line: 'Anticoagulation starts at once and continues ≥6 months; here the portal vein recanalizes, flow returns and the PPG falls to {ppg}.',
      notes: 'Source: Baveno VIII 9.6, 9.8. In recent PVT without cirrhosis, the thrombus rarely resolves spontaneously and recanalization follows early treatment, so anticoagulation starts as soon as possible at a therapeutic dose (9.6, strong) and continues for at least six months (9.8, strong). The thrombophilia workup should not delay it. Neither Baveno VIII nor AASLD 2024 gives a recanalization rate, so the slide quotes none. In the model the thrombus clears completely over 6 months; untreated, it persists, and within 6 months the varices enlarge, splenomegaly develops and the platelet count falls: the cavernous transformation of a later slide.',
      ask: ['How long is anticoagulation continued for recent PVT without cirrhosis?', '≥6 months, started as soon as possible (Baveno VIII 9.6, 9.8); long term when a permanent major risk factor remains (9.10).'],
    },
    {
      id: 'anticoag-lumen', lens: 'velocity', cam: 'portal', labels: ['CONF'], tool: { kind: 'lumen', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv', 'ppg'], key: ['ppg'], delta: 'clot',
      kicker: 'Acute thrombosis', site: 'pre', title: 'At 6 months the portal vein lumen is fully recanalized',
      line: 'In cross-section the main portal vein lumen is fully patent, with no residual thrombus.',
      notes: 'Source: Baveno VIII 9.6, 9.8. The same patient as the slide before, six months after anticoagulation started. The card shows the main portal vein in cross-section. In the model the thrombus clears completely; neither Baveno VIII nor AASLD 2024 quotes a recanalization rate.',
      ask: ['What does the cross-section show after 6 months of early anticoagulation in the model?', 'A fully patent lumen with no residual thrombus. Neither guideline quotes a recanalization rate.'],
    },
    {
      // (Six months on from the anticoagulation slide, the vein open: the chart of how long to treat a recent clot, Baveno VIII 9.6 to 9.10. Her homozygous factor V Leiden is a
      // permanent major risk factor (homozygous) and the contraceptive, a reversible one, is stopped: case facts, not the model's. tool-path.js.)
      id: 'path-pvtdur', lens: 'velocity', cam: 'portal', labels: ['CONF'],
      tool: { kind: 'path', of: 'pvtdur', short: 'Duration', patient: { at: '6', rec: true, rev: true, perm: true, ext: false } },
      kicker: 'Acute thrombosis', site: 'pre', title: 'At 6 months, her risk factors set the duration',
      line: 'Anticoagulation began at once and ran ≥6 months. With the vein recanalized, whether to continue depends on her risk factors, not on imaging.',
      notes: 'Baveno VIII advises anticoagulation at once, at a therapeutic dose, for recent PVT without cirrhosis (9.6), and a search for intestinal ischemia when the thrombus extends into the superior mesenteric vein (9.7). Treatment lasts at least 6 months (9.8, strong). Stopping may be considered, as a weak recommendation, only when the vein is fully recanalized at 3 months, the reversible risk factor has resolved and there is no permanent one. She has homozygous factor V Leiden, a permanent factor, so early discontinuation is not an option and she completes 6 months. If the thrombus had extended into the superior mesenteric or splenic vein and the vein were still occluded at 6 months, full-dose treatment may continue for 6 more months, because late recanalization can still happen (9.9, weak). Here the vein is recanalized at 6 months, so the next step is the long-term plan, which depends on the type of risk factor (9.10): the grid on the next slide. Recanalization and both risk factors are case facts; the model shows only the recanalized vein.',
      ask: ['At 3 months the vein is fully recanalized and the OCP has been stopped, but she is homozygous for factor V Leiden. Can anticoagulation be stopped?', 'No. Stopping is considered only with no permanent risk factor. She completes ≥6 months, then the long-term plan is set by her risk factors.'],
    },
    {
      // (Fig. 5 of Baveno VIII, lit for the same patient: a reversible factor (the contraceptive) and a permanent major one (homozygous factor V Leiden; Table S4 calls only an isolated heterozygous one not major). Case facts. tool-path.js.)
      id: 'path-pvtgrid', lens: 'velocity', cam: 'portal', labels: ['CONF'],
      tool: { kind: 'path', of: 'pvtgrid', short: 'Long-term grid', patient: { r: 'yes', c: 'maj' } },
      kicker: 'Acute thrombosis', site: 'pre', title: 'A permanent major factor means long-term anticoagulation',
      line: 'Her OCP use was a reversible risk factor; homozygous factor V Leiden is a permanent major one. That column calls for long-term, therapeutic-dose anticoagulation.',
      notes: 'This is Fig. 5 of Baveno VIII, for PVT without cirrhosis. Two questions place the patient in one cell: was the thrombosis provoked by a reversible risk factor in the last 3 months, and is there a permanent risk factor, and if so, is it major? Thrombophilia and myeloproliferative neoplasm are the examples of major permanent factors the guideline gives (9.5); the supplement (Table S4) lists the factors, and puts only an isolated heterozygous factor V G1691A or factor II G20210A mutation among the permanent factors that are not major. She is homozygous, so hers is major. A permanent major factor calls for long-term anticoagulation at a therapeutic dose (9.10a, strong). Without one, long-term DOACs at a lower dose can be considered (9.10b, weak). After complete resolution of a reversible factor and with no permanent factor, stopping can be considered (9.10c, weak). In the figure the cells are blue for a low risk of recurrence, gray for an intermediate or undetermined risk and red for a high risk. Her OCP use was a reversible factor, but her factor V Leiden is permanent and major, so she falls in the red cell whether or not the thrombosis was provoked. Had she carried an isolated heterozygous mutation, she would fall in the not-major column, where a lower-dose DOAC can be considered (9.10b, weak).',
      ask: ['PVT with no reversible and no permanent risk factor found. What does Fig. 5 offer?', 'A lower-dose DOAC can be considered for the long term (weak recommendation). Stopping is considered only after a reversible factor has resolved. The same lower-dose option applies to a permanent factor that is not major, such as an isolated heterozygous factor V Leiden.'],
    },
    {
      id: 'cavernoma', lens: 'velocity', preset: 'pvt-chronic', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Occluded portal vein' }, tool: { kind: 'lumen', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv', 'ppg'], key: ['ppg'], delta: 'clot',
      kicker: 'Months later', site: 'pre', title: 'Without recanalization, cavernous transformation develops',
      line: 'A cavernoma, a network of porto-portal collaterals, forms around the occluded vein and carries the flow the trunk cannot. Varices develop.',
      notes: 'Cavernous transformation is a network of collaterals around the occluded portal vein that develops within weeks to months. It does not carry enough flow to decompress the portal system, so varices, splenomegaly and thrombocytopenia follow. Screen for varices with EGD and treat them as in cirrhosis: a nonselective beta-blocker (NSBB) or endoscopic variceal ligation (EVL). Long-term anticoagulation is advised when a thrombophilia persists. Large pericholedochal collaterals can compress the bile duct (portal cholangiopathy). In children, PVT often follows umbilical vein catheterization or sepsis in infancy.',
      ask: ['A child presents with variceal bleeding and normal liver tests. What is the likely cause?', 'Chronic PVT with cavernous transformation: varices with a normal liver indicate prehepatic resistance.'],
    },
    {
      id: 'liver', cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'ssm'], key: ['lsm', 'ssm'], delta: false,
      kicker: 'Months later', site: 'pre', title: 'The liver parenchyma is normal',
      line: 'Liver stiffness (LSM) is {lsm} and the HVPG normal, yet spleen stiffness is {ssm}: varices with normal liver stiffness indicate prehepatic resistance.',
      notes: 'Source: Baveno VIII 1.6, 9.11. The parenchyma is spared, so LSM, albumin and INR are usually normal and hepatic decompensation is rare. An LSM <10 kPa with signs of portal hypertension should raise suspicion of vascular liver disease (1.6): PVT, schistosomiasis or porto-sinusoidal vascular disorder (PSVD). Doppler or CT distinguishes PVT from the others. Spleen stiffness remains elevated because it tracks portal venous pressure. In PVT without cirrhosis, EGD is performed at diagnosis and can be spared only when spleen stiffness is <40 kPa (9.11); here it is well above that, so EGD is indicated.',
      ask: ['Varices, platelets 70,000/µL and an LSM of 5 kPa. Which two causes do you consider first?', 'PVT and presinusoidal disease such as schistosomiasis. In PVT, a spleen stiffness ≥40 kPa means EGD cannot be spared (Baveno VIII 9.11).'],
    },
    {
      id: 'base', tick: 'Before PVT', preset: 'csph', cam: 'portal', terms: ['pv'], tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv'], key: ['pv'],
      kicker: 'PVT in cirrhosis', site: 'sin', title: 'Cirrhosis predisposes to PVT',
      vignette: 'A 61-year-old man with HCV cirrhosis, SVR 3 years ago, presents for his 6-month HCC surveillance ultrasound. His platelet count is 90,000/µL.',
      line: 'Cirrhosis with CSPH, portal pressure {pv}: slow portal vein flow raises the risk of PVT, most of all <15 cm/s, and an elevated INR does not protect.',
      causesHead: 'Risk factors for PVT', causes: ['Low portal vein velocity', 'More advanced liver disease', 'Abdominal surgery, especially splenectomy'],
      notes: 'PVT becomes more common as cirrhosis advances, and low portal flow velocity is the strongest local risk factor. The INR reflects only the fall in procoagulant factors; synthesis of protein C and antithrombin falls too, so hemostasis is rebalanced and an elevated INR does not protect. Abdominal surgery, especially splenectomy, adds to the risk. Many thrombi are partial and found incidentally on surveillance imaging.',
      ask: ['Does an elevated INR protect a patient with cirrhosis from PVT?', 'No: the natural anticoagulants (protein C, antithrombin) fall too, so hemostasis is rebalanced.'],
    },
    {
      id: 'gradients', question: 'Will partial PVT raise the HVPG, the PPG or both?', tick: 'Partial PVT', params: { thrombus: { PV_TRUNK: 0.6 } }, cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'IVCS'], mark: { edges: ['PV_TRUNK'], clot: true }, tool: { kind: 'profile' }, data: 'tiles', tiles: ['pvVel'], key: ['hvpg', 'ppg'], delta: 'base',
      compare: [{ label: 'Pressure', lens: 'pressure', own: true }, { label: 'Pressure drop', short: 'Drop', lens: 'drop' }],
      eq: [mi('PPG') + mo('=') + sub(mi('P'), 'portal vein') + mo('−') + sub(mi('P'), 'IVC')],
      kicker: 'PVT in cirrhosis', site: 'pre', title: 'HVPG is unchanged while the PPG rises',
      line: 'Thrombus fills over half the lumen. The WHVP reflects the sinusoids downstream, so the HVPG stays near {hvpg}; the model\'s PPG rises to {ppg}, higher than typical.',
      notes: 'On ultrasound a partial thrombus is echogenic material in the lumen, with color flow around it and a higher velocity through the narrowed segment (the portal vein velocity tile reads it); an occlusive thrombus shows no flow. Contrast CT or MRI follows: first to exclude tumor thrombus from HCC, which enhances in the arterial phase and expands the vein, then to map extension into the splenic and superior mesenteric veins, which guides treatment. In cirrhosis the HVPG measures the sinusoidal component of the resistance. PVT adds a second, prehepatic site of resistance that only direct portal pressure measurement detects, so the HVPG underestimates portal pressure, and a TIPS gradient is measured from the portal vein itself. Tap Pressure drop: a second large drop appears at the thrombus, in addition to the sinusoidal one. The varices enlarge as the pressure upstream of the thrombus rises.',
      ask: ['A patient with cirrhosis has partial PVT and an unchanged HVPG. Does that exclude the thrombus?', 'No: the thrombus is prehepatic, so the HVPG cannot detect it. The PPG, from direct portal pressure measurement, does.'],
    },
    {
      id: 'carv', tick: 'Carvedilol', params: { drugs: { carvedilol: true } }, ripple: true, cam: 'portal', terms: ['pv'], data: 'tiles', tiles: ['pv', 'hr'], key: ['pv'], delta: true,
      kicker: 'Before anticoagulation', site: 'sin', title: 'Carvedilol, then anticoagulation without delay',
      line: 'Carvedilol lowers portal pressure to {pv} and prevents first variceal bleeding, so anticoagulation starts without waiting for a course of band ligation.',
      notes: 'Source: Baveno VIII 8.10. When anticoagulation is indicated in vascular liver disease, it starts without delay and is not postponed for endoscopic prophylaxis of variceal bleeding, and recanalization follows early treatment (9.6). In cirrhosis with clinically significant portal hypertension (CSPH), Baveno VIII recommends an NSBB, preferably carvedilol, regardless of varices, and a patient on one needs no screening EGD. Carvedilol treats the portal hypertension and needs no EGD to start. EVL, for a patient who cannot take an NSBB, takes several sessions and leaves post-banding ulcers that can bleed on anticoagulation. Low-molecular-weight heparin (LMWH) or a vitamin K antagonist can be used; a DOAC in CTP class A, with caution in class B, and not in class C.',
      ask: ['Which variceal prophylaxis suits a patient about to start anticoagulation?', 'Carvedilol, if tolerated: it treats the portal hypertension, and post-banding ulcers can bleed on anticoagulation.'],
    },
    {
      // (Baveno VIII 9.22 and 9.25 to 9.28 on the same partial clot when no anticoagulant is given or it fails; the figure is the slide before's.)
      id: 'untreated', cam: 'portal', terms: ['pv'], data: 'tiles', tiles: ['pv', 'ppg'], key: ['pv'],
      tool: { kind: 'criteria', title: 'Untreated PVT', short: 'Untreated PVT', ticks: false, lead: 'In cirrhosis, when no anticoagulant is given.', rule: 'Baveno VIII 9.22, 9.26, 9.27',
        rows: ['**Repeat imaging** within 6 weeks, then every 3 months', 'If the thrombus **progresses**, start anticoagulation', '**TIPS** for main portal vein thrombosis that does not improve', '**TIPS first** if anticoagulation is contraindicated'], verdict: 'After TIPS: no routine anticoagulation (9.28).' },
      kicker: 'Before anticoagulation', site: 'pre', title: 'Untreated PVT is monitored, then anticoagulated or treated with TIPS',
      line: 'Without anticoagulation, repeat imaging within 6 weeks, then every 3 months. Progression calls for anticoagulation; main portal vein thrombosis that does not improve may need TIPS.',
      notes: 'Baveno VIII 9.22: in cirrhosis with untreated PVT, repeat the imaging within 6 weeks of diagnosis to look for progression, then every 3 months if it has not progressed, especially in patients listed for transplant. If it progresses, anticoagulation is indicated (weak recommendation). 9.26: TIPS can be considered for main portal vein thrombosis that does not improve on anticoagulation, in a patient who has complications of portal hypertension or is a transplant candidate. 9.27: TIPS may be considered first when complications of portal hypertension come with a contraindication to anticoagulation (weak). 9.28: after TIPS, routine anticoagulation is not recommended. If an anticoagulant is chosen, 9.25 names no preferred DOAC, and 9.23 says to weigh age, frailty, renal function, decompensation and platelets <50,000/µL case by case. If variceal bleeding occurs with PVT, manage it as in patients without PVT; TIPS with portal vein recanalization is for selected patients with ascites, documented progression or transplant candidacy (5.45).',
      ask: ['A patient with cirrhosis has new PVT and is not anticoagulated. When is imaging repeated?', 'Within 6 weeks of diagnosis, then every 3 months if the thrombus has not progressed. If it progresses, anticoagulation is indicated (Baveno VIII 9.22).'],
    },
    {
      id: 'pvt-anticoag', lens: 'velocity', tick: 'Anticoagulation', params: { anticoag: true }, days: 180, lapse: { seconds: 8 }, cam: 'portal', terms: ['pv'],
      tool: { kind: 'flowtime', clock: 'days', lines: ['pv', 'ppg'], keepTiles: true, title: 'Portal pressure and PPG over six months' }, data: 'tiles', tiles: ['pv', 'ppg'], key: ['pv'], delta: 'gradients',
      kicker: 'Anticoagulation', site: 'sin', title: 'Anticoagulation recanalizes the portal vein over months',
      line: 'Anticoagulation can recanalize the portal vein in cirrhosis; here it recanalizes within 6 months and portal pressure falls to {pv}, faster than in most patients.',
      notes: 'Source: Baveno VIII 9.18 to 9.21. Baveno VIII advises anticoagulation for transplant candidates with any PVT (9.18), and considers it for recent partial (<50% remnant lumen) or complete thrombosis of the main portal vein and for symptomatic PVT (9.19). Transplant candidates continue it until transplant; other patients receive at least 6 months, and long-term use is considered whether or not the vein recanalizes (9.20). If it is stopped, imaging at 1 month and then every 3 months looks for recurrence or progression (9.21). Neither Baveno VIII nor AASLD 2024 gives a recanalization rate for cirrhosis, so the slide quotes none.',
      ask: ['The portal vein has recanalized after 6 months of anticoagulation in cirrhosis. Must anticoagulation stop?', 'No. Baveno VIII 9.20: continue for ≥6 months, and consider long-term use whether or not the vein recanalizes; transplant candidates continue until transplant.'],
    },
    {
      id: 'pvt-anticoag-lumen', lens: 'velocity', cam: 'portal', terms: ['pv'], tool: { kind: 'lumen', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv', 'ppg'], key: ['pv'], delta: 'gradients',
      kicker: 'Anticoagulation', site: 'sin', title: 'The portal vein lumen is patent again',
      line: 'After 6 months of anticoagulation, the main portal vein lumen is free of thrombus in cross-section.',
      notes: 'Source: Baveno VIII 9.18 to 9.21. The same patient as the slide before. In the model the thrombus clears completely, faster than it does in most patients with cirrhosis; neither Baveno VIII nor AASLD 2024 quotes a recanalization rate for cirrhosis.',
      ask: ['The lumen is patent again at 6 months. Is anticoagulation stopped?', 'Not on that basis alone. Continue for ≥6 months, and consider long-term use whether or not the vein recanalizes (Baveno VIII 9.20).'],
    },
    {
      id: 'course', cam: 'fit', tool: { kind: 'trace', range: 'talk', since: 'base', title: 'The course on one chart', bands: ['carvedilol', 'anticoag'], gap: 'clot' },
      kicker: 'Anticoagulation', site: 'sin', title: 'Portal pressure tracked the thrombus while the HVPG was unchanged',
      line: 'The gap between the portal pressure and WHVP lines is the pressure drop across the thrombus; imaging, not the HVPG, shows whether the vein has recanalized.',
      notes: 'The chart plots portal pressure, WHVP, FHVP and the HVPG at each step. The gap that opens between the portal pressure and WHVP lines is the pressure drop across the thrombus. Recanalization is followed by imaging, Doppler or CT, not by the HVPG; after anticoagulation stops, Baveno VIII 9.21 sets imaging at 1 month and then every 3 months.',
      ask: ['How is recanalization checked?', 'By repeat imaging, Doppler or CT, not by the HVPG, which is unchanged.'],
    },
    {
      // (The relation chart before the summary: a healthy liver as a clot fills more of the portal vein, the PPG and the HVPG on one
      // scale. The ring is the acute clot of the first slide, the vein closed.)
      id: 'relation', preset: 'pvt-acute', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], clot: true },
      tool: { kind: 'curve', x: 'clot', xFrom: 0, xTo: 100, xCuts: [50], patient: { preset: 'healthy' }, param: 'thrombus.PV_TRUNK', from: 0, to: 1, step: 0.05, lines: ['ppg', 'hvpg'], oneScale: true },
      kicker: 'Summary', site: 'pre', title: 'PVT raises the PPG, never the HVPG',
      line: 'Once thrombus fills more than half the lumen, the PPG climbs steeply, to {ppg} at complete occlusion. The HVPG stays near {hvpg} throughout.',
      notes: 'Each point is a normal liver with thrombus filling more of the portal vein lumen, the PPG and the HVPG on the same scale. Below half the lumen the gradient barely changes; above it the stenosis accounts for most of the pressure drop, and complete occlusion raises the PPG about sixfold. The HVPG is unchanged because the WHVP reflects sinusoidal pressure, downstream of the thrombus. Baveno VIII considers anticoagulation for recent partial (<50% remnant lumen) or complete thrombosis of the main portal vein (9.19). The model has no collaterals yet at this point, as in recent PVT. (Baveno VIII 9.19; AASLD 2024 Table 1 puts portal vein thrombosis at the prehepatic level.)',
      ask: ['A patient with PVT has an HVPG of 3 mmHg. Does that rule out portal hypertension?', 'No. The thrombus is prehepatic, so the WHVP does not reflect the portal pressure upstream of it.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'ppg', 'plt', 'wave'], wave: 'PV_TRUNK', asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'clot', kicker: 'No cirrhosis', title: 'Acute thrombosis' }, { id: 'cavernoma', kicker: 'No cirrhosis', title: 'Cavernoma' },
        { id: 'base', kicker: 'Cirrhosis', title: 'Before PVT' }, { id: 'gradients', kicker: 'Cirrhosis', title: 'Partial PVT' }, { id: 'pvt-anticoag', kicker: 'Cirrhosis', title: 'At 6 months' }],
      kicker: 'Summary', title: 'PVT raises the PPG, not the HVPG',
      line: 'The resistance is prehepatic, so the HVPG barely changes; the PPG rises because the portal vein itself carries the resistance.',
      notes: 'Prehepatic thrombosis raises the pressure upstream and spares the sinusoids: the HVPG does not detect it, and without cirrhosis LSM and hepatic synthetic function are normal. In cirrhosis PVT adds to the sinusoidal resistance without changing the WHVP. Look for PVT on every surveillance ultrasound, treat the thrombus with early anticoagulation, and manage the varices as in cirrhosis.',
      ask: ['PVT with a normal liver: which measurement stays normal?', 'The HVPG, because the sinusoids are downstream of the thrombus. In cirrhosis PVT adds to the PPG, not the HVPG.'],
    },
  ],
};
