// The page's end of the figure worker (figure-worker.js). startFigureWorker moves the figure's canvas to a worker, which makes the
// renderer there, and resolves to a renderer-shaped proxy (figure-link.js) once it has answered, or to null wherever the figure must
// stay on the page: no Worker, OffscreenCanvas or transferControlToOffscreen, a worker that errs or never answers, or no WebGL2 there.
// Not used unless ?figworker=on.

import { createFigureProxy } from './figure-link.js?v=6d7cdf964d';
import { FIGURE_TOKENS, figureRGB } from './figure-settings.js?v=68c0336f5f';

const WAIT_MS = 10000;

/** The colour tokens and query string the renderer reads, as the worker is given them (sent whole, on every change). */
export function figureSettings() {
  const tokens = {};
  for (const k of FIGURE_TOKENS) { const c = figureRGB(k); tokens[k] = `rgb(${c[0]}, ${c[1]}, ${c[2]})`; }
  return { tokens, search: location.search };
}

export const figWorkerWanted = () => /[?&]figworker=on\b/.test(location.search);

export function startFigureWorker(canvas, { tubes, make = () => new Worker(new URL('./figure-worker.js?v=5cd5880126', import.meta.url), { type: 'module' }) }) {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof canvas.transferControlToOffscreen !== 'function') return Promise.resolve(null);
  return new Promise((res) => {
    let w = null, proxy = null, done = false;
    const finish = (v) => { if (done) return; done = true; clearTimeout(t); if (!v) { try { w?.terminate(); } catch { /* gone */ } } res(v); };
    const t = setTimeout(() => finish(null), WAIT_MS);
    try {
      w = make();
      w.onerror = () => finish(null);
      w.onmessageerror = () => finish(null);
      w.onmessage = ({ data }) => {
        if (data?.type === 'failed') { finish(null); return; }
        if (data?.type === 'ready') {
          const { plates, stack, ...caps } = data.state;
          proxy = createFigureProxy((m, tr) => w.postMessage(m, tr), { ...caps, plates, stack });
          proxy.stop = () => { try { w.terminate(); } catch { /* gone */ } };
          finish(proxy);
          return;
        }
        if (data?.type === 'state' && proxy) proxy.take(data.state);
      };
      const off = canvas.transferControlToOffscreen();
      w.postMessage({ type: 'init', canvas: off, tubes, settings: figureSettings() }, [off]);
    } catch { finish(null); }
  });
}
