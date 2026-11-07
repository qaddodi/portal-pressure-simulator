// The GPU drawer of a chart (svg-gl.js) reads each piece's look from the page's computed style once, as a drawing is placed, and the
// pieces are a hidden model on which the browser runs no CSS animation. A keyframe animation on a model's class (the plane's points had
// `animation: fade-rise ... both`) is therefore read at its first frame, opacity 0, and drawn that way for good: no point, no name (found
// 2 Nov 2026 on Sites slide 11). A model's pieces fade or move in the picture instead (gl.fadeEl, noteFade, noteLoop, an opacity transition);
// a CSS `transition` of opacity is fine, svg-gl follows it. This reads every model class the chart builders write (sv('tag', { class })) and
// fails on any stylesheet rule that gives one an animation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const css = readFileSync(new URL('styles/app.css', root), 'utf8');
const BUILDERS = readdirSync(new URL('src/ui/', root)).filter((f) => /^(tool-.*|flow-time|talk-trace|visual-plane)\.js$/.test(f));

/** The classes a chart builder gives its model pieces: sv('tag', { ..., class: '...' }) (a `${...}` part of a template is dropped). */
export function modelClasses(src) {
  const out = new Set();
  for (const m of src.matchAll(/\bsv\(\s*'\w+'\s*,\s*\{[^{}]*?class:\s*(?:'([^']*)'|`([^`]*)`)/g)) {
    for (const c of (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, ' ').match(/[A-Za-z][\w-]*/g) || []) out.add(c);
  }
  return out;
}
/** The stylesheet's rules whose declarations start a keyframe animation (not `none`): [{ sel, anim }]. */
export function animatedRules(sheet) {
  const out = [];
  for (const m of sheet.matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)) {
    const a = /(?<![\w-])animation(?:-name)?\s*:\s*([^;]*)/.exec(m[2]);
    if (a && a[1].trim().split(/\s+/)[0] !== 'none') out.push({ sel: m[1], anim: a[1].trim() });
  }
  return out;
}

test('the model builders write plenty of classes, and the scan reads them', () => {
  const all = new Set(BUILDERS.flatMap((f) => [...modelClasses(readFileSync(new URL(`src/ui/${f}`, root), 'utf8'))]));
  assert.ok(BUILDERS.length >= 10 && all.size > 100, `read ${all.size} classes from ${BUILDERS.length} builders`);
  assert.ok(all.has('pze-pt') && all.has('pze-zone'), 'the plane\'s classes are among them');
  assert.ok(animatedRules(css).length > 20, 'and the stylesheet\'s animated rules');
});

test('no CSS keyframe animation runs on a class a chart model draws', () => {
  const classes = new Set(BUILDERS.flatMap((f) => [...modelClasses(readFileSync(new URL(`src/ui/${f}`, root), 'utf8'))]));
  // (A class under :not() is one the rule leaves out; the page's own canvas, which a rule may fade, is no model.)
  const bad = animatedRules(css).filter((r) => (r.sel.replace(/:not\([^)]*\)/g, '').match(/\.([A-Za-z][\w-]*)/g) || []).some((c) => classes.has(c.slice(1))));
  assert.deepEqual(bad.map((r) => `${r.sel.trim().slice(-80)} { animation: ${r.anim} }`), [], 'a model piece fades or moves in the picture (gl.fadeEl), never by a CSS animation the drawer reads once');
});
