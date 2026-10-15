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
