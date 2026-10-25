// Every slide's model state (fingerprint) for a deck, as the presenter computes it. Several unit tests walk every deck, and
// each walk takes about half a minute, so a result is kept on disk (node_modules/.cache) under a hash of the files the states
// come from (the engine, the worker core and the decks): a second run, or a second test file, reads it back; a change to one of
// those computes afresh. (Keyed on all of src/ until 22 Oct, every edit to the UI threw the whole cache away: 29 walks, most of
// the unit suite's time, on nearly every run and every CI job. The workflows key their saved copy on the same files.)
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { serialize, deserialize } from 'node:v8';
import { createCore } from '../src/worker-core.js';

const ROOT = new URL('..', import.meta.url).pathname;
const CACHE = join(ROOT, 'node_modules', '.cache', 'pps-deck-states');
const MODEL = ['preset', 'presetDays', 'params', 'action', 'days'];
export const changes = (s) => MODEL.some((k) => s[k]);

const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).sort().flatMap((f) => walk(join(p, f))) : [p]);
let srcHash = null;
export const STATE_SOURCES = ['src/engine', 'src/worker-core.js', 'src/worker.js', 'src/ui/decks'];   // (as .github/workflows: hashFiles on the same paths)
const sourceHash = () => (srcHash ||= createHash('sha256').update(STATE_SOURCES.flatMap((d) => walk(join(ROOT, d))).map((f) => f + '\n' + readFileSync(f, 'utf8')).join('\n')).digest('hex').slice(0, 16));

// The fingerprints of a run of steps (the worker's 'sequence'), one per step.
export async function runSteps(steps) {
  const fps = [];
  const core = createCore((m) => { if (m.type === 'seqStep') fps[m.i] = m.fp; });
  core.handle({ type: 'run', running: false });   // (no live clock left ticking once the test ends)
  await core.handle({ type: 'sequence', steps, reqId: 1 });
  core.dispose();
  return fps;
}

// Slide i's state: its own, or the last one before it that changed the model.
export async function deckStates(d) {
  const steps = d.slides.map((s) => (changes(s) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, ramp: s.ramp, fine: !!s.lapse } : {}));
  const key = createHash('sha256').update(sourceHash() + JSON.stringify(steps)).digest('hex').slice(0, 24);
  const file = join(CACHE, `${d.id}-${key}.bin`);
  let fps;
  try { fps = deserialize(readFileSync(file)); } catch {
    fps = await runSteps(steps);
    try { mkdirSync(CACHE, { recursive: true }); const tmp = `${file}.${process.pid}`; writeFileSync(tmp, serialize(fps)); renameSync(tmp, file); } catch { /* no cache: computed each time */ }
  }
  let last = fps[0];
  return d.slides.map((s, i) => (last = changes(s) || i === 0 ? fps[i] : last));
}
