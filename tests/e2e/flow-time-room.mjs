// Targeted Mac regression for the after-meal card: preferred chart room is reserved before the
// teaching card is fitted, with real motion, no screenshots, and every word at least 12 screen px.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';
import { gotoSlide, quiet } from './fast.mjs';
const server = await serve(new URL('../..', import.meta.url).pathname);
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await gotoSlide(page, server.url, 'circulation', 9);
  // Geometry check only: avoid software-GPU canvas compositing, retaining the app's real motion.
  await page.addStyleTag({ content: 'canvas { visibility: hidden !important; }' });
  const cases = process.env.FLOW_TIME_MAX_ONLY ? [[1440, 900, 2]] : [[1280, 800, 1], [1440, 900, 1], [1440, 700, 1], [1440, 900, 2]];
  for (const [width, height, scale] of cases) {
    await page.setViewportSize({ width, height });
    await page.evaluate((s) => window.pps.stage.setLabelScale(s), scale);
    const settled = await quiet(page, { timeout: 15000, still: 600 });
    const result = await page.evaluate(() => {
      const text = document.querySelector('.pz-text'), data = document.querySelector('.pz-data'), chart = data.querySelector('.pz-flowtime');
      const box = (e) => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      const minText = (root) => {
        let min = Infinity;
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n; (n = w.nextNode());) {
          const e = n.parentElement;
          if (!n.textContent.trim() || !e.getClientRects().length) continue;
          let k = 1;
          if (e instanceof SVGElement) { const m = e.getScreenCTM(); k = Math.hypot(m.a, m.b); }
          else for (let a = e; a; a = a.parentElement) k *= parseFloat(getComputedStyle(a).zoom) || 1;
          min = Math.min(min, parseFloat(getComputedStyle(e).fontSize) * k);
        }
        return min;
      };
      const bands = ['--tr-hv', '--tr-pv'].map((c) => {
        const ys = [...chart.querySelectorAll('.ptk-grid')].filter((g) => g.querySelector('text')?.style.fill.includes(c)).map((g) => +g.querySelector('line').getAttribute('y1'));
        return Math.max(...ys) - Math.min(...ys);
      });
      return { text: box(text), shade: box(document.querySelector('.pz-shade')), data: box(data), chart: box(chart), bar: box(document.querySelector('.pz-bar')), floor: { text: minText(text), chart: minText(chart) }, overflow: { text: text.scrollHeight - text.clientHeight, data: data.scrollHeight - data.clientHeight }, protected: data.classList.contains('pz-flowfit'), bands };
    });
    console.log(JSON.stringify({ viewport: [width, height], scale, settled, ...result }));
    assert.ok(settled, 'layout settles with real motion');
    assert.ok(result.protected, 'time chart keeps its readable fit');
    assert.ok(result.chart.width >= result.text.width - 3, 'chart uses the full column width');
    if (scale === 1) assert.ok(result.chart.height >= result.chart.width * (height < 800 ? 0.52 : 0.79), 'chart receives substantial plot room');
    assert.ok(result.floor.text >= 11.9 && result.floor.chart >= 11.9, 'all lettering stays at least 12 screen px');
    assert.ok(result.data.top >= result.shade.bottom + 8, 'cards have a clear gap');
    assert.ok(result.shade.top >= 0 && result.data.bottom <= height + 1, 'cards stay on screen');
    assert.ok(result.overflow.text <= 1 && result.overflow.data <= 1, 'cards never scroll or clip');
    assert.ok(result.data.right <= result.bar.left || result.data.bottom <= result.bar.top, 'controls remain clear');
  }
  await ctx.close();
} finally { await browser.close(); server.close(); }
