// U3 (13 Nov 2026): one rule for every card: the figure refits clear of an open card and moves only as far as the card makes it;
// the top bars' room is never given up; the upright circuit fills the room between the bars (A4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { figureShift, squeezeBottom, topOverColumn, uprightFitOf } from '../src/ui/card-clear.js';

const mac = (r, l = 0) => ({ t: 60, b: 110, l, r, W: 1440, H: 900 });

test('no card: the figure stays centred; a slide centres it in its columns', () => {
  assert.equal(figureShift(mac(0), 600), 0);
  assert.equal(figureShift(mac(420), 600, true), -210);
});

test('a small card at the side moves the figure only as far as it must (History on a 1440 Mac: 25 px, not 210)', () => {
  // the figure is 584 px wide (+24 clear): centred it spans 428..1012 +12, the card's edge is at 1440 - 420 = 1020
  const shift = figureShift(mac(420), 584 + 24);
  assert.ok(shift > -40 && shift <= 0, `${shift}`);
});

test('a wide card moves the figure just clear of it, never under it, never further than the room centre', () => {
  const ins = mac(512);   // Tests: 500 + 12
  const sw = 600;
  const shift = figureShift(ins, sw);
  const right = 1440 / 2 + shift + sw / 2;
  assert.ok(right <= 1440 - 512 + 0.001, `the figure's right edge ${right} clears the card at 928`);
  assert.ok(shift >= -(ins.r / 2) - 0.001, 'never past the centre of the room the card leaves');
  // a figure as wide as the room gets the room's centre
  assert.equal(figureShift(ins, 1440 - 512), -256);
});

test('a card on the left moves it right, as before', () => {
  assert.equal(figureShift(mac(0, 300), 600), 150);
});

test("a tall sheet gives up cover, never the top bars' room (iPhone: Tests half-open)", () => {
  const ph = { t: 96, b: 560, l: 0, r: 0, W: 390, H: 844 };   // free: 188 px, under 35% of 844
  const b = squeezeBottom(ph);
  assert.equal(b, 844 * 0.65 - 96, 'the figure gets 35%, the pills keep their 96 px');
  assert.ok(844 - ph.t - b >= 844 * 0.35 - 0.001);
  assert.equal(squeezeBottom({ t: 96, b: 200, l: 0, r: 0, W: 390, H: 844 }), 200, 'enough room: untouched');
  assert.equal(squeezeBottom({ t: 700, b: 300, l: 0, r: 0, W: 390, H: 844 }), 0, 'never negative');
});

test('the upright circuit fills the height between the top bar and the view pill, 12 px clear of each', () => {
  const W = 390, H = 844, ins = { t: 86, b: 150, l: 0, r: 0, W, H };
  const vb = [345, -285, 730, 1360], art = [485, -225, 1195, 1035].map((n, i) => (i === 0 ? 685 : n));   // (a box a little narrower than the view box)
  const v = uprightFitOf(ins, W, H, vb, art);
  assert.ok(v && v.k > 0);
  const s0 = Math.min(W / vb[2], H / vb[3]), ox = (W - vb[2] * s0) / 2 - vb[0] * s0, oy = (H - vb[3] * s0) / 2 - vb[1] * s0;
  const top = oy + s0 * (v.y + v.k * art[1]), bot = oy + s0 * (v.y + v.k * art[3]);
  const left = ox + s0 * (v.x + v.k * art[0]), right = ox + s0 * (v.x + v.k * art[2]);
  assert.ok(top >= ins.t + 12 - 0.5 && bot <= H - ins.b - 12 + 0.5, `${top}..${bot}`);
  assert.ok(left >= 12 - 0.5 && right <= W - 12 + 0.5, `${left}..${right}`);
  // it is as large as the room allows: touches the limit on one axis
  const touchesH = Math.abs(top - (ins.t + 12)) < 0.5 || Math.abs(bot - (H - ins.b - 12)) < 0.5;
  const touchesW = Math.abs(left - 12) < 0.5 || Math.abs(right - (W - 12)) < 0.5;
  assert.ok(touchesH || touchesW);
  // centred in the room
  assert.ok(Math.abs((top + bot) / 2 - (ins.t + (H - ins.b)) / 2) < 0.5);
});

test('no room, no fit', () => {
  assert.equal(uprightFitOf({ t: 0, b: 0, l: 0, r: 0, W: 0, H: 0 }, 0, 0, [0, 0, 1, 1], [0, 0, 1, 1]), null);
  assert.equal(uprightFitOf({ t: 400, b: 400, l: 0, r: 0, W: 390, H: 800 }, 390, 800, [0, 0, 730, 1360], [0, 0, 700, 1260]), null);
});

