// Gastric varices summary table (8 Nov 2026 deck critique): the Splenectomy row is its own patient, the splenic vein clot with the varix
// glued and the spleen removed. The splenectomy slide opens on "Spleen in place" (its compare buttons switch the spleen live), so a row that
// named the slide showed the glue row's numbers again (platelets 87k for a removed spleen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GASTRIC } from '../src/ui/decks/gastric-varices.js';
import { runSteps } from './deck-states.js';

test('the Splenectomy row is the glued varix with the spleen removed, not the slide\'s spleen in place', async () => {
  const sum = GASTRIC.slides.find((s) => s.id === 'summary'), row = sum.of.find((o) => o.title === 'Splenectomy');
  assert.ok(row && !row.id && row.preset === 'svt', 'a patient of its own, from the splenic vein clot');
  assert.equal(row.params.splenicRx, 2);
  assert.equal(row.params.occluded.C2, true, 'the varix glued on the slide before stays closed');
  const own = GASTRIC.slides.find((s) => s.id === 'splenectomy').compare.find((o) => o.own);
  assert.equal(own.params.splenicRx, 0, 'the slide itself still opens with the spleen in place');
  const [glue, out] = await runSteps([{ preset: 'svt', params: { occluded: { C2: true } } }, { preset: row.preset, params: row.params }]);
  assert.ok(out.plt > glue.plt + 100, `platelets ${glue.plt.toFixed(0)}k to ${out.plt.toFixed(0)}k`);
  assert.ok(out.gv < 3, 'the fundal varix stays closed');
});
