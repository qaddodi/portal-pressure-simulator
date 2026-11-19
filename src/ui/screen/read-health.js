// The health part: GPU memory, live contexts, errors counted, the frame rate. All numbers the app already keeps (gpu-budget.js, gl-contexts.js, caught.js,
// frame.js perf). Volatile: it changes between two runs of one state, so a stable report leaves it out.
import { registerReader } from './registry.js';
import { r1 } from './util.js';
import { contextStats } from '../gl-contexts.js';
import { caughtNow } from '../caught.js';

export function readHealth(ctx) {
  const { pps } = ctx;
  let b = null, perf = null;
  try { b = pps?.budget?.() || null; } catch { /* (no budget in a rig) */ }
  try { perf = pps?.perf || null; } catch { /* (no frame clock in a rig) */ }
  const errs = caughtNow();
  const tags = Object.keys(errs);
  const c = contextStats();
  return {
    gpu: b ? { device: b.device, mb: b.mb, envelopeMb: b.envelope?.mb ?? null, overMemory: !!b.overMemory, top: (b.owners || []).slice(0, 3).map((o) => `${o.owner} ${o.mb} MB`) } : null,
    contexts: { live: c.live, peak: c.peak, made: c.made, lost: c.lost },
    errors: { total: tags.reduce((n, k) => n + errs[k].n, 0), tags: tags.slice(0, 10).map((k) => `${k} x${errs[k].n}: ${String(errs[k].last).slice(0, 80)}`) },
    fps: perf ? r1(perf.fps) : null,
    frames: perf?.totals?.frames ?? null,
  };
}

registerReader({
  id: 'health', owner: 'src/ui/gpu-budget.js', order: 90, volatile: true, read: readHealth,
  text(h, ctx) {
    const out = [];
    out.push(`Health: ${h.gpu ? `GPU memory ${h.gpu.mb} of ${h.gpu.envelopeMb} MB on ${h.gpu.device}${h.gpu.overMemory ? ' (OVER)' : ''}, ` : ''}${h.contexts.live} live GL contexts (peak ${h.contexts.peak}), ${h.errors.total} errors counted${h.fps != null ? `, ${h.fps} fps` : ''}.`);
    if (ctx.detail === 'full') { if (h.gpu?.top.length) out.push(`  Largest GPU owners: ${h.gpu.top.join('; ')}.`); for (const t of h.errors.tags) out.push(`  Error ${t}`); }
    return out;
  },
});
