// The plate's ring on the liver is a button (cutout-frame-gl.js), and the stage's gesture code is its first way to be pressed: a tap that ends
// on the figure asks `plateTap`. This is the second way, one that does not depend on that code's state (a drag it believes is still going, a
// label under the press, a pointer it lost): a press that begins and ends on the ring, inside the figure, without moving, opens or shuts the window
// once the gesture code has had its turn, if it did not. (13 Nov 2026, Mohammad: "i can't open the lobule anymore when i close it".)
// Events only, nothing per frame; the listeners are on the stage's own element, in the capture phase, and passive.

const SLOP = 8;   // (px a press may move and still be a tap)

/**
 * target: the element the figure lives in (events from inside it count; a card or button elsewhere never does).
 * at(cx, cy): is the client point on the ring now. toggles(): a count that goes up each time the window is opened or shut.
 * toggle(): opens or shuts it. later(fn): runs fn after the gesture code's own handlers (a timer of zero). Returns { dispose }.
 */
export function createRingTap({ target, at, toggles, toggle, later = (fn) => setTimeout(fn, 0) }) {
  let down = null;
  const onDown = (ev) => {
    down = null;
    if (!ev.isPrimary || (ev.button != null && ev.button !== 0)) return;
    if (!at(ev.clientX, ev.clientY)) return;
    down = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
  };
  const onUp = (ev) => {
    const d = down; down = null;
    if (!d || d.id !== ev.pointerId) return;
    if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > SLOP || !at(ev.clientX, ev.clientY)) return;
    const before = toggles();
    later(() => { if (toggles() === before && at(ev.clientX, ev.clientY)) toggle(); });
  };
  const onCancel = () => { down = null; };
  target.addEventListener('pointerdown', onDown, { capture: true, passive: true });
  target.addEventListener('pointerup', onUp, { capture: true, passive: true });
  target.addEventListener('pointercancel', onCancel, { capture: true, passive: true });
  return {
    dispose() {
      target.removeEventListener('pointerdown', onDown, { capture: true });
      target.removeEventListener('pointerup', onUp, { capture: true });
      target.removeEventListener('pointercancel', onCancel, { capture: true });
    },
  };
}
