// The vector renderer's named benchmarks (docs/recommendations/vector-renderer-plan-r1.md section 4; workstream L).
//
// One table, read by node (scripts/vec-workload.mjs: the replay and the sweep) and by the app (`?vecbench=<name>`), so the camera of a
// benchmark is the same arithmetic in both: `benchMatrix(name, t, picture)` is the draw matrix [a, b, c, d, e, f] (world → device pixels, y down,
// as the figure hands the renderer) at time t of the benchmark. Nobody is asked to run the app side; it exists so a measurement on a device
// can be taken with one address and read from the ?perf panel (vec-measure.js keeps the report).
//
//   cv-junction    the lobule's central vein, the dense multiway sinusoid junction on its own     (scene: vec-lobule.js LOBULE_SCENES)
//   lobule-tissue  the lobule's ordinary sinusoid field, away from the central vein and the triads (scene: vec-lobule.js LOBULE_SCENES)
//   anat-fit       the anatomy, preset cirr-decomp, the fit view (the plate in its viewBox, k = 1)
//   anat-deep      the anatomy at ANAT_DEEP_K over the portal confluence (the deepest any slide camera goes: TIPS_K_MAX 9)
//   pinch          a pinch from fit to ANAT_DEEP_K about the portal confluence, 2 s (camera motion)
//   blood-only     anat-fit at rest with the blood moving: the V_BLOOD frames
//
// The anatomy's camera is the stage's own: vt = { k, x, y } applied as translate(x y) scale(k) to the plate in VB_ANAT, shown "meet" (centred) in
// the stage box. The fit view is vt = { k: 1, x: 0, y: 0 } here (stage-fit.js defaultVT frames the plate between k = 1 and 1.15 depending on the
// box it measures; node has no layout to measure, so both sides use k = 1, and a device report says so).
import { VB_ANAT, NODE_POS } from './anatomy.js';
import { lobuleGeo, sceneMatrix, LOBULE_SCENES, SCENE_DEVICE } from './vec-lobule.js';
import { frameFor, vesselRenderer } from './frame.js';
import { currentMeasure, setLastReport } from './vec-measure.js';
import { smooth01 } from './motion.js';

/** The pictures the benchmarks are measured at: css size of the stage and the device pixel ratio. */
export const PICTURES = Object.freeze({
  mac: Object.freeze({ name: 'mac', w: SCENE_DEVICE.w, h: SCENE_DEVICE.h, dpr: SCENE_DEVICE.dpr }),
  iphone: Object.freeze({ name: 'iphone', w: 390, h: 844, dpr: 3 }),
});
export const PICTURE_NAMES = Object.freeze(Object.keys(PICTURES));

/** The deepest anatomy zoom a benchmark goes to (stage-cath.js TIPS_K_MAX: the deepest any slide camera takes the plate). */
export const ANAT_DEEP_K = 9;
/** Where the anatomy benchmarks look: the portal confluence, node CONF in the anatomy's plate (anatomy.js NODE_POS). */
export const CONFLUENCE = Object.freeze({ x: NODE_POS.CONF[0][0], y: NODE_POS.CONF[0][1] });
/** The pinch's length (ms) and the instants node replays it at (fractions of its length). */
export const PINCH_MS = 2000;   // motion-scale: not a move (a measurement run's length; it times a replay, nothing the viewer sees)
export const PINCH_SAMPLES = Object.freeze([0, 0.25, 0.5, 0.75, 1]);

export const BENCHMARKS = Object.freeze({
  'cv-junction': Object.freeze({ name: 'cv-junction', scene: 'lobule', frame: 'FULL', about: LOBULE_SCENES['cv-junction'].about }),
  'lobule-tissue': Object.freeze({ name: 'lobule-tissue', scene: 'lobule', frame: 'FULL', about: LOBULE_SCENES['lobule-tissue'].about }),
  'anat-fit': Object.freeze({ name: 'anat-fit', scene: 'anatomy', preset: 'cirr-decomp', frame: 'FULL', about: 'The anatomy, preset cirr-decomp, fit view.' }),
  'anat-deep': Object.freeze({ name: 'anat-deep', scene: 'anatomy', preset: 'cirr-decomp', frame: 'FULL', about: `The anatomy at ${ANAT_DEEP_K}x over the portal confluence.` }),
  'pinch': Object.freeze({ name: 'pinch', scene: 'anatomy', preset: 'cirr-decomp', frame: 'FULL', ms: PINCH_MS, samples: PINCH_SAMPLES, about: `A pinch from fit to ${ANAT_DEEP_K}x about the portal confluence, ${PINCH_MS / 1000} s.` }),
  'blood-only': Object.freeze({ name: 'blood-only', scene: 'anatomy', preset: 'cirr-decomp', frame: 'BLOOD', about: 'The anatomy at rest, blood moving: V_BLOOD frames.' }),
});
export const BENCH_NAMES = Object.freeze(Object.keys(BENCHMARKS));


