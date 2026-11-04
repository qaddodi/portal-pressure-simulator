// A small piece that comes and goes (a hint line, a "Clear all" link, a count badge) eases instead of popping: it fades and, unless
// `flat`, folds its height in and out, so what is under it glides rather than jumping a line. Keeps `hidden` the source of truth
// (hidden while folded away), so CSS and tests that read the attribute still hold. Nothing animates when the piece is not on screen
// (a closed section) or under Reduce Motion: it is then shown or hidden at once.
import { D_FLIP, D_SMALL, EASE_ARRIVE, EASE_IN } from './ease.js';
import { reduceMotionMQ } from './motion.js';

const jobs = new WeakMap();
const still = reduceMotionMQ;
const SPACE = ['paddingTop', 'paddingBottom', 'marginTop', 'marginBottom'];

export function fold(el, show, { flat = false } = {}) {
  const job = jobs.get(el);
  if (job ? job.show === show : el.hidden === !show) return;
  const seen = (e) => (e.checkVisibility ? e.checkVisibility() : e.getClientRects().length > 0);
  // Where it is now, if it is part-way, so a reversal carries on from there rather than snapping.
  let from = null;
  if (job) { const cs = getComputedStyle(el); from = { opacity: cs.opacity, height: cs.height }; job.anim.cancel(); }
  jobs.delete(el);
  // Nothing to see (a closed section, not yet in the page) or Reduce Motion: shown or hidden at once.
  if (still.matches || !el.animate || !seen(el.hidden ? el.parentElement || el : el)) { el.hidden = !show; el.style.overflow = ''; return; }
  if (show) el.hidden = false;
  const cs = getComputedStyle(el), rest = {};
  for (const k of SPACE) rest[k] = cs[k];
  const full = el.offsetHeight, zero = { opacity: 0, ...(flat ? {} : { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' }) };
  const whole = { opacity: 1, ...(flat ? {} : { height: `${full}px`, ...rest }) };
  const cur = from ? { opacity: from.opacity, ...(flat ? {} : { height: from.height }) } : null;
  if (!flat) el.style.overflow = 'hidden';
  const frames = show ? [{ ...zero, ...cur }, whole] : [{ ...whole, ...cur }, zero];
  const anim = el.animate(frames, { duration: show ? D_SMALL : D_FLIP, easing: show ? EASE_ARRIVE : EASE_IN, fill: show ? 'none' : 'forwards' });
  jobs.set(el, { show, anim });
  const end = () => { if (jobs.get(el)?.anim !== anim) return; jobs.delete(el); if (!show) el.hidden = true; el.style.overflow = ''; anim.cancel(); };
  anim.finished.then(end, () => { /* cancelled by a reversal */ });
}
