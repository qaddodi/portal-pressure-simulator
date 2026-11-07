// Kept GPU words (gl-words.js glWords(el, { keep: true }), 3 Nov 2026): the words of a control that does not change are drawn once over
// their box and stay on the GPU; the page's own words are in the element all the while (the screen reader's, the layout's, the hit target's)
// and stay clear under the picture. In a real browser on the GPU path (software WebGL named as a GPU, scripts/shoot.mjs):
//   - the picture comes up and the page's words go clear (glw-on), and they are still there 2 s later: no hand-over to the page
//     (the same element set the usual way is handed back after QUIET: the control);
//   - the element still holds its words as text, whatever the picture shows;
//   - a new size and a new theme keep the picture up (drawn again where it stands: never a frame with neither);
//   - new words are drawn and written into the element, and the picture stays;
//   - words the GPU cannot draw (a character the cut glyphs lack) are shown by the page, clear removed;
//   - dispose gives the words back to the page.
//
//   node tests/e2e/gl-words-keep.mjs            (Mac profile, the repository's source)
import { openApp } from '../../scripts/shoot.mjs';

const fails = [];
const fail = (m) => { fails.push(m); console.log(`FAIL ${m}`); };
const app = await openApp({ device: process.env.DEV || 'mac', theme: 'light', query: '', dir: process.env.DIR || '.' });
const page = app.page;
try {
  await page.waitForTimeout(6000);
  // The page's own copy of the module (one instance, with the page's shared GPU context).
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((r) => r.name).find((n) => /\/gl-words\.js(\?|$)/.test(n));
    if (!url) throw new Error('gl-words.js not among the page\'s modules');
    const { glWords, QUIET } = await import(url);
    window.__gw = { glWords, QUIET };
    const mk = (id, text, left) => {
      const b = document.createElement('button');
      b.id = id; b.type = 'button'; b.textContent = text;
      b.style.cssText = `position:fixed;top:${left}px;left:40px;font:600 14px/1.1 Inter,system-ui,sans-serif;padding:8px 16px;color:#223;background:#eef;border:1px solid #99a;z-index:99999`;
      document.body.append(b);
      return b;
    };
    const k = mk('gwKeep', 'Compare', 40), c = mk('gwCtl', 'Compare', 100);
    window.__gw.k = glWords(k, { keep: true });
    window.__gw.c = glWords(c);
    window.__gw.c.set('Compared');   // (the usual way: drawn, then handed back after QUIET)
  });
  const state = (id) => page.evaluate((i) => {
    const e = document.getElementById(i);
    return { on: e.classList.contains('glw-on'), cv: !!e.querySelector(':scope > canvas.glw-cv') && e.querySelector(':scope > canvas.glw-cv').isConnected, txt: e.textContent.trim(), w: e.getBoundingClientRect().width };
  }, id);
  const until = async (id, pred, ms = 40000) => { const t0 = Date.now(); for (;;) { const s = await state(id); if (pred(s)) return s; if (Date.now() - t0 > ms) return s; await page.waitForTimeout(250); } };

  // 1. up, and kept
  let k = await until('gwKeep', (s) => s.on);
  if (!k.on) fail(`kept words never came up on the GPU (${JSON.stringify(k)})`);
  const w0 = k.w;
  await page.waitForTimeout(2000);
  k = await state('gwKeep');
  if (!k.on || !k.cv) fail(`kept words were handed back to the page after QUIET (${JSON.stringify(k)})`);
  if (k.txt !== 'Compare') fail(`the element lost its words: "${k.txt}"`);
  // the control (not kept) comes up, then goes back to the page
  const c = await until('gwCtl', (s) => !s.on && s.txt === 'Compared', 30000);
  if (c.on || c.txt !== 'Compared') fail(`the control (not kept) did not hand its words back (${JSON.stringify(c)})`);

  // 2. a new size
  await page.evaluate(() => { document.getElementById('gwKeep').style.padding = '12px 40px'; });
  await page.waitForTimeout(4000);
  k = await until('gwKeep', (s) => s.on);
  if (!k.on || !k.cv) fail(`kept words went when the box changed size (${JSON.stringify(k)})`);
  if (!(k.w > w0 + 20)) fail(`the box did not grow as asked (${w0} → ${k.w})`);

  // 3. a new theme
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(4000);
  k = await until('gwKeep', (s) => s.on);
  if (!k.on || !k.cv) fail(`kept words went with the theme (${JSON.stringify(k)})`);

  // 4. new words
  await page.evaluate(() => window.__gw.k.set('Other'));
  await page.waitForTimeout(3000);
  k = await until('gwKeep', (s) => s.on && s.txt === 'Other');
  if (!k.on || k.txt !== 'Other') fail(`new kept words: ${JSON.stringify(k)}`);

  // 5. words the GPU cannot draw
  await page.evaluate(() => window.__gw.k.set('Compare ✓✓'));
  await page.waitForTimeout(3000);
  k = await until('gwKeep', (s) => !s.on && s.txt.startsWith('Compare'));
  if (k.on || !k.txt.startsWith('Compare')) fail(`words the GPU cannot draw must show as the page's own (${JSON.stringify(k)})`);

  // 6. dispose
  await page.evaluate(() => window.__gw.k.dispose());
  await page.waitForTimeout(1500);
  k = await state('gwKeep');
  if (k.on || k.cv) fail(`dispose left the picture or its flag (${JSON.stringify(k)})`);
  if (app.errors.length) fail(`page errors: ${app.errors.slice(0, 3).join(' | ')}`);
} catch (e) { fail(`threw: ${e.message}`); }
await app.close();
console.log(fails.length ? `${fails.length} failure(s)` : 'ok: kept words stay on the GPU through size, theme and new words; the control hands back');
process.exit(fails.length ? 1 : 0);
