// Presenter talk: the circulation as an electrical circuit, pressure = flow × resistance, on the circuit view
// throughout (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;
const frac = (n, d) => `<mfrac><mrow>${n}</mrow><mrow>${d}</mrow></mfrac>`;
const dP = '<mrow><mi mathvariant="normal">Δ</mi><mi>P</mi></mrow>';

const K = 'The circuit';
const C = 'circuit';
const R = ['rLiver', 'rColl'];   // the resistors on the figure: the liver's, and the collaterals' once they open
const MEAL = { days: 8, ramp: { splanchnicTone: [1, 0.72] }, lapse: { seconds: 6, from: 'Fasting', to: 'After a meal' } };

export const CIRCUIT = {
  id: 'circuit', level: 'foundation', title: 'The circuit: pressure, flow and resistance', minutes: 10,
  objectives: [
    'Read portal pressure as flow times resistance',
    'Explain why a meal raises portal pressure more in cirrhosis',
    'Explain why collaterals fail to decompress the portal system',
    'Place TIPS, propranolol and carvedilol on the flow or resistance side',
  ],
  summary: 'Portal hypertension as a circuit: more flow, more resistance, collaterals in parallel, TIPS and the drugs, each read as ΔP = Q × R.',
  slides: [
    {
      id: 'ohm', preset: 'healthy', view: C, sites: R, data: 'tiles', tiles: ['pvFlow', 'ppg'],
      kicker: K, title: 'Pressure, flow and resistance',
      eq: [dP + mo('=') + mi('Q') + mo('×') + mi('R'), 'ΔP pressure drop · Q flow · R resistance'],
      line: 'Pressure falls across each resistance in proportion to the flow through it.',
      notes: 'The heart is the pump; arterioles, capillaries, sinusoids and veins are resistors in series. The same law as Ohm\'s: the drop in pressure across a segment is the flow through it times its resistance. Portal hypertension is a rise in the drop across the liver, so either the flow or the resistance has risen, and usually both.',
      ask: ['Name the two ways the pressure drop across the liver can rise.', 'More flow through it, or more resistance to that flow.'],
    },
    {
      id: 'where', view: C, sites: R, data: 'ladder', key: ['pv', 'hvpg'],
      kicker: K, title: 'Where the pressure falls',
      line: 'The gut arterioles spend most of the pressure before blood reaches the portal vein. A healthy liver drops only a few mmHg.',
      notes: 'Mean arterial pressure is about 90 mmHg; the portal vein is under 10. The splanchnic arterioles are the largest resistance in the circuit and they set the portal inflow. Normal sinusoids are wide and many, so the HVPG is 1 to 5 mmHg.',
      ask: ['Which resistance sets the portal inflow?', 'The splanchnic (gut) arterioles.'],
    },
    {
      id: 'meal', ...MEAL, view: C, sites: R, data: 'tiles', tiles: ['pvFlow', 'ppg'], delta: true,
      kicker: K, title: 'More flow: a meal',
      line: 'After a meal the gut arterioles open and portal flow rises by about a quarter. Across a low resistance, the gradient barely moves.',
      notes: 'The Q term. The rise in the gradient is the rise in flow times the hepatic resistance, and a healthy liver\'s resistance is small. The same meal on a cirrhotic liver comes back on the slide "Flow and resistance together".',
      ask: ['Why does a meal barely change portal pressure in a healthy liver?', 'The extra flow crosses a very low resistance.'],
    },
    {
      id: 'resist', preset: 'csph', view: C, sites: R, data: 'tiles', tiles: ['pvFlow', 'hvpg', 'ppg'], delta: 'ohm',
      kicker: K, site: 'sin', title: 'More resistance: cirrhosis',
      line: 'Scarred sinusoids resist the same flow several times more, so the pressure drop across the liver rises in proportion.',
      notes: 'The R term. In cirrhosis about three quarters of the extra resistance is fixed (fibrosis, nodules, capillarized sinusoids) and a quarter is tone: contracted stellate cells and too little nitric oxide in the sinusoids. The tone is what drugs can reverse. The tiles compare with the healthy liver on the first slide; the portal flow is almost the same.',
      ask: ['What part of the intrahepatic resistance can drugs lower?', 'The dynamic part: stellate cell and vascular tone.'],
    },
    {
      id: 'both', ...MEAL, view: C, sites: R, data: 'tiles', tiles: ['pvFlow', 'hvpg'], delta: true,
      kicker: K, site: 'sin', title: 'Flow and resistance together',
      line: 'The same meal now raises HVPG several times more: the rise in flow crosses a higher resistance.',
      notes: 'In cirrhosis the splanchnic arterioles dilate for good (nitric oxide, glucagon, bacterial products), so the inflow stays high: the hyperdynamic circulation. A raised resistance and a raised inflow multiply. The postprandial rise in HVPG is one reason meals and large transfusions raise the risk of a variceal bleed.',
      ask: ['What keeps portal inflow high in advanced cirrhosis?', 'Splanchnic arteriolar dilatation, the hyperdynamic circulation.'],
    },
    {
      id: 'parallel', preset: 'cirr-decomp', view: C, sites: [...R, 'split'], data: 'tiles', tiles: ['shunt', 'liver', 'ppg'], delta: false,
      kicker: K, site: 'sin', title: 'A parallel path',
      eq: [frac('<mn>1</mn>', sub(mi('R'), 'total')) + mo('=') + frac('<mn>1</mn>', sub(mi('R'), 'liver')) + mo('+') + frac('<mn>1</mn>', sub(mi('R'), 'collaterals')), 'Resistances in parallel: the total is lower than either'],
      line: 'Collaterals are resistors in parallel with the liver. They take much of the portal flow, yet the gradient stays high.',
      notes: 'Collaterals open where portal and systemic veins meet: the esophagus, the umbilicus, the rectum and behind the gut. They lower the total resistance, but they are narrow and the inflow keeps rising, so the gradient stays high. They also carry blood and its ammonia past the liver, and the liver\'s own share of the portal blood falls.',
      ask: ['Why do collaterals not relieve portal hypertension?', 'Their resistance is still high and the inflow rises with them, so the gradient stays high.'],
    },
    {
      id: 'tips', params: { tips: { on: true } }, view: C, sites: R, data: 'tiles', tiles: ['ppg', 'shunt', 'liver'], delta: true,
      kicker: K, site: 'sin', title: 'TIPS: a low resistor in parallel',
      line: 'A wide stent beside the sinusoids. The gradient falls by about half, and blood that reached the liver now bypasses it.',
      notes: 'A covered stent 8 to 10 mm wide has a far lower resistance than the sinusoids or any collateral, so most portal blood takes it. The gradient falls below 12 mmHg; the cost is less portal blood for the liver and a risk of encephalopathy. An 8 mm stent is a compromise between the two.',
      ask: ['What does TIPS cost the liver?', 'Most of its portal blood, and with it a risk of encephalopathy.'],
    },
    {
      id: 'drugs', params: { tips: { on: false }, drugs: { propranolol: true } }, view: C, sites: R, data: 'tiles', tiles: ['hvpg', 'pvFlow'], delta: 'parallel',
      compare: [{ label: 'Propranolol', own: true, params: { drugs: { propranolol: true, carvedilol: false } } }, { label: 'Carvedilol', params: { drugs: { propranolol: false, carvedilol: true } } }],
      kicker: K, site: 'sin', title: 'Drugs act on Q; carvedilol on R too',
      line: 'Propranolol lowers the inflow. Carvedilol also relaxes the resistance inside the liver, so HVPG falls further.',
      notes: 'Propranolol lowers the cardiac output (β1) and lets the gut arterioles constrict (β2): Q falls. Carvedilol adds α1 blockade, which relaxes the stellate cells and lowers the dynamic part of R. Switch between them: carvedilol lowers HVPG more with less fall in portal flow. The tiles compare with the untreated patient.',
      ask: ['Which term of ΔP = Q × R does carvedilol act on that propranolol does not?', 'R, the intrahepatic resistance, through α1 blockade.'],
    },
    {
      // Each row against the row it changes (vs), in the circuit's own terms: portal flow (Q), the liver's own resistance (R) and the gradient.
      id: 'summary', visual: 'table', cols: ['pvFlow', 'res', 'ppg'], asc: false, rowHead: 'Circuit',
      foot: 'Across the whole circuit R = PPG ÷ Q; collaterals and TIPS lower it as resistors in parallel, while the liver R column shows the liver itself',
      of: [{ kicker: 'Reference', id: 'ohm', title: 'Healthy' }, { kicker: 'More flow', id: 'meal', title: 'Healthy, after a meal', vs: 'ohm' }, { kicker: 'More resistance', id: 'resist', title: 'Cirrhosis', vs: 'ohm' }, { kicker: 'Both', id: 'both', title: 'Cirrhosis, after a meal', vs: 'resist' },
        { kicker: 'Parallel resistor', id: 'parallel', title: 'With collaterals', vs: 'resist' }, { kicker: 'Parallel resistor', id: 'tips', title: 'TIPS', vs: 'parallel' }, { kicker: 'Less flow', id: 'drugs', title: 'Propranolol', vs: 'parallel' }],
      kicker: 'Summary', title: 'Every slide is ΔP = Q × R',
      line: 'Each row against the row it changes: the gradient (PPG) moves with the flow (Q) times the resistance (R).',
      notes: 'Each row changes Q, R or both, compared with the healthy circuit. A meal raises Q; cirrhosis raises R; collaterals and TIPS add resistors in parallel; drugs lower Q, and carvedilol also R.',
      ask: ['Classify TIPS, propranolol and a meal by the term they change.', 'TIPS lowers R (in parallel); propranolol lowers Q; a meal raises Q.'],
    },
  ],
};
