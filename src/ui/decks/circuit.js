// Presenter talk: the circulation as an electrical circuit, pressure = flow × resistance, on the circuit view
// throughout (the slide fields are described at the top of decks.js). Each slide frames what it teaches: `cam` names a Circuit region
// (cam-frame.js CIRC_REGIONS), or `zone` does by default; the relation chart and the summary table stay at the fit.

const mi = (x) => `<mi>${x}</mi>`, mo = (x) => `<mo>${x}</mo>`, sub = (b, i) => `<msub>${b}<mtext>${i}</mtext></msub>`;
const frac = (n, d) => `<mfrac><mrow>${n}</mrow><mrow>${d}</mrow></mfrac>`;
const dP = '<mrow><mi mathvariant="normal">Δ</mi><mi>P</mi></mrow>';

const K = 'The circuit';
const C = 'circuit';
const R = ['rLiver', 'rColl'];   // the resistors on the figure: the liver's, and the collaterals' once they open
// Every collateral shut: the same advanced liver as 'parallel' without them, so its row changes only the parallel resistor.
const NO_DRUG = { drugs: { propranolol: false, carvedilol: false } };
const NO_COLLATERALS = { C1a: 1, C1b: 1, C2: 1, C3: 1, C4: 1, C5: 1, C6: 1, C7: 1, C8: 1, C9: 1 };
// (A meal is half an hour, not eight disease days: it plays on the bedside clock, so the spleen, the varix and the ascites do not move with it.)
const MEAL = { days: 8, ramp: { meal: [0, 1] }, lapse: { seconds: 6, from: 'Fasting', to: 'After a meal', clock: 'seconds' } };

// 'resistance' and 'collaterals' in a line take their resistor's colour and light its zigzag on the figure.
const POINTS = { resistance: 'rLiver', collaterals: 'rColl' };
const withPoints = (d) => ({ ...d, slides: d.slides.map((s) => (s.visual ? s : { terms: POINTS, ...s })) });

