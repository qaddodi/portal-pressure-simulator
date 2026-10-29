// 29 Oct, Mohammad: "Gastric varices should visibly get smaller and less intense the less pressurized they are", and (through the
// coordinator, his proxy) the same for the esophageal varices. The varix (the model's varix.d and gastricVarix.d) follows the
// pressure now, but its channels (the coronary vein C1a and its drain C1b; the short gastric feeder C2 and the gastrorenal shunt
// C5) are sized by weeks of remodeling, so carvedilol (fundal 8.5 → 5.5 mm) and a TIPS (8.5 → 2.1 mm) moved the drawn channel by
// 5 % at most. varix-look.js turns the varix's size into how it is drawn; stage.js applies it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge } from '../src/engine/scenario.js';
import { LOOK_SITE, VARIX_REST_MM, VARIX_FULL_MM, varixSize, varixHold, varixWidthK, varixSpreadK, varixOpacity } from '../src/ui/varix-look.js';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const sizes = (id, patch) => {
  const e = new Engine(); e.loadPreset(id);
  if (patch) { e.setParams(deepMerge(e.params, patch)); e.settle(); }
  const m = computeMetrics(e);
  return { VAR: varixSize('VAR', m.varix.d), GV: varixSize('GV', m.gastricVarix.d) };
};

test('the size runs from a resting vein (0) to the full size (1) and is 1 when there is no reading', () => {
  for (const site of ['VAR', 'GV']) {
    assert.equal(varixSize(site, VARIX_REST_MM), 0);
    assert.equal(varixSize(site, VARIX_FULL_MM[site]), 1);
    assert.equal(varixSize(site, 12), 1);
    assert.equal(varixSize(site, 0), 0, 'no varix at all (no gastrorenal shunt)');
    assert.equal(varixSize(site, undefined), 1);
    assert.equal(varixSize(site, NaN), 1);
    let last = -1;
    for (let d = 2; d <= VARIX_FULL_MM[site]; d += 0.25) { const s = varixSize(site, d); assert.ok(s > last, `${site} ${d} mm`); last = s; }
  }
  assert.deepEqual(LOOK_SITE, { C1a: 'VAR', C1b: 'VAR', C2: 'GV', C5: 'GV' });
});

test('a full-size varix is drawn exactly as before; a resting one is thin, narrow and faint', () => {
  assert.equal(varixWidthK(1), 1); assert.equal(varixSpreadK(1), 1); assert.equal(varixOpacity(1), 1);
  assert.ok(Math.abs(varixWidthK(0) - 0.4) < 1e-9);
  assert.ok(varixSpreadK(0) < 0.6 && varixSpreadK(0) > 0.4);
  assert.ok(Math.abs(varixOpacity(0) - 0.3) < 1e-9, 'the faintest stack level');
  for (const f of [varixWidthK, varixSpreadK, varixOpacity]) { let last = 0; for (let s = 0; s <= 1.0001; s += 0.1) { assert.ok(f(s) > last, `${f.name} ${s}`); last = f(s); } }
});

test('the presets the decks stand on are drawn exactly as before', () => {
  for (const id of ['gastric-varix', 'svt']) assert.equal(sizes(id).GV, 1, `${id}: fundal varix at full size`);
  assert.equal(sizes('cirr-decomp').VAR, 1, 'the decompensated preset (the visual references) keeps its esophageal varices as drawn');
  assert.equal(sizes('budd-chiari').VAR, 1);
});

test('a fall in pressure shrinks the fundal varices\' drawing', () => {
  const carv = sizes('gastric-varix', { drugs: { carvedilol: true } }).GV;
  const tips = sizes('gastric-varix', { tips: { on: true, d: 8 } }).GV;
  const cure = sizes('gastric-varix', { cirrhosis: 0.4 }).GV;
  assert.ok(carv < 1 && carv > tips, `carvedilol ${carv.toFixed(2)} between ${tips.toFixed(2)} and 1`);
  // Visibly: carvedilol takes about a quarter off the width, a TIPS or the cause treated well over half.
  assert.ok(varixWidthK(carv) < 0.85, `carvedilol: width ${varixWidthK(carv).toFixed(2)}`);
  assert.ok(varixWidthK(tips) < 0.45, `TIPS: width ${varixWidthK(tips).toFixed(2)}`);
  assert.ok(varixWidthK(cure) < 0.45, `cirrhosis 0.4: width ${varixWidthK(cure).toFixed(2)}`);
  assert.ok(varixOpacity(carv) < 0.85 && varixOpacity(tips) < 0.4, 'and fainter');
});

