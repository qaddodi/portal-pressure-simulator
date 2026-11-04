// One gliding selection for every segmented control and tab strip (sprint 1 Nov, brief 1). A segmented control (.seg), the
// Tests / Treat tab row (.instr-tabs), the menu's Present / Patients tabs (.um-tabs) and the Pressure / Scope tab's two-way switch
// (.pressure-switch) each used to paint the chosen button's
// own background, so a change faded one pill out and another in, in place: the selection blinked across. Now each control has
// ONE moving piece, the control's own ::before (nothing is added to the page), that travels from the old choice to the new one,
// its left edge, top, width and height together, over --d-small on --ease-move (styles/app.css, next to each control's rules).
//
//   - This file only measures. It finds the controls as they are added (one MutationObserver on the body), puts the chosen
//     button's box on the control as --gx / --gy / --gw / --gh, and adds the class .seg-glide, which turns the button's own
//     fill off and the piece on. The stylesheet draws the piece: a pill (segments, tabs), or the 2 px underline the desktop's
//     tab row and the menu's tabs use, at exactly the place and look the chosen button had.
//   - A change of the choice glides. The first placement, a resize, a font arriving, a button appearing (Sinusoid), a phone
//     turning: no animation, the piece is simply where the choice is. Under a tab that opens its name (the workspace's phone
//     row) the piece follows the tab as it grows, on a short step.
//   - Reduce Motion: the piece does not travel; it fades out where it was and in where it is (--d-flip).
//   - High contrast keeps today's Highlight on the button and hides the piece (the stylesheet).
import { D_SMALL } from './ease.js';
import { restPass } from './rest-pass.js';
import { readBox, readMetric, readStyle } from './layout-snap.js';
import { reduceMotionMQ } from './motion.js';

const SEL = '.seg, .instr-tabs, .um-tabs, .pressure-switch';
const PICKED = '[aria-pressed="true"], [aria-selected="true"]';
// The piece glides by its translate and scale only, on the compositor: its size is set at once and a scale from the old size to 1
// plays over it (FLIP), so its edges travel as before. Reduce Motion keeps the fade. (No off switch: the glide by left, top, width
// and height it replaces was a layout of the piece each frame, which the off-GPU gate does not allow.)

/** The control's chosen button: the one, among its own buttons, that is pressed or selected; null when none or several. */
export function chosen(ctl) {
  let one = null;
  for (const b of ctl.children) {
    if (b.localName !== 'button' || b.hidden || b.dataset?.ghost != null || !b.matches(PICKED)) continue;   // (a fold's ghost is a picture, not a choice)
    if (one) return null;
    one = b;
  }
  return one;
}

/** The translation a button is drawn at now by its own transform or translate (px, its own), [0, 0] when none. Only a pure move
 *  counts (the view pill's fold slides its buttons by translateX); a transform that scales or turns is left in. */
export function shiftNow(btn) {
  if (typeof getComputedStyle !== 'function') return [0, 0];
  const cs = readStyle(btn);
  let x = 0, y = 0;
  const m = /^matrix(3d)?\(([^)]*)\)$/.exec(String(cs?.transform ?? '').trim()), v = m ? m[2].split(',').map(Number) : null;
  if (v && !m[1] && v.length === 6 && v[0] === 1 && v[1] === 0 && v[2] === 0 && v[3] === 1) { x += v[4]; y += v[5]; }
  else if (v && m[1] && v.length === 16 && v.every((n, i) => n === ([0, 5, 10, 15].includes(i) ? 1 : i >= 12 && i <= 14 ? n : 0))) { x += v[12]; y += v[13]; }
  if (cs?.translate && cs.translate !== 'none') { const [tx = 0, ty = 0] = String(cs.translate).split(/\s+/).map((t) => parseFloat(t) || 0); x += tx; y += ty; }
  return [x, y];
}

/** The control's border-box width unrounded (offsetWidth rounds to whole px, and a scale taken from it put the piece a third of a
 *  px off a wide pill's last button); 0 when the style gives none, and the caller falls back to offsetWidth. */
