// A reading's leader never passes through a zone's title (play-test, 16 Nov 2026: in the upright Circuit with a disease patient the "SV 18.3" leader crossed the
// rotated "Splenic beds" caption). The Circuit's readings beside their stations skipped the zone titles when they checked their leader's way
// (stage-label-solve.js placeMulti, `!p.zone`); a title now blocks a leader as a reading does, unless the station itself stands in its box.
// The real stage in node, upright, a portrait iPad, no slide: every shown reading's leader against every title.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootCircuitSlide } from './circuit-slide-stage.js';
import { leaderEnd } from '../src/ui/leader-end.js';
import { crosses } from '../src/ui/label-place.js';

test('upright Circuit: no leader crosses a zone title', async () => {
  const { store } = await import('../src/ui/store.js');
  const { st, run } = await bootCircuitSlide({ W: 1024, H: 1366, cardR: 300 });
  store.set({ presenting: false, presentLabels: null });
  st.setSites(null, null); st.callouts({});
  st.setCircuitRotated(true); run(300);
  const L = st.labelLaid();
  assert.ok(L.zones.length >= 3, `the zone titles are laid out (${L.zones.length})`);
  const readings = L.items.filter((it) => it.leader && it.key.startsWith('n:'));
  const bad = [];
  for (const it of readings) {
    const e = leaderEnd({ x0: it.box[0], y0: it.box[1], x1: it.box[2], y1: it.box[3] }, it.ax, it.ay);
    if (!e) continue;
    for (const z of L.zones) if (!(it.ax > z[0] - 4 && it.ax < z[2] + 4 && it.ay > z[1] - 4 && it.ay < z[3] + 4) && crosses(it.ax, it.ay, e.x, e.y, { x0: z[0], y0: z[1], x1: z[2], y1: z[3] })) bad.push(`${it.key} leader crosses the title at ${z.map(Math.round)}`);
  }
  assert.deepEqual(bad, []);
});
