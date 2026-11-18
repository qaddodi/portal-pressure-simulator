// Runs one of src/ui/gallery/fit-rules.js's readers (readCards, readZoom, readStructureCard) inside a Playwright page, with the plain DOM reads as its `io`.
// The reader is one self-contained function, so its source text goes into the page as it is (a string expression: not touched by the page's script
// policy, and nothing to import there); the device's own Check button calls the very same function with layout-snap.js's reads.
//
//   const r = await inPage(page, readCards, { minPx: 12 });
export const IO_SRC = `{ box: (e) => e.getBoundingClientRect(), rects: (e) => e.getClientRects(), style: (e) => getComputedStyle(e), metric: (e, k) => e[k], ctm: (e) => (e.getScreenCTM ? e.getScreenCTM() : null) }`;

/** The expression that calls `fn(io, ...args)` in a page. Exported for the test. */
export const inPageSource = (fn, ...args) => `((io) => (${fn.toString()})(io, ...${JSON.stringify(args)}))(${IO_SRC})`;

export const inPage = (page, fn, ...args) => page.evaluate(inPageSource(fn, ...args));
