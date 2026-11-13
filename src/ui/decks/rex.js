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
  id: 'meso-rex', level: 'advanced', title: 'Children with portal vein thrombosis', minutes: 10,
  objectives: [
    'Explain why a child with portal vein thrombosis (PVT) has a normal HVPG and a high PPG',
    'State what a meso-Rex bypass requires: a patent left portal vein and surgical expertise',
    'Contrast the bypass with a Warren or mesocaval shunt in hepatic portal perfusion',
    'Name the options when a meso-Rex bypass is not feasible',
  ],
  checks: [
    ['Why is the HVPG normal in a child with PVT?', 'The thrombus is prehepatic, so the WHVP reflects normal sinusoidal pressure. The PPG, measured from the portal vein, shows the resistance.'],
    ['What gives a meso-Rex bypass a success rate >90%?', 'A patent intrahepatic portal venous system and surgical expertise in the operation (Baveno VIII 9.31).'],
    ['One shunt lowers the PPG from about 15 to 7 mmHg and increases hepatic portal perfusion. Another lowers it to about 4 mmHg and reduces hepatic portal perfusion. Which is the meso-Rex bypass?', 'The first. It returns mesenteric venous blood to the liver through the left portal vein. A mesocaval shunt diverts it to the IVC, so the gradient falls further and hepatic portal perfusion falls.'],
    ['A child with PVT is not a candidate for a meso-Rex bypass. What does Baveno VIII offer for secondary prophylaxis?', 'Portal vein recanalization, endoscopic treatment with or without a nonselective beta-blocker, or a distal splenorenal shunt (9.34).'],
  ],
  summary: 'A child with chronic PVT: cavernous transformation, the normal HVPG and high PPG, liver and spleen stiffness that cannot be relied on alone, the meso-Rex bypass and its effect on hepatic blood flow, and the Warren shunt when a bypass is not feasible.',
  slides: [
    {
      id: 'child', preset: 'pvt-chronic', cam: 'portal', labels: ['CONF'], mark: { edges: ['PV_TRUNK'], label: 'Occluded portal vein' }, data: 'tiles', tiles: ['spleen', 'plt'], key: ['plt'],
      kicker: 'Chronic PVT', site: 'pre', title: 'Chronic PVT explains the child’s variceal bleed', cite: 'Baveno VIII 1.24, 9.29',
      vignette: 'A 6-year-old boy presents with hematemesis. He had an umbilical venous catheter as a newborn, his liver tests are normal, and he has splenomegaly. His platelet count is 77,000/µL.',
      caveat: 'The model is adult-sized: a child’s veins and spleen are smaller, so read its numbers as the pattern, not as pediatric values.',
      line: 'Varices with splenomegaly, thrombocytopenia and normal liver tests point to prehepatic portal hypertension. Here spleen length is {spleen} and platelets are {plt}.',
      notes: 'In children, extrahepatic portal vein obstruction and chronic liver disease from biliary atresia are the two leading causes of portal hypertension (Baveno VIII 1.24). Chronic portal vein thrombosis in a child is a complete obstruction to the flow of portal blood into the liver; it can be congenital or acquired, and imaging makes the diagnosis (9.29). Umbilical venous catheterization in the neonatal period is a recognized cause of recent PVT, which can resolve spontaneously in a neonate (9.38). The workup still looks for liver disease and for a thrombophilia (9.30). The case uses the model’s chronic PVT, an adult-sized patient.',
      ask: ['A child has variceal bleeding and normal liver tests. What is the likely cause?', 'Extrahepatic portal vein obstruction (chronic PVT). It is one of the two leading causes of portal hypertension in children; the other is biliary atresia.'],
    },
    {
      id: 'cavernoma', cam: 'portal', labels: ['CONF'], mark: { edges: ['C8'], label: 'Cavernoma', kind: 'note' }, tool: { kind: 'doppler', vessel: 'PV_TRUNK' }, data: 'tiles', tiles: ['pv'], key: ['pv'], delta: false,
      kicker: 'Chronic PVT', site: 'pre', title: 'On Doppler the main portal vein has no flow and a cavernoma surrounds it',
      line: 'The main portal vein shows no flow. A cavernoma of small collaterals carries blood around the thrombus, and the pressure upstream is {pv}.',
      notes: 'On color Doppler an occluded main portal vein shows no signal, and the cavernoma appears as tortuous collaterals at the porta hepatis. It carries some portal flow into the liver but not enough to decompress the portal system, so varices form and splenomegaly develops. Contrast CT or MR angiography maps the thrombus, the cavernoma and the veins upstream and downstream, which the surgeon needs before a bypass. In the model the cavernoma is the periportal collateral, which develops over months.',
      ask: ['What does Doppler show in place of an occluded main portal vein?', 'No flow in the main portal vein, and a network of small collaterals around it: the cavernoma.'],
    },
    {
      id: 'gradients', cam: 'route', labels: ['CONF', 'SIN_R', 'RHV', 'IVCS'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, tool: { kind: 'profile' }, key: ['hvpg', 'ppg'],
      kicker: 'Chronic PVT', site: 'pre', title: 'The HVPG is normal and the PPG is high',
      line: 'The WHVP reflects the sinusoids downstream of the thrombus, so the HVPG is {hvpg}. Direct portal pressure shows the resistance: the PPG is {ppg}.',
      notes: 'The thrombus is prehepatic, so the wedged hepatic venous pressure (WHVP) reflects normal sinusoids and the HVPG stays normal however high the portal venous pressure. The PPG (portal vein pressure minus IVC pressure) includes the prehepatic resistance, but it needs direct portal pressure measurement. In a child the diagnosis is made on imaging and a hemodynamic study is rarely needed. A normal HVPG with varices indicates that the resistance is not sinusoidal.',
      ask: ['A child has varices and an HVPG of 2 mmHg. What does that tell you?', 'The resistance is not sinusoidal. Look upstream, in the portal vein.'],
    },
    {
      id: 'stiff', cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'ssm'], key: ['lsm', 'ssm'], delta: false,
      kicker: 'Chronic PVT', site: 'pre', title: 'Liver stiffness is normal and spleen stiffness is high', cite: 'Baveno VIII 1.25, 1.26',
      line: 'Liver stiffness is {lsm} and spleen stiffness is {ssm}. In children neither can rule varices in or out alone, because the cut-offs still need validation.',
      notes: 'Baveno VIII calls liver stiffness a valuable complementary tool in children at risk of portal hypertension from chronic liver disease, and for following its progress (1.25). It also says that management cannot rely on liver or spleen stiffness alone, because the cut-offs that find or exclude varices need further validation (1.26). A rule that combines the age-adjusted Z-score of spleen length with the platelet count and the serum albumin may predict high-risk varices and set the interval between endoscopies (1.27). In the model liver stiffness stays normal with PVT, and spleen stiffness tracks portal pressure.',
      ask: ['A child has a normal liver stiffness. Does that exclude varices?', 'No. Liver stiffness cannot be relied on alone in children, and with prehepatic PVT it stays normal while spleen stiffness is high (Baveno VIII 1.26).'],
    },
    {
      id: 'recess', cam: [500, 300, 880, 520], labels: ['LPV'], mark: { edges: ['PVH_L'], label: 'Rex recess', kind: 'note' }, tool: { kind: 'lumen', vessel: 'PVH_L', name: 'Left portal' },
      kicker: 'The bypass', site: 'pre', title: 'A meso-Rex bypass needs a patent left portal vein', cite: 'Baveno VIII 9.31',
      line: 'The graft is anastomosed to the umbilical portion of the left portal vein, the Rex recess. The intrahepatic portal venous system must be patent.',
      notes: 'The Rex recess is the umbilical portion of the left portal vein, in the umbilical fissure. A meso-Rex bypass should be considered in a child with features of portal hypertension for preprimary prophylaxis (no varices yet) and primary prophylaxis of variceal hemorrhage, and for other complications of portal hypertension. To reach a success rate >90%, established criteria must be met, which include but are not limited to patency of the intrahepatic portal venous system and surgical expertise in performing the bypass (Baveno VIII 9.31). Preoperative imaging must show the left portal vein and the intrahepatic portal branches.',
      ask: ['Which two conditions give a meso-Rex bypass a success rate >90%?', 'A patent intrahepatic portal venous system and surgical expertise in the operation (Baveno VIII 9.31).'],
    },
    {
      id: 'bypass', lens: 'origin', params: { rex: true }, procedure: 'rex', cam: [500, 330, 900, 700], data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'], delta: 'child',
      kicker: 'The bypass', site: 'pre', title: 'A vein graft carries mesenteric venous blood past the thrombus into the liver', cite: 'Baveno VIII 9.34',
      line: 'A graft joins the superior mesenteric vein to the left portal vein. Hepatopetal portal flow is restored, and the PPG falls to {ppg}.',
      notes: 'The graft is usually an autologous vein, anastomosed to the superior mesenteric vein below the thrombus and to the left portal vein in the Rex recess. It bypasses the occluded main portal vein and the cavernoma, so mesenteric and splenic venous blood reaches the sinusoids at low pressure. On the figure, colored by origin, the graft carries superior mesenteric vein blood into the liver. A meso-Rex bypass is the preferred operation for secondary prophylaxis in a child with chronic portal vein thrombosis (Baveno VIII 9.34). The tiles compare with the child before the operation.',
      ask: ['Where does a meso-Rex graft run?', 'From the superior mesenteric vein, past the occluded main portal vein, to the left portal vein in the Rex recess.'],
    },
    {
      id: 'flows', lens: 'origin', cam: SHUNTS_CAM, tool: { kind: 'flows' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['liver'], delta: 'child',
      compare: [{ label: 'Meso-Rex bypass', short: 'Rex', own: true },
        { label: 'Warren shunt', short: 'Warren', params: { rex: false, dsrs: true, mesocaval: false } },
        { label: 'Mesocaval shunt', short: 'Mesocaval', params: { rex: false, dsrs: false, mesocaval: true } }],
      kicker: 'The bypass', site: 'pre', title: 'Only the meso-Rex bypass increases hepatic portal perfusion',
      line: 'Sinusoidal flow is {liver} of normal, and {shunt} of portal flow bypasses the sinusoids. Only the meso-Rex bypass raises hepatic portal perfusion above baseline.',
      notes: 'Every other shunt lowers the gradient by diverting portal flow from the liver, a TIPS and a portocaval shunt most of all. The Warren shunt is selective: it decompresses the varices through the spleen and the left renal vein, while mesenteric venous blood still reaches the liver. A mesocaval shunt diverts mesenteric venous blood to the IVC, so the gradient falls furthest and sinusoidal flow falls with it. The meso-Rex bypass is the exception: the same blood enters the left portal vein, so the gradient falls and sinusoidal flow rises. Immediately after the graft opens the model reads above normal hepatic flow, an overshoot of splanchnic flow through the graft; by 6 months it has settled to about normal. The buttons switch the child between the three operations, and the tiles compare with the child before any of them.',
      ask: ['What does every other shunt trade for a lower gradient?', 'Hepatic portal perfusion. A meso-Rex bypass does not, because the blood enters the liver through the left portal vein.'],
    },
    {
      id: 'months', days: 180, lapse: { seconds: 8 }, cam: 'portal', tool: { kind: 'flowtime', clock: 'days', lines: ['pv', 'ssm'], title: 'Portal pressure and spleen stiffness over six months' }, data: 'tiles', tiles: ['spleen', 'plt'], key: ['spleen', 'plt'], delta: 'flows',
      kicker: 'The bypass', site: 'pre', title: 'Months later spleen size decreases and the platelet count rises',
      line: 'At 6 months the spleen measures {spleen} and platelets have risen to {plt}, as portal pressure falls and the collaterals regress.',
      notes: 'With the bypass patent, portal pressure is lower, so the collaterals regress, the varices decompress and the congested spleen shrinks. Splenic sequestration falls and the platelet count rises. In the model this takes months, not days, and spleen stiffness falls with it. In a child, bypass function is judged by the same signs: spleen size, platelet count and varices at endoscopy. Annual surveillance is advised for portosystemic shunts (Baveno VIII 9.36); the meso-Rex graft carries portal blood into the liver.',
      ask: ['Which two signs show the bypass is patent in the months after surgery?', 'Spleen size decreases and the platelet count rises, as portal pressure falls and the collaterals regress.'],
    },
    {
      id: 'alternative', lens: 'origin', preset: 'pvt-chronic', params: { dsrs: true }, cam: SHUNTS_CAM, mark: { edges: ['S_DSR'], label: 'Warren shunt', kind: 'treat' }, tool: { kind: 'flows' }, data: 'tiles', tiles: ['ppg', 'liver'], key: ['ppg'],
      compare: [{ label: 'Warren shunt', short: 'Warren', own: true }, { label: 'Meso-Rex bypass', short: 'Rex', params: { dsrs: false, rex: true } }],
      kicker: 'When meso-Rex is not feasible', site: 'pre', title: 'Without a patent intrahepatic portal system, a Warren shunt is an option', cite: 'Baveno VIII 9.34, 9.35',
      line: 'Back in the first child, a Warren shunt decompresses the varices through the spleen, yet the PPG stays {ppg} and {shunt} of portal flow bypasses the liver.',
      notes: 'When a meso-Rex bypass is not feasible, Baveno VIII advises portal vein recanalization, endoscopic treatment with or without a nonselective beta-blocker, or a distal splenorenal shunt (9.34). A Warren shunt can be considered for recurrent variceal hemorrhage when there is no hepatopulmonary syndrome, portopulmonary hypertension or encephalopathy (9.35). In the model the Warren shunt decompresses the varices through the splenic vein but leaves portal vein pressure high, and the buttons compare it with the bypass in the same child.',
      ask: ['What does Baveno VIII offer for secondary prophylaxis when a meso-Rex bypass is not feasible?', 'Portal vein recanalization, endoscopic treatment with or without a nonselective beta-blocker, or a distal splenorenal shunt.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['ppg', 'hvpg', 'liver', 'shunt', 'plt'], asc: false, rowHead: 'Child', vs: 'child',
      of: [{ id: 'child', kicker: 'Before', title: 'PVT, no surgery' }, { id: 'bypass', kicker: 'Rex', title: 'Meso-Rex bypass' }, { id: 'months', kicker: 'Rex', title: 'At 6 months' },
        { id: 'alternative', kicker: 'Other shunts', title: 'Warren shunt' }, { preset: 'pvt-chronic', params: { mesocaval: true }, kicker: 'Other shunts', title: 'Mesocaval shunt' }],
      kicker: 'Summary', title: 'The meso-Rex bypass is the one shunt that restores hepatic portal perfusion',
      line: 'Every other shunt lowers the gradient by diverting portal flow from the liver. The meso-Rex bypass returns it to the liver, so the PPG falls and sinusoidal flow rises.',
      notes: 'In a child with prehepatic PVT, the HVPG and liver stiffness are normal, and the cavernoma cannot carry enough flow. A meso-Rex bypass joins the superior mesenteric vein to a patent left portal vein and restores portal flow to the liver. It requires a patent intrahepatic portal system and surgical expertise (Baveno VIII 9.31), and it is the preferred operation for secondary prophylaxis (9.34). If it is not feasible, portal vein recanalization, endoscopic treatment or a Warren shunt are the options. The rows compare the child before and after, and the other shunts, with the same model.',
      ask: ['Why is a meso-Rex bypass different from every portosystemic shunt?', 'It returns mesenteric venous blood to the liver instead of diverting it around the liver, so the gradient falls and sinusoidal flow rises.'],
    },
  ],
};
