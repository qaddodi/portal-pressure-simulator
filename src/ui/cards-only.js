// The cards-only check (19 Nov 2026, Mohammad: "every slide of every deck at every size in about a minute"): a layout sweep that sets
// window.ppsCardsOnly before the page loads gets the app with no figure at all. Nothing of the anatomy is built, updated or drawn; the
// presenter, its cards, the dock, the model and the words run as ever. A slide step then costs the cards' own work (about 0.1 to 1.3 s on
// software GL, where the figure made it 1.2 to 8 s), which is what lets scripts/deck-sweep.mjs --cards-only walk all 42 decks at six sizes
// in minutes. Never set by the app itself: a person always gets the figure.
//
// The stand-in for the stage answers every name with itself and every call with undefined: `stage.glass.add(x)`, `stage.camera?.()` and
// `await stage.dive()` all run and do nothing. It is never thenable (an await of it does not hang). What it cannot stand in for: anything
// the cards take from the figure (a call-out anchored to a vessel, labels, the camera's framing around the cards), which this mode does
// not check; deck-sweep.mjs --verify compares it with the full app on a sample so the shortcut is never trusted on its own word.

/** True on a page opened by a cards-only sweep (window.ppsCardsOnly set by its init script). */
export const cardsOnly = (g = globalThis) => !!g?.ppsCardsOnly;

/** The stage stand-in: every property is itself, every call returns undefined, never a promise. */
export function voidStage() {
  const self = new Proxy(function voidStageFn() {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? undefined : self),
    apply: () => undefined,
    construct: () => ({}),
    set: () => true,
  });
  return self;
}
