// The Doppler probe on the figure (19 Oct, Mohammad's pick "B1 + white"): a small curved probe stands off the sampled vessel and
// looks at it along a narrow beam; the sample gate (two white bars on a black rim) sits across the beam in the middle of the
// lumen, at the vessel's middle or a stent's sampled third. The beam meets the flow at the monitor's θ 60°, from the side the
// flow comes toward (away for the hepatic veins and the IVC, as the trace draws them). The vessel's glow turned from the
// Doppler's green (which reads as "normal") to white on the dark themes and ink on the light ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AWAY, probePose, probeShapes, gateDims, bodyBox, PROBE } from '../src/ui/dop-probe.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const stage = read('src/ui/stage.js'), doppler = read('src/ui/doppler.js'), css = read('styles/app.css'), tokens = read('styles/tokens.css');
const unit = (v) => { const n = Math.hypot(v[0], v[1]); return [v[0] / n, v[1] / n]; };
const dirOf = (deg) => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)];
const W = 1200, H = 800;

test('the probe knows which vessels drain away from it, as the Doppler trace does', () => {
  const away = [...doppler.matchAll(/\{ id: '(\w+)'[^}]*away: true \}/g)].map((m) => m[1]).sort();
  assert.ok(away.length >= 4);
  assert.deepEqual([...AWAY].sort(), away);
});

test('the beam meets the flow at 60°, from the side the flow comes toward (away for a hepatic vein)', () => {
  for (const deg of [0, 37, 128, 200, 300]) {
    const t = dirOf(deg), g = [600, 400];
    for (const away of [false, true]) {
      const p = probePose({ g, t: [t[0] * 5, t[1] * 5], r: 10, away, w: W, h: H });
      const b = dirOf(p.ang), dot = t[0] * b[0] + t[1] * b[1];
      assert.ok(Math.abs(dot - (away ? -0.5 : 0.5)) < 1e-9, `flow ${deg}°, away ${away}: cos = ${dot}`);
      assert.equal(p.D, PROBE.GAP + 10, 'the face stands off the wall, not on the vessel');
    }
  }
});

test('the probe takes the side that is on screen and clear of the cards, and keeps its side while that stays clear', () => {
  const t = unit([0.612, 0.791]);
  // Near the top edge, the side above the vessel would put the body off screen.
  const top = probePose({ g: [600, 60], t, r: 12, w: W, h: H });
  assert.ok(top.clear && top.box.y0 >= PROBE.EDGE, 'off the top edge, it stands below');
  // A card over one side sends it to the other.
  const free = probePose({ g: [600, 400], t, r: 12, w: W, h: H });
  const card = { x0: free.box.x0 - 10, y0: free.box.y0 - 10, x1: free.box.x1 + 10, y1: free.box.y1 + 10 };
  const moved = probePose({ g: [600, 400], t, r: 12, w: W, h: H, cards: [card] });
  assert.equal(moved.side, -free.side);
  assert.ok(moved.clear);
  // Kept: with both sides clear it stays where it stood, and a card over its side only moves it when the other side is clear.
  assert.equal(probePose({ g: [600, 400], t, r: 12, w: W, h: H, keep: -free.side }).side, -free.side);
  const both = [card, { ...moved.box }];
  assert.equal(probePose({ g: [600, 400], t, r: 12, w: W, h: H, cards: both, keep: free.side }).side, free.side);
  assert.equal(probePose({ g: [600, 400], t, r: 12, w: W, h: H, side: -1 }).side, -1);
});

test('the gate straddles the middle of the lumen across the beam; the beam runs from the probe face past the far wall', () => {
  for (const r of [3, 10, 30]) {
    const { half, gap } = gateDims(r), s = probeShapes(PROBE.GAP + r, r);
    assert.ok(half >= 6 && half <= 12 && gap >= 5 && gap <= 10);
    const xs = [...s.gate.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => +m[1]);
    assert.deepEqual([...new Set(xs)].sort((a, b) => a - b), [-gap / 2, gap / 2].map((v) => +v.toFixed(1)));
    assert.match(s.beam, new RegExp(`^M${PROBE.GAP + r} 0 L-${r + 10} `));
    assert.equal(s.head, `translate(${PROBE.GAP + r} 0)`);
  }
  const b = bodyBox([0, 0], 0, 80);
  assert.deepEqual([b.x0, b.x1, b.y0, b.y1], [77, 80 + PROBE.LEN, -PROBE.HALF, PROBE.HALF]);
});

test('the figure places the gate where the callout points (the middle of the vessel) or on the stent\'s sampled third', () => {
  assert.match(stage, /const key = `\$\{id\}\|\$\{dop\.seg\}`, u = dop\.seg \? STENT_SITES\[dop\.seg\] : null;/);
  assert.match(stage, /u == null \? arcMid\(pts\) : pointAt\(pts, u\)/);
  // It follows the camera with the labels, and the labels keep clear of its body.
  assert.equal((stage.match(/^\s*dprobePaint\(\);$/gm) || []).length, 4, 'view change, zoom glide, labels laid out, Doppler set');
  assert.match(stage, /if \(dpr\.on && dpr\.box\) out\.push\(dpr\.box\);/);
  // It hides while the views morph and in the liver's own views, and moves by fading out and back in.
  assert.match(stage, /\(morph < 0\.01 \|\| morph > 0\.99\) && !st\.lobule && !st\.sinusoid && !lz\?\.isOpen\(\)/);
  assert.match(css, /\.dop-probe \{[^}]*transition: opacity \.36s var\(--ease\)/);
  assert.match(css, /\.dop-probe\.off \{ opacity: 0; \}/);
});

test('the gate and the probe are white-lined on a black rim; the glow, beam and light share the Doppler glow colour', () => {
  assert.match(css, /\.dpr-gate-rim \{ fill: none; stroke: var\(--dop-rim\); stroke-width: 6;/);
  assert.match(css, /\.dpr-gate \{ fill: none; stroke: var\(--dop-mark\); stroke-width: 2\.8;/);
  assert.match(tokens, /--dop-mark: #FFFFFF; --dop-rim: #000000;/);
  assert.match(stage, /setGlowSrc\('dop', id \? \[\{ id, col: 'var\(--dop-glow\)'/);
  assert.match(read('src/ui/presenter.js'), /glow\.set\(v, '--dop-glow'\)/);
  // White on both dark blocks (the system's dark and the chosen dark), ink on the light themes.
  assert.equal((tokens.match(/--doppler: #3EE0A5; --dop-glow: #F4F6FF;/g) || []).length, 2);
  assert.match(tokens, /--dop-glow: #1F2433;/);
});
