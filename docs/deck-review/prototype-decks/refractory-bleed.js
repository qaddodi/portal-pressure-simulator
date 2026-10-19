// Presenter talk: a variceal bleed that drugs and banding cannot control, bridged by a balloon tube to a rescue TIPS,
// then a fundal varix that bleeds through a gastrorenal shunt, with BRTO weighed against a TIPS
// (the slide fields are described at the top of decks.js). The bleed opens on slide 2, not slide 1, so the Outline,
// which shows slide 1's patient, is not already bleeding. The chain never clots an open bleed on its own, so each
// balloon slide stops it explicitly (stopBleed) once the balloon has dropped the pressure across the varix wall.

const UNIT = { kind: 'infuse', fluid: 'prbc' };
const BEATS = { kind: 'trace', range: 'beats' };
const ESO = 'Esophageal varices', GV = 'Fundal varices';

export const REFRACTORY_BLEED = {
  id: 'refractory-bleed', level: 'advanced', title: 'When banding fails', minutes: 10,
  objectives: [
    'Use a balloon tube as a bridge when drugs and banding cannot stop the bleeding',
    'Decide on a rescue TIPS, and recognize when it is likely futile',
    'Classify gastric varices and name the ones that are banded',
    'Weigh BRTO against a TIPS for a fundal varix',
  ],
  checks: [
    ['How long can a balloon tube stay inflated?', 'About 24 hours at most, as a bridge to a rescue TIPS.'],
    ['When is a rescue TIPS likely to be futile?', 'Child–Pugh 14 or 15, or a MELD of 30 or more with a lactate of 12 mmol/L or more, unless a transplant can follow.'],
    ['Which gastric varices are banded like esophageal ones?', 'GOV1, which run from the esophagus along the lesser curve.'],
    ['What does BRTO cost?', 'The portal pressure rises, so esophageal varices and ascites can worsen.'],
  ],
  sections: [['Uncontrolled bleeding', [ESO]], ['Bridge and rescue', ['Bridge', 'Rescue']], ['Fundal varices', [GV]], ['Definitive treatment', ['Definitive treatment']]],
  summary: 'An esophageal bleed that drugs and banding cannot control, bridged by a balloon tube to a rescue TIPS, then a fundal varix that bleeds through a gastrorenal shunt, with BRTO weighed against a TIPS.',
  slides: [
    {
      id: 'before', preset: 'cirr-decomp', terms: ['varix'], cam: 'varices', labels: ['VAR'], tool: { kind: 'scope' }, data: 'tiles', tiles: ['varix', 'ppg'], key: ['varix'],
      kicker: ESO, site: 'sin', title: 'Large varices in Child–Pugh C cirrhosis',
      vignette: 'A 49-year-old man with alcohol-associated cirrhosis and ascites drank until last week. His bilirubin is 4.2 mg/dL and his INR 2.1, and EGD last month showed large varices with red wale marks.',
      line: 'In Child–Pugh C cirrhosis, varices of {varix} under a PPG of {ppg} can bleed faster than drugs and banding can control.',
      notes: 'In this case, bilirubin 4.2 mg/dL scores 3 points, INR 2.1 scores 2, albumin 2.8 g/dL scores 2, ascites on diuretics scores 2 and no encephalopathy scores 1: Child–Pugh C, 10 points. Child–Pugh C, active bleeding at endoscopy and an HVPG of 20 mmHg or more, where it is measured, make a bleed that drugs and banding cannot control more likely. The same features select patients for a pre-emptive TIPS once a bleed is controlled.',
      ask: ['Which features make a variceal bleed harder to control?', 'Child–Pugh C, active bleeding at endoscopy, and an HVPG of 20 mmHg or more where it is measured.'],
    },
    {
      id: 'fail', action: { kind: 'rupture', tear: 0.7 }, cam: 'varices', mark: { edges: ['C1a', 'C1b'], label: 'Bleeding varix' }, tool: BEATS, data: 'tiles', tiles: ['hr', 'map'], key: ['hr'], delta: true,
      kicker: ESO, site: 'sin', title: 'Bleeding that banding cannot stop',
      line: 'The varix tears, and blood fills the esophagus faster than the scope can clear it, so no band can be placed and the heart rate climbs to {hr}.',
      notes: 'Drugs and banding control most variceal bleeds, but about 1 in 10 is not controlled, and then death within 6 weeks becomes much more likely. Protect the airway, keep the octreotide and ceftriaxone running, and call for a bridge and a rescue TIPS.',
      ask: ['Banding fails and blood keeps coming. What are the next steps?', 'Protect the airway, keep octreotide and ceftriaxone running, tamponade with a balloon tube or an esophageal stent, and arrange a rescue TIPS.'],
    },
    {
      id: 'shock', params: { drugs: { octreotide: true } }, action: [UNIT, UNIT], cam: 'varices', tool: BEATS, data: 'tiles', tiles: ['hr', 'map'], key: ['map'], delta: true,
      kicker: ESO, site: 'sin', title: 'Drugs and blood do not keep up',
      line: 'With octreotide running and two units in, the bleeding still outpaces them and the blood pressure falls to {map}.',
      notes: 'Octreotide narrows the splanchnic arterioles and lowers the portal pressure, but it cannot close a torn varix. Transfuse to keep the circulation going; once it is stable, the target is a hemoglobin of 7 to 8 g/dL. Fresh frozen plasma and platelets given only to correct the INR or the count are not advised.',
      ask: ['Once the bleeding is controlled, why not transfuse to a normal hemoglobin?', 'Extra volume raises the portal pressure and makes an early rebleed more likely.'],
    },
    {
      id: 'balloon', params: { balloonEso: true }, action: [{ kind: 'stopBleed' }, UNIT], cam: 'varices', tool: { kind: 'scope', open: true }, data: 'tiles', tiles: ['map', 'hr'], key: ['map'], delta: true,
      kicker: 'Bridge', site: 'sin', title: 'A balloon tube presses the varices shut',
      line: 'Inflated in the esophagus, the balloon presses on the varices from outside, so the pressure across their wall falls, the bleeding stops and the blood pressure recovers to {map}.',
      caveat: 'The model stops the bleed at once; in patients the balloon controls most bleeds, and many restart when it comes down.',
      notes: 'Intubate before the tube goes in, and confirm that the gastric balloon sits in the stomach before inflating the esophageal one. Keep it inflated for no more than about 24 hours, as a bridge to a rescue TIPS. In a small randomized trial, a covered self-expanding esophageal stent controlled the bleeding more often than a balloon tube; in the US the balloon tube is still the usual bridge.',
      ask: ['What must happen before the balloon tube goes in?', 'Intubation to protect the airway.'],
    },
    {
      id: 'rescue', params: { balloonEso: false, tips: { on: true, d: 8 } }, cam: 'liver', mark: { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' }, data: 'ladder', key: ['ppg'],
      causesHead: 'Likely futile with', causes: ['Child–Pugh 14 or 15', 'MELD 30 or more with lactate 12 mmol/L or more'],
      kicker: 'Rescue', site: 'sin', title: 'A rescue TIPS takes over from the balloon',
      line: 'A covered TIPS drops the PPG to {ppg}, under the {<12 mmHg} target, so the balloon can come down.',
      notes: 'A rescue TIPS controls the bleeding in most patients, but survival depends on how much liver function is left. With Child–Pugh 14 or 15 points, or a MELD of 30 or more with a lactate of 12 mmol/L or more, death is very likely despite the TIPS, unless a liver transplant can follow soon. Decide with the transplant team before the procedure.',
      ask: ['When is a rescue TIPS likely to be futile?', 'Child–Pugh 14 or 15, or a MELD of 30 or more with a lactate of 12 mmol/L or more, unless a transplant can follow.'],
    },
    {
      id: 'gv', preset: 'gastric-varix', cam: 'fundus', labels: ['GV', 'LRV'], mark: { edges: ['C5'], label: 'Gastrorenal shunt', kind: 'note' }, lens: 'flow', data: 'tiles', tiles: ['gv', 'varix', 'ppg'], key: ['gv'],
      kicker: GV, site: 'sin', title: 'A fundal varix drains through a gastrorenal shunt',
      vignette: 'A 47-year-old woman with cirrhosis from primary biliary cholangitis vomited blood and is lightheaded. EGD shows a large fundal varix with a fresh clot on it and no esophageal varices.',
      line: 'Colored by flow, a fundal varix of {gv}, fed by the short and posterior gastric veins, drains through a shunt to the left renal vein while the esophagus stays clear.',
      notes: 'Gastric varices are classed by where they lie: GOV1 continue from the esophagus along the lesser curve, GOV2 run into the fundus, IGV1 sit alone in the fundus and IGV2 elsewhere in the stomach. GOV1 are banded like esophageal varices. Fundal varices (GOV2 and IGV1) are treated with cyanoacrylate glue (off-label in the US), a TIPS or, when a gastrorenal shunt is present, retrograde obliteration (BRTO). Endoscopy in this app stays in the esophagus, so the fundal varix is read from its tile.',
      ask: ['Which gastric varices are banded like esophageal varices?', 'GOV1, which run from the esophagus along the lesser curve.'],
    },
    {
      id: 'gvbleed', action: { kind: 'rupture', site: 'GV', tear: 0.5 }, cam: 'fundus', mark: { edges: ['C2'], label: 'Bleeding varix' }, tool: BEATS, data: 'tiles', tiles: ['hr', 'map'], key: ['hr'], delta: true,
      kicker: GV, site: 'sin', title: 'The fundal varix bleeds again, heavily',
      line: 'The varix tears again and bleeds into the stomach, and the heart rate climbs to {hr}.',
      notes: 'Fundal varices bleed less often than esophageal varices, but more heavily. They are wide, so the tension in their wall is high at the same pressure. Start octreotide and ceftriaxone as for any variceal bleed.',
      ask: ['Why does a wide varix tear more easily at the same pressure?', 'By Laplace, wall tension is pressure times radius over wall thickness, so a wide, thin-walled varix carries more tension.'],
    },
    {
      id: 'gvballoon', params: { balloonGas: true }, action: [{ kind: 'stopBleed' }, UNIT], cam: 'fundus', data: 'tiles', tiles: ['gv', 'map'], key: ['gv'], delta: true,
      kicker: GV, site: 'sin', title: 'A gastric balloon presses on the fundal varix',
      line: 'Pulled up against the fundus, the gastric balloon squeezes the varix to {gv} and the bleeding stops.',
      caveat: 'The model presses on the varix only; it does not model the balloon\'s traction or its risks.',
      notes: 'The gastric balloon of a Minnesota or Linton tube is inflated in the stomach and pulled up against the cardia and fundus. It is a bridge of hours to glue, retrograde obliteration or a TIPS, with the same airway and pressure-injury risks as the esophageal balloon.',
      ask: ['What does the gastric balloon bridge to?', 'Cyanoacrylate glue, retrograde obliteration of the shunt (BRTO) or a TIPS.'],
    },
    {
      id: 'choose', params: { balloonGas: false, occluded: { C5: true } }, cam: 'fit', lens: 'flow', mark: { edges: ['C5'], label: 'Shunt closed', kind: 'treat' }, data: 'tiles', tiles: ['ppg', 'varix', 'liver'], key: ['ppg'], delta: 'gv',
      compare: [{ label: 'BRTO', own: true, params: { occluded: { C5: true }, tips: { on: false } } }, { label: 'TIPS', params: { occluded: { C5: false }, tips: { on: true } } }],
      kicker: 'Definitive treatment', site: 'sin', title: 'BRTO raises the portal pressure, and a TIPS lowers it',
      line: 'Colored by flow, BRTO plugs the shunt and keeps portal blood in the liver but raises the PPG to {ppg}, while a TIPS lowers it and sends that blood around the liver.',
      caveat: 'In the model the esophageal varices fill as soon as the shunt closes; in patients they grow over months.',
      notes: 'Retrograde obliteration fills the shunt and the fundal varix with sclerosant behind a balloon or a plug. It controls fundal bleeding with little rebleeding, but closing the shunt raises the portal pressure, so esophageal varices and ascites can worsen. A TIPS suits patients with ascites or esophageal varices, and obliteration suits those who cannot have a TIPS. In a French randomized trial, a pre-emptive TIPS after a fundal bleed cut rebleeding compared with glue, without a clear gain in survival.',
      ask: ['A fundal varix has bled, and there is ascites. BRTO or TIPS?', 'A TIPS: closing the shunt would raise the portal pressure and worsen the ascites.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['map', 'ppg', 'varix'], asc: false, rowHead: 'Step',
      of: [{ id: 'before', kicker: 'Esophageal', title: 'Before the bleed' }, { id: 'fail', kicker: 'Esophageal', title: 'Banding fails', vs: 'before' }, { id: 'shock', kicker: 'Esophageal', title: 'Octreotide, two units', vs: 'before' },
        { id: 'balloon', kicker: 'Bridge', title: 'Balloon tube', vs: 'before' }, { id: 'rescue', kicker: 'Rescue', title: 'Rescue TIPS', vs: 'before' },
        { id: 'gv', kicker: 'Fundal', title: 'Fundal varix', ref: true }, { id: 'gvbleed', kicker: 'Fundal', title: 'Fundal bleed', vs: 'gv' }, { id: 'choose', kicker: 'Fundal', title: 'BRTO', vs: 'gv' }],
      kicker: 'Summary', title: 'From an uncontrolled bleed to the treatment that ends it',
      line: 'A balloon buys a few hours, and a TIPS or BRTO then treats the pressure behind the bleed.',
      notes: 'When drugs and banding fail, protect the airway, tamponade the varix and bring in a rescue TIPS within hours, unless it is likely to be futile. Fundal varices take a different route: glue, a TIPS or obliteration of the gastrorenal shunt, chosen by the shunt, the ascites and the liver. During a bleed the PPG falls because blood is lost, not because the bleeding is controlled, so its green arrows on those rows are no comfort.',
      ask: ['What is the balloon tube for?', 'A bridge of no more than about 24 hours to a definitive treatment such as a TIPS.'],
    },
  ],
};