export function borderW(cs) {
  const n = (t) => parseFloat(t) || 0, w = n(cs?.width);
  if (!w) return 0;
  return cs.boxSizing === 'border-box' ? w : w + n(cs.paddingLeft) + n(cs.paddingRight) + n(cs.borderLeftWidth) + n(cs.borderRightWidth);
}

/** The button's box in the control's own pixels (from its padding edge, in its scrolled content, where the piece is placed),
 *  whatever scale an ancestor is drawn at, where the button rests; null while either has no box (hidden, or its card not yet open). */
export function boxIn(ctl, btn) {
  const c = readBox(ctl), b = readBox(btn);
  const w = (typeof getComputedStyle === 'function' && borderW(readStyle(ctl))) || readMetric(ctl, 'offsetWidth');
  if (!c.width || !b.width || !w) return null;
  const k = c.width / w;
  // (Where the button rests, not where a slide of its own draws it now: the view pill's buttons fold in and out by a translate
  // (pill-motion.js), and a box read mid-fold left the piece off its button once the fold ended, as no resize follows a transform:
  // the Lobule pill sat 13 px right of its word on iPhone, 2 Nov 2026.)
  const [dx, dy] = shiftNow(btn);
  return { x: (b.left - c.left) / k - readMetric(ctl, 'clientLeft') - dx + (readMetric(ctl, 'scrollLeft') || 0), y: (b.top - c.top) / k - readMetric(ctl, 'clientTop') - dy + (readMetric(ctl, 'scrollTop') || 0), w: b.width / k, h: b.height / k };
}

// The control's frame: where its padding edge sits in its parent, in its own px, from the parent's top left corner, or from its
// centre for the view pill's homes, whose glass is centred and which the pill changes between (the pill-motion.js fold and the
// glide into or out of the sinusoid hold the home's centre still on screen). A glide whose control moved in that frame (the view
// pill: Sinusoid to Lobule takes it from its two-button home to the four-button one) starts from where the piece was drawn on the
// screen, not from its old numbers in the moved control: those drew it one or two buttons off (on Anatomy, 2 Nov, Mohammad).
const CENTRED = '.nb-views';
export function frameOf(ctl) {
  const p = ctl.parentElement;
  if (!p) return null;
  const c = readBox(ctl), P = readBox(p);
  const w = (typeof getComputedStyle === 'function' && borderW(readStyle(ctl))) || readMetric(ctl, 'offsetWidth');
  if (!c?.width || !P?.width || !w) return null;
  const k = c.width / w, mid = !!p.matches?.(CENTRED);
  const ax = mid ? P.left + P.width / 2 : P.left, ay = mid ? P.top + P.height / 2 : P.top;
  return { x: (c.left - ax) / k + (readMetric(ctl, 'clientLeft') || 0), y: (c.top - ay) / k + (readMetric(ctl, 'clientTop') || 0) };
}

const same = (a, b) => !!a && !!b && Math.abs(a.x - b.x) < .05 && Math.abs(a.y - b.y) < .05 && Math.abs(a.w - b.w) < .05 && Math.abs(a.h - b.h) < .05;

