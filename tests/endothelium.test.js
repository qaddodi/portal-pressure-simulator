// The sinusoid's lining, as an electron micrograph section draws it: a thin solid sheet with a dark border round each
// cell, cut through by real gaps where the fenestrae are open (the blood shows through them), and a nucleus that
// bulges into the lumen. The border must stand at 3:1 or better against the sheet, in every theme.
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

test('the endothelial cell reads by its border and nucleus in every theme', () => {
  for (const [name, T] of Object.entries(THEMES)) {
    const sheet = T['--sv-gl-endo-sheet'], edge = T['--sv-gl-endo-edge'];
    assert.ok(sheet && edge, `${name}: the sheet and its border are set`);
    assert.ok(ratio(sheet, edge) >= 3, `${name}: border ${edge} vs sheet ${sheet} is ${ratio(sheet, edge).toFixed(2)}`);
    assert.ok(ratio(sheet, T['--sv-gl-endo-nucleus']) >= 2.5, `${name}: nucleus vs sheet is ${ratio(sheet, T['--sv-gl-endo-nucleus']).toFixed(2)}`);
  }
});

test('the system dark theme carries the same endothelium as the chosen dark theme', () => {
  const sys = tokens.slice(tokens.indexOf('@media (prefers-color-scheme: dark)'));
  const head = sys.slice(0, sys.indexOf('--sv-gl-endo-nucleus'));
  for (const k of ['--sv-gl-endo-sheet', '--sv-gl-endo-edge']) assert.match(head, new RegExp(`${k}: ${THEMES.dark[k]};`));
});

test('an open fenestra is a real gap in the sheet, and the whole cell has a border', () => {
  assert.match(view, /cEndoS: t\('--sv-gl-endo-sheet'\), cEndoE: t\('--sv-gl-endo-edge'\)/);
  assert.match(gl, /uniform vec3 [^;]*\bcEndoS, cEndoE\b/);
  assert.ok(!/cFen|--sv-gl-fenestra/.test(gl + view + tokens), 'no window fill left');
  assert.ok(gl.includes('if (w > 0.02) d = smax(d, -(abs(x - px) - 0.5 * w), th);'), 'each open pore cuts through the sheet');
  // The border sits outside the sheet's edge (its faces, the pores' lips, the swell over the nucleus), with the detail.
  assert.ok(gl.includes('vec3 c = mix(under, cEndoE, cov(d - max(0.1, 2.4 * uPx) * det) * det);'));
  // Under the sheet an open pore shows the blood up to the sheet's outer face.
  assert.ok(gl.includes('mix(cLymph, cLumen, cov(a - (hw + ENDO * 0.5 + endoTh(det))))'));
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
