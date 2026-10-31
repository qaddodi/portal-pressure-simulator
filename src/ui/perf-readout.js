// The ?perf readout: what blocks frames in the 2 s after a pan, pinch or scroll-zoom of the figure ends, measured on the
// device itself (Mohammad, 21 Oct: "still lag after panning/zooming"). Loaded only when the address has ?perf (main.js);
// without it this file is never fetched and nothing changes. On, the app's own steps are timed as script time only
// (gpu-probe.js cpuOnly: no waiting for the GPU), every frame that missed the screen's refresh in the window is listed with the
// steps that ran in it (and every interval counted in a histogram at that refresh, with p50/p95/p99), and so is each long task the browser reports (Chrome; Safari reports none, its frame gaps still show). The panel is
// written only when a window closes, never during a gesture, and the last five gestures stay listed with a Copy button.
import { gpuProbe, COUNTED, TWICE, WHY, ROWS_REFUSED, BY, TISSUE_WHY } from './gpu-probe.js?v=b5449b0040';
import { perf } from './frame.js?v=9e0c25a14c';

const WINDOW = 2000, KEEP = 5, GAP_LINES = 40;
// The display's own refresh, as the browser offers it, from the frame intervals the readout sees (30 Oct, review 6a: a list of gaps
// over 20 ms could never show a missed frame at 120 Hz, whose frames are 8.3 ms apart, a missed one 16.7 ms). The rates screens run
// at; the measured one is the nearest to the lower quartile of the last 600 intervals (about 10 s, calm frames among them). Not the
// shortest ones: in Safari a frame that starts late is followed by a short one (a 26 ms interval, then 7), so the shortest tenth of a
// 60 Hz page under load had read as 144 Hz (his Mac readouts, 30 Oct). A quarter of the frames on time is enough.
const RATES = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
/** The refresh rate (Hz) closest to the lower quartile of `dts` (frame intervals, ms), or 0 with too few to tell. */
export function refreshOf(dts) {
  const v = dts.filter((d) => d > 2 && d < 100).sort((a, b) => a - b);
  if (v.length < 20) return 0;
  const hz = 1000 / v[Math.floor(v.length / 4)];
  return RATES.reduce((a, b) => (Math.abs(b - hz) < Math.abs(a - hz) ? b : a));
}
/** Frame intervals at a refresh of `hz`: how many came on time, one, two or three and more refreshes late, and p50/p95/p99 (ms). An
 *  interval is n refreshes long from (n - 0.5) to (n + 0.5) refreshes: at 120 Hz a frame is on time under 12.5 ms. */
export function intervalStats(dts, hz) {
  const per = 1000 / hz, bins = [0, 0, 0, 0];
  for (const d of dts) bins[Math.min(3, Math.max(0, Math.round(d / per) - 1))]++;
  const v = [...dts].sort((a, b) => a - b), q = (p) => (v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : 0);
  return { hz, per, bins, p50: q(0.5), p95: q(0.95), p99: q(0.99) };
}
/** The histogram as one line of the report. */
export function intervalLine(s) {
  if (!s) return '  frame intervals: too few to tell the refresh';
  const [on, one, two, more] = s.bins;
  return `  frame intervals at ${s.hz} Hz (${s.per.toFixed(1)} ms): on time ${on}, 1 missed ${one}, 2 missed ${two}, 3+ missed ${more}; p50 ${s.p50.toFixed(1)}, p95 ${s.p95.toFixed(1)}, p99 ${s.p99.toFixed(1)} ms`;
}
/** Each surface's callbacks and the frames it really drew (frame.js noteDraw) over a window, from two readings of perf().totals. */
export function surfaceLine(a, b) {
  const rows = Object.keys(b.asks).map((k) => [k, b.asks[k] - (a.asks[k] || 0), k in b.drawn ? b.drawn[k] - (a.drawn[k] || 0) : null]).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]);
  return rows.length ? `  surfaces (callbacks / draws): ${rows.map(([k, n, d]) => `${k} ${n}${d == null ? '' : ` / ${d}`}`).join(', ')}` : '';
}
const HIDES = ['', 'no live organs', 'no figure SVG', 'no labels', 'no GPU picture'];
// (What each leaves out, by CSS: the page then neither lays out nor paints it.)
const HIDE_CSS = {
  'no live organs': '#stageView svg#stage :is(#backdrop, #organs, #ascites, #ghosts) { visibility: hidden !important; }',
  'no figure SVG': '#stageView :is(svg#stage, svg#stageOver) { visibility: hidden !important; }',
  'no labels': '#stageView svg#labels, #stageView #labelGl { visibility: hidden !important; }',
};
let hideAt = 0;
// Notes counted frame by frame over a window (veins-gl.js composite): a frame that redrew the whole picture, a frame with the organ
// picture down (the live organs drawn by the page, as while the liver, the spleen or the fluid eases).
const TALLY = ['whole picture', 'organ picture down', 'gut live', 'gut picture', 'liver easing', 'fluid easing', 'spleen easing',
  ...['no picture', 'art changed', 'colours changed', 'zoomed past it', 'moved off its part', 'zoomed out past it', 'moved apart'].map((w) => `gut live: ${w}`)];

