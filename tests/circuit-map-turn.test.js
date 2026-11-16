// The circuit's map (its zone bands and grid of dots, drawn by the GPU under the vessels: veins-gl.js mapAt) keeps one turn on the screen in
// every frame of a change between the views. Mohammad's iPhone, 12 Nov 2026: "when I switch to circuit view there is a flicker of the
// background". On an upright circuit the world's turn comes in the frame the change lands (rotDeg reads lastMorph) and goes in the frame it
// leaves, but the map's own turn against it (MAP.rot) was set only when the camera moved, so for that one frame each way the bands were drawn
// a quarter turn off, as columns. Each map draw here pairs the turn it was given (mapRot) with the camera's (inv, device px to world).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGL } from '../scripts/warm/gl-stub.mjs';

// (The do-nothing WebGL2 made to say which uniform each location is and keep the last value set on it, per program.)
const P = Object.getPrototypeOf(makeGL({}));
let cur = null;
const last = new Map();
P.getUniformLocation = (p, name) => ({ p, name });
P.useProgram = (p) => { cur = p; };
const put = (loc, v) => { if (!loc?.p) return; let m = last.get(loc.p); if (!m) last.set(loc.p, (m = {})); m[loc.name] = Array.from(v); };
P.uniform1f = (loc, a) => put(loc, [a]);
P.uniform4f = (loc, a, b, c, d) => put(loc, [a, b, c, d]);
P.uniform4fv = (loc, v) => put(loc, v);
P.uniformMatrix3fv = (loc, t, v) => put(loc, v);

const { bootGL } = await import('./stage-gl-boot.js');
const { st, page, frame } = await bootGL({ w: 395, h: 859, dpr: 3, coarse: true });   // (a phone held upright: the circuit opens upright)

const deg = (c, s) => (Math.atan2(s, c) * 180) / Math.PI;
const norm = (d) => Math.round(((((d % 360) + 540) % 360) - 180));
const draws = [];
let fr = 0;
for (const c of page.document.querySelectorAll('canvas')) {
  const gl = c.__gl;
  if (!gl) continue;
  for (const k of ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced']) {
    const f = gl[k];
    gl[k] = function (...a) {
      const m = cur && last.get(cur);
      if (m?.mapRot && m.inv) draws.push({ fr, shown: m.mapA?.[0] > 0, turn: norm(deg(m.mapRot[0], m.mapRot[1]) + deg(m.inv[0], m.inv[1])) });
      return f.apply(this, a);
    };
  }
}

test('on an upright circuit the map keeps one turn on the screen through every change between the views', async () => {
  for (const v of ['circuit', 'anatomy', 'circuit', 'anatomy']) {
    st.setView(v);
    for (let i = 0; i < 160; i++) { fr++; await frame(); }
  }
  // (Only draws that show the map count: its alpha is a uniform of its own (mapA), and the map's others are uploaded only while it shows, so a draw with the
  // map faded out, as the first frame of a change to the circuit is, holds the turn of the last frame it showed. Nothing is drawn from it. With a model that holds still
  // between its frames, as a settled patient's does, the last upload is the end of the fade-out, at turn 0, and that frame was counted as a flicker.)
  const shown = draws.filter((d) => d.shown);
  assert.ok(shown.length > 40, `the map was drawn through the changes: ${shown.length} of ${draws.length} draws show it`);
  const off = shown.filter((d) => d.turn !== shown[0].turn);
  assert.deepEqual(off, [], `every map draw that shows the map at a turn of ${shown[0].turn} deg on the screen`);
});
