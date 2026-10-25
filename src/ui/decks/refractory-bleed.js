// Presenter talk: a variceal bleed that drugs and bands do not hold, from treatment failure to a rescue TIPS (the slide fields are
// described at the top of decks.js). One patient, beat by beat on the live trace; the bleed stays open on every slide until
// the slide that stops it, so a slide that only lets time pass loses a little more blood.

const BEATS = { kind: 'trace', range: 'beats' };
const SALINE = { kind: 'infuse', fluid: 'crystalloid' }, UNIT = { kind: 'infuse', fluid: 'prbc' }, BAND = { kind: 'band' };

export const REFRACTORY_BLEED = {
  id: 'refractory-bleed', level: 'advanced', title: 'When the bleeding will not stop', minutes: 9,
  objectives: [
    'Define treatment failure in an acute variceal bleed',
    'Name the bridge to a TIPS and say which device Baveno VIII prefers',
    'Say who is considered for a rescue TIPS',
    'Name the main risk after it and what protects against it',
  ],
  summary: 'A bleed that octreotide and bands controlled comes back on day 3: what treatment failure means, the stent or balloon that bridges, the rescue TIPS and who is considered for it, and the encephalopathy that follows.',
  checks: [
    ['A man is banded for a variceal bleed and vomits blood again on day 4. Is that a new bleed or treatment failure?', 'Treatment failure. Baveno VIII counts uncontrolled bleeding, or a rebleed within 5 days, as failure.'],
    ['Which device does Baveno VIII prefer to bridge a bleed to a TIPS, and how long can each stay in?', 'A covered self-expanding esophageal stent, preferred to a balloon tube. A stent can stay up to a week and a tube up to 24 hours.'],
    ['A 70-year-old man is Child–Pugh C with a MELD of 24 and will not stop bleeding. Is a rescue TIPS ruled out?', 'No. Baveno VIII considers a salvage TIPS in every patient with refractory variceal bleeding, whatever the age, Child–Pugh class or MELD, case by case.'],
    ['With a balloon in place the bleeding stops, but it restarts when the balloon is let down. What does that show?', 'The balloon only presses on the varix. The pressure feeding it is unchanged, so it is a bridge. A TIPS lowers that pressure.'],
  ],
  sections: [['The failure', ['Failure']], ['The bridge', ['The bridge']], ['The rescue', ['The rescue']]],
  slides: [
    {
      id: 'controlled', preset: 'cirr-decomp', params: { drugs: { octreotide: true }, respiration: false }, action: [BAND], cam: 'varices', labels: ['VAR'], tool: BEATS, data: 'tiles', tiles: ['hr', 'map'], key: ['hr'],
      vignette: 'A 54-year-old man with alcohol-associated cirrhosis vomited blood two days ago. Octreotide, ceftriaxone and band ligation stopped the bleeding, and he is on the ward.',
      kicker: 'Failure', site: 'sin', title: 'The first bleed is controlled, for now',
      line: 'Banding and octreotide stopped the bleed, and the heart rate is {hr}. Until day 5, a new bleed would count as treatment failure, not as a new event.',
      notes: 'The first days after a variceal bleed carry the highest risk of a rebleed. Octreotide continues for 2 to 5 days, ceftriaxone for up to 5 days, and a non-selective beta-blocker starts when the drug stops. Banding is repeated every 2 to 4 weeks until the varices are gone. The strip over the pressures is a schematic rhythm timed to the model\'s heartbeat, not a modelled ECG.',
      ask: ['Why is a rebleed on day 3 not counted as a new bleed?', 'Baveno VIII defines treatment failure as uncontrolled bleeding or a rebleed within 5 days of the first bleed.'],
    },
    {
      id: 'rebleed', action: { kind: 'rupture', tear: 0.6 }, cam: 'varices', labels: ['VAR'], mark: { edges: ['C1a', 'C1b'], label: 'Bleeding varix' }, tool: BEATS, data: 'tiles', tiles: ['hr', 'map'], key: ['map'], delta: true,
      cite: 'Baveno VIII 5.16',
      kicker: 'Failure', site: 'sin', title: 'A rebleed within 5 days counts as treatment failure',
      line: 'On day 3 he vomits blood again, on octreotide and with the bands in place. Within minutes the heart rate climbs to {hr} and the blood pressure falls to {map}.',
      notes: 'A varix that bleeds again within 5 days of the first bleed means the first treatment did not work. The heart rate climbs and the blood pressure falls as before, but now the room has less reserve. Resuscitation restarts at once, and the endoscopist and the intensive care team are called.',
      ask: ['A patient is banded on Monday and vomits blood on Thursday. Is that treatment failure?', 'Yes: a rebleed within 5 days of the first bleed is treatment failure.'],
    },
    {
      id: 'failure', action: [UNIT, SALINE], cam: 'varices', labels: ['VAR'], data: 'tiles', tiles: ['hr', 'map'], key: ['map'], delta: true,
      tool: { kind: 'criteria', title: 'Treatment failure', short: 'Failure', ticks: false, rows: ['Bleeding that drugs and endoscopy do not control',
        { text: 'A rebleed within 5 days of the first bleed', note: 'day 3', lit: true }, 'Child–Pugh C, MELD, failure: 6-week death risk'] },
      caveat: 'The model\'s bands always close an esophageal bleed, so this slide leaves the repeat band out to show a bleed that goes on.',
      cite: 'Baveno VIII 5.16, 5.17',
      kicker: 'Failure', site: 'sin', title: 'Failure means uncontrolled bleeding or a rebleed by day 5',
      line: 'A unit of blood and a liter of fluid go in while the scope is repeated. The heart rate is {hr}, the blood pressure {map}. When drugs and endoscopy cannot hold the bleed, the next step is a bridge.',
      notes: 'Baveno VIII defines treatment failure either as bleeding that stays uncontrolled or as a rebleed within 5 days. Failure, a Child–Pugh class C, and a high MELD score are the main risk factors for death in the next 6 weeks. Keep volume at the level that holds organ perfusion and transfuse to a hemoglobin of 7 to 8 g/dL, because extra volume raises the portal pressure.',
      ask: ['Name two ways an acute variceal bleed counts as treatment failure.', 'Bleeding that stays uncontrolled despite drugs and endoscopy, or a rebleed within 5 days.'],
    },
    {
      id: 'bridge', params: { balloonEso: true }, action: [UNIT], cam: 'varices', labels: ['VAR'], mark: { edges: ['C1a', 'C1b'], label: 'Tamponade', kind: 'treat' }, tool: BEATS, data: 'tiles', tiles: ['hr', 'map'], key: ['map'], delta: true,
      caveat: 'The model draws the tamponade of a balloon. It has no stent.',
      cite: 'Baveno VIII 5.35; AASLD 2024 34',
      kicker: 'The bridge', site: 'sin', title: 'A stent or a balloon holds the bleed until a TIPS',
      line: 'Baveno VIII prefers a covered esophageal stent to a balloon tube as the bridge. A tube holds for 24 hours at most and a stent for up to a week. Pressure on the varix stops the bleed, and the blood pressure recovers to {map}.',
      notes: 'In refractory esophageal variceal bleeding a dedicated covered self-expanding metal stent is preferred over balloon tamponade, as a bridge to a TIPS or a transplant. AASLD 2024 notes that a stent can stay in place for up to a week and a balloon for 24 hours at most, and that specialized esophageal stents were not FDA approved in the United States, so many US centers have only the balloon. Intubate before the tube or the stent goes in.',
      ask: ['Why is a balloon tube or a stent a bridge and not a treatment?', 'It presses on the varix but leaves the portal pressure unchanged, so the bleeding returns when it comes out.'],
    },
    {
      id: 'tips', params: { balloonEso: false, tips: { on: true } }, action: [{ kind: 'stopBleed' }], cam: 'liver', tool: { kind: 'profile', from: 'bridge', fromLabel: 'Before TIPS' }, data: 'tiles', tiles: ['map', 'liver'], key: ['ppg'], delta: true,
      cite: 'Baveno VIII 5.36; AASLD 2024 35',
      kicker: 'The rescue', site: 'sin', title: 'A rescue TIPS takes the pressure off the varix',
      line: 'A covered TIPS lowers the PPG to {ppg}, under {<12 mmHg}, and the bleeding stops. The price is the liver\'s blood supply: it keeps {liver} of its normal flow.',
      notes: 'Baveno VIII recommends a salvage TIPS when bleeding cannot be controlled despite drugs and endoscopy, and AASLD 2024 calls it a rescue TIPS when the bleed returns despite vasoactive therapy and banding. The covered stent opens a channel from the portal vein to a hepatic vein, so most portal blood bypasses the liver. The gradient across the liver falls below the level where varices bleed, and the balloon can come out.',
      ask: ['What does a rescue TIPS change that a stent or a balloon does not?', 'It lowers the portal pressure feeding the varix, so the bleeding stops for good.'],
    },
    {
      id: 'who', cam: 'liver', data: 'tiles', tiles: ['ppg', 'liver'], key: ['liver'],
      tool: { kind: 'criteria', title: 'Who gets a rescue TIPS', short: 'Who gets it', ticks: false, rows: ['Considered in all, whatever the age or Child–Pugh class',
        'Whatever the MELD score, judged case by case', { text: 'Transplant candidacy assessed at once', lit: true }] },
      cite: 'Baveno VIII 5.37; AASLD 2024',
      kicker: 'The rescue', site: 'sin', title: 'No score alone rules a rescue TIPS out',
      line: 'Baveno VIII considers a salvage TIPS in every patient with refractory variceal bleeding, whatever the age, Child–Pugh class or MELD score, case by case. Death rates stay high at a high MELD, so transplant candidacy is assessed at once.',
      notes: 'Baveno VIII lets no age, Child–Pugh class or MELD score exclude a salvage TIPS by itself. For early TIPS, AASLD 2024 notes that the trials left out older patients, advanced liver cancer, severe kidney disease and heart failure, that mortality stays high at a MELD above 19 although early TIPS still beats standard care, and that transplant candidacy should be assessed promptly in such patients. The decision is made case by case.',
      ask: ['A 68-year-old man is Child–Pugh C, MELD 24, and bleeds on day 3. Does a high score exclude a rescue TIPS?', 'No. It is considered case by case, and transplant candidacy is assessed at once.'],
    },
    {
      id: 'after', cam: 'liver', data: 'tiles', tiles: ['liver', 'ppg'], key: ['liver'],
      cite: 'Baveno VIII 5.34; AASLD 2024',
      kicker: 'The rescue', site: 'sin', title: 'After a rescue TIPS, encephalopathy is the main risk',
      line: 'Less portal blood reaches the liver, so gut toxins pass into the circulation. Many centers give lactulose or rifaximin from the start. Encephalopathy that treatment does not control may prioritize the patient for transplant.',
      notes: 'The liver here keeps a fraction of its normal flow, which is why encephalopathy is the main risk after a TIPS. AASLD 2024 notes that many centers give lactulose or rifaximin to lower that risk, and Baveno VIII lets a patient with overt encephalopathy that medical and interventional treatment do not control be prioritized for liver transplantation.',
      ask: ['Name the main risk after a rescue TIPS and one way to lower it.', 'Hepatic encephalopathy. Lactulose or rifaximin from the start lowers it.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hr', 'map', 'pv', 'ppg', 'liver'], asc: false, vs: 'first', rowHead: 'Step',
      of: [{ id: 'controlled', kicker: 'Day 2', title: 'Bleed controlled' }, { id: 'rebleed', kicker: 'Day 3', title: 'The rebleed' }, { id: 'failure', kicker: 'Failure', title: 'Volume, repeat scope' }, { id: 'bridge', kicker: 'The bridge', title: 'Balloon on the varix' }, { id: 'tips', kicker: 'The rescue', title: 'Rescue TIPS' }],
      cite: 'Baveno VIII 5.16, 5.35, 5.36',
      kicker: 'Summary', title: 'Failure, bridge, rescue',
      line: 'The vital signs fall with the rebleed and recover on the bridge. Only the TIPS brings the portal pressure down, and it does so at the liver\'s cost.',
      notes: 'The order of care for a bleed that will not stop: recognize failure (uncontrolled bleeding or a rebleed within 5 days), keep the circulation up without over-filling it, bridge with a covered esophageal stent or a balloon, and place a rescue TIPS without waiting for a score to decide. Prevent encephalopathy, and assess transplant candidacy at once.',
      ask: ['Put these in order: rescue TIPS, covered stent or balloon, recognizing treatment failure, lactulose.', 'Recognize failure, bridge with a stent or balloon, place the TIPS, then lactulose or rifaximin against encephalopathy.'],
    },
  ],
};
