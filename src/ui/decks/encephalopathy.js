// Presenter talk: portosystemic shunting and hepatic encephalopathy, from first-pass clearance to a large spontaneous
// shunt and its embolization, and the stent width and rifaximin that lower encephalopathy after a TIPS
// (the slide fields are described at the top of decks.js).

const STENT = { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' };
// One flows card runs through the talk. The encephalopathy risk index sits beside the PPG up to the spontaneous shunts; after a TIPS the index is
// stays High at every stent width but still rises with it (0.75 at 6 mm to 0.84 at 12 mm), so the stent slides read the index and the liver's share of flow.
const FLOWS = { kind: 'flows' };

export const ENCEPHALOPATHY = {
  id: 'encephalopathy', level: 'core', title: 'Encephalopathy and shunting', minutes: 9,
  objectives: [
    'Explain how portosystemic shunting lets gut blood reach the brain without passing the liver',
    'Recognize when to look for a large spontaneous shunt, and what closing it costs',
    'Choose the stent width and the drug that lower encephalopathy after a TIPS',
    'Look for the precipitant and treat the encephalopathy first, and narrow a stent only if it persists',
  ],
  checks: [
    ['How is covert encephalopathy found and treated?', 'With one test, such as animal naming, and lactulose if the test is abnormal.'],
    ['Who needs a CT or MRI to look for a large spontaneous shunt, and what does closing it cost?', 'A patient whose encephalopathy keeps coming back despite lactulose, rifaximin and treatment of every precipitant. Closing the shunt raises the portal pressure, so varices and ascites can grow.'],
    ['Name the two choices that lower encephalopathy after an elective TIPS.', 'The narrowest stent that reaches the target gradient, and rifaximin started about 2 weeks before.'],
    ['After an 8 mm TIPS, most of the portal blood bypasses the liver and the patient becomes confused. What do you do first, and what is the last resort?', 'Look for a precipitant and treat it, give lactulose and add rifaximin. Narrow the stent only if the encephalopathy persists.'],
  ],
  summary: 'How shunted gut blood reaches the brain: covert encephalopathy, a large splenorenal shunt and what closing it costs, and the stent width and rifaximin that lower encephalopathy after a TIPS.',
  slides: [
    {
      id: 'firstpass', preset: 'healthy', cam: 'liver', scales: { lobule: {} }, lens: 'origin', sites: ['split'], tool: FLOWS, data: 'tiles', tiles: ['he', 'ppg'], key: ['he'],
      kicker: 'First pass', site: 'sin', title: 'In health, all gut blood passes through the liver',
      line: 'The liver clears what the gut absorbs, and none of the portal blood bypasses it.',
      notes: 'The model has no ammonia or brain; the share of portal blood that skips the liver, scaled by cirrhosis, stands in for the risk (the encephalopathy risk tile, an index and not a clinical score). Gut bacteria and the breakdown of protein make ammonia, which reaches the liver in portal blood. Periportal hepatocytes turn it into urea, and perivenous hepatocytes take up what is left as glutamine. Blood that skips the liver skips both steps, and the ammonia reaches the brain.',
      ask: ['A young adult with a normal liver and a congenital portosystemic shunt is confused. Why?', 'Gut blood reaches the brain without passing through the liver, which would have cleared its ammonia.'],
    },
    {
      id: 'collat', preset: 'cirr-decomp', cam: 'fit', lens: 'origin', sites: ['split'], tool: FLOWS, data: 'tiles', tiles: ['he', 'ppg'], key: ['he'], delta: 'firstpass',
      kicker: 'Collaterals', site: 'sin', title: 'Collaterals carry gut blood around a scarred liver',
      vignette: 'A 69-year-old taxi driver with hepatitis C cirrhosis, cured 2 years ago, has had two minor car crashes this year. His wife finds him slower, and EGD shows large varices.',
      line: 'Collaterals now carry {shunt} of the portal blood around the liver, and the scarred liver clears less of what still reaches it.',
      notes: 'Covert encephalopathy shows only on testing, as slower thinking and slower reactions. It does not count as decompensation, but it predicts overt encephalopathy and car crashes. A single test, such as animal naming, is enough to find it, and lactulose treats it. Ask about driving, and look for a precipitant.',
      ask: ['He drives a taxi. What do you test, and what do you start?', 'One test for covert encephalopathy, such as animal naming; lactulose if it is abnormal; and advice not to drive until it improves.'],
    },
    {
      id: 'grade', cam: 'fit', lens: 'origin', sites: ['split'], data: 'tiles', tiles: ['he', 'ppg'], key: ['he'],
      tool: { kind: 'criteria', title: 'West Haven grades', short: 'Grades', ticks: false,
        rows: ['**Covert**: minimal and grade 1, found by a test such as animal naming', '**Grade 2**: lethargy, disoriented in time, asterixis', '**Grade 3**: drowsy but rousable, disoriented in place', '**Grade 4**: coma'] },
      kicker: 'Overt encephalopathy', site: 'sin', title: 'Grade it at the bedside; ammonia is not needed',
      line: 'Grade it by West Haven at the bedside. Ammonia is not needed: a normal level argues against it, but a high one proves nothing.',
      notes: 'The model has no ammonia or brain; the risk index stays as on the last slide. Overt encephalopathy, grade 2 and above, is a clinical diagnosis: disorientation or asterixis in a patient with cirrhosis, once other causes are excluded. Covert encephalopathy, minimal and grade 1, is found only by testing, such as the animal naming test, the psychometric hepatic encephalopathy score or the Stroop app. A venous ammonia is not needed to diagnose or grade it and should not guide treatment; a normal value in a confused patient should prompt a search for another cause. Grade 3 and 4 need airway protection and a monitored bed. Lactulose by mouth or tube, titrated to two or three soft stools a day, is first line; polyethylene glycol, 4 L over 4 hours, resolved episodes faster than lactulose in trials and is an alternative.',
      ask: ['A confused patient with cirrhosis has a normal ammonia. Is it encephalopathy?', 'Possibly, but a normal ammonia argues against it: look harder for another cause, such as sepsis, a bleed in the head, drugs or low sodium.'],
    },
    {
      id: 'trigger', cam: 'fit', lens: 'origin', sites: ['split'], data: 'tiles', tiles: ['he', 'ppg'], key: ['he'],
      tool: { kind: 'criteria', title: 'Look first for', short: 'Triggers', ticks: false, rows: ['**Infection** or **bleeding**', '**Constipation** or missed **lactulose**', '**Sedatives** or **opioids**', '**Low sodium** or **potassium**, or **dehydration**'], verdict: 'Treating them comes first.' },
      kicker: 'Overt encephalopathy', site: 'sin', title: 'Treat the trigger before the ammonia',
      line: 'Plain confusion at the bedside is overt encephalopathy. Find and treat the trigger, give lactulose to two or three soft stools a day, and add rifaximin after a recurrence.',
      notes: 'The model has no ammonia or brain, so it cannot show a trigger or a drug; the risk index stays as on the last slide. Source: Baveno VIII 6.16, 6.17. The triggers are infection or bleeding, constipation or missed lactulose, sedatives or opioids, and low sodium or potassium or dehydration. Treating them comes first, and often settles the episode. Lactulose goes to two or three soft stools a day, and rifaximin is added after a recurrence. Baveno VIII 6.16 considers rifaximin before an elective TIPS, and 6.17 keeps narrowing the stent or closing a shunt for encephalopathy that persists after the triggers are removed and the drugs given. The order of treatment is the deck\'s own teaching; the Baveno VIII statements name the triggers without listing them.',
      ask: ['A man on diuretics becomes confused. What do you do first?', 'Look for the trigger: infection, bleeding, constipation, sedatives, or low sodium or potassium. Then lactulose, and rifaximin after a recurrence.'],
    },
    {
      id: 'srs', preset: 'cirr-decomp', params: { spontaneous: { C6: true }, diuretics: false }, days: 30, cam: 'splenic', lens: 'origin', mark: { edges: ['C6'], label: 'Splenorenal shunt', kind: 'note' },
      tool: FLOWS, data: 'tiles', tiles: ['he', 'ppg'], key: ['he'], delta: 'collat',
      kicker: 'Spontaneous shunts', site: 'sin', title: 'A large splenorenal shunt keeps encephalopathy coming back',
      vignette: 'A 58-year-old man with hepatitis B cirrhosis on entecavir has been admitted four times in 8 months with confusion while taking lactulose and rifaximin. He has no ascites or varices.',
      line: 'The splenic blood now runs away from the liver into the shunt, and flow through the liver falls to {liver}.',
      notes: 'Overt encephalopathy is treated in order: find and treat the precipitant, give lactulose to two or three soft stools a day, and add rifaximin after a recurrence. When it keeps coming back despite both, look for a large spontaneous shunt on contrast CT or MRI. L-ornithine-L-aspartate (LOLA) can also be considered for recurrent or persistent encephalopathy (Baveno VIII 6.13, weak). A large shunt lowers the portal pressure but sends gut blood straight to the systemic veins. The bars show the splenorenal shunt carrying the portal blood, and flow in the splenic vein running away from the liver.',
      ask: ['Four admissions despite lactulose and rifaximin. What do you look for?', 'Missed precipitants first, then a large spontaneous shunt on contrast CT or MRI.'],
    },
    {
      id: 'plug', params: { occluded: { C6: true } }, procedure: { kind: 'brto', target: 'C6' }, cam: 'fit', lens: 'flow', mark: { edges: ['C6'], label: 'Splenorenal shunt', kind: 'note' }, tool: FLOWS, data: 'tiles', tiles: ['he', 'ppg'], key: ['ppg'], delta: 'srs',
      kicker: 'Spontaneous shunts', site: 'sin', title: 'Embolization closes the splenorenal shunt',
      line: 'A catheter goes up the left renal vein into the shunt and plugs it. The PPG is {ppg} straight after, and the liver gets {liver} of normal flow.',
      notes: 'The shunt is closed from the left renal vein with coils, a plug or a sclerosant, here at the point where it joins the renal vein. Source: Baveno VIII 6.12 (strong). The next slide shows two months later.',
      ask: ['Where does the catheter close the splenorenal shunt?', 'From the left renal vein, with coils, a plug or a sclerosant, at the point where the shunt joins it (Baveno VIII 6.12).'],
    },
    {
      id: 'embolize', params: { occluded: { C6: true } }, days: 60, lapse: { seconds: 7, from: 'Shunt closed', to: 'Two months later' }, cam: 'fit', lens: 'flow', mark: { edges: ['C6'], label: 'Splenorenal shunt', kind: 'note' }, tool: FLOWS, data: 'tiles', tiles: ['he', 'ppg'], key: ['ppg'], delta: 'srs',
      kicker: 'Spontaneous shunts', site: 'sin', title: 'Closing the shunt brings the portal pressure back',
      line: 'Once the shunt is embolized, portal blood returns to the liver. Ascites or varices can return; here, two months on, the PPG is {ppg} and {asc} of ascites has formed.',
      notes: 'In the model the varices fill as soon as the shunt closes and the ascites gathers within days; in patients the varices grow over weeks to months and the ascites builds more slowly. Embolization closes the shunt from the left renal vein with coils, a plug or a sclerosant. Source: Baveno VIII 6.12 (strong): in recurrent or persistent encephalopathy despite optimal drug treatment, embolization of large portosystemic shunts should be considered, along with a discussion of transplant, particularly when liver function is preserved. Closing a large shunt raises the portal pressure. In some patients new or larger varices or ascites follow, and some bleed. An endoscopy and an ultrasound follow the embolization, and varices that grow are treated as in any cirrhosis.',
      ask: ['Who is a good candidate for embolization, and what do you check afterwards?', 'Recurrent or persistent encephalopathy despite optimal drug treatment, a large shunt on imaging and preserved liver function; transplant is discussed as well (Baveno VIII 6.12). Afterwards, varices on endoscopy and ascites on ultrasound, because the portal pressure rises.'],
    },
    {
      id: 'tips', preset: 'cirr-decomp', params: { tips: { on: true, d: 8 } }, cam: 'liver', lens: 'origin', sites: ['split'], mark: STENT, tool: FLOWS,
      compare: [{ label: '8 mm', own: true, params: { tips: { on: true, d: 8 } } }, { label: '10 mm', params: { tips: { on: true, d: 10 } } }],
      data: 'tiles', tiles: ['he', 'ppg'], key: ['he'],
      kicker: 'After TIPS', site: 'sin', title: 'A wider stent takes more portal blood from the liver',
      vignette: 'A 70-year-old man with alcohol-associated cirrhosis, sober for 2 years, has bled again from esophageal varices despite banding and carvedilol and is booked for a TIPS. He has never been confused.',
      line: 'The 8 mm stent brings the PPG to {ppg}, under the {<12 mmHg} target, and sinusoidal flow falls to {liver} of normal, mostly arterial now.',
      notes: 'The model\'s encephalopathy risk tile is High at both widths and rises with the stent; the wider stent also leaves the liver less sinusoidal flow. Overt encephalopathy follows a TIPS in about a third of patients; older age, earlier encephalopathy, a wider stent and poorer liver function raise the risk. In a randomized trial, 8 mm stents caused less encephalopathy than 10 mm ones without more rebleeding, so the narrowest stent that reaches the target gradient is preferred. In another trial, rifaximin started 14 days before a TIPS lowered overt encephalopathy, and Baveno VIII advises considering it before an elective TIPS (6.16). Before the TIPS, the history of overt encephalopathy and the encephalopathy drugs are assessed with care (6.14); an earlier episode is not an absolute contraindication, and the decision is made for the patient in front of you (6.15). In the US the tablet is 550 mg, and this use is off-label.',
      ask: ['He has never been confused. What lowers his risk of encephalopathy after the TIPS?', 'The narrowest stent that reaches the target gradient, and rifaximin started about 2 weeks before.'],
    },
    {
      id: 'narrow', question: 'Will a narrower stent bring the confusion down?', params: { tips: { on: true, d: 6 } }, cam: 'liver', mark: STENT, tool: FLOWS, data: 'tiles', tiles: ['he', 'ppg'], key: ['he'], delta: 'tips',
      kicker: 'After TIPS', site: 'sin', title: 'When encephalopathy persists, narrow the stent',
      line: 'Narrowing the stent gives the liver back portal blood, and the PPG climbs toward the level the TIPS was placed to treat.',
      notes: 'Encephalopathy that persists after a TIPS despite lactulose and rifaximin can be treated by narrowing the stent, with a smaller stent placed inside it, or by closing it. If a large spontaneous shunt is also found, embolizing it is another option. Baveno VIII 6.17 allows this as a weak recommendation (spontaneous shunt embolization, or reduction or occlusion of the TIPS). Either way, some of the portal pressure the TIPS was placed to lower comes back.',
      ask: ['What does narrowing the stent cost?', 'The portal pressure rises, so the ascites or bleeding the TIPS treated can come back.'],
    },
    {
      // (The relation chart before the summary: the same TIPS patient with a stent from 6 to 12 mm, the PPG and the liver's share of flow read against
      // the width. The model's encephalopathy index is High at every width and rises only a little, so the liver's flow is charted. The ring is 8 mm.)
      id: 'relation', preset: 'cirr-decomp', params: { tips: { on: true, d: 8 } }, cam: 'liver', mark: STENT,
      tool: { kind: 'curve', param: 'tips.d', from: 6, to: 12, step: 1, lines: ['ppg', 'liver'], cuts: [12] },
      kicker: 'Summary', site: 'sin', title: 'A wider stent lowers the PPG and takes more sinusoidal flow',
      line: 'At 8 mm the PPG is {ppg}, under the {<12 mmHg} target, and sinusoidal flow is {liver} of normal.',
      notes: 'Each point is the same patient with a stent of that width: the PPG falls and the liver keeps less of its flow as the stent widens. Baveno VIII advises the smallest diameter that works, to limit overshunting (encephalopathy, heart failure). The model\'s encephalopathy index rises with the width too, though it is High at every width here, so this chart reads the sinusoidal flow, which shows the change more plainly. The ring is the 8 mm stent. (Baveno VIII 6.5.)',
      ask: ['An 8 mm stent brings the PPG <12 mmHg. Why not widen it to 12 mm?', 'The PPG is already at target. A wider stent lowers it a little more and costs the liver more of its flow, with more encephalopathy.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['he', 'shunt', 'liver', 'ppg'], asc: false, rowHead: 'Patient',
      of: [{ id: 'firstpass', kicker: 'Reference', title: 'Healthy' }, { id: 'collat', kicker: 'Cirrhosis', title: 'Collaterals', ref: true }, { id: 'srs', kicker: 'Spontaneous', title: 'Splenorenal shunt', vs: 'collat' },
        { id: 'embolize', kicker: 'Spontaneous', title: 'Shunt embolized', vs: 'srs' }, { id: 'tips', kicker: 'TIPS', title: 'TIPS, 8 mm', vs: 'collat' },
        { preset: 'cirr-decomp', params: { tips: { on: true, d: 10 } }, kicker: 'TIPS', title: 'TIPS, 10 mm', vs: 'tips' }],
      kicker: 'Summary', title: 'Every shunt trades a lower gradient for less sinusoidal flow',
      line: 'The more portal blood skips the liver, the lower the gradient and the higher the risk of encephalopathy.',
      notes: 'Every shunt, spontaneous or placed, lowers the gradient by sending portal blood around the liver, and the brain receives what the liver did not clear. Closing or narrowing a shunt reverses the trade. Treat the precipitant and give lactulose and rifaximin first; turn to the shunt only when encephalopathy keeps coming back.',
      ask: ['What does every portosystemic shunt trade?', 'A lower portal gradient for less portal blood through the liver, and more encephalopathy.'],
    },
  ],
};
