// A DIPS runs from the portal vein (PV, the hilum: the model's PVH) to the IVC; a TIPS from the right portal vein (RPV) to the right hepatic vein (RHV)
// (Mohammad, 17 Nov 2026, on the IR stent card that named the DIPS's near end RPV). The end names come from one place per picture and agree with the model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { EDGES, stentCourse } from '../src/engine/topology.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the model: the DIPS leaves the portal vein at the hilum, the TIPS the right portal vein', () => {
  const dips = EDGES.find((e) => e.id === 'DIPS'), tips = EDGES.find((e) => e.id === 'TIPS');
  assert.equal(dips.from, 'PVH');
  assert.equal(stentCourse(dips), 'PV → IVC');
  assert.match(tips.from, /^RPV/);   // (RPV_T: the right portal vein at the TIPS origin)
  assert.equal(stentCourse(tips), 'RPV → RHV');
});

test('the side views name the DIPS’s near end PV and the TIPS’s RPV', () => {
  assert.match(read('src/ui/tool-stent.js'), /setWords\(pvName, id === 'DIPS' \? 'PV' : 'RPV'\)/);
  assert.match(read('src/ui/tips-figure.js'), /setWords\(pvT, id === 'DIPS' \? 'PV' : 'RPV'\)/);
});

test('no words say the DIPS starts in the right portal vein', () => {
  const walk = (d) => readdirSync(new URL(`../${d}`, import.meta.url), { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? walk(`${d}/${f.name}`) : f.name.endsWith('.js') ? [`${d}/${f.name}`] : []));
  for (const f of walk('src')) {
    const s = read(f);
    assert.doesNotMatch(s, /DIPS[^\n]{0,80}right portal vein (→|into|to) (the )?(intrahepatic )?IVC/i, f);
    assert.doesNotMatch(s, /right portal vein → (the )?intrahepatic IVC/i, f);
    assert.doesNotMatch(s, /DIPS placed: right portal/i, f);
  }
});
