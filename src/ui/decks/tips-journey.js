// Presenter talk: a TIPS from the reasons to the transplant question, for one woman with recurrent ascites (Advanced; the slide
// fields are described at the top of decks.js). Spontaneous shunts, the stent's Doppler and the rescue TIPS have their own decks (Shunts,
// TIPS Doppler, When the bleeding will not stop), so this one takes the order a team follows: why, the checks, the procedure, what
// it does to the heart, how wide, what does not rule it out, and the transplant.
// Sources, checked 25 Oct 2026 against the Baveno VIII text in /mnt/project-files/guidelines/: 4.13 (bleeding despite secondary
// prophylaxis), 5.31 (pre-emptive TIPS, and the box that names age under 75, creatinine under 3 mg/dL and no heart failure), 5.33,
// 5.34, 6.3 and 6.4 (recurrent or refractory ascites; discuss TIPS and transplant together), 6.5 and 6.6 (smallest adequate stent,
// stepwise dilation; overshunting means encephalopathy and cardiac failure), 6.8 (age 70 or over), 6.9 (renal function), 6.10 and
// 6.11 (alternatives), 6.14 and 6.16 (encephalopathy history, rifaximin), 4.15 (liver cancer) and 4.19 (frailty). The heart numbers
// are the model's own (decompensated cirrhosis: right atrial pressure and cardiac output both rise with the stent).

const TIPS8 = { tips: { on: true, d: 8 } };
const WIDTH = { label: 'Stent width', param: 'tips.d', min: 6, max: 10, step: 1, unit: 'mm' };

