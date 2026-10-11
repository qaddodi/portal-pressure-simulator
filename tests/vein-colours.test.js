// One colour per gut vein across the app: the trace/slide/pill tokens (--tr-smv, --tr-imv, --tr-sv) are the
// Blood origin lens's own colours (main.js ORIGIN_CSS, stage.js originCol).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

test('SMV, IMV and splenic vein tokens match the Blood origin lens', () => {
  const css = [...read('src/ui/main.js').match(/const ORIGIN_CSS = \[(.*)\];/)[1].matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)].map((m) => hex([+m[1], +m[2], +m[3]]));
  const want = { smv: css[0], imv: css[1], sv: css[2] };
  const tokens = read('styles/tokens.css');
  for (const k of Object.keys(want)) {
    const found = [...tokens.matchAll(new RegExp(`--tr-${k}: (#[0-9A-Fa-f]{6})`, 'g'))].map((m) => m[1].toUpperCase());
    assert.ok(found.length >= 3, `--tr-${k} is set in the light, dark and auto-dark themes`);
    for (const f of found) assert.equal(f, want[k], `--tr-${k}`);
  }
  // The shader's own origin colours agree with the lens legend.
  const gl = [...read('src/ui/stage.js').match(/originCol: \[(.*)\],/)[1].matchAll(/\[([\d., ]+)\]/g)].slice(0, 3).map((m) => hex(m[1].split(',').map((v) => +v * 255)));
  assert.deepEqual(gl, [want.smv, want.imv, want.sv]);
});
