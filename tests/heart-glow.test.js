// The right atrium's slides light the whole heart with a soft glow (not an outline of the atrium alone), and where the
// GPU glow is not drawn (lite graphics) the heart gets a flat tint instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS } from '../src/ui/decks.js';

const presenter = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the right atrium and the heart targets both light the heart, and no deck outlines the atrium alone', () => {
  assert.match(presenter, /ra: \{ node: 'RA', organ: 'heart', /);
  assert.match(presenter, /heart: \{ organ: 'heart', /);
  assert.doesNotMatch(JSON.stringify(DECKS), /heart-ra/);
  const lit = DECKS.flatMap((d) => d.slides).filter((s) => /right atrium/i.test(s.line || ''));
  assert.ok(lit.length >= 3, 'the right-heart slides name the right atrium');
});

test('the heart is a glow of soft, widening layers, and the old atrium id is folded into it', () => {
  assert.match(stage, /PIN_ID = \(id\) => \(id === 'heart-ra' \? 'heart' : id\)/);
  const layers = [...stage.match(/const HEART_GLOW = (\[\[.*\]\]);/)[1].matchAll(/\[(\d+), ([\d.]+)\]/g)].map((m) => [+m[1], +m[2]]);
  assert.ok(layers.length >= 6, 'enough layers to read as a glow, not rings');
  for (let i = 1; i < layers.length; i++) assert.ok(layers[i][0] > layers[i - 1][0] && layers[i][1] <= layers[i - 1][1], 'wider layers are fainter');
  assert.ok(layers.reduce((a, l) => a + l[1], 0) < 0.4, 'the glow stays subtle at the edge');
  assert.match(stage, /glow: id === 'heart'/);
});

test('lite graphics keep a flat tint that eases, with no filter or blur', () => {
  assert.match(stage, /if \(glLines\) return;[\s\S]*org-pin-flat/);
  const rule = css.match(/\.org-pin-flat \{[^}]*\}/)[0];
  assert.match(rule, /transition: opacity/);
  assert.doesNotMatch(rule, /filter|blur|shadow/);
});