// Notes totalled over a window, by name (gpu-probe.js COUNTED): [times, KB, frames in which it came twice].
const COUNT_NAMES = new Set([...Object.values(COUNTED).filter((k) => !k.endsWith(' ')), ...WHY.map((w) => COUNTED.wholeWhy + w), ...ROWS_REFUSED.map((w) => COUNTED.rowsRefused + w),
  ...BY.flatMap((b) => [COUNTED.wholeBy + b, COUNTED.fboAllocBy + b]), ...TISSUE_WHY.map((w) => COUNTED.tissueWhy + w),
  ...['setGeometry', 'patchGeometry', 'setBend', 'noise', 'setTubes', 'setFlow', 'setDye', 'setFluidCells', 'setRadii', 'setOrgans', 'plateRows', 'setCath', 'setLines'].map((k) => `uploaded: ${k}`)]);

/**
 * One frame gap as a line: when after the gesture ended, how long, and the steps in it, largest first. What no step of the
 * app's accounts for is split, when the main thread's busy time is known (g.busy, from the heartbeat below), into the
 * browser's own work on the main thread ("page busy": style, layout, paint, reading an SVG, other script) and the time the
 * main thread sat free while the frame still had not come ("waiting (GPU/screen)": the GPU, or Safari's painting off the
 * main thread). Notes (g.notes: name → [count, KB]) follow, such as the organ SVGs read in that frame.
 */
export function gapLine(g) {
  const named = Object.entries(g.parts).filter(([, v]) => v >= 0.5).sort((a, b) => b[1] - a[1]);
  const sum = Object.values(g.parts).reduce((a, b) => a + b, 0), rest = Math.max(0, g.dt - sum);
  const page = g.busy == null ? null : Math.min(rest, Math.max(0, g.busy - sum));
  const tail = page == null ? [`rest of page ${rest.toFixed(0)}`] : [`page busy ${page.toFixed(0)}`, `waiting (GPU/screen) ${(rest - page).toFixed(0)}`];
  const steps = [...named.map(([k, v]) => `${k} ${v.toFixed(0)}`), ...tail].join(', ');
  const notes = Object.entries(g.notes || {}).map(([k, [n, kb]]) => `${k} ×${n}${kb ? ` (${kb.toFixed(0)} KB)` : ''}`).join(', ');
  return `  +${g.at.toFixed(0)} ms: frame took ${g.dt.toFixed(0)} ms (${steps})${notes ? `; ${notes}` : ''}`;
}

/** A gesture's report as text. */
export function gestureText(r) {
  const head = `#${r.n} ${r.kind} in ${r.view}, zoom ${r.zoom}, ${r.frames} frames in ${((r.win || WINDOW) / 1000).toFixed(0)} s, worst ${r.worst.toFixed(0)} ms${r.gpu ? ', GPU timed (gl.finish waits for the GPU: frame times slower than shipped)' : ''}${r.orgs ? ', GPU organs' : ''}${r.hide ? `, TEST: ${r.hide}` : ''}`;
  const gauges = Object.entries(r.gauges || {}).filter(([, v]) => v).map(([k, v]) => `  ${k}: ${v}`);
  // (The frame intervals as a histogram at the screen's own refresh, and each surface's callbacks against its real draws.)
  if (r.stats !== undefined) gauges.unshift(intervalLine(r.stats));
  if (r.surfaces) gauges.push(r.surfaces);
  // (Frames counted by what they drew, over the whole window: the whole picture redrawn, the organ picture down.)
  const tally = Object.entries(r.tally || {}).map(([k, n]) => `${k} in ${n} of ${r.frames} frames`);
  if (tally.length) gauges.push(`  ${tally.join(', ')}`);
  // (What the window did, by name: the vessel layer's whole draws and why, pan shifts, the pictures submitted and how often one
  // surface drew twice in a frame, uploads in KB, and the work a moving camera should not need. Totals over the window, not rates.)
  const counted = Object.entries(r.counts || {}).map(([k, [n, kb, two]]) => `${k} ×${n}${kb ? ` (${kb.toFixed(0)} KB)` : ''}${two ? `, ${two} frames with two` : ''}`);
  if (counted.length) gauges.push(`  counted: ${counted.join('; ')}`);
  // (Every frame that missed a refresh, at most GAP_LINES of them, the slowest kept; in the order they came.)
  const shown = r.gaps.length > GAP_LINES ? r.gaps.slice().sort((a, b) => b.dt - a.dt).slice(0, GAP_LINES).sort((a, b) => a.at - b.at) : r.gaps;
  const gaps = r.gaps.length ? [...shown.map(gapLine), ...(r.gaps.length > GAP_LINES ? [`  and ${r.gaps.length - GAP_LINES} shorter missed frames`] : [])] : [`  no frame missed${r.limit ? ` (none over ${r.limit.toFixed(1)} ms)` : ''}`];
  const tasks = r.tasks.map((t) => `  long task +${t.at.toFixed(0)} ms: ${t.dt.toFixed(0)} ms${t.src ? ` (${t.src})` : ''}`);
  return [head, ...gauges, ...gaps, ...tasks].join('\n');
}

