// A vessel that leaves a disc seen end-on starts at the disc's rim, never inside it (16 Nov 2026, Mohammad: "the hepatic arteriole itself seems to be cropped i mean the
// circle; same for lymph"). The arteriole's twig ran from the disc's centre, and inside the disc's open mouth its body showed over the disc's fill as a flat cut; the
// lymphatics ran into the tract lymphatic's centre, and that lymphatic, drawn as a short tube, took a tube's cel tones (lit on one half, a diagonal seam). Now every disc
// seen end-on (lobule-mouths.js END_ON) is an F_RING disc without the tube's tones, and what leaves it starts on its rim (rimToward).
// Node only: the lobule booted in jsdom with the GL stub (scripts/lobule-joins.mjs), with the Lymph and Bile layers on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureLobule } from '../scripts/lobule-joins.mjs';
import { END_ON, rimToward } from '../src/ui/lobule-mouths.js';
import { F_RING } from '../src/ui/veins-mesh-glsl.js';

const F_DIFFUSE = 2;   // (veins-gl.js F_DIFFUSE: the tube's cel tones)

const FLOATS = 52;
const cap = await captureLobule({ lymph: true });
const row = (id) => ({ z: cap.up.tube[id * FLOATS + 9], fl: cap.up.tube[id * FLOATS + 10] });
const centre = (t) => { const a = t.pts[0], b = t.pts[t.pts.length - 1]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
const ofZ = (z) => cap.tubes.filter((t) => Math.abs(row(t.id).z - z) < 1e-6);   // (the lobule's Z_OF: arteriole 0.7, its twig 0.08, tract lymphatic 0.8, lymphatics 0.25)
const radius = (t) => cap.up.rad[t.id * 64 * 4];

test('rimToward: the point on the rim toward another point', () => {
  assert.deepEqual(rimToward([0, 0], [10, 0], 2), [2, 0]);
  const p = rimToward([1, 1], [4, 5], 5);
  assert.ok(Math.abs(Math.hypot(p[0] - 1, p[1] - 1) - 5) < 1e-9);
});

test('the tract lymphatic is a disc seen end-on: F_RING, no tube cel tones, as the venule and the central vein', () => {
  assert.ok(END_ON.has('lv'));
  const lv = ofZ(0.8);
  assert.equal(lv.length, 6, 'six tract lymphatics');
  for (const t of lv) {
    assert.ok(row(t.id).fl & F_RING, `lymphatic row ${t.id} is not drawn as a disc`);
    assert.equal(row(t.id).fl & F_DIFFUSE, 0, `lymphatic row ${t.id} takes a tube's cel tones (lit on one half)`);
  }
});

test('each twig leaves its arteriole at the rim, and each lymphatic ends at its tract lymphatic\'s rim, never inside the disc', () => {
  const ha = ofZ(0.7), tw = ofZ(0.08), lv = ofZ(0.8), lt = ofZ(0.25);
  assert.equal(ha.length, 6); assert.equal(tw.length, 6); assert.equal(lt.length, 12);
  for (const t of tw) {
    const s = t.pts[0], d = ha.map((h) => ({ h, d: Math.hypot(s[0] - centre(h)[0], s[1] - centre(h)[1]) })).sort((a, b) => a.d - b.d)[0];
    assert.ok(d.d > 0.85 * radius(d.h), `twig row ${t.id} starts ${d.d.toFixed(2)} from its arteriole's centre, inside its rim (${radius(d.h).toFixed(2)})`);
    assert.ok(d.d < 1.2 * radius(d.h), `twig row ${t.id} starts off its arteriole (${d.d.toFixed(2)} from its centre)`);
  }
  for (const t of lt) {
    const s = t.pts[t.pts.length - 1], d = lv.map((h) => ({ h, d: Math.hypot(s[0] - centre(h)[0], s[1] - centre(h)[1]) })).sort((a, b) => a.d - b.d)[0];
    assert.ok(d.d > 0.85 * radius(d.h), `lymphatic row ${t.id} ends ${d.d.toFixed(2)} from its tract lymphatic's centre, inside its rim (${radius(d.h).toFixed(2)})`);
    assert.ok(d.d < 1.25 * radius(d.h), `lymphatic row ${t.id} ends off its tract lymphatic (${d.d.toFixed(2)} from its centre)`);
  }
});