test('a phone on its side: only the top-bar pieces over the figure column cover its top (A11)', () => {
  const ins = { t: 0, b: 75, l: 0, r: 0, W: 844, H: 390 };
  // patient chip x 8..240 (y to 54), key x 565..836 (y to 98), toolbar x 650..836 (y to 52): the column is 422 ± (0.9 * 315 / 2 ... 166) = 256..588
  const tops = [8, 240, 54, 565, 836, 98, 650, 836, 52];
  assert.equal(topOverColumn(tops, ins), 98, 'a key that reaches into the column counts');
  const narrow = topOverColumn([8, 240, 54, 600, 836, 98, 650, 836, 52], ins);
  assert.equal(narrow, 0, 'beside the figure on both sides: the figure takes the full height under it');
  assert.equal(topOverColumn([8, 240, 54, 600, 836, 98], ins, true), 98, 'a slide keeps the whole bar clear');
  assert.equal(topOverColumn([300, 500, 60], { ...ins, t: 20 }), 60, 'a piece over the column counts, and never lowers the inset');
  assert.equal(topOverColumn([], { ...ins, t: 20 }), 20);
});

// 16 Nov 2026, camera fit with panels open: the room is the largest free rectangle, not four edges each at the furthest card.
import { largestFreeRect, roomiest, roomScore } from '../src/ui/card-clear.js';
test('Tests alone in a tall window: the figure takes the room beside the 560 px card, not the strip under it (C9)', () => {
  // 1250 x 1043 stage: top bar 64, vitals dock band 130; Tests 500 wide from the right (12 px margin), 560 high from the top bar.
  const W = 1250, H = 1043, tests = [738, 66, 1238, 626];
  const fr = largestFreeRect(W, H, 64, 130, [tests]);
  assert.equal(fr.r, W - 738, 'the free room ends where the card begins');
  assert.equal(fr.l, 0);
  assert.equal(fr.t, 64);
  assert.equal(fr.b, 130, 'full height down to the dock');
  const strip = roomScore(W, H - 626 - 8 - 130);
  assert.ok(fr.score > 2 * strip, 'much roomier than the strip under the card');
});
test('Treat at the top right over a Tests sheet across the bottom: the gap beside Treat wins (issue 9)', () => {
  const W = 1440, H = 900, treat = [1028, 60, 1428, 400];
  const fr = largestFreeRect(W, H, 56, 460, [treat]);   // (Tests as the bottom band: 460 px)
  assert.equal(fr.l, 0);
  assert.equal(fr.r, W - 1028);
  assert.equal(fr.b, 460);
  assert.ok(fr.score > roomScore(W, H - 56 - 460 - (400 - 56)), 'beats the 130 px strip under Treat');
});
test('no side card: the room is the whole stage between the bands', () => {
  assert.deepEqual(largestFreeRect(800, 600, 50, 100, []), { l: 0, t: 50, r: 0, b: 100, score: roomScore(800, 450), area: 800 * 450 });
});
test('two cards at the sides with the figure between them: the column between wins', () => {
  const fr = largestFreeRect(1400, 800, 60, 100, [[10, 60, 400, 700], [1000, 60, 1390, 700]]);
  assert.equal(fr.l, 400); assert.equal(fr.r, 400);
});
test('roomiest keeps the edges\' way unless the free rectangle is clearly roomier, and leaves a phone alone', () => {
  const edges = () => ({ t: 64, b: 130, l: 0, r: 512, W: 1250, H: 1043 });
  const tall = roomiest({ ...edges(), r: 0, t: 634 }, 1250, 1043, 64, 130, [[738, 66, 1238, 626]]);
  assert.deepEqual([tall.l, tall.t, tall.r, tall.b], [0, 64, 512, 130], 'the strip under the card gives way to the room beside it');
  const same = roomiest(edges(), 1250, 1043, 64, 130, [[738, 66, 1238, 977]]);
  assert.deepEqual([same.l, same.t, same.r, same.b], [0, 64, 512, 130], 'a card to the bottom: the edges\' way already is the free room');
  const phone = { t: 96, b: 400, l: 0, r: 0, W: 390, H: 844 };
  assert.deepEqual(roomiest({ ...phone }, 390, 844, 96, 400, []), phone, 'no side card, no change');
});
