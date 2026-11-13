// iPhone held upright, the change to the Circuit (13 Nov 2026, found while fixing the switch flicker, 574646612): the zone titles (Splanchnic beds,
// Portal veins, Outflow...) stood off their bands for the whole change and jumped to the map's left edge as it landed. Mid-change the world carries
// no turn; the circuit's side, and its map, are laid out turned (circ-turn.js, stage.js mapTurn), and a title anchored on no vessel was left
// unturned, or tied to a vessel that morphs while the map does not. Now every title rides the map: no frame-to-frame jump, and the last frames of
// the change stand where it lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL } from './stage-gl-boot.js';

test('iPhone upright: the Circuit zone titles ride their bands through the switch, with no jump at the landing', async () => {
  const { st, frame } = await bootGL({ w: 390, h: 844, dpr: 3, coarse: true });
  for (let i = 0; i < 60; i++) await frame();
  st.setView('circuit');
  const seen = [];
  for (let i = 0; i < 160; i++) {
    await frame();
    const z = new Map((st.labelSnapshot().items || []).filter((d) => d.key.startsWith('z:') && d.a > 0.05).map((d) => [d.key, [d.x + d.w / 2, d.y + d.h / 2]]));
    seen.push({ z, cam: { ...st.cameraState() }, landed: !st.labelSolving() && st.labelCarry().laid });
  }
  const last = seen.at(-1).z;
  assert.ok(last.size >= 2, `the landed Circuit shows its zone titles (${[...last.keys()].join(', ')})`);
  let worst = 0, at = '';
  for (let i = 1; i < seen.length; i++) for (const [k, p] of seen[i].z) {
    const q = seen[i - 1].z.get(k);
    if (!q) continue;
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d > worst) { worst = d; at = `${k}, frame ${i}: ${q.map(Math.round)} to ${p.map(Math.round)}`; }
  }
  assert.ok(worst <= 40, `no title jumps between two frames of the change (worst ${worst.toFixed(0)} px, ${at})`);
  // (Mid-change, a title shown is already over the map's left part, where it lands: an upright map's titles run up its left edge.)
  const mid = seen.filter((s) => s.z.size).slice(0, 40);
  assert.ok(mid.length > 0, 'the titles show during the change');
  for (const s of mid) for (const [k, p] of s.z) { const l = last.get(k); if (l) assert.ok(Math.abs(p[0] - l[0]) < 60, `${k} rides near its landed column (${p.map(Math.round)} vs ${l.map(Math.round)})`); }
});
