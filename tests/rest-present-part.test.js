// GPU-4 (19 Nov 2026, bible review): a blood-only frame at rest laid the whole kept picture on the screen and ran every pass over it. When nothing but
// the blood's squares changed since the last present, only their box is laid again (veins-gl.js restBox), the passes drawing inside it (keep-screen.js clip).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('at rest the figure lays some presents in part, and says why it laid the others whole', async () => {
  const { st, frame } = await bootGL({ w: 1440, h: 900, dpr: 1 });
  const { counts } = await import('../src/ui/frame-counts.js');
  const P = globalThis.pps?.partial;
  assert.ok(P && typeof P.laid === 'number' && P.refused, 'pps.partial is published by the figure\'s renderer');
  for (let i = 0; i < 330; i++) { pump(16.7); await frame(); }
  const whole = Object.entries(counts.present).filter(([k]) => !/in part/.test(k)).reduce((n, [, v]) => n + v, 0);
  const part = Object.entries(counts.present).filter(([k]) => /in part/.test(k)).reduce((n, [, v]) => n + v, 0);
  assert.equal(part, P.laid, 'every present laid in part is counted once');
  // (Every refusal is a reason from the fixed list, never an exception: the counts are plain numbers.)
  for (const [why, n] of Object.entries(P.refused)) assert.ok(Number.isInteger(n) && n > 0 && why.length > 3, why);
  if (process.env.SHOW_RATES) console.log('rest present', { whole, part, refused: P.refused });
  assert.ok(whole + part > 0, 'presents were laid');
  assert.ok(st, 'stage kept');
});
