// Label fonts and word widths, and the desk size and turn tables.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { measure as measureWords } from './glyph-measure.js';

export function createLabelText(st, live) {
  const { updateLabels } = st;
  const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  // (Words measured from the GPU atlas's own Inter metrics, glyph-measure.js, as label-gl.js sets them: no 2D canvas.)
  const widths = new Map(), widthZ = new Map();   // (widths: a text with its digits as zeros → a flat list of weight, size, track, width; widthZ: a text as given → that form)
  let widthN = 0;
  function textW(t, size, weight = 500, track = 0) {
    // Labels draw tabular digits (every digit as wide as a zero), so measure them that way too:
    // a value ticking from 6.0 to 6.1 then keeps its width and its label stays put. (Kept by that text too, so a ticking
    // value is measured once, not once for every value it passes through.)
    let z = widthZ.get(t);
    if (z === undefined) { z = t.replace(/\d/g, '0'); if (widthZ.size > 3000) widthZ.clear(); widthZ.set(t, z); }
    let e = widths.get(z);
    if (e) for (let i = 0; i < e.length; i += 4) if (e[i] === weight && e[i + 1] === size && e[i + 2] === track) return e[i + 3];
    const w = measureWords(z, `${weight} ${size}px ${FONT}`) + track * size * z.length;
    if (widthN > 1500) { widths.clear(); widthN = 0; e = undefined; }   // (a resize or a fluid size makes a new key each time: cut at 1500)
    if (!e) widths.set(z, e = []);
    e.push(weight, size, track, w); widthN++;
    return w;
  }
  // (Cleared at each font that finishes, not only at the first `ready`: Inter's Greek and Latin-extended parts load when a character in
  // them first appears, and a label measured before that was measured in the fallback face.)
  const fontsIn = () => { widths.clear(); widthN = 0; live.labelFonts++; if (live.F) updateLabels(live.F); };
  document.fonts?.ready?.then(fontsIn);
  document.fonts?.addEventListener?.('loadingdone', fontsIn);
  // Label text size: the reader's choice (Menu › Text size), and a larger baseline in the circuit,
  // whose labels are the map's only text. Every run's size and spacing is scaled by labelK.
  const CIRCUIT_LABEL_K = 1.22;
  // Where a map direction lands on the screen once the circuit is turned a quarter turn counter-clockwise.
  const TURN_DIR = { N: 'W', W: 'S', S: 'E', E: 'N', NE: 'NW', NW: 'SW', SW: 'SE', SE: 'NE', C: 'C' };
  // A desktop (a wide screen and a mouse) is read from farther away: its 100 % is half as large again as a phone's or tablet's.
  const deskMQ = matchMedia('(min-width: 1024px) and (pointer: fine)');
  // One label size on every screen and window width at 100 % (the laptop's): only the label setting changes it.
  const deskK = () => 1.5;
  return { CIRCUIT_LABEL_K, TURN_DIR, deskK, deskMQ, textW };
}
