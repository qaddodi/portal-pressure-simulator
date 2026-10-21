// The ?perf readout: what blocks frames in the 2 s after a pan, pinch or scroll-zoom of the figure ends, measured on the
// device itself (Mohammad, 21 Oct: "still lag after panning/zooming"). Loaded only when the address has ?perf (main.js);
// without it this file is never fetched and nothing changes. On, the app's own steps are timed as script time only
// (gpu-probe.js cpuOnly: no waiting for the GPU), every frame gap over 20 ms in the window is listed with the steps that ran
// in it, and so is each long task the browser reports (Chrome; Safari reports none, its frame gaps still show). The panel is
// written only when a window closes, never during a gesture, and the last five gestures stay listed with a Copy button.
import { gpuProbe } from './gpu-probe.js?v=55e394c081';

const WINDOW = 2000, GAP = 20, KEEP = 5;
// Notes counted frame by frame over a window (veins-gl.js composite): a frame that redrew the whole picture, a frame with the organ
// picture down (the live organs drawn by the page, as while the liver, the spleen or the fluid eases).
const TALLY = ['whole picture', 'organ picture down', 'gut live', 'gut picture', 'liver easing', 'fluid easing', 'spleen easing'];

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
  const head = `#${r.n} ${r.kind} in ${r.view}, zoom ${r.zoom}, ${r.frames} frames in ${((r.win || WINDOW) / 1000).toFixed(0)} s, worst ${r.worst.toFixed(0)} ms${r.gpu ? ', GPU timed' : ''}`;
  const gauges = Object.entries(r.gauges || {}).filter(([, v]) => v).map(([k, v]) => `  ${k}: ${v}`);
  // (Frames counted by what they drew, over the whole window: the whole picture redrawn, the organ picture down.)
  const tally = Object.entries(r.tally || {}).map(([k, n]) => `${k} in ${n} of ${r.frames} frames`);
  if (tally.length) gauges.push(`  ${tally.join(', ')}`);
  const gaps = r.gaps.length ? r.gaps.map(gapLine) : ['  no frame over 20 ms'];
  const tasks = r.tasks.map((t) => `  long task +${t.at.toFixed(0)} ms: ${t.dt.toFixed(0)} ms${t.src ? ` (${t.src})` : ''}`);
  return [head, ...gauges, ...gaps, ...tasks].join('\n');
}

export function startPerfReadout({ zoom = () => '?' } = {}) {
  gpuProbe.cpuOnly = true; gpuProbe.on = true; gpuProbe.take();
  const reports = [];
  let n = 0, cur = null, prevT = 0, wheelT = 0;
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
    cur = { n: ++n, kind, win, tally: {}, view: view(), zoom: (+zoom() || 0).toFixed(2), t0: performance.now(), frames: 0, worst: 0, gaps: [], tasks: [], gauges: {}, gpu: !gpuProbe.cpuOnly };
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

  const tick = (t) => {
    const parts = gpuProbe.take(), notes = gpuProbe.takeNotes(), gauges = gpuProbe.takeGauges(), was = busy;
    if (cur) { Object.assign(cur.gauges, gauges); for (const k of TALLY) if (notes[k]) cur.tally[k] = (cur.tally[k] || 0) + 1; }
    busy = 0; frameAt = t;
    if (cur && prevT && t >= cur.t0) {
      const dt = t - prevT, at = prevT - cur.t0;
      cur.frames++; cur.worst = Math.max(cur.worst, dt);
      if (dt > GAP) cur.gaps.push({ at: Math.max(0, at), dt, parts, notes, busy: was });
      if (t - cur.t0 >= cur.win) { reports.unshift(cur); reports.length = Math.min(reports.length, KEEP); cur = null; paint(); }
    }
    prevT = t;
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
  const gpuLabel = () => { gpu.textContent = gpuProbe.cpuOnly ? 'GPU timing off' : 'GPU timing on'; };
  gpu.onclick = () => { gpuProbe.cpuOnly = !gpuProbe.cpuOnly; gpuLabel(); };
  gpuLabel();
  // Record: 6 s from the tap, for a change that runs by itself (a slide stepping healthy to cirrhosis, the fluid filling, a
  // preset easing in; Mohammad, 21 Oct: "very laggy" while the ascites fills and the varices grow). Tap, then start the change.
  const rec = document.createElement('button');
  rec.textContent = 'Record 6 s';
  rec.onclick = () => { begin('recording', 6000); rec.textContent = 'Recording…'; setTimeout(() => { rec.textContent = 'Record 6 s'; }, 6000); };
  for (const b of [title, rest, rec, gpu, copy]) b.style.cssText = 'font:inherit;color:#fff;background:rgb(255 255 255 / .16);border:0;border-radius:6px;padding:4px 8px;min-height:28px';   // colour-exempt
  title.textContent = 'Lag after gestures (tap to fold)';
  copy.textContent = 'Copy';
  rest.textContent = 'At rest';
  rest.onclick = () => { rest.textContent = 'Wait 3 s'; setTimeout(() => { begin('at rest'); setTimeout(() => { rest.textContent = 'At rest'; }, 2000); }, 1000); };
  const body = document.createElement('div');
  body.textContent = 'Pan, pinch or scroll-zoom the figure, then let go and wait 2 s.';
  bar.append(title, rest, rec, gpu, copy); el.append(bar, body);
  let folded = false;
  title.onclick = () => { folded = !folded; body.style.display = folded ? 'none' : ''; };
  const text = () => [`${navigator.userAgent}`, `screen ${innerWidth}x${innerHeight} @${devicePixelRatio}x, ${location.pathname}${document.getElementById('preview-badge') ? ` ${document.getElementById('preview-badge').textContent.trim()}` : ''}`, ...reports.map(gestureText)].join('\n\n');
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
