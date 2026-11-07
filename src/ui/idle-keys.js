// What lets a loop that runs while nothing changes skip its work, and nothing else: the picture it draws stays the same.
// (No DOM needed to import: the unit tests load it in Node.)

// The Pressure chart's glide: whether another display frame should be drawn. The chart draws its eased copy of the model's
// beat-filtered pressures (premium-feel R4: the shown state's filter, util.js createEaser), which settles once the model does
// (a drift under what it prints is taken at once), so the glide runs only while the line or the axis is on its way.
export const glideMoving = (pressuresMoving, axisMoving) => pressuresMoving || axisMoving;

// The comparison line's deltas as shown, [label, text]: what the line is rebuilt from, and only when one of them changes.
// The rows (and the list of them) are kept and handed back each time, rewritten in place: a caller that keeps a result reads the
// latest. A row's text is built only when its number (or the formatter) is not the one it was built from.
const CMP_ROWS = [['HVPG', ''], ['Liver flow', ''], ['Shunting', '']];
const cmpFrom = [undefined, undefined, undefined], cmpFmt = [null, null, null], cmpShown = [];
function cmpRow(i, v, digits, unit, fmt) {
  const row = CMP_ROWS[i];
  if (!Object.is(cmpFrom[i], v) || cmpFmt[i] !== fmt) {
    cmpFrom[i] = v; cmpFmt[i] = fmt;
    // alloc-rare: only when this delta's number (or the formatter) differs from the one its text was built from
    row[1] = `${v > 0 ? '+' : ''}${fmt(v, digits)} ${unit}`;
  }
  cmpShown[cmpShown.length] = row;
}
export function compareRows(a, b, hvpg, model, fmt) {
  cmpShown.length = 0;
  if (hvpg) cmpRow(0, b.hvpg - a.hvpg, 1, 'mmHg', fmt);
  if (model) {
    cmpRow(1, b.liverPerfPct - a.liverPerfPct, 0, 'pts', fmt);
    cmpRow(2, (b.shuntFraction - a.shuntFraction) * 100, 0, 'pts', fmt);
  }
  return cmpShown;
}

// The classes a pan, a pinch or a slide's camera glide puts on and takes off. GESTURE_LOOK: what they change is no label's own look
// (the stage view's: the cursor, panning; the label layer's opacity as a whole, pinch-hide; the
// leaders' layer's opacity as a whole while a small move carries the labels, lb-ride; the app's: the floating buttons' fade,
// stage-busy, and the phone's bars and zoom pill, figure-focus). GESTURE_MOVE_FREE: those of them that also move, size, hide or fade
// no placed piece (PLACED), so no box a layout watch's readers measure changes with them.
// (And off-home, which a slide's glide puts on as it leaves the fit: it brings the zoom pill to full ink, no label's look. Counted, it made
// every label and mark read its style again on every frame of the first 0.7 s of the glide.)
export const GESTURE_LOOK = new Set(['panning', 'stage-busy', 'figure-focus', 'pinch-hide', 'lb-ride']);
GESTURE_LOOK.add('off-home');
export const GESTURE_MOVE_FREE = new Set(['panning', 'pinch-hide', 'lb-ride']);
/** Whether two class attribute values differ only by classes in `set` (the same, too). */
export function onlyClasses(a, b, set) {
  const A = new Set((a || '').split(/\s+/).filter(Boolean)), B = new Set((b || '').split(/\s+/).filter(Boolean));
  for (const c of A) if (!B.has(c) && !set.has(c)) return false;
  for (const c of B) if (!A.has(c) && !set.has(c)) return false;
  return true;
}
/** A class record whose change, from its old value to the class as it stands now, is only classes in `set`. */
export const classOnly = (r, set) => r.type === 'attributes' && r.attributeName === 'class' && onlyClasses(r.oldValue, r.target.getAttribute('class'), set);

