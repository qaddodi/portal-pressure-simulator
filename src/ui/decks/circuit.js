// Presenter talk: the circulation as an electrical circuit, pressure = flow × resistance, on the circuit view
// throughout (the slide fields are described at the top of decks.js).

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;
const frac = (n, d) => `<mfrac><mrow>${n}</mrow><mrow>${d}</mrow></mfrac>`;
const dP = '<mrow><mi mathvariant="normal">Δ</mi><mi>P</mi></mrow>';

const K = 'The circuit';
const C = 'circuit';
const R = ['rLiver', 'rColl'];   // the resistors on the figure: the liver's, and the collaterals' once they open
// Every collateral shut: the same advanced liver as 'parallel' without them, so its row changes only the parallel resistor.
const NO_COLLATERALS = { C1a: 1, C1b: 1, C2: 1, C3: 1, C4: 1, C5: 1, C6: 1, C7: 1, C8: 1, C9: 1 };
const MEAL = { days: 8, ramp: { meal: [0, 1] }, lapse: { seconds: 6, from: 'Fasting', to: 'After a meal' } };

// 'resistance' and 'collaterals' in a line take their resistor's colour and light its zigzag on the figure.
const POINTS = { resistance: 'rLiver', collaterals: 'rColl' };
const withPoints = (d) => ({ ...d, slides: d.slides.map((s) => (s.visual ? s : { terms: POINTS, ...s })) });

