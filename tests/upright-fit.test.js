// The circuit turned upright is fitted into the room the bars leave, and kept as a framing like Fit's (16 Nov 2026, Mac 1280 x 800: after "turn the circuit upright"
// its bottom third ran under the play bar until Fit was pressed; the wide map refitted when the bars changed, the turned one was fitted once at the press and never again).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uprightFitOf } from '../src/ui/card-clear.js';

const CIRC = [30, 30, 1360, 730], C = [710, 395], VBR = [C[0] - 365, C[1] - 680, 730, 1360], ART = [70, 30, 1330, 730];
const turned = ([x0, y0, x1, y1]) => [C[0] + (y0 - C[1]), C[1] - (x1 - C[0]), C[0] + (y1 - C[1]), C[1] - (x0 - C[0])];

test('the turned map ends clear of the bars at every window size and bar height', () => {
  for (const [W, H] of [[1280, 700], [1280, 800], [1440, 900], [1024, 768], [834, 1112], [390, 700]]) for (const b of [0, 90, 150, 220]) for (const t of [48, 110]) {
    const ins = { t, b, l: 0, r: 0, W, H }, v = uprightFitOf(ins, W, H, VBR, turned(ART));
    assert.ok(v, `${W}x${H}`);
    const s0 = Math.min(W / VBR[2], H / VBR[3]), ox = (W - VBR[2] * s0) / 2 - VBR[0] * s0, oy = (H - VBR[3] * s0) / 2 - VBR[1] * s0;
    const [, ay0, , ay1] = turned(ART);
    const top = oy + s0 * (v.y + v.k * ay0), bottom = oy + s0 * (v.y + v.k * ay1);
    assert.ok(bottom <= H - b - 11.9, `${W}x${H} bars ${t}/${b}: the map ends at ${bottom.toFixed(1)}, the bars begin at ${H - b}`);
    assert.ok(top >= t + 11.9, `${W}x${H} bars ${t}/${b}: the map begins at ${top.toFixed(1)}, the bars end at ${t}`);
  }
});
