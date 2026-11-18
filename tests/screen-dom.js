// A page for the screen readers' tests that need the app's colour ramps (colormap.js reads --ramp-pressure from the page's styles): jsdom with the
// light look's ramp, and the few globals util.js asks for at import. Not a *.test.js: imported first by the tests that need it.
import { JSDOM } from 'jsdom';
const css = ':root { --ramp-pressure: #D7E7F4 0, #9DC9F7 5, #7BA1FC 10, #A074F4 12, #BD2C92 20, #B31553 30; --label-dim: .65; }';
export const dom = new JSDOM(`<!doctype html><html><head><style>${css}</style></head><body><div id="app"></div></body></html>`, { pretendToBeVisual: true });
const w = dom.window;
globalThis.window ??= w; globalThis.document ??= w.document;
for (const k of ['Element', 'HTMLElement', 'Node', 'NodeFilter', 'MutationObserver', 'Range', 'getComputedStyle']) globalThis[k] ??= typeof w[k] === 'function' && k === 'getComputedStyle' ? w[k].bind(w) : w[k];
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.addEventListener ??= () => {};
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);