export function startSegGlide(root = document.body) {
  if (typeof MutationObserver === 'undefined') return null;
  const states = new Map();   // control -> { btn, box, org, until, token }
  const reduce = () => reduceMotionMQ.matches;
  const GPU = true;
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
    const seen = new Set();
    for (const e of entries) {
      const ctl = e.target.closest?.(SEL);
      if (ctl && states.has(ctl) && !seen.has(ctl)) { seen.add(ctl); queue(ctl, false); }
    }
  }) : null;
  // (The observers only note which controls to place; the measuring runs in a rest pass, between frames and after the task that
  // changed the buttons, so a fold started in that task is already on them and taken off (boxIn): S4, 2 Nov.)
  let queued = new Map(), restId = 0;
  function queue(ctl, choice) {
    queued.set(ctl, queued.get(ctl) || choice);
    if (!restId) restId = restPass(settleQueued);
  }
  function settleQueued() {
    restId = 0;
    const now = queued;
    queued = new Map();
    for (const [ctl, choice] of now) settle(ctl, choice);
  }

  // The piece at a box. `still`: with no transition, and flushed, so the next style pass finds nothing to animate.
  // The piece as drawn now (its own px in the control): where it is and how large, its transition included.
  const drawnBox = (ps) => {
    const [tx = 0, ty = 0] = String(ps.translate === 'none' ? '' : ps.translate).split(/\s+/).filter(Boolean).map((v) => parseFloat(v) || 0);
    const [sx = 1, sy = sx] = String(ps.scale === 'none' ? '' : ps.scale).split(/\s+/).filter(Boolean).map((v) => parseFloat(v));
    return { x: (parseFloat(ps.left) || 0) + tx, y: (parseFloat(ps.top) || 0) + ty, w: (parseFloat(ps.width) || 0) * (Number.isFinite(sx) ? sx : 1), h: (parseFloat(ps.height) || 0) * (Number.isFinite(sy) ? sy : 1) };
  };
  // (moved: how far the control's frame moved its own origin since the piece was drawn, frameOf, taken off where it was.)
  function put(ctl, box, still, moved = null) {
    const s = ctl.style;
    if (GPU && !still && !reduce() && ctl.classList.contains('glide-gpu')) {
      // FLIP: the piece's box as drawn now, then its new size set at once (no transition), the translate and scale that draw it where
      // it was, and from the next style pass the translate to its new place and the scale to 1, both transitioned.
      const ps = readStyle(ctl, '::before'), was = drawnBox(ps);
      if (moved) { was.x += moved.x; was.y += moved.y; }
      ctl.classList.add('glide-still');
      s.setProperty('--gw', `${box.w}px`); s.setProperty('--gh', `${box.h}px`); s.setProperty('--gsx', '1'); s.setProperty('--gsy', '1');
      s.setProperty('--gx', '0px'); s.setProperty('--gy', '0px');
      const L = parseFloat(ps.left) || 0, T = parseFloat(ps.top) || 0, W = parseFloat(ps.width) || 0, H = parseFloat(ps.height) || 0;
      if (W > 0 && H > 0 && was.w > 0 && was.h > 0) {
        s.setProperty('--gx', `${was.x - L}px`); s.setProperty('--gy', `${was.y - T}px`);
        s.setProperty('--gsx', String(was.w / W)); s.setProperty('--gsy', String(was.h / H));
        void ps.translate;
      }
      ctl.classList.remove('glide-still');
      s.setProperty('--gx', `${box.x}px`); s.setProperty('--gy', `${box.y}px`); s.setProperty('--gsx', '1'); s.setProperty('--gsy', '1');
      return;
    }
    if (GPU) { if (reduce()) ctl.classList.remove('glide-gpu'); else ctl.classList.add('glide-gpu'); }
    if (still) ctl.classList.add('glide-still');
    ctl.classList.add('seg-glide');
    s.setProperty('--gx', `${box.x}px`); s.setProperty('--gy', `${box.y}px`); s.setProperty('--gw', `${box.w}px`); s.setProperty('--gh', `${box.h}px`);
    if (still) { void readStyle(ctl, '::before').left; ctl.classList.remove('glide-still'); }
  }
  function drop(ctl) {
    ctl.classList.remove('seg-glide', 'glide-still', 'glide-follow');
    ctl.classList.remove('glide-gpu');
    for (const p of ['--gx', '--gy', '--gw', '--gh', '--go', '--gsx', '--gsy']) ctl.style.removeProperty(p);
  }

  /** Bring one control's piece to its choice. `moved`: the choice has just changed (glide); otherwise the choice is where it
   *  was and only the box may have moved (a resize, a button appearing: no animation; or, while a glide is under way, the
   *  piece follows on a short step). */
  function settle(ctl, moved) {
    let st = states.get(ctl);
    if (!ctl.isConnected) { states.delete(ctl); ro?.unobserve(ctl); return; }
    if (!st) { st = { btn: null, box: null, org: null, until: 0, token: null }; states.set(ctl, st); ro?.observe(ctl); }
    for (const b of ctl.children) if (b.localName === 'button') ro?.observe(b);
    const btn = chosen(ctl), box = btn ? boxIn(ctl, btn) : null;
    if (!box) { st.token = null; st.btn = null; st.box = null; st.org = null; drop(ctl); return; }
    const first = !st.box, now = performance.now(), org = frameOf(ctl);
    const shift = st.org && org ? { x: st.org.x - org.x, y: st.org.y - org.y } : null;
    st.org = org;
    moved = moved && !first && btn !== st.btn;
    if (!moved && st.btn === btn && same(st.box, box)) return;
    st.btn = btn; st.box = box;
    if (st.token) { st.token = null; ctl.style.setProperty('--go', '1'); }   // (a fade-out cut short by a newer change)
    if (first) { put(ctl, box, true); return; }
    if (moved) {
      st.until = now + D_SMALL + 60;
      ctl.classList.remove('glide-follow');
      if (reduce()) {
        // The piece fades out where it was, then is placed and fades in (--d-flip each; the stylesheet gives opacity its step).
        ctl.style.setProperty('--go', '0');
        // (No timer: the fade-out is a transition of the piece's opacity (app.css, Reduce Motion), and the piece is placed when it ends. A newer change takes over by the token; if the piece is not drawn nothing ends, and the next settle places it.)
        const token = st.token = {};
        const place = () => {
          if (!ctl.isConnected || states.get(ctl) !== st || st.token !== token) return;
          const b2 = st.btn && boxIn(ctl, st.btn); if (b2) { st.box = b2; put(ctl, b2, true); } ctl.style.setProperty('--go', '1');
        };
        const done = (e) => {
          if (e && (e.target !== ctl || e.pseudoElement !== '::before' || e.propertyName !== 'opacity')) return;
          ctl.removeEventListener('transitionend', done); ctl.removeEventListener('transitioncancel', done);
          place();
        };
        ctl.addEventListener('transitionend', done); ctl.addEventListener('transitioncancel', done);
      } else put(ctl, box, false, shift);
      return;
    }
    if (now < st.until && !reduce()) { ctl.classList.add('glide-follow'); put(ctl, box, false, shift); return; }
    ctl.classList.remove('glide-follow');
    put(ctl, box, true);
  }

  const gather = (node, into) => {
    if (node.nodeType !== 1) return;
    if (node.matches(SEL)) into.add(node);
    for (const c of node.querySelectorAll(SEL)) into.add(c);
  };

  const mo = new MutationObserver((records) => note(records));
  function note(records) {
    const hit = new Map();   // control -> true when its choice may have changed
    for (const r of records) {
      if (r.type === 'attributes') {
        const p = r.target.parentElement;
        if (!p || !p.matches(SEL)) continue;
        // (A button shown or hidden moves the others: placed again, no animation, unless the choice changed too.)
        hit.set(p, hit.get(p) || r.attributeName !== 'hidden');
      } else {
        const found = new Set();
        for (const n of r.addedNodes) gather(n, found);
        if (r.target.nodeType === 1 && r.target.matches?.(SEL)) found.add(r.target);
        for (const c of found) hit.set(c, hit.get(c) || false);
      }
    }
    for (const [ctl, choice] of hit) queue(ctl, choice);
  }

  const all = new Set(); gather(root, all);
  for (const c of all) settle(c, false);
  mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'hidden'] });
  // (now: one control placed in the caller's task, with what its observers have not yet reported, so the frame the change is drawn
  // in already has the piece leaving from where it was: a rest pass a frame later let one frame draw the old numbers in the new row.)
  function now(ctl) {
    note(mo.takeRecords());
    if (!queued.has(ctl)) return;
    const choice = queued.get(ctl);
    queued.delete(ctl);
    settle(ctl, choice);
  }
  return { now, stop() { mo.disconnect(); ro?.disconnect(); for (const [c] of states) drop(c); states.clear(); } };
}

let live = null;
/** Places a control's piece now, in the caller's task, right after it changed its buttons (main.js, the view pill: at the tap, where
 *  the fold has just read the row). Without it the next rest pass does it. */
export function glideNow(ctl) { if (ctl) live?.now(ctl); }

if (typeof document !== 'undefined' && document.body) live = startSegGlide();
