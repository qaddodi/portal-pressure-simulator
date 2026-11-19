// The simulation worker and the engine import nothing from src/ui (bible ENG-12, 19 Nov 2026): worker-core.js took easeMove from ui/ease.js, which would drag
// the page's motion code into the worker the day that file imported anything. A helper both need lives under src/engine/ (ease-move.js). Moved out of tests (PR-02).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const REASON = 'the worker and the engine import nothing from src/ui: a shared helper lives under src/engine/ (ENG-12)';
const files = ['src/worker-core.js', 'src/worker.js', ...readdirSync(join(ROOT, 'src/engine')).filter((f) => f.endsWith('.js')).map((f) => `src/engine/${f}`)];
export default [
  ...files.map((file) => ({ file, forbid: [/^\s*(?:import|export)[^'"\n]*from\s+'[^']*\/ui\//m, REASON] })),
  { file: 'src/engine/events.js', forbid: [/below 9 cm\/s|HVPG ≥1[02] mmHg|shuntFraction > 0\.5|liverPerfPct < 60/, 'an event\'s cut-off is read from flow-cuts.js or pressure-cuts.js, never typed a second time (ENG-6, ENG-12)'] },
  { file: 'src/engine/events.js', need: [/FLOW_CUTS\.shuntLarge/, 'the High shunt event reads the Shunted tile\'s red band (ENG-6)'] },
  { file: 'src/ui/table-marks.js', need: [/FLOW_CUTS\.shuntLarge/, 'the Shunted tile and its event share one band (ENG-6)'] },
  { file: 'src/engine/events.js', need: [/FLOW_CUTS\.liverSevere/, 'the Liver hypoperfusion event reads the Liver flow tile\'s red band (ENG-6)'] },
  { file: 'src/ui/table-marks.js', need: [/FLOW_CUTS\.liverSevere/, 'the Liver flow tile and its event share one band (ENG-6)'] },
  { file: 'src/ui/trials-pane.js', need: [/sharedCalc\(\)\.request\('whatIfOf'/, 'the Trials card\'s what-if runs on the second engine, not the live clock\'s (ENG-7)'] },
  { file: 'src/ui/trials-pane.js', forbid: [/host\.request\('whatIf'/, 'no what-if on the live worker: it stalls the Doppler 80 to 300 ms (ENG-7)'] },
];
