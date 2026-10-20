// A slide's colour key, drawn small on the figure instead of in the teaching card (Mohammad, 15 Oct).
// It is docked by the stylesheet, never floated: on a phone at the words' bottom-left corner, opposite the nav pill; on a wider
// screen (Mac, iPad, a phone held sideways) right on top of the nav pill at the lower right, right-aligned with it (Mohammad,
// 15 Oct: "put the legend on top of the zoom pill"). It waits for the cards to land and fades in there; it never slides.
import { frameFor, cancelFrame } from './frame.js?v=2ce59939b2';
const nextFrame = frameFor('figkey');

// el: the key's element (inside the presenter's layer, beside the nav pill); app: the app's root (its pz-moving class marks a slide change).
// ready (optional): whether the teaching card is in, or coming in; the key then comes and goes with that card, in its fade (Mohammad,
// 17 Oct: the key had popped in after the card), and watch lists the elements whose classes say so.
export function createFigureKey({ el, app, ready = null, watch = [] }) {
  let on = false, raf = 0, hideT = 0, swapT = 0;
  const empty = () => el.dataset.empty != null;
  // Out of sight (fading), and out of the way once it has faded.
  function off() {
    clearTimeout(hideT);
    el.classList.remove('on'); on = false;
    hideT = setTimeout(() => { if (!on) el.hidden = true; }, 320);
  }
  function check() {
    raf = 0;
    if (empty() || !el.parentElement?.offsetParent) return;
    // With the card: in as it comes in, out as it leaves. (Without one: a slide change keeps it out of sight until the cards are in
    // and the camera has settled.)
    if (ready ? !ready() : app.classList.contains('pz-moving')) { if (on) off(); return; }
    if (on) return;
    clearTimeout(hideT); el.classList.remove('col'); el.hidden = false; void el.offsetWidth; el.classList.add('on'); on = true;
    dispatchEvent(new Event('pps:occ'));   // (the credit and the figure's labels keep clear of it)
  }
  function soon() { if (!raf) raf = nextFrame(check); }
  const onEvent = () => { if (!empty()) soon(); };
  addEventListener('resize', onEvent);
  const mo = new MutationObserver(onEvent);
  mo.observe(app, { attributes: true, attributeFilter: ['class'] });
  for (const w of watch) mo.observe(w, { attributes: true, attributeFilter: ['class'] });
  return {
    // The key's words changed (a new slide, or another lens), or it has none.
    // fill() writes the new words: at once when the key is out of sight, else once it has faded.
    set(has, fill) {
      clearTimeout(swapT);
      if (!has) { el.dataset.empty = ''; off(); return; }
      delete el.dataset.empty;
      if (!on) { fill?.(); soon(); return; }
      off();
      swapT = setTimeout(() => { fill?.(); soon(); }, 200);
    },
    refresh: soon,
    dispose() {
      clearTimeout(hideT); clearTimeout(swapT);
      cancelFrame(raf); raf = 0; mo.disconnect();
      removeEventListener('resize', onEvent);
    },
  };
}
