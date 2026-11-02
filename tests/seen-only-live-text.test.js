import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// R11 (review pass 2): a component nobody can see does no formatting upstream. The side panel's Compare table, like its readings
// (R17), is not worked out while the panel is shut; the newest frame is kept and painted the moment it opens. The screen reader's
// description of the figure is kept but never written in a frame of a transition.
const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
const fnOf = (src, a) => { const i = src.indexOf(a); return src.slice(i, src.indexOf('\n}\n', i) + 2); };

test('a shut panel formats no Compare rows; the newest frame paints as it opens', () => {
  // (Plan "Holding 120 Hz" §3.2: the panel's paint is a may task of the model frame (PAINT_PARTS).)
  const paint = main.slice(main.indexOf('const PAINT_PARTS = ['), main.indexOf('function paintChrome('));
  assert.match(paint, /if \(panelShown\(\)\) \{ cmpStale = null; compare\.update\(f\); \}\n\s+else if \(store\.get\(\)\.compareSnap\) cmpStale = f;/);
  // The gate's behaviour, run with stand-ins: frames while shut are kept (the newest only), one paint when it shows.
  const seen = fnOf(main, 'function inspectorSeen() {');
  let shown = false, painted = [];
  const env = { inspStale: null, cmpStale: null, panelShown: () => shown, inspector: { update() {} }, compare: { update: (f) => painted.push(f) } };
  const run = new Function('env', `with (env) { ${seen} return inspectorSeen; }`)(env);
  env.cmpStale = 'f1'; env.cmpStale = 'f2';
  run();
  assert.deepEqual(painted, [], 'still shut: nothing painted');
  shown = true; run(); run();
  assert.deepEqual(painted, ['f2'], 'opened: the newest frame, once');
});

test('the figure\'s screen-reader description waits for a still frame', () => {
  assert.match(main, /if \(now - lastDesc > 3000 && !inMotion\(\)\) \{ lastDesc = now; \$\('#stage'\)\.setAttribute\('aria-description', caption\(f\)\); \}/);
});
