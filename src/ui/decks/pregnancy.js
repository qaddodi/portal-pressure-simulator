// Presenter talk: Cirrhosis in pregnancy (Advanced). Slide fields as documented at the top of decks.js.
// One patient, the "Cirrhosis in pregnancy" preset, taken back to before pregnancy and then through it: the weeks slider
// (model parameter `gestation`) shows the blood volume, cardiac output and varix grow.

const OFF = { drugs: { propranolol: false } }, ON = { drugs: { propranolol: true } };

export const PREGNANCY_DECK = {
  id: 'pregnancy', level: 'advanced', title: 'Cirrhosis in pregnancy', minutes: 10,
  objectives: [
    'Explain why pregnancy raises portal pressure in cirrhosis',
    'Name when the risk of a variceal bleed is highest',
    'Plan the screening endoscopy and the beta-blocker in pregnancy',
    'Describe how delivery is managed when there are varices',
  ],
  summary: 'One woman with compensated cirrhosis through pregnancy: more blood volume and portal inflow, growing varices, a second-trimester endoscopy, propranolol, and delivery.',
  checks: [
    ['When is a variceal bleed most likely in pregnancy?', 'In the second trimester, as the blood volume rises toward its peak, and during labor, when pushing raises the portal pressure.'],
    ['When is the screening endoscopy done, and which beta-blocker follows if the varices are large?', 'In the second trimester, unless one was done in the year before conception. Propranolol: fetal growth is followed, and the newborn is watched for bradycardia and hypoglycemia.'],
    ['Which vasoactive drug is avoided in a variceal bleed during pregnancy?', 'Terlipressin, because it stimulates uterine contraction. Octreotide or somatostatin is used instead.'],
    ['At 28 weeks her HVPG has risen with no change in her liver. Which lever moved?', 'The inflow: the blood volume and cardiac output rise in pregnancy, so more portal flow crosses the same scarred liver.'],
  ],
  slides: [
    {
      id: 'before', preset: 'pregnancy', params: { gestation: 0 }, cam: 'varices', labels: ['VAR'],
      vignette: 'A 31-year-old woman with cirrhosis from autoimmune hepatitis wants to become pregnant. Her platelets are 84,000/µL, and an EGD last year showed small varices.',
      caseQ: 'What will pregnancy do to her varices?',
      data: 'tiles', tiles: ['hvpg', 'varix', 'plt'], key: ['hvpg'],
      kicker: 'Before pregnancy', site: 'sin', title: 'Compensated cirrhosis before pregnancy',
      line: 'Her HVPG is {hvpg}, which is {>=10 mmHg}, so she has clinically significant portal hypertension, with small varices.',
      notes: 'Women with compensated cirrhosis can carry a pregnancy, but the risks rise with the severity of the liver disease, and a MELD score of 10 or more predicts a poorer outcome. Counseling before conception includes an endoscopy within the year before she conceives, with large varices treated first. Her medicines are reviewed for safety in pregnancy.',
      ask: ['What should a woman with cirrhosis have before she conceives?', 'Counseling on her risks and an endoscopy within the year before conception, with large varices treated first.'],
    },
    {
      id: 'weeks', params: { gestation: 24 }, cam: 'fit', labels: ['VAR', 'CONF'],
      whatIf: { label: 'Weeks pregnant', param: 'gestation', min: 0, max: 40, step: 1, unit: 'weeks' },
      tool: { kind: 'curve', param: 'gestation', from: 0, to: 40, step: 2, lines: ['varix', 'hvpg'] },
      data: 'tiles', tiles: ['bv', 'co', 'varix'], key: ['bv', 'co'], delta: 'before',
      kicker: 'Pregnancy', site: 'sin', title: 'Pregnancy fills the circulation',
      line: 'At 24 weeks the blood volume is {bv} and the cardiac output {co}. Drag the weeks and watch the varix grow.',
      notes: 'Blood volume rises by 30 to 50 percent, mostly in the first and second trimesters, and peaks around 32 weeks. The heart pumps more with each beat and beats faster, and the arterioles widen. In a healthy liver none of this raises the portal pressure much. Behind a cirrhotic liver it fills the collaterals, and the varices grow.',
      ask: ['By how much does blood volume rise in pregnancy?', 'By 30 to 50 percent, with its peak around 32 weeks.'],
    },
    {
      id: 'inflow', cam: 'portal', labels: ['SMV', 'SV', 'CONF'], lens: 'flow',
      data: 'tiles', tiles: ['pvFlow', 'hvpg'], key: ['pvFlow', 'hvpg'], delta: 'before',
      kicker: 'Pregnancy', site: 'sin', title: 'More portal inflow meets a stiff liver',
      line: 'Colored by flow, the gut veins carry more blood: portal flow is {pvFlow}, and through the scarred liver the HVPG rises to {hvpg}.',
      notes: 'Splanchnic vasodilation raises the flow into the portal vein. A healthy liver widens its sinusoids to take it; a cirrhotic liver cannot, so the pressure rises with the flow. That is why the varices grow most in the second trimester, when the volume and the output climb fastest.',
      ask: ['Why does the same rise in flow raise the portal pressure more in cirrhosis?', 'The scarred liver has a fixed, high resistance, so pressure rises with flow.'],
    },
    {
      id: 'scope', cam: 'gej', labels: ['VAR', 'LGV'], calipers: ['varix'], tool: { kind: 'scope', open: true },
      data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'],
      kicker: 'Management', site: 'sin', title: 'A second-trimester endoscopy finds large varices',
      line: 'Without a scope in the year before conception, screen in the second trimester. The varix now measures {varix}, with red wale marks.',
      notes: 'An endoscopy in the second trimester is safe with light sedation and comes after organogenesis but before the volume peaks and before labor. Large varices, or small ones with red signs, need prophylaxis. Varices can grow quickly, so a scope that was clear before pregnancy does not settle the question. Source: Baveno VIII 8.17; AASLD 2024 55, 56',
      ask: ['Why is the second trimester chosen for the screening endoscopy?', 'Organogenesis is over, and it comes before the volume peaks and before labor.'],
    },
    {
      id: 'propranolol', params: ON, cam: 'gej', labels: ['VAR'],
      compare: [{ label: 'No beta-blocker', params: OFF }, { label: 'Propranolol', params: ON, own: true }],
      data: 'tiles', tiles: ['hvpg', 'hr'], key: ['hvpg'], delta: true,
      tool: { kind: 'criteria', title: 'Watch for, on propranolol', short: 'Watch for', ticks: false, rule: 'Baveno VIII 8.18', rows: ['Fetal **growth restriction**', 'Neonatal **bradycardia**', 'Neonatal **hypoglycemia**'] },
      kicker: 'Management', site: 'sin', title: 'Propranolol is the beta-blocker in pregnancy',
      line: 'Propranolol lowers the HVPG to {hvpg} and the heart rate to {hr}. Band ligation is the choice when propranolol cannot be taken.',
      notes: 'Propranolol has the longest record in pregnancy, and carvedilol much less, so propranolol is used, titrated to a resting heart rate of 55 to 60. Fetal growth is followed on ultrasound, and the newborn is watched for a slow heart rate and low glucose. Band ligation is safe in pregnancy and is used when a beta-blocker is not tolerated or does not suffice. Source: Baveno VIII 8.18; AASLD 2024, portal hypertension in pregnancy',
      ask: ['What is watched in the baby when the mother takes propranolol?', 'Fetal growth before birth, and bradycardia and hypoglycemia after it.'],
    },
    {
      id: 'delivery', params: { gestation: 38 }, cam: 'varices', labels: ['VAR'],
      data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'], delta: 'propranolol',
      tool: { kind: 'criteria', title: 'At delivery', ticks: false, rule: 'Baveno VIII 8.19', rows: ['**Propranolol** continues', '**Cesarean** for obstetric reasons only', 'Check **platelets** before a **neuraxial block**'] },
      kicker: 'Delivery and after', site: 'sin', title: 'A vaginal delivery with a short second stage',
      line: 'Pushing strains against a closed glottis and raises the pressure in the varices, so the second stage is kept short and assisted.',
      notes: 'Labor is the second time of highest risk for a variceal bleed. Repeated Valsalva strain raises the abdominal and portal pressure, so the second stage is shortened with forceps or vacuum. Cesarean delivery cuts through abdominal wall collaterals and can bleed heavily, so it is kept for obstetric reasons. If a varix bleeds, octreotide or somatostatin and banding are used; AASLD 2024 advises avoiding terlipressin in pregnancy because it stimulates uterine contraction. Source: Baveno VIII 8.19',
      ask: ['Why is the second stage of labor kept short?', 'Repeated straining raises the portal pressure and the varix may bleed.'],
    },
    {
      id: 'after', params: { gestation: 0 }, cam: 'fit', labels: ['VAR', 'CONF'],
      data: 'tiles', tiles: ['bv', 'co', 'hvpg'], key: ['bv', 'hvpg'], delta: 'weeks',
      kicker: 'Delivery and after', site: 'sin', title: 'The circulation settles after delivery',
      line: 'The blood volume falls back to {bv} and, on propranolol, the HVPG to {hvpg}.',
      notes: 'The extra volume and output fade over the weeks after delivery, and the portal pressure follows. Propranolol continues, and it is compatible with breastfeeding. Decompensation can still appear in the months after delivery, so the liver is followed closely, and the varices are checked again. Note: The model returns at once; in patients it takes six to twelve weeks.',
      ask: ['Can a mother on propranolol breastfeed?', 'Yes. Little passes into the milk.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'ppg', 'varix', 'pvFlow', 'hr'], asc: false, rowHead: 'Time',
      of: [{ id: 'before', kicker: 'Baseline', title: 'Before pregnancy' }, { id: 'weeks', title: '24 weeks' }, { id: 'propranolol', title: '24 weeks, propranolol' },
        { id: 'delivery', title: '38 weeks, propranolol' }, { id: 'after', title: 'After delivery' }],
      kicker: 'Summary', title: 'Pregnancy loads a stiff liver',
      line: 'Volume and portal inflow rise through the second trimester and the varices grow; propranolol brings the pressure back down.',
      notes: 'Pregnancy adds volume, output and splanchnic flow. A healthy liver takes the extra flow; a cirrhotic one turns it into pressure. Screen in the second trimester, treat large varices with propranolol or banding, and keep the second stage of labor short.',
      ask: ['Which two times carry the highest risk of a variceal bleed?', 'The second trimester and labor.'],
    },
  ],
};
