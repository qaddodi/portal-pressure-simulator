// A stand-in for vitals-gl.js's drawer, for the tests that read what the monitor sends to the GPU: each draw's strip (in CSS px, as the
// old 2D canvas was drawn), words, their sizes and rectangles are written to the canvas's `rec` record. Give it to the monitor as makeGL.
export function recorderGL(cv) {
  const rec = cv.rec || (cv.rec = {});
  rec.draws = 0; rec.strip = null; rec.texts = []; rec.sizes = []; rec.rects = []; rec.bad = [];
  return {
    lost: false,
    draw(D) {
      rec.draws++;
      rec.strip = null;
      if (D.line) {
        const pts = [];
        for (let i = 0; i < D.line.n; i++) pts.push({ x: D.line.pts[2 * i] / D.dpr, y: D.line.pts[2 * i + 1] / D.dpr });
        rec.strip = pts;
      }
      rec.texts = D.texts.map((t) => t[0]);
      rec.sizes = D.texts.map((t) => t[2]);
      rec.rects = D.rects.map((r) => r.slice());
      rec.bad = [];
      for (const t of D.texts) for (let k = 1; k < 5; k++) if (!Number.isFinite(t[k])) rec.bad.push(t[0]);
      for (const r of D.rects) for (let k = 0; k < 5; k++) if (!Number.isFinite(r[k])) rec.bad.push('rect');
      return true;
    },
    dispose() {},
  };
}
