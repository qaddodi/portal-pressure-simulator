// The rounded plot (his G2 look, 27 Oct: "this rounded look we need to give maybe most of our graphs"): one shape the card's full width,
// its fills clipped to rounded corners, its numbers on it in the FibroScan readings' style, no axis lines. src/ui/plot-look.js is the
// shared piece; the planes draw their zones out to the element's edge with the numbers on the plot, and the curve, flow-time,
// talk and ladder charts put their lines on a rounded panel that holds their numbers.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plotR, plotPanel, plotFill, PLOT_R } from '../src/ui/plot-look.js';
import { planeOf, frame, bleed, scaler, plotNumbers, PAD, est } from '../src/ui/visual-plane.js';
import { xAxisRow, xAxisName, xTicks, fmtTick } from '../src/ui/tool-curve.js';
import { ZONE_TOP } from '../src/ui/tool-profile.js';

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
      assert.equal(names.length, pl.axisNames === false ? 0 : 2, `${tag}: ${pl.axisNames === false ? 'no axis named (an illustration)' : 'both axes named'}`);
      for (const n of nums) {
        assert.ok(n.box[0] >= 0 && n.box[2] <= W && n.box[1] >= 0 && n.box[3] <= H, `${tag}: ${n.text} inside the plot`);
        assert.ok(n.text.length > 0);
      }
      for (const [i, a] of nums.entries()) for (const b of nums.slice(i + 1)) assert.ok(!touch(a.box, b.box), `${tag}: ${a.text} and ${b.text} apart`);
      // (The cut-offs on x stand wherever there is nothing to stop them: every one named on the x axis.)
      for (const v of pl.cuts.x) assert.ok(ticks.some((n) => n.text === String(v) && n.cls.includes('on')), `${tag}: the x cut-off ${v} is numbered`);
      // (Nothing on the origin twice: the y axis's bottom number is the x axis's first.)
      assert.ok(!ticks.some((n) => n.anchor === 'start' && n.y > H - fs - PAD - 2 && n.x < PAD + 4 && n.text === String(pl.y.min ?? 0) && ticks.filter((m) => m.text === n.text && m.x === n.x).length > 1), `${tag}: no number twice on the origin`);
      if (names.length) assert.ok(est(names[0].text, fs, 0.62) <= W, `${tag}: the names fit the plot`);
    }
  }
});