// Whether mutation records leave anything different from before them. The figure writes the same attribute values over and
// over on its model frames (a transform, a path); a write of the value already there changes nothing, and a value changed
// and changed back within the batch does not either. (Each attribute is compared once: its first record holds the value it
// had before the batch.)
// (The map of what each target has been seen to change, and the sets in it, are kept and emptied: a batch makes none. The map is
// emptied before this returns, so it holds no node between calls; nothing in here calls back into it.)
const seenTargets = new Map(), seenSets = [];
export function netChanged(records) {
  seenTargets.clear();
  let used = 0, changed = false;
  for (const r of records) {
    if (r.type === 'childList') { if (r.addedNodes?.length || r.removedNodes?.length) { changed = true; break; } continue; }
    const key = r.type === 'characterData' ? '#text' : r.attributeName;
    let s = seenTargets.get(r.target);
    if (!s) {
      s = seenSets[used] || (seenSets[used] = new Set());   // alloc-rare: the pool grows only to the most targets one batch has touched
      used++; s.clear(); seenTargets.set(r.target, s);
    }
    if (s.has(key)) continue;
    s.add(key);
    const now = r.type === 'characterData' ? r.target.data : r.target.getAttribute(r.attributeName);
    if (r.oldValue !== now) { changed = true; break; }
  }
  seenTargets.clear();
  return changed;
}

// The attributes that can move or hide a card, sheet or bar the framing and labels keep clear of (on it, or on a parent).
export const PLACE_ATTRS = ['class', 'hidden', 'style', 'data-safe', 'data-safe-pad', 'data-safe-rest', 'data-full-h', 'data-folding', 'open'];
// The pieces watched: what the home framing (data-safe, the zoom pill), the labels (stage blockers, the slide's glass) and the
// corner credit (its obstacles) measure. (Base selectors, without a state like :not([hidden]): a piece leaving that state counts.)
// Transition properties that paint without moving a box; and ones that do not move the box of a piece they run inside of.
export const PAINT_ONLY = new Set(['color', 'background-color', 'background', 'border-color', 'outline-color', 'box-shadow', 'text-shadow', 'fill', 'stroke', 'filter', 'backdrop-filter']);
export const INNER_FREE = new Set(['transform', 'translate', 'rotate', 'scale', 'opacity', 'visibility']);
export const PLACED = '[data-safe], .stage-blocker, .pz-shade, #zoomPill, .pz-fk, .stage-clock, .menu, .umenu, .why-pop, .modal-back, .home, .scan-probe, .dop-probe, .pz-prog, #topbar, #vdock';

