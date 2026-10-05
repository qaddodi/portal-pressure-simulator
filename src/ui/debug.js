// Debug overlay: FPS and frame time, zoom, pixel ratio and build. Off by default; choices persist.
const KEY = 'pps.debug';
const OPTS = [['fps', 'FPS and frame time'], ['zoom', 'Zoom level and scale'], ['res', 'Render resolution scale'], ['build', 'Build commit']];
let st = {};
try { st = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { st = {}; }
let el = null, raf = 0, last = 0, acc = 0, n = 0, fps = 0, ms = 0, build = '', getZoom = null;
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
  if (st.build && !build) {
    build = '…';
    fetch('preview-info.txt', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).then((t) => { build = (t.match(/[0-9a-f]{7,40}/i) || ['main'])[0].slice(0, 7); }).catch(() => { build = 'n/a'; });
  }
  if (!el) {
    el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483000;pointer-events:none;padding:4px 8px;border-radius:8px;background:rgba(0,0,0,.65);color:#fff;font:600 11px/1.5 ui-monospace,monospace;white-space:pre';
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);
  }
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
}
function tick(t) {
  raf = requestAnimationFrame(tick);
  acc += t - last; last = t; n++;
  if (acc < 500) return;
  ms = acc / n; fps = 1000 / ms; acc = 0; n = 0;
  const L = [];
  if (st.fps) L.push(`${fps.toFixed(0)} fps · ${ms.toFixed(1)} ms`);
  if (st.zoom) { let z = ''; try { z = getZoom ? Number(getZoom()).toFixed(2) : ''; } catch { /* no stage yet */ } L.push(`zoom ${z}×`); }
  if (st.res) L.push(`pixel ratio ${devicePixelRatio} · ${Math.round(innerWidth * devicePixelRatio)}×${Math.round(innerHeight * devicePixelRatio)}`);
  if (st.build) L.push(`build ${build}`);
  if (el) el.textContent = L.join('\n');
}
