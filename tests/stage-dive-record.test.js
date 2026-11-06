// Push B of the one-camera record (one-camera-record-plan.md): the stage's dive is a scene-cam record that setDiveScale alone writes and
// pushCam hands to the figure's renderer; veins-gl composes the dive's and the scene's cameras in y down and flips once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { camNew, camSet, camAbout, camThen } from '../src/ui/scene-cam.js';

const dive = readFileSync(new URL('../src/ui/stage-dive.js', import.meta.url), 'utf8');
const vgl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
let seed = 11;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e * Math.max(1, Math.abs(a), Math.abs(b)), `${a} vs ${b}`);

test('the dive record has one writer, and the figure takes it from there', () => {
  assert.match(dive, /const DIVEC = cams\.stage\.dive;/);
  assert.equal((dive.match(/camAbout\(DIVEC,/g) || []).length, 1, 'camAbout(DIVEC) in setDiveScale only');
  assert.match(dive, /camAbout\(DIVEC, k, live\.camOx, live\.camOy\); pushCam\(\);/);
  assert.match(dive, /camId\(DIVEC\); pushCam\(\); nextFrame\(diveWillOff\);/);
  assert.match(dive, /live\.veins\.setCameraRec\(DIVEC\.k, DIVEC\.x \* sx, DIVEC\.y \* sy,/);
  assert.doesNotMatch(dive, /live\.camK/);
});

test('the dive record keeps its point fixed and is the identity at k 1', () => {
  const r = camNew();
  for (let i = 0; i < 100; i++) {
    const k = 1 + rnd() * 200, ox = rnd() * 1200, oy = rnd() * 800;
    camAbout(r, k, ox, oy);
    close(r.k * ox + r.x, ox); close(r.k * oy + r.y, oy);
  }
  camAbout(r, 1, 300, 200);
  assert.deepEqual(r, { k: 1, x: 0, y: 0 });
});

test("veins-gl composes the dive's and the scene's cameras as camThen does, flipped once", () => {
  assert.match(vgl, /const a = plain \? 1 : cam\.a, k = plain \? 1 : cam\.k \* scn\.k, ex = plain \? 0 : scn\.k \* cam\.ex \+ scn\.ex, eyUp = plain \? 0 : canvas\.height \* \(1 - k\) - \(scn\.k \* cam\.ey \+ scn\.ey\);/);
  for (let i = 0; i < 200; i++) {
    const H = 600 + rnd() * 600, d = camAbout(camNew(), 1 + rnd() * 50, rnd() * 1200, rnd() * H), c = camSet(camNew(), 0.5 + rnd() * 3, rnd() * 300 - 150, rnd() * 300 - 150);
    // the formula before (the dive about (ox, oy), then the scene, y up)
    const dk = d.k, dex = d.x, deyUp = H * (1 - dk) - d.y;
    const oex = c.k * dex + c.x, oeyUp = c.k * deyUp + H * (1 - c.k) - c.y, ok = dk * c.k;
    // the formula now
    const t = camThen(camNew(), c, d), eyUp = H * (1 - t.k) - t.y;
    close(t.k, ok); close(t.x, oex); close(eyUp, oeyUp);
  }
});
