import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flowTimeHeight, LINE, MEAL_LINES } from '../src/ui/flow-time.js';
import { CIRCULATION } from '../src/ui/decks/circulation.js';

test('wide meal charts shorten to their room without sacrificing the two plots', () => {
  const full = flowTimeHeight(420, 12, 500);
  assert.equal(full.preferred, 252);
  assert.equal(full.height, full.preferred);
  assert.ok(Math.abs(full.min - 11.1 * 12) < 1e-9);
  assert.equal(flowTimeHeight(420, 12, 180).height, 180);
  assert.equal(flowTimeHeight(420, 12, full.min - 0.01).height, null, 'an unreadable box retains the existing fitting fallback');
  assert.equal(flowTimeHeight(420, 12, full.min).height, full.min);
});

test('wrapped legends, larger type and treatment bands reserve their actual space', () => {
  for (const lines of [MEAL_LINES, ['hvpg', 'varix'], ['ppg', 'asc']]) {
    const wide = flowTimeHeight(800, 12, 1000, lines), narrow = flowTimeHeight(160, 12, 1000, lines);
    assert.ok(Math.abs(narrow.min - wide.min - 1.5 * 12) < 1e-9, `${lines}: second legend row`);
    const banded = flowTimeHeight(800, 12, 1000, lines, 1.91);
    assert.ok(Math.abs(banded.min - wide.min - 1.91 * 12) < 1e-9);
    assert.ok(Math.abs(banded.preferred - wide.preferred - 1.91 * 12) < 1e-9);
    assert.equal(flowTimeHeight(800, 12, banded.min - 1, lines, 1.91).height, null);
    assert.ok(flowTimeHeight(800, 24, 1000, lines).min >= 2 * wide.min);
    assert.ok(lines.every((k) => LINE[k]));
  }
});

test('all wide chart-only cards share the protection while mixed and phone cards keep their layout', () => {
  const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(js, /const eligible = chart && el\.classList\.contains\('tool-only'\) && ui\.root\.classList\.contains\('pz-wide'\) && !ui\.root\.classList\.contains\('stack'\) && !ui\.root\.classList\.contains\('low'\)/);
  assert.match(js, /c === chart\.parentElement \? 0 : c\.getBoundingClientRect\(\)\.height/);
  assert.match(css, /\.pz\.pz-wide[^\n]+pz-flowfit > \.pz-tool\[data-kind="flowtime"\] \{ width: 100%; zoom: 1; \}/);
  assert.match(css, /pz-flowfit \.pz-flowtime \{ height: var\(--ft-room\); min-height: 0; transition: height \.32s var\(--ease\); \}/);
  assert.equal(CIRCULATION.slides.find((s) => s.id === 'flow').line, 'Increasing flow by half adds little pressure because healthy sinusoids offer little resistance. In Flow, gut veins darken as flow rises; in Oxygen, gut venous blood keeps most of its oxygen.');
});
