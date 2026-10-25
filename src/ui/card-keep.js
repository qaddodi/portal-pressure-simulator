// Which card stays on screen when the slide changes. A change used to fade both cards out and build both again, even when the next
// slide's data card is the very same instrument and tiles (only the words change) or its words are the very same (only the data
// card changes). A card that is the same stays where it is, live, and only the other one swaps (presenter.js transitionRun).
// These are the pure parts, so a test can run them: a card's plan, and whether the slide coming may keep the card on screen.

const J = JSON.stringify;

// Fields of a slide that stop either of its cards being kept: the days run (a time-lapse), the catheter or a live procedure drives the
// screen, a case card covers it as another patient comes in, a question card asks first and its slide's cards are built after the lift, a held
// question keeps its answer back.
// Those slides have their own order of cards; they come and go whole, as they always did. (A new patient without a case card is
// not one of them: the data card rides the model to it, see keepData.)
const OWN = ['visual', 'lapse', 'cath', 'monitor', 'procedure', 'vignette', 'question', 'hold'];
const own = (s) => !s || OWN.some((k) => s[k]);

// Instruments that record the patient's flow as it passes: another patient clears their trace, so their card is built again
// rather than kept. Charts drawn from the deck's own states (the talk's trace, the flow-time chart) are redrawn per slide.
const records = (t) => !!t && (t.kind === 'doppler' || t.kind === 'vitals' || (t.kind === 'trace' && t.range === 'beats'));
const drawn = (t) => !!t && (t.kind === 'flowtime' || (t.kind === 'trace' && t.range !== 'beats'));
/** Whether the data card's instrument can ride a change of patient: it reads the live model, which eases from the old patient to the new. */
export const eases = (t) => !records(t) && !drawn(t);

/**
 * A slide's data card as its build reads it, or null when the slide has none: the instrument and its options, the tiles and
 * whether they carry a ring for where they started, the title, the earlier-reading ghost and how the card sits. The numbers are not
 * in it (they ease); the highlighted tile (key) is not either (it is a class on a tile that stays).
 * o: { keys, ref, title, ghost, under, sin } as the presenter reads them for the slide.
 */
export function dataPlan(s, o = {}) {
  if (!s || s.visual || !(s.data === 'tiles' || s.tool)) return null;
  return J([s.tool || null, s.data || null, o.keys || [], !!o.ref, s.clock || null, o.title || '', o.ghost || null, !!o.under, !!o.sin, !!s.hvpgResp]);
}

// What a slide's teaching card is made of: the whole slide but what only the data card, the figure, the camera or the model read. A
// field this leaves out that does change the words would keep stale words; so it names what to leave out, not what to keep.
const NOT_WORDS = ['id', 'notes', 'tell', 'tool', 'data', 'tiles', 'dataTitle', 'clock', 'hvpgResp', 'delta', 'cam', 'view', 'kMax', 'clear', 'layers',
  'labels', 'tint', 'mark', 'marks', 'glow', 'sites', 'callout', 'tick', 'when', 'milestone', 'preset', 'presetDays', 'params', 'action', 'days', 'ramp'];
/** A slide's teaching card, or null when the slide has none (a visual's panel is another card). */
export function textPlan(s) {
  if (!s || s.visual) return null;
  return J(Object.keys(s).filter((k) => !NOT_WORDS.includes(k)).sort().map((k) => [k, s[k]]));
}

/**
 * Whether the data card on screen stays for the slide coming.
 *   from, to   the plans of the card showing and of the slide's (card-keep dataPlan); null/undefined: none, or not yet known
 *   prev, next the slides
 *   swap       the patient changes (a new state, or the viewer's live changes put back)
 *   again      the same slide drawn again (a new text size): its cards are built afresh
 */
export function keepData({ from, to, prev, next, swap = false, again = false }) {
  if (again || !from || !to || from !== to || own(prev) || own(next)) return false;
  return !swap || eases(next.tool);
}

/**
 * Whether the teaching card on screen stays for the slide coming: its words are the same and so is the patient, so the numbers in
 * them are. A card with something the viewer has changed in it (choices, a slider, a catheter's monitor) is never kept.
 */
export function keepText({ from, to, prev, next, swap = false, again = false }) {
  if (again || swap || !from || !to || from !== to || own(prev) || own(next)) return false;
  // (Choices, a slider, the scale switch keep what the viewer did to them on the slide before; each slide opens them afresh.)
  return !['compare', 'whatIf', 'column', 'scales', 'ask'].some((k) => prev[k] || next[k]);
}

// ── A kept card, checked against the layout ──
// The new slide's layout runs with the kept card on screen. It may leave the card as it was (the usual case: nothing a viewer sees
// moves) or change it: its size, its fit, a fold, a class. A change is put back at once, and the card is not kept after all.
// The one change a kept data card may take is where it stands and how much room it has: its top eases there (styles/app.css), and its
// height cap only matters if the card is then a different size (which is checked).
const attrsOf = (el) => { const o = {}; for (const a of el.attributes) if (a.name !== 'class' && a.name !== 'style') o[a.name] = a.value; return o; };
const styleOf = (el) => { const o = {}; for (const p of el.style) o[p] = el.style.getPropertyValue(p); return o; };
const EASED = ['top', 'max-height', 'transition', 'transition-property', 'transition-duration', 'transition-delay', 'transition-timing-function', 'transition-behavior'];

/** A card as it stands: its classes, attributes, style and size, to be put back or compared with. */
export const cardSnap = (el) => ({ el, cls: el.className, attrs: attrsOf(el), style: styleOf(el), css: el.style.cssText, w: el.offsetWidth, h: el.offsetHeight, top: el.offsetTop });

/** Whether the card is other than the snapshot. free: its top and height cap may differ (the data card; the words' card may not move). */
export function cardChanged(sn, free = false) {
  const el = sn.el;
  if (el.className !== sn.cls || Math.abs(el.offsetWidth - sn.w) > 0.5 || Math.abs(el.offsetHeight - sn.h) > 0.5) return true;
  if (!free && Math.abs(el.offsetTop - sn.top) > 0.5) return true;
  const attrs = attrsOf(el);
  if (Object.keys({ ...attrs, ...sn.attrs }).some((k) => attrs[k] !== sn.attrs[k])) return true;
  const keep = ([p]) => !free || !EASED.includes(p);
  const now = Object.fromEntries(Object.entries(styleOf(el)).filter(keep)), was = Object.fromEntries(Object.entries(sn.style).filter(keep));
  return Object.keys({ ...now, ...was }).some((k) => now[k] !== was[k]);
}

/** The card put back as the snapshot has it. */
export function cardBack(sn) {
  const el = sn.el;
  el.className = sn.cls; el.style.cssText = sn.css;
  for (const a of [...el.attributes]) if (a.name !== 'class' && a.name !== 'style' && !(a.name in sn.attrs)) el.removeAttribute(a.name);
  for (const [k, v] of Object.entries(sn.attrs)) if (el.getAttribute(k) !== v) el.setAttribute(k, v);
}
