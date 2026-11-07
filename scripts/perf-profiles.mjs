// The device profiles the performance scripts run as (scripts/perf.mjs, scripts/frame-gate.mjs): the CPU slowed by `cpu` (CDP
// throttling slows the page's main thread only; the GPU process is not throttled, so numbers compare builds with each other, not
// with a particular device) and the screen's size and pixel density.
export const PROFILES = {
  desktop: { cpu: 1, ctx: { viewport: { width: 1440, height: 900 } } },
  laptop: { cpu: 4, ctx: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 2 } },
  phone: { cpu: 6, ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
};
