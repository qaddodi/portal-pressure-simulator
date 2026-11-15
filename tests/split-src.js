// The text of sources that live in several files, for the tests that judge source text. A move out of a big file into a part leaves
// these tests meaningful: they read the family, never one file of it. (The stage's is tests/stage-src.js.)
import { appCssText } from '../scripts/app-css.mjs';

/** The app's stylesheet: styles/app-NN-*.css joined in order (it was one file, styles/app.css, until 15 Nov 2026). */
export const appCss = () => appCssText();
