// Fast presenter layout checks: what the card, framing, phone-fit, ladder and numbers checks share so they run quickly.
// The page's own transitions and animations last 1 ms (the end state is unchanged: a card that has landed, a fade that has
// finished), its WebGL canvases are not shown, the checks go straight to each slide (one load per size, then
// window.pps.presenter.go or start) and they wait for the slide to stop moving (no card, camera or reading changing)
// instead of a fixed sleep. (Before, a slide took 10 to 20 s here: a settle that never came, the figure's 'all'
// transitions kept restarting, and a browser without a GPU drew 3 frames a second.)
//
//   quick check before a push:  npm run smoke:quick   (DECKS=doppler,hvpg,ascites DEVS=mac,ipad by default)

// In the page, before its scripts: transitions and animations end at once (1 ms, so transitionend and animationend still
// fire), and script animations (element.animate) of a finite length do the same.
export function instantMotion() {
  const css = '*,*::before,*::after{transition-duration:1ms!important;transition-delay:0s!important;animation-duration:1ms!important;animation-delay:0s!important}canvas[data-test-gl]{visibility:hidden!important}';
  const put = () => { const s = document.createElement('style'); s.id = 'test-instant-motion'; s.textContent = css; document.documentElement.append(s); };
  if (document.documentElement) put(); else new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); put(); } }).observe(document, { childList: true });
  // The figure's WebGL canvases are not drawn on screen: a browser without a GPU spent most of each frame reading their
  // pixels back (the page ran at 3 frames a second). The checks judge boxes and words, never the figure's pixels.
  const getContext = window.__getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...a) { if (/webgl/.test(type)) this.dataset.testGl = ''; return getContext.call(this, type, ...a); };
  const animate = window.__animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, o) {
    if (typeof o === 'number') o = Math.min(o, 1);
    else if (o && o.iterations !== Infinity) o = { ...o, duration: Math.min(+o.duration || 0, 1), delay: 0, endDelay: 0 };
    return animate.call(this, frames, o);
  };
}
// The same for a page already open (smoke.mjs's shared page): returns a function that puts motion back.
export async function instantMotionOn(page) {
  await page.evaluate(`document.getElementById('test-instant-motion') || (${instantMotion})()`);
  return () => page.evaluate(() => { document.getElementById('test-instant-motion')?.remove(); if (window.__animate) Element.prototype.animate = window.__animate; if (window.__getContext) HTMLCanvasElement.prototype.getContext = window.__getContext; delete window.__animate; delete window.__getContext; }).catch(() => {});
}

// A browser context for the checks: no service worker, reduced motion, instant transitions.
export async function fastContext(browser, opts = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce', ...opts });
  await ctx.addInitScript(instantMotion);
  return ctx;
}

// Opens the presenter on slide `i` (0-based) of `deck`: a load the first time on this page, a new deck started, or within
// the deck shown a move straight to the slide (as the arrow keys move, without waiting at each slide on the way).
const shownDeck = new WeakMap();
export async function gotoSlide(page, url, deck, i) {
  const open = shownDeck.has(page) && await page.evaluate(() => document.querySelector('#app')?.classList.contains('presenting')).catch(() => false);
  if (open && shownDeck.get(page) === deck) await page.evaluate((k) => window.pps.presenter.go(k), i);
  else if (open) await page.evaluate(([id, k]) => window.pps.presenter.start(id, k), [deck, i]);
  else {
    await page.goto(`${url}?script=${deck}&slide=${i + 1}`);
    await page.waitForFunction(() => document.querySelector('#app')?.classList.contains('presenting'), null, { timeout: 60000 });
  }
  shownDeck.set(page, deck);
  // (the count changes at once; the slide has arrived when the presenter is no longer moving to it)
  // (A time-lapse is sped to its end, as Next does: a long one, two years of a growing spleen, outran the wait on a slow runner.)
  await page.waitForFunction((k) => { if (Number(document.querySelector('.pzb-n')?.textContent.split('/')[0]) !== k) return false; window.pps.presenter.skipLapse?.(); return !window.pps.presenter.busy() && !document.querySelector('.pz-load.on, .pz-cover'); }, i + 1, { timeout: 60000, polling: 50 });
}

// Waits until the slide has stopped moving: no loading cover, no camera glide, no finite animation running, and the
// cards, the controls, the figure's camera and every reading the same over `still` ms. Gives up after `timeout` ms
// (the check then judges what is there, as a fixed sleep did).
export async function quiet(page, { still = 250, timeout = 8000 } = {}) {
  await page.evaluate(() => { window.__qs = null; });
  return page.waitForFunction((still) => {
    if (document.querySelector('.pz-load.on, .cam-move')) { window.__qs = null; return false; }
    if (document.getAnimations().some((a) => a.playState === 'running' && isFinite(a.effect?.getTiming().iterations) && a.effect.getTiming().duration > 1)) { window.__qs = null; return false; }
    const box = (s) => { const e = document.querySelector(s); if (!e) return ''; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round).join(',') + (e.hidden ? 'h' : '') + getComputedStyle(e).opacity; };
    const m = document.getElementById('world')?.getScreenCTM();
    const sig = ['.pz-shade', '.pz-text', '.pz-data', '.pz-bar', '.pz-panel', '.pz-visual', '.pz-grid'].map(box).join('|') + (m ? [m.a, m.e, m.f].map((x) => x.toFixed(1)).join(',') : '')
      + [...document.querySelectorAll('.pz-tile .pzt-vu, .pz-line .pz-val, .pzl-v')].map((e) => e.textContent).join('|')
      // (the figure's live readings wobble a tenth or two with the beat and breath: judged to the whole mmHg)
      + [...document.querySelectorAll('.lb-name')].map((e) => e.textContent + Math.round(parseFloat(e.parentElement.textContent.slice(e.textContent.length)))).join('|');
    const now = performance.now(), q = window.__qs;
    if (!q || q.sig !== sig) { window.__qs = { sig, t: now }; return false; }
    return now - q.t >= still;
  }, still, { timeout, polling: 50 }).then(() => true, () => false);
}
