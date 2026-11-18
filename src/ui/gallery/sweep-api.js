// The gallery API the Sweep uses when window.pps.gallery (api.js) is not there: the same three calls, made from what the page itself offers
// (ctx.go opens a specimen, ctx.setLook switches the look, the shared fit rules judge). Same names and result shapes as pps.gallery, so
// runSweep (sweep.js) cannot tell them apart. Nothing runs per frame: each call is one specimen, in the sweep's own task.
import { runCheck } from './fit-check.js';

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** The probes a device sweep reads (all optional in runSweep): errors counted by the app, GPU memory, and the frame recorder. */
export function devicePps(pps) {
  return {
    errors: () => { try { return Object.values(pps?.caught?.() || {}).reduce((n, v) => n + (v?.n || 0), 0); } catch { return 0; } },
    gpuMB: () => { try { const m = pps?.budget?.memoryMB?.(); return typeof m === 'number' ? +m.toFixed(1) : null; } catch { return null; } },
    peakMB: () => { try { const m = pps?.budget?.peakMB?.(); return typeof m === 'number' ? m : null; } catch { return null; } },
    framesStart: () => { pps?.perf?.frames?.start?.(); },
    framesStop: () => pps?.perf?.frames?.stop?.() || null,
  };
}

/**
 * ctx: the gallery page's ctx (ctx.go(id) must exist, see page.js), io: the layout reads (layout-snap), poll: ms between busy checks.
 * Returns { list, open, check } like pps.gallery.
 */
export function localApi(ctx, io, { poll = 250 } = {}) {
  const { CATALOG } = ctx.catalog;
  const busy = () => !!ctx.pps?.presenter?.busy?.() || !!ctx.pps?.stage?.viewChanging?.();
  let openId = null;
  return {
    list: (f = {}) => CATALOG.filter((e) => (!f.family || e.family === f.family) && (!f.section || e.section === f.section) && (!f.kind || e.kind === f.kind))
      .map((e) => ({ id: e.id, section: e.section, family: e.family, kind: e.kind, title: e.title })),
    async open(id, { look, timeoutMs = 20000 } = {}) {
      const t0 = performance.now();
      try {
        if (look && ctx.look() !== look) ctx.setLook(look);
        await ctx.go(id, { quiet: true });
        openId = id;
        await sleep(poll);
        while (busy() && performance.now() - t0 < timeoutMs) await sleep(poll);
        const settled = !busy();
        return { id, ok: true, settled, ms: performance.now() - t0, look: ctx.look() };
      } catch (err) {
        return { id, ok: false, settled: false, ms: performance.now() - t0, look: ctx.look(), error: String(err?.message || err) };
      }
    },
    check() {
      const r = runCheck({ io, pps: ctx.pps });
      return { id: openId, look: ctx.look(), size: { w: io.metric(window, 'innerWidth'), h: io.metric(window, 'innerHeight') },
        problems: r.problems.map(({ kind, text, line, where }) => ({ kind, text, line, where })), busy: r.busy, slide: r.slide, structure: r.structure };
    },
  };
}
