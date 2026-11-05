// Every word a figure label can show is drawn by the GPU from Inter's outlines (text-gl.js): a character the cut lacks hands the label back to the
// SVG (label-gl.js svgOnly 'glyph'), which stands still through a pan and breaks the one style (5 Nov 2026 review #11). The names in anatomy.js
// and the stage's own marks (⟲ a reversed flow, − a fall, O₂) are all in the cut.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const A = await import('../src/ui/anatomy.js');
const { GLYPHS } = await import('../src/ui/glyph-data.js');

test('every character of every name and mark a label can show has an outline in each weight', () => {
  const missing = new Set();
  const marks = '⟲−+·→≥≤×–—°µ%₂';
  const walk = (v, d = 0) => {
    if (d > 6) return;
    if (typeof v === 'string') { for (const ch of v) if (ch.trim()) for (const w in GLYPHS) if (!GLYPHS[w].chars[ch]) missing.add(`${ch} (U+${ch.codePointAt(0).toString(16)}, ${w})`); }
    else if (v && typeof v === 'object') for (const k in v) walk(v[k], d + 1);
  };
  for (const k of Object.keys(A)) walk(A[k]);
  walk(marks);
  assert.deepEqual([...missing], []);
});
