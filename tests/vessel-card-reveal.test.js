// F9 (play-test, iPhone 375 x 812, 17 Nov 2026): a TIPS placed, only the stent's card open (it covers the lower part of the phone), and the stent stayed behind
// the card's top edge instead of being panned into the room left above. The rule is one pure sum (card-clear.js revealDelta); the camera applies it from where the view
// is GOING (stage-fit.js reveal) and again whenever the camera moves by itself (pps:reframed), so a card's pan or a refit cannot throw it away.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { unsnap } from './unsnap.js';
import { revealDelta } from '../src/ui/card-clear.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => unsnap(readFileSync(join(root, f), 'utf8'));
const between = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));

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

test('the camera judges the vessel from where the view is going, notes what it did, and is asked again when the camera moves by itself', () => {
  const fit = read('src/ui/stage-fit.js');
  const rv = between(fit, 'function reveal(sel, insetBottom) {', 'function unreveal()');
  assert.match(rv, /live\.vtGliding && live\.vtTarget \? live\.vtTarget : live\.vt/, 'from the view\'s goal, not the position a glide is leaving');
  assert.match(rv, /revealDelta\(/);
  assert.match(rv, /note\(\{ why: dx \|\| dy \? 'pan' : 'inside'/, 'pps.revealLast says what came of the last ask');
  assert.match(fit, /const reframed = \(\) => dispatchEvent\(REFRAMED\);/);
  assert.equal((fit.match(/reframed\(\);/g) || []).length, 2, 'a refit and a card\'s pan');
  assert.match(read('src/ui/stage-tubes.js'), /animateVT\(d, 400, OPT_STEADY\); dispatchEvent\(REFRAMED\);/, 'and the home look');
  const card = read('src/ui/card.js');
  assert.match(card, /addEventListener\('pps:reframed', \(\) => \{ if \(isDocked\(\) && model\) reveal\(\); \}\);/);
  assert.match(card, /const endIn = \(\) => \{ el\.classList\.remove\('ac-in'\); if \(isDocked\(\)\) reveal\(\); \};/, 'and once the card has come in and its size is final');
});
