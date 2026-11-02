// Glass diagnosis on a real Apple GPU (GitHub macOS runner): the live preview in WebKit and Chromium, each card's state and pixels.
import { webkit, chromium } from 'playwright';
const BASE = process.env.BASE || 'https://qaddodi.github.io/portal-pressure-simulator/preview/';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const probe = (page) => page.evaluate(async () => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ri = gl?.getExtension('WEBGL_debug_renderer_info');
  const cards = [...document.querySelectorAll('.pz-shade, .pz-data, .pz-case, .pz-bar, .pz-fk')].filter((e) => !e.hidden && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  return {
    renderer: ri ? gl.getParameter(ri.UNMASKED_RENDERER_WEBGL) : 'n/a', dpr: devicePixelRatio,
    html: [...document.documentElement.attributes].map((a) => `${a.name}=${a.value.slice(0, 40)}`).join(' '),
    view: document.querySelector('#stageView')?.className,
    canvases: [...document.querySelectorAll('canvas')].filter((c) => c.getClientRects().length).map((c) => `${c.id || c.className} ${c.width}x${c.height} op=${getComputedStyle(c).opacity} vis=${getComputedStyle(c).visibility}`),
    cards: cards.map((e) => { const r = e.getBoundingClientRect(); return { cls: e.className.toString().slice(0, 60), box: [r.left, r.top, r.width, r.height].map(Math.round), gl: e.getAttribute('data-gl'), wait: e.hasAttribute('data-gl-wait'), why: window.pps?.stage?.blurWhy?.(e) ?? null, glass: getComputedStyle(e).getPropertyValue('--gl-glass').trim(), bg: getComputedStyle(e).backgroundColor, op: getComputedStyle(e).opacity }; }),
    perf: (document.body.innerText.match(/^.*(blur|glass|frost).*$/gim) || []).slice(0, 30),
  };
});
// Pixels of each card's bottom padding strip (no words there): mean and spread of luminance, from a screenshot of the page.
async function strips(page, cards) {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(async ({ png, boxes }) => {
    const img = new Image(); img.src = `data:image/png;base64,${png}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const s = img.width / innerWidth;
    return boxes.map(([l, t, w, h]) => {
      const y0 = Math.round((t + h - 16) * s), x0 = Math.round((l + 24) * s), W = Math.max(1, Math.round((w - 48) * s)), H = Math.round(8 * s);
      if (W < 2 || y0 < 0) return null;
      const d = x.getImageData(x0, y0, W, H).data; let n = 0, m = 0, q = 0, r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; m += L; q += L * L; r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      m /= n; return { mean: [r / n, g / n, b / n].map(Math.round), sd: +Math.sqrt(Math.max(0, q / n - m * m)).toFixed(2) };
    });
  }, { png, boxes: cards.map((c) => c.box) });
}
async function report(page, name, dir) {
  const p = await probe(page); const px = await strips(page, p.cards);
  p.cards.forEach((c, i) => { c.px = px[i]; });
  log(name, JSON.stringify(p));
  await page.screenshot({ path: `${dir}/${name}.png` });
}
const scenarios = [
  ['hvpg3', '?script=hvpg&slide=3', async (page, R) => {
    await page.waitForTimeout(40000); await R('rest');
    const z = await page.$('.pz-zbtn'); if (z) { await z.click(); await page.waitForTimeout(300); await R('zoom-mid'); await page.waitForTimeout(3000); await R('zoomed'); await z.click(); await page.waitForTimeout(300); await R('unzoom-mid'); await page.waitForTimeout(3000); await R('unzoomed'); }
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400); await R('next-0.4s'); await page.waitForTimeout(1500); await R('next-2s'); await page.waitForTimeout(12000); await R('next-14s');
  }],
  ['case', '?script=hvpg&slide=1', async (page, R) => {
    await page.waitForTimeout(30000); await page.keyboard.press('ArrowRight');
    for (const t of [300, 700, 1500, 3000, 8000, 20000]) { await page.waitForTimeout(t); await R(`case-${t}`); }
  }],
  ['hvpg5', '?script=hvpg&slide=5', async (page, R) => { await page.waitForTimeout(40000); await R('rest'); }],
  ['circ-dark', '?script=circulation&slide=2&theme=dark', async (page, R) => { await page.waitForTimeout(40000); await R('rest'); }],
];
for (const [bn, bt] of [['webkit', webkit], ['chromium', chromium]]) {
  let browser;
  try { browser = await bt.launch(bn === 'chromium' ? { args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] } : {}); } catch (e) { log(bn, 'launch failed', e.message); continue; }
  for (const [sn, q, fn] of scenarios) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: sn.includes('dark') ? 'dark' : 'light' });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${m.type()}: ${m.text()}`.slice(0, 300)); });
    try {
      await page.goto(BASE + q, { waitUntil: 'load', timeout: 90000 });
      await fn(page, (n) => report(page, `${bn}-${sn}-${n}`, process.env.OUT || '.'));
    } catch (e) { log(bn, sn, 'failed', e.message); }
    log(bn, sn, 'errors', JSON.stringify(errs.slice(0, 12)));
    await ctx.close();
  }
  await browser.close();
}
