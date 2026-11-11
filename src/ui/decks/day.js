// Presenter talk: what moves the portal pressure in hours, not years. One man with CSPH is followed through a meal, a litre of saline,
// quiet and deep breathing, and a strain (the strain slide waits for the hold-to-strain button).
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
  sections: [['Before breakfast', ['Before breakfast']], ['After eating', ['After eating', 'Fluid']], ['Breathing and straining', ['Breathing']]],
  objectives: [
    'Say how a meal changes portal flow, portal pressure and liver stiffness',
    'Explain why a litre of saline moves the portal and caval pressures together and leaves the HVPG unchanged',
    'Describe how breathing moves the portal pressure from beat to beat',
    'State why liver stiffness is measured fasting',
  ],
  summary: 'What moves the portal pressure in hours: a meal, a litre of saline, deep breathing. One man with CSPH, and why stiffness is measured fasting.',
  checks: [
    ['Why is liver stiffness measured fasting?', 'A meal raises the portal flow and the pressure, and so the stiffness. Baveno VIII 1.4 says stiffness should always be measured under fasting conditions.'],
    ['A litre of saline raises a man\'s portal vein pressure and his IVC pressure by the same amount. What happens to his HVPG?', 'It does not change. The HVPG is a difference between two pressures, and the saline raised both.'],
    ['Fasting, a man with CSPH has a portal flow of 1.1 L/min. After a meal it is 1.5 L/min. Is the extra flow a change in the liver?', 'No. The liver and its resistance are unchanged. The gut arterioles opened, more blood came in, and the same liver raised the pressure.'],
  ],
  slides: [
    {
      id: 'fasting', preset: 'csph', cam: 'portal', tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv', 'pvVel'], key: ['pv'], terms: ['pv'],
      vignette: 'A 52-year-old man has cirrhosis with CSPH and no ascites. He is fasting, and his hepatologist wants to know how much an ordinary day moves his portal pressure.',
      kicker: 'Before breakfast', site: 'sin', title: 'Fasting, his portal pressure is at its lowest of the day',
      line: 'Before breakfast, the portal vein pressure is {pv} and the blood moves at {pvVel}. An ordinary day moves both.',
      notes: 'The first reading is the fasting one: no meal, no fluid, quiet breathing. The portal vein pressure and the velocity are the baseline for the next slides. The Doppler samples the main portal vein. Everything on the next slides is the model: Baveno VIII gives one rule about the time of day, that liver stiffness is measured fasting, and says nothing about what a meal, a litre of fluid or a strain does to the portal pressure.',
      ask: ['Why does it matter whether a portal pressure is measured fasting?', 'Eating changes the portal flow and the pressure, so a fasting reading is the baseline the others are compared with.'],
    },
    {
      id: 'meal', ...MEAL, cam: 'portal', tool: { kind: 'flowtime', clock: 'meal', lines: ['pv', 'pvFlow'], keepTiles: true, title: 'Portal pressure and flow around a meal' }, data: 'tiles', tiles: ['pvFlow', 'lsm'], key: ['pvFlow'], delta: 'fasting',
      kicker: 'After eating', site: 'sin', title: 'A meal raises portal flow, pressure and stiffness', cite: 'Baveno VIII 1.4',
      line: 'Half an hour after eating, portal flow is {pvFlow} and the portal vein pressure is {pv}. Stiffness reads {lsm}, which is why FibroScan is done fasting.',
      notes: 'Baveno VIII 1.4: liver stiffness should always be measured under fasting conditions, for the diagnosis of cACLD and of CSPH alike. In the model a meal opens the arterioles of the gut, so more blood reaches the portal vein. The same liver and the same resistance then raise the pressure, and the stiffness rises with it. A cirrhotic gut is already dilated, so it responds less than a healthy one does. The meal plays over a few seconds here; in a patient it takes about half an hour.',
      ask: ['Why does a meal raise liver stiffness?', 'It opens the gut arterioles, so more blood reaches the portal vein and the pressure rises. That is why stiffness is measured fasting (Baveno VIII 1.4).'],
    },
    {
      id: 'fluid', preset: 'csph', params: {}, action: SALINE, cam: 'fit', data: 'tiles', tiles: ['pv', 'hvpg'], key: ['hvpg'], delta: 'fasting', terms: ['ivc'],
      kicker: 'After eating', site: 'sin', title: 'A litre of saline lifts every venous pressure and leaves the HVPG alone',
      line: 'Back fasting, he is given a litre of saline. The portal vein pressure rises to {pv} and the IVC pressure to {ivc}, so the HVPG stays at {hvpg}.',
      notes: 'The saline fills all the veins at once. The portal vein, the wedged pressure and the free hepatic pressure rise together, so the HVPG, which is the wedged pressure less the free pressure, barely moves. This is why the HVPG is reliable in a patient who has had fluid, and why a portal vein pressure read alone is not. The infusion runs over 10 to 15 minutes of model time. Neither guideline file gives a figure for it; the numbers are the model\'s.',
      ask: ['A litre of saline raises the portal and caval pressures by the same amount. What happens to the HVPG?', 'It stays where it was, because it is the difference between the wedged and free pressures and both rose.'],
    },
    {
      id: 'breath', preset: 'csph', params: { respDepth: 3 }, cam: 'portal', tool: BEATS, data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'],
      compare: [{ label: 'Quiet breathing', short: 'Quiet', params: { respDepth: 1 } }, { label: 'Deep breathing', short: 'Deep', own: true, params: { respDepth: 3 } }],
      kicker: 'Breathing and straining', site: 'sin', title: 'Each breath moves the portal pressure from beat to beat',
      line: 'With deep breathing, the portal pressure swings with every breath. The mean stays {pv}, and the HVPG stays {hvpg}.',
      notes: 'Breathing changes the pressure in the chest and in the abdomen with every breath. The portal pressure swings with it, around the same mean, and the model\'s HVPG, which is read from the mean pressures, does not move. The strip on the trace is a schematic rhythm timed to the model\'s heartbeat, not a modelled ECG. In the clinic the HVPG is read from the mean over a stretch of tracing for the same reason.',
      ask: ['Why does breathing not change the HVPG?', 'It makes the pressure swing around the same mean, and the HVPG is read from the mean pressures.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg', 'pvFlow', 'lsm'], asc: false, vs: 'first', rowHead: 'State',
      of: [{ id: 'fasting', kicker: 'Start', title: 'Fasting' }, { id: 'meal', kicker: 'Meal', title: 'Half an hour after eating' }, { id: 'fluid', kicker: 'Saline', title: 'A litre of saline' }],
      kicker: 'Summary', title: 'What moves the portal pressure in a day',
      line: 'A meal raises flow, pressure and stiffness. A litre of saline lifts the portal and caval pressures together, so the HVPG holds.',
      notes: 'Over a day the portal pressure moves with a meal, with fluid and with every breath. A meal opens the gut arterioles and raises the flow, the pressure and the stiffness, which is why stiffness is measured fasting (Baveno VIII 1.4). A litre of saline raises the portal and caval pressures together, so the gradient does not change. Neither guideline file gives a figure for what a meal or fluid does to the portal pressure; the numbers are the model\'s.',
      ask: ['Which of the three, a meal, a litre of saline or deep breathing, changes the HVPG?', 'A meal raises it, because the extra flow crosses the same resistance. Saline and breathing leave it unchanged.'],
    },
  ],
};
