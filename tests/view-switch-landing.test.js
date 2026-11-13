// The change between the Anatomy and the Circuit lands with nothing laid out again (Mohammad, 10 Nov 2026: the label leaders "when switching
// between anatomy to circuit still aren't fading smoothly and glitch"). The new view's labels were solved at the tap with the vessels drawn at
// the old view's widths (the Circuit's lines are about twice the Anatomy's), so their signature never matched the landed figure's: the landing
// solved them all again, and a label that took another spot (the confluence's, above its point to below it) blinked its leader out and faded
// it back in at the new place, a frame after the figure had stopped. Each leader must also stay on its point and end on its label every frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL } from './stage-gl-boot.js';

const { st, page, frame } = await bootGL({ w: 1200, h: 800, dpr: 1 });
const crossing = () => page.document.querySelector('#labels .lb-leaders')?.style.opacity !== '';   // (the change's crossfade is on: stage-view.js xfLayer)

function check(tag, bad) {
  const sn = st.labelSnapshot() || {}, items = sn.items || [], by = new Map(items.map((d) => [d.key, d]));
  for (const m of sn.marks || []) {
    const d = by.get(m.k);
    if (!(m.a > 0.01) || !d || m.kind !== 'line') continue;
    const gx = Math.max(d.x, Math.min(m.x1, d.x + d.w)), gy = Math.max(d.y, Math.min(m.y1, d.y + d.h));
    if (Math.hypot(m.x1 - gx, m.y1 - gy) > 3) bad.push(`${tag}: ${m.k}'s leader ends off its label`);
    if (d.pin && Math.hypot(m.x0 - d.px, m.y0 - d.py) > 6) bad.push(`${tag}: ${m.k}'s leader starts off its point`);
  }
  return new Map(items.map((d) => [d.key, `${Math.round(d.x)},${Math.round(d.y)}`]));
}

async function viewChange(view) {
  const bad = [];
  st.setView(view);
  let landed = -1, before = null, laid = -1, seen = false;
  for (let i = 0; i < 130; i++) {
    const n0 = st.labelStats().layouts;
    await frame();
    const at = check(`${view} frame ${i}`, bad);
    if (crossing()) seen = true;
    else if (seen && landed < 0) { landed = i; before = at; laid = n0; }
    if (landed >= 0 && i > landed + 40) {
      for (const [k, p] of before) if (at.has(k) && at.get(k) !== p) bad.push(`${view}: ${k} moved after the landing, ${p} to ${at.get(k)}`);
      break;
    }
  }
  assert.ok(landed > 0, `the change to the ${view} landed`);
  assert.equal(st.labelStats().layouts, laid, `no layout after the ${view} landed`);
  assert.deepEqual(bad.slice(0, 6), []);
}

test('Anatomy to Circuit and back: the labels stand still after the landing, and every leader rides its point to its label', async () => {
  for (let i = 0; i < 120; i++) await frame();
  await viewChange('circuit');
  await viewChange('anatomy');
});
