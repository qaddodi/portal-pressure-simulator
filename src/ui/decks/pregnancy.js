// Presenter talk: Cirrhosis in pregnancy (Advanced). Slide fields as documented at the top of decks.js.
// One patient, the "Cirrhosis in pregnancy" preset, taken back to before pregnancy and then through it: the weeks slider
// (model parameter `gestation`) shows the blood volume, cardiac output and varix grow.

const ON = { drugs: { propranolol: true } };
// (The varix tile is left off every slide after the drug and the bands: in the model the diameter follows the pressure at once, which would read
// as a beta-blocker shrinking the varix in an afternoon. When the engine lags the varix, put 'varix' back in the tiles of `delivery` and in `cols`
// of the summary.)

export const PREGNANCY_DECK = {
  id: 'pregnancy', level: 'advanced', title: 'Cirrhosis in pregnancy', minutes: 10,
  objectives: [
    'Explain why pregnancy raises portal pressure in cirrhosis',
    'Name when the risk of a variceal bleed is highest',
    'Plan the screening endoscopy and the treatment, banding or a beta-blocker, in pregnancy',
    'Describe how delivery is managed when there are varices',
  ],
  summary: 'One woman with compensated cirrhosis through pregnancy: more blood volume and portal inflow, growing varices, a second-trimester endoscopy, banding and propranolol, and delivery.',
  checks: [
    ['When is a variceal bleed most likely in pregnancy?', 'In the second trimester, as the blood volume rises toward its peak, and during labor, when pushing raises the portal pressure.'],
    ['When is the screening endoscopy done, and what is the treatment if the varices are large and have red wale signs?', 'In the second trimester, unless one was done in the year before conception. Banding is preferred when there are red wale signs (AASLD 2024); propranolol is the beta-blocker, and fetal growth is followed.'],
    ['Which vasoactive drug is avoided in a variceal bleed during pregnancy?', 'Terlipressin, because it stimulates uterine contraction. Octreotide or somatostatin is used instead.'],
    ['At 28 weeks her HVPG has risen with no change in her liver. Which lever moved?', 'The inflow: the blood volume and cardiac output rise in pregnancy, so more portal flow crosses the same scarred liver.'],
  ],
  slides: [
    {
      id: 'before', preset: 'pregnancy', params: { gestation: 0 }, cam: 'varices', labels: ['VAR'],
      vignette: 'A 31-year-old woman with cirrhosis from autoimmune hepatitis wants to become pregnant. Her platelets are 87,000/µL, and an EGD last year showed small varices.',
      caseQ: 'What will pregnancy do to her varices?',
      data: 'tiles', tiles: ['hvpg', 'varix', 'plt'], key: ['hvpg'],
      kicker: 'Before pregnancy', site: 'sin', title: 'Compensated cirrhosis before pregnancy',
      line: 'Her HVPG is {hvpg}, which is {>=10 mmHg}, so she has clinically significant portal hypertension, with small varices.',
      notes: 'Women with compensated cirrhosis can carry a pregnancy, but the risks rise with the severity of the liver disease. Counseling before conception includes an endoscopy within the year before she conceives, with large varices treated first. Her medicines are reviewed for safety in pregnancy. For her autoimmune hepatitis, the disease should be in remission for at least a year before she conceives; azathioprine and steroids continue through pregnancy, because a flare is the greater risk, while mycophenolate is stopped, and switched, at least 6 weeks before conception, because it causes malformations. That advice comes from autoimmune hepatitis guidance, not from the portal hypertension guidelines this talk cites.',
      ask: ['What should a woman with cirrhosis have before she conceives?', 'Counseling on her risks and an endoscopy within the year before conception, with large varices treated first.'],
    },
    {
      id: 'weeks', params: { gestation: 24 }, cam: 'fit', labels: ['VAR', 'CONF'],
      whatIf: { label: 'Weeks pregnant', param: 'gestation', min: 0, max: 40, step: 1, unit: 'weeks' },
      tool: { kind: 'curve', param: 'gestation', from: 0, to: 40, step: 2, lines: ['varix', 'hvpg'] },
      data: 'tiles', tiles: ['bv', 'co', 'varix'], key: ['bv', 'co'], delta: 'before',
      kicker: 'Pregnancy', site: 'sin', title: 'Pregnancy fills the circulation',
      line: 'At 24 weeks the blood volume is {bv} and the cardiac output {co}.',
      notes: 'Drag the weeks and watch the varix grow. Blood volume rises by 30 to 50 percent, mostly in the first and second trimesters, and peaks around 32 weeks. The heart pumps more with each beat and beats faster, and the arterioles widen. In a healthy liver none of this raises the portal pressure much. Behind a cirrhotic liver it fills the collaterals, and the varices grow.',
      ask: ['By how much does blood volume rise in pregnancy?', 'By 30 to 50 percent, with its peak around 32 weeks.'],
    },
    {
      id: 'inflow', cam: 'portal', labels: ['SMV', 'SV', 'CONF'], lens: 'flow',
      data: 'tiles', tiles: ['pvFlow', 'hvpg'], key: ['pvFlow', 'hvpg'], delta: 'before',
      kicker: 'Pregnancy', site: 'sin', title: 'More portal inflow meets a stiff liver',
      line: 'Portal flow rises to {pvFlow}, and through the scarred liver the HVPG rises to {hvpg}.',
      notes: 'Splanchnic vasodilation raises the flow into the portal vein. A healthy liver widens its sinusoids to take it; a cirrhotic liver cannot, so the pressure rises with the flow. That is why the varices grow most in the second trimester, when the volume and the output climb fastest.',
      ask: ['Why does the same rise in flow raise the portal pressure more in cirrhosis?', 'The scarred liver has a fixed, high resistance, so pressure rises with flow.'],
    },
    {
      id: 'scope', cam: 'gej', labels: ['VAR', 'LGV'], calipers: ['varix'], tool: { kind: 'wall' },
      data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'],
      kicker: 'Management', site: 'sin', title: 'A second-trimester endoscopy finds large varices', cite: 'AASLD 2024 55, 56 · Baveno VIII 8.17',
      line: 'Without a scope in the year before conception, screen in the second trimester. The varix now measures {varix}, with red wale marks.',
      notes: 'AASLD 2024 asks for an endoscopy within the year before conception (statement 55), and early in the second trimester for a woman who was not screened (statement 56); Baveno VIII 8.17, written for vascular liver disease, gives the same timing. The second trimester comes after organogenesis and before the volume peaks and before labor. Varices can grow quickly, so a scope that was clear before pregnancy does not settle the question. For medium and large varices AASLD 2024 recommends a non-selective beta-blocker or band ligation in pregnancy, and prefers banding when there are cherry-red spots or red wale signs, as here. It notes that few data exist to guide the management of varices in pregnancy.',
      ask: ['Why is the second trimester chosen for the screening endoscopy?', 'Organogenesis is over, and it comes before the volume peaks and before labor.'],
    },
    {
      id: 'propranolol', params: ON, action: { kind: 'band' }, cam: 'gej', labels: ['VAR'],
      data: 'tiles', tiles: ['hvpg', 'hr'], key: ['hvpg'], delta: true,
      tool: { kind: 'criteria', title: 'Watch for, on propranolol', short: 'Watch for', ticks: false, rows: ['Fetal **growth restriction**', 'Neonatal **bradycardia**', 'Neonatal **hypoglycemia**'] },
      kicker: 'Management', site: 'sin', title: 'Red wale signs favor banding, and propranolol lowers the pressure', cite: 'AASLD 2024 · Baveno VIII 8.18',
      line: 'Red wale signs favor banding, so her varix is banded. At a starting dose, propranolol lowers the HVPG to {hvpg} and the heart rate to {hr}.',
      notes: 'AASLD 2024 recommends a non-selective beta-blocker or band ligation for medium and large varices in pregnancy, and prefers banding when red wale signs are present, so the varix here is banded. Baveno VIII 8.18, written for vascular liver disease, says prophylaxis in pregnancy follows the same principles as outside it, including propranolol; the case uses both. Propranolol is titrated to a resting heart rate of 55 to 60, as outside pregnancy. Fetal growth is followed on ultrasound. AASLD 2024 notes weak evidence, from studies in cardiac patients, that carvedilol causes less fetal growth restriction than propranolol. Neither guideline file lists the newborn checks for a slow heart rate and low glucose; they are usual practice after beta-blocker exposure. A beta-blocker does not shrink varices within days, so the varix is not shown here; in the model it follows the pressure at once.',
      ask: ['What is watched in the baby when the mother takes propranolol?', 'Fetal growth before birth and, in usual practice, the newborn\'s heart rate and glucose after it.'],
    },
    {
      id: 'delivery', params: { gestation: 38 }, cam: 'varices', labels: ['VAR'],
      data: 'tiles', tiles: ['hvpg', 'ppg'], key: ['hvpg'], delta: 'propranolol',
      tool: { kind: 'criteria', title: 'At delivery', ticks: false, lead: 'In the absence of obstetric contraindications.', rule: 'Baveno VIII 8.18, 8.19', rows: ['**Propranolol** continues', '**Vaginal** delivery is preferred to **cesarean**', ['**Platelets** >20 G/L', 'plt', '>', 20]] },
      kicker: 'Delivery and after', site: 'sin', title: 'A vaginal delivery with a short second stage',
      line: 'Pushing strains against a closed glottis and raises the pressure in the varices, so the second stage is kept short. At 38 weeks her HVPG is {hvpg}.',
      notes: 'Labor is thought to carry a high risk of a variceal bleed because repeated Valsalva strain raises the abdominal and portal pressure, so the second stage is kept short; obstetric teams usually do this with forceps or a vacuum. Baveno VIII 8.19 prefers vaginal delivery to cesarean when there is no obstetric contraindication, provided the platelet count is above 20 G/L, and 8.18 keeps propranolol going. Both statements are written for vascular liver disease, and this talk applies them to cirrhosis. Cesarean delivery cuts through abdominal wall collaterals, which can bleed, so it is kept for obstetric reasons. If a varix bleeds, AASLD 2024 advises somatostatin or octreotide rather than terlipressin, which stimulates uterine contraction, and reports band ligation in case series. Neither guideline file gives the advice on forceps or a vacuum: it is usual obstetric practice.',
      ask: ['Why is the second stage of labor kept short?', 'Repeated straining raises the portal pressure and the varix may bleed.'],
    },
    {
      id: 'after', params: { gestation: 0 }, cam: 'fit', labels: ['VAR', 'CONF'],
      data: 'tiles', tiles: ['bv', 'co', 'hvpg'], key: ['bv', 'hvpg'], delta: 'weeks',
      kicker: 'Delivery and after', site: 'sin', title: 'The circulation settles after delivery', cite: 'Baveno VIII 8.20',
      line: 'The blood volume falls back to {bv} and, on propranolol, the HVPG to {hvpg}. In patients this takes 6 to 12 weeks.',
      notes: 'The extra volume and output fade over the weeks after delivery, and the portal pressure follows. Propranolol continues, and Baveno VIII 8.20 says non-selective beta-blockers are safe during breastfeeding. Decompensation can still appear in the months after delivery, so the liver is followed closely, and the varices are checked again. Autoimmune hepatitis often flares in the months after delivery, as the immune tolerance of pregnancy ends, so her liver tests are checked every few weeks and her immunosuppression kept up. Note: The model returns at once; in patients it takes six to twelve weeks.',
      ask: ['Can a mother on propranolol breastfeed?', 'Yes. Baveno VIII 8.20 says non-selective beta-blockers are safe during breastfeeding.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'ppg', 'pvFlow', 'co', 'hr'], asc: false, rowHead: 'Time',
      of: [{ id: 'before', kicker: 'Baseline', title: 'Before pregnancy' }, { id: 'weeks', title: '24 weeks' }, { id: 'propranolol', title: '24 weeks, banded, propranolol' },
        { id: 'delivery', title: '38 weeks, propranolol' }, { id: 'after', title: 'After delivery' }],
      kicker: 'Summary', title: 'Pregnancy loads a stiff liver',
      line: 'Volume and portal inflow rise through the second trimester and the varices grow; propranolol brings the pressure back down.',
      notes: 'Pregnancy adds volume, output and splanchnic flow. A healthy liver takes the extra flow; a cirrhotic one turns it into pressure. Screen in the second trimester, treat medium or large varices with banding, preferred when there are red wale signs, or with propranolol, and keep the second stage of labor short.',
      ask: ['Which two times carry the highest risk of a variceal bleed?', 'The second trimester and labor.'],
    },
  ],
};
