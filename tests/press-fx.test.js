import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Press and hover states for the controls that had none (1 Nov 2026): eased tints, a press sink, a tint under a finger.

const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const MAIN = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');

test('main.js adds html.press-fx, and every new rule hangs on it', () => {
  assert.match(MAIN, /\n {2}document\.documentElement\.classList\.add\('press-fx'\);\n/);
  const lines = CSS.split('\n').filter((l) => /press-fx/.test(l) && /\{/.test(l));
  assert.ok(lines.length >= 10);
  for (const l of lines) assert.match(l, /html\.press-fx/);
});

test('a press eases on --d-flip with the scale property, and sinks nothing under Reduce Motion', () => {
  assert.match(CSS, /html\.press-fx :is\(\.chip-btn[^)]*\):not\(:disabled\):active \{ scale: \.97; \}/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\) \{ html\.press-fx :is\([^)]*\):active \{ scale: none; \} \}/);
  // every control that sinks and already had a transition list has scale in it
  assert.match(CSS, /\.chip-btn \{[^}]*scale var\(--d-flip\) var\(--ease\)/);
  assert.match(CSS, /\.lens-btn \{[^}]*scale var\(--d-flip\) var\(--ease\)/);
  assert.match(CSS, /\.drug \{[^}]*scale var\(--d-flip\) var\(--ease\)/);
});

test('bar, dock, menu and list buttons share one press transition on --d-flip (the sink); their tints are taken at once', () => {
  const m = CSS.match(/html\.press-fx :is\((\.pal-btn[^)]*)\) \{\s*transition: ([^;]*);/);
  assert.ok(m, 'shared transition rule');
  for (const c of ['.tb-act', '.tl-speed', '.tl-pin', '.menu-btn', '.um-link', '.toast-x', '.pal-item', '.check-row', 'button.finding']) assert.ok(m[1].includes(c), c);
  assert.doesNotMatch(m[2], /background|border|color/, 'the tint is taken at once (1 Nov 2026, move everything to GPU: a colour, shadow or edge eased repaints every frame, so it is taken at once)');
  assert.match(m[2], /scale var\(--d-flip\) var\(--ease\)/, 'the press still sinks on the compositor');
});
