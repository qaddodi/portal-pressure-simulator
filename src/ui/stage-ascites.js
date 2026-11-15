// The ascites picture in the SVG plate
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { CAVITY_LOW } from './anatomy.js';
import { s } from './util.js';

export function createAscites(st, live) {
  const { gAscites } = st;
  const ascitesPath = s('path', { class: 'ascites-fill', d: '', fill: 'url(#fluid)' });
  const ascitesLine = s('path', { class: 'ascites-line', d: '' });
  function ascitesSvg() {
    if (!live.ascStale) return;
    live.ascStale = false; live.ascWroteH = live.fluidH; live.ascWroteAmp = live.fluidAmp; live.ascWroteAt = performance.now();
    const surf = live.fluidSurf;
    if (!surf) return;
    let line = '';
    for (let x = 296; x <= 1128; x += 8) line += `${x === 296 ? 'M' : ' L'}${x} ${surf(x).toFixed(1)}`;
    live.putA(ascitesLine, 'd', line);
    if (gAscites.style.getPropertyValue('--fluid-fade') !== live.fluidFade().toFixed(3)) gAscites.style.setProperty('--fluid-fade', live.fluidFade().toFixed(3));
    live.putA(ascitesPath, 'd', `${line} L 1128 ${CAVITY_LOW + 20} L 296 ${CAVITY_LOW + 20} Z`);   // down past the rounded pelvic floor; the clip shapes it
  }
  return { ascitesLine, ascitesPath, ascitesSvg };
}
