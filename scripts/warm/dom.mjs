// The page's real DOM in node (jsdom) for the warm-frame harness: index.html as shipped, with its scripts not run, set up as the globals the
// app's modules read at load. Layout is not computed (every box is empty), which is all a frame function's own work needs.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { installDomStub, TOKENS } from './dom-stub.mjs';
import { installGL } from './gl-stub.mjs';
import { measurePath } from '../../src/ui/shape-gl.js';

let installed = null;
export function installPage() {
  if (installed) return installed;
  installDomStub();   // (the globals jsdom does not give: observers, matchMedia, DOMMatrix, ...; then jsdom's own over them)
  const tokensCss = readFileSync(new URL('../../styles/tokens.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace('</head>', () => `<style>${tokensCss}</style></head>`);
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
  const w = dom.window;
  const g = globalThis;
  for (const k of ['document', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'DOMParser', 'HTMLCanvasElement', 'CSS', 'DocumentFragment', 'Text', 'XMLSerializer', 'MutationObserver', 'localStorage', 'sessionStorage']) {
    if (w[k] !== undefined) Object.defineProperty(g, k, { value: w[k], configurable: true, writable: true });
  }
  Object.defineProperty(g, 'window', { value: g, configurable: true, writable: true });
  g.location = w.location;
  installGL(w);
  // getComputedStyle: jsdom's, with the colour tokens (tokens.css) answered for custom properties; one answer object kept for each element.
  const csOf = new WeakMap(), realCS = w.getComputedStyle.bind(w);
  g.getComputedStyle = (el) => {
    let c = csOf.get(el);
    if (!c) {
      const real = realCS(el);
      c = new Proxy(real, { get: (t, k) => (k === 'getPropertyValue' ? gpv(t) : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
      csOf.set(el, c);
    }
    return c;
  };
  const gpvs = new WeakMap();
  const gpv = (t) => { let f = gpvs.get(t); if (!f) { f = (n) => (n.startsWith('--') && TOKENS.has(n) ? TOKENS.get(n) : t.getPropertyValue(n)); gpvs.set(t, f); } return f; };
  Object.defineProperty(w, 'getComputedStyle', { value: g.getComputedStyle, configurable: true });
  // The SVG geometry jsdom leaves out, from the app's own script measuring (shape-gl.js), and identity transforms.
  const P = w.SVGElement.prototype;
  P.getTotalLength = function () { return measurePath(this.getAttribute('d')).L; };
  P.getPointAtLength = function (u) { const [x, y] = measurePath(this.getAttribute('d')).at(u); return { x, y }; };
  const ident = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, multiply() { return ident(); }, inverse() { return ident(); }, translate() { return ident(); }, scale() { return ident(); }, rotate() { return ident(); } });
  P.getCTM = P.getScreenCTM = ident;
  P.getBBox = function () { return { x: 0, y: 0, width: 0, height: 0 }; };
  w.SVGSVGElement.prototype.createSVGMatrix = ident;
  w.SVGSVGElement.prototype.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform() { return { x: 0, y: 0 }; } });
  w.Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
  // (Ready-made tokens for the colour reads: jsdom keeps no stylesheet here.)
  installed = { dom, document: w.document, liveStyle: realCS };   // (liveStyle: jsdom's own, each read the page as it is now, for a check that restyles)
  return installed;
}
