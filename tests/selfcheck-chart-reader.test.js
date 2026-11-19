// The chart reader on real charts (src/ui/selfcheck/chart-reader.js): the HVPG-against-PPG plane drawn in node (jsdom, the GL stand-in, a clock the harness moves) as
// the summary and as the data card draw it, then read as the screen report reads it. What the reader says must be what the builder drew: the same words, the dots where
// the readings put them, the cut-off lines where the cut-offs are. Layout is not computed in jsdom, so the plot is given a size.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { boot, run } from './gallery-node.js';

let win, PLANES, planePlot, readCharts, judgeCharts, readShownNumbers, wantNumbers, numbersAgree, pressureColour, bigTiles, tileVal, tileOf, tileShown, valueText, fingerprintOf, computeMetrics, Engine, HVPG_CUTS, PPG_CUTS;
before(async () => {
  ({ win } = await boot());
  for (const [k, v] of [['clientWidth', 420], ['clientHeight', 260]]) Object.defineProperty(win.Element.prototype, k, { get() { return v; }, configurable: true });
  ({ PLANES, planePlot } = await import('../src/ui/visual-plane.js'));
  await import('../src/ui/screen/chart-deps.js');   // (arms the reader: the painter's functions, the page's formatters)
  ({ readCharts } = await import('../src/ui/selfcheck/chart-reader.js'));
  ({ judgeCharts } = await import('../src/ui/selfcheck/chart-rules.js'));
  ({ readShownNumbers, wantNumbers, numbersAgree } = await import('../src/ui/selfcheck/number-rules.js'));
  ({ pressureColour } = await import('../src/ui/selfcheck/pressure-rules.js'));
  ({ bigTiles, tileVal } = await import('../src/ui/presenter-cards.js'));
  ({ tileOf, tileShown } = await import('../src/ui/table-marks.js'));
  ({ valueText } = await import('../src/ui/callout-math.js'));
  ({ fingerprintOf } = await import('../src/engine/fingerprint.js'));
  ({ computeMetrics } = await import('../src/engine/metrics.js'));
  ({ Engine } = await import('../src/engine/engine.js'));
  ({ HVPG_CUTS, PPG_CUTS } = await import('../src/engine/pressure-cuts.js'));
}, { timeout: 60000 });

const fpOf = (preset) => { const e = new Engine(); e.loadPreset(preset); for (let i = 0; i < 400; i++) e.step(0.004); return fingerprintOf(computeMetrics(e), { P: e.Pf || e.P, Q: e.Qf || e.Q, params: e.params }); };
const mount = (plot) => { const host = document.createElement('div'); host.append(plot.el); document.body.append(host); return host; };

test('the summary plane: its ticks, cut-off lines and points are read where the builder drew them, and it passes the chart rules', async () => {
  const fps = ['healthy', 'csph', 'cirr-decomp'].map((p) => ({ name: p, f: fpOf(p) }));
  const plot = planePlot(PLANES['hvpg-ppg']);
  const host = mount(plot);
  plot.set(fps.map(({ name, f }) => ({ f, name, site: 'none' })), null);
  await run(8);
  const { charts } = readCharts(document);
  assert.equal(charts.length, 1);
  const c = charts[0];
  assert.equal(c.host, 'plane');
  assert.equal(c.fit, true, 'a summary plane says its axes are cut to its points');
  assert.deepEqual(c.keys, { x: 'hvpg', y: 'ppg' });
  assert.ok(c.rects.some((r) => r.role === 'frame'), 'the zones are the plot\'s frame');
  assert.equal(c.dots.filter((d) => d.role === 'point').length, 3, 'a dot for each patient');
  const ticks = c.texts.filter((t) => t.role === 'tick').map((t) => t.text);
  for (const n of [HVPG_CUTS.amber, HVPG_CUTS.red, PPG_CUTS.amber, PPG_CUTS.red]) assert.ok(ticks.includes(String(n)), `the cut-off ${n} is written on its axis (got ${ticks})`);
  assert.deepEqual(c.texts.filter((t) => t.role === 'zone-name'), [], 'a plane with a key writes no zone names on the plot');
  assert.equal(c.texts.filter((t) => t.role === 'axis-name').length, 2);
  // the same read twice is the same
  assert.deepEqual(readCharts(document), { charts });
  assert.deepEqual(judgeCharts({ charts }), [], 'the chart rules find nothing wrong with the summary plane');
  host.remove();
});

