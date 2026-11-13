// Presenter talk: one drug followed through every stage of cirrhosis (the slide fields are described at the top of decks.js). A woman with MASH
// cirrhosis has no CSPH and no carvedilol; two years on the stiffness rules CSPH in and carvedilol starts; she needs no screening scope on it;
// with ascites and large varices it stays; a bleed takes the pressure under its lines (systolic 90, mean 65 mmHg) and it is held, then restarted; banding joins it after the bleed;
// a rebleed brings a TIPS; and in another patient the cause is gone, the HVPG off carvedilol is under 10 mmHg and it may stop.
// The model has a blood pressure (systolic/diastolic and its mean) but no HRS-AKI, so that fact of the hold rule is typed into the chart
// (tool.patient), as the Kidney talk does. The beta-blocker response control (a stronger or weaker responder) joins this talk when that feature is built.
//
// Sources, checked 11 Nov 2026 against the guideline files in guidelines/:
// - Baveno VIII (J Hepatol 2026) 3.15 (NSBBs, particularly carvedilol, at CSPH to prevent decompensation and improve survival; LoE 2, strong),
//   3.16 (not without CSPH), 3.18 (no screening endoscopy on an NSBB), 3.19 and 1.19 (the NSBB-ineligible: endoscopy unless LSM <20 kPa with
//   PLT ≥150 or SSM <40 kPa), 4.4 (carvedilol with ascites and varices, preferred over the other NSBBs), 4.6 and 4.7 (reduce or stop for a
//   systolic <90 or MAP <65 mmHg and/or HRS-AKI; restart once both have recovered), 4.8 (carvedilol with banding after a first bleed, even if
//   carvedilol was the primary prophylaxis), 4.10 (a second decompensating event: TIPS and LT may be considered), 4.13 (TIPS when carvedilol
//   with banding fails), 7.16, 7.18, 7.19 (stopping after recompensation only if CSPH resolution is confirmed), Table 3 (the HVPG response).
// - AASLD 2024: carvedilol 6.25 to 12.5 mg a day; a systolic pressure under 90 mmHg may take away the survival benefit of an NSBB; NSBBs are
//   not required after a TIPS that brings the portosystemic gradient under 12 mmHg (stated for secondary prophylaxis of gastric variceal bleeding).
// Neither file gives the trial numbers, so no trial figure is quoted.

const BAND = { kind: 'band' };
const UNIT = { kind: 'infuse', fluid: 'prbc' };
const CARV = { drugs: { carvedilol: true } };
const SCOPE = { edges: ['C1a', 'C1b'], label: 'Banded varices', kind: 'treat' };

