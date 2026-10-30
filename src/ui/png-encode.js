// A canvas's PNG, encoded off the page's thread where the browser allows it. Safari encodes a canvas's toBlob on the page's own
// thread: the gut's picture (up to 4.2 million pixels) held a frame for 91 ms at each one made (his Mac ?perf readout, 30 Oct).
// The canvas's pixels go to a small worker as an ImageBitmap, laid at their own size on a canvas of the same size there (a copy,
// pixel for pixel) and encoded there. Without a worker that can (no OffscreenCanvas, a refused worker, an error, no reply within
// 5 s), the canvas's own toBlob does it, as before. Either way the PNG holds the same pixels.

const WORKER_CODE = `onmessage = async ({ data: { id, bmp } }) => {
  let blob = null;
  try {
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);
    blob = await c.convertToBlob({ type: 'image/png' });
  } catch { blob = null; }
  try { bmp.close(); } catch { /* gone */ }
  postMessage({ id, blob });
};`;

const WAIT_MS = 5000;
let worker = null, broken = false, nextId = 0;
const waiting = new Map();

function workerNow() {
  if (broken) return null;
  if (worker) return worker;
  try {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') { broken = true; return null; }
    const url = URL.createObjectURL(new Blob([WORKER_CODE], { type: 'text/javascript' }));
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = ({ data }) => { const w = waiting.get(data?.id); if (w) { waiting.delete(data.id); w(data.blob || null); } };
    // (A worker that fails stays off: everything waiting on it, and everything after, is encoded on the page as before.)
    worker.onerror = () => { broken = true; try { worker.terminate(); } catch { /* gone */ } worker = null; for (const w of waiting.values()) w(null); waiting.clear(); };
  } catch { broken = true; worker = null; }
  return worker;
}

const onPage = (cv) => new Promise((res) => cv.toBlob(res, 'image/png'));

/** The canvas's PNG (a Blob, or null as toBlob gives). The canvas must keep its pixels until this resolves. */
export async function encodePNG(cv) {
  const w = workerNow();
  if (!w) return onPage(cv);
  let blob;
  try {
    const bmp = await createImageBitmap(cv);
    const id = ++nextId;
    blob = await new Promise((res) => {
      const t = setTimeout(() => { if (waiting.delete(id)) res(null); }, WAIT_MS);
      waiting.set(id, (b) => { clearTimeout(t); res(b); });
      try { w.postMessage({ id, bmp }, [bmp]); } catch { waiting.delete(id); clearTimeout(t); res(null); }
    });
  } catch { blob = null; }
  return blob || onPage(cv);
}

/** For the unit tests: forget the worker. */
export function resetEncoder() { try { worker?.terminate(); } catch { /* gone */ } worker = null; broken = false; waiting.clear(); }
