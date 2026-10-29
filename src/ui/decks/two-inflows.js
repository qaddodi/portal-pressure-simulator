// Presenter talk: the liver's two inflows, the portal vein and the hepatic artery, and the arterial buffer
// between them (the slide fields are described at the top of decks.js). The hepatic artery is modeled but not
// drawn on the plate, so its Doppler in the data card stands in for it. Where the question is the share, the inflow bars
// (tool kind 'flows', of 'inflow') split the liver's blood between the two vessels.

const HA = (delta) => ({ kind: 'doppler', vessel: 'A_HEP', title: 'Hepatic artery', ...(delta ? { delta } : {}) });
const INFLOW = { kind: 'flows', of: 'inflow' };

export const TWO_INFLOWS = {
  id: 'two-inflows', level: 'foundation', title: 'The liver\'s two inflows', minutes: 8,
  objectives: [
    'Give the shares of liver blood flow and oxygen from the portal vein and the hepatic artery',
    'Explain the hepatic arterial buffer response',
    'Predict the hepatic artery flow after a portal vein clot and after TIPS',
    'Explain why the bile ducts depend on the hepatic artery',
  ],
  checks: [
    ['What share of the liver\'s blood comes from the portal vein?', 'About three quarters. The hepatic artery brings about a quarter.'],
    ['What does the hepatic artery do when portal flow falls?', 'It dilates and carries more blood: the hepatic arterial buffer response.'],
    ['Why do the bile ducts depend on the hepatic artery?', 'It is their only blood supply, and nothing buffers a fall in arterial flow.'],
    ['After a TIPS, the hepatic artery velocity is about a third higher than before. Is the stent failing?', 'No. Less portal blood reaches the liver, and the artery dilates to make up for it: the buffer response.'],
  ],
  summary: 'The portal vein and the hepatic artery share the liver\'s blood. The artery buffers every fall in portal flow, after a clot, a TIPS or in cirrhosis; nothing buffers a fall in arterial flow.',
  slides: [
    {
      id: 'dual', lens: 'origin', preset: 'healthy', cam: 'liver', tool: INFLOW, data: 'tiles', tiles: ['pvFlow', 'liver'], key: ['pvFlow'],
      kicker: 'Two inflows', title: 'Two vessels feed the liver',
      line: 'About three quarters of the liver\'s blood arrives by the [portal vein](pv), {pvFlow} here, and a quarter by the hepatic artery. Colored by origin, the inflows enter separately.',
      notes: 'Each vessel brings about half of the liver\'s oxygen. Portal blood has already passed through the gut and the spleen, so it is partly deoxygenated but rich in absorbed nutrients and gut hormones. Arterial blood is fully saturated, so the artery supplies about half of the oxygen with only a quarter of the flow. The bars show the two inflows against each other: the portal vein carries about three quarters of the flow and the artery the rest. Later slides show the hepatic artery\'s Doppler, a low-resistance waveform with flow throughout diastole.',
      ask: ['What share of the liver\'s oxygen comes from the portal vein?', 'About half, although it carries about three quarters of the flow.'],
    },
    {
      id: 'meet', lens: 'origin', cam: 'lobule:triad', compare: [{ label: 'Origin', lens: 'origin', own: true }, { label: 'Oxygen', lens: 'oxygen' }], terms: { 'portal venule': 'lobule:triad', 'hepatic arteriole': 'lobule:arteriole', sinusoids: 'lobule:sinusoid' },
      kicker: 'Two inflows', title: 'Portal and arterial blood mix in the sinusoids',
      line: 'A portal venule and a hepatic arteriole empty into the same sinusoids, where the two colors meet. The Oxygen button shows portal blood only a little darker.',
      notes: 'Portal blood is only a little darker than arterial blood, and it still brings half the oxygen. The portal tract holds a portal venule, a hepatic arteriole and a bile ductule. Arteriolar blood enters the sinusoids near the tract, in zone 1, and mixes with portal blood; part of it first feeds the capillary plexus around the bile ducts. The bile ducts have no portal supply, so they depend on the artery alone.',
      ask: ['Where do portal and arterial blood meet?', 'In the sinusoids, which both enter at the portal tracts.'],
    },
    {
      id: 'clot', compare: [{ label: 'Pressure', lens: 'pressure', own: true }, { label: 'Oxygen', lens: 'oxygen' }], preset: 'pvt-acute', cam: 'portal', mark: { edges: ['PV_TRUNK'], label: 'Clot' }, tool: HA('dual'), data: 'tiles', tiles: ['pvFlow', 'liver'], key: ['liver'], delta: 'dual',
      kicker: 'The buffer', site: 'pre', title: 'A clot stops the portal flow',
      vignette: 'A 47-year-old man with a newly diagnosed JAK2-positive myeloproliferative neoplasm has had 3 days of constant abdominal pain. His liver tests are normal.',
      caseQ: 'What will his hepatic artery do?',
      line: 'With the portal vein clotted, the artery carries about twice its usual flow, so liver blood flow falls only to {liver} of normal. The Oxygen button shows the sinusoids brightening.',
      notes: 'This is the hepatic arterial buffer response. Adenosine is released at a steady rate around the hepatic arterioles and is normally washed away by portal flow; when portal flow falls, adenosine builds up and dilates the artery. The buffer makes up part, not all, of the lost flow. It is why acute portal vein thrombosis rarely infarcts the liver. On the Oxygen button, blood entering the sinusoids rises from about 88% to 95% saturation, because most of it is now arterial.',
      ask: ['Why does acute portal vein thrombosis rarely cause a liver infarct?', 'The hepatic artery dilates (the buffer response) and keeps the liver perfused.'],
    },
    {
      id: 'switch', pill: false, cam: 'portal', tool: INFLOW, data: 'tiles', tiles: ['liver'], key: ['liver'], delta: 'dual',
      compare: [{ label: 'Buffer on', own: true, params: { habrStrength: 1 } }, { label: 'Buffer off', params: { habrStrength: 0 } }],
      kicker: 'The buffer', site: 'pre', title: 'Without the buffer the liver loses far more blood',
      line: 'The liver adjusts its arterial inflow to portal flow, never the reverse. With the buffer switched off, impossible in a patient, liver blood flow falls to about 40% of normal.',
      notes: 'No patient can switch the buffer off, but the model can: liver blood flow falls to about 40% of normal. The control runs one way only. The liver adjusts its arterial inflow to the portal flow, but it cannot control the portal flow, which is set by the arterioles of the gut and the spleen. On the figure the hepatic artery and the sinusoids thin when the buffer is off.',
      ask: ['Why does the same clot leave the liver far less blood with the buffer off?', 'The artery can no longer dilate, so nothing replaces the portal share, about three quarters of the flow.'],
    },
    {
      id: 'artery', preset: 'healthy', params: { thrombus: { A_HEP: 1 } }, cam: 'liver', tool: HA('dual'), data: 'tiles', tiles: ['pvFlow', 'liver'], key: ['liver'], delta: 'dual',
      kicker: 'The buffer', title: 'A clotted hepatic artery starves the bile ducts',
      vignette: 'A 52-year-old man had a deceased-donor liver transplant 10 days ago. His AST and ALT have risen sharply overnight.',
      caseQ: 'Which structures have lost their only blood supply?',
      line: 'If the hepatic artery clots, the portal flow barely changes. Liver blood flow falls to {liver} of normal, and the bile ducts lose their only supply.',
      notes: 'The clinical setting is hepatic artery thrombosis after liver transplantation. In a graft the liver cells may live on portal blood, but often do not; the bile ducts, fed only by the artery, suffer first and become ischemic: bile leaks, strictures and abscesses follow, and early thrombosis often needs revascularization or a new graft. The Doppler shows no arterial signal.',
      ask: ['After a liver transplant the hepatic artery clots. Which structure suffers most?', 'The bile ducts, which have no portal supply.'],
    },
    {
      id: 'cirr', lens: 'origin', preset: 'cirr-decomp', cam: 'liver', tool: HA('dual'), data: 'tiles', tiles: ['liver', 'shunt'], key: ['shunt'], delta: 'dual',
      kicker: 'Cirrhosis and TIPS', site: 'sin', title: 'In cirrhosis the artery does more',
      vignette: 'A 60-year-old man with alcohol-associated cirrhosis has ascites despite spironolactone and furosemide, large esophageal varices and platelets of 57,000/µL.',
      line: 'Collaterals take {shunt} of the portal blood past the liver. The artery dilates and supplies a larger share, but liver blood flow is only {liver} of normal.',
      notes: 'As cirrhosis advances, more portal blood leaves through collaterals and the hepatic artery supplies a growing share of the liver\'s flow; its Doppler velocity rises. The liver also loses part of its first-pass clearance of gut toxins and drugs. The fall in total liver blood flow adds to the loss of function.',
      ask: ['Why does the hepatic artery velocity rise in advanced cirrhosis?', 'Portal inflow to the liver falls, and the buffer response dilates the artery.'],
    },
    {
      id: 'tips', question: "After a TIPS, will the artery or the portal vein carry most of the liver's blood?", lens: 'origin', params: { tips: { on: true } }, cam: 'liver', scales: { lobule: {} }, sites: ['split'], mark: { edges: ['TIPS'], label: 'TIPS', kind: 'treat' }, tool: INFLOW, data: 'tiles', tiles: ['liver', 'shunt'], key: ['liver'], delta: 'cirr',
      kicker: 'Cirrhosis and TIPS', site: 'sin', title: 'After TIPS, most liver inflow is arterial',
      line: 'After a TIPS the portal branches turn toward the stent and the artery dilates. Liver flow falls to {liver} of normal. Colored by origin, the sinusoids carry mostly arterial blood.',
      notes: 'After a TIPS, flow in the intrahepatic portal branches usually turns toward the stent, and the hepatic artery velocity rises as the buffer responds. A liver with little reserve may not cope: a rising bilirubin and encephalopathy are the warning signs, and the reason TIPS is avoided in very advanced liver failure. On the figure, colored by origin, the sinusoids carry almost all arterial blood, while portal blood runs through the stent.',
      ask: ['Which way does blood run in the intrahepatic portal branches after a TIPS?', 'Usually toward the stent, away from the liver tissue, because the stent is the path of least resistance.'],
    },
    {
      // (The relation chart before the summary: a healthy liver as a clot fills more of the portal vein, the liver's blood flow with
      // the arterial buffer and without it. The ring is the clot slide's patient, the vein closed.)
      id: 'relation', preset: 'pvt-acute', cam: 'portal', mark: { edges: ['PV_TRUNK'], label: 'Clot' },
      tool: { kind: 'curve', x: 'clot', xFrom: 0, xTo: 100, patient: { preset: 'healthy' }, param: 'thrombus.PV_TRUNK', from: 0, to: 1, step: 0.1, lines: ['liver'],
        against: { label: 'No buffer', params: { habrStrength: 0 }, own: 'With the buffer' } },
      kicker: 'Summary', site: 'pre', title: 'Without the buffer the liver loses far more blood',
      line: 'With the portal vein closed, the buffer keeps {liver} of normal liver flow. Without it, less than half would reach the liver.',
      notes: 'Each point is a healthy liver with the clot filling more of the portal vein. Both lines barely move until the clot passes about half the lumen. With the buffer, the hepatic artery dilates as portal flow falls and the liver keeps most of its blood; with the buffer switched off in the model, the loss is about twice as large. This is why acute portal vein thrombosis rarely infarcts the liver, and why a hepatic artery clot, which nothing buffers, does more harm. (Iranpour 2016: hepatic artery flow and velocity rise when portal flow falls. Baveno VIII, AASLD 2024 and EASL 2025 do not give these numbers.)',
      ask: ['Why does the liver keep most of its blood flow when the portal vein clots?', 'The hepatic artery dilates as the portal flow falls: the arterial buffer response.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pvFlow', 'liver', 'shunt', 'wave'], wave: 'A_HEP', asc: false, vs: 'first', rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'clot', kicker: 'Portal vein', title: 'Portal vein clot' }, { id: 'artery', kicker: 'Artery', title: 'Hepatic artery clot' },
        { id: 'cirr', kicker: 'Cirrhosis', title: 'Decompensated' }, { id: 'tips', kicker: 'Cirrhosis', title: 'After TIPS' }],
      kicker: 'Summary', title: 'The artery buffers the portal vein, never the reverse',
      line: 'The artery buffers every fall in portal flow; nothing buffers a fall in arterial flow.',
      notes: 'Portal flow falls with a clot, with collaterals and with a TIPS; each time the artery takes up part of the load, and the more it does, the faster its Doppler. When the artery itself fails, the portal vein cannot help, and the bile ducts suffer first.',
      ask: ['After a TIPS the hepatic artery velocity has doubled. Is that a complication?', 'No: it is the expected buffer response to less portal inflow.'],
    },
  ],
};