test('a number never sits on a point: a box kept off takes the number out, the axes\' names stay', () => {
  // (The CSPH plane keeps its axes' names; the HVPG against PPG plane's numbers are its cut-offs alone.)
  const pl = planeOf('csph'), fr = frame(800, 450), { X, Y } = scaler(pl, fr), fs = 16;
  const all = plotNumbers(pl, fr, X, Y, fs), at100 = all.find((n) => n.text === '100' && n.anchor === 'start');
  assert.ok(at100, 'the y 100 is on the plot with nothing in the way');
  // (A point at the plot's left edge level with the 100, 8 px round it and its halo.)
  const p = { x: X(1), y: Y(101) }, keep = [[p.x - 12, p.y - 12, p.x + 12, p.y + 12]];
  const some = plotNumbers(pl, fr, X, Y, fs, keep);
  assert.ok(!some.some((n) => touch(n.box, keep[0])), 'none touches the point');
  assert.ok(!some.some((n) => n.text === '100' && n.anchor === 'start'), 'the y 100 beside it is left out');
  assert.equal(some.filter((n) => n.cls === 'pze-ax').length, 2, 'the names stay');
  assert.ok(some.some((n) => n.text === '150' && n.anchor === 'start'), 'the y 150, clear of it, stays');
  // (The same on the HVPG against PPG plane: no names, and a point by the 12 takes only that number out.)
  const hp = planeOf('hvpg-ppg'), hf = frame(800, 450), h = scaler(hp, hf), hk = [[h.X(0.4) - 12, h.Y(12.3) - 12, h.X(0.4) + 12, h.Y(12.3) + 12]];
  const hs = plotNumbers(hp, hf, h.X, h.Y, fs, hk);
  assert.equal(hs.filter((n) => n.cls === 'pze-ax').length, 0, 'no axis named');
  assert.deepEqual(hs.map((n) => n.text).sort(), ['10', '5', '6'], 'the y 12 beside the point is left out, the other cut-offs stay');
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
  // (Mohammad, 29 Oct: the 55 % black outline the FibroScan readings wear on a picture smeared the plane's numbers and axis names, drawn in the
  // card's own dark text, on a light card. No outline now; the cut-off lines break behind the numbers instead, visual-plane.js.)
  assert.doesNotMatch(css, /\.pze-t, \.pze-ax \{[^}]*stroke/, 'the plane\'s numbers and names carry no outline');
  assert.doesNotMatch(css, /\.pzz-w \{[^}]*stroke: rgb\(var\(--black-rgb\)/, 'nor do the criteria graph\'s words: a dark outline round dark text smears it, so the halo is the card\'s own colour');
  assert.match(plane, /gapSegs\(cutSegs\(pl, X, Y, fr, true\), \[\.\.\.names\.filter\(\(n\) => n\?\.across\)\.map\(\(n\) => n\.box\), \.\.\.nums\.map\(\(n\) => n\.box\)\]\)/, 'a cut-off line breaks behind a number it runs to');
});

test('the ladder\'s three zones are one rounded band, the corners of the whole', () => {
  const src = read('../src/ui/tool-profile.js');
  // (The band is the chart's full width, its first tint out to the left edge and its last to the right, so the axis numbers stand inside it.)
  assert.match(src, /const band = plotPanel\(sv, 0, G\.T - G\.hdr, w, G\.B - \(G\.T - G\.hdr\), \{ fill: false \}\)/);
  assert.match(src, /tx0 = k \? G\.x\(a\) - G\.slot \/ 2 : 0, tx1 = k < sp\.length - 1 \? G\.x\(b\) \+ G\.slot \/ 2 : w;/, 'the first tint reaches the left edge, the last the right');
  assert.match(src, /sv\('rect', \{ x: tx0, width: tx1 - tx0, y: y0, height: G\.B - y0, 'clip-path': band\.url \}\)/, 'each zone\'s tint clipped to the band');
  assert.match(src, /k \? sv\('text', \{ x: G\.L - 6, y: y\(k \* every\) \+ 0\.35 \* f, 'text-anchor': 'end' \}, String\(k \* every\)\) : null\)\),/, 'the numbers stand in the strip left of the lines, inside the band, and no 0 (it is implied)');
  assert.match(read('../src/ui/charts.js'), /if \(p && p % lstep === 0\) \{ ctx\.textAlign = 'right'; ctx\.fillText\(String\(p\), L - 6, y\(p\) \+ 4\); \}/, 'the Explore profile prints no 0 either');
  assert.equal(ZONE_TOP, 0.5, 'the zones\' names keep half their size over them, under the band\'s top edge');
});

