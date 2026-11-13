// Presenter talk: the liver's two inflows, the portal vein and the hepatic artery, and the arterial buffer
// between them (the slide fields are described at the top of decks.js). The hepatic artery is drawn on both views
// ([artery](ha) lights it and its label), and its Doppler in the data card reads it. Where the question is the share, the inflow bars
// (tool kind 'flows', of 'inflow') split the liver's blood between the two vessels.

const HA = (delta) => ({ kind: 'doppler', vessel: 'A_HEP', title: 'Hepatic artery', ...(delta ? { delta } : {}) });
const INFLOW = { kind: 'flows', of: 'inflow' };

export const TWO_INFLOWS = {
  id: 'two-inflows', level: 'foundation', title: 'Dual blood supply of the liver', minutes: 8,
  objectives: [
    'Give the portal venous and hepatic arterial shares of hepatic blood flow and oxygen delivery',
    'Explain the hepatic arterial buffer response',
    'Predict hepatic artery flow after portal vein thrombosis and after TIPS',
    'Explain why the bile ducts depend on the hepatic artery',
  ],
  checks: [
    ['What share of hepatic blood flow comes from the portal vein?', 'About three quarters. The hepatic artery supplies about a quarter.'],
    ['What does the hepatic artery do when portal flow falls?', 'It dilates and its flow rises: the hepatic arterial buffer response.'],
    ['Why do the bile ducts depend on the hepatic artery?', 'It is their only blood supply, and nothing buffers a fall in arterial flow.'],
    ['After a TIPS, the hepatic artery velocity is about a third higher than before. Is the stent failing?', 'No. Portal perfusion of the liver falls, and the artery dilates to compensate: the hepatic arterial buffer response.'],
  ],
  summary: 'The portal vein and the hepatic artery share hepatic blood flow. The artery buffers every fall in portal flow, after portal vein thrombosis, after TIPS or in cirrhosis; nothing buffers a fall in arterial flow.',
  slides: [
    {
      id: 'dual', lens: 'origin', preset: 'healthy', cam: 'liver', tool: INFLOW, data: 'tiles', tiles: ['pvFlow', 'liver'], key: ['pvFlow'],
      kicker: 'Two inflows', title: 'Two vessels perfuse the liver',
      line: 'About three quarters of hepatic blood flow arrives by the [portal vein](pv), {pvFlow} here, and a quarter by the [hepatic artery](ha).',
      notes: 'Each vessel supplies about half of hepatic oxygen delivery. Portal blood has already traversed the intestinal and splenic capillary beds, so it is partly deoxygenated but rich in absorbed nutrients and gut hormones. Arterial blood is fully saturated, so the artery supplies about half of the oxygen with only a quarter of the flow. The bars show the two inflows against each other: the portal vein carries about three quarters of the flow and the artery the rest. Later slides show hepatic artery Doppler, a low-resistance waveform with continuous diastolic flow.',
      ask: ['What share of hepatic oxygen delivery comes from the portal vein?', 'About half, although it carries about three quarters of the flow.'],
    },
    {
      id: 'meet', lens: 'origin', cam: 'lobule:triad', compare: [{ label: 'Origin', lens: 'origin', own: true }, { label: 'Oxygen', lens: 'oxygen' }], terms: { 'portal venule': 'lobule:triad', 'hepatic arteriole': 'lobule:arteriole', sinusoids: 'lobule:sinusoid' },
      kicker: 'Two inflows', title: 'Portal and arterial blood mix in the sinusoids',
      line: 'A portal venule and a hepatic arteriole drain into the same sinusoids, entering in zone 1.',
      notes: 'The Oxygen button shows portal blood only slightly darker than arterial blood; it still supplies half the oxygen. The portal tract contains a portal venule, a hepatic arteriole and a bile ductule. Arteriolar blood enters the sinusoids near the tract, in zone 1, and mixes with portal blood; part of it first supplies the peribiliary capillary plexus. The bile ducts have no portal supply, so they depend on the artery alone.',
      ask: ['Where do portal and arterial blood meet?', 'In the sinusoids, which both enter at the portal tracts.'],
    },
    {
      id: 'clot', compare: [{ label: 'Pressure', lens: 'pressure', own: true }, { label: 'Oxygen', lens: 'oxygen' }], preset: 'pvt-acute', cam: 'portal', mark: { edges: ['PV_TRUNK'], label: 'Clot' }, tool: HA('dual'), data: 'tiles', tiles: ['pvFlow', 'liver'], key: ['liver'], delta: 'dual',
      kicker: 'The arterial buffer', site: 'pre', title: 'Acute portal vein thrombosis stops portal flow',
      vignette: 'A 47-year-old man with a newly diagnosed JAK2-positive myeloproliferative neoplasm has had 3 days of constant abdominal pain. His liver tests are normal.',
      caseQ: 'What will his hepatic artery do?',
      line: 'With the portal vein occluded, hepatic [artery](ha) flow about doubles and collaterals carry a little portal blood, so sinusoidal flow falls only to {liver} of normal.',
      notes: 'The Oxygen button shows the sinusoids brightening. This is the hepatic arterial buffer response. Adenosine is released at a constant rate around the hepatic arterioles and is normally washed out by portal flow; when portal flow falls, adenosine accumulates and dilates the arterioles. The buffer compensates for part, not all, of the lost flow. That is why acute portal vein thrombosis rarely causes hepatic infarction. With the Oxygen button on, the saturation of blood entering the sinusoids rises from about 88% to 95%, because most of it is now arterial.',
      ask: ['Why does acute portal vein thrombosis rarely cause hepatic infarction?', 'The hepatic artery dilates (the buffer response) and keeps the liver perfused.'],
    },
    {
      // (Fig. 5 of Baveno VIII for the man of the clot slide: no reversible factor, and a JAK2-positive myeloproliferative neoplasm, a permanent major one. Case facts.
      // The hepatic artery's buffer keeps the liver alive; this is what the clot itself needs. tool-path.js.)
      id: 'path-pvtgrid', preset: 'pvt-acute', cam: 'portal', mark: { edges: ['PV_TRUNK'], label: 'Clot' },
      tool: { kind: 'path', of: 'pvtgrid', short: 'Long-term grid', patient: { r: 'no', c: 'maj' } },
      kicker: 'The arterial buffer', site: 'pre', title: 'The arterial buffer maintains perfusion; anticoagulation treats the thrombus',
      line: 'The arterial buffer maintains hepatic perfusion but does not treat the thrombus. His myeloproliferative neoplasm is a permanent major risk factor, so the grid calls for long-term, therapeutic-dose anticoagulation.',
      notes: 'The hepatic artery keeps the liver perfused while the portal vein is occluded, but the thrombus itself needs treatment. For portal vein thrombosis (PVT) without cirrhosis, Baveno VIII starts anticoagulation at once at a therapeutic dose (9.6) and gives at least 6 months (9.8). Whether to go on depends on the risk factors (9.10, Fig. 5). Two questions place the patient: was the thrombosis provoked by a reversible factor in the last 3 months, and is there a permanent factor, and is it major? A myeloproliferative neoplasm and thrombophilia are the examples of major permanent factors the guideline gives (9.5). A permanent major factor calls for long-term anticoagulation at a therapeutic dose (9.10a, strong); without one, long-term lower-dose DOACs can be considered (9.10b, weak); stopping can be considered after a reversible factor resolves and with no permanent one (9.10c, weak). This man has no reversible factor and a JAK2-positive neoplasm, so he falls in the red cell: therapeutic dose, long term.',
      ask: ['A man with a JAK2-positive myeloproliferative neoplasm has PVT. Is 6 months of anticoagulation enough?', 'No. A permanent major risk factor calls for long-term anticoagulation at a therapeutic dose (Baveno VIII 9.10a).'],
    },
    {
      id: 'switch', pill: false, cam: 'portal', tool: INFLOW, data: 'tiles', tiles: ['liver'], key: ['liver'], delta: 'dual',
      compare: [{ label: 'Buffer on', own: true, params: { habrStrength: 1 } }, { label: 'Buffer off', params: { habrStrength: 0 } }],
      kicker: 'The arterial buffer', site: 'pre', title: 'Without the buffer, hepatic blood flow falls much further',
      line: 'Hepatic arterial flow adjusts to portal flow, never the reverse. With the buffer switched off, impossible in a patient, sinusoidal flow falls to about 40% of normal.',
      notes: 'The buffer cannot be switched off in a patient, but it can in the model: sinusoidal flow falls to about 40% of normal. The regulation is one-way. Hepatic arterial flow adjusts to portal flow, but portal flow is not regulated by the liver; it is set by the splanchnic (mesenteric and splenic) arterioles. On the figure the hepatic artery and the sinusoids narrow when the buffer is off.',
      ask: ['Why does the same thrombus reduce sinusoidal flow far more with the buffer off?', 'The hepatic artery can no longer dilate, so nothing replaces the portal share, about three quarters of the flow.'],
    },
    {
      id: 'artery', preset: 'healthy', params: { thrombus: { A_HEP: 1 } }, cam: 'liver', mark: { edges: ['A_HEP'], label: 'Clot' }, tool: HA('dual'), data: 'tiles', tiles: ['pvFlow', 'liver'], key: ['liver'], delta: 'dual',
      kicker: 'The arterial buffer', title: 'Hepatic artery thrombosis leaves the bile ducts ischemic',
      vignette: 'A 52-year-old man had a deceased-donor liver transplant 10 days ago. His AST and ALT have risen sharply overnight.',
      caseQ: 'Which structures have lost their only blood supply?',
      line: 'With [hepatic artery](ha) thrombosis, portal flow barely changes. Sinusoidal flow falls to {liver} of normal, and the bile ducts lose their only blood supply.',
      notes: 'The clinical setting is hepatic artery thrombosis after liver transplantation. In a graft the hepatocytes may survive on portal blood, but often do not; the bile ducts, supplied only by the artery, become ischemic first: bile leaks, strictures and abscesses follow, and early thrombosis often needs revascularization or retransplantation. Doppler shows no arterial signal.',
      ask: ['Hepatic artery thrombosis develops after liver transplant. Which structure is most at risk?', 'The bile ducts, which have no portal supply.'],
    },
    {
      id: 'cirr', lens: 'origin', preset: 'cirr-decomp', cam: 'liver', tool: HA('dual'), data: 'tiles', tiles: ['liver', 'shunt'], key: ['shunt'], delta: 'dual',
      kicker: 'Cirrhosis and TIPS', site: 'sin', title: 'In cirrhosis the hepatic artery supplies a larger share',
      vignette: 'A 60-year-old man with alcohol-associated cirrhosis has ascites controlled on spironolactone and furosemide, large esophageal varices and platelets of 60,000/µL. He could not tolerate a beta-blocker.',
      line: 'Portosystemic collaterals divert {shunt} of portal flow from the liver. The hepatic [artery](ha) dilates and supplies a larger share, but sinusoidal flow is only {liver} of normal.',
      notes: 'As cirrhosis advances, more portal flow is diverted through collaterals and the hepatic artery supplies a growing share of hepatic blood flow; its peak systolic velocity rises. First-pass hepatic clearance of gut-derived toxins and drugs falls. The fall in total sinusoidal flow adds to the loss of hepatic function.',
      ask: ['Why does hepatic artery velocity rise in advanced cirrhosis?', 'Portal perfusion of the liver falls, and the hepatic arterial buffer response dilates the artery.'],
    },
    {
      id: 'tips', question: 'After TIPS, will the hepatic artery or the portal vein supply most hepatic blood flow?', lens: 'origin', params: { tips: { on: true } }, cam: 'liver', scales: { lobule: {} }, sites: ['split'], mark: { edges: ['TIPS'], label: 'TIPS', kind: 'treat' }, tool: INFLOW, data: 'tiles', tiles: ['liver', 'shunt'], key: ['liver'], delta: 'cirr',
      kicker: 'Cirrhosis and TIPS', site: 'sin', title: 'After TIPS, most hepatic inflow is arterial',
      line: 'After TIPS, intrahepatic portal flow turns hepatofugal, toward the stent, and the hepatic [artery](ha) dilates. Sinusoidal flow falls to {liver} of normal, most of it now arterial.',
      notes: 'After TIPS, flow in the intrahepatic portal branches usually becomes hepatofugal, toward the stent, and hepatic artery velocity rises as the buffer responds. With little hepatic reserve, liver failure can follow: a rising bilirubin and hepatic encephalopathy are the warning signs, and the reason TIPS is avoided in very advanced liver failure. On the figure, colored by origin, the sinusoids carry almost entirely arterial blood, while portal blood is diverted through the stent.',
      ask: ['Which direction is flow in the intrahepatic portal branches after TIPS?', 'Usually hepatofugal, toward the stent, because the stent is the path of least resistance.'],
    },
    {
      // (The relation chart before the summary: a healthy liver as a clot fills more of the portal vein, the liver's blood flow with
      // the arterial buffer and without it. The ring is the clot slide's patient, the vein closed.)
      id: 'relation', preset: 'pvt-acute', cam: 'portal', mark: { edges: ['PV_TRUNK'], label: 'Clot' },
      tool: { kind: 'curve', x: 'clot', xFrom: 0, xTo: 100, patient: { preset: 'healthy' }, param: 'thrombus.PV_TRUNK', from: 0, to: 1, step: 0.1, lines: ['liver'],
        against: { label: 'No buffer', params: { habrStrength: 0 }, own: 'With the buffer' } },
      kicker: 'Summary', site: 'pre', title: 'Without the buffer, the fall in hepatic blood flow doubles',
      line: 'With the portal vein occluded, the buffer maintains {liver} of normal sinusoidal flow. Without it, sinusoidal flow would fall below half of normal.',
      notes: 'Each point is a normal liver with thrombus filling more of the portal vein lumen. Both lines barely change until the thrombus fills about half the lumen. With the buffer, the hepatic artery dilates as portal flow falls and most hepatic blood flow is preserved; with the buffer switched off in the model, the loss is about twice as large. This is why acute portal vein thrombosis rarely causes hepatic infarction, and why hepatic artery thrombosis, which nothing buffers, does more harm. (Iranpour 2016: hepatic artery flow and velocity rise when portal flow falls. Baveno VIII, AASLD 2024 and EASL 2025 do not give these numbers.)',
      ask: ['Why is most hepatic blood flow preserved in acute portal vein thrombosis?', 'The hepatic artery dilates as the portal flow falls: the arterial buffer response.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pvFlow', 'liver', 'shunt', 'wave'], wave: 'A_HEP', asc: false, vs: 'first', rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'clot', kicker: 'Portal vein', title: 'Portal vein thrombosis' }, { id: 'artery', kicker: 'Artery', title: 'Hepatic artery thrombosis' },
        { id: 'cirr', kicker: 'Cirrhosis', title: 'Decompensated' }, { id: 'tips', kicker: 'Cirrhosis', title: 'After TIPS' }],
      kicker: 'Summary', title: 'The artery buffers the portal vein, never the reverse',
      line: 'The [artery](ha) buffers every fall in portal flow; nothing buffers a fall in arterial flow.',
      notes: 'Portal flow falls with portal vein thrombosis, with portosystemic collaterals and after TIPS; each time hepatic arterial flow rises to compensate in part, and the greater the compensation, the higher its Doppler velocity. When hepatic arterial flow fails, portal flow cannot compensate, and the bile ducts are injured first.',
      ask: ['After TIPS, hepatic artery velocity has doubled. Is that a complication?', 'No: it is the expected buffer response to reduced portal inflow.'],
    },
  ],
};