export const CARVEDILOL = {
  id: 'carvedilol', level: 'advanced', title: 'Carvedilol, from the first visit to the transplant list', minutes: 12,
  sections: [['Compensated', ['First visit', 'Starting']], ['Ascites and hypotension', ['Ascites and varices', 'Hypotension']], ['A bleed and a TIPS', ['After a bleed', 'After a TIPS']], ['Stopping', ['Stopping']]],
  objectives: [
    'State when carvedilol starts, and why not before CSPH',
    'State who needs no screening endoscopy while taking carvedilol',
    'Reduce or stop carvedilol for a systolic blood pressure <90 mmHg, a MAP <65 mmHg or HRS-AKI, and restart it',
    'State when carvedilol may stop after recompensation',
  ],
  checks: [
    ['Cirrhosis, liver stiffness measurement (LSM) 12 kPa, platelets 160,000/µL. Does she start carvedilol?', 'No. CSPH is ruled out, and Baveno VIII advises against a nonselective beta-blocker (NSBB) to prevent decompensation without CSPH. LSM is repeated in 12 months.'],
    ['A man with CSPH takes carvedilol. Does he need a screening endoscopy?', 'No. Endoscopy would not change his management (Baveno VIII 3.18). Only a patient who cannot take an NSBB needs endoscopy, unless LSM <20 kPa with platelets ≥150,000/µL, or spleen stiffness (SSM) <40 kPa.'],
    ['After a bleed her MAP is 62 mmHg and she takes carvedilol. What now, and when does it restart?', 'Reduce the dose or stop it. Restart and re-titrate once the blood pressure has recovered and any HRS-AKI has resolved (Baveno VIII 4.6, 4.7).'],
    ['After recompensation the HVPG, measured off carvedilol, is 8 mmHg. May the drug stop, and what if the varices are still there?', 'Yes: an HVPG <10 mmHg off carvedilol confirms that CSPH has resolved. Varices that remain do not argue against stopping (7.16 to 7.18).'],
  ],
  summary: 'Carvedilol through every stage: why not before CSPH, when it starts, who can forgo screening endoscopy, when it is reduced or held and restarted, EVL after a bleed, a TIPS, and the HVPG that lets it stop.',
  slides: [
    {
      id: 'first', preset: 'cirr-comp', cam: 'liver', tool: { kind: 'path', of: 'first-visit', short: 'First-visit path' }, data: 'tiles', tiles: ['lsm', 'plt'], key: ['lsm'],
      vignette: 'A 54-year-old woman with MASH cirrhosis, a BMI of 27 and type 2 diabetes. She feels well. Her platelets are 160,000/µL.',
      kicker: 'First visit', site: 'sin', title: 'At an LSM of 12 kPa there is no CSPH to treat',
      line: 'Her liver stiffness (LSM) is {lsm} and her platelet count {plt}, ruling out CSPH. Carvedilol does not prevent decompensation without CSPH, so LSM is repeated in a year.',
      notes: 'Source: Baveno VIII 1.15, 3.16. An LSM ≤15 kPa with platelets ≥150,000/µL rules out CSPH, and patients with compensated cirrhosis without CSPH should not take a nonselective beta-blocker (NSBB) to prevent decompensation. She has cirrhosis, so the cause is treated: weight loss, glycemic control and ultrasound every 6 months for HCC surveillance. The chart shows the first visit as Baveno VIII draws it, lit for her own LSM and platelet count.',
      ask: ['A woman with compensated cirrhosis has an LSM of 12 kPa and platelets of 160,000/µL. Does she need carvedilol?', 'No. CSPH is ruled out, and an NSBB does not prevent decompensation without CSPH. Repeat LSM in 12 months.'],
    },
    {
      id: 'rise', days: 730, ramp: { cirrhosis: [0.4, 0.66] }, lapse: { seconds: 8, from: 'First visit', to: 'Two years on' }, cam: 'liver', tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'lsm'], keepTiles: true, title: 'HVPG and LSM over two years' }, data: 'tiles', tiles: ['lsm', 'plt'], key: ['lsm'], graph: ['hvpg', 'lsm'], delta: 'first',
      kicker: 'First visit', site: 'sin', title: 'Two years later, LSM rules in CSPH',
      line: 'Her LSM is now {lsm}, which meets {>=25 kPa}, with platelets of {plt}. CSPH is ruled in without HVPG measurement, and carvedilol starts. The next slide shows the algorithm.',
      notes: 'Source: Baveno VIII 1.16. In non-obese MASLD, as here (BMI <30), an LSM ≥25 kPa rules in CSPH. With obesity the rule does not apply, and a model that includes BMI decides. Over two years the model\'s HVPG has risen above 12 mmHg. LSM and platelet count are inexpensive and repeatable, which is why they are used to follow patients between HVPG measurements.',
      ask: ['Her LSM was 12 kPa two years ago and is now 26 kPa. What changed?', 'CSPH is now ruled in (LSM ≥25 kPa in non-obese MASLD), so carvedilol starts.'],
    },
    {
      id: 'rise-path', cam: 'liver', tool: { kind: 'path', of: 'first-visit', short: 'First-visit path' }, data: 'tiles', tiles: ['lsm', 'plt'], key: ['lsm'], delta: 'first',
      kicker: 'First visit', site: 'sin', title: 'On the first-visit path, this LSM leads to carvedilol',
      line: 'On the first-visit path, an LSM of {lsm} rules in CSPH and leads to carvedilol.',
      notes: 'Source: Baveno VIII 1.16. The same woman as on the previous slide, two years later. The first-visit path starts from her LSM and platelet count: in non-obese MASLD an LSM ≥25 kPa rules in CSPH without HVPG measurement, and carvedilol starts.',
      ask: ['Where does an LSM of 26 kPa lead on the first-visit path?', 'CSPH is ruled in (LSM ≥25 kPa in non-obese MASLD), so carvedilol starts.'],
    },
    {
      id: 'start', params: CARV, cath: 'result', cam: 'liver', tool: { kind: 'hvpg', catheter: true }, data: 'tiles', tiles: ['map'], key: ['hvpgFall'], delta: 'rise', hvpgResp: 'rise', response: true,
      kicker: 'Starting', site: 'sin', title: 'Carvedilol starts at CSPH, before decompensation',
      line: 'Carvedilol lowers her HVPG from {hvpg@rise} to {hvpg}. Baveno VIII recommends it at CSPH to prevent decompensation and to improve survival.',
      notes: 'Source: Baveno VIII 3.15, Table 3; AASLD 2024. Carvedilol is the preferred NSBB. AASLD 2024 gives 6.25 to 12.5 mg/day, started low and increased if blood pressure allows. It reduces portal inflow and lowers intrahepatic resistance, so it lowers the HVPG more than propranolol. Here the HVPG is measured to show the fall; in practice carvedilol starts on the LSM result without HVPG measurement. Baveno VIII Table 3 counts a fall of ≥10% as a response before any bleed. The three buttons set the strength of her HVPG response: with a non-responder the HVPG falls about 7%, with a usual responder about 19% and with a strong responder about 27% (model values on a decompensated patient).',
      ask: ['When does Baveno VIII start carvedilol in compensated cirrhosis?', 'When CSPH is present, to prevent decompensation and improve survival.'],
    },
    {
      id: 'scope', cam: 'liver', labels: ['VAR'], tool: { kind: 'criteria', title: 'Screening endoscopy', short: 'Screening EGD', lead: 'It depends on NSBB use.', rule: 'Baveno VIII 3.18, 3.19',
        rows: [{ text: '**On carvedilol**: no screening endoscopy', lit: true }, '**Cannot take an NSBB**: endoscopy for varices', '**No NSBB, LSM <20 kPa** with PLT ≥150,000/µL: no endoscopy', '**No NSBB, SSM <40 kPa**: no endoscopy'],
        verdict: 'She takes carvedilol: no endoscopy now.' },
      data: 'tiles', tiles: ['hvpg', 'varix'], key: ['varix'],
      kicker: 'Starting', site: 'sin', title: 'On carvedilol she needs no screening endoscopy',
      line: 'Endoscopy would not change her treatment, because she already takes an NSBB. Only a patient who cannot take one needs endoscopy, unless LSM with platelets, or spleen stiffness, spares it.',
      notes: 'Source: Baveno VIII 3.18, 3.19, 1.19. Patients with compensated cirrhosis who take an NSBB do not need a screening endoscopy, because the result would not change management (3.18). A patient who cannot take one, from a contraindication or intolerance, has an endoscopy if CSPH cannot be ruled out, and large varices are banded (3.19). That patient can avoid endoscopy if LSM is <20 kPa with platelets ≥150,000/µL, or spleen stiffness (SSM) is <40 kPa (1.19).',
      ask: ['A patient with CSPH cannot take an NSBB. His LSM is 18 kPa and his platelet count 170,000/µL. Does he need a screening endoscopy?', 'No. LSM <20 kPa with platelets ≥150,000/µL makes screening endoscopy unnecessary (Baveno VIII 1.19).'],
    },
    {
      id: 'ascites', days: 1460, ramp: { cirrhosis: [0.66, 0.85], albumin: [4, 2.8] }, lapse: { seconds: 10, from: 'Two years on', to: 'Six years on' }, cam: 'fit', tool: { kind: 'flowtime', clock: 'days', lines: ['asc', 'varix'], keepTiles: true, title: 'Ascites and varix over four years' }, data: 'tiles', tiles: ['asc', 'varix'], key: ['varix'], delta: 'start',
      kicker: 'Ascites and varices', site: 'sin', title: 'With ascites and large varices, carvedilol continues',
      line: 'Four years later she has {asc} of ascites and varices of {varix}. Baveno VIII keeps carvedilol to prevent a first bleed and lower the risk of ascites-related complications.',
      notes: 'Source: Baveno VIII 4.4; AASLD 2024. In patients with ascites and varices carvedilol is recommended to prevent a first bleed and to lower the risk of ascites-related complications, and it is preferred over the other nonselective beta-blockers. AASLD 2024 adds that these drugs are safe and probably beneficial in ascites, but a systolic blood pressure <90 mmHg may abolish the survival benefit, so blood pressure is checked at every visit. Ascites is her first decompensation, and from here she should also be considered for liver transplantation (Baveno VIII 4.3).',
      ask: ['Does ascites mean stopping carvedilol?', 'No. With ascites and varices it is still recommended, and the dose is reduced only for hypotension or HRS-AKI.'],
    },
    {
      id: 'mapbleed', action: { kind: 'hemorrhage', mL: 1300 }, cam: 'fit', data: 'tiles', tiles: ['map', 'rpp'], key: ['map'], delta: 'ascites',
      tool: { kind: 'vitals', show: ['map', 'hr'], hold: true },
      kicker: 'Hypotension', site: 'sin', title: 'A large bleed drops the blood pressure below the hold thresholds',
      line: 'After 1.3 L of blood loss her blood pressure is {map} and her heart rate rises. The rail marks Baveno VIII 4.6\'s two thresholds: systolic {<90 mmHg}, MAP {<65 mmHg}.',
      notes: 'Source: Baveno VIII 4.6. The rail shows her blood pressure as a bar from diastolic to systolic with a dot at the MAP, against both thresholds: a systolic of 90 and a MAP of 65 mmHg. Either one is enough. Hemorrhage narrows the pulse pressure as stroke volume falls. HRS-AKI comes on the next slide. Carvedilol is still on in the model here. Infection and overdiuresis can cause the same hypotension.',
      ask: ['What blood pressure thresholds call for holding carvedilol?', 'A systolic blood pressure <90 mmHg or a MAP <65 mmHg (Baveno VIII 4.6).'],
    },
    {
      // (No action of its own: the bleed is the last slide's. A second 1.3 L here took her mean to 15 mmHg, and the next slide's four units gave back only one.)
      id: 'low', cam: 'fit', data: 'tiles', tiles: ['map', 'rpp'], key: ['map'], delta: 'ascites',
      tool: { kind: 'path', of: 'holdcarv', short: 'Carvedilol path', patient: { held: false, hrs: false } },
      kicker: 'Hypotension', site: 'sin', title: 'Hypotension holds carvedilol for now',
      line: 'A large bleed lowers her blood pressure to {map}. Systolic {<90 mmHg}, MAP {<65 mmHg} or HRS-AKI means carvedilol is reduced or stopped.',
      notes: 'Source: Baveno VIII 4.6; AASLD 2024. Carvedilol is dose-reduced or stopped for persistent hypotension (systolic blood pressure <90 mmHg or MAP <65 mmHg) and/or HRS-AKI. Any one of the three is enough. Hemorrhage is one cause; infection and overdiuresis are others. The chart reads her blood pressure from the model; the model does not simulate HRS-AKI, so the chart takes its absence as a fact of the case. Carvedilol is still on in the model on this slide, which is the state that triggers the rule.',
      ask: ['She bleeds and her blood pressure falls to 78/56 (62) mmHg while she takes carvedilol. What do you do with the drug?', 'Reduce the dose or stop it. The systolic is <90 mmHg and the MAP is <65 mmHg.'],
    },
    {
      id: 'restart', action: [UNIT, UNIT, UNIT, UNIT], cam: 'fit', data: 'tiles', tiles: ['map', 'rpp'], key: ['map'], delta: 'ascites',
      tool: { kind: 'path', of: 'holdcarv', short: 'Carvedilol path', patient: { held: true, hrs: false } },
      kicker: 'Hypotension', site: 'sin', title: 'Carvedilol restarts once the blood pressure has recovered',
      line: 'After transfusion her blood pressure is back to {map} and her renal perfusion pressure (RPP) to {rpp}. She has no HRS-AKI, so the algorithm says restart and re-titrate.',
      notes: 'Source: Baveno VIII 4.7. Carvedilol is restarted and re-titrated once the HRS-AKI has resolved and/or the blood pressure has recovered. A patient whose drug is held and who still has hypotension or HRS-AKI stays off it. The four units of packed red cells replace the 1.3 L lost on the previous slide, and the tiles compare with the prebleed state. The model keeps carvedilol on throughout, so these numbers show the pressure on the drug; the chart takes the held drug as the case\'s own facts.',
      ask: ['She had HRS-AKI and carvedilol was stopped. The AKI has resolved and her blood pressure has recovered. What next?', 'Restart carvedilol and re-titrate to the dose she tolerates (Baveno VIII 4.7).'],
    },
    {
      id: 'evl', action: [BAND, BAND, BAND], cam: 'varices', labels: ['VAR'], mark: SCOPE, data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'], delta: 'restart',
      tool: { kind: 'path', of: 'secprop', short: 'Next-bleed path', patient: { more: true, can: 'both' } },
      kicker: 'After a bleed', site: 'sin', title: 'After a bleed, carvedilol and EVL go together',
      line: 'The bleeding source was esophageal varices. Baveno VIII makes carvedilol with endoscopic variceal ligation (EVL) first-line, even if she took carvedilol before. Three sessions shrink the varices to {varix}.',
      notes: 'Source: Baveno VIII 4.8, 4.10; AASLD 2024. After a first variceal bleed, first-line prevention of rebleeding is an NSBB with EVL, carvedilol preferred, whether or not the patient took one before (4.8, strong). Her ascites is a second decompensating event, so the chart also lights that TIPS and liver transplant may be considered (4.10, weak). EVL obliterates the varix and carvedilol lowers the portal pressure that refills it. A patient who cannot receive one of the two continues the other (4.9).',
      ask: ['A woman on carvedilol bleeds from esophageal varices. Do you stop the carvedilol?', 'No. Carvedilol with EVL is first-line after a bleed, whether or not she took carvedilol before (Baveno VIII 4.8).'],
    },
    {
      id: 'tips', params: { tips: { on: true }, drugs: { carvedilol: false } }, cam: 'liver', mark: { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' }, data: 'tiles', tiles: ['ppg', 'hr'], key: ['ppg'], delta: 'restart',
      kicker: 'After a TIPS', site: 'sin', title: 'After a TIPS that brings the PPG to <12 mmHg, a beta-blocker is not required',
      line: 'After rebleeding despite carvedilol and EVL, she undergoes TIPS. Her PPG falls to {ppg}, which meets {<12 mmHg}: AASLD 2024 then does not require a beta-blocker.',
      notes: 'Source: Baveno VIII 4.13; AASLD 2024. A TIPS is considered when bleeding recurs despite carvedilol with EVL (4.13). AASLD 2024 states that nonselective beta-blockers are not required after a TIPS if the portosystemic gradient is reduced to under 12 mmHg, in its discussion of secondary prophylaxis of gastric variceal bleeding; the model applies it to her esophageal bleed. Baveno VIII has no separate statement on carvedilol after a TIPS. Carvedilol is off in the model here. The PPG is the portal pressure minus the IVC pressure. A TIPS also diverts portal flow from the liver, so she is monitored for hepatic encephalopathy.',
      ask: ['After a TIPS her portosystemic gradient is 9 mmHg. Does she still need carvedilol for variceal bleeding?', 'Not by AASLD 2024: a beta-blocker is not required once the gradient is <12 mmHg.'],
    },
    {
      id: 'cure', preset: 'cirr-decomp', params: CARV, days: 730, ramp: { cirrhosis: [0.85, 0.45], albumin: [2.8, 3.9] }, lapse: { seconds: 9, from: 'Still drinking', to: 'Two years abstinent' }, cam: 'fit', tool: { kind: 'flowtime', clock: 'days', lines: ['hvpg', 'asc'], keepTiles: true, title: 'HVPG and ascites over two years' }, data: 'tiles', tiles: ['hvpg', 'asc'], key: ['hvpg'],
      vignette: 'A 49-year-old man with alcohol-associated cirrhosis, ascites and varices, on carvedilol. He stopped drinking two years ago. His ascites has resolved off diuretics, and his albumin is 3.9 g/dL.',
      kicker: 'Stopping', site: 'sin', title: 'On carvedilol the HVPG understates the portal pressure',
      line: 'In another man, abstinent for two years, the HVPG is {hvpg} on carvedilol. Baveno VIII asks for the HVPG off the drug, so this reading cannot confirm resolution.',
      notes: 'Source: Baveno VIII 7.4, 7.16. He meets the recompensation criteria: the cause is removed, the ascites has resolved off diuretics, and his liver function is back to Child–Pugh A. CSPH resolution is confirmed by an HVPG <10 mmHg measured off carvedilol or another NSBB (7.16), because the drug itself lowers the HVPG. The model shows the HVPG on carvedilol here; the next slide stops the drug for a month.',
      ask: ['Why must the HVPG be measured off carvedilol to confirm that CSPH has resolved?', 'Carvedilol lowers the HVPG itself, so a reading on the drug could hide CSPH that is still there (Baveno VIII 7.16).'],
    },
    {
      id: 'stop', params: { drugs: { carvedilol: false } }, days: 30, cam: 'fit', data: 'tiles', tiles: ['hvpg', 'lsm'], key: ['hvpg'], delta: 'cure',
      tool: { kind: 'path', of: 'stopcarv', short: 'Stopping carvedilol', patient: { hv: 'low' } },
      kicker: 'Stopping', site: 'sin', title: 'CSPH has resolved, so carvedilol may stop',
      line: 'A month off carvedilol his HVPG is {hvpg}, which does not meet {>=10 mmHg}. CSPH has resolved, so the drug may stop. Varices that remain do not argue against it.',
      notes: 'Source: Baveno VIII 7.16 to 7.19. Carvedilol may be stopped in a recompensated patient only if resolution of CSPH can be confirmed (7.18, a weak recommendation): an HVPG <10 mmHg measured off carvedilol (7.16). Without HVPG measurement, an LSM <10 kPa, or <15 kPa with an SSM <25 kPa, may rule out CSPH (7.19). Varices and collaterals can persist after CSPH resolves and do not confirm or exclude it (7.17). Where no test shows resolution, the drug continues. HCC surveillance continues (7.14).',
      ask: ['His HVPG, off carvedilol, is 8 mmHg, but large varices remain. May carvedilol stop?', 'Yes. The HVPG confirms that CSPH has resolved, and varices that remain do not argue against stopping (Baveno VIII 7.16 to 7.18).'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'map', 'varix'], asc: false, rowHead: 'Stage',
      of: [{ id: 'first', kicker: 'First visit', title: 'No CSPH', ref: true }, { id: 'rise', kicker: 'First visit', title: 'CSPH ruled in' }, { id: 'start', kicker: 'Starting', title: 'Carvedilol started' }, { id: 'ascites', kicker: 'Decompensated', title: 'Ascites and varices' }, { id: 'low', kicker: 'Hypotension', title: 'Bleed, MAP <65' },
        { id: 'restart', kicker: 'Hypotension', title: 'BP recovered' }, { id: 'evl', kicker: 'After a bleed', title: 'Carvedilol with EVL' }, { id: 'tips', kicker: 'After a TIPS', title: 'TIPS, no carvedilol' }, { id: 'stop', kicker: 'Stopping', title: 'Off carvedilol, abstinent' }],
      kicker: 'Summary', title: 'One drug, from CSPH to recompensation',
      line: 'Carvedilol starts at CSPH and continues through ascites and varices. A MAP <65 mmHg or HRS-AKI holds it, and only confirmed resolution of CSPH stops it.',
      notes: 'Carvedilol begins when CSPH is demonstrated and not before. It replaces screening endoscopy, continues through ascites and varices, is combined with EVL after a bleed, and is held, then restarted, for hypotension or HRS-AKI. A TIPS that brings the PPG to <12 mmHg can replace it. After recompensation it stops only when an HVPG <10 mmHg off the drug, or a low LSM, shows that CSPH has resolved.',
      ask: ['Which three findings hold carvedilol in decompensated cirrhosis?', 'A systolic pressure <90 mmHg, a MAP <65 mmHg, or HRS-AKI. Any one is enough.'],
    },
  ],
};
