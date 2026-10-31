// Premium feel R8: one depth model. The chrome's two shadows fall where the figure's light says (down and a little right), in the
// figure's shadow ink, and the dark theme's strength comes from the figure's own --shadow-a.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIGHT } from '../src/ui/light.js';

const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('R8 the shadows lean the way the figure\'s light does', () => {
  const slant = +tokens.match(/--light-slant: ([.\d]+);/)[1];
  // (The light points up and to the left, so a shadow falls down and to the right: across for each unit down is the light's x over its y.)
  assert.ok(LIGHT[0] < 0 && LIGHT[1] < 0, 'the light still comes from the top left');
  assert.ok(Math.abs(slant - LIGHT[0] / LIGHT[1]) < 0.01, `--light-slant ${slant} follows light.js (${(LIGHT[0] / LIGHT[1]).toFixed(3)})`);
});

test('R8 both levels use the slant and the figure\'s shadow ink, in every theme', () => {
  const defs = [...tokens.matchAll(/--shadow-(menu|dialog): ([^;]+);/g)];
  assert.equal(defs.length, 6, 'light, then the dark theme twice (the system setting and the chosen one)');
  for (const [, name, value] of defs) {
    for (const part of value.split(/,(?![^(]*\))/)) {
      assert.match(part.trim(), /^calc\(\d+px \* var\(--light-slant\)\) \d+px \d+px rgb\(var\(--shadow-rgb\) \/ /, `${name}: ${part.trim()} leans with the light`);
    }
    assert.doesNotMatch(value, /night-rgb|rgba\(0, 0, 0/, `${name} takes the figure's ink`);
  }
});

test('R8 the dark theme\'s strength is the figure\'s --shadow-a', () => {
  const dark = defs(tokens, /--shadow-menu: [^;]*var\(--shadow-a\)[^;]*;|--shadow-dialog: [^;]*var\(--shadow-a\)[^;]*;/g);
  assert.equal(dark.length, 4, 'menu and dialog, in both dark blocks');
  assert.equal(tokens.match(/--shadow-a: \.38;/g).length, 2, 'the dark blocks that set it');
});

test('R8 the Tests card on a desktop has no shadow pair of its own', () => {
  assert.match(app, /\.instrument-workspace\.float-ui \{ box-shadow: var\(--shadow-menu\), inset 0 0 0 1px var\(--hairline\); \}/);
});

function defs(text, re) { return text.match(re) || []; }
