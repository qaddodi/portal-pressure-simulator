// A jump's day count is handed to the picture as outlines (svg-gl setPolys), not written as a path string each time the number changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const tl = read('timeline.js'), gl = read('svg-gl.js');

test('the jump count sets outlines on its piece; the picture draws them in place of a d', () => {
  assert.match(gl, /export function setPolys\(el, polys\) \{ el\._polys = polys; \}/);
  assert.match(gl, /const cm = el\._cmds, d = cm \? null : el\.getAttribute\('d'\), kept = el\._polys;\n\s+if \(!d && !kept && !cm\) return false;/);
  assert.match(gl, /of cm \? flattenCmdsInto\(cm, [^\n]*\) : kept \|\| flatOf\(d,/);
  assert.match(tl, /setPolys\(dayPath, dayPolys\(t\)\); dayGL\.paint\(\);/);
  assert.doesNotMatch(tl.slice(tl.indexOf('const tick = (now) =>'), tl.indexOf('nextFrame(tick);')), /setAttribute\('d'/);
});
