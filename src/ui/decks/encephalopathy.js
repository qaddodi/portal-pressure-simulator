// Presenter talk: portosystemic shunting and hepatic encephalopathy, from first-pass clearance to a large spontaneous
// shunt and its embolization, and the stent width and rifaximin that lower encephalopathy after a TIPS
// (the slide fields are described at the top of decks.js).

const STENT = { edges: ['TIPS'], label: 'Covered stent', kind: 'treat' };

export const ENCEPHALOPATHY = {
  id: 'encephalopathy', level: 'core', title: 'Encephalopathy and shunting', minutes: 10,
  objectives: [
    'Explain how portosystemic shunting lets gut blood reach the brain without passing the liver',
    'Recognize when to look for a large spontaneous shunt, and what closing it costs',
    'Choose the stent width and the drug that lower encephalopathy after a TIPS',
    'Treat overt encephalopathy in order: the precipitant, lactulose, then rifaximin',
  ],
  checks: [
    ['How is covert encephalopathy found and treated?', 'With one test, such as animal naming, and lactulose if the test is abnormal.'],
    ['Who needs a CT or MRI to look for a large spontaneous shunt?', 'A patient whose encephalopathy keeps coming back despite lactulose, rifaximin and treatment of every precipitant.'],
    ['What does embolizing a spontaneous shunt cost?', 'The portal pressure rises, so varices and ascites can grow.'],
    ['Name the two choices that lower encephalopathy after an elective TIPS.', 'The narrowest stent that reaches the target gradient, and rifaximin started about 2 weeks before.'],
  ],
  summary: 'How shunted gut blood reaches the brain: covert encephalopathy, a large splenorenal shunt and what closing it costs, and the stent width and rifaximin that lower encephalopathy after a TIPS.',
  slides: [
    {
      id: 'firstpass', preset: 'healthy', cam: 'liver', lens: 'origin', sites: ['split'], data: 'tiles', tiles: ['shunt', 'liver'], key: ['shunt'],
      kicker: 'First pass', site: 'sin', title: 'In health, all gut blood passes through the liver',
      line: 'Colored by origin, gut and spleen blood fills the sinusoids, so the liver clears what the gut absorbs, and {shunt} of the portal blood bypasses it.',
      caveat: 'The model has no ammonia or brain; the share of portal blood that skips the liver stands in for the risk.',
      notes: 'Gut bacteria and the breakdown of protein make ammonia, which reaches the liver in portal blood. Periportal hepatocytes turn it into urea, and perivenous hepatocytes take up what is left as glutamine. Blood that skips the liver skips both steps, and the ammonia reaches the brain.',
      ask: ['A young adult with a normal liver and a congenital portosystemic shunt is confused. Why?', 'Gut blood reaches the brain without passing through the liver, which would have cleared its ammonia.'],
    },
    {
      id: 'collat', preset: 'cirr-decomp', cam: 'fit', lens: 'origin', sites: ['split'], data: 'tiles', tiles: ['shunt', 'liver'], key: ['shunt'], delta: 'firstpass',
      kicker: 'Collaterals', site: 'sin', title: 'Collaterals carry gut blood around a scarred liver',
      vignette: 'A 69-year-old taxi driver with hepatitis C cirrhosis, cured 2 years ago, has had two minor car crashes this year. His wife finds him slower, and EGD shows large varices.',
      line: 'Colored by origin, collaterals now carry {shunt} of the portal blood around the liver, and the scarred liver clears less of what still reaches it.',
      notes: 'Covert encephalopathy shows only on testing, as slower thinking and slower reactions. It does not count as decompensation, but it predicts overt encephalopathy and car crashes. A single test, such as animal naming, is enough to find it, and lactulose treats it. Ask about driving, and look for a precipitant.',
      ask: ['He drives a taxi. What do you test, and what do you start?', 'One test for covert encephalopathy, such as animal naming; lactulose if it is abnormal; and advice not to drive until it improves.'],
    },
    {
      id: 'srs', preset: 'cirr-decomp', params: { spontaneous: { C6: true }, diuretics: false }, days: 30, cam: 'splenic', lens: 'direction', mark: { edges: ['C6'], label: 'Splenorenal shunt', kind: 'note' },
      tool: { kind: 'doppler', vessel: 'SV_CONF' }, data: 'tiles', tiles: ['liver', 'ppg'], key: ['liver'], delta: 'collat',
      kicker: 'Spontaneous shunts', site: 'sin', title: 'A large splenorenal shunt keeps encephalopathy coming back',
      vignette: 'A 58-year-old man with hepatitis B cirrhosis on entecavir has been admitted four times in 8 months with confusion while taking lactulose and rifaximin. He has no ascites or varices.',
      line: 'Colored by direction, the portal and splenic veins now run away from the liver into the shunt, and flow through the liver falls to {liver}.',
      causesHead: 'Look first for', causes: ['Infection or bleeding', 'Constipation or missed lactulose', 'Sedatives or opioids', 'Low sodium or potassium, or dehydration'],
      notes: 'Overt encephalopathy is treated in order: find and treat the precipitant, give lactulose to two or three soft stools a day, and add rifaximin after a recurrence. When it keeps coming back despite both, look for a large spontaneous shunt on contrast CT or MRI. A large shunt lowers the portal pressure but sends gut blood straight to the systemic veins, and the Doppler in the splenic vein shows its flow running away from the liver.',
      ask: ['Four admissions despite lactulose and rifaximin. What do you look for?', 'Missed precipitants first, then a large spontaneous shunt on contrast CT or MRI.'],
    },
    {
      id: 'embolize', cam: 'fit', lens: 'flow', mark: { edges: ['C6'], label: 'Splenorenal shunt', kind: 'note' }, data: 'tiles', tiles: ['liver', 'ppg'], key: ['liver'],
      compare: [{ label: 'Shunt open', own: true, params: { occluded: { C6: false } } }, { label: 'Shunt embolized', short: 'Embolized', params: { occluded: { C6: true } } }],
      kicker: 'Spontaneous shunts', site: 'sin', title: 'Closing the shunt sends blood back through the liver',
      line: 'Colored by flow, the shunt empties once it is embolized, and portal blood returns to the liver as the PPG climbs.',
      caveat: 'In the model the varices fill as soon as the shunt closes; in patients they grow over weeks to months.',
      notes: 'Embolization closes the shunt from the left renal vein with coils, a plug or a sclerosant. Baveno VIII advises it for recurrent or persistent encephalopathy despite drug treatment, above all when liver function is preserved; results are best with a low MELD and no liver cancer.',
      ask: ['Who is a good candidate for embolization?', 'Recurrent or persistent encephalopathy despite lactulose and rifaximin, a large shunt on imaging, and good liver function with a low MELD.'],
    },
    {
      id: 'price', params: { occluded: { C6: true } }, days: 60, lapse: { seconds: 7, from: 'Shunt closed', to: 'Two months later' }, cam: 'fit',
      tool: { kind: 'flowtime', clock: 'days', lines: ['ppg', 'asc'] }, data: 'tiles', tiles: ['pv', 'asc', 'ppg'], key: ['asc'], delta: 'srs',
      kicker: 'Spontaneous shunts', site: 'sin', title: 'Closing the shunt brings the portal pressure back',
      line: 'The PPG rises as soon as the shunt closes. Two months later it is {ppg}, and {asc} of ascites has formed.',
      caveat: 'In the model the ascites gathers within days of the shunt closing; in patients it builds up more slowly.',
      notes: 'Closing a large shunt raises the portal pressure. In some patients new or larger varices or ascites follow, and some bleed. An endoscopy and an ultrasound follow the embolization, and varices that grow are treated as in any cirrhosis.',
      ask: ['What do you check after a shunt is closed?', 'Varices on endoscopy and ascites on ultrasound, because the portal pressure rises.'],
    },
    {
      id: 'tips', preset: 'cirr-decomp', params: { tips: { on: true, d: 8 } }, cam: 'liver', lens: 'origin', sites: ['split'], mark: STENT,
      compare: [{ label: '8 mm', own: true, params: { tips: { on: true, d: 8 } } }, { label: '10 mm', params: { tips: { on: true, d: 10 } } }],
      data: 'tiles', tiles: ['ppg', 'liver'], key: ['liver'],
      kicker: 'After TIPS', site: 'sin', title: 'A wider stent takes more portal blood from the liver',
      vignette: 'A 70-year-old man with alcohol-associated cirrhosis, sober for 2 years, has bled again from esophageal varices despite banding and carvedilol and is booked for a TIPS. He has never been confused.',
      line: 'Colored by origin, gut blood runs through the 8 mm stent, which brings the PPG to {ppg}, under the {<12 mmHg} target, and leaves the liver {liver} of its flow.',
      notes: 'Overt encephalopathy follows a TIPS in about a third of patients; older age, earlier encephalopathy, a wider stent and poorer liver function raise the risk. In a randomized trial, 8 mm stents caused less encephalopathy than 10 mm ones without more rebleeding, so the narrowest stent that reaches the target gradient is preferred. In another trial, rifaximin started 14 days before a TIPS lowered overt encephalopathy, and Baveno VIII advises considering it before an elective TIPS. In the US the tablet is 550 mg, and this use is off-label.',
      ask: ['He has never been confused. What lowers his risk of encephalopathy after the TIPS?', 'The narrowest stent that reaches the target gradient, and rifaximin started about 2 weeks before.'],
    },
    {
      id: 'narrow', cam: 'liver', mark: STENT, data: 'tiles', tiles: ['liver', 'ppg'], key: ['ppg'],
      compare: [{ label: '8 mm', own: true, params: { tips: { on: true, d: 8 } } }, { label: 'Narrowed to 6 mm', short: '6 mm', params: { tips: { on: true, d: 6 } } }, { label: 'Occluded', params: { tips: { on: false } } }],
      kicker: 'After TIPS', site: 'sin', title: 'When encephalopathy persists, narrow the stent',
      line: 'Narrowing the stent gives the liver back portal blood, and the PPG climbs toward the level the TIPS was placed to treat.',
      notes: 'Encephalopathy that persists after a TIPS despite lactulose and rifaximin can be treated by narrowing the stent, with a smaller stent placed inside it, or by closing it. If a large spontaneous shunt is also found, embolizing it is another option. Either way, some of the portal pressure the TIPS was placed to lower comes back.',
      ask: ['What does narrowing the stent cost?', 'The portal pressure rises, so the ascites or bleeding the TIPS treated can come back.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['shunt', 'liver', 'ppg'], asc: false, rowHead: 'Patient',
      of: [{ id: 'firstpass', kicker: 'Reference', title: 'Healthy' }, { id: 'collat', kicker: 'Cirrhosis', title: 'Collaterals', ref: true }, { id: 'srs', kicker: 'Spontaneous', title: 'Splenorenal shunt', vs: 'collat' },
        { id: 'price', kicker: 'Spontaneous', title: 'Shunt embolized', vs: 'srs' }, { id: 'tips', kicker: 'TIPS', title: 'TIPS, 8 mm', vs: 'collat' },
        { preset: 'cirr-decomp', params: { tips: { on: true, d: 10 } }, kicker: 'TIPS', title: 'TIPS, 10 mm', vs: 'tips' }],
      kicker: 'Summary', title: 'Every shunt trades a lower gradient for less liver flow',
      line: 'The more portal blood skips the liver, the lower the gradient and the higher the risk of encephalopathy.',
      notes: 'Every shunt, spontaneous or placed, lowers the gradient by sending portal blood around the liver, and the brain receives what the liver did not clear. Closing or narrowing a shunt reverses the trade. Treat the precipitant and give lactulose and rifaximin first; turn to the shunt only when encephalopathy keeps coming back.',
      ask: ['What does every portosystemic shunt trade?', 'A lower portal gradient for less portal blood through the liver, and more encephalopathy.'],
    },
  ],
};
