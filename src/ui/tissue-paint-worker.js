// The lobule's tissue bitmap, painted off the page (tissue-worker.js starts it). Painting it on the page held the page for as long
// as it took, up to 3600 px square: the 2.8 s step into the lobule after a new patient, and the 60 to 80 ms pinch repaints (the
// performance review, 31 Oct, A5a). Here the same code (lobule-paint.js) paints it from the same values onto an OffscreenCanvas,
// which is then cut into tiles sent back as ImageBitmaps (moved, not copied), for the page to lay a few a frame (lobule-zoom.js).

import { paintWorldInto, useTokens, tokenReader } from './lobule-paint.js?v=8b9cefdd27';

const TILE = 512;
let shape = null, shapeId = 0;

self.onmessage = async ({ data: d }) => {
  if (d?.type === 'hello') {
    // (What the page compares with its own canvas, so a bitmap is never painted here with a call the page's canvas has and this
    // one lacks: paintLobule draws a plain rectangle where roundRect is missing.)
    const ok = typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function' && typeof OffscreenCanvasRenderingContext2D === 'function';
    const p = ok ? OffscreenCanvasRenderingContext2D.prototype : null;
    self.postMessage({ type: 'hello', feats: p ? { roundRect: typeof p.roundRect === 'function', ellipse: typeof p.ellipse === 'function' } : null });
    return;
  }
  if (d?.type === 'shape') { shape = d.shape; shapeId = d.id; return; }
  if (d?.type !== 'paint') return;
  let tiles = null;
  try {
    if (!shape || d.shape !== shapeId) throw new Error('lobule-paint: no shape');
    const { n, sc, bx, by } = d, cv = new OffscreenCanvas(n, n), w = cv.getContext('2d');
    if (!w) throw new Error('lobule-paint: no context');
    useTokens(tokenReader(d.tokens));
    paintWorldInto(w, n, sc, bx, by, { ...d.P, G: shape });
    tiles = [];
    for (let y = 0; y < n; y += TILE) for (let x = 0; x < n; x += TILE) {
      tiles.push({ x, y, bmp: await createImageBitmap(cv, x, y, Math.min(TILE, n - x), Math.min(TILE, n - y), { premultiplyAlpha: 'premultiply' }) });
    }
    cv.width = 0; cv.height = 0;
  } catch {
    for (const t of tiles || []) t.bmp.close();
    tiles = null;
  }
  self.postMessage({ type: 'paint', id: d.id, tiles }, tiles ? tiles.map((t) => t.bmp) : []);
};
