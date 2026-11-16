// The trial cards' words are set on the GPU from the glyph atlas (text-gl.js); a letter the atlas lacks is drawn as "?" (Landmark trials 9, play-test
// 16 Nov 2026: "Garc?a-Pag?n"). Every character of every trial's text must have its outline at every weight.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLYPHS } from '../src/ui/glyphs-inter.js';
import { TRIALS, BAVENO_VIII, trialLines } from '../src/ui/trials.js';

const strings = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
};

test('every character in the trial cards and captions has a glyph at every weight', () => {
  const texts = [...strings(TRIALS), ...strings(BAVENO_VIII), ...Object.values(TRIALS).flatMap((t) => strings(trialLines(t)))];
  const missing = new Set();
  for (const t of texts) for (const ch of t) for (const w of Object.keys(GLYPHS)) if (!GLYPHS[w][ch]) missing.add(`${ch} (U+${ch.codePointAt(0).toString(16).padStart(4, '0')}) at ${w}`);
  assert.deepEqual([...missing], []);
});
