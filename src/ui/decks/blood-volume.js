// Presenter talk: blood volume and the portal pressure, a liter lost, two units back, and what overfilling does
// (the slide fields are described at the top of decks.js). Each slide's volume runs in with the patient settled after it.

const H = { kind: 'hemorrhage', mL: 1000 }, UNIT = { kind: 'infuse', fluid: 'prbc' }, SALINE = { kind: 'infuse', fluid: 'crystalloid' };
const PROFILE = { kind: 'profile', from: 'full', fromLabel: 'Before the bleed' };

export const BLOOD_VOLUME = {
  id: 'blood-volume', level: 'core', title: 'Blood volume and portal pressure', minutes: 7,
  objectives: [
    'Explain why losing blood lowers the portal pressure',
    'Compare a liter lost in cirrhosis with a liter lost in health',
    'Transfuse to a hemoglobin of 7 to 8 g/dL, and explain why not more',
  ],
  checks: [
    ['Why does the portal pressure fall during a variceal bleed?', 'Less blood volume means less inflow into the portal system.'],
    ['What hemoglobin target do Baveno VIII and AASLD give for a variceal bleed?', 'Baveno VIII: 7 to 8 g/dL. AASLD: about 7 g/dL, higher with coronary disease or instability.'],
    ['Why not transfuse to a normal hemoglobin?', 'Extra volume pushes the portal pressure above its level before the bleed; liberal transfusion worsens the portal pressure and survival.'],
    ['After two units the blood pressure has recovered and the hemoglobin is 8 g/dL. Give a third unit?', 'No. The target is 7 to 8 g/dL, and more volume pushes the portal pressure up behind varices that have just stopped bleeding.'],
  ],
  summary: 'What a liter of blood lost does to the arterial and the portal pressure in cirrhosis, why the healthy circulation copes better, and why transfusion stops at a hemoglobin of 7 to 8 g/dL.',
  slides: [
    {
      id: 'full', preset: 'cirr-decomp', cam: 'route', terms: ['pv'], tool: { kind: 'profile' }, data: 'tiles', tiles: ['bv', 'map'], key: ['bv'],
      vignette: 'A 49-year-old woman with MASH cirrhosis has ascites on spironolactone and furosemide, large esophageal varices and an albumin of 2.8 g/dL.',
      kicker: 'Before the bleed', site: 'sin', title: 'The volume behind the portal pressure',
      line: 'In decompensated cirrhosis the vessels hold {bv} of blood, and the [portal vein](pv) pressure is {pv}. What fills the circulation fills the portal system too.',
      notes: 'Cirrhosis widens the splanchnic and systemic arteries, and the kidneys keep salt and water to fill them, so the blood volume is larger than in health (the Hyperdynamic deck shows how). The portal pressure depends on the resistance of the liver and on how much blood flows in. Volume changes the second.',
      ask: ['Name the two things that set the portal pressure.', 'The resistance to portal flow and the portal inflow.'],
    },
    {
      id: 'loss', action: H,
      predict: { title: 'A liter is about to be lost', q: 'She is about to lose a liter of blood from a varix, and her arterial pressure will fall. What will the pressure in her portal vein do?', options: ['Rise', 'Fall', 'Stay the same'], answer: 1 }, cam: 'route', tool: PROFILE, data: 'tiles', tiles: ['map', 'hr'], key: ['map'], delta: true,
      kicker: 'The bleed', site: 'sin', title: 'A liter lost lowers the portal pressure',
      line: 'A liter of blood is lost. The mean arterial pressure falls to {map} and the heart races at {hr}. With less volume, less blood flows into the portal system, and the portal pressure falls to {pv}.',
      notes: 'The dotted line is the pressure before the bleed. Lost volume lowers the cardiac output and the splanchnic inflow, so the whole portal profile sinks. The heart rate and the arterial pressure show the loss first; the hemoglobin lags for hours, as fluid moves into the vessels (the Variceal bleed deck plays this beat by beat).',
      ask: ['Why does the portal pressure fall during a bleed?', 'Less volume means less inflow into the portal system.'],
    },
    {
      id: 'reserve', preset: 'healthy', action: H, cam: 'route', data: 'tiles', tiles: ['map', 'hr'], key: ['map'], delta: false,
      kicker: 'The bleed', title: 'A healthy circulation copes better',
      line: 'Take the same liter from a healthy circulation: the mean arterial pressure holds at {map} and the heart rate rises only to {hr}. In cirrhosis the arteries are already wide, with less room to tighten.',
      notes: 'A healthy person who loses a liter keeps the arterial pressure close to normal by constricting the arteries and speeding the heart. In cirrhosis the arteries are already dilated and the heart already fast, so the same loss lowers the pressure further and sooner. A beta-blocker blunts the rise in heart rate still more.',
      ask: ['Why does the same blood loss drop the arterial pressure further in cirrhosis?', 'The arteries are already dilated and the heart already fast, so there is less reserve to compensate.'],
    },
    {
      id: 'units', preset: 'cirr-decomp', action: [H, UNIT, UNIT], cam: 'route', tool: PROFILE, data: 'tiles', tiles: ['map', 'hr'], key: ['map'], delta: 'loss',
      cite: 'Baveno VIII 5.3, 5.4; AASLD 28',
      kicker: 'Volume back', site: 'sin', title: 'Restore the circulation, not the hemoglobin',
      line: 'Two units of red cells lift the mean arterial pressure to {map} and slow the heart to {hr}. The portal pressure climbs back to {pv}. Once the circulation is stable, transfuse below a hemoglobin of 7 g/dL, to 7 to 8.',
      notes: 'Baveno VIII 5.3: the aim of resuscitation is to keep the organs perfused, restoring and maintaining a stable circulation. Baveno VIII 5.4: a restrictive transfusion to a hemoglobin of 7 to 8 g/dL, with an individual target for heart disease, age, unstable vital signs or ongoing bleeding. AASLD 28 aims for about 7 g/dL unless coronary disease or instability calls for more. The tiles compare with the patient after the liter was lost.',
      ask: ['What hemoglobin target does Baveno VIII set in a variceal bleed?', '7 to 8 g/dL, transfusing below 7, with an individual target for heart disease or ongoing bleeding.'],
    },
    {
      id: 'over', action: [UNIT, UNIT, UNIT, SALINE], cam: 'route', tool: PROFILE, data: 'tiles', tiles: ['bv', 'pv'], key: ['pv'], delta: 'full',
      cite: 'AASLD 2024 (28, 29)',
      kicker: 'Volume back', site: 'sin', title: 'Too much volume overshoots',
      line: 'Three more units and a liter of crystalloid bring the blood volume to {bv}. The portal pressure reaches {pv}, above the dotted line from before the bleed, behind varices that have just stopped bleeding.',
      notes: 'Volume beyond what the circulation needs pushes the portal pressure past its level before the bleed. AASLD advises against liberal transfusion of blood products, which worsens the portal pressure and survival, and against plasma or platelets given to correct the INR or the count. In cirrhosis extra saline also adds sodium and feeds the ascites. The tiles compare with the patient before the bleed.',
      ask: ['A stable patient after a variceal bleed has a hemoglobin of 8.5 g/dL. Should a third unit be given?', 'No. The target is 7 to 8 g/dL; more volume raises the portal pressure.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['bv', 'map', 'hr', 'pv', 'ppg'], asc: false, vs: 'first', calm: ['bv'], rowHead: 'Step',
      of: [{ id: 'full', kicker: 'Baseline', title: 'Before the bleed' }, { id: 'loss', kicker: 'The bleed', title: 'A liter lost' }, { id: 'units', kicker: 'Volume', title: 'Two units' }, { id: 'over', kicker: 'Volume', title: 'Overfilled' }],
      kicker: 'Summary', title: 'Volume moves the portal pressure',
      line: 'The portal pressure falls with the blood lost and rises with every unit given back. Restore a stable circulation, transfuse to 7 to 8 g/dL, and stop there.',
      notes: 'Blood volume is one of the levers on the portal pressure. A bleed lowers it, resuscitation restores it, and overfilling raises it past where it started, the moment a fresh clot on a varix can least afford it.',
      ask: ['Order these by portal pressure: before the bleed, after a liter lost, after two units, after overfilling.', 'After a liter lost, after two units, before the bleed, after overfilling.'],
    },
  ],
};
