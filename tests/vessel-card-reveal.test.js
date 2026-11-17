// F9 (play-test, iPhone 375 x 812, 17 Nov 2026): a TIPS placed, only the stent's card open (it covers the lower part of the phone), and the stent stayed behind
// the card's top edge instead of being panned into the room left above. The rule is one pure sum (card-clear.js revealDelta); the camera applies it from where the view
// is GOING (stage-fit.js reveal) and again whenever the camera moves by itself (pps:reframed), so a card's pan or a refit cannot throw it away.
import test from 'node:test';
import assert from 'node:assert/strict';
import { revealDelta } from '../src/ui/card-clear.js';


const DEVICES = [['iPhone 375 x 812', 375, 812], ['iPhone SE 320 x 568', 320, 568], ['iPhone landscape 812 x 375', 812, 375], ['iPad portrait 768 x 1024', 768, 1024], ['iPad landscape 1024 x 768', 1024, 768], ['Mac 1440 x 900', 1440, 900]];
const COVERS = [0.2, 0.35, 0.5, 0.6, 0.7];   // (the share of the height a bottom sheet covers)

test('the selected vessel ends inside the free room for every card height on every device size', () => {
  let n = 0;
  for (const [name, W, H] of DEVICES) for (const c of COVERS) {
    const top = Math.max(44, 100 + 12), bottom = H - H * c - 18, side = 18;
    if (bottom - top < 80) continue;   // (no room: the card is too tall for any pan to help; reveal leaves the view alone)
    const room = { top, bottom, left: side, right: W - side };
    for (let y = -50; y <= H + 50; y += 37) for (let x = -50; x <= W + 50; x += 53) for (const [vw, vh] of [[10, 10], [90, 60], [60, 160], [200, 40], [W * 1.2, 80], [100, H]]) {
      const box = { x0: x - vw / 2, x1: x + vw / 2, y0: y - vh / 2, y1: y + vh / 2 }, mid = { x, y };
      const { dx, dy } = revealDelta(box, mid, room);
      const fitsX = vw <= room.right - room.left, fitsY = vh <= room.bottom - room.top;
      const nx0 = box.x0 + dx, nx1 = box.x1 + dx, ny0 = box.y0 + dy, ny1 = box.y1 + dy;
      const tag = `${name} cover ${c} at ${x},${y} ${vw}x${vh}`;
      if (fitsY) assert.ok(ny0 >= room.top - 1e-6 && ny1 <= room.bottom + 1e-6, `the whole vessel is above the card: ${tag}`);
      else assert.ok(y + dy >= room.top - 1e-6 && y + dy <= room.bottom + 1e-6, `a vessel too long keeps its middle above the card: ${tag}`);
      if (fitsX) assert.ok(nx0 >= room.left - 1e-6 && nx1 <= room.right + 1e-6, `across: ${tag}`);
      else assert.ok(x + dx >= room.left - 1e-6 && x + dx <= room.right + 1e-6, `across, the middle: ${tag}`);
      n++;
    }
  }
  assert.ok(n > 5000, `${n} cases`);
});

test('a vessel already inside the room is not moved, and the move is never more than needed', () => {
  const room = { top: 112, bottom: 400, left: 18, right: 357 };
  assert.deepEqual(revealDelta({ x0: 100, x1: 200, y0: 150, y1: 250 }, { x: 150, y: 200 }, room), { dx: 0, dy: 0 });
  assert.deepEqual(revealDelta({ x0: 100, x1: 200, y0: 350, y1: 450 }, { x: 150, y: 400 }, room), { dx: 0, dy: -50 }, 'just clear of the card');
  assert.deepEqual(revealDelta({ x0: 100, x1: 200, y0: 60, y1: 100 }, { x: 150, y: 80 }, room), { dx: 0, dy: 52 }, 'just under the top bar');
});

test('two cards open (the vessel\'s on the left, Tests on the right, Mac 1024 x 768): the vessel, or failing that its middle, goes into the gap between them (F27)', () => {
  const W = 1024, top = 112, bottom = 768 - 130 - 18;
  const room = { top, bottom, left: 312 + 12, right: W - (500 + 12) };   // (the gap is about 200 px: narrower than the sizing rule's 360, which does not apply to a pan)
  assert.ok(room.right - room.left > 150 && room.right - room.left < 360);
  for (let x = -100; x <= W + 100; x += 31) {
    const small = revealDelta({ x0: x - 40, x1: x + 40, y0: 300, y1: 360 }, { x, y: 330 }, room);
    assert.ok(x - 40 + small.dx >= room.left - 1e-6 && x + 40 + small.dx <= room.right + 1e-6, `a short vessel (the stent) sits wholly in the gap, from x ${x}`);
    const long = revealDelta({ x0: x - 150, x1: x + 150, y0: 300, y1: 360 }, { x, y: 330 }, room);
    assert.ok(x + long.dx >= room.left - 1e-6 && x + long.dx <= room.right + 1e-6, `a vessel wider than the gap keeps its middle in it, from x ${x}`);
  }
});

test('a card that grows or moves after the pan was worked out: the pan is worked out again from the room it leaves, same zoom (F32, iPad 1024 x 768)', () => {
  const top = 112, bottom = 768 - 130 - 18, W = 1024;
  // the stent sits in the gap the stent card (left, 312) and the Tests card (right, 400) leave; the instrument card then grows to 470
  const before = { top, bottom, left: 312 + 12, right: W - (400 + 12) }, after = { top, bottom, left: 312 + 12, right: W - (470 + 12) };
  const box = { x0: 470, x1: 590, y0: 300, y1: 360 }, mid = { x: 530, y: 330 };
  assert.deepEqual(revealDelta(box, mid, before), { dx: 0, dy: 0 }, 'inside the room it had: no pan');
  const grown = revealDelta(box, mid, after);
  assert.ok(grown.dx < 0, 'the room shrank on the right: the stent pans left, into what is left');
  assert.ok(box.x1 + grown.dx <= after.right + 1e-6 && box.x0 + grown.dx >= after.left - 1e-6, 'and lands whole inside it');
});
