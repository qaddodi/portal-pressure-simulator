// A paused, quiet figure draws nothing (18 Nov 2026, the play-tester's ?perf at 390 px: 'figure drawn though still: blood easing' on every frame,
// 161 in 6 s, ten seconds after the pause; setFlow, the kept picture's copies and the card glass redrawn with it, 28 to 41 pictures a second).
// The cause: a head's catch-up to its junction goes by the stream's distance, which stands still once the blood is paused, so a gap or a B it had not
// closed kept bloodEasing on for good. The node check is the paused figure sleeping; the source check is the rule that a stream that does not move
// does not ease.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bootGL, pump } from './stage-gl-boot.js';

test('a paused, quiet figure is not drawn: its blood has nothing left to ease', async () => {
  const { createCore } = await import('../src/worker-core.js');
  const { store } = await import('../src/ui/store.js');
  const frameMod = await import('../src/ui/frame.js');
  const { st } = await bootGL({ w: 390, h: 844, dpr: 3, coarse: true });
  const q = [], core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' }); await core.handle({ type: 'ackPaint', on: true }); await core.handle({ type: 'run', running: true });
  const step = async () => { pump(16.7); const f = q.at(-1); q.length = 0; if (f) { st.update(f); core.handle({ type: 'painted' }); } await new Promise((r) => setImmediate(r)); };
  for (let i = 0; i < 100; i++) await step();
  await core.handle({ type: 'run', running: false }); store.set({ running: false });
  for (let i = 0; i < 120; i++) await step();
  const a = { ...frameMod.perf().totals.drawn };
  for (let i = 0; i < 120; i++) await step();
  const d = frameMod.perf().totals.drawn;
  assert.equal((d.stage || 0) - (a.stage || 0), 0, 'no picture drawn while paused and still');
});

test('a head that cannot move (its stream\'s distance stands) keeps no frame awake', () => {
  const src = readFileSync(new URL('../src/ui/stage-blood.js', import.meta.url), 'utf8');
  assert.match(src, /streamMoved = dD !== 0;/);
  assert.match(src, /if \(streamMoved && \(\(joined && Math\.abs\(e\) > 1e-3\) \|\| hB\[row\] !== Bt\)\)/);
});
