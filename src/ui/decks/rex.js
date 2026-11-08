// Presenter talk: children with a portal vein clot, from the cavernoma and the normal HVPG to the Meso-Rex bypass, the one shunt that
// gives the liver its blood back (the slide fields are described at the top of decks.js).
// Sources, checked 7 Nov 2026 against the Baveno VIII text in guidelines/baveno-viii-2026.pdf: 1.24 (extrahepatic portal vein obstruction
// and biliary atresia, the two leading causes of portal hypertension in children), 1.25 to 1.27 (stiffness in children, and why
// management cannot rely on it alone), 9.29 (chronic portal vein thrombosis in children defined), 9.30 (work-up), 9.31 (Meso-Rex for
// preprimary and primary prophylaxis, with the >90% success criteria), 9.34 (Meso-Rex preferred for secondary prophylaxis, and what
// follows when it is not feasible), 9.35 (distal splenorenal shunt), 9.38 (recent clots in neonates with umbilical catheters).
// The model is adult-sized and the patient is the app's chronic portal vein thrombosis preset, so the numbers are the pattern's, not a
// child's. The graft is the model's REX vessel (topology.js): the superior mesenteric vein to the left portal vein, counted as
// portal blood that reaches the liver, never as shunted.

// One frame for both shunt-choice slides that holds all three shunts, whichever button is on: the Rex graft (x 688 to 760,
// y 378 to 660), the Warren shunt (x 948 to 962) and the mesocaval shunt (x 620 to 690), with room round them (Mohammad, 7 Nov).
const SHUNTS_CAM = [580, 340, 1000, 700];