export function startPerfReadout({ zoom = () => '?' } = {}) {
  gpuProbe.cpuOnly = true; gpuProbe.on = true; gpuProbe.take();
  const reports = [];
  let n = 0, cur = null, prevT = 0, prevTs = 0, wheelT = 0;
  const recent = [];   // (the last 600 frame intervals, for the refresh)
  const down = new Map();
  let maxDown = 0, moved = false;
  const onStage = (e) => !!e.target?.closest?.('#stageView');
  const view = () => (document.querySelector('.cmap') ? 'circuit' : 'anatomy');
  // A heartbeat on the main thread while a gesture's window is open: a timer set again each time it fires. A beat that comes
  // late shows the main thread was busy that long (the browser's own work included, which no step of the app's can time);
  // beats on time while a frame is late show the main thread was free, waiting for the GPU or the screen. A timer, not a
  // message posted to itself as fast as it arrives: that kept the main thread always busy, and on a Mac the frames came at
  // 7 a second while it ran (his readout on 2679f67, 21 Oct), so it may have slowed what it measured. A nested timer fires
  // every 4 ms or so: a beat counts as late past 8 ms, less the 4 ms it would have waited anyway.
  let beatAt = 0, busy = 0, frameAt = 0, beatT = 0;
  const beat = () => {
    const b = performance.now(), gap = b - beatAt;
    if (gap > 8) busy += Math.max(0, Math.min(gap, b - frameAt) - 4);   // (the part of the stall since this frame began)
    beatAt = b;
    beatT = cur ? setTimeout(beat, 0) : 0;
  };
  const begin = (kind, win = WINDOW) => {
    const was = !!cur;
    cur = { n: ++n, kind, win, tally: {}, counts: {}, view: view(), zoom: (+zoom() || 0).toFixed(2), t0: performance.now(), frames: 0, worst: 0, gaps: [], tasks: [], gauges: {}, gpu: !gpuProbe.cpuOnly, hide: HIDES[hideAt], orgs: gpuProbe.gpuOrgans, dts: [], totals: perf().totals };
    gpuProbe.take(); gpuProbe.takeNotes(); gpuProbe.takeGauges();
    if (!was && !beatT) { beatAt = performance.now(); busy = 0; beatT = setTimeout(beat, 0); }
  };
  addEventListener('pointerdown', (e) => { if (!onStage(e)) return; down.set(e.pointerId, [e.clientX, e.clientY]); maxDown = Math.max(maxDown, down.size); if (down.size === 1) moved = false; }, { capture: true, passive: true });
  addEventListener('pointermove', (e) => { const p = down.get(e.pointerId); if (p && Math.hypot(e.clientX - p[0], e.clientY - p[1]) > 8) moved = true; }, { capture: true, passive: true });
  const up = (e) => {
    if (!down.delete(e.pointerId) || down.size) return;
    if (moved) begin(maxDown > 1 ? 'pinch' : 'pan');
    maxDown = 0; moved = false;
  };
  addEventListener('pointerup', up, { capture: true, passive: true });
  addEventListener('pointercancel', up, { capture: true, passive: true });
  // A scroll or trackpad pinch ends when no wheel event has come for 150 ms (the window then starts at its last event).
  addEventListener('wheel', (e) => {
    if (!onStage(e)) return;
    clearTimeout(wheelT);
    const kind = e.ctrlKey ? 'trackpad pinch' : 'scroll', at = performance.now();
    wheelT = setTimeout(() => { begin(kind); cur.t0 = at; }, 150);
  }, { capture: true, passive: true });
  try {
    new PerformanceObserver((list) => {
      for (const t of list.getEntries()) {
        if (!cur || t.startTime < cur.t0) continue;
        const s = t.scripts?.slice().sort((a, b) => b.duration - a.duration)[0];
        const src = s ? `${s.sourceFunctionName || s.invoker || '?'} ${(s.sourceURL || '').split('/').pop().split('?')[0]} ${s.duration.toFixed(0)} ms` : t.attribution?.[0]?.name || '';
        cur.tasks.push({ at: t.startTime - cur.t0, dt: t.duration, src });
      }
    }).observe({ type: PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame') ? 'long-animation-frame' : 'longtask', buffered: false });
  } catch { /* not reported by this browser (Safari): the frame gaps still are */ }

  // (Timed by the clock when this callback runs, not by the frame's shared timestamp: the steps taken here ran since the last call,
  // so they fall inside the interval they are listed with. With the timestamp, work in other callbacks of a frame was set against
  // the wrong interval: a 24 ms frame with 139 ms of Doppler in it (external review, 21 Oct).)
  // (The intervals the refresh and the histogram are told from are the frames' own timestamps (ts): the clock at a callback's run moves
  // with the work done before it in that frame, so a late callback then an early one had looked 6 ms apart on a 60 Hz screen, and the
  // refresh was taken as 100 to 165 Hz; his Mac readout, 30 Oct.)
  const tick = (ts) => {
    const t = performance.now();
    const parts = gpuProbe.take(), notes = gpuProbe.takeNotes(), gauges = gpuProbe.takeGauges(), was = busy;
    if (cur) {
      Object.assign(cur.gauges, gauges); for (const k of TALLY) if (notes[k]) cur.tally[k] = (cur.tally[k] || 0) + 1;
      for (const k in notes) if (COUNT_NAMES.has(k)) { const c = cur.counts[k] || (cur.counts[k] = [0, 0, 0]); c[0] += notes[k][0]; c[1] += notes[k][1]; if (notes[k][0] > 1 && TWICE.has(k)) c[2]++; }
    }
    busy = 0; frameAt = t;
    // (Every interval, gesture or not, goes into the last few seconds the refresh is told from.)
    const fdt = prevTs && ts > prevTs ? ts - prevTs : 0;
    if (fdt) { recent.push(fdt); if (recent.length > 600) recent.splice(0, recent.length - 600); }
    if (cur && prevT && t >= cur.t0) {
      const dt = t - prevT, at = prevT - cur.t0;
      cur.frames++; cur.worst = Math.max(cur.worst, dt); if (fdt) cur.dts.push(fdt);
      // (A frame missed its refresh past 1.5 of them: 12.5 ms at 120 Hz, 25 ms at 60. Before the refresh is known, 20 ms as before.)
      const hz = refreshOf(recent), limit = hz ? 1500 / hz : 20;
      if (dt > limit) cur.gaps.push({ at: Math.max(0, at), dt, parts, notes, busy: was });
      if (t - cur.t0 >= cur.win) {
        cur.limit = limit;
        cur.stats = hz ? intervalStats(cur.dts, hz) : null;
        cur.surfaces = surfaceLine(cur.totals, perf().totals);
        cur.dts = cur.totals = null;
        reports.unshift(cur); reports.length = Math.min(reports.length, KEEP); cur = null; paint();
      }
    }
    prevT = t; prevTs = ts > 0 ? ts : 0;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // The panel: top left under the top bar, small, folded to one line by a tap on its title. It takes taps only on itself.
  const el = document.createElement('div');
  el.id = 'perfReadout';
  el.style.cssText = 'position:fixed;left:max(8px, env(safe-area-inset-left));top:calc(56px + env(safe-area-inset-top));z-index:2147483000;max-width:min(560px, calc(100vw - 16px));max-height:40vh;overflow:auto;padding:6px 8px;border-radius:8px;background:rgb(0 0 0 / .72);color:#fff;font:600 12px/1.4 ui-monospace,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;-webkit-user-select:text;user-select:text';   // colour-exempt: a measuring panel
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center';
  const title = document.createElement('button');
  const copy = document.createElement('button');
  // A window with no gesture before it, begun a second after the tap: what every frame costs with the figure left alone, to
  // tell a gesture's after-effects from the view's own cost (his Mac at zoom 7.5, 21 Oct: about 30 ms of page work a frame,
  // still there 2 s after the scroll).
  const rest = document.createElement('button');
  // GPU timing: each timed step then waits for the GPU before and after it (gpu-probe.js), so "picture" (the blood's frame) and
  // "vessels" show their GPU time, not just the moment they were queued. That slows the page a little, so it starts off.
  const gpu = document.createElement('button');
  const gpuLabel = () => { gpu.textContent = gpuProbe.cpuOnly ? 'GPU timing off' : 'GPU timing on (slows frames)'; };
  gpu.onclick = () => { gpuProbe.cpuOnly = !gpuProbe.cpuOnly; gpuLabel(); };
  gpuLabel();
  // Record: 6 s from the tap, for a change that runs by itself (a slide stepping healthy to cirrhosis, the fluid filling, a
  // preset easing in; Mohammad, 21 Oct: "very laggy" while the ascites fills and the varices grow). Tap, then start the change.
  // Test switch, for a recording only: leave out the live organs (the page's own drawing of them, shown while the organ picture is
  // down), the whole figure's SVG, its labels, or the GPU's picture (the vessels' screen frames are skipped), to see which one the slow frames are. The figure looks wrong
  // while one is on; a tap goes on to the next, back to "Test: none". (External review, 21 Oct: tell the page's painting from the
  // GPU's by leaving each out.)
  const hide = document.createElement('button');
  const hideStyle = document.createElement('style');
  const hideLabel = () => { hide.textContent = `Test: ${HIDES[hideAt] || 'none'}`; };
  hide.onclick = () => {
    hideAt = (hideAt + 1) % HIDES.length;
    hideStyle.textContent = HIDE_CSS[HIDES[hideAt]] || '';
    if (!hideStyle.isConnected) document.head.append(hideStyle);
    gpuProbe.skipGL = HIDES[hideAt] === 'no GPU picture';
    hideLabel();
  };
  hideLabel();
  // The organs drawn as layers on the GPU instead of one picture (organs-gl.js): the same look, for trying before it is the default.
  const orgs = document.createElement('button');
  const orgsLabel = () => { orgs.textContent = gpuProbe.gpuOrgans ? 'GPU organs on' : 'GPU organs off'; };
  orgs.onclick = () => { gpuProbe.gpuOrgans = !gpuProbe.gpuOrgans; orgsLabel(); gpuProbe.onOrgans?.(); };
  orgsLabel();
  const rec = document.createElement('button');
  rec.textContent = 'Record 6 s';
  rec.onclick = () => { begin('recording', 6000); rec.textContent = 'Recording…'; setTimeout(() => { rec.textContent = 'Record 6 s'; }, 6000); };
  for (const b of [title, rest, rec, hide, gpu, orgs, copy]) b.style.cssText = 'font:inherit;color:#fff;background:rgb(255 255 255 / .16);border:0;border-radius:6px;padding:4px 8px;min-height:28px';   // colour-exempt
  title.textContent = 'Lag after gestures (tap to fold)';
  copy.textContent = 'Copy';
  rest.textContent = 'At rest';
  rest.onclick = () => { rest.textContent = 'Wait 3 s'; setTimeout(() => { begin('at rest'); setTimeout(() => { rest.textContent = 'At rest'; }, 2000); }, 1000); };
  const body = document.createElement('div');
  body.textContent = 'Pan, pinch or scroll-zoom the figure, then let go and wait 2 s.';
  bar.append(title, rest, rec, hide, gpu, orgs, copy); el.append(bar, body);
  let folded = false;
  title.onclick = () => { folded = !folded; body.style.display = folded ? 'none' : ''; };
  const text = () => [`${navigator.userAgent}`, `screen ${innerWidth}x${innerHeight} @${devicePixelRatio}x, refresh offered to the page ${refreshOf(recent) || '?'} Hz, ${location.pathname}${document.getElementById('preview-badge') ? ` ${document.getElementById('preview-badge').textContent.trim()}` : ''}`, ...reports.map(gestureText)].join('\n\n');
  copy.onclick = async () => {
    const t = text();
    try { await navigator.clipboard.writeText(t); copy.textContent = 'Copied'; } catch {
      const ta = document.createElement('textarea'); ta.value = t; document.body.append(ta); ta.select();
      try { document.execCommand('copy'); copy.textContent = 'Copied'; } catch { copy.textContent = 'Select the text'; }
      ta.remove();
    }
    setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
  };
  function paint() { body.textContent = reports.map(gestureText).join('\n\n'); }
  document.body.append(el);
}
