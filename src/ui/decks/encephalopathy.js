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
    'Explain how portosystemic shunting lets splanchnic venous blood bypass hepatic clearance and reach the brain',
    'Recognize when to look for a large spontaneous portosystemic shunt, and the consequences of closing it',
    'Choose the stent diameter and the drug that lower the risk of hepatic encephalopathy (HE) after a TIPS',
    'Identify and treat the precipitant and the HE first, and reduce the stent diameter only if HE persists',
  ],
  checks: [
    ['How is covert HE diagnosed and treated?', 'With a single test, such as animal naming, and lactulose if the test is abnormal.'],
    ['Who needs a CT or MRI to look for a large spontaneous shunt, and what are the consequences of closing it?', 'A patient whose HE recurs despite lactulose, rifaximin and treatment of every precipitant. Closing the shunt raises the portal pressure, so varices and ascites can develop or worsen.'],
    ['Name the two choices that lower the risk of HE after an elective TIPS.', 'The narrowest stent that reaches the target gradient, and rifaximin started about 2 weeks before.'],
    ['After an 8 mm TIPS, most of the portal blood bypasses the liver and the patient develops overt HE. What do you do first, and what is the last resort?', 'Identify and treat the precipitant, give lactulose and add rifaximin. Reduce the stent diameter only if the HE persists.'],
  ],
  summary: 'How shunted splanchnic blood reaches the brain: covert HE, a large splenorenal shunt and the consequences of closing it, and the stent diameter and rifaximin that lower the risk of HE after a TIPS.',
  slides: [
    {
      id: 'firstpass', preset: 'healthy', cam: 'liver', scales: { lobule: {} }, lens: 'firstpass', sites: ['split'], tool: FLOWS, data: 'tiles', tiles: ['he', 'ppg'], key: ['he'],
      kicker: 'First pass', site: 'sin', title: 'In health, all portal venous blood passes through the liver',
      line: 'First-pass hepatic clearance removes what the intestine absorbs, and no portal blood bypasses the liver.',
      notes: 'In the first-pass view, orange is splanchnic venous blood that has not passed through the liver, teal is blood that has passed through the sinusoids, and a collateral, shunt or stent stays orange. It shows the path the blood took, not an ammonia level. The model has no ammonia or brain; the fraction of portal blood that bypasses the liver, scaled by the severity of cirrhosis, stands in for the risk (the encephalopathy risk tile, an index and not a clinical score). Intestinal bacteria and protein catabolism produce ammonia, which reaches the liver in portal blood. Periportal hepatocytes convert it to urea, and perivenous hepatocytes convert the remainder to glutamine. Blood that bypasses the liver escapes both steps, and the ammonia reaches the brain.',
      ask: ['A young adult with a normal liver and a congenital portosystemic shunt is confused. Why?', 'Portal venous blood reaches the brain without passing through the liver, which would have cleared its ammonia.'],
    },
    {
      id: 'collat', preset: 'cirr-decomp', cam: 'fit', lens: 'firstpass', sites: ['split'], tool: FLOWS, data: 'tiles', tiles: ['he', 'ppg'], key: ['he'], delta: 'firstpass',
      kicker: 'Collaterals', site: 'sin', title: 'Portosystemic collaterals divert portal blood around the cirrhotic liver',
      vignette: 'A 69-year-old taxi driver with hepatitis C cirrhosis, cured 2 years ago, has had two minor car crashes this year. His wife notices that he is slower, and EGD shows large varices.',
      line: 'Collaterals now carry {shunt} of the portal blood around the liver, and the cirrhotic liver clears less of what still reaches it.',
      notes: 'Covert HE is detectable only on testing, as psychomotor slowing and longer reaction times. It does not count as decompensation, but it predicts overt HE and motor vehicle crashes. A single test, such as animal naming, is enough to detect it, and lactulose treats it. Ask about driving, and look for a precipitant.',
      ask: ['He drives a taxi. What do you test, and what do you start?', 'One test for covert HE, such as animal naming; lactulose if it is abnormal; and advice not to drive until it improves.'],
    },
    {
      id: 'grade', cam: 'fit', lens: 'firstpass', sites: ['split'], data: 'tiles', tiles: ['he', 'ppg'], key: ['he'],
      tool: { kind: 'criteria', title: 'West Haven grades', short: 'Grades', ticks: false,
        rows: ['**Covert**: minimal and grade 1, detected by a test such as animal naming', '**Grade 2**: lethargy, disorientation to time, asterixis', '**Grade 3**: somnolent but arousable, disorientation to place', '**Grade 4**: coma'] },
      kicker: 'Overt encephalopathy', site: 'sin', title: 'Grade overt HE clinically; an ammonia level is not needed',
      line: 'The West Haven criteria grade it at the bedside. A normal ammonia level argues against HE, but a high one does not confirm it.',
      notes: 'The model has no ammonia or brain; the risk index stays as on the last slide. Overt HE, grade 2 or higher, is a clinical diagnosis: disorientation or asterixis in a patient with cirrhosis, once other causes are excluded. Covert HE, minimal and grade 1, is detected only by testing, such as the animal naming test, the psychometric hepatic encephalopathy score (PHES) or the EncephalApp Stroop. A venous ammonia level is not needed to diagnose or grade HE and should not guide treatment; a normal value in a confused patient should prompt a search for another cause. Grades 3 and 4 need airway protection and ICU-level monitoring. Lactulose orally or by nasogastric tube, titrated to two or three soft bowel movements a day, is first line.',
      ask: ['A confused patient with cirrhosis has a normal ammonia level. Is it HE?', 'Possibly, but a normal ammonia argues against it: look harder for another cause, such as sepsis, intracranial hemorrhage, drugs or hyponatremia.'],
    },
    {
      id: 'trigger', cam: 'fit', lens: 'firstpass', sites: ['split'], data: 'tiles', tiles: ['he', 'ppg'], key: ['he'],
      tool: { kind: 'criteria', title: 'Look first for', short: 'Precipitants', ticks: false, rows: ['**Infection** or **GI bleeding**', '**Constipation** or missed **lactulose**', '**Sedatives** or **opioids**', '**Hyponatremia** or **hypokalemia**, or **dehydration**'], verdict: 'Treating them comes first.' },
      kicker: 'Overt encephalopathy', site: 'sin', title: 'Treat the precipitant first',
      line: 'Clinically apparent confusion in cirrhosis is overt HE. Identify and treat the precipitant, titrate lactulose to two or three soft bowel movements a day, and add rifaximin after a recurrence.',
      notes: 'The model has no ammonia or brain, so it cannot show a precipitant or a drug; the risk index stays as on the last slide. Source: Baveno VIII 6.16, 6.17. The precipitants are infection or GI bleeding, constipation or missed lactulose, sedatives or opioids, and hyponatremia, hypokalemia or dehydration. Treating them comes first, and often resolves the episode. Lactulose is titrated to two or three soft bowel movements a day, and rifaximin is added after a recurrence. Baveno VIII 6.16 considers rifaximin before an elective TIPS, and 6.17 reserves reducing the stent diameter or closing a shunt for HE that persists after the precipitants are removed and the drugs given. The order of treatment is the deck\'s own teaching; the Baveno VIII statements refer to precipitants without listing them.',
      ask: ['A man on diuretics becomes confused. What do you do first?', 'Look for the precipitant: infection, GI bleeding, constipation, sedatives, or hyponatremia or hypokalemia. Then lactulose, and rifaximin after a recurrence.'],
    },
    {
      id: 'srs', preset: 'cirr-decomp', params: { spontaneous: { C6: true }, diuretics: false }, days: 30, cam: ['splenic', 'portal'], lens: 'firstpass',
      marks: [{ edges: ['C6'], label: 'Splenorenal shunt', kind: 'note' }, { edges: ['PV_TRUNK'], label: 'Portal vein, near stasis', kind: 'note' }],
      tool: FLOWS, data: 'tiles', tiles: ['he', 'ppg', 'pvVel'], key: ['he'], delta: 'collat',
      kicker: 'Spontaneous shunts', site: 'sin', title: 'A large splenorenal shunt causes recurrent HE',
      vignette: 'A 58-year-old man with hepatitis B cirrhosis on entecavir has been admitted four times in 8 months with overt hepatic encephalopathy despite lactulose and rifaximin. He has no ascites or varices.',
      line: 'Splenic venous flow is now hepatofugal, into the shunt, so hepatic sinusoidal flow falls to {liver} and portal venous flow is near stasis.',
      notes: 'Overt HE is treated in order: identify and treat the precipitant, titrate lactulose to two or three soft bowel movements a day, and add rifaximin after a recurrence. When HE recurs despite both drugs, look for a large spontaneous portosystemic shunt on contrast-enhanced CT or MRI. L-ornithine-L-aspartate (LOLA) can also be considered for recurrent or persistent HE (Baveno VIII 6.13, weak). A large shunt lowers the portal pressure but diverts splanchnic venous blood directly into the systemic circulation. The bars show the splenorenal shunt carrying the portal blood, with hepatofugal flow in the splenic vein; the liver still receives about a third of its normal flow. The Doppler tile shows the main portal vein near stasis, a mean velocity of about −3 cm/s. The model calls any velocity <9 cm/s stasis, and the stagnant-flow warning appears. Slow portal flow is a known risk factor for portal vein thrombosis: Zocco 2009 (J Hepatol 51:682) found that a portal velocity <15 cm/s predicted it. That link, and the idea that a large spontaneous shunt diverts the flow that keeps the portal vein patent, are not stated in the Baveno VIII or AASLD guidance, so the slide shows only the velocity and leaves the thrombosis risk to this note.',
      ask: ['Four admissions despite lactulose and rifaximin. What do you look for?', 'Missed precipitants first, then a large spontaneous portosystemic shunt on contrast-enhanced CT or MRI.'],
    },
    {
      id: 'plug', params: { occluded: { C6: true } }, procedure: { kind: 'brto', target: 'C6' }, cam: 'fit', lens: 'flow', mark: { edges: ['C6'], label: 'Splenorenal shunt', kind: 'note' }, tool: { kind: 'evgraph', title: 'PPG and encephalopathy risk after embolization' }, data: 'tiles', tiles: ['he', 'ppg'], key: ['ppg'], delta: 'srs',
      kicker: 'Spontaneous shunts', site: 'sin', title: 'Embolization closes the splenorenal shunt',
      line: 'Via the left renal vein, the shunt is catheterized and occluded. Immediately afterward the portal pressure gradient (PPG) is {ppg}, and hepatic flow is {liver} of normal.',
      notes: 'The shunt is occluded via the left renal vein with coils, a vascular plug or a sclerosant, here at its junction with the renal vein. Source: Baveno VIII 6.12 (strong). The next slide shows the state two months later.',
      ask: ['From which vein is the splenorenal shunt occluded?', 'The left renal vein, with coils, a vascular plug or a sclerosant, at the junction of the shunt with the renal vein (Baveno VIII 6.12).'],
    },
    {
      id: 'embolize', params: { occluded: { C6: true } }, days: 60, lapse: { seconds: 7, from: 'Shunt closed', to: 'Two months later' }, cam: 'fit', lens: 'flow', mark: { edges: ['C6'], label: 'Splenorenal shunt', kind: 'note' }, tool: { kind: 'flowtime', clock: 'days', lines: ['ppg', 'he'], keepTiles: true, title: 'PPG and encephalopathy risk over two months' }, data: 'tiles', tiles: ['he', 'ppg'], key: ['ppg'], delta: 'srs',
      kicker: 'Spontaneous shunts', site: 'sin', title: 'Closing the shunt raises the portal pressure again',
      line: 'Once the shunt is embolized, portal blood returns to the liver. Ascites or varices can develop; here, two months later, the PPG is {ppg} and {asc} of ascites has formed.',
      notes: 'In the model the varices enlarge as soon as the shunt closes and ascites accumulates within days; in patients varices enlarge over weeks to months and ascites accumulates more slowly. Embolization occludes the shunt via the left renal vein with coils, a vascular plug or a sclerosant. Source: Baveno VIII 6.12 (strong): in recurrent or persistent HE despite optimal drug treatment, embolization of large portosystemic shunts should be considered, along with a discussion of liver transplantation, particularly when liver function is preserved. Closing a large shunt raises the portal pressure. In some patients new or larger varices or ascites develop, and some bleed. EGD and abdominal ultrasound follow the embolization, and enlarging varices are treated as in any cirrhosis.',
      ask: ['Who is a good candidate for embolization, and what do you check afterward?', 'Recurrent or persistent HE despite optimal drug treatment, a large shunt on imaging and preserved liver function; liver transplantation is discussed as well (Baveno VIII 6.12). Afterward, EGD for varices and ultrasound for ascites, because the portal pressure rises.'],
    },
    {
      id: 'embolize-flows', lens: 'flow', cam: 'fit', tool: FLOWS, data: 'tiles', tiles: ['he', 'ppg'], key: ['ppg'], delta: 'srs',
      kicker: 'Spontaneous shunts', site: 'sin', title: 'Closing the shunt sends portal blood back to the liver',
      line: 'The flow distribution shows more portal blood reaching the liver and less bypassing it through shunts.',
      notes: 'The same patient as the slide before, two months after the shunt was closed. The card splits the portal blood into what reaches the liver and what bypasses it through shunts.',
      ask: ['After the shunt closes, where does the extra portal blood go?', 'To the liver, so the HE risk falls and the portal pressure rises.'],
    },
    {
      id: 'tips', preset: 'cirr-decomp', params: { tips: { on: true, d: 8 } }, cam: 'liver', lens: 'firstpass', sites: ['split'], mark: STENT, tool: FLOWS,
      compare: [{ label: '8 mm', own: true, params: { tips: { on: true, d: 8 } } }, { label: '10 mm', params: { tips: { on: true, d: 10 } } }],
      data: 'tiles', tiles: ['he', 'ppg'], key: ['he'], cite: 'Baveno VIII 6.14 to 6.16; Bureau, Gastroenterology 2021',
      kicker: 'After TIPS', site: 'sin', title: 'A wider stent diverts more portal blood from the liver',
      vignette: 'A 70-year-old man with alcohol-associated cirrhosis, abstinent for 2 years, has recurrent variceal bleeding despite EVL and carvedilol and is scheduled for TIPS. He has no history of hepatic encephalopathy.',
      line: 'The 8 mm stent lowers the PPG to {ppg}, meeting the {<12 mmHg} target, and sinusoidal flow falls to {liver} of normal, now mostly arterial.',
      notes: 'The model\'s encephalopathy risk tile is High at both diameters and rises with the stent diameter; the wider stent also leaves the liver less sinusoidal flow. Overt HE follows a TIPS in about a third of patients; older age, prior HE, a wider stent and poorer liver function raise the risk. In a randomized trial, 8 mm stents caused less HE than 10 mm stents without more rebleeding, so the narrowest stent that reaches the target gradient is preferred. In another trial (Bureau, Gastroenterology 2021, 197 patients), rifaximin started 14 days before a TIPS lowered the incidence of overt HE within 168 days from 53% to 34%, and Baveno VIII advises considering it before an elective TIPS (6.16). Before the TIPS, the history of overt HE and its treatment are carefully assessed (6.14); a prior episode is not an absolute contraindication, and the decision is individualized (6.15). In the US rifaximin is available as 550 mg, and this use is off-label.',
      ask: ['He has no history of HE. What lowers his risk of HE after the TIPS?', 'The narrowest stent that reaches the target gradient, and rifaximin started about 2 weeks before.'],
    },
    {
      id: 'narrow', question: 'Will a narrower stent reduce the HE?', params: { tips: { on: true, d: 6 } }, cam: 'liver', mark: STENT, tool: FLOWS, data: 'tiles', tiles: ['he', 'ppg'], key: ['he'], delta: 'tips',
      kicker: 'After TIPS', site: 'sin', title: 'When HE persists, reduce the stent diameter',
      line: 'Reducing the stent diameter returns portal blood to the liver, and the PPG rises toward the level the TIPS was placed to treat.',
      notes: 'HE that persists after a TIPS despite lactulose and rifaximin can be treated by reducing the stent diameter, with a smaller stent placed coaxially inside it, or by occluding the stent. If a large spontaneous shunt is also found, embolizing it is another option. Baveno VIII 6.17 allows this as a weak recommendation (spontaneous shunt embolization, or reduction or occlusion of the TIPS). Either way, part of the portal hypertension that the TIPS was placed to treat returns.',
      ask: ['What does reducing the stent diameter cost?', 'The portal pressure rises, so the ascites or variceal bleeding the TIPS treated can recur.'],
    },
    {
      // (The treatment menu before the relation chart: the decompensated patient of the collaterals slide, every treatment he could get run on him, the PPG each reaches against the
      // sinusoidal flow it costs. Mohammad, 8 Nov 2026: new-features recs C2.)
      id: 'menu', preset: 'cirr-decomp', cam: 'fit', tool: { kind: 'menu' }, data: 'tiles', tiles: ['he', 'ppg'], key: ['he'],
      kicker: 'Summary', site: 'sin', title: 'Every option lowers the PPG at the cost of hepatic flow',
      line: 'The drugs reduce hepatic flow little, and the PPG falls little. The stents and the surgical shunts lower the PPG, and hepatic sinusoidal flow with it.',
      notes: 'Each dot is the same patient after one treatment, calculated by the model from the state on screen; the ring is his current state. Hepatic flow is the link to HE: the less portal blood reaches the liver, the more of what the intestine absorbs reaches the brain without first-pass clearance. A 10 mm stent lowers the PPG further than an 8 mm stent and diverts more hepatic flow, which is why the narrowest stent that reaches the target is chosen. Dot size increases with the fraction of portal blood that bypasses the liver.',
      ask: ['Why is the narrowest stent that reaches the target gradient the one to choose?', 'A wider stent lowers the PPG further but diverts more portal blood around the liver, and HE follows the blood that bypasses it.'],
    },
    {
      // (The relation chart before the summary: the same TIPS patient with a stent from 6 to 12 mm, the PPG and the liver's share of flow read against
      // the width. The model's encephalopathy index is High at every width and rises only a little, so the liver's flow is charted. The ring is 8 mm.)
      id: 'relation', preset: 'cirr-decomp', params: { tips: { on: true, d: 8 } }, cam: 'liver', mark: STENT,
      tool: { kind: 'curve', param: 'tips.d', from: 6, to: 12, step: 1, lines: ['ppg', 'liver'], cuts: [12] },
      kicker: 'Summary', site: 'sin', title: 'A wider stent lowers the PPG and takes more sinusoidal flow',
      line: 'At 8 mm the PPG is {ppg}, meeting the {<12 mmHg} target, and sinusoidal flow is {liver} of normal.',
      notes: 'Each point is the same patient with a stent of that diameter: the PPG and the hepatic sinusoidal flow fall as the diameter increases. Baveno VIII advises the smallest diameter that works, to limit overshunting (HE, heart failure). The model\'s encephalopathy index rises with the diameter too, though it is High at every diameter here, so this chart shows the sinusoidal flow, which shows the change more clearly. The ring is the 8 mm stent. (Baveno VIII 6.5.)',
      ask: ['An 8 mm stent brings the PPG <12 mmHg. Why not dilate it to 12 mm?', 'The PPG is already at target. A wider stent lowers it slightly more and diverts more hepatic flow, with more HE.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['he', 'shunt', 'liver', 'ppg'], asc: false, rowHead: 'Patient',
      of: [{ id: 'firstpass', kicker: 'Reference', title: 'Healthy' }, { id: 'collat', kicker: 'Cirrhosis', title: 'Collaterals', ref: true }, { id: 'srs', kicker: 'Spontaneous', title: 'Splenorenal shunt', vs: 'collat' },
        { id: 'embolize', kicker: 'Spontaneous', title: 'Shunt embolized', vs: 'srs' }, { id: 'tips', kicker: 'TIPS', title: 'TIPS, 8 mm', vs: 'collat' },
        { preset: 'cirr-decomp', params: { tips: { on: true, d: 10 } }, kicker: 'TIPS', title: 'TIPS, 10 mm', vs: 'tips' }],
      kicker: 'Summary', title: 'Every shunt trades a lower gradient for less sinusoidal flow',
      line: 'The more portal blood bypasses the liver, the lower the gradient and the higher the risk of HE.',
      notes: 'Every shunt, spontaneous or placed, lowers the gradient by diverting portal blood around the liver, and the brain receives what the liver did not clear. Closing or narrowing a shunt reverses the trade. Treat the precipitant and give lactulose and rifaximin first; turn to the shunt only when HE recurs.',
      ask: ['What does every portosystemic shunt trade?', 'A lower portal pressure gradient for less portal blood through the liver, and more HE.'],
    },
  ],
};
