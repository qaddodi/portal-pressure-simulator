// A DOM stand-in for the node harness (scripts/warm-alloc.mjs): every property read gives another stand-in, every call gives one back,
// and the few things the app reads as numbers or text answer with a plain value. It draws nothing and holds nothing; the code under
// test runs its own logic against it. Not for tests of what the page shows.
import { readFileSync } from 'node:fs';
// The colour tokens the stylesheets declare on :root (first declaration of each name wins: the light theme), served to getComputedStyle.
export const TOKENS = new Map();
for (const f of ['tokens.css']) {
  const css = readFileSync(new URL(`../../styles/${f}`, import.meta.url), 'utf8');
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) if (!TOKENS.has(m[1])) TOKENS.set(m[1], m[2].trim());
}
const make = () => {
  const target = function () {};
  const handler = {
    get(_, key) {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === Symbol.iterator) return function* () {};
      if (key === 'then') return undefined;
      if (key === 'length' || key === 'size' || key === 'width' || key === 'height' || key === 'innerWidth' || key === 'innerHeight') return 0;
      if (key === 'matches') return false;
      if (key === 'fonts') return { ready: Promise.resolve(), addEventListener() {}, check: () => true, load: () => Promise.resolve([]) };
      if (key === 'style' || key === 'dataset' || key === 'classList' || key === 'documentElement' || key === 'body' || key === 'location') return stub;
      if (key === 'search' || key === 'hash' || key === 'href' || key === 'pathname' || key === 'userAgent' || key === 'className' || key === 'textContent') return '';
      if (key === 'getPropertyValue') return () => '';
      if (key === 'getContext') return () => null;
      if (key === 'parentElement' || key === 'parentNode' || key === 'nextSibling' || key === 'previousSibling' || key === 'firstChild' || key === 'lastChild') return null;
      if (key === 'closest' || key === 'getContextAttributes' || key === 'getAttribute') return () => null;
      if (key === 'querySelectorAll' || key === 'getBoundingClientRect' || key === 'getClientRects') return () => (key === 'getBoundingClientRect' ? { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } : []);
      return stub;
    },
    set() { return true; },
    apply() { return stub; },
    construct() { return stub; },
    has() { return false; },
  };
  const stub = new Proxy(target, handler);
  return stub;
};
export function installDomStub() {
  const g = globalThis;
  const stub = make();
  g.window = g;
  g.devicePixelRatio ??= 1;
  g.innerWidth ??= 1280; g.innerHeight ??= 800;
  g.CSS ??= { escape: (x) => String(x), supports: () => false };
  for (const k of ['document', 'navigator']) if (!(k in g) || k === 'document') Object.defineProperty(g, k, { value: stub, configurable: true, writable: true });
  g.ResizeObserver ??= class { observe() {} disconnect() {} };
  g.MutationObserver ??= class { observe() {} disconnect() {} takeRecords() { return []; } };
  g.IntersectionObserver ??= class { observe() {} disconnect() {} };
  g.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
  g.addEventListener ??= () => {};
  g.removeEventListener ??= () => {};
  g.getComputedStyle ??= () => new Proxy({ getPropertyValue: (n) => TOKENS.get(n) ?? '' }, { get: (t, k) => (k in t ? t[k] : stub[k]) });
  g.requestAnimationFrame ??= (cb) => setTimeout(() => cb(performance.now()), 16);
  g.cancelAnimationFrame ??= (id) => clearTimeout(id);
  g.requestIdleCallback ??= (cb) => setTimeout(() => cb({ timeRemaining: () => 8, didTimeout: false }), 1);
  g.DOMMatrixReadOnly ??= class { constructor() { this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0; this.m11 = 1; this.m12 = 0; this.m21 = 0; this.m22 = 1; this.m41 = 0; this.m42 = 0; this.is2D = true; } };
  g.DOMMatrix ??= g.DOMMatrixReadOnly;
  g.DOMRect ??= class { constructor(x = 0, y = 0, w = 0, h = 0) { this.x = x; this.y = y; this.width = w; this.height = h; this.left = x; this.top = y; this.right = x + w; this.bottom = y + h; } };
  g.Path2D ??= class { moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} rect() {} arc() {} ellipse() {} roundRect() {} addPath() {} };
  g.Element ??= class {};
  g.HTMLElement ??= class {};
  g.Node ??= class {};
  g.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  g.sessionStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  return stub;
}
