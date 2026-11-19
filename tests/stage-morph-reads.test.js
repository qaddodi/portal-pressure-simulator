// The stage's read phase in a change between the views (18 Nov 2026, the play-tester's ?perf: 'stage-read' 40 to 400 ms on the frames of a view
// change, a preset, a deck slide, a zoom and a pan, on a Mac and an iPhone). The cause: the overlays' root view box is written on every frame of any camera
// move, and every write of it dropped the kept reading of every overlay group, so the next frame read each element's styles again before it drew.
// Node, the real stage (tests/stage-gl-boot.js), a fake clock; the page's style reads are counted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bootGL } from './stage-gl-boot.js';

test('a change between the views reads the overlays\' styles for few of its frames, each read named for its own callback', async () => {
  const { st, frame } = await bootGL({ w: 1200, h: 800 });
  const frameMod = await import('../src/ui/frame.js');
  for (let i = 0; i < 150; i++) await frame();
  let reads = 0;
  const was = globalThis.getComputedStyle;
  globalThis.getComputedStyle = (el, p) => { reads++; return was(el, p); };
  try {
    for (const v of ['circuit', 'anatomy']) {
      const a = { ...frameMod.perf().totals.asks };
      reads = 0;
      st.setView(v);
      for (let i = 0; i < 45; i++) await frame();
      const asks = frameMod.perf().totals.asks, d = (k) => (asks[k] || 0) - (a[k] || 0);
      assert.equal(d('stage-read'), 0, 'no read asks under the one shared tag any more: each is named');
      assert.ok(d('stage-read:overReadEarly') <= 36, `${v}: the overlays are read in ${d('stage-read:overReadEarly')} of 45 frames (was 42 to 45)`);
      assert.ok(reads <= 6 * 45, `${v}: ${reads} style reads in 45 frames of the change (was 360 to 430 on a bare figure, 260 now; more with stents, varices or clamps on it)`);
    }
  } finally { globalThis.getComputedStyle = was; }
});

test('the overlays\' kept readings are dropped by what they hold, not by the camera', () => {
  const over = readFileSync(new URL('../src/ui/stage-over.js', import.meta.url), 'utf8');
  assert.match(over, /if \(a === 'viewBox'\) return rec\.target\?\.ownerSVGElement != null;/);
  const cam = readFileSync(new URL('../src/ui/stage-camera.js', import.meta.url), 'utf8');
  assert.match(cam, /Math\.exp\(Math\.round\(Math\.log\(live\.CTM\.sc\) \* 50\) \/ 50\)/, 'the sizes on screen the overlays\' styles hold step by 2 % of the scale');
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /`stage-read:\$\{cb\.name \|\| 'anon'\}`/, 'a read callback is named by its function');
});
