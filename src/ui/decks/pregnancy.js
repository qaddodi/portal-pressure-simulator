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
    'Name when the risk of variceal bleeding is highest',
    'Plan screening EGD and treatment, band ligation or a beta-blocker, in pregnancy',
    'Describe how delivery is managed in a patient with varices',
  ],
  summary: 'One woman with compensated cirrhosis through pregnancy: increased blood volume and portal inflow, enlarging varices, second-trimester EGD, band ligation and propranolol, and delivery.',
  checks: [
    ['When is variceal bleeding most likely in pregnancy?', 'In the second trimester, as blood volume rises toward its peak, and during labor, when repeated Valsalva in the second stage raises portal pressure.'],
    ['When is screening EGD done, and what is the treatment if the varices are large with red wale signs?', 'In the second trimester, unless one was done in the year before conception. Band ligation is preferred when red wale signs are present (AASLD 2024); propranolol is the beta-blocker, and fetal growth is monitored.'],
    ['Which vasoactive drug is avoided in variceal bleeding during pregnancy?', 'Terlipressin, because it stimulates uterine contraction. Octreotide or somatostatin is used instead.'],
    ['At 28 weeks her HVPG has risen with no change in her liver. Which lever moved?', 'Portal inflow: blood volume and cardiac output rise in pregnancy, so more portal flow crosses the same fixed intrahepatic resistance.'],
  ],
  slides: [
    {
      id: 'before', preset: 'pregnancy', params: { gestation: 0 }, cam: 'varices', labels: ['VAR'],
      vignette: 'A 31-year-old woman with cirrhosis from autoimmune hepatitis wants to become pregnant. Her platelets are 87,000/µL, and an EGD last year showed small varices.',
      caseQ: 'What will pregnancy do to her varices?',
      data: 'tiles', tiles: ['hvpg', 'varix', 'plt'], key: ['hvpg'],
      kicker: 'Before pregnancy', site: 'sin', title: 'Compensated cirrhosis before pregnancy',
      line: 'Her HVPG is {hvpg}, which is {>=10 mmHg}, so she has clinically significant portal hypertension (CSPH), with small varices.',
      notes: 'Women with compensated cirrhosis can carry a pregnancy, but the risks rise with the severity of the liver disease. Preconception counseling includes EGD within the year before conception, with large varices treated first. Her medications are reviewed for safety in pregnancy. For her autoimmune hepatitis, the disease should be in remission for at least a year before conception; azathioprine and corticosteroids continue through pregnancy, because a flare is the greater risk, while mycophenolate is stopped and replaced at least 6 weeks before conception because it is teratogenic. That advice comes from autoimmune hepatitis guidance, not from the portal hypertension guidelines this talk cites.',
      ask: ['What should a woman with cirrhosis have before she conceives?', 'Counseling on her risks and EGD within the year before conception, with large varices treated first.'],
    },
    {
      id: 'weeks', params: { gestation: 24 }, cam: 'fit', labels: ['VAR', 'CONF'],
      whatIf: { label: 'Weeks of gestation', param: 'gestation', min: 0, max: 40, step: 1, unit: 'weeks' },
      tool: { kind: 'curve', param: 'gestation', from: 0, to: 40, step: 2, lines: ['varix', 'hvpg'] },
      data: 'tiles', tiles: ['bv', 'co', 'varix'], key: ['bv', 'co'], delta: 'before',
      kicker: 'Pregnancy', site: 'sin', title: 'Pregnancy expands blood volume and cardiac output',
      line: 'At 24 weeks’ gestation, blood volume is {bv} and cardiac output {co}.',
      notes: 'Drag Weeks of gestation to watch the varix enlarge. Blood volume rises by 30% to 50%, mostly in the first and second trimesters, and peaks around 32 weeks. Stroke volume and heart rate rise, and systemic vascular resistance falls. In a normal liver none of this raises portal pressure much. In cirrhosis the extra inflow meets a fixed intrahepatic resistance, the collaterals fill and the varices enlarge.',
      ask: ['By how much does blood volume rise in pregnancy?', 'By 30% to 50%, peaking around 32 weeks.'],
    },
    {
      id: 'inflow', cam: 'portal', labels: ['SMV', 'SV', 'CONF'], lens: 'flow', tool: { kind: 'flows' },
      data: 'tiles', tiles: ['pvFlow', 'hvpg'], key: ['pvFlow', 'hvpg'], delta: 'before',
      kicker: 'Pregnancy', site: 'sin', title: 'More portal inflow meets a fixed intrahepatic resistance',
      line: 'Portal flow rises to {pvFlow}, and across the cirrhotic liver the HVPG rises to {hvpg}.',
      notes: 'Splanchnic vasodilation increases portal inflow. A normal liver accommodates it by sinusoidal recruitment; a cirrhotic liver cannot, so pressure rises with flow. That is why the varices enlarge most in the second trimester, when blood volume and cardiac output rise fastest.',
      ask: ['Why does the same rise in flow raise portal pressure more in cirrhosis?', 'The cirrhotic liver has a fixed, high intrahepatic resistance, so pressure rises with flow.'],
    },
    {
      id: 'scope', cam: 'gej', labels: ['VAR', 'LGV'], calipers: ['varix'], tool: { kind: 'wall' },
      data: 'tiles', tiles: ['varix', 'hvpg'], key: ['varix'],
      kicker: 'Management', site: 'sin', title: 'Second-trimester EGD shows large varices', cite: 'AASLD 2024 55, 56 · Baveno VIII 8.17',
      line: 'Without EGD in the year before conception, screen in the second trimester. The varix now measures {varix}, with red wale signs.',
      notes: 'AASLD 2024 recommends EGD within the year before conception (statement 55), and early in the second trimester for a woman who was not screened (statement 56); Baveno VIII 8.17, written for vascular liver disease, gives the same timing. The second trimester follows organogenesis and precedes both the peak in blood volume and labor. Varices can enlarge quickly, so a normal EGD before pregnancy does not settle the question. For medium and large varices AASLD 2024 recommends a nonselective beta-blocker or band ligation in pregnancy, and prefers band ligation when cherry-red spots or red wale signs are present, as here. It notes that few data exist to guide the management of varices in pregnancy.',
      ask: ['Why is the second trimester chosen for screening EGD?', 'Organogenesis is complete, and it precedes both the peak in blood volume and labor.'],
    },
    {
      id: 'propranolol', params: ON, action: { kind: 'band' }, cam: 'gej', labels: ['VAR'],
      data: 'tiles', tiles: ['hvpg', 'hr'], key: ['hvpg'], delta: true,
      tool: { kind: 'criteria', title: 'Monitor on propranolol', short: 'Monitor', ticks: false, rows: ['Fetal **growth restriction**', 'Neonatal **bradycardia**', 'Neonatal **hypoglycemia**'] },
      kicker: 'Management', site: 'sin', title: 'Red wale signs favor band ligation, and propranolol lowers the HVPG', cite: 'AASLD 2024 · Baveno VIII 8.18',
      line: 'Red wale signs favor band ligation, so her varix is banded. At a starting dose, propranolol lowers the HVPG to {hvpg} and heart rate to {hr}.',
      notes: 'AASLD 2024 recommends a nonselective beta-blocker or band ligation for medium and large varices in pregnancy, and prefers band ligation when red wale signs are present, so the varix here is banded. Baveno VIII 8.18, written for vascular liver disease, says prophylaxis in pregnancy follows the same principles as outside it, including propranolol; the case uses both. Propranolol is titrated to a resting heart rate of 55 to 60 beats/min, as outside pregnancy. Fetal growth is monitored by ultrasound. AASLD 2024 notes weak evidence, from studies in cardiac patients, that carvedilol causes less fetal growth restriction than propranolol. Neither guideline file lists neonatal monitoring for bradycardia and hypoglycemia; it is standard practice after in utero beta-blocker exposure. A beta-blocker does not shrink varices within days, so the varix is not shown here; in the model it follows the pressure at once.',
      ask: ['What is monitored in the fetus and neonate when the mother takes propranolol?', 'Fetal growth before delivery and, in standard practice, neonatal heart rate and glucose after it.'],
    },
    {
      id: 'delivery', params: { gestation: 38 }, cam: 'varices', labels: ['VAR'],
      data: 'tiles', tiles: ['hvpg', 'ppg'], key: ['hvpg'], delta: 'propranolol',
      tool: { kind: 'criteria', title: 'At delivery', ticks: false, lead: 'In the absence of obstetric contraindications.', rule: 'Baveno VIII 8.18, 8.19', rows: ['**Propranolol** continues', '**Vaginal** delivery is preferred to **cesarean**', ['**Platelets** >20,000/µL', 'plt', '>', 20]] },
      kicker: 'Delivery and after', site: 'sin', title: 'Vaginal delivery with a shortened second stage',
      line: 'Repeated Valsalva in the second stage is thought to raise the risk of variceal bleeding, so the second stage is shortened. At 38 weeks her HVPG is {hvpg}.',
      notes: 'Labor is thought to carry a high risk of variceal bleeding from repeated Valsalva, so the second stage is shortened, usually by assisted delivery with forceps or vacuum. The model does not show this risk: a sustained Valsalva lowers the transmural variceal pressure here. Baveno VIII 8.19 prefers vaginal delivery to cesarean when there is no obstetric contraindication, provided the platelet count is >20,000/µL, and 8.18 continues propranolol. Both statements are written for vascular liver disease, and this talk applies them to cirrhosis. Cesarean delivery transects abdominal wall collaterals, which can bleed, so it is reserved for obstetric indications. If a varix bleeds, AASLD 2024 advises somatostatin or octreotide rather than terlipressin, which stimulates uterine contraction, and reports band ligation in case series. Neither guideline file gives the advice on forceps or vacuum: it is standard obstetric practice.',
      ask: ['Why is the second stage of labor shortened?', 'Repeated Valsalva is thought to raise the risk of variceal bleeding.'],
    },
    {
      id: 'after', params: { gestation: 0 }, cam: 'fit', labels: ['VAR', 'CONF'],
      data: 'tiles', tiles: ['bv', 'co', 'hvpg'], key: ['bv', 'hvpg'], delta: 'weeks',
      kicker: 'Delivery and after', site: 'sin', title: 'Hemodynamics return to baseline after delivery', cite: 'Baveno VIII 8.20',
      line: 'Blood volume falls back to {bv} and, on propranolol, the HVPG to {hvpg}. In patients this takes 6 to 12 weeks.',
      notes: 'The expanded blood volume and cardiac output return to baseline over the weeks after delivery, and portal pressure follows. Propranolol continues, and Baveno VIII 8.20 says nonselective beta-blockers are safe during breastfeeding. Hepatic decompensation can still occur in the months after delivery, so she is followed closely and EGD is repeated. Postpartum flares of autoimmune hepatitis are common as the immune tolerance of pregnancy ends, so her liver tests are checked every few weeks and immunosuppression is maintained. The model returns to baseline at once; in patients it takes 6 to 12 weeks.',
      ask: ['Can a mother on propranolol breastfeed?', 'Yes. Baveno VIII 8.20 says nonselective beta-blockers are safe during breastfeeding.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['hvpg', 'ppg', 'pvFlow', 'co', 'hr'], asc: false, rowHead: 'Time',
      of: [{ id: 'before', kicker: 'Baseline', title: 'Before pregnancy' }, { id: 'weeks', title: '24 weeks' }, { id: 'propranolol', title: '24 weeks, banded, propranolol' },
        { id: 'delivery', title: '38 weeks, propranolol' }, { id: 'after', title: 'After delivery' }],
      kicker: 'Summary', title: 'Pregnancy raises portal inflow against a fixed resistance',
      line: 'Blood volume and portal inflow rise through the second trimester and the varices enlarge; propranolol lowers the portal pressure again.',
      notes: 'Pregnancy increases blood volume, cardiac output and splanchnic flow. A normal liver accommodates the extra flow; in cirrhosis it raises portal pressure. Screen in the second trimester, treat medium or large varices with band ligation (preferred with red wale signs) or propranolol, and shorten the second stage of labor.',
      ask: ['Which two periods carry the highest risk of variceal bleeding?', 'The second trimester and labor.'],
    },
  ],
};
