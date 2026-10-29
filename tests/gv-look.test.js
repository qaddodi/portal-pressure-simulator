// 29 Oct, Mohammad: "Gastric varices should visibly get smaller and less intense the less pressurized they are." The fundal
// varix (the model's gastricVarix.d) follows the pressure now, but its channels (the short gastric feeder C2 and the
// gastrorenal shunt C5) are sized by weeks of remodeling, so carvedilol (8.5 → 5.5 mm) and a TIPS (8.5 → 2.1 mm) moved the
// drawn channel by 5 % at most. gv-look.js turns the varix's size into how it is drawn; stage.js applies it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge } from '../src/engine/scenario.js';
import { GV_CHANNELS, GV_REST_MM, GV_FULL_MM, gvSize, gvHold, gvWidthK, gvSpreadK, gvOpacity } from '../src/ui/gv-look.js';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const sizeOf = (id, patch) => { const e = new Engine(); e.loadPreset(id); if (patch) { e.setParams(deepMerge(e.params, patch)); e.settle(); } return gvSize(computeMetrics(e).gastricVarix.d); };

test('the size runs from a resting vein (0) to the gastric presets (1) and is 1 when there is no reading', () => {
  assert.equal(gvSize(GV_REST_MM), 0);
  assert.equal(gvSize(GV_FULL_MM), 1);
  assert.equal(gvSize(12), 1);
  assert.equal(gvSize(0), 0);
  assert.equal(gvSize(undefined), 1);
  assert.equal(gvSize(NaN), 1);
  let last = -1;
  for (let d = 2; d <= 8; d += 0.25) { const s = gvSize(d); assert.ok(s > last, `${d} mm`); last = s; }
});

test('a full-size varix is drawn exactly as before; a resting one is thin, narrow and faint', () => {
  assert.equal(gvWidthK(1), 1); assert.equal(gvSpreadK(1), 1); assert.equal(gvOpacity(1), 1);
  assert.ok(Math.abs(gvWidthK(0) - 0.4) < 1e-9, 'a resting vein is 0.4 of the full width (the channels\' resting and full calibers are 3.5 and 9.4 px)');
  assert.ok(gvSpreadK(0) < 0.6 && gvSpreadK(0) > 0.4);
  assert.ok(Math.abs(gvOpacity(0) - 0.3) < 1e-9, 'the faintest stack level');
  for (const f of [gvWidthK, gvSpreadK, gvOpacity]) { let last = 0; for (let s = 0; s <= 1.0001; s += 0.1) { assert.ok(f(s) > last, `${f.name} ${s}`); last = f(s); } }
});

test('the gastric presets are drawn exactly as before; a fall in pressure shrinks the drawing', () => {
  for (const id of ['gastric-varix', 'svt']) assert.equal(sizeOf(id), 1, `${id} is at full size`);
  const base = sizeOf('gastric-varix');
  const carv = sizeOf('gastric-varix', { drugs: { carvedilol: true } });
  const tips = sizeOf('gastric-varix', { tips: { on: true, d: 8 } });
  const cure = sizeOf('gastric-varix', { cirrhosis: 0.4 });
  assert.ok(carv < base && carv > tips, `carvedilol ${carv.toFixed(2)} between ${tips.toFixed(2)} and ${base}`);
  // Visibly: carvedilol takes about a quarter off the width, a TIPS or the cause treated well over half.
  assert.ok(gvWidthK(carv) < 0.85, `carvedilol: width ${gvWidthK(carv).toFixed(2)}`);
  assert.ok(gvWidthK(tips) < 0.45, `TIPS: width ${gvWidthK(tips).toFixed(2)}`);
  assert.ok(gvWidthK(cure) < 0.45, `cirrhosis 0.4: width ${gvWidthK(cure).toFixed(2)}`);
  assert.ok(gvOpacity(carv) < 0.85 && gvOpacity(tips) < 0.4, 'and fainter');
});

test('the held size ignores a pulse across a rounding boundary and moves on a real change', () => {
  const held = {};
  assert.equal(gvHold(held, 5.26), 5.5);
  for (const d of [5.2, 5.3, 5.4, 5.25, 5.35]) assert.equal(gvHold(held, d), 5.5, `${d} stays`);
  assert.equal(gvHold(held, 4.7), 4.5);
  assert.equal(gvHold(held, 8.5), 8.5);
  assert.ok(Number.isNaN(gvHold(held, NaN)), 'no reading is passed on');
});

test('stage.js draws the fundal channels by it: width (anatomy, not the flow lens, not a closed shunt), strands, opacity', () => {
  assert.deepEqual([...GV_CHANNELS].sort(), ['C2', 'C5']);
  assert.match(stage, /import \{ GV_CHANNELS, gvSize, gvHold, gvWidthK, gvSpreadK, gvOpacity \} from '\.\/gv-look\.js/);
  assert.match(stage, /const gvS = gvSize\(gvHold\(gvHeld, f\.metrics\?\.gastricVarix\?\.d\)\);/);
  assert.match(stage, /if \(GV_CHANNELS\.has\(e\.id\) && mode !== 'flow' && !isOccluded\(p, e\.id\)\) w \*= lerp\(gvWidthK\(gvS\), 1, t\);/);
  assert.match(stage, /GV_CHANNELS\.has\(e\.id\) \? gvOpacity\(gvS\) : 1\)/);
  assert.match(stage, /const fan = sd\.off \* \(1 - t\) \* \(g\.spr \?\? 1\);/);
  assert.match(stage, /const sprT = isOccluded\(p, x\.e\.id\) \? 1 : gvSpreadK\(gvS\)/);
});

test('BRTO\'s balloon sits near the renal end of the shunt, clear of the splenic vein that crosses it at 0.30 to 0.34', () => {
  const m = stage.match(/brto: \{ ids: \['ILI_IVC', 'IVC_IS', 'LRV_IVC', 'C5'\], start: 0\.55, tip: \['shunt', ([\d.]+)\]/);
  assert.ok(m, 'the route is still there');
  assert.ok(+m[1] < 0.25, `the tip is ${m[1]} up the shunt (the splenic vein crosses from 0.30)`);
});