/** The stage camera vt = { k, x, y } of an anatomy benchmark at fraction `t` (0 … 1) of its length. */
export function benchVT(name, t = 0, out = { k: 1, x: 0, y: 0 }) {
  const b = BENCHMARKS[name];
  if (!b || b.scene !== 'anatomy') throw new RangeError(`benchVT: ${name} is not an anatomy benchmark`);
  if (name === 'anat-deep') {
    // Centred on the confluence: the confluence lands in the middle of the plate's viewBox.
    const cx = VB_ANAT[0] + VB_ANAT[2] / 2, cy = VB_ANAT[1] + VB_ANAT[3] / 2, k = ANAT_DEEP_K;
    out.k = k; out.x = cx - k * CONFLUENCE.x; out.y = cy - k * CONFLUENCE.y;
  } else if (name === 'pinch') {
    // Zooms about the confluence where it stands at the fit: the point stays under the fingers, k grows exponentially with an eased time.
    const k = Math.exp(Math.log(ANAT_DEEP_K) * smooth01(t));
    out.k = k; out.x = CONFLUENCE.x * (1 - k); out.y = CONFLUENCE.y * (1 - k);
  } else { out.k = 1; out.x = 0; out.y = 0; }
  return out;
}

/** The draw matrix of a vt in a picture (css w × h, device pixel ratio dpr): the plate's viewBox shown "meet", centred, then translate(x y) scale(k). */
export function vtMatrix(vt, pic, out = [0, 0, 0, 0, 0, 0]) {
  const s0 = Math.min(pic.w / VB_ANAT[2], pic.h / VB_ANAT[3]);
  const ox = (pic.w - VB_ANAT[2] * s0) / 2, oy = (pic.h - VB_ANAT[3] * s0) / 2, k = s0 * vt.k * pic.dpr;
  out[0] = k; out[1] = 0; out[2] = 0; out[3] = k;
  out[4] = (ox + s0 * (vt.x - VB_ANAT[0])) * pic.dpr; out[5] = (oy + s0 * (vt.y - VB_ANAT[1])) * pic.dpr;
  return out;
}

/**
 * A benchmark's draw matrix at fraction `t` of its length, in a picture. The lobule's scenes use vec-lobule.js sceneMatrix on lobuleGeo(w, h)
 * (the stage size the lobule was built at), the anatomy's the stage camera above.
 */
export function benchMatrix(name, t = 0, pic = PICTURES.mac, out = [0, 0, 0, 0, 0, 0]) {
  const b = BENCHMARKS[name];
  if (!b) throw new RangeError(`benchMatrix: unknown benchmark ${name}`);
  if (b.scene === 'lobule') {
    const m = sceneMatrix(LOBULE_SCENES[name], lobuleGeo(pic.w, pic.h), pic.w * pic.dpr, pic.h * pic.dpr);
    for (let i = 0; i < 6; i++) out[i] = m[i];
    return out;
  }
  return vtMatrix(benchVT(name, t), pic, out);
}

/** The picture's size in device pixels. */
export const deviceSize = (pic) => [Math.round(pic.w * pic.dpr), Math.round(pic.h * pic.dpr)];

/**
 * The pixel → world matrix a vector program is given (vec-renderer.js setCamera): world = INV × (fragX, fragY) with gl_FragCoord y up.
 * Returns [ia, ic, ie, ib, id, if] as a plain function's coefficients: wx = a·fx + c·(H − fy)… (see worldAt). Kept as the draw matrix's inverse.
 */
export function worldAt(m, H, fx, fy, out = [0, 0]) {
  const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5];
  const det = a * d - b * c || 1e-9, dx = fx - e, dy = (H - fy) - f;   // (device y is down; the fragment's y is up)
  out[0] = (d * dx - c * dy) / det; out[1] = (-b * dx + a * dy) / det;
  return out;
}
/** World units per device pixel under a draw matrix. */
export const pxOf = (m) => 1 / Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]) || 1e-9);

