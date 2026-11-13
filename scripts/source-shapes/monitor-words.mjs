// One title rule and one table of the HVPG catheter's words for every gradient card (unification audit, finding 1; 13 Nov 2026): monitor.js holds
// them, and the cards read them. The presenter's own title table keeps the HVPG card's title as text (tests/instruments-a4.test.js pins it), so it must
// stay the words monitorTitle gives.
export default [
  { file: 'src/ui/monitor.js', need: ["(id === 'hvpg' ? 'HVPG, catheter tracing' : 'Pressure tracing')", 'monitorTitle is the one rule'] },
  { file: 'src/ui/presenter-tools.js', need: ["hvpg: () => 'HVPG, catheter tracing',", "the HVPG card's title is monitorTitle('hvpg')"] },
  { file: 'src/ui/ext-teaching.js', forbid: ["'Pressure tracing'", 'the measurement card takes its title from monitorTitle'] },
  { file: 'src/ui/tool-hvpg.js', forbid: ["'HVPG, catheter tracing'", 'the HVPG card takes its title from monitorTitle'] },
  { file: 'src/ui/hvpg-proc.js', forbid: ['Waiting for the hepatic vein', 'its notes are monitor.js HVPG_TEXT'] },
  { file: 'src/ui/hvpg-proc.js', forbid: ['CATHETER TIP PRESSURE', 'its header is monitor.js HVPG_TEXT'] },
  { file: 'src/ui/tool-reading.js', forbid: ['Waiting for the hepatic vein', 'the HVPG script\'s notes are monitor.js HVPG_TEXT'] },
  { file: 'src/ui/tool-reading.js', forbid: ['CATHETER TIP PRESSURE', 'the HVPG script\'s header is monitor.js HVPG_TEXT'] },
];
