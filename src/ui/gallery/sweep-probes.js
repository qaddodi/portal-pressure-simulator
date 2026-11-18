// What a device sweep reads besides the gallery API (api.js): the app's counted errors, GPU memory, and the frame recorder (pps.perf.frames), so each
// specimen's row can say what it cost. Each probe tolerates a page that lacks it. Called once per specimen, never per frame.

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
