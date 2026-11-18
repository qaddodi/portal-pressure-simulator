// Held geometry writes
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES } from '../engine/topology.js';
import { setLive } from './live-style.js';
import { restPass } from './rest-pass.js';
import { stageScope } from './stage-scope.js';

export function createGeoHold(st, live) {
  const { putG } = st;
  // (2 Nov 2026, the iPhone trace of a slide change: every frame of a morph, a coil or a vessel's draw-on still rewrote the hidden SVG
  // model's shapes, the hit paths, halos, strands, gradients and the draw-on dashes, and the browser restyled and laid out the whole tree
  // each time, though none of it is painted while the GPU draws the vessels. Those writes are held while the GPU draws and written once,
  // in a pass between frames, when the shapes have held still for GEO_QUIET ms (hit-testing and the corner credit take them first, flushGeo).)
  const GEO_QUIET = 160;
  const geoHeld = new Map();
  let geoT = 0, geoPass = 0, geoAt = 0;
  /** An attribute (v null: removed) or, as 'style:<prop>', a style of the SVG model, held while the GPU draws it. */
  const styleProps = new Map();   // 'style:opacity' → 'opacity', and null for an attribute: cut once per name
  function styleProp(k) {
    let p = styleProps.get(k);
    if (p === undefined) { p = k.startsWith('style:') ? k.slice(6) : null; styleProps.set(k, p); }
    return p;
  }
  function setG(el, k, v, hold = live.geoHolding()) {
    if (hold) {
      let m = geoHeld.get(el);
      if (!m) geoHeld.set(el, (m = {}));
      m[k] = v;
      if (k.startsWith('style:')) setLive(el, k.slice(6), v);   // (the painters read it from here, live-style.js)
      // (One timer, kept: it looks at the time of the last held write when it fires and waits out what is left. A timer made again for each
      // write was dozens of timers a frame through a change between the views.)
      geoAt = performance.now();
      if (!geoT) geoT = stageScope.timer(geoQuiet, GEO_QUIET);
      return;
    }
    const m = geoHeld.get(el);
    if (m) delete m[k];
    putG(el, k, v);
  }
  function geoQuiet() {
    const left = GEO_QUIET - (performance.now() - geoAt);
    if (left > 4) { geoT = stageScope.timer(geoQuiet, left); return; }   // (written again since: wait out the rest of the quiet)
    geoT = 0;
    if (!geoPass) geoPass = restPass(flushGeoPass);
  }
  function flushGeoPass() { geoPass = 0; flushGeo(); }
  function flushGeo() {
    if (geoT) { stageScope.clear(geoT); geoT = 0; }
    for (const [el, m] of geoHeld) for (const k in m) putG(el, k, m[k]);
    geoHeld.clear();
  }
  // A vessel end's colour bin (0.5 mmHg) with hysteresis: it moves to a new bin only once the value is 0.4 mmHg from the one
  // shown, so a value breathing across a bin's edge no longer flickers the colour with every breath (round 2 review, B7).
  const colourBins = new Map();
  const qHold = (lens, k, end, v) => {
    let a = colourBins.get(lens);
    if (!a) { a = new Float64Array(EDGES.length * 2).fill(NaN); colourBins.set(lens, a); }
    const i = 2 * k + end, was = a[i];
    if (!(Math.abs(v - was) < 0.4)) a[i] = live.qP(v);
    return a[i];
  };
  return { flushGeo, geoHeld, qHold, setG, styleProp };
}
