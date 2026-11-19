// The Trials tab's Model line asks "this patient settled, and settled with one change" (worker-core.js whatIf). It took 79 to 303 ms on the live worker, which
// stalled the Doppler and the traces while the card computed (bible ENG-7, 19 Nov 2026). The page now sends the live snapshot to the second engine
// (calc-client.js sharedCalc → whatIfOf); the answer is the same, and the engine that answers is left as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';

const PATCH = { tips: { on: true, d: 8 } };

test('whatIfOf answers a snapshot as whatIf answers the live patient, and touches no state of the engine that answers', async () => {
  const got = [];
  const live = createCore((m) => { if (m.type === 'whatIf' || m.type === 'snapshot') got.push(m); });
  live.handle({ type: 'run', running: false });
  await live.handle({ type: 'preset', id: 'cirr-decomp', reqId: 1 });
  await live.handle({ type: 'snapshot', reqId: 2 });
  await live.handle({ type: 'whatIf', patch: PATCH, reqId: 3 });
  const snap = got.find((m) => m.type === 'snapshot').snap, onLive = got.find((m) => m.type === 'whatIf').result;
  live.dispose();

  const out = [];
  const calc = createCore((m) => { if (m.type === 'whatIf') out.push(m); });   // (a second engine that never loaded this patient)
  calc.handle({ type: 'run', running: false });
  await calc.handle({ type: 'whatIfOf', snap, patch: PATCH, reqId: 4 });
  calc.dispose();
  assert.equal(out.length, 1);
  assert.equal(out[0].reqId, 4);
  for (const k of ['base', 'rx']) for (const f of Object.keys(onLive[k])) assert.ok(Math.abs(out[0].result[k][f] - onLive[k][f]) < 1e-9, `${k}.${f}: ${out[0].result[k][f]} vs ${onLive[k][f]}`);
  assert.ok(out[0].result.rx.ppg < out[0].result.base.ppg - 3, 'a TIPS lowers the PPG: the question was answered, not echoed');
});
