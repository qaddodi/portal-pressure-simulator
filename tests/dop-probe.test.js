// The Doppler probe on the figure (19 Oct, Mohammad's pick "B1 + white"; marks as a scanner draws them, from his textbook reference
// of 20 Oct): a small curved probe stands off the sampled vessel; its line of sight runs straight through the vessel, the sample
// volume's two bars (white on a black rim) cross it inside the lumen, and the flow axis marks the gate (no arc or θ on the figure: the monitor names θ), at the
// vessel's middle or a stent's sampled third. The beam meets the flow at the monitor's θ 50°, from the side the
// flow comes toward (away for the hepatic veins and the IVC, as the trace draws them). The vessel's glow turned from the
// Doppler's green (which reads as "normal") to white on the dark themes and ink on the light ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AWAY, probePose, probeShapes, gateDims, bodyBox, beamBoxes, gateBoxes, PROBE, PROBE_SVG } from '../src/ui/dop-probe.js';

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

test('the beam meets the flow at θ 50°, under the papers\' 60° limit, from the side the flow comes toward (away for a hepatic vein)', () => {
  assert.equal(PROBE.ANGLE, 50);
  const cos = Math.cos(PROBE.ANGLE * Math.PI / 180);
  for (const deg of [0, 37, 128, 200, 300]) {
    const t = dirOf(deg), g = [600, 400];
    for (const away of [false, true]) {
      const p = probePose({ g, t: [t[0] * 5, t[1] * 5], r: 10, away, w: W, h: H });
      const b = dirOf(p.ang), dot = t[0] * b[0] + t[1] * b[1];
      assert.ok(Math.abs(dot - (away ? -cos : cos)) < 1e-9, `flow ${deg}°, away ${away}: cos = ${dot}`);
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

test('as on the scanner: the line of sight runs through the vessel, the two bars cross it inside the lumen, the axis meets it at θ', () => {
  for (const r of [3, 10, 30]) {
    const { at, half } = gateDims(r), chord = r / Math.sin(PROBE.ANGLE * Math.PI / 180);
    assert.ok(half >= 5 && half <= 10);
    assert.ok(r < 6 || at < chord, `r ${r}: the bars sit inside the lumen along the line (${at} < ${chord})`);
    // (the gate is half the vessel's width long, in its middle, the Polish Ultrasound Society's setting)
    assert.ok(r < 8 || Math.abs(2 * at - r) < 1e-9, `r ${r}: the gate is half the vessel's width (${2 * at} vs ${r})`);
    for (const phi of [PROBE.ANGLE, -PROBE.ANGLE]) {
      const s = probeShapes(PROBE.GAP + r, r, phi);
      // The line of sight: from the probe's face to the near gate bar (Mohammad, 20 Oct: it stops where the bars start).
      const [, x0, y0, x1, y1] = s.beam.match(/^M(-?[\d.]+) (-?[\d.]+) L(-?[\d.]+) (-?[\d.]+)$/).map(Number);
      assert.equal(x0, PROBE.GAP + r); assert.equal(y0, 0); assert.equal(y1, 0);
      assert.ok(Math.abs(x1 - at) < 0.06, 'it stops at the near bar');
      // The bars: across the line (each at one x), either side of the gate.
      const xs = [...s.gate.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => +m[1]);
      assert.deepEqual([...new Set(xs)].sort((a, b) => a - b), [-at, at].map((v) => +v.toFixed(1)));
      // The axis through the gate at phi from the line, and nothing more: no arc and no θ on the figure (Mohammad, 20 Oct).
      const [ax, ay, bx, by] = s.axis.match(/^M(-?[\d.]+) (-?[\d.]+) L(-?[\d.]+) (-?[\d.]+)$/).slice(1).map(Number);
      assert.ok(Math.abs(ax + bx) < 0.2 && Math.abs(ay + by) < 0.2, 'centred on the gate');
      assert.ok(Math.abs(Math.atan2(by, bx) * 180 / Math.PI - phi) < 1);
      assert.equal(s.theta, undefined);
      assert.equal(s.head, `translate(${PROBE.GAP + r} 0)`);
    }
  }
  const b = bodyBox([0, 0], 0, 80);
  assert.deepEqual([b.x0, b.x1, b.y0, b.y1], [77, 80 + PROBE.LEN, -PROBE.HALF, PROBE.HALF]);
});

test('the angle marked is the one between the line of sight and the flow axis, on either side and for flow away', () => {
  const t = [0.612, 0.791];
  for (const away of [false, true]) for (const side of [1, -1]) {
    const p = probePose({ g: [600, 400], t, r: 12, away, w: W, h: H, side });
    // The axis ray at phi from the line (in the probe's frame) is the flow direction, or its reverse, θ from the line on screen.
    const ray = dirOf(p.ang + p.phi), flow = unit(t), dot = ray[0] * flow[0] + ray[1] * flow[1];
    assert.ok(Math.abs(Math.abs(dot) - 1) < 1e-9, `away ${away}, side ${side}: the marked ray lies along the flow`);
    assert.equal(Math.abs(p.phi), PROBE.ANGLE);
  }
});

test('the figure places the gate where the callout points (the middle of the vessel) or on the stent\'s sampled third', () => {
  assert.match(stage, /const key = `\$\{id\}\|\$\{dop\.seg\}`, u = dop\.seg \? STENT_SITES\[dop\.seg\] : null;/);
  assert.match(stage, /u == null \? arcMid\(pts\) : pointAt\(pts, u\)/);
  // It follows the camera with the labels, and the labels keep clear of its body.
  assert.equal((stage.match(/^\s*dprobePaint\(\);$/gm) || []).length, 4, 'view change, zoom glide, labels laid out, Doppler set');
  assert.match(stage, /if \(dpr\.on && dpr\.box\) out\.push\(dpr\.box, \.\.\.dpr\.marks\);/);
  // It hides while the views morph and in the liver's own views, and moves by fading out and back in.
  assert.match(stage, /\(morph < 0\.01 \|\| morph > 0\.99\) && !camMove && !st\.lobule && !st\.sinusoid && !lz\?\.isOpen\(\)/);
  assert.match(css, /\.dop-probe \{[^}]*transition: opacity \.36s var\(--ease\)/);
  assert.match(css, /\.dop-probe\.off \{ opacity: 0; \}/);
});

test('every mark and the probe are white-lined on a black rim, with no θ on the figure; the glow and the light share the Doppler glow colour', () => {
  assert.match(css, /\.dpr-gate-rim \{ fill: none; stroke: var\(--dop-rim\); stroke-width: 4\.6;/);
  assert.match(css, /\.dpr-rim-l \{ fill: none; stroke: var\(--dop-rim\);/);
  assert.match(css, /\.dpr-line \{ fill: none; stroke: var\(--dop-mark\);/);
  for (const src of [css, stage, PROBE_SVG]) assert.doesNotMatch(src, /dpr-theta|θ<\/text>/);
  assert.match(css, /\.dpr-gate \{ fill: none; stroke: var\(--dop-mark\); stroke-width: 2\.4;/);
  assert.match(tokens, /--dop-mark: #FFFFFF; --dop-rim: #000000;/);
  assert.match(stage, /setGlowSrc\('dop', id \? \[\{ id, col: 'var\(--dop-glow\)'/);
  assert.match(read('src/ui/presenter.js'), /glow\.set\(v, '--dop-glow'\)/);
  // White on both dark blocks (the system's dark and the chosen dark), ink on the light themes.
  assert.equal((tokens.match(/--doppler: #3EE0A5; --dop-glow: #F4F6FF;/g) || []).length, 2);
  assert.match(tokens, /--dop-glow: #1F2433;/);
});

test('the monitor names the probe\'s angle and gate', () => {
  assert.match(read('src/ui/dopplerColor.js'), /export const THETA = PROBE\.ANGLE;/);
  assert.match(doppler, /`θ \$\{THETA\}°`, `SV \$\{svMm\(\)\} mm`/);
  assert.match(doppler, /return clamp\(Math\.round\(d \/ 2\), 2, 15\);/);
});

test('the probe and its line of sight take the side clear of the labels and callouts, and sit beneath them where none is', () => {
  const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const g = [600, 400], t = [1, 0], r = 10;
  for (const s of [1, -1]) {
    // A label on one side's marks (its line of sight, then its body): the probe takes the other side, whose marks touch no label.
    const first = probePose({ g, t, r, w: W, h: H, side: s });
    for (const lab of [beamBoxes(g, first.ang, first.D, r)[Math.round(beamBoxes(g, first.ang, first.D, r).length * 0.6)], first.box]) {
      const label = { x0: lab.x0 - 2, y0: lab.y0 - 2, x1: lab.x1 + 2, y1: lab.y1 + 2 };
      const p = probePose({ g, t, r, w: W, h: H, avoid: [label] });
      assert.equal(p.side, -s);
      assert.ok(![p.box, ...beamBoxes(g, p.ang, p.D, r)].some((b) => hit(b, label)), 'no mark under the label');
      // A kept side moves off a label when the other side is clear, and stays when both are crossed.
      assert.equal(probePose({ g, t, r, w: W, h: H, avoid: [label], keep: s }).side, -s);
      const other = probePose({ g, t, r, w: W, h: H, side: -s }).box;
      assert.equal(probePose({ g, t, r, w: W, h: H, avoid: [label, other], keep: s }).side, s);
    }
  }
  // Cards still come first: a side clear of the cards wins over one clear of the labels.
  const up = probePose({ g, t, r, w: W, h: H, side: 1 }), down = probePose({ g, t, r, w: W, h: H, side: -1 });
  assert.equal(probePose({ g, t, r, w: W, h: H, cards: [up.box], avoid: [down.box] }).side, -1);
  // The labels keep off the line of sight too, and the probe is drawn beneath the labels' layer (and the callouts above it).
  assert.match(stage, /out\.push\(dpr\.box, \.\.\.dpr\.marks\)/);
  assert.match(stage, /labelSvg\.before\(el\); dpr\.el = el/);
  assert.match(stage, /avoid: dprAvoid\(\)/);
});

test('in a deck the probe shows only once the zoom has settled: hidden while the camera moves, repainted when it lands', () => {
  assert.match(stage, /morph > 0\.99\) && !camMove && !st\.lobule/);
  assert.match(stage, /camMove = false;\s*if \(F\) updateLabels\(F\);/);
});

test('the line of sight stops at the near gate bar, the flow axis reaches past both bars, and the bars are a bit thicker than the axis line', () => {
  for (const r of [3, 10, 20]) {
    const { at, half } = gateDims(r), p = probeShapes(90, r);
    assert.equal(p.beam, `M90 0 L${+at.toFixed(1)} 0`);
    const [x0, y0, x1, y1] = p.axis.match(/-?[\d.]+/g).map(Number);
    assert.ok(Math.hypot(x1 - x0, y1 - y0) / 2 > Math.hypot(at, half) + 4, `axis longer than the bars reach at r ${r}`);
  }
  const w = (sel) => +css.match(new RegExp(`\\.dop-probe \\.${sel} \\{[^}]*stroke-width: ([\\d.]+)`))[1];
  assert.ok(w('dpr-gate') > w('dpr-line') && w('dpr-gate') <= 2 * w('dpr-line'), 'bars a bit thicker than the axis line');
  assert.ok(w('dpr-gate-rim') > w('dpr-gate'));
  // The axis line is drawn over the bars, so it stays visible through them.
  assert.ok(PROBE_SVG.indexOf('dpr-bars') < PROBE_SVG.indexOf('dpr-axis'), 'bars first, the flow axis over them');
});

test('the station dot under the gate fades with the probe: out while it shows on that vessel, back when it goes; the reading and leader stay', () => {
  assert.match(css, /\.lb-leaders > \.dpr-hid \{ opacity: 0; transition-duration: \.36s; \}/);
  assert.match(stage, /dpr\.gate = \[gx, gy\];\n\s+if \(!dpr\.on\) \{ dpr\.on = true; dpr\.el\.classList\.remove\('off'\); \}\n\s+dprDots\(\);/);
  assert.match(stage, /const g = \(dpr\.on \|\| dpr\.swap\) && dpr\.gate;/);
  assert.match(stage, /if \(!\/\^\(d\|h\):\/\.test\(k\)\) continue;/, 'only the anchor dots and their discs, never a leader');
  assert.match(stage, /Math\.hypot\(\+a\.cx - g\[0\], \+a\.cy - g\[1\]\) < 6/);
  assert.match(stage, /\n\s+dprDots\(\);\n\s+for \(const \[k, el\] of leadEls\) \{\n\s+if \(keep\.has\(k\)/, 'leaders painted: dots read the probe state');
  assert.equal((stage.match(/dpr\.gate = null; dprDots\(\);/g) || []).length, 2, 'hidden probe: the dot returns');
});

test('with neither side clear the probe comes in closer, and hides only when no place fits', () => {
  const g = [600, 400], t = [1, 0], r = 8, far = (s) => probePose({ g, t, r, w: W, h: H, side: s }).box;
  const p = probePose({ g, t, r, w: W, h: H, cards: [far(1), far(-1)].map((b) => ({ ...b, y0: b.y0, y1: b.y1, x0: b.x0, x1: b.x1 })).map((b) => ({ ...b, ...(b.y0 < g[1] ? { y1: Math.min(b.y1, b.y0 + 30) } : { y0: Math.max(b.y0, b.y1 - 30) }) })) });
  assert.ok(p.reach > 0 && p.clear && !p.none);
  assert.ok(probePose({ g, t, r, w: W, h: H, cards: [{ x0: 0, y0: 0, x1: W, y1: H }] }).none);
});

test('the faded ultrasound beam is back: a narrow wedge from the probe\'s face past the vessel, under every mark, fading out', () => {
  for (const r of [3, 10, 20]) {
    const [m, ...pts] = probeShapes(90, r).wedge.match(/-?[\d.]+/g).map(Number);
    assert.equal(m, 90, 'starts at the probe\'s face');
    const [x1, y1, x2, y2] = pts.slice(1);
    assert.ok(x1 < 0 && x1 === x2 && y1 === -y2 && y2 > 0, 'ends past the far wall, symmetric about the line of sight');
    assert.ok(Math.atan(y2 / (90 - x1)) * 180 / Math.PI <= PROBE.BEAM_DEG + 0.5, 'narrow');
  }
  assert.ok(PROBE_SVG.indexOf('dpr-wedge"/>') < PROBE_SVG.indexOf('dpr-gate-rim'), 'drawn first, under the marks');
  assert.match(PROBE_SVG, /<stop offset="1" stop-color="var\(--dop-glow\)" stop-opacity="0"\/>/, 'fades to nothing');
  assert.match(css, /\.dop-probe \.dpr-wedge \{ fill: url\(#dpr-wedge\); \}/);
  assert.match(stage, /all\('\.dpr-wedge', 'd', p\.wedge\)/);
});

test('the probe stands clear of a narrowing\'s "60 %": its flow axis counts with the line of sight, and the label is one the probe weighs', () => {
  const g = [600, 400], t = [1, 0], r = 8;
  const a = probePose({ g, t, r, w: W, h: H, side: 1 }), axis = gateBoxes(g, a.ang, a.phi, r);
  assert.ok(axis.length > 3 && axis.every((b) => Math.hypot((b.x0 + b.x1) / 2 - g[0], (b.y0 + b.y1) / 2 - g[1]) <= 36 + 1));
  const label = { ...axis[0], x0: axis[0].x0 + 1, y0: axis[0].y0 + 1 };
  const side = probePose({ g, t, r, w: W, h: H, avoid: [label] });
  assert.ok(side.lab === 0 || side.side !== a.side, 'the side whose axis crosses the label is left when the other is clear');
  assert.match(stage, /querySelectorAll\('\.clamp-label'\)\) if \(el\._box\) out\.push\(el\._box\);/);
  assert.match(stage, /dpr\.marks = \[\.\.\.beamBoxes\(\[gx, gy\], pose\.ang, pose\.D, r\), \.\.\.gateBoxes\(\[gx, gy\], pose\.ang, pose\.phi, r\)\];/);
});
