// Presenter talk: portosystemic shunting and hepatic encephalopathy, from first-pass clearance to a large spontaneous
// shunt and its embolization, and the stent width and rifaximin that lower encephalopathy after a TIPS
// (the slide fields are described at the top of decks.js).

const STENT = { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' };
// One flows card runs through the talk. The encephalopathy risk index sits beside the PPG up to the spontaneous shunts; after a TIPS the index is
// already High at any stent width (it counts the shunted share of the portal blood, near 94% from 6 to 12 mm), so the stent slides read the liver's share of flow.
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
      line: 'Colored by origin, gut and spleen blood fills the sinusoids, so the liver clears what the gut absorbs, and {shunt} of the portal blood bypasses it.',
      notes: 'The model has no ammonia or brain; the share of portal blood that skips the liver, scaled by cirrhosis, stands in for the risk (the encephalopathy risk tile, an index and not a clinical score). Gut bacteria and the breakdown of protein make ammonia, which reaches the liver in portal blood. Periportal hepatocytes turn it into urea, and perivenous hepatocytes take up what is left as glutamine. Blood that skips the liver skips both steps, and the ammonia reaches the brain.',
      ask: ['A young adult with a normal liver and a congenital portosystemic shunt is confused. Why?', 'Gut blood reaches the brain without passing through the liver, which would have cleared its ammonia.'],
    },
    {
      id: 'collat', preset: 'cirr-decomp', cam: 'fit', lens: 'origin', sites: ['split'], tool: FLOWS, data: 'tiles', tiles: ['he', 'ppg'], key: ['he'], delta: 'firstpass',
      kicker: 'Collaterals', site: 'sin', title: 'Collaterals carry gut blood around a scarred liver',
      vignette: 'A 69-year-old taxi driver with hepatitis C cirrhosis, cured 2 years ago, has had two minor car crashes this year. His wife finds him slower, and EGD shows large varices.',
      line: 'Colored by origin, collaterals now carry {shunt} of the portal blood around the liver, and the scarred liver clears less of what still reaches it.',
      notes: 'Covert encephalopathy shows only on testing, as slower thinking and slower reactions. It does not count as decompensation, but it predicts overt encephalopathy and car crashes. A single test, such as animal naming, is enough to find it, and lactulose treats it. Ask about driving, and look for a precipitant.',
      ask: ['He drives a taxi. What do you test, and what do you start?', 'One test for covert encephalopathy, such as animal naming; lactulose if it is abnormal; and advice not to drive until it improves.'],
    },
    {
      id: 'trigger', cam: 'fit', lens: 'origin', sites: ['split'], data: 'tiles', tiles: ['he', 'ppg'], key: ['he'],
      tool: { kind: 'criteria', title: 'Look first for', short: 'Triggers', ticks: false, lead: 'Treating them comes first.', rows: ['Infection or bleeding', 'Constipation or missed lactulose', 'Sedatives or opioids', 'Low sodium or potassium, or dehydration'] },
      kicker: 'Overt encephalopathy', site: 'sin', title: 'Overt encephalopathy: the trigger first, then lactulose, then rifaximin',
      line: 'Plain confusion at the bedside is overt encephalopathy. Find and treat the trigger, give lactulose to two or three soft stools a day, and add rifaximin after a recurrence.',
      notes: 'The model has no ammonia or brain, so it cannot show a trigger or a drug; the risk index stays as on the last slide. Source: Baveno VIII 6.16, 6.17. The triggers are infection or bleeding, constipation or missed lactulose, sedatives or opioids, and low sodium or potassium or dehydration. Treating them comes first, and often settles the episode. Lactulose goes to two or three soft stools a day, and rifaximin is added after a recurrence. Baveno VIII 6.16 considers rifaximin before an elective TIPS, and 6.17 keeps narrowing the stent or closing a shunt for encephalopathy that persists after the triggers are removed and the drugs given. The order of treatment is the deck\'s own teaching; the Baveno VIII statements name the triggers without listing them.',
      ask: ['A man on diuretics becomes confused. What do you do first?', 'Look for the trigger: infection, bleeding, constipation, sedatives, or low sodium or potassium. Then lactulose, and rifaximin after a recurrence.'],
    },
    {
      id: 'srs', preset: 'cirr-decomp', params: { spontaneous: { C6: true }, diuretics: false }, days: 30, cam: 'splenic', lens: 'origin', mark: { edges: ['C6'], label: 'Splenorenal shunt', kind: 'note' },
      tool: FLOWS, data: 'tiles', tiles: ['he', 'ppg'], key: ['he'], delta: 'collat',
      kicker: 'Spontaneous shunts', site: 'sin', title: 'A large splenorenal shunt keeps encephalopathy coming back',
      vignette: 'A 58-year-old man with hepatitis B cirrhosis on entecavir has been admitted four times in 8 months with confusion while taking lactulose and rifaximin. He has no ascites or varices.',
      line: 'Colored by origin, the splenic blood now runs away from the liver into the shunt, and flow through the liver falls to {liver}.',
      notes: 'Overt encephalopathy is treated in order: find and treat the precipitant, give lactulose to two or three soft stools a day, and add rifaximin after a recurrence. When it keeps coming back despite both, look for a large spontaneous shunt on contrast CT or MRI. A large shunt lowers the portal pressure but sends gut blood straight to the systemic veins. The bars show the splenorenal shunt carrying the portal blood, and flow in the splenic vein running away from the liver.',
      ask: ['Four admissions despite lactulose and rifaximin. What do you look for?', 'Missed precipitants first, then a large spontaneous shunt on contrast CT or MRI.'],
    },
    {
      id: 'embolize', params: { occluded: { C6: true } }, days: 60, lapse: { seconds: 7, from: 'Shunt closed', to: 'Two months later' }, cam: 'fit', lens: 'flow', mark: { edges: ['C6'], label: 'Splenorenal shunt', kind: 'note' }, tool: FLOWS, data: 'tiles', tiles: ['he', 'ppg'], key: ['ppg'], delta: 'srs',
      compare: [{ label: 'Shunt open', short: 'Open', params: { occluded: { C6: false } } }, { label: 'Shunt embolized', short: 'Embolized', own: true }],
      kicker: 'Spontaneous shunts', site: 'sin', title: 'Closing the shunt brings the portal pressure back',
      line: 'Colored by flow, the shunt empties once it is embolized and portal blood returns to the liver. Two months on, the PPG is {ppg} and {asc} of ascites has formed.',
      notes: 'In the model the varices fill as soon as the shunt closes and the ascites gathers within days; in patients the varices grow over weeks to months and the ascites builds more slowly. Embolization closes the shunt from the left renal vein with coils, a plug or a sclerosant. Baveno VIII advises it for recurrent or persistent encephalopathy despite drug treatment, above all when liver function is preserved; results are best with a low MELD and no liver cancer. Closing a large shunt raises the portal pressure. In some patients new or larger varices or ascites follow, and some bleed. An endoscopy and an ultrasound follow the embolization, and varices that grow are treated as in any cirrhosis.',
      ask: ['Who is a good candidate for embolization, and what do you check afterwards?', 'Recurrent or persistent encephalopathy despite lactulose and rifaximin, a large shunt on imaging, and good liver function with a low MELD. Afterwards, varices on endoscopy and ascites on ultrasound, because the portal pressure rises.'],
    },
    {
      id: 'tips', preset: 'cirr-decomp', params: { tips: { on: true, d: 8 } }, cam: 'liver', lens: 'origin', sites: ['split'], mark: STENT, tool: FLOWS,
      compare: [{ label: '8 mm', own: true, params: { tips: { on: true, d: 8 } } }, { label: '10 mm', params: { tips: { on: true, d: 10 } } }],
      data: 'tiles', tiles: ['liver', 'ppg'], key: ['liver'],
      kicker: 'After TIPS', site: 'sin', title: 'A wider stent takes more portal blood from the liver',
      vignette: 'A 70-year-old man with alcohol-associated cirrhosis, sober for 2 years, has bled again from esophageal varices despite banding and carvedilol and is booked for a TIPS. He has never been confused.',
      line: 'Colored by origin, gut blood runs through the 8 mm stent, which brings the PPG to {ppg}, under the {<12 mmHg} target, and leaves the liver {liver} of its flow.',
      notes: 'The model\'s encephalopathy risk tile is already High at any stent width, so this slide reads the liver\'s share of flow: the wider stent leaves the liver less. Overt encephalopathy follows a TIPS in about a third of patients; older age, earlier encephalopathy, a wider stent and poorer liver function raise the risk. In a randomized trial, 8 mm stents caused less encephalopathy than 10 mm ones without more rebleeding, so the narrowest stent that reaches the target gradient is preferred. In another trial, rifaximin started 14 days before a TIPS lowered overt encephalopathy, and Baveno VIII advises considering it before an elective TIPS. In the US the tablet is 550 mg, and this use is off-label.',
      ask: ['He has never been confused. What lowers his risk of encephalopathy after the TIPS?', 'The narrowest stent that reaches the target gradient, and rifaximin started about 2 weeks before.'],
    },
    {
      id: 'narrow', question: 'Will a narrower stent bring the confusion down?', params: { tips: { on: true, d: 6 } }, cam: 'liver', mark: STENT, tool: FLOWS, data: 'tiles', tiles: ['liver', 'ppg'], key: ['liver'], delta: 'tips',
      compare: [{ label: '8 mm', params: { tips: { on: true, d: 8 } } }, { label: 'Narrowed to 6 mm', short: '6 mm', own: true, params: { tips: { on: true, d: 6 } } }, { label: 'Occluded', params: { tips: { on: false } } }],
      kicker: 'After TIPS', site: 'sin', title: 'When encephalopathy persists, narrow the stent',
      line: 'Narrowing the stent gives the liver back portal blood, and the PPG climbs toward the level the TIPS was placed to treat.',
      notes: 'Encephalopathy that persists after a TIPS despite lactulose and rifaximin can be treated by narrowing the stent, with a smaller stent placed inside it, or by closing it. If a large spontaneous shunt is also found, embolizing it is another option. Either way, some of the portal pressure the TIPS was placed to lower comes back.',
      ask: ['What does narrowing the stent cost?', 'The portal pressure rises, so the ascites or bleeding the TIPS treated can come back.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['he', 'shunt', 'liver', 'ppg'], asc: false, rowHead: 'Patient',
      of: [{ id: 'firstpass', kicker: 'Reference', title: 'Healthy' }, { id: 'collat', kicker: 'Cirrhosis', title: 'Collaterals', ref: true }, { id: 'srs', kicker: 'Spontaneous', title: 'Splenorenal shunt', vs: 'collat' },
        { id: 'embolize', kicker: 'Spontaneous', title: 'Shunt embolized', vs: 'srs' }, { id: 'tips', kicker: 'TIPS', title: 'TIPS, 8 mm', vs: 'collat' },
        { preset: 'cirr-decomp', params: { tips: { on: true, d: 10 } }, kicker: 'TIPS', title: 'TIPS, 10 mm', vs: 'tips' }],
      kicker: 'Summary', title: 'Every shunt trades a lower gradient for less liver flow',
      line: 'The more portal blood skips the liver, the lower the gradient and the higher the risk of encephalopathy.',
      notes: 'Every shunt, spontaneous or placed, lowers the gradient by sending portal blood around the liver, and the brain receives what the liver did not clear. Closing or narrowing a shunt reverses the trade. Treat the precipitant and give lactulose and rifaximin first; turn to the shunt only when encephalopathy keeps coming back.',
      ask: ['What does every portosystemic shunt trade?', 'A lower portal gradient for less portal blood through the liver, and more encephalopathy.'],
    },
  ],
};
