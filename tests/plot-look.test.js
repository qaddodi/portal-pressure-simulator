// The rounded plot (his G2 look, 27 Oct: "this rounded look we need to give maybe most of our graphs"): one shape the card's full width,
// its fills clipped to rounded corners, its numbers on it in the FibroScan readings' style, no axis lines. src/ui/plot-look.js is the
// shared piece; the planes draw their zones out to the element's edge with the numbers on the plot, and the curve, flow-time,
// talk and ladder charts put their lines on a rounded panel that holds their numbers.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plotR, plotPanel, PLOT_R } from '../src/ui/plot-look.js';
import { planeOf, frame, bleed, scaler, plotNumbers, PAD, est } from '../src/ui/visual-plane.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../styles/app.css');
const touch = (a, o) => a[0] < o[2] && a[2] > o[0] && a[1] < o[3] && a[3] > o[1];
// (An element builder that keeps what it was given: the test DOM draws no SVG.)
const sv = (tag, attrs = {}, ...kids) => ({ tag, attrs, kids: kids.flat().filter(Boolean) });

test('the plot corner is 10 px, less on a small plot, and a panel is a clip and a rounded rect on the same shape', () => {
  assert.equal(PLOT_R, 10);
  assert.equal(plotR(400, 200), 10);
  assert.equal(plotR(30, 200), 7.5, 'a quarter of the shorter side on a small plot');
  assert.equal(plotR(0, 0), 0);
  const p = plotPanel(sv, 2, 4, 300, 100);
  assert.equal(p.clip.tag, 'clipPath');
  assert.equal(p.clip.attrs.id, p.id);
  assert.equal(p.url, `url(#${p.id})`);
  assert.deepEqual(p.clip.kids[0].attrs, { x: 2, y: 4, width: 300, height: 100, rx: 10 });
  assert.equal(p.back.attrs.class, 'pz-plotbg');
  assert.equal(p.back.attrs.rx, 10);
  assert.equal(plotPanel(sv, 0, 0, 10, 10, { fill: false }).back, null, 'fill: false leaves only the clip');
  assert.notEqual(plotPanel(sv, 0, 0, 10, 10).id, plotPanel(sv, 0, 0, 10, 10).id, 'every panel its own id');
});

test('a plane draws out to its element\'s edge: the frame is the element but a few px, and an end at the frame goes on to the edge', () => {
  const fr = frame(400, 200);
  assert.deepEqual(fr, { L: PAD, R: 400 - PAD, T: PAD, B: 200 - PAD });
  assert.deepEqual(bleed({ x1: fr.L, x2: 180, y1: fr.T, y2: fr.B }, fr, 400, 200), { x1: 0, x2: 180, y1: 0, y2: 200 });
  assert.deepEqual(bleed({ x1: 100, x2: fr.R, y1: 50, y2: 60 }, fr, 400, 200), { x1: 100, x2: 400, y1: 50, y2: 60 });
  assert.deepEqual(bleed({ x1: 100, x2: 120, y1: 50, y2: 60 }, fr, 400, 200), { x1: 100, x2: 120, y1: 50, y2: 60 }, 'an end inside the plot stays');
});

// [W, H, caption px, where]: the data card's plot on a phone, an iPad and a Mac, then the summary's.
const SIZES = [[300, 132, 12, 'phone sideways card'], [345, 168, 14, 'phone card'], [420, 200, 14, 'iPad card'], [520, 300, 16, 'Mac card'], [345, 300, 16, 'phone summary'], [800, 450, 16, 'iPad summary'], [1290, 570, 18, 'Mac summary']];

test('the numbers stand on the plot: inside it, apart from each other, the names always, a cut-off\'s number before any name', () => {
  for (const name of ['csph', 'hvpg-ppg']) {
    const pl = planeOf(name);
    for (const [W, H, fs, where] of SIZES) {
      const fr = frame(W, H), { X, Y } = scaler(pl, fr), nums = plotNumbers(pl, fr, X, Y, fs), tag = `${name}, ${where}`;
      const names = nums.filter((n) => n.cls === 'pze-ax'), ticks = nums.filter((n) => n.cls.startsWith('pze-t'));
      assert.equal(names.length, 2, `${tag}: both axes named`);
      for (const n of nums) {
        assert.ok(n.box[0] >= 0 && n.box[2] <= W && n.box[1] >= 0 && n.box[3] <= H, `${tag}: ${n.text} inside the plot`);
        assert.ok(n.text.length > 0);
      }
      for (const [i, a] of nums.entries()) for (const b of nums.slice(i + 1)) assert.ok(!touch(a.box, b.box), `${tag}: ${a.text} and ${b.text} apart`);
      // (The cut-offs on x stand wherever there is nothing to stop them: every one named on the x axis.)
      for (const v of pl.cuts.x) assert.ok(ticks.some((n) => n.text === String(v) && n.cls.includes('on')), `${tag}: the x cut-off ${v} is numbered`);
      // (Nothing on the origin twice: the y axis's bottom number is the x axis's first.)
      assert.ok(!ticks.some((n) => n.anchor === 'start' && n.y > H - fs - PAD - 2 && n.x < PAD + 4 && n.text === String(pl.y.min ?? 0) && ticks.filter((m) => m.text === n.text && m.x === n.x).length > 1), `${tag}: no number twice on the origin`);
      assert.ok(est(names[0].text, fs, 0.62) <= W, `${tag}: the names fit the plot`);
    }
  }
});