// ── The app side: `?vecbench=<name>` ─────────────────────────────────────────────────────────────────────────────────────────────
// Runs the benchmark's camera on the live figure and writes the report where the ?perf panel shows it (vec-measure.js). It refuses when
// Vector is not the chosen renderer (it measures Vector; it never draws another renderer to compare, there are no hybrids). Loaded only by
// the ?vecbench address.

/** The route a benchmark takes in the app: the preset the model is put in, and the view. */
export function benchRoute(name) {
  const b = BENCHMARKS[name];
  if (!b) return null;
  if (b.scene === 'lobule') return { ...LOBULE_SCENES[name].route, lobule: true };
  return { preset: b.preset, lobule: false };
}

/**
 * Runs benchmark `name` on the app (`pps` = window.pps: loadPreset, store, stage) and returns its report text (also kept by vec-measure for
 * ?perf). `host` = { frameFor, measure, renderer } is injected so a test can drive it: frameFor(tag) → (cb) schedules a frame, measure =
 * the vec-measure instance (or null), renderer() → the chosen renderer's name.
 */
export async function runVecBench(name, pps, host) {
  const b = BENCHMARKS[name];
  if (!b) return `vecbench: unknown benchmark "${name}" (${BENCH_NAMES.join(', ')})`;
  if (host.renderer() !== 'vector') return `vecbench ${name}: the chosen renderer is "${host.renderer()}"; choose Vector in Settings › Display › Vessel renderer first (a benchmark never draws another renderer).`;
  const route = benchRoute(name), frame = host.frameFor(`vecbench ${name}`);
  const next = () => new Promise((r) => frame(r));
  if (route.preset) await pps.loadPreset(route.preset);
  const stage = pps.stage;
  if (b.scene === 'lobule') {
    pps.store.set({ lobule: true, lobuleLayers: { ...pps.store.get().lobuleLayers, ...LOBULE_SCENES[name].layers } });
    stage.lobuleFocus?.(route.cam === 'lobule:central' ? 'central' : 'sinusoid', { ms: 0 });
  } else {
    pps.store.set({ lobule: false });
    stage.setCamera?.(benchVT(name, 0), 1);
  }
  for (let i = 0; i < 90; i++) await next();   // settle: the kept picture is laid
  host.measure?.reset?.();
  const t0 = performance.now(), dts = [];
  let last = t0, frames = 0;
  const total = b.ms ?? 3000;
  for (;;) {
    await next();
    const now = performance.now();
    dts.push(now - last); last = now; frames++;
    if (b.scene === 'anatomy' && b.ms) stage.setCamera?.(benchVT(name, Math.min(1, (now - t0) / b.ms)), 1);
    if (now - t0 >= total) break;
  }
  dts.sort((x, y) => x - y);
  const q = (p) => dts[Math.min(dts.length - 1, Math.floor(p * dts.length))] ?? 0;
  const lines = [`vecbench ${name} (${b.about})`, `  ${frames} frames in ${((last - t0) / 1000).toFixed(1)} s; frame ms p50 ${q(0.5).toFixed(1)}, p95 ${q(0.95).toFixed(1)}, max ${(dts.at(-1) ?? 0).toFixed(1)}`];
  const m = host.measure?.text?.();
  if (m) lines.push(m); else lines.push('  (no GPU timer: add ?perf and use a browser that offers EXT_disjoint_timer_query_webgl2)');
  const report = lines.join('\n');
  host.measure?.setReport?.(report);
  return report;
}

/**
 * `?vecbench=<name>`: waits for the app (window.pps), runs the benchmark with the app's own frame scheduler and the current vec-measure, and
 * keeps the report for the ?perf panel (vec-measure.js vecWorkText) and the console. Called by main.js only when the address has ?vecbench.
 */
export async function startVecBench(name) {
  const wait = frameFor('vecbench start');
  for (let i = 0; i < 1200 && !(window.pps?.stage && window.pps.loadPreset); i++) await new Promise((r) => wait(r));
  const measure = { reset: () => currentMeasure()?.reset(), text: () => currentMeasure()?.text(), setReport: (t) => setLastReport(t) };
  const report = await runVecBench(name, window.pps, { frameFor, measure, renderer: vesselRenderer });
  setLastReport(report);
  console.log(report);
  return report;
}
