// The slide's pointer at the lesion (the call-out pill, its leader line and its ring) when a layout moves it: the pill fades out where it stood and in at its
// new place (label-captions.js moveFade, 8 Nov 2026 "item 10: yes, fade"), and its leader and ring, which are model pieces drawn from the stylesheet's `on`
// class, fade out where they stood too and come in at the new place once that fade is over, so no piece of the pointer jumps (16 Nov 2026).
// The layout writes the new geometry as it always did; `settle` puts the old geometry back, holds the new one, and writes it when the fade-out is over.
// Plain numbers and callbacks, so it is tested on its own (tests/call-geo-fade.test.js).
import { createScope } from './scope.js';

const N = 7;   // ring cx, cy, r; line x1, y1, x2, y2

/**
 * @param {{ read: (into: number[]) => void, write: (g: number[]) => void, isOn: () => boolean, pillOn: () => boolean, setOn: (on: boolean) => void,
 *   ms: number, moved?: number, schedule?: (fn: () => void, ms: number) => any, cancel?: (t: any) => void }} io
 */
export function createCallGeoFade(io) {
  // (The fade-out's end is a timer of the pointer's own scope, never a bare one of the lobule's files, PR-10; tests hand in their own clock.)
  const scope = createScope();
  const schedule = io.schedule || ((fn, ms) => scope.timer(fn, ms)), cancel = io.cancel || ((t) => scope.clear(t));
  const MOVED = io.moved ?? 3;
  const cur = new Array(N).fill(0), held = new Array(N).fill(0);
  const mk = () => ({ g: new Array(N).fill(0), on: false });
  const og = mk();
  let pend = false, timer = null;
  const differs = (a, b) => { for (let i = 0; i < N; i++) if (Math.abs(a[i] - b[i]) > MOVED) return true; return false; };
  const drop = () => { if (timer != null) cancel(timer); timer = null; if (pend) { pend = false; io.setOn(io.pillOn()); } };
  function apply() {
    timer = null;
    if (!pend) return;
    pend = false;
    if (io.pillOn()) { io.write(held); io.setOn(true); }
  }
  return {
    /** The pointer as it stands, before a layout writes it. */
    snap() { io.read(og.g); og.on = io.isOn(); return og; },
    /** After the layout: `still` says the camera is not carrying the pointer (a hand, a camera glide or the dive moves it with the view). */
    settle(was, still) {
      io.read(cur);
      if (!still) { drop(); return; }   // carried by the camera: where the layout put it
      if (pend) {
        if (!differs(cur, was.g)) { drop(); return; }   // moved back while fading out: it fades in again from where it is
        for (let i = 0; i < N; i++) held[i] = cur[i];
        io.write(was.g);   // (the layout wrote the newest place: the old one stays drawn while it fades out)
        return;
      }
      if (!was.on || !io.isOn() || !differs(cur, was.g)) return;
      for (let i = 0; i < N; i++) held[i] = cur[i];
      io.write(was.g); io.setOn(false);
      pend = true; timer = schedule(apply, io.ms);
    },
    get pending() { return pend; },
  };
}
