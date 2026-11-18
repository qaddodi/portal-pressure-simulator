// Replaying a bug packet in the layout-only headless run (owner, 18 Nov 2026 17:07 ET: headless is allowed only with every GL draw stubbed, no pictures, no
// screenshots, no judging of looks). The app boots for real in Chromium, its GL draw calls do nothing, the packet's state link opens, and the screen report
// (boxes, sizes, words, numbers, label places) is read from the page with the page's own `pps.screen()`. Nothing is painted; no picture is taken.
//
//   node scripts/packet.mjs replay <packet.txt> --env headless [--device iphone|mac|ipad|ipad-portrait|iphone-landscape] [--dir . | dist] [--url <running site>]
//
// The device is the nearest of the known ones to the packet's own screen size unless named. One browser, one page, about a minute.
import { chromium } from 'playwright';
import { CHROMIUM_ARGS, DEVICES, openApp } from './shoot.mjs';
import { stateLink } from '../src/ui/packet/state.js';
import { existsSync } from 'node:fs';

// The GL draws do nothing: the page's state, layout and words are real, the picture is not (the same stub as scripts/card-fit.mjs).
export const STUB = `(() => { for (const C of [window.WebGL2RenderingContext]) { if (!C) continue; const P = C.prototype; for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear', 'blitFramebuffer']) if (P[k]) P[k] = function () {}; } })();`;

/** The known device whose viewport is nearest the packet's screen (log distance of width and height). */
export function nearestDevice(vw, vh) {
  if (!vw || !vh) return 'mac';
  let best = 'mac', d0 = Infinity;
  for (const [name, d] of Object.entries(DEVICES)) {
    const d1 = Math.abs(Math.log(d.viewport.width / vw)) + Math.abs(Math.log(d.viewport.height / vh));
    if (d1 < d0) { d0 = d1; best = name; }
  }
  return best;
}

export async function makeEnv({ packet, device = '', dir = '.', url = '' } = {}) {
  const x = packet?.state?.x || {};
  const dev = device || nearestDevice(x.vw, x.vh);
  const EXE = process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');
  const browser = await chromium.launch({ args: CHROMIUM_ARGS, ...(EXE ? { executablePath: EXE } : {}) });
  let app = null;
  const look = x.look === 'light' || x.look === 'soft' ? 'light' : x.look ? 'dark' : 'light';
  return {
    name: 'headless', device: dev,
    async apply(state) {
      const link = new URL(stateLink(state, 'http://127.0.0.1/preview/'));
      const query = link.search + link.hash;   // (?script=&slide=&back=1 and #s=, whose `x` part the page applies after boot)
      app = await openApp({ device: dev, theme: look, query, dir, url, initScript: STUB, browser });
      await app.page.waitForFunction(() => window.pps?.packet?.ready, null, { timeout: 120000 });
      const skipped = await app.page.evaluate(() => window.pps.packet.ready);
      return { skipped };
    },
    // (The model is paused first, as scripts/shoot.mjs does: a running beat keeps the Doppler's marks pulsing and nothing is ever quiet. The report is of the state at rest.)
    async settle() { await app.page.evaluate(() => window.pps.host.send({ type: 'run', running: false })); return app.page.evaluate(() => window.pps.packet.settled({ timeoutMs: 60000 })); },
    screen: () => app.page.evaluate(() => window.pps.screen?.()),
    async judgeHistory(history) {
      const { runRules } = await import('../src/ui/selfcheck/rules.js');
      const frames = Array.isArray(history) ? history : history?.frames || history?.samples;
      return frames ? runRules(null, { kinds: ['series'], history: frames }) : null;
    },
    errors: () => app?.errors || [],
    page: () => app.page,   // (for a debugging script)
    async close() { await app?.close().catch(() => {}); await browser.close().catch(() => {}); },
  };
}
