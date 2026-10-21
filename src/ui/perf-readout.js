// The ?perf readout: what blocks frames in the 2 s after a pan, pinch or scroll-zoom of the figure ends, measured on the
// device itself (Mohammad, 21 Oct: "still lag after panning/zooming"). Loaded only when the address has ?perf (main.js);
// without it this file is never fetched and nothing changes. On, the app's own steps are timed as script time only
// (gpu-probe.js cpuOnly: no waiting for the GPU), every frame gap over 20 ms in the window is listed with the steps that ran
// in it, and so is each long task the browser reports (Chrome; Safari reports none, its frame gaps still show). The panel is
// written only when a window closes, never during a gesture, and the last five gestures stay listed with a Copy button.
import { gpuProbe } from './gpu-probe.js?v=3b01ed5294';

const WINDOW = 2000, GAP = 20, KEEP = 5;

/** One frame gap as a line: when after the gesture ended, how long, and the steps in it, largest first. */
export function gapLine(g) {
  const named = Object.entries(g.parts).filter(([, v]) => v >= 0.5).sort((a, b) => b[1] - a[1]);
  const sum = Object.values(g.parts).reduce((a, b) => a + b, 0);
  const steps = [...named.map(([k, v]) => `${k} ${v.toFixed(0)}`), `rest of page ${Math.max(0, g.dt - sum).toFixed(0)}`].join(', ');
  return `  +${g.at.toFixed(0)} ms: frame took ${g.dt.toFixed(0)} ms (${steps})`;
}

/** A gesture's report as text. */
export function gestureText(r) {
  const head = `#${r.n} ${r.kind} in ${r.view}, zoom ${r.zoom}, ${r.frames} frames in 2 s, worst ${r.worst.toFixed(0)} ms`;
  const gaps = r.gaps.length ? r.gaps.map(gapLine) : ['  no frame over 20 ms'];
  const tasks = r.tasks.map((t) => `  long task +${t.at.toFixed(0)} ms: ${t.dt.toFixed(0)} ms${t.src ? ` (${t.src})` : ''}`);
  return [head, ...gaps, ...tasks].join('\n');
}

export function startPerfReadout({ zoom = () => '?' } = {}) {
  gpuProbe.cpuOnly = true; gpuProbe.on = true; gpuProbe.take();
  const reports = [];
  let n = 0, cur = null, prevT = 0, wheelT = 0;
  const down = new Map();
  let maxDown = 0, moved = false;
  const onStage = (e) => !!e.target?.closest?.('#stageView');
  const view = () => (document.querySelector('.cmap') ? 'circuit' : 'anatomy');
  const begin = (kind) => {
    cur = { n: ++n, kind, view: view(), zoom: (+zoom() || 0).toFixed(2), t0: performance.now(), frames: 0, worst: 0, gaps: [], tasks: [] };
    gpuProbe.take();
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
    const parts = gpuProbe.take();
    if (cur && prevT && t >= cur.t0) {
      const dt = t - prevT, at = prevT - cur.t0;
      cur.frames++; cur.worst = Math.max(cur.worst, dt);
      if (dt > GAP) cur.gaps.push({ at: Math.max(0, at), dt, parts });
      if (t - cur.t0 >= WINDOW) { reports.unshift(cur); reports.length = Math.min(reports.length, KEEP); cur = null; paint(); }
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
  bar.style.cssText = 'display:flex;gap:8px;align-items:center';
  const title = document.createElement('button');
  const copy = document.createElement('button');
  for (const b of [title, copy]) b.style.cssText = 'font:inherit;color:#fff;background:rgb(255 255 255 / .16);border:0;border-radius:6px;padding:4px 8px;min-height:28px';   // colour-exempt
  title.textContent = 'Lag after gestures (tap to fold)';
  copy.textContent = 'Copy';
  const body = document.createElement('div');
  body.textContent = 'Pan, pinch or scroll-zoom the figure, then let go and wait 2 s.';
  bar.append(title, copy); el.append(bar, body);
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