test('the data card\'s plane: the case dot carries the readings it was placed from, and they are the model\'s as the tiles print them', async () => {
  const fp = fpOf('cirr-decomp');
  const plot = planePlot(PLANES['hvpg-ppg'], { card: true });
  const host = mount(plot);
  plot.set([], fp);
  await run(8);
  const c = readCharts(document).charts[0];
  const caseDot = c.dots.find((d) => d.role === 'case');
  assert.ok(caseDot, 'the case dot is read');
  assert.match(caseDot.v, /^hvpg:[\d.]+,ppg:[\d.]+$/);
  const shown = readShownNumbers(document, { charts: { charts: [c] } });
  assert.deepEqual(shown.map((s) => s.key).sort(), ['hvpg', 'ppg']);
  const fmt = { tile: (k, f) => tileVal(k, f[k], f), word: (k, f) => [valueText(k, f, false), valueText(k, f, true)], value: (k, f) => tileShown(k, f[k]) };
  assert.deepEqual(numbersAgree(wantNumbers(shown, fp, fmt)), []);
  // a different patient's model: the same dot now disagrees, and the finding names the chart and its file
  const other = numbersAgree(wantNumbers(shown, { ...fp, hvpg: fp.hvpg + 3 }, fmt));
  assert.equal(other.length, 1);
  assert.match(other[0].what, /HVPG/);
  assert.equal(other[0].owner, 'src/ui/visual-plane.js');
  assert.equal(c.fit, false, 'a data card\'s plane keeps the declared axes, so the fit rule leaves it alone');
  host.remove();
});

test('the readout tiles: each tile\'s number and rating are read by key, and a wrong number or colour is found', async () => {
  const fp = fpOf('cirr-decomp');
  const tiles = bigTiles();
  const root = document.createElement('div');
  root.append(tiles.el, tiles.head); document.body.append(root);
  tiles.paintTiles(fp, ['hvpg', 'ppg'], [], null, 0, false, false);
  await run(8);
  const names = Object.fromEntries(['hvpg', 'ppg'].map((k) => [k, tileOf(k).n || tileOf(k).t]));
  const shown = readShownNumbers(root, { tileNames: names });
  assert.deepEqual(shown.filter((s) => s.where === 'tile').map((s) => s.key), ['hvpg', 'ppg']);
  assert.deepEqual(shown.filter((s) => s.where === 'header').map((s) => s.key), ['hvpg', 'ppg']);
  const fmt = { tile: (k, f) => tileVal(k, f[k], f), word: () => [], value: (k, f) => tileShown(k, f[k]) };
  assert.deepEqual(numbersAgree(wantNumbers(shown, fp, fmt)), [], 'the tiles and the header read the fingerprint');
  assert.deepEqual(pressureColour(shown), [], 'the ratings the tiles wear are the cut-offs\'');
  // break one tile's rating by hand: the rule names it
  root.querySelector('.pz-tile').setAttribute('data-rate', fp.hvpg > HVPG_CUTS.red ? 'ok' : 'hi');
  const bad = pressureColour(readShownNumbers(root, { tileNames: names }));
  assert.equal(bad.length, 1);
  assert.match(bad[0].what, /HVPG/);
  root.remove();
});

