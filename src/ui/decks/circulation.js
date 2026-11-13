// Presenter talk: the portal circulation (the slide fields are described at the top of decks.js).

export const CIRCULATION = {
  id: 'circulation', level: 'foundation', title: 'The portal circulation', minutes: 8,
  summary: 'The normal portal circulation, from the splanchnic bed to the right atrium. Ends with the definition of portal hypertension.',
  objectives: ['Trace portal blood from the intestine and spleen through the lobule to the right atrium', 'Name the two capillary beds in series and explain why the sinusoidal wall is permeable to protein', 'State normal pressures from the portal vein to the right atrium', 'Define portal hypertension and CSPH by the HVPG'],
  checks: [
    ['Which two veins join to form the portal vein?', 'The splenic vein and the superior mesenteric vein, behind the pancreas.'],
    ['Why does fluid leaving the sinusoids carry protein?', 'Sinusoids have fenestrae about 100 nm wide and no basement membrane, so plasma protein crosses into the space of Disse.'],
    ['What HVPG defines clinically significant portal hypertension (CSPH)?', '≥10 mmHg. Normal is 1 to 5 mmHg, and 6 to 9 mmHg is subclinical.'],
  ],
  slides: [
    {
      id: 'inflow', lens: 'origin', preset: 'healthy', cam: 'portal', labels: ['SMV', 'SV', 'CONF', 'IMV'], tint: ['imv'], terms: ['sv', 'smv', 'pv'], glow: [{ id: 'imv', soft: true }, { id: 'lgv', soft: true }], tool: { kind: 'flows', of: 'inflow' }, data: 'tiles', tiles: ['pvFlow', 'pv'],
      kicker: 'The portal circulation', title: 'Portal blood drains the intestine and spleen',
      line: 'The splenic and superior mesenteric veins join behind the pancreas to form the portal vein, which supplies about three quarters of hepatic blood flow.',
      notes: 'Portal blood drains the GI tract from the distal esophagus to the upper rectum, and the spleen, pancreas and gallbladder. It carries absorbed nutrients, toxins and bacterial products to the liver first. The inferior mesenteric vein most often joins the splenic vein. Portal flow is about 1 to 1.2 L/min, three quarters of hepatic blood flow; the hepatic artery supplies the rest and about half of hepatic oxygen delivery. On the figure, in the origin view, each vein keeps the color of its source, and the colors run side by side into the portal vein.',
      ask: ['Which veins form the portal vein?', 'The superior mesenteric vein and the splenic vein, behind the neck of the pancreas.'],
    },
    {
      id: 'series', cam: { on: ['V_INT', 'V_SPL', 'V_IMV', 'SIN_RR', 'SIN_LL', 'RA'], near: 'route' }, scales: { lobule: { glow: ['lobule:sinusoid'] }, sinusoid: {} }, labels: ['CONF', 'SIN_R', 'RHV', 'RA'], terms: { sinusoids: 'sin' }, glow: [['V_INT', 'V_SPL', 'V_IMV'], ['SIN_RR', 'SIN_LL']], glowSeq: 550, steps: true, tool: { kind: 'profile' }, key: ['hvpg', 'ppg'],   // (1: the gut's and spleen's veins, the first bed; 2: both lobes' sinusoids, the second)
      kicker: 'The portal circulation', title: 'Splanchnic blood crosses two capillary beds in series',
      line: 'The first bed is the intestinal and splenic capillaries {#1}, the second the hepatic sinusoids {#2}. In series, resistance in the liver or beyond raises pressure in every vein upstream.',
      notes: 'A portal system is a set of veins running between two capillary beds. The first bed is in the intestine and spleen, the second is the hepatic sinusoids. Because the beds are in series, anything that raises resistance in the liver, or beyond it, raises the pressure in every vein upstream: the portal vein, the splenic vein and the mesenteric veins.',
      ask: ['What makes a circulation a portal system?', 'Blood passes through two capillary beds in series before it returns to the heart.'],
    },
    {
      id: 'ladder', lens: 'drop', cam: 'route', scales: { lobule: { glow: ['lobule:triad', 'lobule:central'] } }, labels: ['CONF', 'SIN_R', 'RHV', 'RA'], tool: { kind: 'profile' }, key: ['hvpg', 'ppg'],
      kicker: 'The portal circulation', title: 'Normal pressures from the portal vein to the right atrium',
      line: 'The [portal vein](pv) pressure is about {pv} and the [right atrium](ra) {ra}. Healthy [sinusoids](sin) offer little resistance, so the portal pressure gradient is only {ppg}.',
      notes: 'The ladder runs from the splanchnic veins to the right atrium, through the portal vein, the three intrahepatic stations and the hepatic vein; the wedged hepatic venous pressure reflects the sinusoids. The dashed line is the healthy reference, used on every slide. In health the whole pressure drop from the portal vein to the IVC, the portal pressure gradient (PPG), is ≤5 mmHg, and the hepatic venous pressure gradient (HVPG), the drop across the sinusoids, is 1 to 5 mmHg. The wedged pressure is a balloon-occlusion measurement of sinusoidal pressure; the Measuring HVPG and PPG talk explains it.',
      ask: ['What is the normal portal pressure gradient?', '≤5 mmHg, because healthy sinusoids offer little resistance to flow.'],
    },
    {
      id: 'lobule', pill: false, terms: { 'portal venules': 'lobule:triad', 'hepatic arterioles': 'lobule:arteriole', sinusoids: 'lobule:sinusoid', 'central vein': 'lobule:central' }, cam: 'lobule:fit',
      kicker: 'Inside the liver', title: 'Blood crosses the lobule from portal tract to central vein',
      line: 'Portal venules and hepatic arterioles enter at the corners of this hexagon, about 1 mm across, cross the sinusoids and drain to the central vein.',
      notes: 'The classic lobule is a hexagon about a millimeter across, with a portal tract at each corner and a central vein (terminal hepatic venule) in the middle. Each portal tract holds a portal venule, a hepatic arteriole and a bile ductule, with lymphatics, in connective tissue; bile leaves through the ductule, against the direction of blood flow. Hepatocyte plates, one cell thick, line the sinusoids. Central veins join into sublobular veins and then the three hepatic veins (right, middle and left), which open into the IVC just below the right atrium. The caudate lobe drains straight into the IVC by its own small veins, which is why it hypertrophies in Budd–Chiari syndrome. In the acinus, zone 1 lies near the portal tract and receives the most oxygen; zone 3, around the central vein, receives the least and is injured first by congestion and hypoperfusion. Presinusoidal diseases (schistosomiasis, porto-sinusoidal vascular disorder) raise resistance in the portal venules, upstream of the sinusoids, and a high right atrial pressure is transmitted back through the hepatic veins into the sinusoids.',
      ask: ['Which hepatocytes receive blood last, and so the least oxygen?', 'Those around the central vein: blood enters at the portal tracts and leaves by the central vein. A portal tract holds a portal venule, a hepatic arteriole and a bile ductule.'],
    },
    {
      id: 'wall', terms: { fenestrae: 'sinusoid:fenestrae', 'space of Disse': 'sinusoid:disse', lymph: 'sinusoid:lymph' }, cam: 'sinusoid', tool: { kind: 'fluid', window: true, forces: true }, data: 'tiles', tiles: ['sin'], key: ['sin'],
      kicker: 'Inside the liver', title: 'Sinusoids let plasma protein through',
      line: 'Fenestrae about 100 nm wide and no basement membrane let protein into the space of Disse, so the oncotic gradient barely opposes filtration and higher sinusoidal pressure increases lymph formation.',
      notes: 'Sinusoidal endothelial cells have fenestrae about 100 nm across and no basement membrane, so plasma, albumin and other proteins reach the hepatocytes in the space of Disse. Fluid filtered there leaves as lymph, almost as rich in protein as plasma; the liver produces a quarter to a half of total body lymph. Because protein crosses the wall, oncotic pressure barely opposes filtration: a rise in sinusoidal pressure translates directly into more lymph. Most ascites in portal hypertension originates here. In cirrhosis the sinusoidal wall loses its fenestrae (capillarization), so cirrhotic ascites is protein-poor; the Ascites talk returns to it. Stellate cells, which store vitamin A and produce collagen in cirrhosis, reside in the space of Disse.',
      ask: ['Why does a rise in sinusoidal pressure produce so much lymph?', 'Protein crosses the sinusoidal wall, so almost no oncotic gradient opposes filtration.'],
    },
    {
      id: 'define', terms: ['varix'], preset: 'csph', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], tool: { kind: 'profile' }, key: ['hvpg', 'ppg'],
      kicker: 'Definition', site: 'sin', title: 'Portal hypertension is a gradient >5 mmHg',
      vignette: 'A 52-year-old man with hepatitis C cirrhosis comes to his first hepatology visit. He has never bled or had ascites, and his platelets are 90,000/µL.',
      line: 'In this case of compensated cirrhosis, the HVPG is {hvpg}. An HVPG of 6 to 9 mmHg is subclinical; from 10 mmHg varices and ascites become possible and risk rises.',
      notes: 'Portal hypertension is a portal pressure gradient >5 mmHg; in cirrhosis it is measured as the HVPG. An HVPG of 6 to 9 mmHg is subclinical. An HVPG ≥10 mmHg is clinically significant portal hypertension (CSPH): from there varices and decompensation (ascites, variceal bleeding, encephalopathy) become possible, and the risk rises with the gradient; from about 12 mmHg the risk of variceal bleeding rises. In this cirrhotic liver the largest pressure drop is across the sinusoids.',
      ask: ['What HVPG defines clinically significant portal hypertension?', '≥10 mmHg: from there varices and decompensation become possible, and the risk rises with the gradient.'],
    },
    {
      // (The stages of Baveno VIII Fig. 2 lit for this patient: compensated, with CSPH. The definition slide before gave the HVPG; this one puts it on the stages.)
      id: 'path-ladder', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'],
      tool: { kind: 'path', of: 'ladder', short: 'Stages', patient: { s: 1, rc: false } },
      kicker: 'Definition', site: 'sin', title: 'CSPH is the second stage of cirrhosis',
      line: 'Compensated cirrhosis has two stages, defined by the HVPG. His HVPG of {hvpg} is {>=10 mmHg}, so he has CSPH. Ascites, variceal bleeding or overt hepatic encephalopathy would mark decompensation.',
      notes: 'Source: Baveno VIII Fig. 2, 3.1 to 3.3. Cirrhosis is compensated while there is no current or past decompensation. Compensated cirrhosis has two stages, without and with clinically significant portal hypertension (CSPH). CSPH is shown by an HVPG ≥10 mmHg, and by a liver stiffness ≥25 kPa, varices or collaterals. The first decompensation is clinically evident ascites, variceal bleeding or overt hepatic encephalopathy; later events are further decompensation, with a higher mortality. He has never bled or had ascites, so he is compensated, at the second stage. The decompensation and recompensation talk follows the stages in order.',
      ask: ['Which three events mark the end of compensated cirrhosis?', 'Clinically evident ascites, variceal bleeding and overt hepatic encephalopathy (Baveno VIII 3.3).'],
    },
    {
      // (Ohm's law on a plane, C1 of docs/recommendations/new-features-recs.md: the healthy liver of the first slide (ring) and this patient's (dot).)
      id: 'flowres', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], visual: 'plane', plane: 'flow-ppg',
      of: [{ id: 'inflow', name: 'Healthy' }, { id: 'define', from: 'inflow', name: 'Cirrhosis with CSPH', short: 'CSPH' }],
      kicker: 'Definition', title: 'The gradient is flow times resistance',
      line: 'Each line from the origin is one resistance. Fibrosis moves the patient onto a steeper line, so the same portal flow produces a much higher gradient.',
      notes: 'Portal flow is on the x-axis and the PPG on the y-axis. A line from the origin joins the points that share one resistance, the PPG divided by the flow in mmHg per L/min. The healthy liver carries about 1.1 L/min at a PPG near 4 mmHg. The patient with CSPH carries about the same flow at a PPG over 13 mmHg, so the resistance is about three times higher. The resistance on this plane is that of the whole portal circuit, PPG ÷ flow. (AASLD 2024 p. 1181: portal pressure is proportional to the splanchnic inflow and to the resistance opposing it.)',
      ask: ['The patient and the healthy liver carry about the same flow. Why is the gradient three times higher?', 'The resistance is three times higher: the dot lies on a steeper line.'],
    },
    {
      // (The relation chart, last in the talk: scarring from none to severe, each point a liver settled for a year, the HVPG and the PPG on
      // one scale with the HVPG's 5 and 10. The ring is the CSPH liver of the slide before.)
      id: 'relation', preset: 'csph', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'],
      tool: { kind: 'curve', param: 'cirrhosis', label: 'Fibrosis', unit: '% of severe', from: 0, to: 1, step: 0.1, days: 365, patient: { preset: 'healthy' }, lines: ['hvpg', 'ppg'], oneScale: true },
      kicker: 'Summary', site: 'sin', title: 'The HVPG crosses 5, then 10 mmHg, as fibrosis progresses',
      line: 'As fibrosis progresses, the HVPG climbs through 5 mmHg, where portal hypertension begins, and 10 mmHg, where it becomes clinically significant. Here it is {hvpg}.',
      notes: 'Each point is a liver with a different degree of fibrosis, at steady state after a year, with the HVPG and the PPG on one scale. In health the gradient is 1 to 5 mmHg. Portal hypertension is a gradient >5 mmHg, and from 10 mmHg it is clinically significant (CSPH): varices and decompensation become possible, and the risk rises with the gradient. The fibrosis axis is the model\'s own scale, from none to severe. The ring is the CSPH liver of the slide before. (AASLD 2024 p. 1181 and statement 4.) One model patient per point; real patients vary far more.',
      ask: ['A liver has an HVPG of 7 mmHg. Does it have portal hypertension, and is it clinically significant?', 'It has portal hypertension (>5 mmHg), but not yet a clinically significant one (<10 mmHg).'],
    },
  ],
};
