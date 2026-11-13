// A data card tile's number, bar mark and start ring follow one follower (tile-shown.js on the page's shown state), so the number and the bar
// arrive together and a kept card's 150 ms polls bend the speed instead of restarting a curve (motion recs item 15, 8 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShownState, SHOWN_TAU } from '../src/ui/display-state.js';
import { createTileShown, tileSmall } from '../src/ui/tile-shown.js';
import { SCALE, TILE } from '../src/ui/table-marks.js';

/** A shown state with a hand-turned clock: frames of 1000/hz ms; paint is called after each step, as the dock's and the tiles' are. */
const rig = (hz = 60) => {
  let pending = null, t = 0;
  const state = createShownState({ ask: (cb) => { pending = cb; return 1; }, cancel: () => { pending = null; }, now: () => t });
  const tiles = createTileShown(state);
  const frame = () => { t += 1000 / hz; const cb = pending; pending = null; if (cb) cb(t); return !!cb; };
  return { state, tiles, frame, now: () => t, busy: () => !!pending, wait: (ms) => { for (let i = 0; i < Math.round((ms * hz) / 1000); i++) frame(); } };
};
const hvpg = { small: tileSmall(TILE.hvpg, SCALE.hvpg) };

test('a tile\'s number and its bar mark are read from the same value in every frame, and the end value is not shown first', () => {
  const r = rig();
  r.tiles.set('hvpg', 20, hvpg.small, false);                 // (the tile as it stood)
  assert.equal(r.tiles.set('hvpg', 8, hvpg.small, true), 20, 'the value shown when the new one is set is still the old one');
  const seen = [];
  r.state.on(() => seen.push(r.tiles.get('hvpg', NaN)));
  r.wait(2000);
  assert.ok(seen.length > 30 && seen[0] < 20 && seen[0] > 19, `${seen[0]}: an ease from rest, not a step`);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] <= seen[i - 1], 'monotone toward 8, no overshoot');
  assert.ok(seen[Math.round(0.3 * 60)] > 8 + 0.4 * 12, 'at 0.3 s it is nowhere near its end');
  assert.equal(r.tiles.get('hvpg', NaN), 8, 'it lands exactly');
  assert.equal(r.busy(), false, 'and the frames stop');
});

test('the number, the bar and the start ring have the same curve at 60 and 120 Hz', () => {
  const run = (hz) => {
    const r = rig(hz);
    r.tiles.set('hvpg', 20, hvpg.small, false); r.tiles.set('hvpg', 6, hvpg.small, false, true);
    r.tiles.set('hvpg', 8, hvpg.small, true); r.tiles.set('hvpg', 12, hvpg.small, true, true);
    r.wait(400);
    return [r.tiles.get('hvpg', NaN), r.tiles.get('hvpg', NaN, true)];
  };
  const [a, b] = run(60), [c, d] = run(120);
  assert.ok(Math.abs(a - c) < 1e-6 && Math.abs(b - d) < 1e-6, `${a} ${c} ${b} ${d}`);
});

test('a kept card\'s 150 ms polls of a moving model are followed without restarting: the shown speed is continuous', () => {
  const r = rig();
  r.tiles.set('hvpg', 20, hvpg.small, false);
  const shown = [];
  r.state.on(() => shown.push(r.tiles.get('hvpg', NaN)));
  let model = 20;
  for (let f = 0; f < 120; f++) {
    if (f % 9 === 0) { model = 20 - 12 * Math.min(1, f / 90); r.tiles.set('hvpg', model, hvpg.small, true); }   // (a poll every 150 ms of a model easing 20 to 8 in 1.5 s)
    r.frame();
  }
  let maxJerk = 0;
  for (let i = 2; i < shown.length; i++) maxJerk = Math.max(maxJerk, Math.abs((shown[i] - shown[i - 1]) - (shown[i - 1] - shown[i - 2])));
  assert.ok(maxJerk < 0.06, `speed changes by at most ${maxJerk.toFixed(4)} per frame: no restart at a poll`);
  assert.ok(shown.at(-1) < shown[40], 'and it keeps going down');
  // (The old way aimed a fresh 280 ms ease-in-out at each poll: its first frames after a poll moved at about nothing.)
  const lag = r.tiles.get('hvpg', NaN) - model;
  assert.ok(lag >= 0 && lag < 12 * 0.5, `it trails the model by under half the move: ${lag}`);
});

test('a value shown at once is shown at once, and a jump of the model is glided across', async () => {
  const { noteJump } = await import('../src/ui/display-state.js');
  const r = rig();
  r.tiles.set('lsm', 12, 0.01, false);
  assert.equal(r.tiles.set('lsm', 30, 0.01, false), 30, 'glide false: the new value now');
  assert.equal(r.tiles.get('lsm', NaN), 30);
  noteJump();
  assert.equal(r.tiles.set('lsm', 12, 0.01, true), 30, 'across a jump of the model it still glides (a slide\'s change always did)');
  r.wait(150);
  const mid = r.tiles.get('lsm', NaN);
  assert.ok(mid < 30 && mid > 12, `${mid}`);
});

test('a missing value is not followed, and its followers are let go', () => {
  const r = rig();
  r.tiles.set('plt', 150, 0.5, false);
  assert.equal(r.tiles.set('plt', null, 0.5, true), null);
  assert.equal(r.tiles.get('plt', 'none'), 'none');
  r.tiles.set('plt', 100, 0.5, true);
  r.tiles.drop('plt');
  assert.equal(r.tiles.get('plt', 'none'), 'none');
});

test('two strips of tiles do not share followers, and the filter is the page\'s (the vessels\' time constant)', () => {
  const state = createShownState({ ask: () => 1 });
  const a = createTileShown(state), b = createTileShown(state);
  a.set('hvpg', 10, 0.05, false); b.set('hvpg', 20, 0.05, false);
  assert.equal(a.get('hvpg', NaN), 10); assert.equal(b.get('hvpg', NaN), 20);
  assert.equal(SHOWN_TAU, 0.2);
});

test('a step of no account is half of the last printed digit or half a pixel of the bar, in the model\'s units', () => {
  for (const k of Object.keys(TILE)) {
    const T = TILE[k], S = SCALE[k], s = tileSmall(T, S);
    assert.ok(s > 0 && Number.isFinite(s), k);
    assert.ok(s * (T.x ?? 1) <= 0.5 * 10 ** -(T.d ?? 1) + 1e-12, `${k}: not over half a digit`);
    if (S) assert.ok(s * (T.x ?? 1) <= 0.005 * Math.abs(S[1] - S[0]) + 1e-12, `${k}: not over half a pixel of a 100 px bar`);
  }
});
