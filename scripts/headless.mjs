// The one way a script opens the app for a LAYOUT-ONLY run (bible review 19 Nov 2026, DBG-6; owner, 18 Nov 2026 17:07 ET: "headless is allowed only with every GL draw stubbed, no pictures,
// no screenshots, no judging of looks"). Every layout runner (the deck sweep, the gallery sweep, the turn sweep, the packet replay, card-fit) opened the app through the picture
// tool's `openApp` and pasted its own copy of the GL stub; two more (the phone card and sheet scripts) forgot the stub and drew every frame on SwiftShader. Now they all come here:
//
//   const { browser, open, close } = await launchLayout({ dir, prefix });   // one Chromium (and, with `serve`, one static server for the build)
//   const app = await open({ device: 'iphone', query: 'gallery&testclock=20', cardsOnly: true });
//
// What this does that the picture tool does not: every GL draw call is a no-op (the page's state, layout and words are real, the picture is not), `layoutOnly` sets `window.ppsLayoutOnly` (seen.js: the figure is not drawn, so the cards are read as ever without waiting for it), `cardsOnly` also builds no figure (`window.ppsCardsOnly`), and the page's `screenshot` throws. This file exports no screenshot function and
// imports none: pictures stay in scripts/shoot.mjs, and tests/headless-only.test.js fails a layout runner that imports `openApp` from it.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHROMIUM_ARGS, openApp, DEVICES } from './shoot.mjs';
import { serve } from './serve.mjs';

export { DEVICES };

/** The GL draw calls do nothing. */
export const GL_STUB = `(() => { for (const C of [window.WebGL2RenderingContext]) { if (!C) continue; const P = C.prototype; for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear', 'blitFramebuffer']) if (P[k]) P[k] = function () {}; } })();`;

/** The init script of a layout run: the stub, then the flags the app reads (`ppsLayoutOnly`: no picture work; `ppsCardsOnly`: no figure either), then any extra hook. */
export const layoutScript = ({ layoutOnly = false, cardsOnly = false, extra = '' } = {}) => GL_STUB + (layoutOnly || cardsOnly ? 'window.ppsLayoutOnly = true;' : '') + (cardsOnly ? 'window.ppsCardsOnly = true;' : '') + extra;

const refuse = () => { throw new Error('screenshot: this is a layout-only run (no pictures). Pictures are scripts/shoot.mjs, on the owner\'s say-so.'); };
const EXE = () => process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : '');

/**
 * One Chromium for a layout run. `dir` is the tree to serve (. or dist); `prefix` is the path the site is served under ('/preview' for the gallery, which only opens there).
 * Returns { browser, server, open(opts), close() }. open: { device, theme, query, look, cardsOnly, layoutOnly, gpuPath, dpr, timeout, extra } -> the picture tool's app object (page, close, ...)
 * whose `page.screenshot` throws. `gpuPath` (default: not for a cards-only run, which builds no figure to check) asks for the GPU code path's resolution and shading, as the owner's phone has it.
 */
export async function launchLayout({ dir = '.', prefix = '', serveSite = true } = {}) {
  const server = serveSite ? await serve(resolve(dir), 0, prefix ? { prefix } : undefined) : null;
  const browser = await chromium.launch({ args: CHROMIUM_ARGS, ...(EXE() ? { executablePath: EXE() } : {}) });
  const open = async ({ device = 'mac', theme = 'light', query = '', cardsOnly = false, layoutOnly = false, gpuPath, dpr = 1, timeout = 120000, extra = '', url } = {}) => {
    const app = await openApp({ device, theme, query, dir, url: url || server?.url || '', browser, initScript: layoutScript({ layoutOnly, cardsOnly, extra }), dpr, timeout, gpuPath: gpuPath ?? !cardsOnly });
    app.page.screenshot = refuse;
    return app;
  };
  const close = async () => { await browser.close(); server?.close(); };
  return { browser, server, open, close };
}