test('the charts\' numbers sit inside the panel, 8 px in from its edge, and nothing is left outside it that the card\'s edge would cut', () => {
  const curve = read('../src/ui/tool-curve.js'), ft = read('../src/ui/flow-time.js'), talk = read('../src/ui/talk-trace.js');
  assert.match(curve, /const L = Math\.ceil\(tw\(sL\) \+ 14\), R = Math\.floor\(w - \(sR \? tw\(sR\) \+ 14 : 10\)\)/, 'the curve\'s numbers 8 px in (a 6 px gap to the lines)');
  assert.match(ft, /L = Math\.ceil\(tw\(ser\.pScale\) \+ 14 \+/, 'the flow-time numbers 8 px in');
  assert.match(talk, /B2 = HT - fs - 16/, 'the talk chart\'s times keep a few px of the panel under them');
  // (The key under a chart's panel starts under it: the steps' key sits 1.3 lines under the axis's name row.)
  assert.match(curve, /y: B \+ G\.foot \+ 1\.3 \* f \+ it\.row \* 1\.5 \* f/);
});

// The curve's x axis name stands on the numbers' row where it fits between them (as the planes' x name does), so the plot has the row back.
const stand = (x0, x1, L, R, w, f, ax, most) => {
  const r = xAxisRow(x0, x1, L, R, w, f, ax, most), at = (v) => L + (R - L) * (v - x0) / (x1 - x0), tw = (v) => String(fmtTick(v, ax.d)).length * f * 0.56;
  return { ...r, boxes: r.xt.map((v) => { const x = at(v); return x <= L + 1 ? [x, x + tw(v)] : x >= R - 1 ? [x - tw(v), x] : [x - tw(v) / 2, x + tw(v) / 2]; }) };
};
test('the x axis name stands on the numbers\' row between them, apart from each, inside the panel, with three numbers or more kept', () => {
  for (const [w, f, ax] of [[360, 12, { name: 'Months', unit: '', d: 0 }], [520, 14, { name: 'Albumin', unit: 'g/dL', d: 1 }], [900, 16, { name: 'Stiffness', unit: 'kPa', d: 0 }], [345, 14, { name: 'Days', unit: '', d: 0 }]]) {
    const L = 40, R = w - 36, r = stand(0, 12, L, R, w, f, ax, 7), nameW = xAxisName(ax).length * f * 0.6;
    assert.notEqual(r.nameAt, null, `${w} px: the name fits on the row`);
    assert.ok(r.xt.length >= 3, `${w} px: ${r.xt.length} numbers kept`);
    assert.ok(r.nameAt - nameW / 2 >= 8 - 1e-9 && r.nameAt + nameW / 2 <= w - 8 + 1e-9, `${w} px: the name inside the panel, 8 px in`);
    for (const b of r.boxes) assert.ok(r.nameAt + nameW / 2 <= b[0] - 6 + 1e-9 || r.nameAt - nameW / 2 >= b[1] + 6 - 1e-9, `${w} px: the name 6 px clear of the number at ${b[0].toFixed(0)}`);
  }
});
test('a name too long for the row keeps its row of its own, centred, and the numbers as many as before', () => {
  const ax = { name: 'Months on carvedilol before the second reading', unit: 'mmHg', d: 0 }, r = xAxisRow(0, 12, 40, 250, 290, 14, ax, 5);
  assert.equal(r.nameAt, null);
  assert.deepEqual(r.xt, xTicks(0, 12, 5));
});
test('the panel\'s foot follows the name: 1.7 em under the axis on the row, 3.1 em with a row of its own, the steps\' key under it either way', () => {
  const curve = read('../src/ui/tool-curve.js');
  assert.match(curve, /const foot = \(nameAt == null \? 3\.1 : 1\.7\) \* f, T = legH \+ 2 \* f, B = h - foot - 0\.2 \* f - stepH;/);
  assert.match(curve, /plotPanel\(sv, 0, G\.keyH \+ 0\.2 \* f, G\.w, B \+ G\.foot - \(G\.keyH \+ 0\.2 \* f\)\)/);
  assert.match(curve, /y: B \+ \(G\.nameAt == null \? 2\.6 : 1\.25\) \* f, 'text-anchor': 'middle' \}, xAxisName\(ax\)\)/, 'the name at the numbers\' baseline, or 2.6 em under the axis');
});

test('a flow-time chart with treatments keeps their names and bars inside the panel, which runs to the chart\'s foot', () => {
  const ft = read('../src/ui/flow-time.js');
  assert.match(ft, /plotPanel\(sv, 0, G\.keyH \+ 0\.1 \* f, G\.w, G\.h - \(G\.keyH \+ 0\.1 \* f\)\)/);
  assert.match(ft, /bandRoom = \(f\) => \(rx\.length \? \(1\.4 \+ 0\.32 \* rx\.length\) \* f : 0\)/);
  assert.match(ft, /--band-room', `\$\{rx\.length \? 1\.4 \+ 0\.32 \* rx\.length : 0\}em`/, 'the stylesheet\'s room is the same');
  // (The last bar ends 0.42 em over the foot: as far above it as the clock's numbers are over the foot with no treatments.)
  for (const n of [1, 2, 3]) assert.ok(1.4 + 0.32 * n - (2.8 - 1.7 + (n - 1) * 0.32 + 0.2) >= 0.4, `${n} bars: room under the last`);
});

