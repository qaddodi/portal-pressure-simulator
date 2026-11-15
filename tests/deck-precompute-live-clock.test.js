// A deck's slides are computed in a second engine (presenter-visuals.js makeCalc: its own worker, or its own core on the main thread
// when workers are unavailable), so the live figure's clock keeps ticking while a presentation is prepared (review B3, 15 Nov 2026).
// Any generator job calls stop() on the core that runs it (worker-core.js drain), so a 'sequence' sent to the LIVE core would freeze it:
// the first test shows the second core leaves the live one running, the second shows what the live core does when given the same job,
// and the third keeps every page-side 'sequence' request on the second engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createCore } from '../src/worker-core.js';

const STEPS = [{ preset: 'cirr-decomp', days: 0 }, { preset: 'healthy' }, { preset: 'cirr-decomp' }];

// The live core's clock ticks (its own frames, one per timer tick) between two moments of the job.
async function ticksDuring(job, liveFrames) {
  const before = liveFrames();
  await job();
  return liveFrames() - before;
}

function liveCore() {
  let frames = 0;
  const core = createCore((m) => { if (m.type === 'frame') frames++; });
  core.handle({ type: 'init' });
  core.handle({ type: 'run', running: true });
  core.handle({ type: 'visibility', visible: true });
  return { core, frames: () => frames };
}

function runSequence(core) {
  return core.handle({ type: 'sequence', reqId: 1, steps: STEPS, base: null });
}

test('a sequence on the second core leaves the live clock ticking', async (t) => {
  const live = liveCore();
  const steps = [];
  const calc = createCore((m) => { if (m.type === 'seqStep') steps.push(m.i); });
  calc.handle({ type: 'visibility', visible: false });
  calc.handle({ type: 'run', running: false });
  t.after(() => { live.core.dispose(); calc.dispose(); });
  const t0 = live.core.engine().t;
  const ticks = await ticksDuring(() => runSequence(calc), live.frames);
  assert.deepEqual(steps, [0, 1, 2], 'every slide was computed');
  assert.ok(ticks >= 3, `the live figure kept running while the deck was computed (${ticks} frames)`);
  assert.ok(live.core.engine().t > t0, 'the live model advanced');
});

test('the same job on the live core stops its clock (why decks use a second engine)', async (t) => {
  const live = liveCore();
  t.after(() => live.core.dispose());
  // (The job is queued behind init: its first slice stops the timer, and nothing ticks until the whole job is done.)
  const ticks = await ticksDuring(() => runSequence(live.core), live.frames);
  assert.ok(ticks <= 1, `a sequence on the live core holds its clock (${ticks} frames)`);
});

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

test("no page code sends 'sequence' or 'presetMetrics' to the live host", () => {
  // The live engine is `host` (main.js); the second engine is makeCalc's. Both calls are generator-free queries or chains that
  // belong on the second engine only.
  const bad = [];
  for (const p of walk('src/ui')) {
    const src = readFileSync(p, 'utf8');
    if (/host\s*\.\s*(request|send)\(\s*['"](sequence|presetMetrics)['"]/.test(src)) bad.push(p);
  }
  assert.deepEqual(bad, [], 'deck chains run on the second engine (getCalc), never on host');
});
