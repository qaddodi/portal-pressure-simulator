// Presenter talk: propranolol and carvedilol compared in sinusoidal (cirrhosis) and presinusoidal (schistosomiasis)
// portal hypertension. Both cut the portal inflow; carvedilol's α1 effect also relaxes the sinusoids (in the model,
// engine.js zoneMult), so it adds most where the resistance sits there (the slide fields are described at the top of
// decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`;
const dP = '<mrow><mi mathvariant="normal">Δ</mi><mi>P</mi></mrow>';

const PROP = { drugs: { propranolol: true, carvedilol: false } };
const CARV = { drugs: { propranolol: false, carvedilol: true } };

export const BETA_BLOCKERS = {
  id: 'beta-blockers', level: 'advanced', title: 'Propranolol or carvedilol?', minutes: 7,
  objectives: [
    'Explain how propranolol and carvedilol each lower portal pressure',
    'Explain why carvedilol adds most where the resistance is sinusoidal',
    'Compare both drugs in cirrhosis and in schistosomiasis',
    'Explain why the HVPG misleads when judging a drug in presinusoidal disease',
  ],
  checks: [
    ['What does carvedilol add to propranolol?', 'It lowers the resistance inside the liver as well as the inflow, most likely through α1 blockade of the stellate cells.'],
    ['Why does that add little in schistosomiasis?', 'The resistance is scar in the portal venules, before the sinusoids where its extra effect acts.'],
    ['On carvedilol the HVPG falls a little in schistosomiasis. Did the portal pressure fall more?', 'No. The HVPG reads the sinusoids, not the portal vein; the portal pressure fell about as much as on propranolol.'],
  ],
  summary: 'Propranolol and carvedilol in cirrhosis and in schistosomiasis: both cut the portal inflow, but carvedilol\'s extra effect lowers the resistance in the sinusoids, so it lowers the pressure more only where the resistance sits there.',
  slides: [
    {
      id: 'ohm', preset: 'csph', cam: 'route', data: 'tiles', tiles: ['hvpg', 'pvFlow'], key: ['hvpg'],
      vignette: 'A 52-year-old woman with alcohol-associated cirrhosis, sober for two years, has small esophageal varices on EGD and a liver stiffness of 24 kPa. She has never had ascites or bleeding.',
      eq: [dP + mo('=') + mi('Q') + mo('×') + mi('R'), 'ΔP pressure drop across the liver · Q portal flow · R resistance'],
      kicker: 'How they work', title: 'Two ways to lower portal pressure',
      line: 'Both drugs cut the portal inflow. Carvedilol also lowers the resistance inside the liver, most likely by blocking α1 receptors on the stellate cells. In this case the HVPG is {hvpg}.',
      notes: 'Portal pressure follows ΔP = Q × R. Propranolol lowers Q: β1 blockade lowers the cardiac output and β2 blockade lets the gut arterioles constrict. Carvedilol does the same and also lowers R inside the liver. α1 blockade, which relaxes the stellate cells, is the main proposed reason; it may also act through less fibrosis and better endothelial function. How much that adds depends on where the resistance sits.',
      ask: ['Name the two ways a drug can lower portal pressure.', 'Cut the inflow, or lower the resistance the blood meets.'],
    },
    {
      id: 'prop-sin', params: PROP, lens: 'flow', cam: 'portal', labels: ['SMV', 'CONF'], data: 'tiles', tiles: ['pvFlow', 'hvpg'], key: ['pvFlow'], delta: 'ohm',
      kicker: 'Cirrhosis', site: 'sin', title: 'Propranolol lowers the inflow',
      line: 'β1 blockade lowers cardiac output, and β2 blockade lets the gut arterioles constrict. Portal inflow falls to {pvFlow} and the HVPG to {hvpg}. Colored by flow, the gut veins and the portal vein thin.',
      notes: 'Propranolol is titrated to a resting heart rate of 55 to 60 a minute, keeping systolic pressure above 90 mmHg. It lowers the HVPG through the inflow alone.',
      ask: ['How does propranolol lower portal pressure?', 'It cuts the portal inflow: a lower cardiac output (β1) and constricted gut arterioles (β2).'],
    },
    {
      id: 'carv-sin', params: CARV, lens: 'drop', cam: 'lobule:sinusoid', terms: { sinusoids: 'lobule:sinusoid' }, data: 'tiles', tiles: ['hvpg', 'ppg'], key: ['hvpg'], delta: 'ohm',
      compare: [{ label: 'Propranolol', params: PROP }, { label: 'Carvedilol', own: true, params: CARV }],
      kicker: 'Cirrhosis', site: 'sin', title: 'Carvedilol lowers the HVPG further in cirrhosis',
      line: 'Most of the resistance sits in the sinusoids. Carvedilol\'s α1 blockade is thought to relax their stellate cells, so with the inflow cut too, the HVPG falls to {hvpg}. Colored by pressure drop, the sinusoids carry the large drop.',
      notes: 'Switch between the two drugs: carvedilol lowers the HVPG more than propranolol because it acts on both flow and resistance. In trials carvedilol lowers the HVPG by about 2 mmHg more than propranolol. Baveno VIII prefers carvedilol in compensated cirrhosis with clinically significant portal hypertension, to prevent decompensation.',
      ask: ['Why does carvedilol lower the HVPG more than propranolol in cirrhosis?', 'It also lowers the resistance in the sinusoids, where most of the resistance sits.'],
    },
    {
      id: 'schisto', preset: 'schisto', lens: 'drop', cam: 'lobule:triad', callout: { at: 'triad', label: 'Resistance' }, terms: { 'portal venules': 'lobule:triad' }, data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'],
      vignette: 'A 38-year-old woman who grew up along the Senegal River is found to have a large spleen. EGD shows large esophageal varices. Her liver tests are normal, and she has never bled.',
      kicker: 'Schistosomiasis', site: 'presin', title: 'In schistosomiasis the resistance sits before the sinusoids',
      line: 'Egg granulomas and scar narrow the portal venules, and the pressure is lost there. The portal vein pressure is {pv}, but the HVPG is only {hvpg}. Colored by pressure drop, the large drop sits in the portal venules.',
      notes: 'Schistosome eggs lodge in the small portal venules, and the granulomas heal as periportal fibrosis. The sinusoids are spared, so the wedge reads near-normal sinusoidal pressure and the HVPG underestimates the portal pressure. Porto-sinusoidal vascular disorder gives the same presinusoidal picture without the parasite.',
      ask: ['Why is the HVPG near normal in schistosomiasis?', 'The resistance sits in the portal venules, before the sinusoids that the wedge reads.'],
    },
    {
      id: 'prop-pre', params: PROP, lens: 'flow', cam: 'portal', labels: ['SMV', 'CONF'], data: 'tiles', tiles: ['pvFlow', 'pv'], key: ['pv'], delta: 'schisto',
      kicker: 'Schistosomiasis', site: 'presin', title: 'Propranolol also lowers presinusoidal portal pressure',
      line: 'Cutting the inflow lowers the pressure wherever the resistance sits. Portal inflow falls to {pvFlow} and the portal vein pressure to {pv}. Colored by flow, the gut veins and the portal vein thin.',
      notes: 'With the resistance fixed in scarred portal venules, cutting the inflow is the one way left to lower the pressure. Most trials in non-cirrhotic portal hypertension used propranolol, and in one, propranolol and band ligation worked equally well.',
      ask: ['Does propranolol need a sinusoidal resistance to work?', 'No. It cuts the inflow, which lowers the pressure wherever the resistance sits.'],
    },
    {
      id: 'carv-pre', params: CARV, lens: 'drop', cam: 'lobule:triad', callout: { at: 'triad', label: 'Resistance' }, terms: { 'portal venules': 'lobule:triad' }, data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'], delta: 'schisto',
      compare: [{ label: 'Propranolol', params: PROP }, { label: 'Carvedilol', own: true, params: CARV }],
      kicker: 'Schistosomiasis', site: 'presin', title: 'Carvedilol adds little in presinusoidal disease',
      line: 'In the model, carvedilol\'s α1 effect relaxes only the sinusoids, beyond the scarred portal venules, so the portal vein pressure falls to {pv}, against {pv@prop-pre} on propranolol.',
      caveat: 'Baveno VIII and EASL 2025 find no proven advantage for carvedilol in porto-sinusoidal vascular disorder (PSVD), and small schistosomiasis studies found none.',
      notes: 'Switch between the two drugs: the portal vein pressure barely changes, because carvedilol\'s extra effect acts downstream of the resistance. The HVPG does fall a little more on carvedilol, since the sinusoids relax, but in presinusoidal disease the HVPG never showed the portal pressure, so that fall does nothing for the varices.',
      ask: ['Why does carvedilol add little over propranolol in schistosomiasis?', 'Its extra effect acts on the sinusoids, but the resistance sits before them, in the portal venules.'],
    },
    {
      id: 'choose', cam: 'fit', data: 'tiles', tiles: ['map', 'pv'], key: ['map'], delta: 'schisto',
      kicker: 'Choosing', title: 'Where the resistance sits guides the choice',
      line: 'Carvedilol\'s extra effect pays off where the resistance is sinusoidal, at the cost of a lower blood pressure. In presinusoidal disease the model shows it adding little to propranolol.',
      causesHead: 'In practice', causes: ['Cirrhosis with CSPH: carvedilol preferred', 'PSVD: beta-blocker or banding, no drug preferred', 'Low blood pressure or AKI: reduce or stop'],
      caveat: 'The model\'s blood pressure barely moves; in trials carvedilol lowered it about 4 mmHg more than propranolol.',
      notes: 'Baveno VIII prefers carvedilol in compensated cirrhosis with clinically significant portal hypertension. It also prefers carvedilol with ascites and varices. In vascular liver disease such as porto-sinusoidal vascular disorder, Baveno VIII finds the evidence too thin to prefer carvedilol, and EASL 2025 recommends a non-selective beta-blocker or endoscopic treatment to prevent a first bleed and both after one, naming no drug. Neither guideline addresses schistosomiasis, where a few small studies found the two drugs alike. With ascites, or whenever the systolic pressure stays below 90 mmHg or acute kidney injury develops, the dose is reduced or the drug stopped.',
      ask: ['In which kind of portal hypertension does carvedilol\'s extra effect matter most?', 'Sinusoidal, as in cirrhosis, where its extra effect acts on the resistance itself.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'ppg', 'map'], asc: false, rowHead: 'Patient',
      of: [{ id: 'ohm', kicker: 'Sinusoidal', site: 'sin', title: 'Cirrhosis, untreated', ref: true }, { id: 'prop-sin', kicker: 'Sinusoidal', title: 'Cirrhosis, propranolol', vs: 'ohm' }, { id: 'carv-sin', kicker: 'Sinusoidal', title: 'Cirrhosis, carvedilol', vs: 'prop-sin' },
        { id: 'schisto', kicker: 'Presinusoidal', title: 'Schistosomiasis, untreated', ref: true }, { id: 'prop-pre', kicker: 'Presinusoidal', title: 'Schistosomiasis, propranolol', vs: 'schisto' }, { id: 'carv-pre', kicker: 'Presinusoidal', title: 'Schistosomiasis, carvedilol', vs: 'prop-pre' }],
      kicker: 'Summary', title: 'Where carvedilol adds to propranolol',
      line: 'Both drugs lower the PPG in both diseases. Carvedilol lowers it clearly more only in cirrhosis, where the resistance is sinusoidal.',
      notes: 'Each propranolol row is set against the same patient untreated, and each carvedilol row against propranolol. In cirrhosis carvedilol lowers the HVPG and the PPG further than propranolol; in schistosomiasis the two give about the same gradient. Pressures are shown to the whole mmHg, so the small extra fall in the HVPG on carvedilol in schistosomiasis does not show here. The trial figures come from a 2025 meta-analysis of seven trials in cirrhosis (Joshi) and two small schistosomiasis studies (Razafindrazoto 2022, de Abreu 2022).',
      ask: ['In which kind of portal hypertension does carvedilol add most over propranolol?', 'Sinusoidal, as in cirrhosis.'],
    },
  ],
};