test('a number never sits on a point: a box kept off takes the number out, the axes\' names stay', () => {
  const pl = planeOf('hvpg-ppg'), fr = frame(800, 450), { X, Y } = scaler(pl, fr), fs = 16;
  const all = plotNumbers(pl, fr, X, Y, fs), at20 = all.find((n) => n.text === '20' && n.anchor === 'start');
  assert.ok(at20, 'the y 20 is on the plot with nothing in the way');
  // (A point at the plot's left edge level with the 20, 8 px round it and its halo.)
  const p = { x: X(0.4), y: Y(20.3) }, keep = [[p.x - 12, p.y - 12, p.x + 12, p.y + 12]];
  const some = plotNumbers(pl, fr, X, Y, fs, keep);
  assert.ok(!some.some((n) => touch(n.box, keep[0])), 'none touches the point');
  assert.ok(!some.some((n) => n.text === '20' && n.anchor === 'start'), 'the y 20 beside it is left out');
  assert.equal(some.filter((n) => n.cls === 'pze-ax').length, 2, 'the names stay');
  assert.ok(some.some((n) => n.text === '12' && n.anchor === 'start'), 'the y 12, clear of it, stays');
});

test('the charts all put their plot on a rounded panel, the planes draw their zones out to the edge, and no plane keeps an axis line', () => {
  for (const f of ['tool-curve', 'flow-time', 'talk-trace', 'tool-profile']) {
    const src = read(`../src/ui/${f}.js`);
    assert.match(src, /import \{ plotPanel \} from '\.\/plot-look\.js/, `${f} uses the shared rounded plot`);
    assert.match(src, /plotPanel\(sv, /, `${f} draws one`);
  }
  const plane = read('../src/ui/visual-plane.js');
  assert.match(plane, /plotPanel\(sv, 0, 0, W, H, \{ fill: false \}\)/, 'the plane\'s zones are clipped to a rounded shape the element\'s size');
  assert.match(plane, /bleed\(\{ x1: X\(x0\), x2: X\(x1\), y1: Y\(y1\), y2: Y\(y0\) \}, fr, W, H\)/, 'a zone that ends at the plot\'s edge goes on to the element\'s');
  assert.doesNotMatch(plane, /pze-axis/, 'no axis lines: the rounded edge is the axis');
  assert.doesNotMatch(plane, /rotate\(-90\)/, 'no rotated axis name: the names stand on the plot');
  assert.match(css, /\.pz-plotbg \{ fill: var\(--surface-2\); \}/, 'the panel is the app\'s own tile tone');
  assert.match(css, /\.pze-t, \.pze-ax \{ paint-order: stroke; stroke: rgb\(var\(--black-rgb\) \/ \.55\); stroke-width: 3px;/, 'numbers white with a dark outline, as the FibroScan readings');
});

test('the ladder\'s three zones are one rounded band, the corners of the whole', () => {
  const src = read('../src/ui/tool-profile.js');
  assert.match(src, /const band = plotPanel\(sv, G\.x\(0\) - G\.slot \/ 2, G\.T - G\.hdr, G\.slot \* STATIONS\.length, G\.B - \(G\.T - G\.hdr\), \{ fill: false \}\)/);
  assert.match(src, /height: G\.B - y0, 'clip-path': band\.url \}\)/, 'each zone\'s tint clipped to the band');
});

test('the charts\' numbers sit inside the panel, 8 px in from its edge, and nothing is left outside it that the card\'s edge would cut', () => {
  const curve = read('../src/ui/tool-curve.js'), ft = read('../src/ui/flow-time.js'), talk = read('../src/ui/talk-trace.js');
  assert.match(curve, /const L = Math\.ceil\(tw\(sL\) \+ 14\), R = Math\.floor\(w - \(sR \? tw\(sR\) \+ 14 : 10\)\)/, 'the curve\'s numbers 8 px in (a 6 px gap to the lines)');
  assert.match(ft, /L = Math\.ceil\(tw\(ser\.pScale\) \+ 14 \+/, 'the flow-time numbers 8 px in');
  assert.match(talk, /B2 = HT - fs - 16/, 'the talk chart\'s times keep a few px of the panel under them');
  // (The key under a chart's panel starts under it: the steps' key sits 1.3 lines under the axis's name row.)
  assert.match(curve, /y: B \+ 4\.4 \* f \+ it\.row \* 1\.5 \* f/);
});
