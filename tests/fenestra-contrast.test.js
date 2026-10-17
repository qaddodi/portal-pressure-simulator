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

test('each sieve plate is an even row of same-size pores that closes from its ends inward', async () => {
  const { poreAt, poreOpenness, SEED } = await import('../src/ui/sinusoid-gl.js');
  for (const sd of [SEED.poreUp, SEED.poreDn]) {
    let plates = 0;
    for (let G = -20; G < 20; G++) {
      const row = [3, 4, 5, 6, 7].map((k) => poreAt(10 * G + k, sd));
      if (!row[0]) { assert.ok(row.every((p) => !p), 'a plate is whole or absent'); continue; }
      plates++;
      const w = row[0].w;
      row.forEach((p, i) => { assert.equal(p.w, w, 'one size'); if (i) assert.ok(Math.abs(p.x - row[i - 1].x - 1) < 1e-9, 'even spacing'); });
      assert.ok(row[2].th < row[1].th && row[1].th === row[3].th && row[1].th < row[0].th && row[0].th === row[4].th, 'ends close first');
      for (const p of row) assert.ok(poreOpenness(p.th, 1) > 0.999 && poreOpenness(p.th, 0) < 1e-9, 'open when healthy, shut when sealed');
      for (const por of [0.2, 0.5, 0.8]) {
        const open = row.map((p) => poreOpenness(p.th, por) > 0.5);
        assert.deepEqual(open, [...open].reverse(), `what stays open at ${por} is centred in the plate`);
      }
    }
    assert.ok(plates > 20, 'most stretches of lining carry a plate');
  }
  assert.ok(gl.includes('float th = 0.12 + 0.28 * abs(float(k) - 5.0) + 0.18 * h1(G, sd + 4);'), 'the shader closes the same pores');
});
