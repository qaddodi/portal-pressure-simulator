// The one list of device sizes (19 Nov 2026, DBG-5 of the bible review). The gallery page and its device frame, the screenshot tool, the sweeps and card-fit all
// import it, so "ipad" is one screen (landscape, 1180 x 820; the portrait one is "ipad-portrait") in every tool, and a size is added in one place.
// Pure data, no page: node scripts and the browser both load it.
//
//   id       the name used in addresses, flags and reports
//   name     the label with its size, as the gallery's size picker shows it
//   label    the short label (the device frame's buttons)
//   w, h     css px          dpr  the device pixel ratio a picture is shot at (a layout run needs no pixels: the sweeps ignore it)
//   touch    a coarse pointer (touch rules `(pointer: coarse)` apply)       phone  a phone (the frame draws a notch)
//   turn     the same device held the other way (or null)
//   gallery  true when the gallery page, its Sweep and the headless sweeps cover it (a size only some tools want, like the owner's full-screen Mac, is false)

/** @type {readonly { id: string, name: string, label: string, w: number, h: number, dpr: number, touch: boolean, phone: boolean, turn: string | null, gallery: boolean }[]} */
export const DEVICES = Object.freeze([
  { id: 'mac', name: 'Mac 1440×900', label: 'Mac', w: 1440, h: 900, dpr: 1, touch: false, phone: false, turn: null, gallery: true },   // (dpr 1, not the Retina 2: software GL at 2880x1800 draws 2 frames in 3 s; a shot asks for 2 with --dpr)
  { id: 'mac-short', name: 'Mac short 1440×780', label: 'Mac short', w: 1440, h: 780, dpr: 1, touch: false, phone: false, turn: null, gallery: true },
  { id: 'mac-xl', name: 'Mac full screen 1913×1188', label: 'Mac full screen', w: 1913, h: 1188, dpr: 1, touch: false, phone: false, turn: null, gallery: false },   // (the owner's Mac, full screen: 3826 x 2376 at 2x in his screenshots, 13 Nov 2026)
  { id: 'ipad', name: 'iPad landscape 1180×820', label: 'iPad landscape', w: 1180, h: 820, dpr: 1.5, touch: true, phone: false, turn: 'ipad-portrait', gallery: true },
  { id: 'ipad-portrait', name: 'iPad portrait 820×1180', label: 'iPad portrait', w: 820, h: 1180, dpr: 1.5, touch: true, phone: false, turn: 'ipad', gallery: true },
  { id: 'iphone', name: 'iPhone 390×844', label: 'iPhone', w: 390, h: 844, dpr: 3, touch: true, phone: true, turn: 'iphone-landscape', gallery: true },
  { id: 'iphone-landscape', name: 'iPhone sideways 844×390', label: 'iPhone sideways', w: 844, h: 390, dpr: 3, touch: true, phone: true, turn: 'iphone', gallery: true },
]);

/** The device of an id, or undefined. */
export const deviceOf = (id) => DEVICES.find((d) => d.id === id);
/** The devices the gallery page, the Sweep and the headless sweeps cover. */
export const GALLERY_DEVICES = Object.freeze(DEVICES.filter((d) => d.gallery));
/** The browser-context options of a device (Playwright's shape): { viewport, deviceScaleFactor, isMobile?, hasTouch? }. `dpr` overrides the pixel ratio. */
export const contextOptions = (id, dpr) => {
  const d = deviceOf(id); if (!d) throw new Error(`unknown device "${id}" (${DEVICES.map((x) => x.id).join(', ')})`);
  return { viewport: { width: d.w, height: d.h }, deviceScaleFactor: dpr || d.dpr, ...(d.touch ? { isMobile: true, hasTouch: true } : {}) };
};
