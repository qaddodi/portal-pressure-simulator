// Debug overlay: FPS and frame time, zoom, pixel ratio and build. Off by default; choices persist.
const KEY = 'pps.debug';
const OPTS = [['fps', 'FPS and frame time'], ['zoom', 'Zoom level and scale'], ['res', 'Render resolution scale'], ['graph', 'Frame graph']];
let st = {};
try { st = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { st = {}; }
let stamps = [], cv = null, hist = [], el = null, raf = 0, last = 0, fps = 0, ms = 0, getZoom = null;
const any = () => OPTS.some(([k]) => st[k]);
export const debugOptions = () => OPTS;
export const debugOn = (k) => !!st[k];
export function initDebug(zoomFn) { getZoom = zoomFn; sync(); }
export function setDebug(k, on) {
  st = { ...st, [k]: !!on };
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* private mode */ }
  sync();
}
function sync() {
  if (!any()) { cancelAnimationFrame(raf); raf = 0; el?.remove(); el = null; return; }
  if (!el) {
    el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:8px;top:calc(64px + env(safe-area-inset-top));z-index:2147483000;pointer-events:none;padding:4px 8px;border-radius:8px;background:rgba(0,0,0,.65);color:#fff;font:600 11px/1.5 ui-monospace,monospace;white-space:pre';
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);
  }
  if (st.graph && !cv) { cv = document.createElement('canvas'); cv.width = 240; cv.height = 40; cv.style.cssText = 'display:block;margin-top:4px'; el.append(cv); }
  if (!st.graph && cv) { cv.remove(); cv = null; }
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
}
function tick(t) {
  raf = requestAnimationFrame(tick);
  stamps.push(t);
  while (stamps[0] < t - 1000) stamps.shift();
  if (t - last < 100) return;
  last = t;
  fps = stamps.length > 1 ? ((stamps.length - 1) * 1000) / (t - stamps[0]) : 0; ms = fps ? 1000 / fps : 0;
  hist.push(fps); if (hist.length > 150) hist.shift();
  const L = [];
  if (st.fps) L.push(`${fps.toFixed(0)} fps · ${ms.toFixed(1)} ms`);
  if (st.zoom) { let z = ''; try { z = getZoom ? Number(getZoom()).toFixed(2) : ''; } catch { /* no stage yet */ } L.push(`zoom ${z}×`); }
  if (st.res) L.push(`pixel ratio ${devicePixelRatio} · ${Math.round(innerWidth * devicePixelRatio)}×${Math.round(innerHeight * devicePixelRatio)}`);
  if (el) {
    let tn = el.firstChild;
    if (!tn || tn.nodeType !== 3) { tn = document.createTextNode(''); el.prepend(tn); }
    tn.nodeValue = L.join('\n');
  }
  if (cv) {
    const g = cv.getContext('2d'), Y = (f) => 40 - Math.min(f, 60) * (38 / 60) - 1;
    g.clearRect(0, 0, 240, 40);
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1; g.beginPath();
    for (const f of [30, 60]) { g.moveTo(0, Y(f)); g.lineTo(240, Y(f)); }
    g.stroke();
    g.strokeStyle = '#7dd3fc'; g.lineWidth = 1.5; g.beginPath();
    hist.forEach((v, i) => { const x = (i / 149) * 240; i ? g.lineTo(x, Y(v)) : g.moveTo(x, Y(v)); });
    g.stroke();
  }
}
