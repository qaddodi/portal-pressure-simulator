// A glass plate that changes size by transform only (the phone's bottom bar folding to its pill and back, main.js foldDock).
//
// The box is laid out once at its new size. For the glide its glass moves onto nine pieces cut from one plate: four corners that
// slide (translate), four edges that slide and stretch along their length, and a middle that stretches both ways. Each piece has
// a fixed size laid out once, keeps only its outer edge's hairline and shadow (a still clip cuts the rest), and rides one eased
// translate and scale, all on the same curve, so together they are always one rounded plate from the old box to the new. Nothing
// is laid out or painted again per frame: the compositor carries every piece. The box takes its own glass back as they land.
import { D_SURFACE, EASE_ARRIVE } from './ease.js?v=fc509dabe4';

const O = 12;   // (room each piece keeps for its shadow on its outer sides)
const PIECES = [
  // [name, cut: which outer sides keep their edge and shadow (top, right, bottom, left)]
  ['tl', [1, 0, 0, 1]], ['t', [1, 0, 0, 0]], ['tr', [1, 1, 0, 0]],
  ['l', [0, 0, 0, 1]], ['c', [0, 0, 0, 0]], ['r', [0, 1, 0, 0]],
  ['bl', [0, 0, 1, 1]], ['b', [0, 0, 1, 0]], ['br', [0, 1, 1, 0]],
];

/** Glides host's glass from box `from` to box `to` ({ x, y, w, h } in the host's own new box, px), corner radius R.
 *  Returns a function that ends it at once. done() runs as it lands or is ended. */
export function glidePlate(host, from, to, { R = 16, duration = D_SURFACE, easing = EASE_ARRIVE, done } = {}) {
  R = Math.max(0, Math.min(R, from.w / 2, from.h / 2, to.w / 2, to.h / 2));
  const bw = Math.max(1, to.w - 2 * R), bh = Math.max(1, to.h - 2 * R);   // (the stretching pieces' laid-out length: the new box's)
  const pieces = [];
  // Where each piece stands, and how far it is stretched, for a box b.
  const at = (name, b) => {
    const iw = Math.max(0, b.w - 2 * R), ih = Math.max(0, b.h - 2 * R);
    const col = name.includes('l') ? 0 : name.includes('r') ? 2 : 1, row = name.startsWith('t') ? 0 : name.startsWith('b') ? 2 : 1;
    const x = col === 0 ? b.x : col === 1 ? b.x + R : b.x + R + iw;
    const y = row === 0 ? b.y : row === 1 ? b.y + R : b.y + R + ih;
    const sx = col === 1 ? iw / bw : 1, sy = row === 1 ? ih / bh : 1;
    return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
  };
  for (const [name, cut] of PIECES) {
    const p = document.createElement('i');
    p.className = `pg-piece pg-${name}`; p.setAttribute('aria-hidden', 'true');
    const col = name.includes('l') ? 0 : name.includes('r') ? 2 : 1, row = name.startsWith('t') ? 0 : name.startsWith('b') ? 2 : 1;
    // (the stretching pieces reach half a pixel under their neighbours, so no seam opens between them)
    const w = col === 1 ? bw + 1 : R, h = row === 1 ? bh + 1 : R;
    const [t, r, b, l] = cut;
    Object.assign(p.style, {
      width: `${w}px`, height: `${h}px`,
      margin: `${row === 1 ? -0.5 : 0}px 0 0 ${col === 1 ? -0.5 : 0}px`,
      borderTopWidth: t ? '' : '0', borderRightWidth: r ? '' : '0', borderBottomWidth: b ? '' : '0', borderLeftWidth: l ? '' : '0',
      borderTopLeftRadius: t && l ? `${R}px` : '0', borderTopRightRadius: t && r ? `${R}px` : '0',
      borderBottomRightRadius: b && r ? `${R}px` : '0', borderBottomLeftRadius: b && l ? `${R}px` : '0',
      clipPath: `inset(${t ? -O : 0}px ${r ? -O : 0}px ${b ? -O : 0}px ${l ? -O : 0}px)`,
    });
    host.append(p);
    pieces.push([p, name]);
  }
  host.classList.add('pg-on');
  const anims = pieces.map(([p, name]) => p.animate([{ transform: at(name, from) }, { transform: at(name, to) }], { duration, easing, fill: 'forwards' }));
  let over = false;
  const end = () => {
    if (over) return; over = true;
    for (const a of anims) a.cancel();
    for (const [p] of pieces) p.remove();
    host.classList.remove('pg-on');
    done?.();
  };
  anims[0].onfinish = end;
  setTimeout(end, duration + 160);   // (a page whose frames stall still lands)
  return end;
}
