// A plane's point names read against the cut-off lines (capture 36b7deac, 25 Nov 2026, slide 12 of Sites and causes: "Portal vein thrombosis" stood below the PPG 12 line for a point above
// it). A name that crosses a line keeps its middle on its point's side of it, or its point sits on the line; where no such place exists the name takes a leader on its own side.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeNames } from '../src/ui/visual-plane.js';

// (a small seeded generator: the same plots every run)
const rng = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

test('no point name crosses a cut-off line and stands wholly on the far side of it from its point', () => {
  const fr = { L: 0, R: 390, T: 0, B: 290 }, fs = 17.4, names = ['Portal vein thrombosis', 'Schistosomiasis', 'Cirrhosis', 'Sinusoidal obstruction', 'Budd–Chiari', 'Heart failure', 'Healthy'];
  const rand = rng(7);
  let across = 0, plots = 0;
  for (let t = 0; t < 120; t++) {
    const hy = 120 + rand() * 90, vx = 120 + rand() * 150;
    const hLine = [fr.L, hy - 2, fr.R, hy + 2], vLine = [vx - 2, fr.T, vx + 2, fr.B];
    const n = 3 + Math.floor(rand() * 5);
    const pts = Array.from({ length: n }, (_, i) => ({ x: 14 + rand() * 360, y: 14 + rand() * 270, name: names[i], short: ['PVT', 'Schisto', null, 'SOS', null, null, null][i] || undefined }));
    const res = placeNames(pts, fr, fs, 8, [hLine, vLine], [hLine, vLine], 0, { sideFallback: false });
    // (the second try, for a plot so crowded that a patient has no name at all, may cross on the far side: it never leaves more names out than the strict one)
    const lax = placeNames(pts, fr, fs, 8, [hLine, vLine], [hLine, vLine]);
    assert.ok(lax.filter((o) => !o).length <= res.filter((o) => !o).length, `plot ${t}: the fallback names at least as many`);
    plots++;
    res.forEach((o, i) => {
      if (!o) return;
      const p = pts[i], b = o.box;
      if (b[1] < hLine[3] && b[3] > hLine[1] && Math.abs(p.y - hy) >= fs) { across++; assert.equal((b[1] + b[3]) / 2 < hy, p.y < hy, `plot ${t}: "${p.name}" at y ${p.y.toFixed(0)} stands across the line y ${hy.toFixed(0)} on the far side`); }
      if (b[0] < vLine[2] && b[2] > vLine[0] && Math.abs(p.x - vx) >= fs) { across++; assert.equal((b[0] + b[2]) / 2 < vx, p.x < vx, `plot ${t}: "${p.name}" at x ${p.x.toFixed(0)} stands across the line x ${vx.toFixed(0)} on the far side`); }
    });
  }
  assert.ok(plots === 120);
  assert.ok(across > 0, 'the walk includes names that do cross a line');
});

test('the phone plot of slide 12 (440 wide): the clot\'s name keeps to its own side of the PPG 12 line', () => {
  const fr = { L: 0, R: 390, T: 0, B: 290 }, fs = 17.4, hy = 184.9;
  const hLine = [0, hy - 2, 390, hy + 2], vLine = [193, 0, 197, 266];
  const pts = [{ x: 49.5, y: 273.2, name: 'Healthy' }, { x: 43.8, y: 159.1, name: 'Portal vein thrombosis', short: 'PVT' }, { x: 70.3, y: 144.6, name: 'Schistosomiasis', short: 'Schisto' },
    { x: 310.3, y: 127.8, name: 'Cirrhosis' }, { x: 200.7, y: 179.3, name: 'Sinusoidal obstruction', short: 'SOS' }, { x: 11.7, y: 78.7, name: 'Budd–Chiari' }, { x: 15.4, y: 303.4, name: 'Heart failure' }];
  const res = placeNames(pts, fr, fs, 8, [hLine, vLine], [hLine, vLine]);
  const clot = res[1];
  assert.ok(clot, 'the clot is named');
  assert.ok((clot.box[1] + clot.box[3]) / 2 < hy, 'its name stands above the line, on its point\'s side');
});
