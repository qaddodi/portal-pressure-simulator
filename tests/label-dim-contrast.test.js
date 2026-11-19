// A label a slide does not light (or one not explained) steps back to DIM_ALPHA (label-explain.js, the one value; the CSS reads it as --label-dim).
// It is drawn over the vessels, so its letters must still stand out from what is round them by 3:1 (WCAG's floor for large or bold text and
// graphics) in every look, on the vessel colours: at 35 % it read about 2:1 and "Central vein" was lost against the sinusoids (play-test, 16 Nov 2026).
// Model: the whole label (letters and their 4 px halo, --label-halo) is composited at the alpha over the vessel V. A letter pixel is
// alpha·ink + (1 − alpha)·V; the pixel beside it is the halo over V at the alpha: the same two layers the GPU draws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOK_IDS, tokensOfLook } from '../src/ui/theme-tokens.js';
import { DIM_ALPHA } from '../src/ui/label-explain.js';

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const rgba = (s) => { const p = /rgba?\(([^)]+)\)/.exec(s)[1].split(',').map(parseFloat); return { c: p.slice(0, 3), a: p[3] ?? 1 }; };
const lum = (c) => { const l = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, t) => a.map((v, i) => v * t + b[i] * (1 - t));
const VESSELS = ['tour-portal', 'tour-sys', 'artery'];

function worst(alpha) {
  let min = Infinity, at = '';
  for (const id of LOOK_IDS) {
    const t = tokensOfLook(id, false), halo = rgba(t['label-halo']);
    for (const inkKey of ['text', 'text-2']) for (const vk of VESSELS) {
      if (!/^#[0-9a-f]{6}$/i.test(t[vk] || '') || !/^#[0-9a-f]{6}$/i.test(t[inkKey] || '')) continue;
      const V = hex(t[vk]), ink = hex(t[inkKey]);
      const r = ratio(mix(ink, V, alpha), mix(mix(halo.c, V, halo.a), V, alpha));
      if (r < min) { min = r; at = `${id}: ${inkKey} on ${vk}`; }
    }
  }
  return { min, at };
}

test('a dimmed label still reads 3:1 against the vessels behind it, in every look', () => {
  const w = worst(DIM_ALPHA);
  assert.ok(w.min >= 3, `dimmed at ${DIM_ALPHA}: ${w.min.toFixed(2)}:1 (${w.at})`);
});

test('the check has teeth: the old 35 % fails it, and a label at full strength passes with room', () => {
  assert.ok(worst(0.35).min < 2.6, `0.35 reads ${worst(0.35).min.toFixed(2)}:1`);
  assert.ok(worst(1).min > 6);
});

test('a dimmed label is still dimmer than a lit one (it steps back, it does not vanish or stand level)', () => {
  assert.ok(DIM_ALPHA < 0.8 && DIM_ALPHA > 0.5, `${DIM_ALPHA}`);
});
