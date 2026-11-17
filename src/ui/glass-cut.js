// What the page paints over the figure's canvas is cut away under the cards (17 Nov 2026, Mohammad's iPhone: "The narrowed 6mm x2 cm label is
// seen through the tests card"; play-test at 1024: the same with the Tests and stent cards).
// The cards' glass is drawn in the figure's own canvas (glass-gl.js), so the card's page element has no background of its own, and every page
// layer that lies between that canvas and the card (the overlays' SVG, #stageOver: a narrowing's words, its arrows and bracket, the circuit's
// dots; the labels' SVG where it still draws a label itself; the catheter's and the sites' readings) showed sharp through the card. Each of those
// layers gets one clip, the window with every card's shape cut out, written whenever the cards' shapes change (the glass's onHoles, in the same
// task as the glass is laid, so the cut and the card change in the same frame) or the layers move under a card's zoom.
// Pure strings and arithmetic here; the stage hands in the layers and their origins.

/** A card's glass shows over half its fade or more: what it covers is cut. (A card that is fading in or out shows the figure through it.) */
export const CUT_FROM = 0.5;

const F = (v) => (Math.round(v * 10) / 10).toString();

/** One rounded rectangle as a path, x y w h in the layer's px, rad [tl, tr, br, bl]. */
export function roundRect(x, y, w, h, rad) {
  const m = Math.min(w, h) / 2;
  const [a, b, c, d] = (rad || [0, 0, 0, 0]).map((r) => Math.max(0, Math.min(m, +r || 0)));
  const R = x + w, B = y + h;
  return `M${F(x + a)} ${F(y)}H${F(R - b)}` + (b ? `A${F(b)} ${F(b)} 0 0 1 ${F(R)} ${F(y + b)}` : '') +
    `V${F(B - c)}` + (c ? `A${F(c)} ${F(c)} 0 0 1 ${F(R - c)} ${F(B)}` : '') +
    `H${F(x + d)}` + (d ? `A${F(d)} ${F(d)} 0 0 1 ${F(x)} ${F(B - d)}` : '') +
    `V${F(y + a)}` + (a ? `A${F(a)} ${F(a)} 0 0 1 ${F(x + a)} ${F(y)}` : '') + 'Z';
}

/**
 * The cards to cut, in client px: [{ x, y, w, h, rad }], from the glass's holes ({ x, y, w, h, a, rad, d }). A card under half its fade is
 * left out; cards that overlap become the box that holds them both (an even-odd cut would show their overlap again).
 */
export function cutCards(holes) {
  const out = [];
  for (const p of holes || []) {
    if (!(p.a >= CUT_FROM) || !(p.w > 0) || !(p.h > 0)) continue;
    out.push({ x: p.x, y: p.y, w: p.w, h: p.h, rad: p.d ? [0, 0, 0, 0] : (p.rad || [0, 0, 0, 0]).slice(0, 4) });
  }
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const A = out[i], B = out[j];
        if (A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h) {
          const x = Math.min(A.x, B.x), y = Math.min(A.y, B.y);
          out[i] = { x, y, w: Math.max(A.x + A.w, B.x + B.w) - x, h: Math.max(A.y + A.h, B.y + B.h) - y, rad: [0, 0, 0, 0] };
          out.splice(j, 1); merged = true; break;
        }
      }
    }
  }
  return out;
}

/**
 * The clip for a layer whose top left stands at client (ox, oy), under a page zoom `z` ({ s, dx, dy }: client = s · rest + d) or none:
 * '' when no card is cut, else a path(evenodd) of a frame far past the layer (its overflow shows) less each card.
 */
export function cutClip(cards, ox, oy, z = null) {
  if (!cards.length) return '';
  const s = z?.s > 0 ? z.s : 1, dx = z ? z.dx : 0, dy = z ? z.dy : 0;
  let d = 'M-9999 -9999H19999V19999H-9999Z';
  for (const c of cards) {
    // (A layer under the zoom is scaled by s about its own corner: a card's client box is carried back to the layer's own px.)
    const x = (c.x - dx) / s - ox, y = (c.y - dy) / s - oy, k = 1 / s;
    d += roundRect(x, y, c.w * k, c.h * k, c.rad.map((r) => r * k));
  }
  return `path(evenodd, "${d}")`;
}

/**
 * The cut for a set of layers: `layers()` gives [[el, ox, oy]] (each layer's client top left at rest), `zoom()` the page zoom or null.
 * set(holes) with the glass's holes; again() when the layers moved (a zoom step, a resize). Writes a layer's clip only when it changed.
 */
export function createGlassCut({ layers, zoom = () => null }) {
  let cards = [];
  const was = new WeakMap();
  function again() {
    const z = zoom();
    for (const [el, ox, oy] of layers()) {
      if (!el) continue;
      const v = cutClip(cards, ox, oy, z);
      if (was.get(el) === v) continue;
      was.set(el, v);
      el.style.clipPath = v;
    }
  }
  return {
    set(holes) { cards = cutCards(holes); again(); },
    again,
    cards: () => cards,
  };
}

/** The cards' holes from the stage's sets of them (stage.js holeSets: one list per glass), the figure's callouts' left out (their glass goes
 *  back to the browser's blur when the overlays cross it: stage-glass.js frostOver('callouts')). */
export function cardHolesOf(sets, into = []) {
  into.length = 0;
  for (const [k, l] of sets) if (k !== 'callouts') for (let i = 0; i < l.length; i++) into.push(l[i]);
  return into;
}

/** The stage's page layers over the figure's canvas, with their client top left (box: stage-camera.js stageBox, sx/sy the figure SVG's offset
 *  in it, which #stageOver shares): the overlays' SVG, the labels' SVG, the catheter's and the sites' readings. */
export function stageCutLayers(box, wrap, cath, sites, out = []) {
  out.length = 0;
  if (!box) return out;
  const x = box.left, y = box.top;
  out.push([wrap.querySelector('#stageOver'), x + (box.sx || 0), y + (box.sy || 0)], [wrap.querySelector('#labels'), x, y], [cath?.labels, x, y], [sites?.el, x, y]);
  return out;
}
