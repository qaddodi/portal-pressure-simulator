// A meal's rise in portal flow matches the literature for each patient (/mnt/project-files/review/meal-response/):
// healthy adults about +40 to 80% at the 30-minute peak; blunted in cirrhosis, where arterioles already dilated have
// less left to give (Sabbà 1991, Gaiani 1989), with the HVPG up a median 15% (Albillos 2007). The gradient still
// rises more in cirrhosis than in health (Circuit 6), and a fall in splanchnic tone set by hand is never blunted.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { MEAL_TONE } from '../src/engine/scenario.js';

async function meal(preset, ramp = { meal: [0, 1] }) {
  const msgs = [], core = createCore((m) => msgs.push(m));
  core.handle({ type: 'init' });
  await core.handle({ type: 'sequence', reqId: 1, steps: [{ preset, params: { splanchnicTone: 1 } }, { days: 8, ramp, fine: true }] });
  core.dispose();
  const [a, b] = msgs.filter((m) => m.type === 'seqStep').map((m) => m.fp);
  const rise = (k) => b[k] / a[k] - 1;
  return { a, b, rise, gap: (k) => b[k] - a[k] };
}

test('a healthy adult\'s portal flow and velocity rise by 40 to 80% after a meal, the gradient staying under amber', async () => {
  const m = await meal('healthy');
  assert.ok(m.rise('pvFlow') > 0.4 && m.rise('pvFlow') < 0.8, `flow +${(m.rise('pvFlow') * 100).toFixed(0)}%`);
  assert.ok(m.rise('pvVel') > 0.35 && m.rise('pvVel') < 0.8, `velocity +${(m.rise('pvVel') * 100).toFixed(0)}%`);
  assert.ok(m.b.ppg < 6, `PPG ${m.b.ppg}`);
});

test('compensated cirrhosis: a smaller rise in flow than in health, about 40%', async () => {
  const h = await meal('healthy'), c = await meal('cirr-comp');
  assert.ok(c.rise('pvFlow') > 0.3 && c.rise('pvFlow') < 0.5, `flow +${(c.rise('pvFlow') * 100).toFixed(0)}%`);
  assert.ok(c.rise('pvFlow') < h.rise('pvFlow') - 0.05, 'blunted against the healthy rise');
});

test('CSPH: flow up about 28% and HVPG about 15%, yet the gradient rises more than in health', async () => {
  const h = await meal('healthy'), c = await meal('csph');
  assert.ok(c.rise('pvFlow') > 0.2 && c.rise('pvFlow') < 0.35, `flow +${(c.rise('pvFlow') * 100).toFixed(0)}%`);
  assert.ok(c.rise('hvpg') > 0.1 && c.rise('hvpg') < 0.2, `HVPG +${(c.rise('hvpg') * 100).toFixed(0)}%`);
  assert.ok(c.gap('ppg') > h.gap('ppg') * 1.2, `PPG +${c.gap('ppg').toFixed(1)} against healthy +${h.gap('ppg').toFixed(1)} mmHg`);
});

test('a fall in splanchnic tone set by hand is not blunted: only the meal is', async () => {
  const set = await meal('csph', { splanchnicTone: [1, MEAL_TONE] }), fed = await meal('csph');
  assert.ok(set.rise('pvFlow') > 0.4, `the Advanced slider still moves flow fully (+${(set.rise('pvFlow') * 100).toFixed(0)}%)`);
  assert.ok(fed.rise('pvFlow') < set.rise('pvFlow') - 0.1);
});
