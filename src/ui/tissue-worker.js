// The page's end of the lobule's tissue worker (tissue-paint-worker.js): sends it the lobule's shape once, then a job per bitmap
// (its size, scale, box, the painting's values and the colour tokens it reads, lobule-paint.js TOKENS), and hands back the tiles.
// Off (ready false) wherever a worker cannot paint the same picture: no Worker, OffscreenCanvas or createImageBitmap, a worker
// that fails to start or errs, a canvas call the page has and the worker lacks, a job it could not paint, or one with no reply within
// WAIT_MS. Then, and until then, the lobule paints its bitmap on the page as before.

import { TOKENS } from './lobule-paint.js?v=f6e22a327b';
import { cssVar, cssRGB } from './util.js?v=725ab01f3a';

const WAIT_MS = 15000;

export function createTissueWorker({ make = () => new Worker(new URL('./tissue-paint-worker.js?v=5194b4778d', import.meta.url), { type: 'module' }) } = {}) {
  let w = null, state = 'off', nextId = 0, sent = null, shapeSeq = 0;
  const waiting = new Map();
  const closeAll = (tiles) => { for (const t of tiles || []) { try { t.bmp.close(); } catch { /* gone */ } } };
  function stop() {
    state = 'broken';
    try { w?.terminate(); } catch { /* gone */ }
    w = null; sent = null;
    for (const done of waiting.values()) done(null);
    waiting.clear();
  }
  function start() {
    if (state !== 'off') return;
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined' || typeof CanvasRenderingContext2D === 'undefined') { state = 'broken'; return; }
    try {
      w = make();
      state = 'starting';
      w.onmessage = ({ data }) => {
        if (data?.type === 'hello') {
          const f = data.feats, p = CanvasRenderingContext2D.prototype;
          if (state === 'starting' && f && f.roundRect === (typeof p.roundRect === 'function') && f.ellipse === (typeof p.ellipse === 'function')) state = 'ready';
          else stop();
          return;
        }
        if (data?.type !== 'paint') return;
        // (A job the worker could not paint turns it off for good: the page paints every bitmap from then on, rather than asking again.)
        if (!data.tiles) { stop(); return; }
        const done = waiting.get(data.id);
        if (done) { waiting.delete(data.id); done(data.tiles || null); } else closeAll(data.tiles);
      };
      w.onerror = () => stop();
      w.onmessageerror = () => stop();
      w.postMessage({ type: 'hello' });
    } catch { stop(); }
  }
  return {
    /** True once the worker has started and can paint the same picture (asking starts it). */
    get ready() { start(); return state === 'ready'; },
    /** One bitmap: shape (the painting's G, sent once while it stays the same object), n (its side, px), sc, bx, by (as
     *  paintWorldInto), P (the painting's other values). Resolves to its tiles ([{ x, y, bmp }]) or null. */
    paint({ shape, n, sc, bx, by, P }) {
      if (state !== 'ready' || !w) return Promise.resolve(null);
      return new Promise((res) => {
        const id = ++nextId;
        const t = setTimeout(() => { if (waiting.has(id)) stop(); }, WAIT_MS);   // (a worker that never answers is let go: the page paints)
        waiting.set(id, (tiles) => { clearTimeout(t); res(tiles); });
        try {
          if (sent !== shape) { w.postMessage({ type: 'shape', id: ++shapeSeq, shape }); sent = shape; }
          const tokens = Object.fromEntries(TOKENS.map((k) => [k, [cssVar(k), cssRGB(k)]]));
          w.postMessage({ type: 'paint', id, shape: shapeSeq, n, sc, bx, by, P, tokens });
        } catch { stop(); }
      });
    },
  };
}
