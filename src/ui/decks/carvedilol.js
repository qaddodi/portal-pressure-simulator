// Presenter talk: one drug followed through every stage of cirrhosis (the slide fields are described at the top of decks.js). A woman with MASH
// cirrhosis has no CSPH and no carvedilol; two years on the stiffness rules CSPH in and carvedilol starts; she needs no screening scope on it;
// with ascites and large varices it stays; a bleed takes the MAP under 65 mmHg and it is held, then restarted; banding joins it after the bleed;
// a rebleed brings a TIPS; and in another patient the cause is gone, the HVPG off carvedilol is under 10 mmHg and it may stop.
// The model has a MAP and no systolic pressure and no HRS-AKI, so those two facts of the hold rule are typed into the chart (tool.patient), as
// the Kidney talk does. The beta-blocker response control (a stronger or weaker responder) joins this talk when that feature is built.
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
const BELLY = { kind: 'abdomen' };
const CARV = { drugs: { carvedilol: true } };
const SCOPE = { edges: ['C1a', 'C1b'], label: 'Banded varices', kind: 'treat' };

export const CARVEDILOL = {
  id: 'carvedilol', level: 'advanced', title: 'Carvedilol, from the first visit to the transplant list', minutes: 12,
  sections: [['Compensated', ['First visit', 'Starting']], ['Ascites and low pressure', ['Ascites and varices', 'Low pressure']], ['A bleed and a TIPS', ['After a bleed', 'After a TIPS']], ['Stopping', ['Stopping']]],
  objectives: [
    'Say when carvedilol starts, and why not before CSPH',
    'Say who needs no screening endoscopy while on it',
    'Cut it back for a MAP <65 mmHg or HRS-AKI, and restart it',
    'Say when it may stop after recompensation',
  ],
  checks: [
    ['Cirrhosis, stiffness 12 kPa, platelets 160,000/µL. Does she start carvedilol?', 'No. CSPH is ruled out, and Baveno VIII advises against a beta-blocker to prevent decompensation without CSPH. The stiffness is repeated in 12 months.'],
    ['A man with CSPH takes carvedilol. Does he need a screening endoscopy?', 'No. The scope would not change his management (Baveno VIII 3.18). Only a patient who cannot take one is scoped, unless LSM <20 kPa with platelets ≥150,000/µL, or SSM <40 kPa.'],
    ['After a bleed her MAP is 62 mmHg and she takes carvedilol. What now, and when does it restart?', 'Reduce the dose or stop it. Restart and re-titrate once the blood pressure has recovered and any HRS-AKI has resolved (Baveno VIII 4.6, 4.7).'],
    ['After recompensation the HVPG, measured off carvedilol, is 8 mmHg. May the drug stop, and what if the varices are still there?', 'Yes: an HVPG <10 mmHg off carvedilol confirms that CSPH has resolved. Varices that remain do not argue against stopping (7.16 to 7.18).'],
  ],
  summary: 'Carvedilol through every stage: why not before CSPH, when it starts, who skips the scope, how it is cut back and restarted, banding after a bleed, a TIPS, and the HVPG that lets it stop.',
  slides: [
    {
      id: 'first', preset: 'cirr-comp', cam: 'liver', tool: { kind: 'path', of: 'first-visit', short: 'First-visit path' }, data: 'tiles', tiles: ['lsm', 'plt'], key: ['lsm'],
      vignette: 'A 54-year-old woman with MASH cirrhosis, a BMI of 27 and type 2 diabetes. She feels well. Her platelets are 160,000/µL.',
      kicker: 'First visit', site: 'sin', title: 'At a stiffness of 12 kPa there is no CSPH to treat',
      line: 'Her stiffness is {lsm} and her platelets {plt}, which rules CSPH out. Carvedilol is not used to prevent decompensation without CSPH, so the stiffness is repeated in a year.',
      notes: 'Source: Baveno VIII 1.15, 3.16. A stiffness of 15 kPa or less with platelets of 150,000/µL or more rules CSPH out, and patients with compensated cirrhosis without CSPH should not take a beta-blocker to prevent decompensation. She has cirrhosis, so the cause is treated: weight loss, diabetes control and 6-monthly ultrasound for liver cancer. The chart shows the first visit as Baveno VIII draws it, lit for her own stiffness and platelets.',
      ask: ['A woman with compensated cirrhosis has a stiffness of 12 kPa and platelets of 160,000/µL. Does she need carvedilol?', 'No. CSPH is ruled out, so a beta-blocker has nothing to prevent. Repeat the stiffness in 12 months.'],
    },
    {
      id: 'rise', days: 730, ramp: { cirrhosis: [0.4, 0.66] }, lapse: { seconds: 8, from: 'First visit', to: 'Two years on' }, cam: 'liver', tool: { kind: 'path', of: 'first-visit', short: 'First-visit path' }, data: 'tiles', tiles: ['lsm', 'plt'], key: ['lsm'], graph: ['hvpg', 'lsm'], delta: 'first',
      kicker: 'First visit', site: 'sin', title: 'Two years on, the stiffness rules CSPH in',
      line: 'Her stiffness is now {lsm}, which meets {>=25 kPa}, with platelets of {plt}. CSPH is ruled in without a catheter, and the chart says to start carvedilol.',
      notes: 'Source: Baveno VIII 1.16. In non-obese MASLD, as here (BMI under 30), a stiffness of 25 kPa or more rules CSPH in. With obesity the rule does not apply and a model that includes the BMI decides. Over two years the model\'s HVPG has passed 12 mmHg. Stiffness and platelets are cheap and repeatable, which is why they are used to follow patients between catheter studies.',
      ask: ['Her stiffness was 12 kPa two years ago and is now 26 kPa. What changed?', 'CSPH is now ruled in (LSM ≥25 kPa in non-obese MASLD), so carvedilol starts.'],
    },
    {
      id: 'start', params: CARV, cath: 'result', cam: 'liver', tool: { kind: 'hvpg', catheter: true }, data: 'tiles', tiles: ['map'], key: ['hvpgFall'], delta: 'rise', hvpgResp: 'rise',
      kicker: 'Starting', site: 'sin', title: 'Carvedilol starts at CSPH, before anything has gone wrong',
      line: 'Carvedilol lowers her HVPG from {hvpg@rise} to {hvpg}. Baveno VIII recommends it at CSPH to prevent decompensation and to improve survival.',
      notes: 'Source: Baveno VIII 3.15, Table 3; AASLD 2024. Carvedilol is the preferred non-selective beta-blocker. AASLD 2024 gives 6.25 to 12.5 mg a day, started low and raised if the pressure allows. It lowers the portal inflow and relaxes the resistance inside the liver, so it lowers the HVPG more than propranolol. Here the HVPG is measured to show the fall; in practice carvedilol starts on the stiffness result without a catheter. Baveno VIII Table 3 counts a fall of 10% or more as a response before any bleed.',
      ask: ['When does Baveno VIII start carvedilol in compensated cirrhosis?', 'When CSPH is present, to prevent decompensation and improve survival.'],
    },
    {
      id: 'scope', cam: 'liver', labels: ['VAR'], tool: { kind: 'criteria', title: 'Screening endoscopy', short: 'Screening EGD', lead: 'It depends on the beta-blocker.', rule: 'Baveno VIII 3.18, 3.19',
        rows: [{ text: '**On carvedilol**: no screening endoscopy', lit: true }, '**Cannot take one**: endoscopy for varices', '**Cannot take one, LSM <20 kPa** with PLT ≥150,000/µL: no endoscopy', '**Cannot take one, SSM <40 kPa**: no endoscopy'],
        verdict: 'She takes carvedilol: no scope now.' },
      data: 'tiles', tiles: ['hvpg', 'varix'], key: ['varix'],
      kicker: 'Starting', site: 'sin', title: 'On carvedilol she needs no screening endoscopy',
      line: 'A scope would not change her treatment, because she already takes a beta-blocker. Only a patient who cannot take one is scoped, unless stiffness or platelets spare the scope.',
      notes: 'Source: Baveno VIII 3.18, 3.19, 1.19. Patients with compensated cirrhosis who take a non-selective beta-blocker do not need a screening endoscopy, because the result would not change management (3.18). A patient who cannot take one, from a contraindication or intolerance, has an endoscopy if CSPH cannot be ruled out, and large varices are banded (3.19). That patient can skip the scope if the stiffness is under 20 kPa with platelets of 150,000/µL or more, or the spleen stiffness is under 40 kPa (1.19).',
      ask: ['A patient with CSPH cannot take a beta-blocker. His stiffness is 18 kPa and his platelets are 170,000/µL. Does he need a screening endoscopy?', 'No. Stiffness <20 kPa with platelets ≥150,000/µL spares the scope (Baveno VIII 1.19).'],
    },
    {
      id: 'ascites', days: 1460, ramp: { cirrhosis: [0.66, 0.85], albumin: [4, 2.8] }, lapse: { seconds: 10, from: 'Two years on', to: 'Six years on' }, cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['asc', 'varix'], key: ['varix'], delta: 'start',
      kicker: 'Ascites and varices', site: 'sin', title: 'With ascites and large varices, carvedilol stays',
      line: 'Four years on she has {asc} of ascites and varices of {varix}. Baveno VIII keeps carvedilol to prevent a first bleed and to lower the risk of ascites complications.',
      notes: 'Source: Baveno VIII 4.4; AASLD 2024. In patients with ascites and varices carvedilol is recommended to prevent a first bleed and to lower the risk of ascites-related complications, and it is preferred over the other non-selective beta-blockers. AASLD 2024 adds that these drugs are safe and probably helpful in ascites, but a systolic pressure under 90 mmHg may take away the survival benefit, so the pressure is watched at every visit. Ascites is her first decompensation, and from here she should also be considered for a transplant (Baveno VIII 4.3).',
      ask: ['Does ascites stop carvedilol?', 'No. With ascites and varices it is still recommended, and the dose is cut back only for a low blood pressure or HRS-AKI.'],
    },
    {
      id: 'low', action: { kind: 'hemorrhage', mL: 1300 }, cam: 'fit', data: 'tiles', tiles: ['map', 'rpp'], key: ['map'], delta: 'ascites',
      tool: { kind: 'path', of: 'holdcarv', short: 'Carvedilol path', patient: { held: false, sbp: 84, hrs: false, map: 61 } },
      kicker: 'Low pressure', site: 'sin', title: 'A MAP <65 mmHg stops carvedilol for now',
      line: 'A large bleed takes her MAP to {map}. A MAP {<65 mmHg}, a systolic pressure {<90 mmHg} or HRS-AKI means carvedilol is cut back or stopped.',
      notes: 'Source: Baveno VIII 4.6; AASLD 2024. Carvedilol is dose-reduced or stopped when the blood pressure stays low (systolic under 90 mmHg or mean under 65 mmHg) and/or there is HRS-AKI. Any one of the three is enough. A bleed is one way to get there; infection and over-diuresis are others. The model has a MAP and a kidney pressure but no systolic pressure and no HRS-AKI, so the chart takes a systolic pressure of 84 mmHg and no HRS-AKI as the facts of the case, with the MAP from the figure. Carvedilol is still on in the model on this slide, which is the state that triggers the rule.',
      ask: ['She bleeds and her MAP falls to 61 mmHg while she takes carvedilol. What do you do with the drug?', 'Reduce the dose or stop it. The MAP is <65 mmHg.'],
    },
    {
      id: 'restart', action: [UNIT, UNIT, UNIT, UNIT], cam: 'fit', data: 'tiles', tiles: ['map', 'rpp'], key: ['map'], delta: 'ascites',
      tool: { kind: 'path', of: 'holdcarv', short: 'Carvedilol path', patient: { held: true, sbp: 104, hrs: false, map: 78 } },
      kicker: 'Low pressure', site: 'sin', title: 'Carvedilol restarts once the pressure has recovered',
      line: 'With the blood replaced, her MAP is back to {map} and the kidney pressure to {rpp}. She has no HRS-AKI, so the chart says restart and re-titrate.',
      notes: 'Source: Baveno VIII 4.7. Carvedilol is restarted and re-titrated once the HRS-AKI has resolved and/or the blood pressure has recovered. A patient whose drug is held and who still has a low pressure or HRS-AKI stays off it. The four units of red cells give back the 1.3 L of the last slide, and the tiles compare with the state before the bleed. The model keeps carvedilol on throughout, so these numbers show the pressure on the drug; the chart takes the held drug and a systolic pressure of 104 mmHg as the case\'s own facts.',
      ask: ['She had HRS-AKI and carvedilol was stopped. The AKI has resolved and her pressure is back. What next?', 'Restart carvedilol and re-titrate to the dose she tolerates (Baveno VIII 4.7).'],
    },
    {
      id: 'evl', action: [BAND, BAND, BAND], cam: 'varices', labels: ['VAR'], mark: SCOPE, data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'], delta: 'restart',
      tool: { kind: 'path', of: 'secprop', short: 'Next-bleed path', patient: { more: true, can: 'both' } },
      kicker: 'After a bleed', site: 'sin', title: 'After a bleed, carvedilol and banding go together',
      line: 'The bleed was from her varices. Baveno VIII makes carvedilol with banding the first choice, even if she took carvedilol before. Three sessions bring the varices down to {varix}.',
      notes: 'Source: Baveno VIII 4.8, 4.10; AASLD 2024. After a first variceal bleed the first-line prevention of another is a non-selective beta-blocker with banding, carvedilol preferred, whether or not the patient took one before (4.8, strong). Her ascites is a second decompensating event, so the chart also lights that TIPS and liver transplant may be considered (4.10, weak). The bands close the varix and the drug lowers the pressure that refills it. A patient who cannot take either one keeps the one she tolerates (4.9).',
      ask: ['A woman on carvedilol bleeds from esophageal varices. Do you stop the carvedilol?', 'No. Carvedilol with banding is the first choice after a bleed, whether or not she took carvedilol before (Baveno VIII 4.8).'],
    },
    {
      id: 'tips', params: { tips: { on: true }, drugs: { carvedilol: false } }, cam: 'liver', mark: { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' }, data: 'tiles', tiles: ['ppg', 'hr'], key: ['ppg'], delta: 'restart',
      kicker: 'After a TIPS', site: 'sin', title: 'After a TIPS that brings the PPG to <12 mmHg, a beta-blocker is not required',
      line: 'After another bleed despite carvedilol and bands, she has a TIPS. Her PPG falls to {ppg}, which meets {<12 mmHg}: AASLD 2024 does not then require a beta-blocker.',
      notes: 'Source: Baveno VIII 4.13; AASLD 2024. A TIPS is considered when bleeding continues despite carvedilol with banding (4.13). AASLD 2024 states that non-selective beta-blockers are not required after a TIPS if the portosystemic gradient is reduced to under 12 mmHg, in its discussion of secondary prophylaxis of gastric variceal bleeding; the model applies it to her esophageal bleed. Baveno VIII has no separate statement on carvedilol after a TIPS. Carvedilol is off in the model here. The PPG is the gradient from the portal vein to the IVC. A TIPS also diverts portal blood from the liver, so encephalopathy is watched for.',
      ask: ['After a TIPS her portosystemic gradient is 9 mmHg. Does she still need carvedilol for variceal bleeding?', 'Not by AASLD 2024: a beta-blocker is not required once the gradient is <12 mmHg.'],
    },
    {
      id: 'cure', preset: 'cirr-decomp', params: CARV, days: 730, ramp: { cirrhosis: [0.85, 0.45], albumin: [2.8, 3.9] }, lapse: { seconds: 9, from: 'Still drinking', to: 'Two years abstinent' }, cam: 'fit', tool: BELLY, data: 'tiles', tiles: ['hvpg', 'asc'], key: ['hvpg'],
      vignette: 'A 49-year-old man with alcohol-associated cirrhosis, ascites and varices, on carvedilol. He stopped drinking two years ago. The ascites cleared off diuretics, and his albumin is 3.9 g/dL.',
      kicker: 'Stopping', site: 'sin', title: 'On carvedilol the HVPG understates the pressure',
      line: 'In another man, two years without alcohol, the HVPG is {hvpg} on carvedilol. Baveno VIII asks for the HVPG off the drug, so this reading cannot confirm resolution.',
      notes: 'Source: Baveno VIII 7.4, 7.16. He meets the recompensation criteria: the cause is removed, the ascites has gone off diuretics, and his liver function is back to Child–Pugh A. CSPH resolution is confirmed by an HVPG under 10 mmHg measured off carvedilol or another non-selective beta-blocker (7.16), because the drug itself lowers the HVPG. The model shows the HVPG on carvedilol here; the next slide takes the drug away for a month.',
      ask: ['Why must the HVPG be measured off carvedilol to confirm that CSPH has resolved?', 'Carvedilol lowers the HVPG itself, so a reading on the drug could hide CSPH that is still there (Baveno VIII 7.16).'],
    },
    {
      id: 'stop', params: { drugs: { carvedilol: false } }, days: 30, cam: 'fit', data: 'tiles', tiles: ['hvpg', 'lsm'], key: ['hvpg'], delta: 'cure',
      tool: { kind: 'path', of: 'stopcarv', short: 'Stopping carvedilol', patient: { hv: 'low' } },
      kicker: 'Stopping', site: 'sin', title: 'CSPH has resolved, so carvedilol may stop',
      line: 'A month off carvedilol his HVPG is {hvpg}, which does not meet {>=10 mmHg}. CSPH has resolved, so the drug may stop. Varices that remain do not argue against it.',
      notes: 'Source: Baveno VIII 7.16 to 7.19. Carvedilol may be stopped in a recompensated patient only if resolution of CSPH can be confirmed (7.18, a weak recommendation): an HVPG under 10 mmHg measured off carvedilol (7.16). Without a catheter, a stiffness under 10 kPa, or under 15 kPa with a spleen stiffness under 25 kPa, may rule CSPH out (7.19). Varices and collaterals can stay after CSPH resolves and prove nothing either way (7.17). Where no test shows resolution the drug stays. HCC surveillance goes on (7.14).',
      ask: ['His HVPG, off carvedilol, is 8 mmHg, but large varices remain. May carvedilol stop?', 'Yes. The HVPG confirms that CSPH has resolved, and varices that remain do not argue against stopping (Baveno VIII 7.16 to 7.18).'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'map', 'varix'], asc: false, rowHead: 'Stage',
      of: [{ id: 'first', kicker: 'First visit', title: 'No CSPH', ref: true }, { id: 'rise', kicker: 'First visit', title: 'CSPH ruled in' }, { id: 'start', kicker: 'Starting', title: 'Carvedilol started' }, { id: 'ascites', kicker: 'Decompensated', title: 'Ascites and varices' }, { id: 'low', kicker: 'Low pressure', title: 'Bleed, MAP <65' },
        { id: 'restart', kicker: 'Low pressure', title: 'Pressure recovered' }, { id: 'evl', kicker: 'After a bleed', title: 'Carvedilol with banding' }, { id: 'tips', kicker: 'After a TIPS', title: 'TIPS, no carvedilol' }, { id: 'stop', kicker: 'Stopping', title: 'Off carvedilol, abstinent' }],
      kicker: 'Summary', title: 'One drug, from CSPH to recompensation',
      line: 'Carvedilol starts at CSPH and stays through ascites and varices. A MAP <65 mmHg or HRS-AKI holds it, and only a proven end of CSPH stops it.',
      notes: 'Carvedilol begins when CSPH is shown and not before. It replaces the screening endoscopy, stays through ascites and varices, joins banding after a bleed and is held, then restarted, for a low pressure or HRS-AKI. A TIPS that brings the PPG under 12 mmHg can replace it. After recompensation it stops only when an HVPG under 10 mmHg off the drug, or a low stiffness, shows that CSPH has resolved.',
      ask: ['Which three findings hold carvedilol in decompensated cirrhosis?', 'A systolic pressure <90 mmHg, a MAP <65 mmHg, or HRS-AKI. Any one is enough.'],
    },
  ],
};
