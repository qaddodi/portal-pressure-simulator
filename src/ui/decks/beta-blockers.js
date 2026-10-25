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
    'Explain why carvedilol lowers the pressure more than propranolol only where the resistance is sinusoidal',
    'Compare propranolol and carvedilol in cirrhosis and in schistosomiasis',
    'Explain why the HVPG misleads when judging a drug in presinusoidal disease',
  ],
  checks: [
    ['What does carvedilol add to propranolol?', 'It lowers the resistance inside the liver as well as the inflow, most likely through α1 blockade of the stellate cells.'],
    ['Why does carvedilol\'s extra effect add little in schistosomiasis?', 'The resistance is scar in the portal venules, before the sinusoids where its extra effect acts.'],
    ['On carvedilol the HVPG falls a little in schistosomiasis. Did the portal pressure fall more?', 'No. The HVPG reads the sinusoids, not the portal vein; the portal pressure fell about as much as on propranolol.'],
    ['On propranolol the heart rate falls from 80 to 58, but the HVPG only from 18 to 17.5 mmHg. Has the portal pressure responded?', 'No. The heart rate shows the β1 blockade, not the portal response; a fall under 10% marks a non-responder.'],
  ],
  summary: 'Propranolol and carvedilol compared in cirrhosis and in schistosomiasis. Both cut the portal inflow; only carvedilol lowers the resistance in the sinusoids, so it lowers the pressure more only where the resistance is sinusoidal.',
  slides: [
    {
      id: 'ohm', preset: 'csph', cam: 'route', data: 'tiles', tiles: ['hvpg', 'pvFlow'], key: ['hvpg'],
      vignette: 'A 52-year-old woman with alcohol-associated cirrhosis, sober for two years, has small esophageal varices on EGD and a liver stiffness of 24 kPa. She has never had ascites or bleeding.',
      eq: [dP + mo('=') + mi('Q') + mo('×') + mi('R'), 'ΔP pressure drop across the liver · Q portal flow · R resistance'],
      kicker: 'How they work', title: 'Two ways to lower portal pressure',
      line: 'Propranolol and carvedilol both cut the portal inflow. Only carvedilol lowers the resistance inside the liver. In this case the HVPG is {hvpg}.',
      notes: 'Portal pressure follows ΔP = Q × R. Propranolol lowers Q: β1 blockade lowers the cardiac output and β2 blockade lets the gut arterioles constrict. Carvedilol does the same and also lowers R inside the liver. α1 blockade, which relaxes the stellate cells, is the main proposed reason; it may also act through less fibrosis and better endothelial function. How much that adds depends on where the resistance sits.',
      ask: ['Name the two ways a drug can lower portal pressure.', 'Cut the inflow, or lower the resistance the blood meets.'],
    },
    {
      id: 'prop-sin', params: PROP, lens: 'flow', cam: 'portal', labels: ['SMV', 'CONF'], data: 'tiles', tiles: ['pvFlow', 'hvpg'], key: ['pvFlow'], delta: 'ohm', hvpgResp: 'ohm',
      kicker: 'Cirrhosis', site: 'sin', title: 'Propranolol lowers the portal inflow',
      line: 'Propranolol\'s β1 blockade lowers cardiac output, and its β2 blockade lets the gut arterioles constrict. Portal inflow falls to {pvFlow} and the HVPG to {hvpg}. Colored by flow, the gut veins and the portal vein thin.',
      notes: 'Propranolol is titrated to a resting heart rate of 55 to 60 a minute, keeping systolic pressure above 90 mmHg. It lowers the HVPG through the inflow alone.',
      ask: ['How does propranolol lower portal pressure?', 'It cuts the portal inflow: a lower cardiac output (β1) and constricted gut arterioles (β2).'],
    },
    {
      id: 'carv-sin', params: CARV, lens: 'since', sinceLabel: 'propranolol', cam: 'lobule:sinusoid', terms: { sinusoids: 'lobule:sinusoid' },
      tool: { kind: 'curve', param: 'cirrhosis', from: 0.3, to: 0.9, step: 0.05, lines: ['hvpg'], against: { label: 'Propranolol', params: PROP, own: 'Carvedilol' } }, data: 'tiles', tiles: ['hvpg', 'ppg'], key: ['hvpg'], delta: 'prop-sin', hvpgResp: 'ohm',
      compare: [{ label: 'Propranolol', params: PROP }, { label: 'Carvedilol', own: true, params: CARV }],
      kicker: 'Cirrhosis', site: 'sin', title: 'Carvedilol lowers the HVPG more than propranolol in cirrhosis',
      line: 'Most of the resistance sits in the sinusoids. Carvedilol\'s α1 blockade is thought to relax their stellate cells, and with the lower inflow the HVPG falls to {hvpg}. Colored by change against propranolol, pressure in the sinusoids falls further.',
      notes: 'Switch between the two drugs: carvedilol acts on both flow and resistance, so it lowers the HVPG more; in trials, by about 2 mmHg more than propranolol. The chart runs the same patient from mild to advanced cirrhosis on each drug: in the model the gap between the two lines widens as the sinusoidal resistance grows, from under 1 mmHg to about 2 mmHg. Baveno VIII prefers carvedilol in compensated cirrhosis with clinically significant portal hypertension, to prevent decompensation.',
      ask: ['Why does carvedilol lower the HVPG more than propranolol in cirrhosis?', 'Unlike propranolol, it lowers the resistance in the sinusoids, where most of the resistance sits.'],
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
      kicker: 'Schistosomiasis', site: 'presin', title: 'Propranolol lowers portal pressure in schistosomiasis',
      line: 'In this case portal inflow falls to {pvFlow} and the portal vein pressure to {pv}, though the scarred portal venules stay as narrow as before. Colored by flow, the gut veins and the portal vein thin.',
      notes: 'With the resistance fixed in scarred portal venules, cutting the inflow is the one way left to lower the pressure. Most trials in non-cirrhotic portal hypertension used propranolol, and in one, propranolol and band ligation worked equally well.',
      ask: ['Does propranolol need a sinusoidal resistance to work?', 'No. It cuts the inflow, which lowers the pressure wherever the resistance sits.'],
    },
    {
      id: 'carv-pre', params: CARV,
      question: 'Will carvedilol add much when the resistance is before the sinusoids?', lens: 'since', sinceLabel: 'propranolol', cam: 'lobule:triad', callout: { at: 'triad', label: 'Resistance' }, terms: { 'portal venules': 'lobule:triad' }, data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'], delta: 'prop-pre',
      compare: [{ label: 'Propranolol', params: PROP }, { label: 'Carvedilol', own: true, params: CARV }],
      kicker: 'Schistosomiasis', site: 'presin', title: 'Carvedilol adds little to propranolol in presinusoidal disease',
      line: 'In the model, carvedilol\'s extra effect acts on the sinusoids, beyond the scarred portal venules: the portal vein pressure is {pv}, against {pv@prop-pre} on propranolol. The HVPG falls more, but it reads only the sinusoids.',
      caveat: 'Baveno VIII and EASL 2025 find no proven advantage for carvedilol in porto-sinusoidal vascular disorder (PSVD), and small schistosomiasis studies found none.',
      notes: 'Switch between the two drugs: the portal vein pressure barely changes, because carvedilol\'s extra effect acts downstream of the resistance. The HVPG does fall a little more on carvedilol, since the sinusoids relax, but in presinusoidal disease the HVPG never showed the portal pressure, so that fall does nothing for the varices.',
      ask: ['Switch to carvedilol. What happens to the portal vein pressure, and why?', 'It barely changes: carvedilol\'s extra effect acts on the sinusoids, beyond the resistance in the portal venules.'],
    },
    {
      id: 'choose', cam: 'fit', data: 'tiles',
      tool: { kind: 'criteria', title: 'In practice', ticks: false, rows: ['Cirrhosis with CSPH: carvedilol preferred', 'PSVD: a beta-blocker or banding, no drug preferred', 'Low blood pressure or AKI: reduce or stop'] }, tiles: ['map', 'pv'], key: ['map'], delta: 'schisto',
      cite: 'Baveno VIII 3.15, 4.6, 8.8, 8.9',
      kicker: 'Choosing', title: 'Where the resistance sits guides the choice of beta-blocker',
      line: 'In cirrhosis carvedilol lowers the HVPG more than propranolol, at the cost of a lower blood pressure. In presinusoidal disease the model shows carvedilol adding little.',
      caveat: 'The model\'s blood pressure barely moves; in trials carvedilol lowered it about 4 mmHg more than propranolol.',
      notes: 'Baveno VIII prefers carvedilol in compensated cirrhosis with clinically significant portal hypertension, and with ascites and varices. In vascular liver disease such as porto-sinusoidal vascular disorder, Baveno VIII finds the evidence too thin to prefer carvedilol, and EASL 2025 recommends a non-selective beta-blocker or endoscopic treatment to prevent a first bleed and both after one, naming no drug. Neither guideline addresses schistosomiasis, where a few small studies found the two drugs alike. Whenever the systolic pressure stays below 90 mmHg, the mean pressure below 65 mmHg, or kidney injury develops, the beta-blocker dose is reduced or the drug stopped, and restarted once these resolve.',
      ask: ['What do you do with carvedilol if the systolic pressure stays below 90 mmHg?', 'Reduce the dose or stop it.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'ppg', 'map'], asc: false, rowHead: 'Patient',
      of: [{ id: 'ohm', kicker: 'Sinusoidal', site: 'sin', title: 'Cirrhosis, untreated', ref: true }, { id: 'prop-sin', kicker: 'Sinusoidal', title: 'Cirrhosis, propranolol', vs: 'ohm' }, { id: 'carv-sin', kicker: 'Sinusoidal', title: 'Cirrhosis, carvedilol', vs: 'prop-sin' },
        { id: 'schisto', kicker: 'Presinusoidal', title: 'Schistosomiasis, untreated', ref: true }, { id: 'prop-pre', kicker: 'Presinusoidal', title: 'Schistosomiasis, propranolol', vs: 'schisto' }, { id: 'carv-pre', kicker: 'Presinusoidal', title: 'Schistosomiasis, carvedilol', vs: 'prop-pre' }],
      kicker: 'Summary', title: 'Where carvedilol adds to propranolol',
      line: 'Propranolol lowers the PPG in both patients. Carvedilol lowers it further only in cirrhosis, where the resistance is sinusoidal.',
      notes: 'Each propranolol row is set against the same patient untreated, and each carvedilol row against propranolol. In cirrhosis carvedilol lowers the HVPG and the PPG further than propranolol; in schistosomiasis the two give about the same gradient. Pressures are shown to the whole mmHg, so the small extra fall in the HVPG on carvedilol in schistosomiasis does not show here. The trial figures come from a 2025 meta-analysis of seven trials in cirrhosis (Joshi) and two small schistosomiasis studies (Razafindrazoto 2022, de Abreu 2022).',
      ask: ['In which kind of portal hypertension does carvedilol add most over propranolol?', 'Sinusoidal, as in cirrhosis.'],
    },
  ],
};
