// The esbuild warnings that fail the build, in one module so a test can run them without running the build.
// - import-is-undefined: an import esbuild can only make `undefined` minifies to `(void 0)(...)` and the page dies at boot.
// - css-syntax-error: esbuild drops a rule it cannot parse and only warns, so the rule never applies and the build passes. styles/app-11-deck-visuals.css
//   carried a stray ')' in the forced-colors rule of the selected instrument tab for days (R05, external production review, 15 Nov 2026).
export const FATAL_WARNINGS = Object.freeze(['import-is-undefined', 'css-syntax-error']);
export const fatalWarnings = (warnings) => (warnings ?? []).filter((w) => FATAL_WARNINGS.includes(w.id));
export const refusal = (bad) => 'Build refused:\n' + bad.map((w) => `  ${w.id} ${w.location?.file}:${w.location?.line} ${w.text}`).join('\n');