export const CIRCUIT = withPoints({
  id: 'circuit', level: 'foundation', keepPinch: true, zoomTiles: true, title: 'Portal pressure as a circuit', minutes: 8,
  // (Every slide shares one kicker, so the outline's sections name the slides.)
  sections: [['Flow and resistance', ['ohm', 'where', 'meal']], ['Cirrhosis', ['resist', 'both']], ['Collaterals', ['parallel']], ['Treatment', ['tips']]],
  objectives: [
    'Interpret the portal pressure gradient as flow times resistance',
    'Explain why a meal raises portal pressure more in cirrhosis',
    'Explain why collaterals fail to decompress the portal system',
    'Place a TIPS on the resistance side of ΔP = Q × R',
  ],
  checks: [
    ['How does pressure relate to flow and resistance?', 'The pressure drop equals flow times resistance: ΔP = Q × R.'],
    ['Why does a meal raise the gradient more in cirrhosis?', 'The extra flow crosses a higher resistance, so even a smaller rise in flow adds more pressure.'],
    ['Why does a TIPS lower the gradient when collaterals do not?', 'The stent has far less resistance than the sinusoids or any collateral, so most portal flow is diverted through it.'],
    ['Collaterals open and carry most of the portal blood, yet the PPG stays high. Which terms of ΔP = Q × R explain it?', 'Total portal inflow (Q) rises with splanchnic arteriolar vasodilation, and the flow that still crosses the liver meets the high intrahepatic resistance (R).'],
  ],
  summary: 'Portal hypertension as a circuit: increased inflow, increased resistance, collaterals in parallel and TIPS, each interpreted as ΔP = Q × R.',
  slides: [
    {
      id: 'ohm', preset: 'healthy', view: C, cam: 'series', sites: R, span: [{ from: 'CONF', to: 'IVCS', label: 'PPG {ppg}' }], data: 'tiles', tiles: ['pvFlow', 'ppg'],
      kicker: K, title: 'Pressure falls in proportion to flow and resistance',
      eq: [dP + mo('=') + mi('Q') + mo('×') + '<mi class="eq-wedge">R</mi>', 'ΔP pressure drop · Q flow · R resistance'],
      line: 'The pressure drop across a segment equals its flow times its resistance (ΔP = Q × R). Across the liver it rises when flow or resistance rises, usually both.',
      notes: 'Arterioles, capillaries, sinusoids and veins are resistors in series. By analogy with Ohm\'s law, the pressure drop across a segment is the flow through it times its resistance. Portal hypertension is an increase in the pressure drop across the liver, so flow, resistance or, usually, both have increased.',
      ask: ['Name the two ways the pressure drop across the liver can rise.', 'Increased flow through it, or increased resistance to that flow.'],
    },
    {
      id: 'where', lens: 'drop', view: C, zone: 'splanchnic', sites: [...R, 'rGut'], terms: ['rGut'], tool: { kind: 'profile' }, key: ['pv', 'hvpg'],
      kicker: K, title: 'Most of the pressure drop is across the splanchnic arterioles',
      line: 'Most of the arterial pressure is dissipated across the splanchnic arterioles; a healthy liver adds a drop of only a few mmHg.',
      notes: 'Mean arterial pressure (MAP) is about 90 mmHg; portal vein pressure is <10 mmHg. The splanchnic arterioles are the largest resistance in the circuit, and they regulate portal inflow. Normal sinusoids are wide and numerous, so the HVPG is 1 to 5 mmHg.',
      ask: ['Which resistance regulates portal inflow?', 'The splanchnic arterioles: they are the largest resistance upstream of the portal vein.'],
    },
    {
      id: 'meal', ...MEAL, view: C, cam: 'gutLiver', sites: R, span: [{ from: 'CONF', to: 'IVCS', label: 'PPG {ppg}' }], tool: { kind: 'flowtime', clock: 'meal', lines: ['ppg', 'pvFlow'], keepTiles: true, title: 'PPG and portal flow around a meal' }, data: 'tiles', tiles: ['pvFlow', 'ppg'], delta: true,
      kicker: K, title: 'A meal raises portal flow but barely changes the gradient',
      line: 'A healthy liver offers very little resistance, so even a large rise in flow adds little pressure (gradient = flow × resistance).',
      notes: 'In humans portal flow rises by 40 to 80% after a meal; the model shows a rise of about 50%. This is the Q term. The rise in the gradient is the rise in flow times the intrahepatic resistance, which is small in a healthy liver. The same meal in cirrhosis follows two slides later. The meal plays over a few seconds, for the 30 minutes it takes in a patient, without advancing the disease.',
      ask: ['Why does a meal barely change portal pressure in a healthy liver?', 'The extra flow crosses a very low resistance.'],
    },
    {
      id: 'resist', preset: 'csph', view: C, zone: 'liver', kMax: 2.6, sites: R, span: [{ from: 'CONF', to: 'IVCS', label: 'PPG {ppg}' }], data: 'tiles', tiles: ['pvFlow', 'hvpg', 'ppg'], delta: 'ohm',
      whatIf: { label: 'Fibrosis', param: 'cirrhosis', min: 0, max: 1, step: 0.05, ends: ['None', 'Severe'] },
      compare: [{ label: 'No drug', own: true, params: NO_DRUG }, { label: 'Propranolol', short: 'Prop.', params: { drugs: { propranolol: true, carvedilol: false } } }, { label: 'Carvedilol', short: 'Carv.', params: { drugs: { propranolol: false, carvedilol: true } } }],
      kicker: K, site: 'sin', title: 'Cirrhosis raises the resistance in the liver',
      vignette: 'A 58-year-old woman with alcohol-associated cirrhosis, abstinent from alcohol for a year, has small varices on screening EGD. She has never had ascites.',
      line: 'Fibrosis raises intrahepatic resistance several-fold. Part of the rise is vascular tone, which drugs can reduce.',
      notes: 'This is the R term. In cirrhosis about three quarters of the added resistance is structural (fibrosis, regenerative nodules, capillarized sinusoids) and a quarter is dynamic: stellate cell contraction and reduced intrahepatic nitric oxide. Drugs can reverse only the dynamic component. The tiles compare with the healthy liver on the first slide; portal flow is almost the same. The buttons apply two drugs to this liver. Propranolol lowers the portal pressure by reducing flow (Q). Carvedilol reduces flow as well and relaxes intrahepatic vascular tone, so it lowers resistance (R) too (AASLD 2024).',
      ask: ['What part of the intrahepatic resistance can drugs lower?', 'The dynamic component, stellate cell and vascular tone; fibrosis and nodules are fixed.'],
    },
    {
      id: 'both', ...MEAL,
      question: 'In cirrhosis, will the same meal raise the gradient more?', view: C, cam: 'gutLiver', sites: R, span: [{ from: 'CONF', to: 'IVCS', label: 'PPG {ppg}' }], tool: { kind: 'flowtime', clock: 'meal', lines: ['hvpg', 'pvFlow'], keepTiles: true, title: 'HVPG and portal flow around a meal' }, data: 'tiles', tiles: ['pvFlow', 'hvpg'], delta: true,
      kicker: K, site: 'sin', title: 'In cirrhosis the same meal raises the gradient more',
      line: 'The gradient rises more even though the flow rises less, because the extra flow now crosses a higher resistance.',
      notes: 'In cirrhosis the splanchnic arterioles are persistently dilated (nitric oxide, glucagon, bacterial products), so portal inflow stays high: the hyperdynamic circulation. Increased resistance and increased inflow multiply. The rise is smaller than the resistance alone would predict: in cirrhosis the meal raises flow less, and part of the flow is diverted through collaterals. Large-volume transfusion raises portal pressure the same way and can precipitate variceal bleeding; meals may as well.',
      ask: ['Why does the same meal raise the gradient more in cirrhosis?', 'The extra flow, though smaller, crosses a higher resistance (ΔP = Q × R).'],
    },
    {
      id: 'parallel', lens: 'flow', preset: 'cirr-decomp', view: C, cam: 'collaterals', sites: [...R, 'split'], tool: { kind: 'flows' }, data: 'tiles', tiles: ['liver', 'ppg'], delta: false,
      kicker: K, site: 'sin', title: 'Collaterals divert flow without normalizing the gradient',
      eq: [frac('<mn>1</mn>', sub(mi('R'), 'total')) + mo('=') + frac('<mn>1</mn>', '<msub class="eq-wedge"><mi>R</mi><mtext>liver</mtext></msub>') + mo('+') + frac('<mn>1</mn>', '<msub class="eq-var"><mi>R</mi><mtext>collaterals</mtext></msub>'), 'Resistances in parallel: the total is lower than either'],
      line: 'Collaterals run in parallel with the liver and carry a large share of portal flow, yet the remaining flow still meets the high intrahepatic resistance.',
      notes: 'Total portal inflow rises as the collaterals open. Portosystemic collaterals form where the portal and systemic veins communicate: the esophagus, the umbilicus, the rectum and the retroperitoneum. They lower the total resistance, but they are narrow and inflow keeps rising, so the gradient stays high. They also shunt blood and its ammonia past the liver, and hepatic portal perfusion falls.',
      ask: ['Why do collaterals not relieve portal hypertension?', 'Their resistance is still high and the inflow rises with them, so the gradient stays high.'],
    },
    {
      id: 'tips', lens: 'flow', params: { tips: { on: true } }, view: C, cam: 'tips', sites: R, tool: { kind: 'causes', metric: 'ppg' }, data: 'tiles', tiles: ['ppg', 'shunt', 'liver'], delta: true,
      whatIf: { label: 'Stent width', param: 'tips.d', min: 6, max: 12, step: 1, unit: 'mm' },
      kicker: K, site: 'sin', title: 'TIPS lowers the gradient by bypassing the liver',
      line: 'A covered stent in parallel with the sinusoids has far lower resistance than they or any collateral, so it carries most portal flow and the gradient halves.',
      notes: 'A covered 8 to 10 mm stent has a far lower resistance than the sinusoids or any collateral, so most portal flow is diverted through it. The gradient falls to <12 mmHg; the cost is reduced hepatic portal perfusion and a risk of hepatic encephalopathy. An 8 mm stent balances the two. The waterfall reads left to right from the healthy gradient: each cause adds a step, and the stent is the step down. Drag Stent width to see a wider stent divert more flow.',
      ask: ['What is the cost of TIPS to the liver?', 'Most of its portal perfusion; splanchnic blood and its ammonia now bypass hepatic clearance and reach the systemic circulation.'],
    },
    {
      // (The relation chart before the summary: the CSPH liver and a healthy one, each swept from narrow to wide gut arterioles,
      // the PPG read against the portal flow it carries. The ring is this patient.)
      id: 'relation', preset: 'csph', view: C, sites: R,
      tool: { kind: 'curve', x: 'pvFlow', param: 'splanchnicTone', from: 0.6, to: 1.6, step: 0.1, lines: ['ppg'], against: { label: 'Healthy liver', params: { cirrhosis: 0 }, own: 'Cirrhosis' } },
      kicker: 'Summary', site: 'sin', title: 'The slope of each line is its resistance',
      line: 'Each line is one liver as its inflow changes. The same rise in flow raises the PPG about three times as much in cirrhosis; this liver carries {pvFlow} at {ppg}.',
      notes: 'Each line holds the liver fixed and varies only splanchnic arteriolar tone, from constricted to dilated, so portal inflow changes. Read as ΔP = Q × R, the slope of each line is the resistance the flow meets: about 2 mmHg per L/min in the healthy liver and about 6 in cirrhosis. That is why a meal or splanchnic vasodilation raises the gradient more in cirrhosis, and why a drug that lowers inflow lowers it more there as well. The ring is this patient with CSPH. (AASLD 2024 p. 1181: portal pressure is proportional to the splanchnic inflow and to the resistance opposing it.)',
      ask: ['Two livers get the same extra 0.5 L/min of portal flow. Why does the cirrhotic one gain more pressure?', 'Its resistance is higher, so each L/min of flow adds more pressure: the line is steeper.'],
    },
    {
      // (Ohm's law on a plane, C1 of docs/recommendations/new-features-recs.md: portal flow across, the PPG up, and a line from the origin for each
      // resistance. The summary table's rows, each change as a ring (before) and a dot (after).)
      id: 'flowres', preset: 'csph', view: C, sites: R, visual: 'plane',
      plane: { base: 'flow-ppg', y: { key: 'ppg', min: 0, max: 24, ticks: [0, 6, 12, 18, 24] }, iso: { rays: [4, 8, 16, 24] } },
      of: [{ id: 'ohm', name: 'Healthy' }, { id: 'meal', from: 'ohm', name: 'Healthy, after a meal', short: 'Meal' }, { id: 'resist', from: 'ohm', name: 'Cirrhosis' }, { id: 'both', from: 'resist', name: 'Cirrhosis, after a meal', short: 'Meal' },
        { id: 'parallel', name: 'Advanced cirrhosis', short: 'Advanced' }, { id: 'tips', from: 'parallel', name: 'TIPS' }],
      kicker: 'Summary', title: 'Every patient lies on a line of constant resistance',
      line: 'A meal moves a patient to the right along the same line, because flow rises. Cirrhosis moves the patient onto a steeper line, and a TIPS onto a shallower one.',
      notes: 'Portal flow is on the x-axis and the PPG on the y-axis. A line from the origin joins all the points that share one resistance, the PPG divided by the flow in mmHg per L/min, so a steeper line is a higher resistance. A meal raises the flow and the patient moves right along nearly the same line, and further up it in cirrhosis, where the line is steeper. Cirrhosis raises the resistance, so the patient moves up onto a steeper line. Collaterals and a TIPS are resistors in parallel: they lower the resistance of the whole circuit, and the dot drops onto a shallower line. The resistance on this plane is that of the whole portal circuit, PPG ÷ flow, not the intrahepatic resistance alone. (AASLD 2024 p. 1181: portal pressure is proportional to the splanchnic inflow and to the resistance opposing it.)',
      ask: ['A patient moves right along a line from the origin. What changed, and what did not?', 'The flow rose and the resistance stayed the same; the pressure rose in proportion to the flow.'],
    },
    {
      // Each row against the row it changes (vs), in the circuit's own terms: portal flow (Q), the liver's own resistance (R) and the gradient.
      id: 'summary', visual: 'table', cols: ['pvFlow', 'res', 'ppg'], asc: false, rowHead: 'Circuit',
      foot: 'Across the whole circuit R = PPG ÷ Q; collaterals and TIPS lower it as resistors in parallel, while the liver R column shows the intrahepatic resistance alone.',
      of: [{ kicker: 'Reference', id: 'ohm', title: 'Healthy' }, { kicker: 'More flow', id: 'meal', title: 'Healthy, after a meal', vs: 'ohm', calm: ['ppg'] }, { kicker: 'More resistance', id: 'resist', title: 'Cirrhosis', vs: 'ohm' }, { kicker: 'Both', id: 'both', title: 'Cirrhosis, after a meal', vs: 'resist' },
        { preset: 'cirr-decomp', params: { occluded: NO_COLLATERALS }, key: 'nocoll', kicker: 'More resistance', title: 'Advanced cirrhosis, no collaterals', vs: 'resist' },
        { kicker: 'Parallel resistor', id: 'parallel', title: 'With collaterals', vs: 'nocoll' }, { kicker: 'Parallel resistor', id: 'tips', title: 'TIPS', vs: 'parallel' }],
      kicker: 'Summary', title: 'Each change, read as ΔP = Q × R',
      line: 'Each row shows how one change altered flow (Q), resistance (R) and the gradient (PPG), compared with its reference row.',
      notes: 'Each row changes Q, R or both, compared with the healthy circuit. A meal raises Q; cirrhosis raises R; collaterals and TIPS add resistors in parallel. Drugs that lower Q or R are covered in the Lowering portal pressure talk.',
      ask: ['Classify TIPS, a meal and cirrhosis by the term they change.', 'TIPS lowers R, as a resistor in parallel; a meal raises Q through splanchnic vasodilation; cirrhosis raises R.'],
    },
  ],
});