/**
 * A watch over what measured layout depends on, so a check that reads boxes (forcing a layout in the middle of the model's
 * frames) runs only when something it measures may have moved: due() is true from any change until `settle` ms after the
 * last one (a card's slide or fade ends inside that, and its last place is read), then false until the next change.
 * Changes: a net change inside the measured SVG groups (addGroup); a placed piece (PLACED) or one of its parents changing an
 * attribute that places it, or one coming or going; a placed piece or the stage changing size; a transition or an animation
 * on, in or around a placed piece; and whatever the caller reports with touch() (resizes, the store, fonts).
 * exclude(node): nodes never looked at: by default SVG content (the figure's drawing, rewritten every frame, holds no placed piece).
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
export const inSvg = (n) => n.namespaceURI === SVG_NS;
// The records an observer was handed, followed by those still queued on it (in the order they happened).
const withQueued = (given, mo) => { const q = mo.takeRecords(); return given?.length ? (q.length ? [...given, ...q] : [...given]) : q; };
export function createLayoutWatch({ root, exclude = inSvg, settle = 2500, now = () => performance.now(), MO = globalThis.MutationObserver, RO = globalThis.ResizeObserver, sel = PLACED } = {}) {
  let until = now() + settle;   // (the first look is always taken)
  const heard = new Set();   // (onTouch: told at each touch, so a look can be started by a change instead of a timer polling due())
  const touch = () => { until = Math.max(until, now() + settle); for (const f of heard) f(); };
  const places = (n) => n?.nodeType === 1 && !exclude(n) && (n.matches(sel) || !!n.querySelector(sel));
  let sized = new Set();
  const ro = RO ? new RO(() => touch()) : null;
  const resync = () => {
    if (!ro || !root) return;
    const next = new Set(root.querySelectorAll(sel));
    for (const el of sized) if (!next.has(el)) ro.unobserve(el);
    for (const el of next) if (!sized.has(el)) ro.observe(el);
    sized = next;
  };
  // (A pan's, a pinch's or a glide's own classes move no placed piece: their records are passed over, so a gesture alone does not keep
  // the watch due for its settle time. 30 Oct, review G3.)
  const relevant = (r) => {
    if (r.type === 'childList') return [...(r.addedNodes || []), ...(r.removedNodes || [])].some(places);
    if (classOnly(r, GESTURE_MOVE_FREE)) return false;
    return r.attributeName === 'data-safe' || places(r.target);
  };
  // An observer's callback is handed the records delivered to it, and they are no longer queued for takeRecords(): they
  // are read here with whatever was queued after them (a change landing between two due() checks counted, not dropped).
  const groupMO = MO ? new MO((rs) => flush(rs, null)) : null;
  const pageMO = MO ? new MO((rs) => flush(null, rs)) : null;
  function flush(groupGiven = null, pageGiven = null) {
    if (groupMO) { const rs = withQueued(groupGiven, groupMO).filter((r) => !classOnly(r, GESTURE_MOVE_FREE)); if (rs.length && netChanged(rs)) touch(); }
    if (pageMO) {
      const rs = withQueued(pageGiven, pageMO).filter(relevant);
      if (rs.length && netChanged(rs)) { touch(); if (rs.some((r) => r.type === 'childList' || r.attributeName === 'data-safe' || r.attributeName === 'class')) resync(); }
    }
  }
  if (root && pageMO) pageMO.observe(root, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: PLACE_ATTRS });
  resync();
  // A transition that paints without moving anything (a colour, a shadow) never changes a box; nor does a transform or a fade
  // on something inside a placed piece (a transform moves no layout, and the piece's own box is what is measured). A teaching
  // card's lapse bar scales its fill every few seconds, which kept the cards' boxes read ten times a second through a whole
  // slide (Doppler of the portal system 5/13, 22 Oct).
  const onMotion = (e) => {
    const t = e.target;
    if (t?.nodeType !== 1 || exclude(t)) return;
    const own = places(t), prop = e.propertyName;
    if (!own && !t.closest?.(sel)) return;
    if (prop && (PAINT_ONLY.has(prop) || (!own && INNER_FREE.has(prop)))) return;
    touch();
  };
  const motion = ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel'];
  const doc = root?.ownerDocument || root;
  if (doc?.addEventListener) for (const t of motion) doc.addEventListener(t, onMotion, true);
  return {
    touch,
    /** Calls fn at each change that makes the watch due (it must be cheap: start a look, not take one). Returns the stop. */
    onTouch(fn) { heard.add(fn); return () => heard.delete(fn); },
    /** Whether a measured box may have changed since the watch last settled. */
    due() { flush(); return now() < until; },
    /** The SVG groups whose boxes are measured (getBBox): any net change in them counts. */
    addGroup(g) { groupMO?.observe(g, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true }); },
    /** An element whose own class or style can change what the groups measure (the figure's svg, its wrapper). */
    addNode(el) { groupMO?.observe(el, { attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style', 'hidden'] }); },
    /** An element whose size counts (the stage itself). */
    addBox(el) { ro?.observe(el); },
  };
}

// One watch for the page, shared by the stage's framing and labels and by the corner credit.
let shared = null;
export function layoutWatch() {
  if (!shared) shared = createLayoutWatch({ root: document.documentElement });
  return shared;
}
