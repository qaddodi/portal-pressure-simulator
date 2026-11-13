// Presenter talk: what moves the portal pressure in hours, not years. One man with CSPH is followed through a meal, a litre of saline,
// quiet and deep breathing, and a strain (the hold-to-strain button).
//
// Sources, checked against guidelines/baveno-viii-2026.pdf on 11 Nov 2026: 1.4 is the only statement about the time of day:
// liver stiffness should always be measured under fasting conditions. Neither guideline file says what a meal, a litre of fluid or a
// strain does to the portal pressure, so the rest of the talk is the model's, and the notes say so. The model has a meal setting (a
// healthy liver's portal flow rises by about half, a cirrhotic gut that is already dilated responds less), saline as an infusion, a
// breathing depth and a Valsalva strain. It has no body position, so standing up is not in the talk.

const MEAL = { days: 8, ramp: { meal: [0, 1] }, lapse: { seconds: 6, from: 'Fasting', to: 'After a meal', clock: 'seconds' } };
const SALINE = { kind: 'infuse', fluid: 'crystalloid' };
const BEATS = { kind: 'trace', range: 'beats' };

export const DAY = {
  id: 'day', level: 'core', title: 'A day in the portal vein', minutes: 6,
  sections: [['Before breakfast', ['Before breakfast']], ['After eating', ['After eating']], ['Breathing and straining', ['Breathing and straining']]],
  objectives: [
    'Describe how a meal changes portal flow, portal pressure and liver stiffness',
    'Explain why a 1 L saline bolus raises the portal and IVC pressures together and leaves the HVPG unchanged',
    'Describe how respiration and a Valsalva maneuver change the portal vein pressure and the MAP',
    'State why liver stiffness is measured fasting',
  ],
  summary: 'What changes the portal pressure within hours: a meal, a 1 L saline bolus and deep breathing, in one man with CSPH, and why liver stiffness is measured fasting.',
  checks: [
    ['Why is liver stiffness measured fasting?', 'A meal raises portal flow and portal pressure, and so liver stiffness. Baveno VIII 1.4 says liver stiffness should always be measured under fasting conditions.'],
    ['A 1 L saline bolus raises a man\'s portal vein pressure and his IVC pressure by the same amount. What happens to his HVPG?', 'It does not change. The HVPG is a difference between two pressures, and the saline raised both.'],
    ['Fasting, a man with CSPH has a portal flow of 1.1 L/min. After a meal it is 1.5 L/min. Is the increase due to a change in the liver?', 'No. Intrahepatic resistance is unchanged. Splanchnic arteriolar vasodilation raised portal inflow, and the same resistance turned the higher flow into a higher pressure.'],
  ],
  slides: [
    {
      id: 'fasting', preset: 'csph', cam: 'portal', tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv', 'pvVel'], key: ['pv'], terms: ['pv'],
      vignette: 'A 52-year-old man has cirrhosis with CSPH and no ascites. He is fasting, and his hepatologist wants to know how much ordinary daily events change his portal pressure.',
      kicker: 'Before breakfast', site: 'sin', title: 'Fasting, his portal pressure is at its lowest of the day',
      line: 'Before breakfast, the portal vein pressure is {pv} and the portal venous velocity is {pvVel}. Ordinary daily events change both.',
      notes: 'The first measurement is fasting: no meal, no IV fluid, quiet breathing. The portal vein pressure and velocity are the baseline for the next slides. The Doppler sample volume is in the main portal vein. Everything on the next slides comes from the model: Baveno VIII gives one rule about timing, that liver stiffness is measured fasting, and says nothing about what a meal, a liter of fluid or a Valsalva maneuver does to the portal pressure.',
      ask: ['Why does it matter whether a portal pressure is measured fasting?', 'A meal changes portal flow and pressure, so a fasting measurement is the baseline for comparison.'],
    },
    {
      id: 'meal', ...MEAL, cam: 'portal', tool: { kind: 'flowtime', clock: 'meal', lines: ['pv', 'pvFlow'], keepTiles: true, title: 'Portal pressure and flow around a meal' }, data: 'tiles', tiles: ['pvFlow', 'lsm'], key: ['pvFlow'], delta: 'fasting',
      kicker: 'After eating', site: 'sin', title: 'A meal raises portal flow, portal pressure and liver stiffness', cite: 'Baveno VIII 1.4',
      line: 'Thirty minutes after a meal, portal flow is {pvFlow} and the portal vein pressure is {pv}. Liver stiffness is {lsm}, which is why VCTE is performed fasting.',
      notes: 'Baveno VIII 1.4: liver stiffness should always be measured under fasting conditions, for the diagnosis of cACLD and of CSPH alike. In the model a meal causes splanchnic arteriolar vasodilation, so portal inflow rises. With intrahepatic resistance unchanged, the portal pressure rises, and liver stiffness rises with it. In cirrhosis the splanchnic circulation is already vasodilated, so it responds less than in a healthy patient. The meal plays over a few seconds here; in a patient it takes about 30 minutes.',
      ask: ['Why does a meal raise liver stiffness?', 'Postprandial splanchnic vasodilation raises portal inflow, so portal pressure rises. That is why liver stiffness is measured fasting (Baveno VIII 1.4).'],
    },
    {
      id: 'fluid', preset: 'csph', params: {}, action: SALINE, cam: 'fit', data: 'tiles', tiles: ['pv', 'hvpg'], key: ['hvpg'], delta: 'fasting', terms: ['ivc'],
      kicker: 'After eating', site: 'sin', title: 'A 1 L saline bolus raises every venous pressure and leaves the HVPG unchanged',
      line: 'Fasting again, he receives 1 L of IV saline. The portal vein pressure rises to {pv} and the IVC pressure to {ivc}, so the HVPG stays at {hvpg}.',
      notes: 'The saline expands the whole venous compartment. The portal vein pressure and the wedged and free hepatic venous pressures (WHVP, FHVP) rise together, so the HVPG, the WHVP minus the FHVP, barely changes. This is why the HVPG is reliable after IV fluid, and why an isolated portal vein pressure is not. The infusion runs over 10 to 15 minutes of model time. Neither guideline gives a figure for it; the numbers are the model\'s.',
      ask: ['A 1 L saline bolus raises the portal and IVC pressures by the same amount. What happens to the HVPG?', 'It is unchanged, because it is the WHVP minus the FHVP and both rose.'],
    },
    {
      id: 'breath', preset: 'csph', params: { respDepth: 3 }, cam: 'portal', tool: BEATS, data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'],
      compare: [{ label: 'Quiet breathing', short: 'Quiet', params: { respDepth: 1 } }, { label: 'Deep breathing', short: 'Deep', own: true, params: { respDepth: 3 } }],
      kicker: 'Breathing and straining', site: 'sin', title: 'Respiration makes the portal pressure vary from beat to beat',
      line: 'With deep breathing, the portal pressure varies with each respiratory cycle. The mean stays {pv}, and the HVPG stays {hvpg}.',
      notes: 'Each respiratory cycle changes intrathoracic and intra-abdominal pressure. The portal pressure oscillates with it around the same mean, and the model\'s HVPG, which is calculated from mean pressures, does not change. The strip on the trace is a schematic rhythm timed to the model\'s heart rate, not a modeled ECG. In practice the HVPG is read from the mean over a stable stretch of tracing for the same reason.',
      ask: ['Why does respiration not change the HVPG?', 'The pressure oscillates around the same mean, and the HVPG is calculated from mean pressures.'],
    },
    {
      id: 'strain', preset: 'csph', params: {}, cam: 'fit', strain: true, data: 'tiles', tiles: ['pv', 'map'], key: ['pv'],
      kicker: 'Breathing and straining', site: 'sin', title: 'A Valsalva maneuver raises the portal pressure for as long as it is held',
      line: 'During a Valsalva maneuver, intrathoracic and intra-abdominal pressure rise: the portal vein pressure climbs and the MAP falls. On release, both return to baseline.',
      notes: 'Forced expiration against a closed glottis (Valsalva maneuver) raises intrathoracic and intra-abdominal pressure at once. In the model, when held, it builds over 1.5 seconds, and the portal vein pressure and the right atrial pressure rise together while the MAP falls. The HVPG is lower during the strain, because the same external pressure acts on both veins it is measured across. On release everything returns to baseline within a few seconds. The model does not record a trace of the strain. Neither guideline says what a Valsalva maneuver does to the portal pressure, so these numbers are the model\'s. The same physiology applies in the second stage of labor, and in coughing or straining in a patient with a hernia.',
      ask: ['What does a Valsalva maneuver do to the portal vein pressure and the MAP?', 'It raises the portal vein pressure, because the raised intrathoracic and intra-abdominal pressure is transmitted to the veins, and it lowers the MAP. Both return to baseline on release.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'pvFlow', 'lsm'], asc: false, vs: 'first', rowHead: 'State',
      of: [{ id: 'fasting', kicker: 'Start', title: 'Fasting' }, { id: 'meal', kicker: 'Meal', title: '30 minutes after a meal' }, { id: 'fluid', kicker: 'Saline', title: '1 L saline bolus' }],
      kicker: 'Summary', title: 'What changes the portal pressure over a day',
      line: 'A meal raises portal flow, portal pressure and liver stiffness. A 1 L saline bolus raises the portal and IVC pressures together, so the HVPG is unchanged.',
      notes: 'Over a day the portal pressure changes with meals, IV fluid and respiration. A meal causes splanchnic vasodilation and raises portal flow, portal pressure and liver stiffness, which is why liver stiffness is measured fasting (Baveno VIII 1.4). A 1 L saline bolus raises the portal and IVC pressures together, so the gradient does not change. Neither guideline gives a figure for what a meal or IV fluid does to the portal pressure; the numbers are the model\'s.',
      ask: ['Which of the three, a meal, a 1 L saline bolus or deep breathing, changes the HVPG?', 'A meal raises it, because the extra flow crosses the same resistance. Saline and breathing leave it unchanged.'],
    },
  ],
};
