// Presenter talk: the spleen in portal hypertension, how it grows, why the platelets fall, and what partial
// splenic embolization and splenectomy change (the slide fields are described at the top of decks.js).

export const SPLEEN = {
  id: 'spleen', level: 'core', title: 'The spleen in portal hypertension', minutes: 8,
  objectives: [
    'Explain why the spleen grows in portal hypertension',
    'Give the causes of a low platelet count in cirrhosis',
    'Use the platelets and the liver stiffness to decide on a screening endoscopy',
    'Compare partial splenic embolization with splenectomy',
  ],
  summary: 'How the spleen grows as the portal pressure rises, why the platelets fall, when platelets and stiffness can spare an endoscopy, and what splenic embolization and splenectomy do.',
  slides: [
    {
      id: 'normal', preset: 'healthy', cam: 'splenic', terms: ['spleen'], data: 'tiles', tiles: ['spleen', 'plt'], key: ['spleen'],
      kicker: 'A growing spleen', title: 'A normal spleen',
      line: 'The spleen is {spleen} long, the platelets are {plt}, and the [splenic vein](sv) drains it into the portal vein.',
      notes: 'The splenic vein joins the superior mesenteric vein behind the pancreas to form the portal vein. At any time about a third of the body\'s platelets are held in a normal spleen. On ultrasound a length up to about 12 cm is normal in an adult.',
      ask: ['What share of the body\'s platelets sits in a normal spleen?', 'About a third.'],
    },
    {
      id: 'grown', days: 730, ramp: { cirrhosis: [0, 0.6] }, lapse: { seconds: 10 }, cam: 'splenic', terms: ['spleen'], data: 'tiles', tiles: ['pv', 'spleen', 'plt'], key: ['spleen'], delta: 'normal',
      kicker: 'A growing spleen', site: 'sin', title: 'The spleen grows with the portal pressure',
      line: 'Two years of cirrhosis: the portal pressure reaches {pv}, the spleen grows to {spleen} and the platelets fall to {plt}.',
      notes: 'The spleen enlarges partly from congestion, as the high portal pressure backs up into the splenic vein, and partly because its pulp grows, with more splenic arterial flow. Splenomegaly is one of the commonest signs of portal hypertension, but its size follows the pressure only loosely.',
      ask: ['Does spleen size measure the portal pressure?', 'Only loosely: a large spleen suggests portal hypertension, but its size does not track the pressure closely.'],
    },
    {
      id: 'platelets', cam: 'spleen', terms: ['spleen'], data: 'tiles', tiles: ['plt', 'spleen'], key: ['plt'],
      kicker: 'The platelets', site: 'sin', title: 'Why the platelets fall',
      line: 'The large spleen pools more platelets and the scarred liver makes less thrombopoietin: the count is {plt}.',
      causesHead: 'Low platelets in cirrhosis', causes: ['Pooling in the large spleen', 'Less thrombopoietin', 'Marrow suppression'],
      notes: 'Alcohol, viruses and some drugs also suppress the marrow. A low platelet count is the commonest blood count change in cirrhosis, and a count below 150 is often the first clue to portal hypertension. It is rarely low enough to cause bleeding on its own. Before a procedure, a thrombopoietin receptor agonist can raise the count without touching the spleen.',
      ask: ['Name two reasons the platelet count falls in cirrhosis.', 'Pooling in the enlarged spleen, and less thrombopoietin from the liver.'],
    },
    {
      id: 'screen', cam: 'liver', tool: { kind: 'fibroscan' }, data: 'tiles', tiles: ['lsm', 'plt'], key: ['lsm', 'plt'],
      kicker: 'The platelets', site: 'sin', title: 'Platelets and stiffness decide the endoscopy',
      line: 'Stiffness below {<20 kPa} with platelets above 150 makes varices that need treatment unlikely. This patient has {lsm} and {plt}, so the scope is needed.',
      notes: 'These are the Baveno criteria for sparing a screening endoscopy in compensated advanced chronic liver disease; patients who meet them repeat the stiffness and the platelet count every year. This patient meets neither, so varices are looked for.',
      ask: ['Stiffness 14 kPa and platelets 190. Does this patient need a screening endoscopy?', 'No: below 20 kPa with platelets above 150, repeat both tests in a year.'],
    },
    {
      id: 'pse', params: { splenicRx: 1 }, cam: 'splenic', tool: { kind: 'doppler', vessel: 'SV_CONF', delta: 'grown' }, data: 'tiles', tiles: ['pv', 'hvpg'], key: ['pv'],
      kicker: 'Treating the spleen', site: 'sin', title: 'Partial splenic embolization',
      line: 'Particles block part of the splenic artery. Less blood leaves by the [splenic vein](sv), and the portal pressure eases to {pv}.',
      notes: 'Through a catheter in the splenic artery, particles infarct part of the splenic pulp, often half to two thirds of it. The splenic inflow falls, so less blood reaches the portal vein and the portal pressure falls a little. Pain and fever for a few days are common afterwards; splenic abscess and portal vein thrombosis are rarer complications.',
      ask: ['What is the commonest problem after partial splenic embolization?', 'Pain and fever for a few days (post-embolization syndrome).'],
    },
    {
      id: 'later', days: 180, lapse: { seconds: 6 }, cam: 'splenic', terms: ['spleen'], data: 'tiles', tiles: ['plt', 'spleen'], key: ['plt'], delta: 'grown',
      kicker: 'Treating the spleen', site: 'sin', title: 'Platelets rise as the spleen shrinks',
      line: 'Six months on, the spleen has shrunk to {spleen} and the platelets have risen to {plt}.',
      notes: 'With less working pulp, fewer platelets are pooled and the count rises over the following weeks. The rise can fade as the remaining spleen grows back. Embolization is used for severe thrombocytopenia or hypersplenism in centers with experience.',
      ask: ['Why do platelets rise after splenic embolization?', 'Less splenic pulp is left to pool them.'],
    },
    {
      id: 'splenectomy', preset: 'csph', params: { splenicRx: 2 }, cam: 'splenic', data: 'tiles', tiles: ['plt', 'pv'], key: ['plt'],
      kicker: 'Treating the spleen', site: 'sin', title: 'Splenectomy',
      line: 'Without a spleen nothing pools the platelets: the count is {plt}. But blood stagnates in the stump of the [splenic vein](sv), and the clot can spread into the portal vein.',
      notes: 'Splenectomy is now rare in cirrhosis: the operation carries real risk, and splenic and portal vein thrombosis is common after it. It keeps a place for bleeding gastric varices caused by splenic vein thrombosis, where the spleen is the source of the high pressure.',
      ask: ['Which complication of splenectomy is most feared in cirrhosis?', 'Splenic and portal vein thrombosis.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['spleen', 'plt', 'pv', 'hvpg'], asc: false, rowHead: 'Patient',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', ref: true }, { id: 'grown', kicker: 'Cirrhosis', title: 'One year on' }, { id: 'later', kicker: 'Embolization', title: 'Six months on' }, { id: 'splenectomy', kicker: 'Surgery', title: 'Splenectomy' }],
      kicker: 'Summary', title: 'The spleen compared',
      line: 'Embolization and splenectomy raise the platelets; neither does much to the portal pressure.',
      notes: 'The spleen grows and pools platelets as the portal pressure rises, so platelets and spleen size are cheap clues to portal hypertension. Treating the spleen treats the platelet count; the portal pressure is treated at its source, the liver, or with drugs and shunts.',
      ask: ['A patient with cirrhosis has platelets of 40 before a planned high-risk procedure. What raises the count without touching the spleen?', 'A thrombopoietin receptor agonist, started some days before.'],
    },
  ],
};
