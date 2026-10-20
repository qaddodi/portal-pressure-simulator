// Presenter talk: the portal circulation (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;

export const CIRCULATION = {
  id: 'circulation', level: 'foundation', title: 'The portal circulation', minutes: 12,
  summary: 'The normal portal system, from the gut to the right atrium. Ends with the definition of portal hypertension and a summary of the normal pressures.',
  objectives: ['Trace portal blood from the gut and spleen through the lobule to the heart', 'Name the two capillary beds in series and explain why the sinusoid wall lets protein through', 'Give normal pressures from the portal vein to the right atrium', 'Define portal hypertension and CSPH by the HVPG'],
  checks: [
    ['Which two veins join to form the portal vein?', 'The splenic vein and the superior mesenteric vein, behind the pancreas.'],
    ['Why does fluid leaving the sinusoids carry protein?', 'Sinusoids have fenestrae about 100 nm wide and no basement membrane, so plasma protein crosses into the space of Disse.'],
    ['What HVPG defines clinically significant portal hypertension (CSPH)?', '10 mmHg or more. Normal is 1 to 5 mmHg, and 6 to 9 mmHg is subclinical.'],
  ],
  slides: [
    {
      id: 'inflow', lens: 'origin', preset: 'healthy', cam: 'portal', labels: ['SMV', 'SV', 'CONF', 'IMV'], tint: ['imv'], terms: ['sv', 'smv', 'pv'], glow: [{ id: 'imv', soft: true }, { id: 'lgv', soft: true }], tool: { kind: 'flows', of: 'inflow' }, data: 'tiles', tiles: ['pvFlow', 'pv'],
      kicker: 'The portal circulation', title: 'Portal blood comes from the gut and spleen',
      line: 'The splenic and superior mesenteric veins join behind the pancreas to form the portal vein, which brings the liver about three quarters of its blood. Colored by origin, each vein keeps its source’s color.',
      notes: 'Portal blood drains the gut from the lower esophagus to the upper rectum, and the spleen, pancreas and gallbladder. It carries absorbed nutrients, toxins and bacterial products to the liver first. The inferior mesenteric vein most often joins the splenic vein. Portal flow is about 1 to 1.2 L a minute, three quarters of the liver\'s blood; the hepatic artery brings the rest, and about half of the liver\'s oxygen. On the figure, colored by origin, each vein keeps its source’s color, and the colors run side by side into the portal vein.',
      ask: ['Which veins form the portal vein?', 'The superior mesenteric vein and the splenic vein, behind the neck of the pancreas.'],
    },
    {
      id: 'lenses', cam: 'fit', labels: ['CONF', 'RA'],
      compare: [{ label: 'Pressure', lens: 'pressure', own: true }, { label: 'Flow', lens: 'flow' }, { label: 'Direction', lens: 'direction' }, { label: 'Origin', lens: 'origin' }],
      kicker: 'The portal circulation', title: 'One patient, four ways to color the vessels',
      line: 'Each button colors the same vessels by a different question: how high the pressure is, how much blood flows, which way it goes, and where it comes from. Later slides pick the coloring that answers their question.',
      notes: 'Switch through the four colorings on this healthy patient. Pressure falls from the gut to the heart. Flow is largest in the portal vein and the IVC. Direction is uniform: every vein runs toward the heart, and the portal vein runs toward the liver. Origin follows each source: SMV, IMV and splenic blood run side by side into the portal vein and mix with arterial blood in the liver. Other decks switch to the coloring that shows their point, and the key under the line says which.',
      ask: ['Which coloring would show a portal vein flowing away from the liver?', 'Direction: the reversed vein changes color.'],
    },
    {
      id: 'series', cam: [380, 30, 1010, 745], labels: ['CONF', 'SIN_R', 'RHV', 'RA'], terms: { sinusoids: 'sin', heart: 'heart' }, glow: [['V_INT', 'V_SPL', 'V_IMV'], ['SIN_RR', 'SIN_LL']], glowSeq: 550, steps: true, tool: { kind: 'profile' },   // (1: the gut's and spleen's veins, the first bed; 2: both lobes' sinusoids, the second)
      kicker: 'The portal circulation', title: 'Gut blood crosses two capillary beds in series',
      line: 'The first bed is the capillaries of the gut and spleen. The second is the liver\'s sinusoids. Because they are in series, resistance in the liver or between it and the heart raises pressure in every vein upstream.',
      notes: 'A portal system is a set of veins running between two capillary beds. The first bed is in the gut and spleen, the second is the hepatic sinusoids. Because the beds are in series, anything that raises resistance in the liver, or beyond it, raises the pressure in every vein upstream: the portal vein, the splenic vein and the veins of the gut.',
      ask: ['What makes a circulation a portal system?', 'Blood passes through two capillary beds in series before it returns to the heart.'],
    },
    {
      id: 'ladder', lens: 'drop', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], data: 'ladder', key: ['hvpg', 'ppg'],
      kicker: 'The portal circulation', title: 'Normal pressures from the portal vein to the right atrium',
      line: 'About {pv} in the [portal vein](pv) and {ra} in the [right atrium](ra). Healthy [sinusoids](sin) barely resist, so the portal pressure gradient is only {ppg}. Colored by pressure drop, every vein stays pale.',
      notes: 'The ladder reads four stations: the portal vein, the wedged hepatic vein (which reads the sinusoids), the free hepatic vein and the right atrium. The dashed line is the healthy reference, used on every slide. In health the whole fall from the portal vein to the IVC, the portal pressure gradient (PPG), is 5 mmHg or less, and the hepatic venous pressure gradient (HVPG), the fall across the sinusoids, is 1 to 5 mmHg. The wedge is a balloon reading of the sinusoids; the HVPG and PPG deck explains it.',
      ask: ['What is the normal portal pressure gradient?', '5 mmHg or less, because healthy sinusoids barely resist the flow.'],
    },
    {
      id: 'lobule', pill: false, terms: { 'portal venules': 'lobule:triad', 'hepatic arterioles': 'lobule:arteriole', sinusoids: 'lobule:sinusoid', 'central vein': 'lobule:central' }, cam: 'lobule:fit',
      kicker: 'Inside the liver', title: 'Blood crosses the lobule from its edge to the central vein',
      line: 'Each lobule is a hexagon about 1 mm across, with a portal tract at each corner, where portal venules and hepatic arterioles enter, and a central vein in the middle. Liver cells line the sinusoids in plates one cell thick.',
      notes: 'The classic lobule is a hexagon about a millimeter across, with a portal tract at its corners and a central vein (terminal hepatic venule) in the middle. Plates of liver cells, one cell thick, line the sinusoids. In the acinus, zone 1 lies near the portal tract and gets the most oxygen; zone 3, around the central vein, gets the least and is the first injured by congestion and low flow.',
      ask: ['Which liver cells see the blood last, and so get the least oxygen?', 'Those around the central vein: blood enters at the portal tracts and leaves by the central vein.'],
    },
    {
      id: 'triad', terms: { 'portal venule': 'lobule:triad', 'hepatic arteriole': 'lobule:arteriole', 'bile ductule': 'lobule:ductule' }, cam: 'lobule:triad',
      kicker: 'Inside the liver', title: 'Portal and arterial blood enter the lobule together',
      line: 'Each portal tract holds a portal venule, a hepatic arteriole and a bile ductule. Bile leaves through the ductule, against the direction of blood flow.',
      notes: 'The portal tract (portal triad) holds a branch of the portal vein, a branch of the hepatic artery and a bile ductule, with lymphatics, in connective tissue. Lymph made in the liver drains back toward the portal tracts. Presinusoidal diseases (schistosomiasis, porto-sinusoidal vascular disorder) raise resistance in the portal venules here, upstream of the sinusoids.',
      ask: ['Name the three structures of the portal tract.', 'A portal venule, a hepatic arteriole and a bile ductule.'],
    },
    {
      id: 'wall', terms: { fenestrae: 'sinusoid:fenestrae', 'space of Disse': 'sinusoid:disse', lymph: 'sinusoid:lymph' }, cam: 'sinusoid',
      kicker: 'Inside the liver', title: 'Sinusoids let plasma protein through',
      line: 'Fenestrae about 100 nm wide and no basement membrane let plasma and protein into the space of Disse. With protein on both sides, oncotic pressure does little to hold fluid back, so higher sinusoidal pressure means more lymph.',
      notes: 'Sinusoidal endothelial cells have fenestrae about 100 nm across and no basement membrane, so plasma, albumin and other proteins reach the liver cells in the space of Disse. Fluid filtered there leaves as lymph, almost as rich in protein as plasma; the liver makes a quarter to a half of the body\'s lymph. Because protein crosses the wall, oncotic pressure barely opposes filtration: a rise in sinusoidal pressure turns straight into more lymph. Most ascites in portal hypertension begins here. In cirrhosis this wall closes up (capillarization), so cirrhotic ascites is protein-poor; we come back to it in Ascites. Stellate cells, which store vitamin A and make scar in cirrhosis, sit in the space of Disse.',
      ask: ['Why does a rise in sinusoidal pressure make so much lymph?', 'Protein crosses the wall, so almost no oncotic pressure holds the fluid back.'],
    },
    {
      id: 'central', terms: { 'central veins': 'lobule:central' }, cam: 'lobule:central',
      kicker: 'Inside the liver', title: 'Sinusoids drain through the central veins to the heart',
      line: 'Central veins join to form the three hepatic veins, which enter the IVC just below the right atrium.',
      notes: 'Central veins join into sublobular veins and then the three hepatic veins (right, middle and left), which open into the IVC just below the right atrium. The caudate lobe drains straight into the IVC by its own small veins, which is why it enlarges in Budd–Chiari syndrome. The pressure here follows the right atrium: a high right atrial pressure passes straight back into the sinusoids.',
      ask: ['Where does blood go after the central vein?', 'Into the hepatic veins, the IVC and the right atrium.'],
    },
    {
      id: 'flow', lens: 'flow', terms: ['sin'], days: 8, ramp: { splanchnicTone: [1, 0.72] }, lapse: { seconds: 6, from: 'Fasting', to: 'After a meal' }, lapseGlow: ['bowel'], cam: 'gut', clear: true, labels: ['SMV', 'CONF'], glow: ['smv', 'sv', { id: 'imv', soft: true }, { id: 'lgv', soft: true }], tool: { kind: 'flowtime' },
      kicker: 'Hemodynamics', title: 'After a meal flow rises, but the pressure barely moves',
      eq: ['<mrow><mi mathvariant="normal">Δ</mi><mi>P</mi></mrow>' + mo('=') + mi('Q') + mo('×') + mi('R'), 'ΔP pressure drop across the liver · Q portal flow · R hepatic resistance'],
      line: 'Pressure equals flow times resistance. Normal sinusoids have so little resistance that nearly doubling the flow adds almost no pressure. Colored by flow, the gut veins and the portal vein deepen as the flow rises.',
      caveat: 'The model shows a smaller rise in flow, about a quarter.',
      notes: 'Watch the portal flow tile and the vessels speed up as the meal is digested, while the portal pressure rises by under a millimeter. Pressure is flow times resistance, and normal sinusoids have very little resistance, so even a large rise in flow adds little pressure. In cirrhosis the resistance is high, so the same meal raises the HVPG by a couple of mmHg; this is why flow matters most once the resistance has risen; in most portal hypertension the resistance rises first. Later the splanchnic arterioles dilate for good and the extra inflow keeps the pressure high even after collaterals open. Treatments work on one side or the other: beta-blockers and vasoactive drugs such as octreotide cut inflow; TIPS goes around the resistance.',
      ask: ['What does the meal tell you about a healthy liver?', 'That its resistance is very low: a large rise in flow adds almost no pressure.'],
    },
    {
      id: 'define', terms: ['varix'], preset: 'csph', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], data: 'ladder', key: ['hvpg', 'ppg'],
      kicker: 'Definition', site: 'sin', title: 'Portal hypertension is a gradient above 5 mmHg',
      line: 'In cirrhosis it is measured as the HVPG, and in this case it is {hvpg}. An HVPG of 6 to 9 mmHg is subclinical. From 10 mmHg, varices and ascites become possible, and the risk rises with the gradient.',
      notes: 'Portal hypertension is a portal pressure gradient above 5 mmHg; in cirrhosis it is measured as the HVPG. An HVPG of 6 to 9 mmHg is subclinical. 10 mmHg or more is clinically significant portal hypertension (CSPH): from there varices and decompensation (ascites, variceal bleeding, encephalopathy) become possible, and the risk rises with the gradient; from about 12 mmHg the risk of variceal bleeding rises. In this cirrhotic liver the largest pressure drop is across the sinusoids.',
      ask: ['What HVPG defines clinically significant portal hypertension?', '10 mmHg or more: from there varices and decompensation become possible, and the risk rises with the gradient.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pvFlow', 'pv', 'hvpg', 'ppg'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy, fasting', ref: true }, { id: 'flow', kicker: 'Healthy', title: 'After a meal' }, { id: 'define', kicker: 'Cirrhosis', title: 'CSPH' }],
      kicker: 'Summary', title: 'Normal gradients are small, even after a meal',
      line: 'A normal portal vein is under 10 mmHg, with an HVPG of 1 to 5 and a PPG of 5 or less. Cirrhosis raises resistance, so every gradient rises, and the HVPG climbs past 10 mmHg.',
      notes: 'Normal: portal vein under 10 mmHg, HVPG 1 to 5 mmHg, PPG 5 mmHg or less. Portal hypertension is a gradient above 5 mmHg, and clinically significant portal hypertension an HVPG of 10 mmHg or more. A meal raises flow in a healthy liver with almost no change in pressure; cirrhosis raises the resistance, and with it every gradient.',
      ask: ['A patient with cirrhosis has an HVPG of 8 mmHg. Is there portal hypertension, and is it clinically significant?', 'Yes, it is above 5 mmHg. It is not clinically significant until 10 mmHg, so decompensation is less likely, though not ruled out.'],
    },
  ],
};