test('a plane drawn in the data card with its key under it: the legend is read, and the plot names no zone the key names', async () => {
  const { planeCardKey } = await import('../src/ui/visual-plane.js');
  const fp = fpOf('cirr-decomp');
  const out = {};
  for (const [id, pl] of Object.entries(PLANES)) {
    const card = document.createElement('div');
    card.className = 'pz-data';
    const plot = planePlot(pl, { card: true });
    card.append(plot.el);
    if (pl.key !== 'never') card.append(planeCardKey(pl));
    document.body.append(card);
    plot.set([], fp);
    await run(8);
    const c = readCharts(card).charts[0];
    out[id] = { legend: c.legend.where, zoneWords: c.texts.filter((t) => t.role === 'zone-name').map((t) => t.text), findings: judgeCharts({ charts: [c] }).map((f) => `${f.rule}: ${f.what}`) };
    card.remove();
    plot.dispose?.();
  }
  assert.equal(out['hvpg-ppg'].legend, 'html', 'the card\'s key is found beside its plot');
  assert.deepEqual(out['csph'].legend, 'none', 'the CSPH plane names its own zones and has no key');
  assert.ok(out['csph'].zoneWords.length > 0, `the reader sees the zone words the CSPH plane writes on its plot (${JSON.stringify(out.csph)})`);
  assert.deepEqual(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.findings])), { 'hvpg-ppg': [], csph: [], 'flow-ppg': [] }, JSON.stringify(out));
});

test('pps.screen\'s charts part: tiles, a words pill and the plane\'s dot against one fingerprint; a wrong one is found with its rule, file and place', async () => {
  const { buildScreen } = await import('../src/ui/screen/build.js');
  const { rich } = await import('../src/ui/presenter-words.js');
  const fp = fpOf('cirr-decomp');
  const root = document.createElement('div');
  const tiles = bigTiles();
  const plot = planePlot(PLANES['hvpg-ppg'], { card: true });
  const line = document.createElement('p');
  line.append(...[].concat(rich('The gradient is {hvpg} and the portal one {ppg}.', {}, fp, false)).map((n) => (typeof n === 'string' ? document.createTextNode(n) : n)));
  root.append(tiles.el, tiles.head, plot.el, line); document.body.append(root);
  tiles.paintTiles(fp, ['hvpg', 'ppg'], [], null, 0, false, false);
  plot.set([], fp);
  await run(8);
  const build = (env = {}) => buildScreen({ pps: { store: { get: () => ({}) } }, doc: document, win, rules: ['chart-zone-names-with-legend', 'chart-axes-fit-data', 'number-agree', 'pressure-colour', 'pressure-words'], ...env });
  for (const withFp of [false, true]) {
    const ok = build(withFp ? { fp } : {});
    assert.deepEqual(ok.findings, [], JSON.stringify(ok.findings));
    assert.deepEqual([...new Set(ok.charts.numbers.map((s) => s.where))].sort(), ['chart', 'header', 'tile', 'words']);
    assert.equal(ok.charts.numbers.every((s) => !!s.want), withFp, 'the model\'s wording is attached when a fingerprint is given');
  }
  // the model says another HVPG than the page: every place that wrote it is named
  const bad = build({ fp: { ...fp, hvpg: fp.hvpg + 2.5 } });
  assert.deepEqual(bad.findings.filter((f) => f.rule === 'number-agree').map((f) => f.where).sort(), ['chart planecard#0', 'header', 'tile', 'words'], JSON.stringify(bad.findings));
  assert.ok(bad.findings.every((f) => f.owner && f.why));
  // the page itself disagrees with itself (no fingerprint at all): the header reads another number than its tile
  root.querySelector('.pz-hi b').textContent = '99.9';
  const own = build();
  assert.deepEqual(own.findings.map((f) => `${f.rule}: ${f.what}`), ['number-agree: HVPG reads "99.9" in the header']);
  // the text form says what the charts hold
  const { screenText } = await import('../src/ui/screen/text.js');
  assert.match(screenText(build()), /Chart planecard#0.*hvpg across and ppg up.*legend|no legend/);
  root.remove();
});
