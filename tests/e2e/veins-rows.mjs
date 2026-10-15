// The vessel layer's partial redraw (veins-gl.js drawRows) leaves exactly the picture a whole redraw does.
// When only some vessels' attributes change (the pulse moves a few vessels' colours about ten times a second), the
// figure and the lobule redraw only those vessels' cells instead of the whole layer at a Retina size. Here a small
// scene of crossing, joined vessels in three tiers is drawn whole, a few vessels are recoloured (one hovered, one
// faded), and the partial redraw must match a fresh whole draw pixel for pixel, cover fewer cells than the whole
// layer, and refuse (so the caller draws everything) once anything else the vessel pass reads has changed. While the view
// moves, the layer re-projected to it (view()) must show what a fresh draw there would.
//
//   node tests/e2e/veins-rows.mjs [dir]

import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const server = await serve(process.argv[2] || '.');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const page = await browser.newPage();
let failed = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };
try {
  await page.goto(server.url + 'tests/e2e/blank');   // (any page of the same origin: the module is imported below)
  const r = await page.evaluate(async () => {
    const { createVeinsGL, binVeins, N_SAMPLES, TUBE_TEXELS, MAX_TIERS, F_SHADOW, F_DIFFUSE, F_SPEC } = await import('/src/ui/veins-gl.js');
    const cv = document.createElement('canvas');
    cv.width = 960; cv.height = 640;
    document.body.append(cv);
    const ROWS = 8;
    const g = createVeinsGL(cv, { tubes: ROWS, force: true });
    if (!g) return { skip: 'no WebGL2' };
    // Six vessels: a trunk, two branches joined to it, a crossing vessel in a higher tier, a hairline, a faded one.
    const line = (x0, y0, x1, y1, bow = 0) => Array.from({ length: N_SAMPLES }, (_, i) => { const t = i / (N_SAMPLES - 1); return [x0 + (x1 - x0) * t - bow * Math.sin(Math.PI * t) * (y1 - y0) / 300, y0 + (y1 - y0) * t + bow * Math.sin(Math.PI * t) * (x1 - x0) / 300]; });
    const V = [
      { pts: line(40, 320, 600, 320), r: 14, tier: 1 },
      { pts: line(600, 320, 920, 120, 20), r: 9, tier: 1 },
      { pts: line(600, 320, 920, 560, -20), r: 9, tier: 1 },
      { pts: line(240, 40, 400, 600, 30), r: 8, tier: 2 },
      { pts: line(80, 80, 880, 600), r: 2, tier: 0 },
      { pts: line(120, 580, 520, 60, 40), r: 6, tier: 0 },
    ];
    const tubes = V.map((v, i) => ({ id: i, pts: v.pts, reach: v.r + 24 }));
    const joins = [{ x: 600, y: 320, reach: 40, k: 12, fillet: 1, members: [0, 1, 2] }];
    g.setGeometry(binVeins(tubes, joins));
    V.forEach((v, i) => g.setRadii(i, Array(N_SAMPLES).fill(v.r)));
    const data = new Float32Array(ROWS * TUBE_TEXELS * 4);
    const len = (p) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
    const put = (i, c0, c1, { alpha = 1, hover = 0 } = {}) => {
      const o = i * TUBE_TEXELS * 4;
      data.set([...c0, 3, ...c1, alpha, V[i].tier, 0.1 * i, F_SHADOW | F_DIFFUSE | F_SPEC, 0], o);
      data.set([0, 1, len(V[i].pts), 0], o + 20);
      data[o + 39] = hover;
    };
    const cols = [[0.2, 0.4, 0.8], [0.8, 0.3, 0.2], [0.3, 0.7, 0.4], [0.9, 0.7, 0.2], [0.5, 0.5, 0.5], [0.6, 0.3, 0.7]];
    cols.forEach((c, i) => put(i, c, c.map((x) => x * 0.8)));
    g.setTubes(data);
    const look = {
      shOff: [1.4, 2.8], light: [-0.6, -0.8], reach: 11, heat: false, organs: 0,
      casing: [0.1, 0.1, 0.15, 0.56], shadow: [0, 0, 0, 0.15], sheen: [1, 1, 1, 0.42], shade: [0.1, 0.1, 0.2, 0.2], ring: [0.2, 0.5, 1, 0.34],
      netAlpha: 1, fx: true, tierAlpha: Array(MAX_TIERS).fill(1), tierGroup: Array(MAX_TIERS).fill(1),
    };
    const blood = { on: false };
    const m = [1, 0, 0, 1, 0, 0];
    // (The two pictures compared pixel by pixel: how many differ, by how much at most, and where.)
    const px = async (url) => { const im = new Image(); im.src = url; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
    g.draw(m, look, blood);
    const before = g.snapshot();
    // The pulse: a branch's colour moves (by its join with the trunk); a crossing vessel's too, and it is hovered; the
    // faded one's alpha changes.
    put(1, [0.85, 0.35, 0.25], [0.7, 0.25, 0.15]);
    put(3, [0.95, 0.6, 0.2], [0.7, 0.5, 0.15], { hover: 0.7 });
    put(5, cols[5], cols[5].map((x) => x * 0.8), { alpha: 0.6 });
    g.setTubes(data);
    const c0 = g.partCells;
    const okRows = g.drawRows(m, look, blood, [1, 3, 5]);
    const partial = g.snapshot(), cells = g.partCells - c0;
    g.draw(m, look, blood);
    const whole = g.snapshot();
    // Nothing changed at all: no cells drawn, the picture as it was.
    const c1 = g.partCells, okNone = g.drawRows(m, look, blood, []), none = g.snapshot(), noneCells = g.partCells - c1;
    // Refusals: another transform, new radii.
    const okMoved = g.drawRows([1.2, 0, 0, 1.2, 0, 0], look, blood, [0]);
    g.draw(m, look, blood);
    // A view on the move: the layer re-projected to a pan of whole pixels shows what a fresh draw there shows (to within
    // the dither of a level, which stays with the layer's pixels, in each picture), apart from the strip the pan uncovers; and while it is
    // re-projected, a partial redraw is refused (the layer is not at the picture's transform).
    const pan = [1, 0, 0, 1, 37, -21];
    const okView = g.view(pan, look, blood), viewed = g.snapshot(), okRowsMoving = g.drawRows(pan, look, blood, [1]);
    g.draw(pan, look, blood);
    const fresh = g.snapshot();
    const V1 = await px(viewed), V2 = await px(fresh);
    let off = 0, offMax = 0;
    for (let i = 0; i < V1.length; i += 4) {
      const x = (i / 4) % cv.width, y = Math.floor(i / 4 / cv.width);
      if (x < 37 + 1 || y >= cv.height - 21 - 1) continue;   // the uncovered strips (left, bottom)
      // (Compared premultiplied, as drawn: the PNG's straight colour of a faint pixel magnifies a level of alpha.)
      const d = Math.max(Math.abs(V1[i + 3] - V2[i + 3]), ...[0, 1, 2].map((k) => Math.abs(V1[i + k] * V1[i + 3] - V2[i + k] * V2[i + 3]) / 255));
      if (d > 3) { off++; offMax = Math.max(offMax, d); }
    }
    // A move that ends where it began (a spring back to the framing): the picture is the layer as drawn again, and a
    // partial redraw works again.
    g.draw(m, look, blood);
    const atRest = g.snapshot();
    g.view(pan, look, blood);
    const okBack = g.view(m, look, blood), back = g.snapshot(), okRowsBack = g.drawRows(m, look, blood, []);
    g.setRadii(1, Array(N_SAMPLES).fill(11));
    const okRadii = g.drawRows(m, look, blood, [1]);
    const A = await px(partial), B = await px(whole); let nd = 0, md = 0, bx = [1e9, 1e9, 0, 0];
    for (let i = 0; i < A.length; i += 4) { const d = Math.max(...[0, 1, 2, 3].map((k) => Math.abs(A[i + k] - B[i + k]))); if (d) { nd++; md = Math.max(md, d); const x = (i / 4) % cv.width, y = Math.floor(i / 4 / cv.width); bx = [Math.min(bx[0], x), Math.min(bx[1], y), Math.max(bx[2], x), Math.max(bx[3], y)]; } }
    const diff = { pixels: nd, most: md, box: bx };
    return { okBack, backSame: back === atRest, okRowsBack, okView, okRowsMoving, off, offMax, diff, okRows, okNone, okMoved, okRadii, same: partial === whole, changed: partial !== before, noneSame: none === whole, noneCells, cells, nCells: g.nCells };
  });
  if (r.skip) console.log(`skipped: ${r.skip}`);
  else {
    console.log(`partial redraw: ${r.cells} of ${r.nCells} cells; matches a whole redraw: ${r.same}; picture changed: ${r.changed}`);
    if (!r.okRows) fail('drawRows refused a colour-only change');
    if (!r.same) fail(`the partial redraw differs from a whole redraw: ${JSON.stringify(r.diff)}`);
    if (!r.changed) fail('the recoloured vessels did not change the picture (the check would prove nothing)');
    if (!(r.cells > 0 && r.cells < r.nCells)) fail(`the partial redraw drew ${r.cells} of ${r.nCells} cells`);
    if (!r.okNone || r.noneCells || !r.noneSame) fail('a redraw of no rows changed something');
    if (r.okMoved) fail('drawRows accepted a different transform');
    if (r.okRadii) fail('drawRows accepted a change of radii');
    console.log(`re-projected pan: ${r.off} pixels off a fresh draw (most ${r.offMax.toFixed(1)} levels)`);
    if (!r.okView) fail('view() refused a layer it could re-project');
    if (r.off) fail(`the re-projected view differs from a fresh draw in ${r.off} pixels (by up to ${r.offMax.toFixed(1)} levels)`);
    if (r.okRowsMoving) fail('drawRows accepted a redraw while the view was re-projected');
    if (!r.okBack || !r.backSame) fail('a move back to the view the layer was drawn in left the picture re-projected (at the last view of the move)');
    if (!r.okRowsBack) fail('drawRows refused a redraw once the view was back where the layer was drawn');
  }
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log('veins-rows: ok');