export const CIRCUIT = withPoints({
  id: 'circuit', level: 'foundation', title: 'Portal pressure as a circuit', minutes: 8,
  // (Every slide shares one kicker, so the outline's sections name the slides.)
  sections: [['Flow and resistance', ['ohm', 'where', 'meal']], ['Cirrhosis', ['resist', 'both']], ['Collaterals', ['parallel']], ['Treatment', ['tips']]],
  objectives: [
    'Read portal pressure as flow times resistance',
    'Explain why a meal raises portal pressure more in cirrhosis',
    'Explain why collaterals fail to decompress the portal system',
    'Place a TIPS on the resistance side of ΔP = Q × R',
  ],
  checks: [
    ['How does pressure relate to flow and resistance?', 'The pressure drop equals flow times resistance: ΔP = Q × R.'],
    ['Why does a meal raise the gradient more in cirrhosis?', 'The extra flow crosses a higher resistance, so even a smaller rise in flow adds more pressure.'],
    ['Why does a TIPS lower the gradient when collaterals do not?', 'The stent has far less resistance than the sinusoids or any collateral, so most portal blood goes through it.'],
    ['Collaterals open and carry most of the portal blood, yet the PPG stays high. Which terms of ΔP = Q × R explain it?', 'The total inflow (Q) rises as the gut arteries widen, and the blood that still crosses the liver meets its high resistance (R).'],
  ],
  summary: 'Portal hypertension as a circuit: more flow, more resistance, collaterals in parallel and TIPS, each read as ΔP = Q × R.',
  slides: [
    {
      id: 'ohm', preset: 'healthy', view: C, sites: R, span: [{ from: 'CONF', to: 'IVCS', label: 'PPG {ppg}' }], data: 'tiles', tiles: ['pvFlow', 'ppg'],
      kicker: K, title: 'Pressure falls in proportion to flow and resistance',
      eq: [dP + mo('=') + mi('Q') + mo('×') + '<mi class="eq-wedge">R</mi>', 'ΔP pressure drop · Q flow · R resistance'],
      line: 'The pressure drop across a segment equals its flow times its resistance (ΔP = Q × R). Across the liver it rises when flow or resistance rises, usually both.',
      notes: 'The heart is the pump; arterioles, capillaries, sinusoids and veins are resistors in series. The same law as Ohm\'s: the drop in pressure across a segment is the flow through it times its resistance. Portal hypertension is a rise in the drop across the liver, so either the flow or the resistance has risen, and usually both.',
      ask: ['Name the two ways the pressure drop across the liver can rise.', 'More flow through it, or more resistance to that flow.'],
    },
    {
      id: 'where', lens: 'drop', view: C, zone: 'splanchnic', sites: [...R, 'rGut'], terms: ['rGut'], tool: { kind: 'profile' }, key: ['pv', 'hvpg'],
      kicker: K, title: 'Most of the pressure drop is across the gut arterioles',
      line: 'The gut arterioles take most of the arterial pressure, and a healthy liver drops only a few mmHg more. Colored by pressure drop, they are darkest.',
      notes: 'Mean arterial pressure is about 90 mmHg; the portal vein is under 10. The splanchnic arterioles are the largest resistance in the circuit and they set the portal inflow. Normal sinusoids are wide and many, so the HVPG is 1 to 5 mmHg.',
      ask: ['Which resistance sets the portal inflow?', 'The splanchnic (gut) arterioles: they are the largest resistance before the portal vein.'],
    },
    {
      id: 'meal', ...MEAL, view: C, sites: R, span: [{ from: 'CONF', to: 'IVCS', label: 'PPG {ppg}' }], data: 'tiles', tiles: ['pvFlow', 'ppg'], delta: true,
      kicker: K, title: 'A meal raises portal flow but barely the gradient',
      line: 'A healthy liver has very little resistance, so even a large rise in flow adds little pressure (gradient = flow × resistance).',
      notes: 'In people portal flow rises by 40 to 80% after a meal; the model shows a rise of about half. The Q term. The rise in the gradient is the rise in flow times the hepatic resistance, and a healthy liver\'s resistance is small. The same meal on a cirrhotic liver comes back two slides on.',
      ask: ['Why does a meal barely change portal pressure in a healthy liver?', 'The extra flow crosses a very low resistance.'],
    },
    {
      id: 'resist', preset: 'csph', view: C, zone: 'liver', sites: R, span: [{ from: 'CONF', to: 'IVCS', label: 'PPG {ppg}' }], data: 'tiles', tiles: ['pvFlow', 'hvpg', 'ppg'], delta: 'ohm',
      whatIf: { label: 'Scarring', param: 'cirrhosis', min: 0, max: 1, step: 0.05, ends: ['None', 'Severe'] },
      kicker: K, site: 'sin', title: 'Cirrhosis raises the resistance in the liver',
      line: 'Scarring raises the resistance several-fold. Part of the rise is vascular tone, which drugs can relax.',
      notes: 'The R term. In cirrhosis about three quarters of the extra resistance is fixed (fibrosis, nodules, capillarized sinusoids) and a quarter is tone: contracted stellate cells and too little nitric oxide in the sinusoids. The tone is what drugs can reverse. The tiles compare with the healthy liver on the first slide; the portal flow is almost the same.',
      ask: ['What part of the intrahepatic resistance can drugs lower?', 'The dynamic part, stellate cell and vascular tone; scar and nodules do not relax.'],
    },
    {
      id: 'both', ...MEAL,
      question: 'In cirrhosis, will the same meal raise the gradient more?', view: C, sites: R, span: [{ from: 'CONF', to: 'IVCS', label: 'PPG {ppg}' }], data: 'tiles', tiles: ['pvFlow', 'hvpg'], delta: true,
      kicker: K, site: 'sin', title: 'In cirrhosis the same meal raises the gradient more',
      line: 'The gradient rises more even though the flow rises less, because the extra flow now crosses a higher resistance.',
      notes: 'In cirrhosis the splanchnic arterioles dilate for good (nitric oxide, glucagon, bacterial products), so the inflow stays high: the hyperdynamic circulation. A raised resistance and a raised inflow multiply. The rise is less than the resistance alone would predict: in cirrhosis the meal raises flow less, and part of it leaves through collaterals. Large transfusions raise the portal pressure the same way and can provoke a variceal bleed; meals may too.',
      ask: ['Why does the same meal raise the gradient more in cirrhosis?', 'The extra flow, though smaller, crosses a higher resistance (ΔP = Q × R).'],
    },
    {
      id: 'parallel', lens: 'flow', preset: 'cirr-decomp', view: C, sites: [...R, 'split'], tool: { kind: 'flows' }, data: 'tiles', tiles: ['liver', 'ppg'], delta: false,
      kicker: K, site: 'sin', title: 'Collaterals divert flow without normalizing the gradient',
      eq: [frac('<mn>1</mn>', sub(mi('R'), 'total')) + mo('=') + frac('<mn>1</mn>', '<msub class="eq-wedge"><mi>R</mi><mtext>liver</mtext></msub>') + mo('+') + frac('<mn>1</mn>', '<msub class="eq-var"><mi>R</mi><mtext>collaterals</mtext></msub>'), 'Resistances in parallel: the total is lower than either'],
      line: 'Collaterals run in parallel with the liver. Colored by flow, they take a large share of the portal blood, yet the rest still meets the liver\'s high resistance.',
      notes: 'Total inflow rises as the collaterals open. Collaterals open where portal and systemic veins meet: the esophagus, the umbilicus, the rectum and behind the gut. They lower the total resistance, but they are narrow and the inflow keeps rising, so the gradient stays high. They also carry blood and its ammonia past the liver, and the liver\'s own share of the portal blood falls.',
      ask: ['Why do collaterals not relieve portal hypertension?', 'Their resistance is still high and the inflow rises with them, so the gradient stays high.'],
    },
    {
      id: 'tips', lens: 'flow', params: { tips: { on: true } }, view: C, sites: R, data: 'tiles', tiles: ['ppg', 'shunt', 'liver'], delta: true,
      kicker: K, site: 'sin', title: 'TIPS lowers the gradient by bypassing the liver',
      line: 'A covered stent beside the sinusoids has far less resistance than they or any collateral do. Colored by flow, it carries most of the portal blood, and the gradient halves.',
      notes: 'A covered stent 8 to 10 mm wide has a far lower resistance than the sinusoids or any collateral, so most portal blood takes it. The gradient falls below 12 mmHg; the cost is less portal blood for the liver and a risk of encephalopathy. An 8 mm stent is a compromise between the two.',
      ask: ['What does TIPS cost the liver?', 'Most of its portal blood; and gut blood, with its ammonia, now reaches the brain unfiltered.'],
    },
    {
      // (The relation chart before the summary: the CSPH liver and a healthy one, each swept from narrow to wide gut arterioles,
      // the PPG read against the portal flow it carries. The ring is this patient.)
      id: 'relation', preset: 'csph', view: C, sites: R,
      tool: { kind: 'curve', x: 'pvFlow', param: 'splanchnicTone', from: 0.6, to: 1.6, step: 0.1, lines: ['ppg'], against: { label: 'Healthy liver', params: { cirrhosis: 0 }, own: 'Cirrhosis' } },
      kicker: 'Summary', site: 'sin', title: 'The slope of each line is its resistance',
      line: 'Each line is one liver as its inflow changes. The same rise in flow lifts the PPG about three times as much in cirrhosis; this liver carries {pvFlow} at {ppg}.',
      notes: 'Each line holds the liver fixed and changes only the gut arterioles, from narrow to wide, so the flow into the portal vein changes. Read as ΔP = Q × R, the slope of each line is the resistance the flow meets: about 2 mmHg per L/min in the healthy liver and about 6 in cirrhosis. That is why a meal or splanchnic vasodilation lifts the gradient more in cirrhosis, and why a drug that lowers the inflow lowers it more there too. The ring is this patient with CSPH. (AASLD 2024 p. 1181: portal pressure is proportional to the splanchnic inflow and to the resistance opposing it.)',
      ask: ['Two livers get the same extra 0.5 L/min of portal flow. Why does the cirrhotic one gain more pressure?', 'Its resistance is higher, so each L/min of flow costs more pressure: the line is steeper.'],
    },
    {
      // Each row against the row it changes (vs), in the circuit's own terms: portal flow (Q), the liver's own resistance (R) and the gradient.
      id: 'summary', visual: 'table', cols: ['pvFlow', 'res', 'ppg'], asc: false, rowHead: 'Circuit',
      foot: 'Across the whole circuit R = PPG ÷ Q; collaterals and TIPS lower it as resistors in parallel, while the liver R column shows the liver itself.',
      of: [{ kicker: 'Reference', id: 'ohm', title: 'Healthy' }, { kicker: 'More flow', id: 'meal', title: 'Healthy, after a meal', vs: 'ohm', calm: ['ppg'] }, { kicker: 'More resistance', id: 'resist', title: 'Cirrhosis', vs: 'ohm' }, { kicker: 'Both', id: 'both', title: 'Cirrhosis, after a meal', vs: 'resist' },
        { preset: 'cirr-decomp', params: { occluded: NO_COLLATERALS }, key: 'nocoll', kicker: 'More resistance', title: 'Advanced cirrhosis, no collaterals', vs: 'resist' },
        { kicker: 'Parallel resistor', id: 'parallel', title: 'With collaterals', vs: 'nocoll' }, { kicker: 'Parallel resistor', id: 'tips', title: 'TIPS', vs: 'parallel' }],
      kicker: 'Summary', title: 'Each change, read as ΔP = Q × R',
      line: 'Each row shows how one change moved flow (Q), resistance (R) and the gradient (PPG), against the row it changes.',
      notes: 'Each row changes Q, R or both, compared with the healthy circuit. A meal raises Q; cirrhosis raises R; collaterals and TIPS add resistors in parallel. Drugs that lower Q or R are in Lowering portal pressure.',
      ask: ['Classify TIPS, a meal and cirrhosis by the term they change.', 'TIPS lowers R, as a resistor in parallel; a meal raises Q as the gut arterioles open; cirrhosis raises R.'],
    },
  ],
});
