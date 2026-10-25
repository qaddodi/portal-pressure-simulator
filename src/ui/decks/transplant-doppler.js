// Presenter talk: Doppler after a liver transplant (Advanced). The artery first, then the portal vein, then the hepatic veins;
// each problem is its own case on a healthy liver (the slide fields are described at the top of decks.js).
// Source (added 25 Oct 2026): Lechowicz et al., J Ultrason 2015;15:208-226 (Polish Ultrasound Society), the section on vessels
// after orthotopic liver transplantation, in /mnt/project-files/guidelines/doppler/. Hepatic artery: resistive index 0.5 to 0.8 and
// acceleration time under 80 ms when healthy; a narrowing gives a peak systolic velocity over 200 cm/s with turbulence at the narrowing
// and, beyond it, a resistive index under 0.5 and an acceleration time over 80 ms; a clot gives no flow in the visible artery, at the
// hilum or inside the liver. Portal vein: a narrowing gives severe turbulence and a velocity over 100 cm/s, or three to four times the
// usual speed; a clot gives no flow (partial: flow in part of the lumen). Outflow (a narrowed or twisted vena cava join): turbulence and
// a three- to four-fold velocity at the join, hepatic vein flow under 15 cm/s and no phasicity. Neither Baveno VIII, AASLD 2024 nor
// EASL 2025 gives post-transplant Doppler criteria.
// Limits of the model: its Doppler reads a vessel as a whole, not the jet at a narrowing (a narrowed portal vein speeds up about 1.6
// times, not three to four), the hepatic artery is read beyond its narrowing, no acceleration time is drawn, and the three hepatic
// veins narrow together. Each slide says so in a caveat where it matters.

const HA = { kind: 'doppler', vessel: 'A_HEP', title: 'Hepatic artery' };
const PV = { kind: 'doppler', vessel: 'PV_TRUNK' };
const HV = { kind: 'doppler', vessel: 'RHV_IVC' };
const SRC = 'Lechowicz et al., J Ultrason 2015';

