// Replaying a bug packet in the layout-only headless run (owner, 18 Nov 2026 17:07 ET: headless is allowed only with every GL draw stubbed, no pictures, no
// screenshots, no judging of looks). The app boots for real in Chromium, its GL draw calls do nothing, the packet's state link opens, and the screen report
// (boxes, sizes, words, numbers, label places) is read from the page with the page's own `pps.screen()`. Nothing is painted; no picture is taken.
//
//   node scripts/packet.mjs replay <packet.txt> --env headless [--device iphone|mac|ipad|ipad-portrait|iphone-landscape] [--dir . | dist] [--url <running site>]
//
// The device is the nearest of the known ones to the packet's own screen size unless named. One browser, one page, about a minute.
import { launchLayout, DEVICES } from './headless.mjs';
import { stateLink } from '../src/ui/packet/state.js';

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
  const L = await launchLayout({ dir, serveSite: false });   // (scripts/headless.mjs: the one layout-only opener, GL draws stubbed)
  let app = null;
  const look = x.look === 'light' || x.look === 'soft' ? 'light' : x.look ? 'dark' : 'light';
  return {
    name: 'headless', device: dev,
    async apply(state) {
      const link = new URL(stateLink(state, 'http://127.0.0.1/preview/'));
      const query = link.search + link.hash;   // (?script=&slide=&back=1 and #s=, whose `x` part the page applies after boot)
      app = await L.open({ device: dev, theme: look, query, url, timeout: 180000 });
      await app.page.waitForFunction(() => window.pps?.packet?.ready, null, { timeout: 120000 });
      const skipped = await app.page.evaluate(() => window.pps.packet.ready);
      return { skipped };
    },
    // (The model is paused first, as scripts/shoot.mjs does: a running beat keeps the Doppler's marks pulsing and nothing is ever quiet. The report is of the state at rest.)
    async settle() { await app.page.evaluate(() => window.pps.host.send({ type: 'run', running: false })); return app.page.evaluate(() => window.pps.packet.settled({ timeoutMs: 60000 })); },
    screen: () => app.page.evaluate(() => window.pps.screen?.()),
    async judgeHistory(history) { return (await import('../src/ui/watch/replay.js')).replayHistory(history); },
    errors: () => app?.errors || [],
    page: () => app.page,   // (for a debugging script)
    async close() { await app?.close().catch(() => {}); await L.close().catch(() => {}); },
  };
}