export const TIPS_JOURNEY = {
  id: 'tips-journey', level: 'advanced', title: 'A TIPS from start to finish', minutes: 10,
  objectives: [
    'Name the three reasons Baveno VIII gives to consider a TIPS',
    'List what to check before the stent: the heart, the kidneys, the brain',
    'Explain what the stent does to the heart and why the width matters',
    'Say what does not rule a TIPS out, and when to discuss a transplant',
  ],
  checks: [
    ['Name three reasons to consider a TIPS.', 'Bleeding that carvedilol and banding do not stop, recurrent or refractory ascites, and a pre-emptive TIPS after a high-risk bleed.'],
    ['What does a TIPS do to the right atrial pressure and the cardiac output?', 'Both rise, because part of the portal blood now goes straight to the heart. That is why heart failure comes before the stent.'],
    ['The ascites has not improved a month after the stent. What does Baveno VIII advise?', 'Dilating the stent stepwise, one size at a time, to the smallest width that works.'],
    ['A 72-year-old woman has refractory ascites and her bilirubin is 4 mg/dL. Is a TIPS ruled out?', 'No. Age 70 or over is judged case by case, and no bilirubin value alone rules a TIPS out. The heart, the kidneys and her encephalopathy history decide.'],
  ],
  sections: [['Why and who', ['Before']], ['The stent', ['The stent']], ['Around it', ['Around it']]],
  summary: 'A TIPS in the order a team follows: the three reasons, the checks, the procedure, what the stent does to the heart, how wide to make it, what does not rule it out, and the transplant discussion.',
  slides: [
    {
      id: 'reasons', preset: 'cirr-decomp', params: { diuretics: true }, days: 120, ramp: { albumin: [2.8, 2.4] }, cam: 'fit', tool: { kind: 'criteria', title: 'When a TIPS is considered', short: 'When', ticks: false, rows: ['Bleeding despite carvedilol and banding',
        { text: 'Recurrent or refractory ascites', note: 'this case', lit: true }, 'Pre-emptive, within 72 hours of a high-risk bleed'] }, data: 'tiles', tiles: ['asc', 'ppg'], key: ['asc'],
      vignette: 'A 66-year-old woman with alcohol-associated cirrhosis, sober for 3 years, has needed a paracentesis every 10 days for three months despite full diuretics. Her bilirubin is 1.6 mg/dL and she has never been confused.',
      cite: 'Baveno VIII 4.13, 5.31, 6.3',
      kicker: 'Before', site: 'sin', title: 'Three reasons to consider a stent',
      line: 'Baveno VIII considers a TIPS for bleeding that carvedilol and banding do not stop, for recurrent or refractory ascites, and as a pre-emptive step in a high-risk bleed. Her ascites is back: {asc}.',
      notes: 'Each reason has its own criteria, taught in the Choose the treatment and Preventing the next bleed talks. Here the reason is recurrent ascites. A TIPS and a transplant should be discussed together from the start, because a TIPS for ascites is a bridge or an alternative, not a cure of the liver.',
      ask: ['Name the three reasons Baveno VIII gives to consider a TIPS.', 'Bleeding despite carvedilol and banding, recurrent or refractory ascites, and a pre-emptive TIPS after a high-risk bleed.'],
    },
    {
      id: 'check', cam: 'liver', data: 'tiles', tiles: ['asc', 'ppg'], key: ['asc'],
      tool: { kind: 'criteria', title: 'Before the stent', short: 'Before', ticks: false, rows: ['No heart failure', 'Kidney function staged (eGFR)', 'Encephalopathy history and medicines reviewed', 'Rifaximin considered beforehand'] },
      cite: 'Baveno VIII 5.31, 6.9, 6.14, 6.16',
      kicker: 'Before', site: 'sin', title: 'Check the heart, the kidneys and the brain first',
      line: 'A stent sends part of the portal blood straight to the heart, and part of it past the liver to the brain. So the heart comes first, then the kidneys, then her encephalopathy history, with rifaximin considered beforehand.',
      notes: 'Baveno VIII lists no heart failure, age under 75 and a creatinine under 3 mg/dL as the box for a pre-emptive TIPS, asks for kidney function to be staged before a TIPS for ascites (6.9), and asks for the encephalopathy history and medicines to be reviewed (6.14). A history of overt encephalopathy is not an absolute contraindication (6.15); rifaximin should be considered before an elective TIPS (6.16).',
      ask: ['A woman with refractory ascites is sent for a TIPS. Which three systems do you check first?', 'The heart, the kidneys and the brain: heart failure, kidney function, and the encephalopathy history, with rifaximin considered.'],
    },
    {
      id: 'play', cam: 'liver', labels: ['CONF'], procedure: 'tips', data: 'tiles', tiles: ['ppg', 'asc'], key: ['ppg'],
      kicker: 'The stent', site: 'sin', title: 'The catheter goes from the neck vein to the portal vein',
      line: 'The catheter enters the right jugular vein and passes the right hepatic vein. A needle crosses the liver into the right portal vein, and a covered stent holds the tract open. Press Play to follow it.',
      cite: 'Baveno VIII 5.31',
      notes: 'A TIPS is a tunnel inside the liver between a hepatic vein and a branch of the portal vein. The catheter reaches it from the jugular vein, so there is no incision in the belly. A covered stent keeps the tunnel open: Baveno VIII names polytetrafluoroethylene-covered stents. When the stent opens, the portal pressure falls at once.',
      ask: ['Which kind of stent does Baveno VIII name for a pre-emptive TIPS?', 'A polytetrafluoroethylene (PTFE) covered stent.'],
    },
    {
      id: 'heart', params: TIPS8, cam: 'liver', tool: { kind: 'profile', from: 'reasons', fromLabel: 'Before' }, data: 'tiles', tiles: ['co', 'ra'], key: ['co'], delta: 'reasons',
      compare: [{ label: 'Before the stent', short: 'Before', slide: 'reasons' }, { label: 'With the stent', short: 'With', own: true }],
      cite: 'Baveno VIII 6.5',
      kicker: 'The stent', site: 'sin', title: 'The stent gives the heart more to do',
      line: 'With the stent, the cardiac output rises from {co@reasons} to {co}, and the right atrial pressure to {ra}. A healthy heart copes. A failing one may not, which is why heart failure comes first on the list.',
      notes: 'Blood that used to pass through the liver now reaches the right atrium at once, so the venous return, the right atrial pressure and the cardiac output all rise. Baveno VIII names cardiac failure, with encephalopathy, as a risk of overshunting (6.5). The model shows the rise in a heart that is normal; it does not draw a failing one.',
      ask: ['Why does a TIPS raise the cardiac output?', 'Part of the portal blood now goes straight to the right atrium, so more blood returns to the heart.'],
    },
    {
      id: 'width', params: { tips: { on: true, d: 7 } }, whatIf: WIDTH, cam: 'liver', tool: { kind: 'profile' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'], delta: 'reasons',
      cite: 'Baveno VIII 6.5, 6.6',
      kicker: 'The stent', site: 'sin', title: 'Dilate only as far as the ascites needs',
      line: 'At 7 mm the PPG is {ppg} and the liver keeps {liver} of its normal flow. Widen the stent with the slider and watch what each millimeter buys and costs. Baveno VIII dilates stepwise, and only if the ascites does not clear.',
      notes: 'A wider stent lowers the gradient more and sends more blood past the liver, so it raises the risk of encephalopathy and of heart failure. Baveno VIII says the stent may be dilated to the smallest diameter that gives an adequate response (6.5), and dilated stepwise when the ascites does not improve (6.6).',
      ask: ['Why not make the stent as wide as possible?', 'A wider stent sends more portal blood past the liver, so encephalopathy and heart failure become more likely.'],
    },
    {
      id: 'around', cam: 'liver', data: 'tiles', tiles: ['ppg', 'liver'], key: ['liver'],
      tool: { kind: 'criteria', title: 'Alongside the stent', short: 'Alongside', ticks: false, rows: ['Discuss the transplant together with the TIPS',
        'Encephalopathy that resists treatment: priority for transplant', { text: 'No TIPS: long-term albumin or a home drain', note: 'if she is not a candidate' }] },
      cite: 'Baveno VIII 5.34, 6.4, 6.10, 6.11',
      kicker: 'Around it', site: 'sin', title: 'The TIPS and the transplant are one conversation',
      line: 'Baveno VIII says to discuss the TIPS and the transplant together. Encephalopathy that resists treatment after a TIPS can move a patient up the list. If she cannot have a TIPS, long-term albumin or a home drain are the alternatives.',
      notes: 'A TIPS lowers the portal pressure and may buy years, but it does not repair the liver. For recurrent or refractory ascites Baveno VIII (6.4) asks for the TIPS and the transplant to be discussed together. Encephalopathy that resists medical and interventional treatment after a TIPS may be prioritized for transplant (5.34). For a patient who cannot have a TIPS, long-term albumin (6.10) or a tunneled drain or ascites pump (6.11) may be considered.',
      ask: ['When should the transplant be discussed for a patient with refractory ascites?', 'At the same time as the TIPS, not after it fails.'],
    },
    {
      id: 'not', cam: 'liver', data: 'tiles', tiles: ['ppg', 'liver'], key: ['liver'],
      tool: { kind: 'criteria', title: 'Not a reason to refuse', short: 'Not a reason', ticks: false, rows: ['ACLF, encephalopathy, bilirubin or MELD, for a pre-emptive TIPS',
        'Liver cancer, unless it lies on the stent path', 'Frailty or sarcopenia alone', 'Age 70 or over, for ascites: judged case by case'] },
      cite: 'Baveno VIII 4.15, 4.19, 5.33, 6.8',
      kicker: 'Around it', site: 'sin', title: 'No single number rules a TIPS out',
      line: 'Baveno VIII lists what is not an absolute contraindication. Each item is weighed with the rest, and the heart and the kidneys count for more than any of them.',
      notes: 'For a pre-emptive TIPS, acute-on-chronic liver failure, overt encephalopathy, a raised bilirubin, the MELD score and severe alcohol-related hepatitis are not absolute contraindications (5.33). Liver cancer does not rule out a TIPS for ascites unless the tumor lies along the stent path (4.15). Frailty and sarcopenia alone neither indicate nor rule out a TIPS (4.19). In older adults from 70 years with refractory ascites it is judged case by case (6.8).',
      ask: ['Does a raised MELD score rule out a pre-emptive TIPS?', 'No. Baveno VIII does not count it, or ACLF, encephalopathy or a high bilirubin, as an absolute contraindication.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['ppg', 'liver', 'ra', 'co'], asc: false, rowHead: 'Step', vs: 'first',
      of: [{ id: 'reasons', kicker: 'Before', title: 'No stent' }, { id: 'heart', kicker: 'The stent', title: 'TIPS, 8 mm' }, { id: 'width', kicker: 'The stent', title: 'TIPS, 7 mm' }],
      kicker: 'Summary', site: 'sin', title: 'The stent lowers the gradient and moves the load to the heart',
      line: 'A TIPS lowers the PPG and the ascites follows. The price is a smaller share of blood through the liver and more work for the heart, so the width is the smallest that works.',
      notes: 'Read the three rows. With no stent, the gradient is high and the ascites keeps coming back. An 8 mm stent lowers the gradient and sends most of the portal blood past the liver, and the right atrial pressure and the cardiac output rise. The 7 mm stent sits in between: a little less relief and a little less load.',
      ask: ['What does a wider TIPS buy, and what does it cost?', 'A lower gradient and a better chance of clearing the ascites, at the price of more blood past the liver and more work for the heart.'],
    },
  ],
};