export const MESO_REX = {
  id: 'meso-rex', level: 'advanced', title: 'Children with a portal vein clot', minutes: 10,
  objectives: [
    'Explain why a child with a clotted portal vein has a normal HVPG and a high PPG',
    'State what a Meso-Rex bypass needs: an open left portal vein and an experienced surgeon',
    'Contrast the bypass with a Warren or mesocaval shunt in the blood that reaches the liver',
    'Name the options when a Meso-Rex bypass is not possible',
  ],
  checks: [
    ['Why is the HVPG normal in a child whose portal vein is clotted?', 'The clot is before the liver, so the wedged catheter reads normal sinusoids. The PPG, taken in the portal vein, shows the resistance.'],
    ['What gives a Meso-Rex bypass a success rate >90%?', 'An open intrahepatic portal venous system and surgical expertise in the operation (Baveno VIII 9.31).'],
    ['One shunt takes the PPG from about 15 to 7 mmHg and the liver gets more blood. Another takes it to about 4 mmHg and the liver gets less. Which is the Meso-Rex bypass?', 'The first. It sends the gut’s blood into the liver through the left portal vein. A mesocaval shunt sends it to the IVC, so the gradient falls further and the liver is starved.'],
    ['A child with a clotted portal vein cannot have a Meso-Rex bypass. What does Baveno VIII offer for secondary prophylaxis?', 'Portal vein recanalization, endoscopic treatment with or without a non-selective beta-blocker, or a distal splenorenal shunt (9.34).'],
  ],
  summary: 'A child with a chronic portal vein clot: the cavernoma, the normal HVPG and high PPG, the stiffness that cannot be trusted alone, the Meso-Rex bypass and what it does to the liver’s blood flow, and the Warren shunt when a bypass is not possible.',
  slides: [
    {
      id: 'child', preset: 'pvt-chronic', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Occluded portal vein' }, data: 'tiles', tiles: ['spleen', 'plt'], key: ['plt'],
      kicker: 'The clot', site: 'pre', title: 'A clot in the portal vein explains the child’s bleed', cite: 'Baveno VIII 1.24, 9.29',
      vignette: 'A 6-year-old boy vomits blood. He needed an umbilical catheter as a newborn, his liver tests are normal, and his spleen is large. His platelets are 77,000/µL.',
      caveat: 'The model is adult-sized: a child’s veins and spleen are smaller, so read its numbers as the pattern, not as a child’s values.',
      line: 'Varices with a large spleen, low platelets and normal liver tests point to a clot before the liver. Here the spleen is {spleen} and the platelets are {plt}.',
      notes: 'In children, extrahepatic portal vein obstruction and chronic liver disease from biliary atresia are the two leading causes of portal hypertension (Baveno VIII 1.24). Chronic portal vein thrombosis in a child is a complete obstruction to the flow of portal blood into the liver; it can be congenital or acquired, and imaging makes the diagnosis (9.29). An umbilical catheter in the newborn period is a recognized cause of a recent clot, which can clear on its own in a neonate (9.38). The work-up still looks for liver disease and for a thrombophilia (9.30). The case is the model’s chronic clot, which is an adult-sized patient.',
      ask: ['A child bleeds from varices and the liver tests are normal. What is the likely cause?', 'Extrahepatic portal vein obstruction, a clot before the liver. It is one of the two leading causes of portal hypertension in children; the other is biliary atresia.'],
    },
    {
      id: 'cavernoma', cam: 'portal', labels: ['CONF'], mark: { edges: ['C8'], label: 'Cavernoma', kind: 'note' }, tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv'], key: ['pv'], delta: false,
      kicker: 'The clot', site: 'pre', title: 'On Doppler the trunk is empty and a web of veins surrounds it',
      line: 'The portal trunk shows no flow. A web of small veins carries blood around the clot, and the pressure behind it is {pv}.',
      notes: 'On color Doppler a clotted trunk gives no signal, and the cavernoma shows as tangled vessels in the hilum of the liver. The web carries some blood into the liver but not enough to bring the pressure down, so the varices form and the spleen enlarges. Contrast CT or MR angiography maps the clot, the cavernoma and the veins above and below it, which is what a surgeon needs before a bypass. In the model the cavernoma is the periportal collateral, which grows over months.',
      ask: ['What replaces the portal trunk on Doppler when it is clotted?', 'No flow in the trunk itself, and a web of small collateral veins, the cavernoma, running around it.'],
    },
    {
      id: 'gradients', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'IVCS'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, tool: { kind: 'profile' }, key: ['hvpg', 'ppg'],
      kicker: 'The clot', site: 'pre', title: 'The HVPG is normal and the PPG is high',
      line: 'The wedge reads the sinusoids beyond the clot, so the HVPG is {hvpg}. The portal vein shows the resistance: the PPG is {ppg}.',
      notes: 'The clot is before the liver, so a wedged hepatic vein catheter reads normal sinusoids and the HVPG stays normal however high the portal vein pressure. The PPG compares the portal vein itself with the IVC and catches the resistance, but it needs a direct portal reading. In a child the diagnosis is made on imaging and the catheter is rarely needed. A normal HVPG with varices is the clue that the resistance is not in the sinusoids.',
      ask: ['A child has varices and an HVPG of 2 mmHg. What does that tell you?', 'The resistance is not in the sinusoids. Look before them, in the portal vein.'],
    },
    {
      id: 'stiff', cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'ssm'], key: ['lsm', 'ssm'], delta: false,
      kicker: 'The clot', site: 'pre', title: 'Liver stiffness is normal and spleen stiffness is high', cite: 'Baveno VIII 1.25, 1.26',
      line: 'Liver stiffness is {lsm} and spleen stiffness is {ssm}. In children neither can clear or condemn the varices alone, because their cut-offs still need validation.',
      notes: 'Baveno VIII calls liver stiffness a valuable complementary tool in children at risk of portal hypertension from chronic liver disease, and for following its progress (1.25). It also says that management cannot rely on liver or spleen stiffness alone, because the cut-offs that find or exclude varices need further validation (1.26). A rule that combines the age-adjusted Z-score of spleen length with the platelet count and the serum albumin may predict high-risk varices and set the interval between endoscopies (1.27). In the model the liver stays soft with a clot, and the spleen stiffness follows the portal pressure.',
      ask: ['A child has a normal liver stiffness. Does that exclude varices?', 'No. Stiffness cannot be relied on alone in children, and with a clot before the liver it stays normal while the spleen stiffness is high (Baveno VIII 1.26).'],
    },
    {
      id: 'recess', cam: [500, 300, 880, 520], labels: ['LPV'], mark: { edges: ['PVH_L'], label: 'Rex recess', kind: 'note' }, tool: { kind: 'lumen', vessel: 'PVH_L', name: 'Left portal' },
      kicker: 'The bypass', site: 'pre', title: 'A Rex bypass needs an open left portal vein', cite: 'Baveno VIII 9.31',
      line: 'The graft is sewn into the left portal vein where it turns up into the liver, the Rex recess. The portal system inside the liver must be open.',
      notes: 'The Rex recess is the umbilical portion of the left portal vein, in the fissure of the liver. A Meso-Rex bypass should be considered in a child with features of portal hypertension for preprimary prophylaxis (no varices yet) and primary prophylaxis of variceal hemorrhage, and for other complications of portal hypertension. To reach a success rate above 90%, established criteria must be met, which include but are not limited to patency of the intrahepatic portal venous system and surgical expertise in performing the bypass (Baveno VIII 9.31). Imaging has to show the left portal vein and the vessels inside the liver before the operation.',
      ask: ['Which two conditions give a Meso-Rex bypass a success rate >90%?', 'An open intrahepatic portal venous system and surgical expertise in the operation (Baveno VIII 9.31).'],
    },
    {
      id: 'bypass', lens: 'origin', params: { rex: true }, procedure: 'rex', cam: [500, 330, 900, 700], data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'], delta: 'child',
      kicker: 'The bypass', site: 'pre', title: 'A vein graft carries the gut’s blood past the clot into the liver', cite: 'Baveno VIII 9.34',
      line: 'A graft joins the superior mesenteric vein to the left portal vein. Gut blood runs back into the liver, and the PPG falls to {ppg}.',
      notes: 'The graft is a vein, usually one taken from the child, sewn to the superior mesenteric vein below the clot and to the left portal vein in the Rex recess. It bypasses the clotted trunk and the cavernoma, so the blood from the gut and the spleen reaches the sinusoids at a low pressure. On the figure, colored by origin, the graft carries superior mesenteric vein blood into the liver. A Meso-Rex bypass is the preferred operation for secondary prophylaxis in a child with chronic portal vein thrombosis (Baveno VIII 9.34). The tiles compare with the child before the operation.',
      ask: ['Where does a Meso-Rex graft run?', 'From the superior mesenteric vein, past the clotted trunk, to the left portal vein in the Rex recess.'],
    },
    {
      id: 'flows', lens: 'origin', cam: SHUNTS_CAM, tool: { kind: 'flows' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['liver'], delta: 'child',
      compare: [{ label: 'Meso-Rex bypass', short: 'Rex', own: true },
        { label: 'Warren shunt', short: 'Warren', params: { rex: false, dsrs: true, mesocaval: false } },
        { label: 'Mesocaval shunt', short: 'Mesocaval', params: { rex: false, dsrs: false, mesocaval: true } }],
      kicker: 'The bypass', site: 'pre', title: 'The liver gets more portal blood, not less',
      line: 'Sinusoidal flow is {liver} of a healthy liver’s, and {shunt} of the portal blood bypasses the sinusoids. Only the Meso-Rex bypass gives the liver more than before.',
      notes: 'Every other shunt lowers the gradient by sending portal blood away from the liver, a TIPS and a portocaval shunt most of all. The Warren shunt is selective: it drains the varices through the spleen and the left renal vein, and the gut’s blood still reaches the liver. A mesocaval shunt sends the gut’s blood to the IVC, so the gradient falls furthest and sinusoidal flow falls with it. The Meso-Rex bypass is the exception: the same blood goes into the left portal vein, so the gradient falls and sinusoidal flow rises. Right after the graft opens the model reads above a healthy liver’s flow, an overshoot of the gut’s flow through the graft; six months on it has settled to about a healthy liver’s. The buttons switch the child between the three operations, and the tiles compare with the child before any of them.',
      ask: ['What does every other shunt trade for a lower gradient?', 'Blood to the liver. A Meso-Rex bypass does not, because the blood goes into the liver through the left portal vein.'],
    },
    {
      id: 'months', days: 180, lapse: { seconds: 8 }, cam: 'portal', data: 'tiles', tiles: ['spleen', 'plt'], graph: ['pv', 'ssm'], key: ['spleen', 'plt'], delta: 'flows',
      kicker: 'The bypass', site: 'pre', title: 'Months later the spleen shrinks and the platelets rise',
      line: 'Six months on, the spleen measures {spleen} and the platelets have risen to {plt}, as the portal pressure falls and the collaterals shrink.',
      notes: 'With the bypass open the portal pressure is lower, so the collaterals shrink, the varices settle and the congested spleen gets smaller. The platelets that the spleen was holding go back into the blood. In the model this takes months, not days, and the spleen stiffness falls with it. In a child the bypass is judged by the same signs: the size of the spleen, the platelet count and the varices at endoscopy. Annual surveillance is advised for shunts that carry portal blood into the systemic veins (Baveno VIII 9.36); the Meso-Rex graft carries it into the liver.',
      ask: ['Which two signs show a bypass is working in the months after the operation?', 'The spleen shrinks and the platelet count rises, as the portal pressure and the collaterals fall.'],
    },
    {
      id: 'alternative', lens: 'origin', preset: 'pvt-chronic', params: { dsrs: true }, cam: SHUNTS_CAM, mark: { edges: ['S_DSR'], label: 'Warren shunt', kind: 'treat' }, tool: { kind: 'flows' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'],
      compare: [{ label: 'Warren shunt', short: 'Warren', own: true }, { label: 'Meso-Rex bypass', short: 'Rex', params: { dsrs: false, rex: true } }],
      kicker: 'When a Rex is not possible', site: 'pre', title: 'Without an open intrahepatic portal system, a Warren shunt is an option', cite: 'Baveno VIII 9.34, 9.35',
      line: 'Back in the first child, a Warren shunt drains the varices through the spleen, yet the PPG stays {ppg} and {shunt} of the portal blood bypasses the liver.',
      notes: 'When a Meso-Rex bypass is not feasible, Baveno VIII advises portal vein recanalization, endoscopic treatment with or without a non-selective beta-blocker, or a distal splenorenal shunt (9.34). A Warren shunt can be considered for recurrent variceal hemorrhage when there is no hepatopulmonary syndrome, portopulmonary hypertension or encephalopathy (9.35). In the model the Warren shunt lowers the varices through the splenic vein but leaves the pressure in the portal vein high, and the buttons compare it with the bypass in the same child.',
      ask: ['What does Baveno VIII offer for secondary prophylaxis when a Meso-Rex bypass cannot be done?', 'Portal vein recanalization, endoscopic treatment with or without a non-selective beta-blocker, or a distal splenorenal shunt.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['ppg', 'hvpg', 'liver', 'shunt', 'plt'], asc: false, rowHead: 'Child', vs: 'child',
      of: [{ id: 'child', kicker: 'Before', title: 'Clot, no operation' }, { id: 'bypass', kicker: 'Rex', title: 'Meso-Rex bypass' }, { id: 'months', kicker: 'Rex', title: 'Six months on' },
        { id: 'alternative', kicker: 'Other shunts', title: 'Warren shunt' }, { preset: 'pvt-chronic', params: { mesocaval: true }, kicker: 'Other shunts', title: 'Mesocaval shunt' }],
      kicker: 'Summary', title: 'The Meso-Rex bypass is the one shunt that gives the liver blood back',
      line: 'Every other shunt lowers the gradient by sending portal blood away from the liver. The Meso-Rex bypass sends it in, so the PPG falls and sinusoidal flow rises.',
      notes: 'In a child with a clot before the liver, the HVPG is normal, the stiffness of the liver is normal, and the cavernoma cannot carry enough blood. A Meso-Rex bypass joins the superior mesenteric vein to an open left portal vein and returns the gut’s blood to the liver. It needs an open intrahepatic portal system and a surgeon who does it (Baveno VIII 9.31), and it is the preferred operation after a bleed (9.34). If it cannot be done, recanalization, endoscopic treatment or a Warren shunt follow. The rows compare the child before and after, and the other shunts, with the same model.',
      ask: ['Why is a Meso-Rex bypass different from every other portal shunt?', 'It returns the gut’s blood to the liver instead of sending it round it, so the gradient falls and sinusoidal flow rises.'],
    },
  ],
};