test('a fall in pressure shrinks the esophageal varices\' drawing too', () => {
  const base = sizes('cirr-decomp').VAR;
  const carv = sizes('cirr-decomp', { drugs: { carvedilol: true } }).VAR;
  const tips = sizes('cirr-decomp', { tips: { on: true, d: 8 } }).VAR;
  const early = sizes('csph').VAR;
  assert.equal(base, 1);
  assert.ok(carv < base, `carvedilol ${carv.toFixed(2)}`);
  assert.ok(tips < carv, `TIPS ${tips.toFixed(2)} below carvedilol ${carv.toFixed(2)}`);
  assert.ok(varixWidthK(tips) < 0.5, `TIPS: width ${varixWidthK(tips).toFixed(2)}`);
  assert.ok(early < 0.5, `small varices (CSPH) draw small: ${early.toFixed(2)}`);
});

test('the held size ignores a pulse across a rounding boundary and moves on a real change', () => {
  const held = {};
  assert.equal(varixHold(held, 5.26), 5.5);
  for (const d of [5.2, 5.3, 5.4, 5.25, 5.35]) assert.equal(varixHold(held, d), 5.5, `${d} stays`);
  assert.equal(varixHold(held, 4.7), 4.5);
  assert.equal(varixHold(held, 8.5), 8.5);
  assert.ok(Number.isNaN(varixHold(held, NaN)), 'no reading is passed on');
});

test('stage.js draws the varices\' channels by it: width (anatomy, not the flow lens, not a closed shunt, never under the resting caliber), strands, opacity', () => {
  assert.match(stage, /import \{ LOOK_SITE, varixSize, varixHold, varixWidthK, varixSpreadK, varixOpacity \} from '\.\/varix-look\.js/);
  assert.match(stage, /const varixS = \{ VAR: varixSize\('VAR', varixHold\(varixHeld\.VAR, f\.metrics\?\.varix\?\.d\)\), GV: varixSize\('GV', varixHold\(varixHeld\.GV, f\.metrics\?\.gastricVarix\?\.d\)\) \};/);
  assert.match(stage, /if \(LOOK_SITE\[e\.id\] && mode !== 'flow' && !isOccluded\(p, e\.id\)\) w = Math\.max\(Math\.min\(w, vesselPx\(dMinOf\(e\)\)\), w \* lerp\(varixWidthK\(varixS\[LOOK_SITE\[e\.id\]\]\), 1, t\)\);/);
  assert.match(stage, /LOOK_SITE\[e\.id\] \? varixOpacity\(varixS\[LOOK_SITE\[e\.id\]\]\) : 1\)/);
  assert.match(stage, /const fan = sd\.off \* \(1 - t\) \* \(g\.spr \?\? 1\);/);
  assert.match(stage, /const sprT = isOccluded\(p, x\.e\.id\) \? 1 : varixSpreadK\(varixS\[LOOK_SITE\[x\.e\.id\]\]\)/);
});

test('BRTO\'s balloon sits near the renal end of the shunt, clear of the splenic vein that crosses it at 0.30 to 0.34', () => {
  const m = stage.match(/brto: \{ ids: \['ILI_IVC', 'IVC_IS', 'LRV_IVC', 'C5'\], start: 0\.55, tip: \['shunt', ([\d.]+)\]/);
  assert.ok(m, 'the route is still there');
  assert.ok(+m[1] < 0.25, `the tip is ${m[1]} up the shunt (the splenic vein crosses from 0.30)`);
});
