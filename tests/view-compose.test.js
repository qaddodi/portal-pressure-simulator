// The lobule's pan and dive are two records composed into the one view the GPU draws names and leaders with (R08, label-captions.js composeView):
// p → k (p + d) + (e, f). Each owner clears only its own record; a pan ending never erases the dive, and bakeFollow does nothing without a pan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
for (const k of ['Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle']) globalThis[k] ??= dom.window[k];
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);
const { composeView } = await import('../src/ui/label-captions.js');

const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const at = (v, x, y) => [v[0] * x + v[1], v[0] * y + v[2]];

test('composeView: identity, pan alone, dive alone, and both in a defined order', () => {
  assert.deepEqual(composeView(0, 0, 1, 0, 0), [1, 0, 0]);
  assert.deepEqual(composeView(5, -3, 1, 0, 0), [1, 5, -3]);
  assert.deepEqual(composeView(0, 0, 0.5, 10, 20), [0.5, 10, 20]);
  const v = composeView(8, 4, 0.5, 10, 20);
  assert.deepEqual(at(v, 100, 100), [0.5 * 108 + 10, 0.5 * 104 + 20], 'the pan first, then the dive carries the panned layer');
});

// (The records as lobule-zoom.js keeps them, run on the extracted source: ending a pan with a dive on leaves the dive.)
test('unpan removes only the pan; bakeFollow without a pan leaves the dive in place', () => {
  const seen = [];
  const grab = (name) => { const i = lz.indexOf(name); assert.ok(i >= 0, name); return lz.slice(i, lz.indexOf('\n', i)); };
  const src = `${grab('  let panOn = false, panDX = 0')}\n${grab('  const VIEW = [1, 0, 0]')}
    function applyView() { composeView(panOn ? panDX : 0, panOn ? panDY : 0, diveK, diveE, diveF, VIEW); seen.push(VIEW.slice()); }
    ${grab('  const unpan = ')}\n${grab('  const setDive = ')}
    return { setDive, unpan, pan(dx, dy) { panDX = dx; panDY = dy; panOn = true; applyView(); }, get panOn() { return panOn; } };`;
  const R = new Function('composeView', 'seen', src)(composeView, seen);
  R.setDive(0.5, 10, 20);
  R.pan(8, 4);
  R.unpan();
  assert.equal(R.panOn, false);
  assert.deepEqual(seen.at(-1), [0.5, 10, 20], 'the dive survives the end of a pan');
  seen.length = 0;
  R.unpan();
  assert.equal(seen.length, 0, 'with no pan, unpan changes nothing');
  assert.match(lz, /function bakeFollow\(\) \{[\s\S]*?if \(!panOn\) return false;[\s\S]*?unpan\(\);/, 'bakeFollow checks it owns a pan before touching the view');
});
