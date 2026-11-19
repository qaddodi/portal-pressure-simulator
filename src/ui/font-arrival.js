// A web font that arrives after a surface was fitted changes its text's width and height, and none of the observers that refit
// a surface (a ResizeObserver on its box, a changed size or word) hear it when the box itself is held (a phone's capped card, a
// tile). One listener, one counter, one way for every fit that measures text:
//
//   fontGen()                 a number that changes each time a face finishes loading: put it in a fit's signature, so a fit
//                             made before the face arrived is never taken for current.
//   onFontsLoaded(fn)         fn runs when a face finishes loading (not on the faces already there at the time it is asked);
//                             the return is the call that stops it.
//
// `document.fonts.ready` is not this: it is one promise that has usually resolved before a surface is built, so a fit that waits
// on it hears the first batch of faces and never a later one (review 15 Nov 2026, PC-1: the card fit, tiles, table heads,
// equations, the fluid instrument's labels). `loadingdone` fires at the end of every batch.

let gen = 0;
const subs = new Set();

const fire = () => {
  gen++;
  for (const fn of [...subs]) { try { fn(); } catch (e) { setTimeout(() => { throw e; }); } }   // (one that throws never stops the rest)
};

globalThis.document?.fonts?.addEventListener?.('loadingdone', fire);

export const fontGen = () => gen;

export function onFontsLoaded(fn) {
  subs.add(fn);
  return () => { subs.delete(fn); };
}
