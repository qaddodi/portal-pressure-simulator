// The modifier key as this device names it (16 Nov 2026, Mac play-test: the Search button said "Ctrl K" on a Mac). Every label that names a shortcut with
// the command key writes it as `Ctrl/⌘` and goes through keyLabel, so a Mac reads ⌘, any other device Ctrl. One test for "is this Apple", used by all of them.
export const isApple = (nav = typeof navigator === 'undefined' ? null : navigator) => {
  if (!nav) return false;
  const p = nav.userAgentData?.platform || nav.platform || '';
  return /^(mac|iphone|ipad|ipod)/i.test(p) || /iP(hone|ad|od)/.test(p);
};
export const modKey = (nav) => (isApple(nav) ? '⌘' : 'Ctrl');
/** A shortcut label for this device: "Ctrl/⌘ K" becomes "⌘ K" on a Mac and "Ctrl K" elsewhere. */
export const keyLabel = (s, nav) => s.replace(/Ctrl\/⌘/g, modKey(nav));
