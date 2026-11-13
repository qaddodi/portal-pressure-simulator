// A glass plate that changes size by transform only (the phone's bottom bar folding to its pill and back, main.js foldDock).
//
// The box is laid out once at its new size. For the glide its glass moves onto nine pieces cut from one plate: four corners that
// slide (translate), four edges that slide and stretch along their length, and a middle that stretches both ways. Each piece has
// a fixed size laid out once, keeps only its outer edge's hairline and shadow (a still clip cuts the rest), and rides one eased
// translate and scale, all on the same curve, so together they are always one rounded plate from the old box to the new. Nothing
// is laid out or painted again per frame: the compositor carries every piece. The box takes its own glass back as they land.
import { D_FLIP, D_SURFACE, EASE_ARRIVE, EASE_IN, EASE_MOVE } from './ease.js';
import { reduceMotionMQ } from './motion.js';
import { morphGlass } from './glass-morph.js';

const O = 64;   // (room each piece keeps for its shadow on its outer sides)
const PIECES = [
  // [name, cut: which outer sides keep their edge and shadow (top, right, bottom, left)]
  ['tl', [1, 0, 0, 1]], ['t', [1, 0, 0, 0]], ['tr', [1, 1, 0, 0]],
  ['l', [0, 0, 0, 1]], ['c', [0, 0, 0, 0]], ['r', [0, 1, 0, 0]],
  ['bl', [0, 0, 1, 1]], ['b', [0, 0, 1, 0]], ['br', [0, 1, 1, 0]],
];
const CUTS = Object.fromEntries(PIECES);

/** The nine pieces of host's glass, made and put in once and kept between glides, hidden (app.css: a piece shows only while its host
 *  is .pg-on), so a glide puts nothing into the page (2 Nov 2026, "Move everything to GPU"). Made again only if the host lost them. */
export function platePieces(host) {
  const had = host._pgPieces;
  if (had && had.every(([p]) => p.parentElement === host)) return had;
  const ps = PIECES.map(([name]) => {
    const p = document.createElement('i');
    p.className = `pg-piece pg-${name}`; p.setAttribute('aria-hidden', 'true');
    return [p, name];
  });
  host.append(...ps.map(([p]) => p));
  host._pgPieces = ps;
  return ps;
}

/** Glides host's glass from box `from` to box `to` ({ x, y, w, h } in the host's own new box, px), corner radius R.
 *  Returns a function that ends it at once. done() runs as it lands or is ended. */
export function glidePlate(host, from, to, opts) { return glidePlateOn(host, platePieces(host), from, to, opts); }

/** glidePlate on pieces made beforehand (platePieces, called as the host is set up), for a glide that starts in a frame. */
export function glidePlateOn(host, made, from, to, { R = 16, duration = D_SURFACE, easing = EASE_ARRIVE, done } = {}) {
  // (A box whose glass the GPU draws has no page fill for nine pieces to carry: it asks that glass to change size in view instead, from where it is drawn to
  // the new box on this glide's length and its curve, ring and shadow with it (glass-morph.js). Its stand-in below is for a glass the page draws.)
  const gpu = morphGlass(host, duration, easing === EASE_MOVE);
  if (gpu) {
    const stop = () => { gpu(); done?.(); };
    let over = false;
    const end = () => { if (over) return; over = true; clearTimeout(t); stop(); };
    const t = setTimeout(end, duration + 160);
    return end;
  }
  R = Math.max(0, Math.min(R, from.w / 2, from.h / 2, to.w / 2, to.h / 2));
  const bw = Math.max(1, to.w - 2 * R), bh = Math.max(1, to.h - 2 * R);   // (the stretching pieces' laid-out length: the new box's)
  const pieces = made;
  // Where each piece stands, and how far it is stretched, for a box b.
  const at = (name, b) => {
    const iw = Math.max(0, b.w - 2 * R), ih = Math.max(0, b.h - 2 * R);
    const col = name.includes('l') ? 0 : name.includes('r') ? 2 : 1, row = name.startsWith('t') ? 0 : name.startsWith('b') ? 2 : 1;
    const x = col === 0 ? b.x : col === 1 ? b.x + R : b.x + R + iw;
    const y = row === 0 ? b.y : row === 1 ? b.y + R : b.y + R + ih;
    const sx = col === 1 ? iw / bw : 1, sy = row === 1 ? ih / bh : 1;
    return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
  };
  for (const [p, name] of pieces) {
    const cut = CUTS[name];
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
  }
  host.classList.add('pg-on');
  const anims = pieces.map(([p, name]) => p.animate([{ transform: at(name, from) }, { transform: at(name, to) }], { duration, easing, fill: 'forwards' }));
  let over = false;
  const end = () => {
    if (over) return; over = true;
    for (const a of anims) a.cancel();
    host.classList.remove('pg-on');   // (the pieces stay, hidden, for the next glide)
    done?.();
  };
  anims[0].onfinish = end;
  setTimeout(end, duration + 160);   // (a page whose frames stall still lands)
  return end;
}