export const TRANSPLANT_DOPPLER = {
  id: 'transplant-doppler', level: 'advanced', title: 'Doppler after a liver transplant', minutes: 9,
  objectives: [
    'Follow the scan after a transplant: the artery first, then the portal vein, then the hepatic veins',
    'Recognize a clotted and a narrowed hepatic artery on Doppler',
    'Tell a narrowed portal vein from a clotted one',
    'Recognize a narrowed hepatic vein outflow from its flat, slow trace',
  ],
  checks: [
    ['What is the most important finding on a Doppler after a transplant?', 'Whether the hepatic artery is open. A clot shows no flow in the artery, at the hilum or inside the liver.'],
    ['Beyond a hepatic artery narrowing, what happens to the resistive index and the acceleration time?', 'The resistive index falls under 0.5 and the acceleration time passes 80 ms. At the narrowing itself the velocity passes 200 cm/s.'],
    ['Two weeks after a transplant the portal vein shows no flow. How does that differ from a narrowing?', 'A clot carries no flow. A narrowing still carries flow, and it runs fast at the join, over 100 cm/s.'],
    ['A graft shows flat hepatic vein traces under 15 cm/s, and the portal vein has slowed. Which join is narrowed?', 'The hepatic vein outflow. Blood backs up from the cava side, so the hepatic veins lose their waves and the portal vein slows behind them. A narrowed portal vein would run fast.'],
  ],
  summary: 'Doppler after a liver transplant: a healthy graft, then a clotted and a narrowed artery, a narrowed and a clotted portal vein, and a narrowed hepatic vein outflow, each as its own case.',
  slides: [
    {
      id: 'graft', preset: 'healthy', cam: 'liver', tool: HA, data: 'tiles', tiles: ['pvVel', 'liver'], key: ['pvVel'],
      vignette: 'A 49-year-old man with hepatitis C cirrhosis had a deceased-donor liver transplant a week ago. His liver tests are falling, and he has a routine Doppler before discharge.',
      kicker: 'The scan', title: 'After a transplant the Doppler starts with the artery',
      line: 'A healthy graft artery keeps its flow through diastole: the resistive index is 0.5 to 0.8. The scan goes on to the portal vein and the hepatic veins, but the artery comes first.',
      notes: 'The surgeon joins the donor liver to the recipient\'s hepatic artery, portal vein and hepatic veins (or the vena cava). The Doppler checks each join. Arterial patency is the most important thing it checks: the bile ducts have no other blood supply. A healthy artery has low resistance, with flow through diastole, a resistive index of 0.5 to 0.8 and a rise to the peak in under 80 ms.',
      ask: ['Which vessel does the Doppler check first after a transplant, and why?', 'The hepatic artery. Its patency is the most important finding, and the bile ducts have no other blood supply.'],
      cite: SRC,
    },
    {
      id: 'hat', preset: 'healthy', params: { thrombus: { A_HEP: 1 } }, cam: 'liver', tool: HA, data: 'tiles', tiles: ['liver', 'pvVel'], key: ['liver'], delta: 'graft',
      vignette: 'A 38-year-old woman had a transplant for primary sclerosing cholangitis 5 days ago. This morning her AST and ALT have jumped, and she has a fever.',
      caseQ: 'What will the artery Doppler show?',
      kicker: 'Artery', title: 'A clotted artery gives no signal',
      line: 'No flow in the visible artery, at the hilum or inside the liver. The portal vein carries on, so liver blood flow is still {liver} of normal, but the bile ducts have lost their only supply.',
      notes: 'In hepatic artery thrombosis the scanner finds no flow in the visible artery and no flow signal at the hilum or inside the liver. The portal vein is untouched, so the graft keeps about three quarters of its normal blood flow. The bile ducts depend on the artery alone, and they suffer first.',
      ask: ['What are the Doppler signs of hepatic artery thrombosis?', 'No flow in the visible artery, and no flow signal at the hilum or inside the liver.'],
      cite: SRC,
    },
    {
      id: 'has', preset: 'healthy', params: { stenosis: { A_HEP: 0.4 } }, cam: 'liver', tool: HA, data: 'tiles', tiles: ['liver', 'pvVel'], key: ['liver'], delta: 'graft',
      vignette: 'A 61-year-old man had a transplant for alcohol-associated cirrhosis 3 months ago. His liver tests have crept up for two weeks, but color Doppler finds an artery signal.',
      caseQ: 'What will the trace look like past a narrowing?',
      kicker: 'Artery', title: 'A narrowed artery gives a small, low-resistance trace',
      line: 'At the narrowing the peak velocity passes 200 cm/s, with turbulence. Beyond it the trace shrinks, and the resistive index falls under 0.5.',
      caveat: 'The model reads the artery beyond the narrowing. It does not draw the jet at the narrowing or the acceleration time.',
      notes: 'A narrowed artery looks different in two places. At the narrowing the blood speeds up, with a peak systolic velocity over 200 cm/s and turbulence. Beyond it the signal weakens: the resistive index falls under 0.5 and the acceleration time stretches past 80 ms. The model shows the trace beyond the narrowing, so the picture is the small, flat one.',
      ask: ['Beyond a hepatic artery narrowing, what happens to the resistive index and the acceleration time?', 'The resistive index falls under 0.5, and the acceleration time passes 80 ms.'],
      cite: SRC,
    },
    {
      id: 'pvs', preset: 'healthy', params: { stenosis: { PV_TRUNK: 0.6 } }, cam: 'portal', lens: 'velocity', tool: PV, data: 'tiles', tiles: ['pvVel', 'ppg'], key: ['pvVel'], delta: 'graft',
      vignette: 'A 29-year-old woman received a living-donor graft 4 months ago. At a routine visit her liver tests are normal, and she feels well.',
      caseQ: 'What will the portal vein Doppler show?',
      kicker: 'Portal vein', title: 'A narrowed portal vein runs fast, and the pressure rises behind it',
      line: 'Through the narrowing the blood speeds up, here to {pvVel}, and the pressure behind it climbs: the PPG is {ppg}. The hepatic artery opens up to make up for the lost portal flow.',
      caveat: 'A scanner reads over 100 cm/s at the join, or three to four times the usual speed. The model shows a gentler rise.',
      notes: 'At a portal vein join that has narrowed, the scanner finds severe turbulence and a velocity over 100 cm/s, or three to four times the vein\'s usual speed. The pressure behind the narrowing rises, and the hepatic artery dilates to make up for the lost portal inflow. A catheter would find a high portal pressure and a normal HVPG, as in any resistance that lies before the sinusoids.',
      ask: ['A portal vein join is narrowed. What does the Doppler read there?', 'Severe turbulence and a velocity over 100 cm/s, or three to four times the vein\'s usual speed.'],
      cite: SRC,
    },
    {
      id: 'pvt', preset: 'healthy', params: { thrombus: { PV_TRUNK: 1 } }, cam: 'portal', lens: 'velocity', tool: PV, data: 'tiles', tiles: ['pvVel', 'ppg', 'liver'], key: ['pvVel'], delta: 'graft',
      vignette: 'A 56-year-old man with alcohol-associated cirrhosis had a transplant 2 weeks ago. His liver tests rose again after a good first week.',
      caseQ: 'What will the portal vein Doppler show?',
      kicker: 'Portal vein', title: 'A clotted portal vein shows no flow',
      line: 'There is clot in the lumen and no flow signal. The pressure behind it reaches {ppg}. The hepatic artery opens up, yet liver blood flow is only {liver} of normal.',
      notes: 'A thrombosed portal vein shows clot in the lumen and no flow. A partial clot leaves flow in part of the lumen. A narrowed vein still carries flow, and fast. The artery dilates to make up for the lost portal inflow, but it cannot replace all of it.',
      ask: ['What does the Doppler show in a clotted portal vein, and in a partly clotted one?', 'No flow when it is fully clotted. A partial clot leaves flow in part of the lumen.'],
      cite: SRC,
    },
    {
      id: 'outflow', preset: 'healthy', params: { stenosis: { RHV_IVC: 0.75, MHV_IVC: 0.75, LHV_IVC: 0.75 } }, cam: 'liver', tool: HV, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'], delta: 'graft',
      vignette: 'A 33-year-old man received a graft for acute liver failure 6 weeks ago. His liver tests have risen for two weeks, and the scan shows no clot in the artery or portal vein.',
      caseQ: 'What will the hepatic vein trace look like?',
      kicker: 'Hepatic veins', title: 'Narrowed hepatic veins lose their waves and slow down',
      line: 'Past the narrowing the hepatic vein trace goes flat and slows to under 15 cm/s. Blood backs up into the graft: the PPG is {ppg}, and liver blood flow falls to {liver} of normal.',
      caveat: 'The model narrows all three hepatic veins together. It does not draw the jet at the narrowing.',
      notes: 'The hepatic veins carry the graft\'s blood out to the vena cava. A healthy trace follows the heartbeat, with waves. When the outflow narrows, the veins lose those waves and the flow slows to under 15 cm/s. At the join itself the scanner finds turbulence and a velocity three to four times higher. Blood backs up into the graft, so the portal vein slows too.',
      ask: ['What do the hepatic veins show when the graft\'s outflow narrows?', 'Flow under 15 cm/s with no waves, and at the join a velocity three to four times higher.'],
      cite: SRC,
    },
    {
      id: 'summary', visual: 'table', cols: ['pvFlow', 'ppg', 'liver', 'wave'], wave: 'PV_TRUNK', asc: false, vs: 'first', rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy graft', ref: true }, { id: 'hat', kicker: 'Artery', title: 'Artery clot' }, { id: 'has', kicker: 'Artery', title: 'Artery narrowing' },
        { id: 'pvs', kicker: 'Portal vein', title: 'Portal vein narrowing' }, { id: 'pvt', kicker: 'Portal vein', title: 'Portal vein clot' }, { id: 'outflow', kicker: 'Hepatic veins', title: 'Outflow narrowing' }],
      kicker: 'Summary', title: 'Each join leaves its own mark on the scan',
      line: 'The artery fails with no signal or a small one, the portal vein with a fast jet or no flow, and the hepatic veins with a flat, slow trace.',
      notes: 'Compare the rows. An artery problem leaves the portal vein alone but costs the graft some of its flow. A portal vein problem raises the pressure behind the join: a clot shows no flow, and a narrowing runs fast. An outflow problem backs blood up from the other side, so the hepatic vein trace goes flat and the portal vein slows.',
      ask: ['How does a narrowed hepatic outflow differ from a narrowed portal vein on the portal vein trace?', 'The portal vein slows behind a narrowed outflow, and it runs fast at a narrowed portal vein join.'],
    },
  ],
};