test('the criteria cards\' lead line and rule stand centred, as the first-visit graph\'s do', () => {
  assert.match(css, /\.pzc-top \{ display: flex; flex-wrap: wrap; align-items: baseline; justify-content: center;/);
  assert.match(css, /\.pzc-lead \{ flex: 0 1 auto; min-width: 0; margin: 0; text-align: center;/);
});

test('the Explore dock\'s canvas charts lay the same rounded panel: plotFill is the panel\'s rect in the tile tone, laid first, and neither chart keeps an axis line', () => {
  const calls = [];
  const ctx = { save() {}, restore() {}, beginPath() {}, roundRect: (...a) => calls.push(['roundRect', ...a]), rect: (...a) => calls.push(['rect', ...a]), fill() { calls.push(['fill', this.fillStyle]); } };
  assert.equal(plotFill(ctx, 0, 0, 300, 200, '#f6f5f1'), 10, 'the corner is the plot\'s');
  assert.deepEqual(calls, [['roundRect', 0, 0, 300, 200, 10], ['fill', '#f6f5f1']]);
  calls.length = 0;
  assert.equal(plotFill({ ...ctx, roundRect: undefined }, 0, 0, 30, 20, 'red'), 5, 'a small box takes a quarter of its shorter side');
  assert.deepEqual(calls[0], ['rect', 0, 0, 30, 20], 'a canvas without roundRect still gets the panel, square');

  const charts = read('../src/ui/charts.js'), pt = read('../src/ui/pressure-time.js');
  for (const [name, src] of [['charts', charts], ['pressure-time', pt]]) {
    assert.match(src, /import \{ plotFill \} from '\.\/plot-look\.js/, `${name} uses the shared rounded plot`);
  }
  assert.match(charts, /plotFill\(ctx, 0, 0, w, hh, c\.surface2\);/, 'the profile\'s panel is its whole box in the tile tone');
  assert.match(pt, /plotFill\(ctx, 0, 0, w, hh, panel\);/, 'so is Over time\'s');
  assert.match(pt, /panel = col\('--surface-2'\)/, 'the tile tone, --surface-2, as the SVG charts\' pz-plotbg');
  assert.doesNotMatch(charts, /c\.axis; ctx\.beginPath\(\); ctx\.moveTo\(L, Math\.round\(y\(0\)\)/, 'no axis line under the profile: the panel\'s edge is the axis');
  // (Where a label must hide a line, or a dot is ringed, the panel's tone is used, not the card's, so no patch shows on the panel.)
  assert.match(pt, /ctx\.fillStyle = panel; ctx\.fillRect\(lx, yy - 6, tw \+ 8, 12\)/, 'the cut-off names\' plates');
  assert.match(pt, /dots\(ctx, s, X, Y, c, panel\)/, 'the day dots\' rings');
  assert.match(pt, /halo = cssVar\('--surface-2'\)/, 'the markers\' halos');
  assert.match(charts, /ctx\.fillStyle = c\.surface2; ctx\.beginPath\(\); ctx\.arc\(d\.cx, d\.cy, 6\.5/, 'the station dots\' rings');
  // (The numbers: 8 px in from the edge, 6 px clear of the lines, in both.)
  assert.match(charts, /ctx\.fillText\(String\(p\), L - 6, y\(p\) \+ 4\)/);
  assert.match(pt, /ctx\.fillText\(fmt\(v, tick < 1 \? 1 : 0\), L - 6, yy\)/);
  assert.match(pt, /const L = 36, R = tiny \? 62 : narrow \? \(slide \? 100 : 94\) : 104, B = 24/);
});
