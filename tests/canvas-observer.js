// A ResizeObserver stand-in for the tests' fake canvases. util.js canvasSize never measures (1 Nov 2026: no layout read in a
// frame): it keeps the box a browser's observer reports once the canvas is laid out, and again when its size changes. This one
// reports a canvas's box (its getBoundingClientRect, the test's bw x bh) as it is observed and each time the test gives it a new
// size, so the charts see the same sizes they measured before. Other elements get no report, as with the old stand-in.
export class CanvasObserver {
  constructor(cb) { this.cb = cb; }
  observe(el) {
    if (!el?.getContext || !el.getBoundingClientRect) return;
    const report = () => { const b = el.getBoundingClientRect(); this.cb([{ target: el, contentRect: { width: b.width, height: b.height } }], this); };
    for (const k of ['bw', 'bh']) {
      let v = el[k];
      Object.defineProperty(el, k, { get: () => v, set: (x) => { v = x; report(); }, configurable: true });
    }
    report();
  }
  unobserve() {}
  disconnect() {}
}
