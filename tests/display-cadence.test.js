import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Motion is drawn on every frame the screen offers (the owner, 15 Oct: "120hz persistently"); only Battery saver paces
// it. Surfaces had each capped their own steady motion near 30 frames a second (a shared GLIDE_MS, the anatomy's top
// quality step, the FibroScan probe): any of those coming back fails here. (The browser check smoke:idle measures it.)
const SRC = new URL('../src/ui/', import.meta.url);
const files = readdirSync(SRC).filter((f) => f.endsWith('.js'));

test('no surface paces steady motion to a fixed frame rate of its own', () => {
  for (const f of files) {
    const js = readFileSync(new URL(f, SRC), 'utf8');
    assert.ok(!/\bGLIDE_MS\b/.test(js), `${f}: GLIDE_MS (the old 30-a-second pace) is back`);
    assert.ok(!/1000\s*\/\s*(24|25|30|60)\b(?!\s*\*)/.test(js), `${f}: a fixed frame pace (1000 / n)`);
  }
});

test('Battery saver alone paces motion', async () => {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const { paceMs, setSaver, SAVER_MS } = await import('../src/ui/frame.js');
  setSaver(false);
  assert.equal(paceMs(), 0);
  setSaver(true);
  assert.equal(paceMs(), SAVER_MS);
  assert.ok(SAVER_MS > 60 && SAVER_MS < 67);
  setSaver(false);
});

test("the anatomy's top quality step draws the blood on every frame", () => {
  const js = readFileSync(new URL('stage.js', SRC), 'utf8');
  const q = js.match(/const QUALITY = \[([^\]]*)\]/);
  assert.ok(q, 'QUALITY table found');
  assert.match(q[1].trim(), /^\{ fps: 0, res: 1 \}/, 'the first (default) step is unpaced at full resolution');
});

// Outside Battery saver nothing lowers its own resolution or frame rate (the owner, 15 Oct: "0 drop in quality"): the
// anatomy's frame-time governor, its zoom resolution and dynamic resolution, the lobule's resolution governor and the
// FibroScan's shrinking map size are gone, and a level an older build stored is dropped.
test('no surface steps its own resolution or frame rate down', () => {
  const stage = readFileSync(new URL('stage.js', SRC), 'utf8');
  for (const name of ['governQuality', 'governRes', 'dynRes', 'zoomRes']) assert.ok(!new RegExp(`\\b${name}\\b`).test(stage), `stage.js: ${name} is back`);
  assert.ok(!/localStorage\.setItem\('pps\.(quality|q)'/.test(stage), 'stage.js stores a quality level again');
  assert.match(stage, /removeItem\('pps\.quality'\)/, 'an old stored level is dropped');
  assert.match(stage, /removeItem\('pps\.q'\)/, 'an old stored level is dropped');
  // (Besides the step, only Settings › Figure resolution, which the viewer picks: frame.js renderScale, 1 unless chosen.)
  assert.match(stage, /vdpr = Math\.min\(2, devicePixelRatio \|\| 1\) \* QUALITY\[quality\]\.res \* renderScale\(\);/, 'the vessel canvas follows only the explicit step and setting');
  const lob = readFileSync(new URL('lobule-zoom.js', SRC), 'utf8');
  assert.ok(!/\blzRes\b/.test(lob), 'lobule-zoom.js: its resolution governor is back');
  const fib = readFileSync(new URL('fibroscan.js', SRC), 'utf8');
  assert.ok(!/cap -= /.test(fib), 'fibroscan.js: the map shrinks itself again');
});
