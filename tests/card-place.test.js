// The action card for a vessel never lies over that vessel, wherever the vessel runs, on any window size,
// whenever there is a clear spot for it at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeCard, coverCount, vesselPoints } from '../src/ui/card-place.js';

const VIEWS = [
  { name: 'Mac', W: 1440, H: 900, panel: false },
  { name: 'small Mac', W: 1180, H: 820, panel: false },
  { name: 'iPad landscape', W: 1180, H: 820, panel: true },
  { name: 'iPad portrait', W: 820, H: 1180, panel: true },
  { name: 'iPad mini portrait', W: 768, H: 1024, panel: true },
];
const CARD = { w: 300, h: 560 };

// Vessels of every shape: straight in every direction, arcs, and S-bends, all over the figure.
function vessels(W, H) {
  const out = [];
  for (const fx of [0.2, 0.5, 0.8]) for (const fy of [0.25, 0.5, 0.75]) {
    const cx = W * fx, cy = H * fy;
    for (let k = 0; k < 8; k++) {
      const th = (k * Math.PI) / 8, L = 120 + 40 * k;
      out.push({ path: [[cx - Math.cos(th) * L / 2, cy - Math.sin(th) * L / 2], [cx + Math.cos(th) * L / 2, cy + Math.sin(th) * L / 2]], r: 3 + k });
    }
    const arc = [], s = [];
    for (let i = 0; i <= 20; i++) { const t = (i / 20) * Math.PI; arc.push([cx + 110 * Math.cos(t), cy + 80 * Math.sin(t)]); s.push([cx - 150 + 15 * i, cy + 60 * Math.sin(t * 2)]); }
    out.push({ path: arc, r: 6 }, { path: s, r: 10 });
  }
  return out.map((v) => ({ ...v, x: v.path[Math.floor(v.path.length / 2)][0], y: v.path[Math.floor(v.path.length / 2)][1] }));
}

for (const V of VIEWS) test(`vessel card stays off its vessel: ${V.name}`, () => {
  const box = { top: 64, bottom: V.H - 80, right: V.W - 8 };
  const fig = { x0: V.W * 0.1, y0: 60, x1: V.W * 0.9, y1: V.H - 60 };
  let checked = 0;
  for (const a of vessels(V.W, V.H)) {
    const p = placeCard(a, CARD.w, CARD.h, box, fig, V.panel);
    assert.ok(p.x >= 8 && p.x + CARD.w <= box.right + 0.5, `card off the right/left edge at ${p.x}`);
    assert.ok(p.y >= box.top && p.y + CARD.h <= box.bottom + 0.5, `card off the top/bottom edge at ${p.y}`);
    // Is any clear spot there at all? (Brute force over the free area.)
    const pts = vesselPoints(a);
    let free = false;
    for (let x = 8; x <= box.right - CARD.w && !free; x += 8) for (let y = box.top; y <= box.bottom - CARD.h && !free; y += 8) if (!coverCount(pts, x, y, CARD.w, CARD.h, a.r)) free = true;
    if (!free) continue;
    checked++;
    assert.equal(coverCount(pts, p.x, p.y, CARD.w, CARD.h, a.r), 0, `card covers the vessel through ${JSON.stringify(a.path[0])} on ${V.name}`);
  }
  assert.ok(checked > 50, `too few vessels had a clear spot (${checked})`);
});

test('a braided bed: the card keeps clear of every strand, not only the trunk', () => {
  const trunk = [[500, 300], [500, 600]], strand = [[500, 300], [700, 450], [500, 600]];
  const a = { x: 500, y: 450, path: [...trunk, ...strand], lines: [trunk, strand], r: 4 };
  const p = placeCard(a, 300, 400, { top: 60, bottom: 860, right: 1430 }, null, false);
  assert.equal(coverCount(vesselPoints(a), p.x, p.y, 300, 400, 4), 0);
});

test('an organ card keeps its old rule (covers as little as it can, not barred)', () => {
  const path = [];
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) path.push([200 + i * 250, 100 + j * 180]);
  const p = placeCard({ x: 700, y: 460, path }, 300, 560, { top: 60, bottom: 860, right: 1430 }, null, false);
  assert.equal(p.cover, 0);   // organs never report a vessel cover
});
