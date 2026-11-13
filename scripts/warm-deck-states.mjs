// Computes every deck's slide states once, in parallel processes, into node_modules/.cache/pps-deck-states (tests/deck-states.js keeps them).
// ~35 of the unit tests walk the decks, and a walk of all of them is several CPU-minutes when nothing is saved (the engine or a deck changed):
// without this each test shard would do that walk itself. CI runs this once before the shards (unit-tests.yml), saves the folder, and the shards
// only read it. Locally it is optional (`npm test` fills the same folder as it goes).
//
//   node scripts/warm-deck-states.mjs [--jobs 4]
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DECKS } from '../src/ui/decks.js';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

if (opt('only', '')) {
  const { deckStates } = await import('../tests/deck-states.js');
  for (const id of opt('only', '').split(',')) {
    const d = DECKS.find((x) => x.id === id), t0 = Date.now();
    await deckStates(d);
    console.log(`  ${id}: ${d.slides.length} slides, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
} else {
  const jobs = Math.max(1, +opt('jobs', cpus().length));
  const bins = Array.from({ length: jobs }, () => ({ load: 0, ids: [] }));
  for (const d of [...DECKS].sort((a, b) => b.slides.length - a.slides.length)) {
    const bin = bins.reduce((m, b) => (b.load < m.load ? b : m));
    bin.load += d.slides.length; bin.ids.push(d.id);
  }
  const T0 = Date.now();
  const codes = await Promise.all(bins.filter((b) => b.ids.length).map((b) => new Promise((done) => {
    const p = spawn(process.execPath, [fileURLToPath(import.meta.url), '--only', b.ids.join(',')], { stdio: 'inherit' });
    p.on('exit', (c) => done(c ?? 1));
  })));
  console.log(`deck states: ${DECKS.length} decks in ${Math.round((Date.now() - T0) / 1000)} s on ${jobs} processes`);
  process.exit(codes.some((c) => c) ? 1 : 0);
}
