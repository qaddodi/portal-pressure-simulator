// Presenter talk: the portal circulation (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;

export const CIRCULATION = {
  id: 'circulation', level: 'foundation', title: 'The portal circulation', minutes: 12,
  summary: 'The normal portal system, from the gut to the right atrium. Ends with the definition of portal hypertension.',
  objectives: ['Trace portal blood from the gut and spleen through the liver to the heart', 'Name the two capillary beds in series and where each sits', 'Give normal pressures from the portal vein to the right atrium', 'Define portal hypertension and CSPH by the HVPG'],
  slides: [
    {
      id: 'inflow', preset: 'healthy', cam: 'portal', labels: ['SMV', 'SV', 'CONF'], terms: ['sv', 'smv', 'pv'], data: 'tiles', tiles: ['pvFlow', 'pv'],
      kicker: 'The portal circulation', title: 'Where portal blood comes from',
      line: 'The splenic and superior mesenteric veins join behind the pancreas to form the portal vein. It brings the liver about three quarters of its blood.',
      notes: 'Portal blood drains the gut from the lower esophagus to the upper rectum, and the spleen, pancreas and gallbladder. It carries absorbed nutrients, toxins and bacterial products to the liver first. The inferior mesenteric vein usually joins the splenic vein. Portal flow is about 1 to 1.2 L a minute, three quarters of the liver\'s blood; the hepatic artery brings the rest, and about half of the liver\'s oxygen.',
      ask: ['Which veins form the portal vein?', 'The superior mesenteric vein and the splenic vein, behind the neck of the pancreas.'],
    },
    {
      id: 'series', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], terms: { sinusoids: 'sin', heart: 'heart' }, glow: ['smv'],
      kicker: 'The portal circulation', title: 'Two capillary beds in series',
      line: 'Gut blood crosses the capillaries of the intestine, then the sinusoids of the liver, before it returns to the heart.',
      notes: 'A portal system is a set of veins running between two capillary beds. The first bed is in the gut and spleen, the second is the hepatic sinusoids. Because the beds are in series, anything that raises resistance in the liver, or beyond it, raises the pressure in every vein upstream: the portal vein, the splenic vein and the veins of the gut.',
      ask: ['What makes a circulation a portal system?', 'Blood passes through two capillary beds in series before it returns to the heart.'],
    },
    {
      id: 'ladder', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], data: 'ladder', key: ['hvpg', 'ppg'],
      kicker: 'The portal circulation', title: 'Normal pressures, portal vein to heart',
      line: 'About {pv} in the [portal vein](pv) and {ra} in the [right atrium](ra). Normal [sinusoids](sin) offer little resistance, so each drop is small.',
      notes: 'The ladder reads four stations: the portal vein, the wedged hepatic vein (which reads the sinusoids), the free hepatic vein and the right atrium. The dashed line is the healthy reference, used on every slide. In health the whole fall from the portal vein to the IVC, the portal pressure gradient (PPG), is 5 mmHg or less, and the hepatic venous pressure gradient (HVPG), the fall across the sinusoids, is 1 to 5 mmHg.',
      ask: ['What is the normal portal pressure gradient?', '5 mmHg or less.'],
    },
    {
      id: 'lobule', terms: { 'portal tracts': 'lobule:triad', sinusoids: 'lobule:sinusoid', 'central vein': 'lobule:central' }, cam: 'lobule:fit',
      kicker: 'Inside the liver', title: 'The liver lobule',
      line: 'Blood enters at the portal tracts on the edge, runs through the sinusoids and leaves by the central vein.',
      notes: 'The classic lobule is a hexagon about a millimeter across, with a portal tract at its corners and a central vein (terminal hepatic venule) in the middle. Plates of liver cells, one cell thick, line the sinusoids. In the acinus, zone 1 lies near the portal tract and gets the most oxygen; zone 3, around the central vein, gets the least and is the first injured by congestion and low flow.',
      ask: ['Which zone is first injured in heart failure?', 'Zone 3, around the central vein.'],
    },
    {
      id: 'triad', terms: { 'portal venule': 'lobule:triad' }, cam: 'lobule:triad',
      kicker: 'Inside the liver', title: 'The portal tract',
      line: 'A portal venule, a hepatic arteriole and a bile duct. Portal and arterial blood mix as they enter the sinusoids.',
      notes: 'The portal tract (portal triad) holds a branch of the portal vein, a branch of the hepatic artery and a bile ductule, with lymphatics, in connective tissue. Lymph made in the liver drains back toward the portal tracts. Presinusoidal diseases (schistosomiasis, porto-sinusoidal vascular disorder) block the portal venules here, upstream of the sinusoids.',
      ask: ['Name the three structures of the portal tract.', 'A portal venule, a hepatic arteriole and a bile ductule.'],
    },
    {
      id: 'wall', terms: { fenestrae: 'sinusoid:fenestrae', 'space of Disse': 'sinusoid:disse' }, cam: 'sinusoid',
      kicker: 'Inside the liver', title: 'The sinusoid wall',
      line: 'Sinusoids have open pores (fenestrae) and no basement membrane. Plasma and its protein pass freely into the space of Disse.',
      notes: 'Sinusoidal endothelial cells have fenestrae about 100 nm across and no basement membrane, so plasma, albumin and other proteins reach the liver cells in the space of Disse. Fluid filtered there leaves as lymph, almost as rich in protein as plasma; the liver makes a quarter to a half of the body\'s lymph. Because protein crosses the wall, oncotic pressure barely opposes filtration: a rise in sinusoidal pressure turns straight into more lymph. Most ascites in portal hypertension begins here. Stellate cells, which store vitamin A and make scar in cirrhosis, sit in the space of Disse.',
      ask: ['Why does a rise in sinusoidal pressure make so much lymph?', 'Protein crosses the wall, so almost no oncotic pressure holds the fluid back.'],
    },
    {
      id: 'central', terms: { 'central vein': 'lobule:central' }, cam: 'lobule:central',
      kicker: 'Inside the liver', title: 'The central vein',
      line: 'The sinusoids drain into the central vein, then the hepatic veins, the IVC and the right atrium.',
      notes: 'Central veins join into sublobular veins and then the three hepatic veins (right, middle and left), which open into the IVC just below the right atrium. The caudate lobe drains straight into the IVC by its own small veins, which is why it enlarges in Budd–Chiari syndrome. The pressure here follows the right atrium: a high right atrial pressure passes straight back into the sinusoids.',
      ask: ['Why does the caudate lobe enlarge in Budd–Chiari syndrome?', 'It drains into the IVC by its own veins, which escape the block.'],
    },
    {
      id: 'flow', days: 8, ramp: { splanchnicTone: [1, 0.72] }, lapse: { seconds: 6, from: 'Fasting', to: 'After a meal' }, cam: 'portal', labels: ['SMV', 'CONF'], glow: ['smv', 'sv'], data: 'ladder', key: ['pv'], tiles: ['pvFlow', 'ppg'], delta: true,
      kicker: 'Hemodynamics', title: 'After a meal: more flow, little more pressure',
      eq: ['<mrow><mi mathvariant="normal">Δ</mi><mi>P</mi></mrow>' + mo('=') + mi('Q') + mo('×') + mi('R'), 'ΔP pressure drop across the liver · Q portal flow · R hepatic resistance'],
      line: 'The gut arterioles open and portal flow climbs by about a quarter. A healthy liver offers so little resistance that the portal pressure barely moves.',
      notes: 'Watch the portal flow tile and the vessels speed up as the meal is digested, while the portal pressure rises by under a millimeter. Pressure is flow times resistance, and normal sinusoids have very little resistance, so even a large rise in flow adds little pressure. In cirrhosis the resistance is high, so the same meal raises the HVPG several mmHg; this is why resistance, not flow, is the starting point of portal hypertension. Later the splanchnic arterioles dilate for good and the extra inflow keeps the pressure high even after collaterals open. Treatments work on one side or the other: beta-blockers and terlipressin cut inflow; TIPS goes around the resistance.',
      ask: ['Name the two ways portal pressure can rise.', 'More resistance to flow, or more inflow (splanchnic vasodilation).'],
    },
    {
      id: 'define', preset: 'csph', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'RA'], data: 'ladder', key: ['hvpg', 'ppg'],
      kicker: 'Definition', site: 'sin', title: 'Portal hypertension',
      line: 'A portal pressure gradient above {>=5 mmHg}, measured as the HVPG in cirrhosis. This patient\'s HVPG is {hvpg}; at {>=10 mmHg} varices and ascites become likely.',
      notes: 'Portal hypertension is a portal pressure gradient above 5 mmHg; in cirrhosis it is measured as the HVPG. An HVPG of 6 to 9 mmHg is subclinical. 10 mmHg or more is clinically significant portal hypertension (CSPH), the threshold for varices and decompensation (ascites, variceal bleeding, encephalopathy); 12 mmHg or more is the threshold for variceal bleeding. In this cirrhotic liver the largest pressure drop is across the sinusoids.',
      ask: ['What HVPG defines clinically significant portal hypertension?', '10 mmHg or more.'],
    },
  ],
};
