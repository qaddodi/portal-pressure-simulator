// The page's end of the figure worker (figure-worker.js). startFigureWorker starts a worker and asks what its renderer can do (it
// makes one on a 1 px canvas and drops it); it resolves to { canvas, proxy, begin }, or to null wherever the figure must stay on the
// page: no Worker, OffscreenCanvas or transferControlToOffscreen, a worker that errs or never answers, or no WebGL2 there. The stage
// then calls begin(tubes), which moves the canvas to the worker and has it make the renderer proper; the proxy (figure-link.js) has
// the renderer's calls from then on. If the worker fails after that, the proxy reads as a lost context and the canvas fires
// webglcontextlost, which brings the SVG figure back (stage.js).
// Used only with ?figworker=on.

import { createFigureProxy } from './figure-link.js?v=0f7b4f24f0';
import { FIGURE_TOKENS, figureRGB } from './figure-settings.js?v=68c0336f5f';

const WAIT_MS = 10000;

/** The colour tokens and query string the renderer reads, as the worker is given them (sent whole, on every change). */
export function figureSettings() {
  const tokens = {};
  for (const k of FIGURE_TOKENS) { const c = figureRGB(k); tokens[k] = `rgb(${c[0]}, ${c[1]}, ${c[2]})`; }
  return { tokens, search: location.search };
}

export const figWorkerWanted = () => /[?&]figworker=on\b/.test(location.search);

export function startFigureWorker({ make = () => new Worker(new URL('./figure-worker.js?v=8e7e866e00', import.meta.url), { type: 'module' }), canvas = document.createElement('canvas') } = {}) {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof canvas.transferControlToOffscreen !== 'function') return Promise.resolve(null);
  return new Promise((res) => {
    let w = null, proxy = null, done = false, begun = false, cropId = 0;
    const crops = new Map();
    // The labels' canvas, moved to the worker when label-gl asks (`remote`); if anything goes wrong there it reads as a lost context, which
    // hands every label back to the SVG (label-gl.js).
    let labelCanvas = null;
    const labelsLost = () => { try { labelCanvas?.dispatchEvent(new Event('webglcontextlost', { cancelable: true })); } catch { /* none */ } };
    const labels = {
      attach(cv) { labelCanvas = cv; const off = cv.transferControlToOffscreen(); w.postMessage({ type: 'lbl-init', canvas: off }, [off]); },
      sprite(page, x, y, bitmap) { try { w.postMessage({ type: 'lbl-sprite', page, x, y, bitmap }, [bitmap]); } catch { labelsLost(); } },
      frame(items, W, H) {
        const a = new Float32Array(items.length * 8);
        items.forEach((it, i) => a.set([it.page, it.x, it.y, it.w, it.h, it.ax, it.ay, it.a], i * 8));
        try { w.postMessage({ type: 'lbl-frame', items: a, W, H }, [a.buffer]); } catch { labelsLost(); }
      },
      resize(wd, ht) { try { w.postMessage({ type: 'lbl-resize', w: wd, h: ht }); } catch { labelsLost(); } },
    };
    const lose = () => {
      if (proxy) { proxy.take({ lost: true }); try { canvas.dispatchEvent(new Event('webglcontextlost')); } catch { /* none */ } }
      try { w?.terminate(); } catch { /* gone */ }
    };
    const finish = (v) => { if (done) return; done = true; clearTimeout(t); if (!v) { try { w?.terminate(); } catch { /* gone */ } } res(v); };
    const t = setTimeout(() => finish(null), WAIT_MS);
    try {
      w = make();
      w.onerror = () => (done && begun ? lose() : finish(null));
      w.onmessageerror = w.onerror;
      w.onmessage = ({ data }) => {
        if (data?.type === 'failed') { if (done && begun) lose(); else finish(null); return; }
        if (data?.type === 'probed') {
          const { plates, stack, ...caps } = data.state;
          // (No organ layers across the worker yet: the stage keeps the organs as one picture, organ-wire.js is the way to the layers.)
          const post = (m, tr) => { try { w.postMessage(m, tr); } catch (e) { console.warn('Figure worker: a call could not be sent; the figure goes back to the page.', e); lose(); } };
          proxy = createFigureProxy(post, { ...caps, plates, stack, hasOrgans: false, canLive: false }, { auto: true });
          proxy.stop = () => { try { w.terminate(); } catch { /* gone */ } };
          finish({
            canvas, proxy, labels,
            begin(tubes) {
              if (begun) return;
              begun = true;
              const off = canvas.transferControlToOffscreen();
              w.postMessage({ type: 'init', canvas: off, tubes, settings: figureSettings() }, [off]);
              // The canvas the page keeps is a placeholder now: it answers for the picture's size, and for pieces of the figure (the glass's copies) by asking the worker.
              let size = [300, 150];
              const resize = proxy.resize;
              proxy.resize = (a, b) => { size = [a, b]; resize(a, b); };
              Object.defineProperty(canvas, 'width', { get: () => size[0], configurable: true });
              Object.defineProperty(canvas, 'height', { get: () => size[1], configurable: true });
              canvas.crop = (...args) => new Promise((res, rej) => { const id = ++cropId; crops.set(id, { res, rej }); try { w.postMessage({ type: 'crop', id, args }); } catch (e) { crops.delete(id); rej(e); } });
            },
          });
          return;
        }
        if (data?.type === 'lbl-failed') { console.warn('Figure worker: the labels failed there; they go back to the page.', data.why); labelsLost(); return; }
        if (data?.type === 'cropped') { const r = crops.get(data.id); crops.delete(data.id); if (r) (data.bm ? r.res(data.bm) : r.rej(new Error('no picture'))); return; }
        if (data?.type === 'state' && proxy) proxy.take(data.state);
      };
      w.postMessage({ type: 'probe', settings: figureSettings() });
    } catch { finish(null); }
  });
}
