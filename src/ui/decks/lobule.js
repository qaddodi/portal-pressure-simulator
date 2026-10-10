// Presenter talk: inside the lobule, where each disease sits. Slide fields as documented at the top of decks.js.

export const LOBULE = {
  id: 'lobule', level: 'advanced', title: 'Inside the lobule: where each disease sits', minutes: 10,
  sections: [['The lobule', ['The lobule']], ['Where the block sits', ['Presinusoidal', 'Sinusoidal', 'Postsinusoidal', 'Cardiac']], ['Measuring', ['Measuring']]],
  objectives: [
    'Trace blood through the lobule from the portal tract to the central vein',
    'Place schistosomiasis, cirrhosis, sinusoidal obstruction and congestion in the lobule',
    'Predict the HVPG and the ascites protein from the site of the block',
    'Explain what the wedged pressure reads and what it misses',
  ],
  summary: 'The lobule from portal tract to central vein, and the point in it that each disease blocks. Ends with what the wedge reads at each site.',
  slides: [
    {
      id: 'lobule', preset: 'healthy', cam: 'lobule:fit',
      kicker: 'The lobule', title: 'The lobule from tract to central vein',
      line: 'Portal tracts at the corners, the central vein in the middle, sinusoids between.',
      notes: 'The classic lobule is a hexagon about a millimeter across. Blood enters at the portal tracts, where portal venules and hepatic arterioles empty into the sinusoids, runs inward along plates of liver cells one cell thick, and leaves by the central vein (terminal hepatic venule). Each disease in this talk blocks one point on that path, and the point decides the pressures, the HVPG and the ascites.',
      ask: ['Which way does blood run in the lobule?', 'From the portal tracts at the edge, through the sinusoids, to the central vein.'],
    },
    {
      id: 'zones', cam: 'lobule', layers: ['zones'],
      kicker: 'The lobule', title: 'Zones 1 to 3',
      line: 'Oxygen and nutrients fall from the portal tract to the central vein. Zone 3, around the central vein, gets the least.',
      notes: 'In the acinus, zone 1 lies next to the portal tract and zone 3 around the central vein. Blood gives up oxygen as it runs, so zone 3 cells work closest to hypoxia; they also hold most of the cytochrome P450 enzymes. Zone 3 is the first injured by low flow (ischemic hepatitis), by congestion and by toxins activated there, such as paracetamol. Zone 1 is hit first by toxins that arrive directly, and is where periportal disease begins.',
      ask: ['Why is zone 3 the vulnerable zone?', 'It is last on the path, so it gets the least oxygen, and it is where many drugs are activated.'],
    },
    {
      id: 'schisto', preset: 'schisto', cam: 'lobule:triad', callout: { at: 'triad', label: 'Block: portal venules' }, data: 'tiles', tiles: ['pv', 'hvpg'],
      kicker: 'Presinusoidal', site: 'presin', title: 'Schistosomiasis: the portal tract',
      line: 'Eggs lodge in the portal venules. Granulomas and fibrosis form around them, and the sinusoids downstream stay normal. The portal pressure is {pv}, yet the HVPG only {hvpg}.',
      notes: 'Schistosoma mansoni and japonicum eggs are carried in portal blood and trapped in the small portal venules, where they cause granulomas and then periportal (pipestem) fibrosis. The block is before the sinusoids: the portal pressure is high, but the wedge reads the normal sinusoids, so the HVPG is normal or only slightly raised. Liver cells are spared, so function is kept for years. Varices and splenomegaly are the presentation; ascites is rare. Porto-sinusoidal vascular disorder behaves the same way.',
      ask: ['Why is the HVPG normal in schistosomiasis?', 'The block is in the portal venules, before the sinusoids that the wedge reads.'],
    },
    {
      id: 'cirr', preset: 'cirr-decomp', cam: 'sinusoid', callout: { at: 'sin', label: 'Block: sinusoids' }, data: 'tiles', tiles: ['sin', 'hvpg'],
      kicker: 'Sinusoidal', site: 'sin', title: 'Cirrhosis: the sinusoid',
      line: 'Collagen fills the space of Disse, the fenestrae close, and stellate cells contract around the sinusoid.',
      notes: 'Activated stellate cells lay down collagen in the space of Disse; the endothelium loses its fenestrae and gains a basement membrane (capillarization). Scar and regenerative nodules distort and compress the sinusoids. This structural part makes up about two thirds of the raised resistance. The rest is tone: too little nitric oxide in the liver, and contracted stellate cells, which is why drugs such as carvedilol and statins can lower it. With the wall closed, protein no longer crosses freely, so the ascites of cirrhosis is low in protein.',
      ask: ['Name the two parts of the raised resistance in cirrhosis.', 'Structural (scar, nodules, capillarised sinusoids) and dynamic (vascular tone).'],
    },
    {
      id: 'sos', preset: 'sos', cam: 'lobule:central', callout: { at: 'cv', label: 'Block: central venules' }, data: 'tiles', tiles: ['hvpg', 'asc'],
      kicker: 'Postsinusoidal', site: 'postsin', title: 'Sinusoidal obstruction syndrome: the central venule',
      line: 'Injured endothelium swells and sloughs into the small central veins and blocks them.',
      notes: 'Sinusoidal obstruction syndrome (veno-occlusive disease) follows injury to the sinusoidal endothelium of zone 3: myeloablative conditioning before stem cell transplantation (busulfan, cyclophosphamide, total body irradiation), oxaliplatin, and pyrrolizidine alkaloids in herbal teas. The cells round up and detach, red cells dissect into the space of Disse, and debris blocks the central venules. Weight gain, painful hepatomegaly, ascites and jaundice follow, classically within three weeks of transplant. The wedge lies upstream of the block, so the HVPG is raised; above 10 mmHg supports the diagnosis. Defibrotide is the treatment.',
      ask: ['Why does the HVPG rise in sinusoidal obstruction syndrome?', 'The block is in the central venules, between the sinusoids the wedge reads and the free hepatic vein.'],
    },
    {
      id: 'cong', preset: 'rhf', cam: 'lobule:central', data: 'tiles', tiles: ['pv', 'hvpg'],
      kicker: 'Cardiac', site: 'cardiac', title: 'Congestion: zone 3',
      line: 'Back pressure from the heart dilates the sinusoids around the central vein, and zone 3 cells die first. The portal vein reads {pv}, the HVPG {hvpg}.',
      notes: 'A high right atrial pressure passes back through the hepatic veins into the central veins and the sinusoids of zone 3, which dilate and fill with blood; the cut liver looks like a nutmeg. Low cardiac output adds hypoxia, and zone 3 cells atrophy and die. Years of this lay down fibrosis that links the central veins (cardiac cirrhosis). Every pressure from the portal vein to the atrium is high, so the HVPG is normal. The sinusoid wall is still open, so the ascites is rich in protein.',
      ask: ['Why is the HVPG normal in congestive hepatopathy although the portal pressure is high?', 'The wedged and free pressures rise together with the right atrium.'],
    },
    {
      id: 'wedge', preset: 'schisto', cath: 'wedge', data: 'ladder', key: ['hvpg'], column: true,
      kicker: 'Measuring', site: 'presin', title: 'What the wedge reads',
      line: 'The still column under the balloon reads the sinusoids. A block before them is invisible to it.',
      notes: 'Wedging the catheter, or inflating its balloon, stops the flow in that hepatic vein. The column of blood behind it then equals the pressure where it next meets moving blood: the sinusoids. In cirrhosis the sinusoids are at about portal pressure, so the wedged pressure stands in for it. In schistosomiasis, shown here, the portal vein is high but the sinusoids are not, so the wedged pressure, and the HVPG, are normal. Only a direct portal pressure or the PPG shows a presinusoidal block.',
      ask: ['Which diseases does the wedge miss?', 'Pre-hepatic and presinusoidal blocks, such as portal vein thrombosis and schistosomiasis.'],
    },
    {
      id: 'summary', visual: 'table', cols: ['pv', 'hvpg'], asc: true, note: 'Site in the lobule', rowHead: 'Disease',
      of: [{ preset: 'healthy', kicker: 'Reference', title: 'Healthy', note: 'No block', ref: true }, { id: 'schisto', title: 'Schistosomiasis', note: 'Portal venules, in the tract' },
        { id: 'cirr', title: 'Cirrhosis', note: 'Sinusoids, the space of Disse' }, { id: 'sos', title: 'Sinusoidal obstruction', note: 'Central venules' },
        { id: 'cong', title: 'Heart failure', note: 'No block: congestion of zone 3' }],
      kicker: 'Summary', title: 'Where each disease sits',
      line: 'The wedge reads the sinusoids, so HVPG rises only when the block sits in them or in the central venules.',
      notes: 'Read from top to bottom, the block moves along the lobule from the portal tract to the central vein. The HVPG rises only when the block lies between the sinusoids and the free hepatic vein: cirrhosis and sinusoidal obstruction. The ascites protein follows the sinusoid wall: low when the wall is capillarised (cirrhosis), high when it is still open (sinusoidal obstruction, congestion). Presinusoidal disease rarely causes ascites, because the sinusoids are at normal pressure.',
      ask: ['A patient has ascites with high protein and a raised HVPG. Where is the block?', 'At the central venules: sinusoidal obstruction syndrome.'],
    },
  ],
};
