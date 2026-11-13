import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = stageSource();
const vg = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8') + readFileSync(new URL('../src/ui/veins-mesh-glsl.js', import.meta.url), 'utf8');   // (the per-vessel attributes: veins-mesh-glsl.js vesAttrs)

// The inferior vena cava lies behind the liver and the portal vein. A selected, spotlit or shunt-targeted cava is shown whole
// (no veil, no organ fading it) but it is not drawn above the portal tree for that (Mohammad, 1 Nov: "the IVC is on top of the
// portal vein"; it had been lifted to the topmost vessel tier whenever any part of it was on).

test('a cava shown whole stays in its own tier, behind the portal tree and the hepatic veins', () => {
  assert.doesNotMatch(stage, /ivcOn && IVC_EDGES\.has\(id\) \? TIER_LIFT/, 'the cava is not lifted above the network when it is on');
  const tier = stage.match(/const tier = ([^\n]*);/);
  assert.ok(tier, 'the tube sync picks a tier');
  assert.doesNotMatch(tier[1], /ivcOn/, 'selecting the cava does not change its tier');
  assert.match(stage, /const veil = false, whole = IVC_EDGES\.has\(id\) && ivcOn;/, 'no veil on the cava (13 Nov 2026: solid, so no bowel shows through); shown whole when on');
  assert.match(stage, /\(whole \? F_WHOLE : 0\)/, 'its being shown whole goes to the shader as a flag, not as a tier');
});

test('the shader lets the organs fade a vessel unless it is shown whole', () => {
  // (veins-gl.js needs a browser to load, so its flags are read from the source.)
  const flags = Object.fromEntries([...vg.matchAll(/\b(F_[A-Z]+) = (\d+)/g)].filter((m) => !/^F_(UP|DN|REV)$/.test(m[1])).map((m) => [m[1], +m[2]]));
  assert.equal(flags.F_WHOLE, 256);
  assert.equal(Object.values(flags).filter((v) => (v & flags.F_WHOLE) !== 0).length, 1, 'F_WHOLE is a bit of its own among the vessel flags');
  assert.match(vg, /\bof = \(int\(t2\.z \+ 0\.5\) & \$\{F_WHOLE\}\) != 0 \? 0\.0 : 1\.0;/);
  assert.match(vg, /vesAttrs\(sid\[s\], su\[s\], sv\[s\], p, occl, aTier, aZ, aFlag, aWall, aOf,[^\n]*\n[^\n]*sof\[s\] = aOf;/);
  // Every place the organ cover (occl) fades a group-0 vessel scales it by that vessel's own factor: none is left to fade all alike.
  assert.doesNotMatch(vg, /1\.0 - occl\)/, 'no organ fade that ignores sof');
  assert.equal((vg.match(/1\.0 - occl \* sof\[/g) || []).length, 4, 'the hand-off keep and presence, the lumen and the layer each read it');
});
