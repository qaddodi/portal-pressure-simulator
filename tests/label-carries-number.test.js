// A shown station label always carries its number, and the figure names its vessels in one style (play-test A3, 16 Nov 2026). Labels had stood
// bare ("Right sinusoids", "PV" in Compensated, "LGV" in Gastrorenal, "RHV" in Budd-Chiari) when they had no room for the value: the solver cut
// a reading to its name alone as its last step before leaving it out. It now lets the reading go whole instead (stage-label-items.js shortenItem),
// and where any vessel took its abbreviation, every vessel that has one does (stage-label-solve.js, the one name rule).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';
import { ABBR } from '../src/ui/anatomy.js';

const SIZES = [{ w: 1440, h: 900 }];   // (the boot harness has no phone or tablet size: stage-organs.js liverWrite reads an element it lacks there)
const PRESETS = ['cirr-comp', 'cirr-decomp', 'gastric-varix', 'budd-chiari'];
const ABBRS = new Set(Object.values(ABBR));

for (const size of SIZES) {
  test(`${size.w} px: every station label shows its number, and the names are all abbreviated or all full`, async () => {
    const { st } = await bootGL({ ...size, dpr: 1 });
    const { createCore } = await import('../src/worker-core.js');
    const tasks = () => new Promise((r) => setImmediate(r));
    let q = [], last = null;
    const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
    await core.handle({ type: 'init' });
    const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) last = f; if (last) st.update(last); await tasks(); await tasks(); };
    for (const id of PRESETS) {
      await core.handle({ type: 'preset', id });
      await core.handle({ type: 'run', running: true });
      for (let i = 0; i < 90; i++) await step();
      const nodes = st.labelLaid().items.filter((it) => it.key.startsWith('n:') && it.key !== 'n:HA');
      assert.ok(nodes.length >= 2, `${id}: ${nodes.length} station labels shown`);
      for (const it of nodes) assert.match(it.text, /\d/, `${id}: "${it.text}" (${it.key}) is shown with no number`);
      const names = nodes.map((it) => it.text.split(' ')[0]).filter((n) => ABBRS.has(n) || /^[A-Z][a-z]+$/.test(n));
      const abbreviated = nodes.filter((it) => ABBRS.has(it.text.split(' ')[0])), full = nodes.filter((it) => { const k = it.key.slice(2); return ABBR[k] && !ABBRS.has(it.text.split(' ')[0]) && !it.text.startsWith(ABBR[k]); });
      assert.ok(!(abbreviated.length && full.length), `${id}: ${abbreviated.map((i) => i.text).join(', ')} abbreviated beside ${full.map((i) => i.text).join(', ')} in full (${names.length})`);
    }
  });
}
