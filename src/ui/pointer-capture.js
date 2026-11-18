// Takes a pointer for an element (setPointerCapture) without letting a pointer that is already gone stop the gesture: the call throws NotFoundError when
// the id is not an active pointer any more (a touch the system took back, a pen lifted between the event and the handler; the tester's console, 18 Nov 2026,
// page-push.js). The gesture then simply runs without capture, as it does where capture is not supported.
import { caught } from './caught.js';

export function capture(el, id) {
  try { el.setPointerCapture?.(id); } catch (e) { caught('pointer-capture', e); /* (the pointer is gone: no capture) */ }
}
