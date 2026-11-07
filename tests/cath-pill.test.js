import { stageSource } from './stage-src.js';
// The HVPG catheter's two readings (cath-pill.js) never sit on a card, the top sheet or each other (2 Nov 2026, his ask: on an iPhone
// the WHVP reading hung below its point onto the teaching card, HVPG slide 4, and the FHVP one stood close above it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { placePills, pillBox, pillsClear } from '../src/ui/cath-pill.js';
import { readFileSync } from 'node:fs';

const meets = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

test('iPhone HVPG 4: the wedged reading leaves the teaching card and clears the free one', () => {
  const W = 390, top = 202, lim = 563, blockers = [{ x0: 4, y0: 4, x1: 386, y1: 198 }, { x0: 4, y0: 565, x1: 386, y1: 844 }];
  const f = { x: 228, y: 481, w: 78, h: 70, prefer: true, was: null }, w = { x: 165, y: 504, w: 84, h: 70, prefer: false, was: null };
  const r = placePills({ pills: [f, w], W, top, lim, blockers });
  const bf = pillBox(f.x, f.y, f.w, f.h, r[0].above, r[0].dx), bw = pillBox(w.x, w.y, w.w, w.h, r[1].above, r[1].dx);
  for (const b of blockers) { assert.ok(!meets(bf, b)); assert.ok(!meets(bw, b)); }
  assert.ok(!meets(bf, bw), `${JSON.stringify(bf)} ${JSON.stringify(bw)}`);
});

test('any phone, iPad or Mac band: clear when a clear place exists, and a clear place is kept', () => {
  for (const [W, H, t, b] of [[375, 667, 160, 260], [390, 844, 200, 280], [820, 1180, 120, 360], [1440, 900, 80, 220]]) {
    const top = t + 6, lim = H - b - 6, blockers = [{ x0: 0, y0: 0, x1: W, y1: t }, { x0: 0, y0: H - b, x1: W, y1: H }];
    for (let y = top + 20; y < lim - 20; y += 15) for (let x = 60; x < W - 60; x += 30) {
      const pills = [{ x, y, w: 80, h: 70, prefer: true, was: null }, { x: x - 60, y: y + 25, w: 84, h: 70, prefer: false, was: null }];
      const r = placePills({ pills, W, top, lim, blockers });
      const bs = pills.map((p, i) => pillBox(p.x, p.y, p.w, p.h, r[i].above, r[i].dx));
      // Is there any clear pairing at all? (a band too short for either side has none)
      const sides = (p) => [true, false].flatMap((a) => [-32, -16, 0, 16, 32].map((d) => pillBox(p.x, p.y, p.w, p.h, a, d)));
      const ok = (q) => q.y0 >= top && q.y1 <= lim && q.x0 >= 8 && q.x1 <= W - 8;
      const any = sides(pills[0]).some((a) => ok(a) && sides(pills[1]).some((c) => ok(c) && !meets(a, c)));
      if (!any) continue;
      for (const q of bs) for (const k of blockers) assert.ok(!meets(q, k), `on a card W${W} at ${x},${y}`);
      assert.ok(!meets(bs[0], bs[1]), `the readings meet W${W} at ${x},${y}`);
      // Laid out again where it stands, nothing moves.
      const again = placePills({ pills: pills.map((p, i) => ({ ...p, was: r[i] })), W, top, lim, blockers });
      assert.deepEqual(again, r);
    }
  }
});

test('the stage places, eases and turns the readings with it, with no CSS flip', () => {
  const stage = stageSource(), css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(stage, /if \(first \|\| \(calm && !pillsClear\(q\)\)\) \{[\s\S]*?placePillsInto\(q, cathSideOut\);/);
  assert.match(stage, /calm = !(?:live\.)?(?:live\.)?vtGliding && !cath\.glideRaf;/);
  assert.match(stage, /if \(ready\) \{ const q = cathGlide\(el, bx, by, x, y\); cx = q\[0\]; cy = q\[1\]; \} else el\._gl = null;/);
  assert.match(css, /\.cath-label\.cath-js, \.cath-label\.cath-js\[data-at="ahead"\], \.cath-label\.cath-js\[data-at="ahead"\]\.above \{ translate: -50% var\(--pre, 0px\); \}/);
});

test('a reading that is clear keeps its place; one that now covers a card is placed again', () => {
  const W = 390, top = 202, lim = 563, blockers = [{ x0: 4, y0: 565, x1: 386, y1: 844 }];
  const p = { x: 200, y: 400, w: 80, h: 70, prefer: true };
  assert.equal(pillsClear({ pills: [{ ...p, was: { above: true, dx: 10 } }], W, top, lim, blockers }), true, 'off its best spot but clear: kept');
  assert.equal(pillsClear({ pills: [{ ...p, y: 520, was: { above: false, dx: 0 } }], W, top, lim, blockers }), false, 'on the card: placed again');
  assert.equal(pillsClear({ pills: [{ ...p, was: null }], W, top, lim, blockers }), false, 'not placed yet');
  const two = [{ ...p, was: { above: true, dx: 0 } }, { ...p, x: 230, was: { above: true, dx: 0 } }];
  assert.equal(pillsClear({ pills: two, W, top, lim, blockers }), false, 'on each other: placed again');
});
