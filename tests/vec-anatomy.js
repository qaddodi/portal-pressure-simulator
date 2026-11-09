// The real anatomy, for the vector renderer's compiler tests (workstream A): the real stage booted in node (tests/stage-gl-boot.js, the
// do-nothing WebGL), with the figure's vessel renderer wrapped (tests/vec-tap-gl.js) so what the stage gives it is kept: the binning
// (entries and cells), the tube attributes, the radii and the morph sets' binnings. Import this file BEFORE anything of src/ui (the hook
// must be in place before the stage is). Not a *.test.js.
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const TAP = pathToFileURL(new URL('./vec-tap-gl.js', import.meta.url).pathname).href;
registerHooks({
  resolve(specifier, context, next) {
    const r = next(specifier, context);
    if (r.url.endsWith('/src/ui/veins-gl.js') && !context.parentURL?.endsWith('/tests/vec-tap-gl.js')) return { url: TAP, format: 'module', shortCircuit: true };
    return r;
  },
});

// A Worker that runs the sweep worker's job in this process (the stage makes its morph sets only where Worker exists, as in a browser), and
// keeps what it was asked: the swept stretches' tubes (with their paths) and joins, for tests that judge a morph set against the paths.
// Any other worker is refused (the stage then goes on without it, as the dye does on the main thread).
const { binSwept } = await import('../src/ui/veins-sweep.js');
const { binVeins } = await import('../src/ui/veins-bin.js');
export const sweeps = (globalThis.__vecSweeps ??= []);
globalThis.Worker = class FakeSweepWorker {
  constructor(url) {
    if (!String(url).endsWith('sweep-worker.js')) throw new Error('no worker here');
    this.onmessage = this.onerror = this.onmessageerror = null;
  }
  postMessage({ id, kind, tubes, joins, opts }) {
    const kept = kind !== 'bin' ? { tubes, joins, opts, b: null } : null;
    if (kept) sweeps.push(kept);
    setImmediate(() => {
      try { const b = kind === 'bin' ? binVeins(tubes, joins) : binSwept(tubes, joins, opts); if (kept) kept.b = b; this.onmessage?.({ data: { id, b } }); } catch (err) { this.onmessage?.({ data: { id, error: String(err?.message || err) } }); }
    });
  }
  terminate() {}
};
const { bootGL, pump } = await import('./stage-gl-boot.js');
const { store } = await import('../src/ui/store.js');
const { createCore } = await import('../src/worker-core.js');
export const taps = (globalThis.__vecTaps ??= []);
const tasks = () => new Promise((r) => setImmediate(r));

/** Boots the stage once. Returns { st, core, step(n), preset(id), view(v), figure() }. figure(): the stage instance's kept inputs, copied. */
export async function bootAnatomy(opts = {}) {
  const { st } = await bootGL({ w: opts.w ?? 1200, h: opts.h ?? 800, labels: 'none' });
  let q = [], lastF = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: true });
  const step = async (n = 1) => { for (let i = 0; i < n; i++) { pump(48); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); } };
  return {
    st, core, step,
    async preset(id, frames = 70) { await core.handle({ type: 'preset', id }); store.set({ params: core.engine().params }); await step(frames); },
    async view(v, frames = 150) { st.setView(v); await step(frames); },
    figure() {
      const t = taps.find((x) => x.who === 'stage');
      if (!t || !t.bins) return null;
      const b = t.bins;
      return {
        nTubes: t.nTubes, bins: { ent: b.ent.slice(), cells: b.cells.slice(0, b.nCells * 6), nCells: b.nCells, nEnt: b.nEnt, rows: b.rows },
        tube: t.tube.slice(), rad: t.rad.slice(),
        sets: t.sets.map(({ bins }) => ({ ent: bins.ent, cells: bins.cells, nCells: bins.nCells, posBase: bins.posBase, joinBase: bins.joinBase, entRows: bins.entRows, rows: bins.rows, nJoins: bins.nJoins })),
      };
    },
  };
}
