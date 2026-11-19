import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spleenMotion, SPLEEN_STILL } from '../src/ui/spleen-motion.js';

// A spleen growing through a time-lapse stood still under the organs' picture, jumped bigger, waited and jumped again, while
// its outline grew smoothly (all-new-visuals slide 8, 19 Oct). While it grows, the live drawing (at its size each frame) shows.

// A 10 s time-lapse at 60 frames a second, the spleen from 11 to 16 cm along an ease in and out.
function lapse(m, t0 = 0) {
  const frames = [];
  for (let i = 0; i <= 600; i++) {
    const u = i / 600, e = u * u * (3 - 2 * u), now = t0 + i * 1000 / 60, sc = (11 + 5 * e) / 11;
    m.see(sc, now);
    frames.push({ now, sc, live: m.moving(now) });
  }
  return frames;
}

test('a growing spleen shows on the live drawing every frame it grows, and the picture comes back once it settles', () => {
  const m = spleenMotion();
  const frames = lapse(m);
  // From its first measured quarter second until it slows to a crawl at the end, every frame is drawn live.
  const growing = frames.filter((f, i) => i > 0 && Math.abs(f.sc - frames[i - 1].sc) / (1 / 60) > 0.02 && f.now > 300);
  assert.ok(growing.length > 400);
  assert.ok(growing.every((f) => f.live), 'a frame of the growth held under the stepped picture');
  const end = frames.at(-1).now;
  assert.equal(m.moving(end + SPLEEN_STILL + 1), false, 'settled once no new size comes');
  assert.ok(m.stillAt() > growing.at(-1).now, 'the picture is drawn again only after the growth');
});


test('a slow drift of the running model stays under the picture', () => {
  const m = spleenMotion();
  let live = false;
  for (let i = 0; i <= 1200; i++) { const now = i * 1000 / 60; m.see(1.2 + 0.004 * now / 1000, now); live ||= m.moving(now); }
  assert.equal(live, false);
});

test('a size that jumps once (a new patient) shows live at once, then the picture is drawn again', () => {
  const m = spleenMotion();
  m.see(1, 0); m.see(1, 300);
  assert.equal(m.see(1.4, 600), true);
  assert.equal(m.moving(600 + SPLEEN_STILL + 1), false);
});

// 8 Nov 2026: after a splenectomy (the spleen group at opacity 0.14) the next slide's spleen stayed near-black on the live GPU
// painter: its opacity was not part of the key that makes the painter read the organs again.
test('the live organs key moves with the spleen\'s own opacity', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/stage-plate.js', import.meta.url), 'utf8');
  const m = src.match(/function liveKey\(\) \{[\s\S]*?return k;/);
  assert.ok(m, 'liveKey found');
});
