// The one read of the device's own light or dark (production review PR-19, 4 Nov 2026): `darkMQ` is the page's single MediaQueryList for
// prefers-color-scheme: dark, and isDark() its answer now. (A chosen look or palette is the data-theme / data-palette attribute: currentLook()
// in looks.js reads it, and onTheme() in theme-epoch.js runs every surface's colour work in one frame after either changes.)
// scripts/rules-lint.mjs keeps new code from making its own query for it: import from here.

/** The page's one prefers-color-scheme: dark list (a stand-in where there is no matchMedia, as in a unit test). */
export const darkMQ = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : { matches: false, addEventListener() {}, removeEventListener() {} };
/** Whether the device is in dark mode right now. */
export const isDark = () => darkMQ.matches;