/** Keeps a plated box (a glass pill whose size follows its content: a button that comes and goes) easing to each new size by
 *  transform: when its laid-out size changes, its glass glides from the old box to the new (glidePlate) and the pieces in it slide
 *  from where they stood (FLIP). Sizes and places are read once per change, in the ResizeObserver, after layout and before paint;
 *  nothing is laid out per frame. Reduce Motion: the box takes its new size at once. Returns a function that stops watching. */
export function glideOnResize(host, { R = 16, duration = D_SURFACE, easing = EASE_ARRIVE } = {}) {
  const still = reduceMotionMQ;
  let last = null, end = null;
  const read = () => ({ x: host.offsetLeft, y: host.offsetTop, w: host.offsetWidth, h: host.offsetHeight,
    kids: new Map([...host.children].filter((c) => !c.classList.contains('pg-piece') && !c.dataset.ghost).map((c) => [c, [c.offsetLeft, c.offsetTop, c.offsetWidth, c.offsetHeight]])) });
  const ro = new ResizeObserver(() => {
    const now = read(), was = last;
    last = now;
    if (!was || !now.w || !now.h || !was.w || !was.h || (Math.abs(now.w - was.w) < 0.5 && Math.abs(now.h - was.h) < 0.5)) return;
    if (still.matches || !host.getClientRects().length) return;
    end?.();
    end = glidePlate(host, { x: was.x - now.x, y: was.y - now.y, w: was.w, h: was.h }, { x: 0, y: 0, w: now.w, h: now.h }, { R, duration, easing, done: () => { end = null; } });
    for (const [c, [x1, y1, w1, h1]] of now.kids) {
      const p = was.kids.get(c);
      if (!p) continue;
      if (p[2] && p[3] && (!w1 || !h1)) {
        // (a piece folded away at once leaves a copy where it stood, fading as the glass closes over it)
        const g = c.cloneNode(true);
        g.dataset.ghost = '1'; g.removeAttribute('id'); g.setAttribute('aria-hidden', 'true'); g.inert = true;
        Object.assign(g.style, { position: 'absolute', left: `${was.x + p[0] - now.x}px`, top: `${was.y + p[1] - now.y}px`, width: `${p[2]}px`, height: `${p[3]}px`, margin: '0', visibility: 'visible', opacity: '1', pointerEvents: 'none', transition: 'none' });
        host.append(g);
        g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: Math.min(duration, D_FLIP), easing: EASE_IN, fill: 'forwards' }).finished.then(() => g.remove(), () => g.remove());
        continue;
      }
      const dx = was.x + p[0] - (now.x + x1), dy = was.y + p[1] - (now.y + y1);
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) c.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration, easing, composite: 'add' });
    }
  });
  ro.observe(host);
  return () => { ro.disconnect(); end?.(); };
}
