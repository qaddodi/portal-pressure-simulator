// One fresh load booted in node for labels-first-fit.test.js: an iPhone's stage whose camera moves in its first frames as a first load's fit does
// while the page lays itself out (a zoom at boot frame 3, a fit gliding back at frame 20), and every label the GPU shows recorded from the first
// frame. Prints, on a line that begins FIT, the first and last frames any label showed, the last frame the camera moved, and every frame where
// one label showed twice.
import { bootGL } from './stage-gl-boot.js';
let first = -1, last = -1, moved = -1;
const twice = [];
await bootGL({ w: 375, h: 812, dpr: 3, coarse: true, onBootFrame: (i, st) => {
  if (i === 3) st.zoomIn();
  if (i === 20) st.fit();
  const ck = JSON.stringify(st.cameraKey?.()); if (ck !== globalThis.__ck) { globalThis.__ck = ck; moved = i; }
  const by = new Map();
  for (const d of st.labelSnapshot().items) if (d.a > 0.02) by.set(d.key, (by.get(d.key) || 0) + 1);
  if (by.size && first < 0) first = i;
  if (by.size) last = i;
  for (const [k, n] of by) if (n > 1) twice.push([i, k]);
} });
console.log("FIT" + JSON.stringify({ first, last, moved, twice: twice.slice(0, 10) }));
process.exit(0);
