// A real mouse click on the teaching card and on the data card zooms them (Mac).   node scripts/tap-zoom-probe.mjs [deck] [slide]
import { openApp } from './shoot.mjs';
const deck = process.argv[2] || 'gastric-varices', at = +(process.argv[3] ?? 6);
const app = await openApp({ device: 'mac' });
let bad = 0;
try {
  const pg = app.page;
  await pg.evaluate(([d, i]) => window.pps.presenter.start(d, i), [deck, at]);
  await pg.waitForFunction(() => document.querySelector('.pz-data:not([hidden])')?.offsetWidth && document.querySelector('.pz-text')?.offsetWidth, null, { timeout: 120000 });
  await pg.waitForTimeout(30000);
  await pg.waitForTimeout(8000);
  for (const sel of ['.pz-text', '.pz-data']) {
    const pt = await pg.evaluate((s) => {
      const c = document.querySelector(s); if (!c) return null;
      const r = c.getBoundingClientRect();
      // an empty spot: try points over the card until one hits an empty part of it
      for (let fy = 0.08; fy < 0.95; fy += 0.04) for (let fx = 0.05; fx < 0.95; fx += 0.05) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy, e = document.elementFromPoint(x, y);
        if (e === c) return { x, y, hit: 'card' };
      }
      const x = r.left + r.width * 0.9, y = r.top + r.height * 0.5, e = document.elementFromPoint(x, y);
      return { x, y, hit: e ? `${e.tagName}.${[...e.classList].join('.')}` : 'none', title: document.querySelector('.pz-text h1,.pz-text h2')?.textContent };
    }, sel);
    console.log(sel, JSON.stringify(pt));
    if (!pt) { bad++; continue; }
    await pg.mouse.click(pt.x, pt.y);
    await pg.waitForTimeout(1200);
    const z = await pg.evaluate(() => ({ zoomed: document.querySelector('.pz-data')?.dataset.zoomed !== undefined, app: document.querySelector('.pz-zoomed') !== null }));
    console.log(z.app ? '  ok  ' : '  FAIL', `click on ${sel} zooms`, JSON.stringify(z));
    if (!z.app) bad++;
    else { await pg.keyboard.press('Escape'); await pg.waitForTimeout(1200); if (await pg.evaluate(() => !!document.querySelector('.pz-zoomed'))) { await pg.mouse.click(pt.x, pt.y); await pg.waitForTimeout(1200); } }
  }
  console.log('errors', app.errors?.length ? app.errors : 'none');
} finally { await app.close(); }
process.exit(bad ? 1 : 0);
