// The sinusoid's open fenestrae stay plain however red the blood: each is a flat window in its own colour
// (--sv-gl-fenestra) with a rim in the endothelial nucleus ink, not a gap that shows the blood's colour through it.
// The window must stand at 3:1 or better against the blood from 12 mmHg up and against its own rim, in every theme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const gl = readFileSync(new URL('../src/ui/sinusoid-gl.js', import.meta.url), 'utf8');
const view = readFileSync(new URL('../src/ui/sinusoid-view.js', import.meta.url), 'utf8');
const block = (sel) => {
  const at = tokens.search(new RegExp(`\\n[ \\t]*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`));
  assert.ok(at >= 0, `token block ${sel}`);
  const open = tokens.indexOf('{', at);
  return tokens.slice(open + 1, tokens.indexOf('}', open));
};
const vars = (src) => Object.fromEntries([...src.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const light = vars(block(':root'));
const THEMES = { light, dark: { ...light, ...vars(block(':root[data-theme="dark"]')) }, soft: { ...light, ...vars(block(':root[data-theme="soft"]')) } };
const hex = (s) => { assert.match(s, /^#[0-9a-f]{6}$/i, `a solid colour, got ${s}`); return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const lum = (c) => { const l = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const ratio = (a, b) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('the fenestra window reads against high-pressure blood and its rim in every theme', () => {
  const ramp = light['--ramp-pressure'].split(',').map((s) => s.trim().split(/\s+/)).map(([h, p]) => [Number(p), h]);
  const high = ramp.filter(([p]) => p >= 12).map(([, h]) => h);
  assert.ok(high.length >= 2, 'the ramp has its high-pressure stops');
  for (const [name, T] of Object.entries(THEMES)) {
    const fen = T['--sv-gl-fenestra'];
    assert.ok(fen, `${name}: --sv-gl-fenestra is set`);
    for (const h of high) assert.ok(ratio(fen, h) >= 3, `${name}: window ${fen} vs blood ${h} is ${ratio(fen, h).toFixed(2)}`);
    assert.ok(ratio(fen, T['--sv-gl-endo-nucleus']) >= 3, `${name}: window vs rim`);
  }
});

test('the system dark theme carries the same fenestra colour as the chosen dark theme', () => {
  const sys = tokens.slice(tokens.indexOf('@media (prefers-color-scheme: dark)'));
  assert.match(sys.slice(0, sys.indexOf('--sv-gl-endo-nucleus')), new RegExp(`--sv-gl-fenestra: ${THEMES.dark['--sv-gl-fenestra']};`));
});

test('the shader fills each open fenestra with its window colour and rim, fading as it closes', () => {
  assert.match(view, /cFen: t\('--sv-gl-fenestra'\)/);
  assert.match(gl, /uniform vec3 [^;]*\bcFen\b/);
  assert.match(gl, /mix\(c, cFen, cov\(dP\) \* pF \* det\)/);
  assert.match(gl, /mix\(c, cEndoN, line\(dP, [\d.]+\) \* [\d.]+ \* pF \* det\)/);
  assert.match(gl, /pF = smoothstep\(/);
});
