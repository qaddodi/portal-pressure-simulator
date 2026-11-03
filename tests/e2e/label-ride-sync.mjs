// A layout/value sync arriving during a camera ride must not replace its coordinate basis.
// Component integration on WebGL2; headless software GL is not real-device visual proof.
import assert from 'node:assert/strict';
import { serve } from '../../scripts/serve.mjs';
import { launch } from '../../scripts/gate-clock.mjs';

const server = await serve(process.cwd());
const browser = await launch(true);
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 600 }, reducedMotion: 'reduce' });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(server.url + '/docs/gpu-practices.md');
  await page.setContent(`<style>svg { width:500px;height:500px } .lb { font:14px Inter; fill:black }</style>
    <div><svg><g id="blocks"><g class="lb" data-key="test"><text x="0" y="14"><tspan>Portal vein</tspan></text></g></g></svg></div>`);
  await page.evaluate(async () => {
    const { createLabelGL } = await import('/src/ui/label-gl.js');
    const { loadGlyphs } = await import('/src/ui/text-gl.js');
    await loadGlyphs();
    const svg = document.querySelector('svg'), blocks = document.querySelector('#blocks'), g = blocks.firstElementChild;
    window.layer = createLabelGL(svg, blocks);
    if (!window.layer) throw new Error('WebGL2 label layer unavailable');
    window.list = [{ g, x: 100, y: 100 }];
    window.layer.sync(window.list);
  });
  await page.waitForFunction(() => window.layer.drawnLabels().some((d) => d.a > 0.99)).catch(async (e) => { console.log(await page.evaluate(() => ({ counts: window.layer.counts(), drawn: window.layer.drawnLabels(), html: document.body.innerHTML }))); throw e; });
  const result = await page.evaluate(() => {
    const layer = window.layer, list = window.list, g = list[0].g;
    const first = layer.drawnLabels()[0];
    layer.ride([1, 0, 0, 1, 40, 30]);
    const carried = layer.drawnLabels()[0];
    // The stage refills its alternating lists and delivers multiple syncs while a landing solve runs.
    list.length = 0; list.push({ g, x: 140, y: 130 }); layer.sync(list);
    layer.sync([{ g, x: 180, y: 160 }]);
    layer.ride([1, 0, 0, 1, 80, 60]);
    const during = layer.drawnLabels()[0];
    layer.rideEnd();
    layer.sync([{ g, x: 180, y: 160 }]);
    const landed = layer.drawnLabels()[0];
    return { first, carried, during, landed };
  });
  assert.ok(result.during && result.landed, 'the label stays drawn across resync and landing');
  for (const [field, delta] of [['x', 80], ['y', 60]]) {
    assert.ok(Math.abs(result.during[field] - result.first[field] - delta) <= 1, `${field}: the camera move is applied once`);
    assert.ok(Math.abs(result.landed[field] - result.during[field]) <= 1, `${field}: landing starts from the last drawn position`);
  }
  console.log('label-ride-sync: passed (headless, software GL)', JSON.stringify(result));
} finally { await browser.close(); server.close(); }
