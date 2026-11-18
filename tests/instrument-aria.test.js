// Three instrument canvases tell a screen reader their values (A11-1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileLabel, fibroscanLabel, endoscopyLabel } from '../src/ui/instrument-aria.js';

test('the pressure profile names its stations and pressures, and gives nothing away when a slide withholds them', () => {
  assert.equal(profileLabel([{ name: 'Portal vein', v: 17.8 }, { name: 'Hepatic vein', v: 6.2 }, { name: 'IVC', v: 4 }]), 'Pressure profile, gut to heart: Portal vein 18, Hepatic vein 6, IVC 4 millimeters of mercury');
  assert.match(profileLabel([{ name: 'Portal vein', v: 18 }], true), /withheld/);
  assert.doesNotMatch(profileLabel([{ name: 'Portal vein', v: 18 }], true), /18/);
});

test('the FibroScan says the organ, the kilopascals and the tile\'s band word; no reading says so', () => {
  assert.equal(fibroscanLabel('liver', 21.44, 'Borderline'), 'Simulated FibroScan, liver: 21.4 kilopascals, borderline');
  assert.equal(fibroscanLabel('spleen', 62, 'CSPH'), 'Simulated FibroScan, spleen: 62.0 kilopascals, CSPH');
  assert.equal(fibroscanLabel('spleen', null), 'Simulated FibroScan, spleen: no reading');
});

test('the endoscopic view says the grade, size, red wale marks and bands', () => {
  assert.equal(endoscopyLabel({ present: true, grade: 'Large', diam: '6.2 mm', red: true, bands: 2 }), 'Endoscopic view: large varices, 6.2 millimeters, red wale marks, 2 bands placed');
  assert.equal(endoscopyLabel({ present: true, grade: 'Small', diam: '3.1 mm', red: false, bands: 1 }), 'Endoscopic view: small varices, 3.1 millimeters, no red wale marks, 1 band placed');
  assert.equal(endoscopyLabel({ present: true, grade: 'Small', diam: '3.1 mm', red: false, bands: 0 }), 'Endoscopic view: small varices, 3.1 millimeters, no red wale marks, no bands placed');
  assert.equal(endoscopyLabel({ present: false }), 'Endoscopic view: no varices');
});
