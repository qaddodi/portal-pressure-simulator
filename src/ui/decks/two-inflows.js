// Presenter talk: the liver's two inflows, the portal vein and the hepatic artery, and the arterial buffer
// between them (the slide fields are described at the top of decks.js). The hepatic artery is modeled but not
// drawn on the plate, so its Doppler in the data card stands in for it.

const HA = (delta) => ({ kind: 'doppler', vessel: 'A_HEP', title: 'Hepatic artery', ...(delta ? { delta } : {}) });

export const TWO_INFLOWS = {
  id: 'two-inflows', level: 'foundation', title: 'The liver\'s two inflows', minutes: 9,
  objectives: [
    'Give the shares of liver blood flow and oxygen from the portal vein and the hepatic artery',
    'Explain the hepatic arterial buffer response',
    'Predict the hepatic artery flow after a portal vein clot and after TIPS',
    'Explain why the bile ducts depend on the hepatic artery',
  ],
  summary: 'The portal vein and the hepatic artery share the liver\'s blood. The artery buffers every fall in portal flow, after a clot, a TIPS or in end-stage cirrhosis; nothing buffers a fall in arterial flow.',
  slides: [
    {
      id: 'dual', preset: 'healthy', cam: 'liver', tool: HA(), data: 'tiles', tiles: ['pvFlow', 'liver'], key: ['pvFlow'],
      kicker: 'Two inflows', title: 'Two vessels feed the liver',
      line: 'About three quarters of the liver\'s blood arrives by the [portal vein](pv), {pvFlow} here, and a quarter by the hepatic artery. Each brings about half of the oxygen.',
      notes: 'Portal blood has already passed through the gut and the spleen, so it is partly deoxygenated but rich in absorbed nutrients and gut hormones. Arterial blood is fully saturated, so the artery supplies about half of the oxygen with only a quarter of the flow. The Doppler on the right is the hepatic artery: a low-resistance waveform with flow throughout diastole.',
      ask: ['What share of the liver\'s oxygen comes from the portal vein?', 'About half, although it carries about three quarters of the flow.'],
    },
    {
      id: 'meet', cam: 'lobule:triad', terms: { 'portal tract': 'lobule:triad', sinusoids: 'lobule:sinusoid' },
      kicker: 'Two inflows', title: 'The two bloods mix in the sinusoids',
      line: 'In each portal tract a portal venule and a hepatic arteriole empty into the same sinusoids, so the two bloods mix before they reach the liver cells.',
      notes: 'The portal tract holds a portal venule, a hepatic arteriole and a bile ductule. Arteriolar blood enters the sinusoids near the tract, in zone 1, and mixes with portal blood; part of it first feeds the capillary plexus around the bile ducts. The bile ducts have no portal supply, so they depend on the artery alone.',
      ask: ['Where do portal and arterial blood meet?', 'In the sinusoids, which both enter at the portal tracts.'],
    },
    {
      id: 'clot', preset: 'pvt-acute', cam: 'portal', terms: ['pv'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, tool: HA('dual'), data: 'tiles', tiles: ['pvFlow', 'liver'], key: ['liver'], delta: 'dual',
      kicker: 'The buffer', site: 'pre', title: 'A clot stops the portal flow',
      line: 'With the portal vein blocked, the hepatic artery opens up and carries about twice its usual flow, so liver blood flow holds at {liver} of normal.',
      notes: 'This is the hepatic arterial buffer response. Adenosine is released at a steady rate around the hepatic arterioles and is normally washed away by portal flow; when portal flow falls, adenosine builds up and dilates the artery. The buffer makes up part, not all, of the lost flow. It is why acute portal vein thrombosis rarely infarcts the liver.',
      ask: ['Why does acute portal vein thrombosis rarely cause a liver infarct?', 'The hepatic artery dilates (the buffer response) and keeps the liver perfused.'],
    },
    {
      id: 'switch', cam: 'portal', tool: HA('dual'), data: 'tiles', tiles: ['liver'], key: ['liver'], delta: 'dual',
      compare: [{ label: 'Buffer on', own: true, params: { habrStrength: 1 } }, { label: 'Buffer off', params: { habrStrength: 0 } }],
      kicker: 'The buffer', site: 'pre', title: 'Switch the buffer off',
      line: 'Without the buffer, the same clot would leave the liver with far less blood. Switch between the two and watch the hepatic artery.',
      notes: 'No patient can switch the buffer off, but the model can: liver blood flow falls to about a third of normal. The control runs one way only. The liver adjusts its arterial inflow to the portal flow, but it cannot control the portal flow, which is set by the arterioles of the gut and the spleen.',
      ask: ['What sets the portal venous flow into the liver?', 'The arterioles of the gut and the spleen; the liver cannot regulate it.'],
    },
    {
      id: 'artery', preset: 'healthy', params: { thrombus: { A_HEP: 1 } }, cam: 'liver', tool: HA('dual'), data: 'tiles', tiles: ['pvFlow', 'liver'], key: ['liver'], delta: 'dual',
      kicker: 'The buffer', title: 'Nothing buffers the artery',
      line: 'If the hepatic artery clots, the portal flow barely changes. Liver blood flow falls to {liver} of normal, and the bile ducts lose their only supply.',
      notes: 'The clinical setting is hepatic artery thrombosis after liver transplantation. The liver cells survive on portal blood, but the bile ducts, fed only by the artery, become ischemic: bile leaks, strictures and abscesses follow, and early thrombosis often needs revascularization or a new graft. The Doppler shows no arterial signal.',
      ask: ['After a liver transplant the hepatic artery clots. Which structure suffers most?', 'The bile ducts, which have no portal supply.'],
    },
    {
      id: 'cirr', preset: 'cirr-decomp', cam: 'liver', tool: HA('dual'), data: 'tiles', tiles: ['liver', 'shunt'], key: ['shunt'], delta: 'dual',
      kicker: 'Cirrhosis and TIPS', site: 'sin', title: 'In cirrhosis the artery does more',
      line: 'Collaterals take {shunt} of the portal blood past the liver. The artery dilates and supplies a larger share, but liver blood flow is only {liver} of normal.',
      notes: 'As cirrhosis advances, more portal blood leaves through collaterals and the hepatic artery supplies a growing share of the liver\'s flow; its Doppler velocity rises. The liver also loses part of its first-pass clearance of gut toxins and drugs. The fall in total liver blood flow adds to the loss of function.',
      ask: ['Why does the hepatic artery velocity rise in advanced cirrhosis?', 'Portal inflow to the liver falls, and the buffer response dilates the artery.'],
    },
    {
      id: 'tips', params: { tips: { on: true } }, cam: 'liver', sites: ['split'], mark: { edges: ['TIPS'], label: 'TIPS', kind: 'treat' }, tool: HA('cirr'), data: 'tiles', tiles: ['liver', 'shunt'], key: ['liver'], delta: 'cirr',
      kicker: 'Cirrhosis and TIPS', site: 'sin', title: 'After TIPS the artery feeds the liver',
      line: 'The stent carries the portal blood past the sinusoids, so the liver runs on arterial blood: the artery speeds up, yet liver blood flow falls to {liver} of normal.',
      notes: 'After a TIPS, flow in the intrahepatic portal branches usually turns toward the stent, and the hepatic artery velocity rises as the buffer responds. A liver with little reserve may not cope: a rising bilirubin and encephalopathy are the warning signs, and the reason TIPS is avoided in very advanced liver failure.',
      ask: ['Which way does blood run in the intrahepatic portal branches after a TIPS?', 'Usually toward the stent, away from the liver tissue.'],
    },
    {
      id: 'fugal', preset: 'cirr-hepatofugal', cam: 'portal', terms: ['pv'], tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pvFlow', 'liver'], key: ['pvFlow'], delta: 'dual',
      kicker: 'Cirrhosis and TIPS', site: 'sin', title: 'End stage: the portal vein drains the liver',
      line: 'Arterial blood shunted into the portal branches cannot pass the stiff sinusoids and runs back out: flow in the portal vein reverses, {pvFlow}.',
      notes: 'Hepatofugal flow appears in advanced cirrhosis with very high sinusoidal resistance, usually with a large spontaneous shunt to carry the reversed flow away. The liver is then perfused by the hepatic artery alone. On Doppler the portal vein signal lies below the baseline. It goes with advanced liver failure, and with encephalopathy from the large shunts.',
      ask: ['The portal vein Doppler signal lies below the baseline. What does that mean?', 'Hepatofugal flow: blood leaves the liver by the portal vein, a sign of very advanced portal hypertension.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pvFlow', 'liver', 'shunt'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'clot', kicker: 'Portal vein', title: 'Portal vein clot' }, { id: 'artery', kicker: 'Artery', title: 'Hepatic artery clot' },
        { id: 'cirr', kicker: 'Cirrhosis', title: 'Decompensated' }, { id: 'tips', kicker: 'Cirrhosis', title: 'After TIPS' }, { id: 'fugal', kicker: 'Cirrhosis', title: 'Hepatofugal flow' }],
      kicker: 'Summary', title: 'Who feeds the liver',
      line: 'The artery buffers every fall in portal flow; nothing buffers a fall in arterial flow.',
      notes: 'Portal flow falls with a clot, with collaterals, with a TIPS and when it reverses; each time the artery takes up part of the load, and the more it does, the faster its Doppler. When the artery itself fails, the portal vein cannot help, and the bile ducts suffer first.',
      ask: ['After a TIPS the hepatic artery velocity has doubled. Is that a complication?', 'No: it is the expected buffer response to less portal inflow.'],
    },
  ],
};
